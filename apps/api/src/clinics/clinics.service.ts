import { ConflictException, Injectable } from '@nestjs/common';
import { recordAudit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateClinicInput } from './clinics.schemas.js';

const CLINIC_FIELDS = {
  name: true,
  address: true,
  phone: true,
  email: true,
  opensAt: true,
  closesAt: true,
  defaultVisitMinutes: true,
  onlineBookingEnabled: true,
  updatedAt: true,
} satisfies Prisma.ClinicSettingsSelect;

type Editable = Exclude<keyof typeof CLINIC_FIELDS, 'updatedAt'>;

// The clinic's details and settings: the single row of clinic_settings (id is always 1).
@Injectable()
export class ClinicsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.clinicSettings.findUniqueOrThrow({ where: { id: 1 }, select: CLINIC_FIELDS });
  }

  update(user: AuthenticatedUser, input: UpdateClinicInput) {
    return this.prisma.$transaction(async (tx) => {
      // FOR UPDATE: a second save at the same moment waits here, then sees this one's result.
      await tx.$queryRaw`SELECT id FROM clinic_settings WHERE id = 1 FOR UPDATE`;
      const current = await tx.clinicSettings.findUniqueOrThrow({ where: { id: 1 }, select: CLINIC_FIELDS });

      // Only fields whose value really changes are saved and logged.
      const data: Record<string, string | number | boolean | null> = {};
      const changes: Record<string, { from: string | null; to: string | null }> = {};
      for (const [field, value] of Object.entries(input) as [Editable, string | number | boolean | null][]) {
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

      const clinic = await tx.clinicSettings.update({ where: { id: 1 }, data, select: CLINIC_FIELDS });
      await recordAudit(tx, user, 'CLINIC_UPDATED', { metadata: { changes } });
      return clinic;
    });
  }

  /** What the public pages (landing, sign-in) show: only what the clinic's website shows anyway. */
  async site() {
    const clinic = await this.prisma.clinicSettings.findUniqueOrThrow({
      where: { id: 1 },
      select: {
        name: true,
        address: true,
        phone: true,
        email: true,
        opensAt: true,
        closesAt: true,
        onlineBookingEnabled: true,
      },
    });
    return clinic;
  }
}
