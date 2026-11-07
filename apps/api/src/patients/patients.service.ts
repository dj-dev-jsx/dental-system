import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { recordAudit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreatePatientInput,
  ListPatientsQuery,
  UpdatePatientInput,
} from './patients.schemas.js';

// Every query below also filters by clinicId, even though row-level security already does.
// These are two separate locks: a mistake in one is still caught by the other.

// A list shows only what's needed to pick the right patient. The address, email and
// emergency contact are only sent when someone opens a record, which is logged by patient.
const LIST_FIELDS = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  suffix: true,
  birthDate: true,
  sex: true,
  phone: true,
} satisfies Prisma.PatientSelect;

// PostgreSQL returns a date as midnight UTC. Sending 'YYYY-MM-DD' stops the browser from
// shifting it to the day before or after based on its time zone.
function withDateOnly<T extends { birthDate: Date }>(patient: T) {
  return { ...patient, birthDate: patient.birthDate.toISOString().slice(0, 10) };
}

// How a value is written in the audit log: as text, so old and new can be compared and
// dates read the same way they do in the API.
function auditValue(field: string, value: unknown): string | null {
  if (value instanceof Date) {
    return field === 'birthDate' ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  return (value as string | null | undefined) ?? null;
}

// "dela cruz maria" finds Maria Dela Cruz: each word must match somewhere, in any order.
function searchFilter(search = ''): Prisma.PatientWhereInput[] {
  return search
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      // % and _ are wildcards in LIKE. Escaped, so typing them searches for the character.
      const contains = word.replace(/[\\%_]/g, '\\$&');
      const match = { contains, mode: 'insensitive' as const };
      return {
        OR: [
          { firstName: match },
          { middleName: match },
          { lastName: match },
          { phone: match },
        ],
      };
    });
}

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: AuthenticatedUser, input: CreatePatientInput) {
    const { privacyConsent, birthDate, ...fields } = input;
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      const patient = await tx.patient.create({
        data: {
          ...fields,
          clinicId: user.clinicId,
          birthDate: new Date(birthDate),
          privacyConsentAt: privacyConsent ? new Date() : null,
        },
      });
      await recordAudit(tx, user, 'PATIENT_CREATED', { entityId: patient.id });
      return withDateOnly(patient);
    });
  }

  list(user: AuthenticatedUser, { search, archived = false, page, limit }: ListPatientsQuery) {
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      const where: Prisma.PatientWhereInput = {
        clinicId: user.clinicId,
        archivedAt: archived ? { not: null } : null,
        AND: searchFilter(search),
      };
      const patients = await tx.patient.findMany({
        where,
        select: LIST_FIELDS,
        // id comes last so patients with the same name always stay in the same order.
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await tx.patient.count({ where });
      await recordAudit(tx, user, 'PATIENT_LISTED', {
        // Whether they searched, not what for: a search box usually holds a patient's name.
        metadata: { searched: Boolean(search), archived, page, resultCount: patients.length },
      });
      return { items: patients.map(withDateOnly), total, page, limit };
    });
  }

  findOne(user: AuthenticatedUser, id: string) {
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId: user.clinicId, id } },
      });
      if (!patient) throw new NotFoundException('Patient not found');
      await recordAudit(tx, user, 'PATIENT_VIEWED', { entityId: id });
      return withDateOnly(patient);
    });
  }

  update(user: AuthenticatedUser, id: string, input: UpdatePatientInput) {
    const { privacyConsent, birthDate, ...fields } = input;
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      const clinicId_id = { clinicId: user.clinicId, id };
      const current = await tx.patient.findUnique({ where: { clinicId_id } });
      if (!current) throw new NotFoundException('Patient not found');
      if (current.archivedAt) throw new ConflictException('This patient is archived');

      const data: Prisma.PatientUpdateInput = { ...fields };
      if (birthDate) data.birthDate = new Date(birthDate);
      if (privacyConsent !== undefined) {
        // Keeps the original date if consent was already recorded.
        data.privacyConsentAt = privacyConsent ? (current.privacyConsentAt ?? new Date()) : null;
      }

      // The old and new value of every field that really changes. Fields sent with the
      // value they already had are left out.
      const changes: Record<string, { from: string | null; to: string | null }> = {};
      for (const [field, value] of Object.entries(data)) {
        const from = auditValue(field, current[field as keyof typeof current]);
        const to = auditValue(field, value);
        if (from !== to) changes[field] = { from, to };
      }
      if (Object.keys(changes).length === 0) return withDateOnly(current); // nothing to save or log

      const patient = await tx.patient.update({ where: { clinicId_id }, data });
      await recordAudit(tx, user, 'PATIENT_UPDATED', { entityId: id, metadata: { changes } });
      return withDateOnly(patient);
    });
  }

  archive(user: AuthenticatedUser, id: string) {
    return this.setArchived(user, id, true);
  }

  restore(user: AuthenticatedUser, id: string) {
    return this.setArchived(user, id, false);
  }

  private setArchived(user: AuthenticatedUser, id: string, archive: boolean) {
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      const clinicId_id = { clinicId: user.clinicId, id };
      const current = await tx.patient.findUnique({ where: { clinicId_id } });
      if (!current) throw new NotFoundException('Patient not found');
      // Already archived (or already active), so there's nothing to do or log.
      if (Boolean(current.archivedAt) === archive) return;

      await tx.patient.update({
        where: { clinicId_id },
        data: { archivedAt: archive ? new Date() : null },
      });
      await recordAudit(tx, user, archive ? 'PATIENT_ARCHIVED' : 'PATIENT_RESTORED', {
        entityId: id,
      });
    });
  }
}
