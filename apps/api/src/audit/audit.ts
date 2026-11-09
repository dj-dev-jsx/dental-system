import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { AuditAction, Prisma } from '../generated/prisma/client.js';

type Details = { entityId?: string; metadata?: Prisma.InputJsonValue };

/**
 * Adds a line to the audit log, done by a staff member.
 *
 * It takes the transaction doing the work on purpose: the action and its log line succeed
 * or fail together, so nothing can happen to a patient record without leaving a trace.
 */
export function recordAudit(
  tx: Prisma.TransactionClient,
  actor: Pick<AuthenticatedUser, 'id'>,
  action: AuditAction,
  details: Details = {},
) {
  return tx.auditLog.create({
    data: {
      actorUserId: actor.id,
      action,
      ...details,
    },
  });
}

/**
 * The same, for something a patient did through online booking. The line names their online
 * account as the actor instead of a staff member (the database insists on exactly one).
 */
export function recordPatientAudit(
  tx: Prisma.TransactionClient,
  account: { id: string },
  action: AuditAction,
  details: Details = {},
) {
  return tx.auditLog.create({
    data: {
      actorPatientAccountId: account.id,
      action,
      ...details,
    },
  });
}
