import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuditAction } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const listAuditLogsSchema = z.strictObject({
  // A patient's id here gives that patient's full history.
  entityId: z.uuid().optional(),
  actorUserId: z.uuid().optional(),
  action: z.enum(AuditAction).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsSchema>;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser, { page, limit, ...filters }: ListAuditLogsQuery) {
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      // Prisma ignores filters left undefined, so each one only applies when it was sent.
      const where = { clinicId: user.clinicId, ...filters };
      const items = await tx.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // newest first
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await tx.auditLog.count({ where });
      return { items, total, page, limit };
    });
  }
}
