import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { addDays, startOfManilaDay } from '../common/manila.js';
import { AuditAction } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const date = z.iso.date();

export const listAuditLogsSchema = z
  .strictObject({
    // A patient's id here gives that patient's full history.
    entityId: z.uuid().optional(),
    actorUserId: z.uuid().optional(),
    action: z.enum(AuditAction).optional(),
    // ?actions=LOGIN_FAILED,PATIENT_ARCHIVED: several kinds at once.
    actions: z
      .string()
      .transform((text) => text.split(','))
      .pipe(z.array(z.enum(AuditAction)).min(1).max(40))
      .optional(),
    // Philippine dates, both included.
    from: date.optional(),
    to: date.optional(),
    // Leaves out routine lookups: lists, appointment views, and a record opened again within a minute.
    excludeRoutine: z
      .enum(['true', 'false'])
      .transform((text) => text === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine(({ from, to }) => !from || !to || to >= from, { message: 'to is before from', path: ['to'] });

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsSchema>;

/** Lines that only say someone looked at a list or a page: kept in the data, hidden on request. */
const ROUTINE: AuditAction[] = ['PATIENT_LISTED', 'APPOINTMENT_LISTED', 'APPOINTMENT_VIEWED'];
/** Opening the same record again within this long by the same person is one lookup. */
const REPEATABLE: AuditAction[] = ['PATIENT_VIEWED', 'CHART_VIEWED'];
const REPEAT_WINDOW_MS = 60_000;

const PATIENT_ACTIONS = new Set<AuditAction>([
  'PATIENT_CREATED',
  'PATIENT_LISTED',
  'PATIENT_VIEWED',
  'PATIENT_UPDATED',
  'PATIENT_ARCHIVED',
  'PATIENT_RESTORED',
  'APPOINTMENT_LISTED',
  'CHART_VIEWED',
  'TOOTH_RECORDED',
  'TOOTH_CORRECTED',
]);
const APPOINTMENT_ACTIONS = new Set<AuditAction>([
  'APPOINTMENT_CREATED',
  'APPOINTMENT_VIEWED',
  'APPOINTMENT_UPDATED',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_DECLINED',
  'APPOINTMENT_CANCELLED',
]);
const STAFF_ACTIONS = new Set<AuditAction>([
  'STAFF_CREATED',
  'STAFF_UPDATED',
  'STAFF_PASSWORD_RESET',
  'STAFF_UNLOCKED',
  'PASSWORD_CHANGED',
]);

export type AuditSubject =
  | { kind: 'patient'; id: string; name: string }
  | { kind: 'staff'; id: string; name: string }
  | { kind: 'appointment'; id: string; name: string; startsAt: Date };

type Named = { firstName: string; middleName: string | null; lastName: string; suffix: string | null };
const fullName = (p: Named) => [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(' ');

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser, query: ListAuditLogsQuery) {
    const { page, limit, actions, from, to, excludeRoutine, action, ...filters } = query;
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      // Prisma ignores filters left undefined, so each one only applies when it was sent.
      let allowed: AuditAction[] | undefined = actions;
      if (action) allowed = allowed ? allowed.filter((a) => a === action) : [action];
      if (excludeRoutine) {
        allowed = (allowed ?? Object.values(AuditAction)).filter((a) => !ROUTINE.includes(a));
      }
      const where = {
        clinicId: user.clinicId,
        ...filters,
        action: allowed ? { in: allowed } : undefined,
        createdAt:
          from || to
            ? {
                gte: from ? startOfManilaDay(from) : undefined,
                lt: to ? startOfManilaDay(addDays(to, 1)) : undefined,
              }
            : undefined,
      };
      const rows = await tx.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityId: true,
          actorUserId: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // newest first
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await tx.auditLog.count({ where });

      // One query per kind of record, for the whole page.
      const idsFor = (set: Set<AuditAction>) => [
        ...new Set(rows.filter((r) => r.entityId && set.has(r.action)).map((r) => r.entityId as string)),
      ];
      const patientIds = idsFor(PATIENT_ACTIONS);
      const appointmentIds = idsFor(APPOINTMENT_ACTIONS);
      const staffIds = idsFor(STAFF_ACTIONS);

      const patients = new Map<string, string>();
      const appointments = new Map<string, { name: string; startsAt: Date }>();
      const staff = new Map<string, string>();
      if (patientIds.length > 0) {
        const found = await tx.patient.findMany({
          where: { clinicId: user.clinicId, id: { in: patientIds } },
          select: { id: true, firstName: true, middleName: true, lastName: true, suffix: true },
        });
        for (const p of found) patients.set(p.id, fullName(p));
      }
      if (appointmentIds.length > 0) {
        const found = await tx.appointment.findMany({
          where: { clinicId: user.clinicId, id: { in: appointmentIds } },
          select: {
            id: true,
            startsAt: true,
            patient: { select: { firstName: true, middleName: true, lastName: true, suffix: true } },
          },
        });
        for (const a of found) appointments.set(a.id, { name: fullName(a.patient), startsAt: a.startsAt });
      }
      if (staffIds.length > 0) {
        // Users have no row-level security, so the clinic filter here is the only lock.
        const found = await tx.user.findMany({
          where: { clinicId: user.clinicId, id: { in: staffIds } },
          select: { id: true, firstName: true, lastName: true },
        });
        for (const s of found) staff.set(s.id, `${s.firstName} ${s.lastName}`);
      }

      const subjectOf = (row: Pick<(typeof rows)[number], 'action' | 'entityId'>): AuditSubject | null => {
        const id = row.entityId;
        if (!id) return null;
        if (PATIENT_ACTIONS.has(row.action)) {
          const name = patients.get(id);
          return name ? { kind: 'patient', id, name } : null;
        }
        if (APPOINTMENT_ACTIONS.has(row.action)) {
          const found = appointments.get(id);
          return found ? { kind: 'appointment', id, ...found } : null;
        }
        const name = staff.get(id);
        return name ? { kind: 'staff', id, name } : null;
      };

      // A record opened again within a minute by the same person counts once: the first one.
      let drop = new Set<string>();
      if (excludeRoutine) {
        const views = rows.filter((r) => r.entityId && REPEATABLE.includes(r.action));
        if (views.length > 0) {
          const oldest = Math.min(...views.map((r) => r.createdAt.getTime())) - REPEAT_WINDOW_MS;
          const earlier = await tx.auditLog.findMany({
            where: {
              clinicId: user.clinicId,
              action: { in: REPEATABLE },
              entityId: { in: [...new Set(views.map((r) => r.entityId as string))] },
              createdAt: { gte: new Date(oldest) },
            },
            select: { id: true, action: true, entityId: true, actorUserId: true, createdAt: true },
          });
          drop = new Set(
            views
              .filter((r) =>
                earlier.some(
                  (e) =>
                    e.id !== r.id &&
                    e.action === r.action &&
                    e.entityId === r.entityId &&
                    e.actorUserId === r.actorUserId &&
                    (e.createdAt < r.createdAt || (e.createdAt.getTime() === r.createdAt.getTime() && e.id < r.id)) &&
                    r.createdAt.getTime() - e.createdAt.getTime() <= REPEAT_WINDOW_MS,
                ),
              )
              .map((r) => r.id),
          );
        }
      }

      const items = rows
        .filter((r) => !drop.has(r.id))
        .map(({ actorUserId: _actor, ...row }) => ({ ...row, subject: subjectOf(row) }));
      // total counts every line that matches, including repeats hidden from this page.
      return { items, total, page, limit };
    });
  }
}
