import { randomInt } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { recordAudit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { hashPassword } from '../auth/password.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStaffInput, ListStaffQuery, UpdateStaffInput } from './staff.schemas.js';

// passwordHash is deliberately not in this list, so it can never leak into a response.
const STAFF_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  lockedUntil: true,
  mustChangePassword: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof STAFF_FIELDS }> & {
  lastSignInAt: Date | null;
};

const EMAIL_TAKEN = 'That email is already used by another account.';

// No 0/O/1/l/I, which are easy to mix up when read aloud or copied by hand.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// 16 random characters in 4 groups, like abcd-EFGH-jkmn-pqrs. randomInt is cryptographically secure.
function generateTemporaryPassword() {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) group += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(group);
  }
  return groups.join('-');
}

// P2002 is Prisma's code for a failed unique constraint (MySQL error 1062).
function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
  );
}

// The users table has NO row-level security, so the clinicId in every where below is the
// only thing stopping an admin from touching another clinic's staff.
@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser, query: ListStaffQuery) {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      clinicId: user.clinicId,
      ...(query.status !== 'all' && { isActive: query.status === 'active' }),
      ...(query.role && { role: query.role }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const { rows, lastByUser } = await this.prisma.forClinic(user.clinicId, async (tx) => {
      const found = await tx.user.findMany({ where, select: STAFF_FIELDS });
      // One grouped query for everyone's latest sign-in, not one query per person.
      const latest = await tx.auditLog.groupBy({
        by: ['actorUserId'],
        where: {
          clinicId: user.clinicId,
          action: 'LOGIN_SUCCEEDED',
          actorUserId: { in: found.map((row) => row.id) },
        },
        _max: { createdAt: true },
      });
      return {
        rows: found,
        lastByUser: new Map(latest.map((l) => [l.actorUserId, l._max.createdAt])),
      };
    });
    const withSignIn: StaffRow[] = rows.map((row) => ({
      ...row,
      lastSignInAt: lastByUser.get(row.id) ?? null,
    }));

    const dir = query.dir === 'desc' ? -1 : 1;
    const text = (x: string, y: string) => x.localeCompare(y, 'en', { sensitivity: 'base' });
    const byName = (x: StaffRow, y: StaffRow) =>
      text(x.lastName, y.lastName) || text(x.firstName, y.firstName);
    const items = withSignIn.sort((x, y) => {
      let result = 0;
      if (!query.sort) {
        // Default: active first, then by name.
        result = Number(y.isActive) - Number(x.isActive) || byName(x, y);
      } else if (query.sort === 'name') {
        result = byName(x, y) * dir;
      } else if (query.sort === 'role') {
        result = (text(x.role, y.role) || byName(x, y)) * dir;
      } else if (!x.lastSignInAt || !y.lastSignInAt) {
        // Nobody who never signed in comes first, in either direction.
        result = Number(!x.lastSignInAt) - Number(!y.lastSignInAt);
      } else {
        result = (x.lastSignInAt.getTime() - y.lastSignInAt.getTime()) * dir;
      }
      return result || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
    });
    return { items };
  }

  async create(user: AuthenticatedUser, input: CreateStaffInput) {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    try {
      const created = await this.prisma.forClinic(user.clinicId, async (tx) => {
        // Friendly check first; the unique index still catches two simultaneous requests.
        if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
          throw new ConflictException(EMAIL_TAKEN);
        }
        const row = await tx.user.create({
          data: { ...input, clinicId: user.clinicId, passwordHash, mustChangePassword: true },
          select: STAFF_FIELDS,
        });
        // Never put the password in the log, only which role they got.
        await recordAudit(tx, user, 'STAFF_CREATED', {
          entityId: row.id,
          metadata: { role: row.role },
        });
        return row;
      });
      // Shown once to the admin, never stored in plain text.
      return { user: created, temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(EMAIL_TAKEN);
      throw error;
    }
  }

  update(user: AuthenticatedUser, id: string, input: UpdateStaffInput) {
    const touchesAccess = input.role !== undefined || input.isActive !== undefined;
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      if (touchesAccess) {
        // Locks this clinic's active admin rows until the transaction ends (like MySQL's
        // SELECT ... FOR UPDATE). A second admin change waits here, then counts the
        // admins again including the first one's result, so two demotions can't both pass.
        await tx.$queryRaw`
          SELECT id FROM users
          WHERE clinic_id = ${user.clinicId}::uuid AND role = 'ADMIN' AND is_active
          FOR UPDATE`;
      }

      const current = await tx.user.findFirst({
        where: { id, clinicId: user.clinicId },
        select: STAFF_FIELDS,
      });
      if (!current) throw new NotFoundException('Staff member not found');

      const newRole = input.role ?? current.role;
      const newActive = input.isActive ?? current.isActive;
      const roleChanges = newRole !== current.role;
      const deactivates = current.isActive && !newActive;

      if (id === user.id && (roleChanges || deactivates)) {
        throw new ConflictException('You cannot change your own role or deactivate yourself.');
      }
      if (current.role === 'ADMIN' && current.isActive && (newRole !== 'ADMIN' || !newActive)) {
        const admins = await tx.user.count({
          where: { clinicId: user.clinicId, role: 'ADMIN', isActive: true },
        });
        if (admins <= 1) {
          throw new ConflictException('The clinic must keep at least one active admin.');
        }
      }

      const changes: Record<string, { from: string; to: string }> = {};
      for (const field of ['firstName', 'lastName', 'role', 'isActive'] as const) {
        const to = input[field];
        if (to !== undefined && to !== current[field]) {
          changes[field] = { from: String(current[field]), to: String(to) };
        }
      }
      if (Object.keys(changes).length === 0) return current; // nothing to save or log

      const updated = await tx.user.update({
        where: { id },
        data: { ...input },
        select: STAFF_FIELDS,
      });
      // Deactivated or given a new role: they must sign in again.
      if (roleChanges || deactivates) {
        await tx.session.deleteMany({ where: { userId: id } });
      }
      await recordAudit(tx, user, 'STAFF_UPDATED', { entityId: id, metadata: { changes } });
      return updated;
    });
  }

  async resetPassword(user: AuthenticatedUser, id: string) {
    if (id === user.id) {
      throw new ConflictException('Use "change password" to change your own password.');
    }
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await this.prisma.forClinic(user.clinicId, async (tx) => {
      // updateMany with the clinic filter: 0 rows means not found (or another clinic's).
      const { count } = await tx.user.updateMany({
        where: { id, clinicId: user.clinicId },
        data: { passwordHash, mustChangePassword: true, failedLogins: 0, lockedUntil: null },
      });
      if (count === 0) throw new NotFoundException('Staff member not found');
      await tx.session.deleteMany({ where: { userId: id } });
      await recordAudit(tx, user, 'STAFF_PASSWORD_RESET', { entityId: id });
    });
    return { temporaryPassword };
  }

  unlock(user: AuthenticatedUser, id: string) {
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      const { count } = await tx.user.updateMany({
        where: { id, clinicId: user.clinicId },
        data: { failedLogins: 0, lockedUntil: null },
      });
      if (count === 0) throw new NotFoundException('Staff member not found');
      await recordAudit(tx, user, 'STAFF_UNLOCKED', { entityId: id });
      return tx.user.findFirstOrThrow({
        where: { id, clinicId: user.clinicId },
        select: STAFF_FIELDS,
      });
    });
  }
}
