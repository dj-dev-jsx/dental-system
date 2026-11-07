import { createHash, randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { recordAudit } from '../audit/audit.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { verifyPassword } from './password.js';

export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000; // a working day, then log in again
export const FAILED_LOGIN_MIN_MS = 400; // longer than a real password check takes
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

const USER_FIELDS = {
  id: true,
  clinicId: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
} as const;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns a new session token, or null if the login failed for any reason. */
  async login(email: string, password: string): Promise<string | null> {
    const startedAt = Date.now();
    const token = await this.attemptLogin(email, password);
    // Every failure takes the same time, whatever the reason. Otherwise an attacker
    // could tell which emails are real by timing the response.
    if (!token) {
      await sleep(Math.max(0, FAILED_LOGIN_MIN_MS - (Date.now() - startedAt)));
    }
    return token;
  }

  private async attemptLogin(email: string, password: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // An unknown email isn't logged: it belongs to no clinic, so there's no log to put it in.
    if (!user) return null;
    if (!user.isActive) {
      await this.recordFailure(user, { reason: 'ACCOUNT_DEACTIVATED' });
      return null;
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      await this.recordFailure(user, { reason: 'ACCOUNT_LOCKED' });
      return null;
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      const failedLogins = user.failedLogins + 1;
      const locked = failedLogins >= MAX_FAILED_LOGINS;
      await this.prisma.forClinic(user.clinicId, async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLogins: locked ? 0 : failedLogins,
            lockedUntil: locked ? new Date(now.getTime() + LOCK_MS) : null,
          },
        });
        await recordAudit(tx, user, 'LOGIN_FAILED', {
          metadata: { reason: 'WRONG_PASSWORD', accountLocked: locked },
        });
      });
      return null;
    }

    const token = randomBytes(32).toString('base64url');
    await this.prisma.forClinic(user.clinicId, async (tx) => {
      // A good moment to clear this user's old sessions, since no background job does it.
      await tx.session.deleteMany({ where: { userId: user.id, expiresAt: { lte: now } } });
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
        },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null },
      });
      await recordAudit(tx, user, 'LOGIN_SUCCEEDED');
    });
    return token;
  }

  private recordFailure(user: User, metadata: { reason: string }) {
    return this.prisma.forClinic(user.clinicId, (tx) =>
      recordAudit(tx, user, 'LOGIN_FAILED', { metadata }),
    );
  }

  async logout(user: AuthenticatedUser, token: string): Promise<void> {
    await this.prisma.forClinic(user.clinicId, async (tx) => {
      await tx.session.deleteMany({ where: { tokenHash: hashToken(token) } });
      await recordAudit(tx, user, 'LOGOUT');
    });
  }

  /** Checked on every request, so deactivating a user takes effect immediately. */
  async findSessionUser(token: string): Promise<AuthenticatedUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        expiresAt: true,
        user: {
          select: { ...USER_FIELDS, isActive: true, clinic: { select: { name: true } } },
        },
      },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
      return null;
    }
    const { isActive: _isActive, clinic, ...user } = session.user;
    return { ...user, clinicName: clinic.name };
  }
}
