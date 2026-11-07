import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { AuditAction, Prisma } from '../generated/prisma/client.js';

/**
 * Adds a line to the clinic's audit log.
 *
 * It takes the transaction doing the work on purpose: the action and its log line succeed
 * or fail together, so nothing can happen to a patient record without leaving a trace.
 */
export function recordAudit(
  tx: Prisma.TransactionClient,
  actor: Pick<AuthenticatedUser, 'id' | 'clinicId'>,
  action: AuditAction,
  details: { entityId?: string; metadata?: Prisma.InputJsonValue } = {},
) {
  return tx.auditLog.create({
    data: {
      clinicId: actor.clinicId,
      actorUserId: actor.id,
      action,
      ...details,
    },
  });
}
