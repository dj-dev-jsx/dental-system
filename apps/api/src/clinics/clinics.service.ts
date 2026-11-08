import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { recordAudit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateClinicInput } from './clinics.schemas.js';

const CLINIC_FIELDS = {
  id: true,
  name: true,
  address: true,
  phone: true,
  email: true,
  opensAt: true,
  closesAt: true,
  defaultVisitMinutes: true,
  updatedAt: true,
} satisfies Prisma.ClinicSelect;

// The clinics table has no row-level security, so the id filter below is the only lock.
// The id always comes from the logged-in user, never from the request.
@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthenticatedUser) {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: CLINIC_FIELDS,
    });
    if (!clinic) throw new NotFoundException('Clinic not found');
    return clinic;
  }

  // The audit log has row-level security, so the work runs inside forClinic.
  update(user: AuthenticatedUser, input: UpdateClinicInput) {
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      const current = await tx.clinic.findUnique({
        where: { id: user.clinicId },
        select: CLINIC_FIELDS,
      });
      if (!current) throw new NotFoundException('Clinic not found');

      // Only fields whose value really changes are saved and logged.
      const data: Record<string, string | number | null> = {};
      const changes: Record<string, { from: string | null; to: string | null }> = {};
      for (const [field, value] of Object.entries(input) as [
        keyof typeof CLINIC_FIELDS,
        string | number | null,
      ][]) {
        const old = current[field];
        if (old === value) continue;
        data[field] = value;
        changes[field] = {
          from: old === null ? null : String(old),
          to: value === null ? null : String(value),
        };
      }
      if (Object.keys(data).length === 0) return current;

      // When only one of the two times is sent, check it against the stored other one.
      const opensAt = (data['opensAt'] as number | undefined) ?? current.opensAt;
      const closesAt = (data['closesAt'] as number | undefined) ?? current.closesAt;
      if (opensAt >= closesAt) {
        throw new ConflictException('Opening time must be before closing time');
      }

      const clinic = await tx.clinic.update({
        where: { id: user.clinicId },
        data,
        select: CLINIC_FIELDS,
      });
      await recordAudit(tx, user, 'CLINIC_UPDATED', {
        entityId: user.clinicId,
        metadata: { changes },
      });
      return clinic;
    });
  }
}
