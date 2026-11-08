import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { recordAudit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { currentTeeth, RECORD_FIELDS as CHART_RECORD_FIELDS } from '../chart/chart.service.js';
import { Prisma } from '../generated/prisma/client.js';
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
  email: true,
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

type AppointmentFacts = {
  nextAppointment: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    status: 'REQUESTED' | 'CONFIRMED';
    reason: string | null;
    dentist: { id: string; lastName: string } | null;
  } | null;
  lastVisitAt: Date | null;
};

type FactRow = {
  patient_id: string;
  appointment_id: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
  status: 'REQUESTED' | 'CONFIRMED' | null;
  reason: string | null;
  dentist_id: string | null;
  dentist_last_name: string | null;
  last_visit_at: Date | null;
};

// For a page of patients, in one query: the soonest appointment that is still ahead (asked
// for or confirmed; one in progress counts) and when the latest confirmed visit ended.
// Both filter by clinic, in addition to row-level security.
async function appointmentFacts(
  tx: Prisma.TransactionClient,
  clinicId: string,
  patientIds: string[],
) {
  const facts = new Map<string, AppointmentFacts>();
  for (const id of patientIds) facts.set(id, { nextAppointment: null, lastVisitAt: null });
  if (patientIds.length === 0) return facts;
  const rows = await tx.$queryRaw<FactRow[]>`
    SELECT ids.id AS patient_id,
           n.id AS appointment_id, n.starts_at, n.ends_at, n.status, n.reason,
           n.dentist_id, u.last_name AS dentist_last_name,
           (SELECT max(l.ends_at) FROM appointments l
             WHERE l.clinic_id = ${clinicId}::uuid AND l.patient_id = ids.id
               AND l.status = 'CONFIRMED' AND l.ends_at <= now()) AS last_visit_at
    FROM unnest(${patientIds}::uuid[]) AS ids(id)
    LEFT JOIN LATERAL (
      SELECT a.id, a.starts_at, a.ends_at, a.status, a.reason, a.dentist_id
      FROM appointments a
      WHERE a.clinic_id = ${clinicId}::uuid AND a.patient_id = ids.id
        AND a.status IN ('REQUESTED', 'CONFIRMED') AND a.ends_at > now()
      ORDER BY a.starts_at ASC, a.id ASC
      LIMIT 1
    ) n ON true
    LEFT JOIN users u ON u.clinic_id = ${clinicId}::uuid AND u.id = n.dentist_id`;
  for (const row of rows) {
    facts.set(row.patient_id, {
      nextAppointment: row.appointment_id
        ? {
            id: row.appointment_id,
            startsAt: row.starts_at!,
            endsAt: row.ends_at!,
            status: row.status!,
            reason: row.reason,
            dentist: row.dentist_id ? { id: row.dentist_id, lastName: row.dentist_last_name! } : null,
          }
        : null,
      lastVisitAt: row.last_visit_at,
    });
  }
  return facts;
}

// Patient ids in the order of the next appointment or last visit, those with none last, and
// the id as tiebreaker so pages never repeat or skip anyone. The search is the same as
// searchFilter, written for SQL.
async function sortedPatientIds(
  tx: Prisma.TransactionClient,
  clinicId: string,
  { search, archived, sort, dir, page, limit }: {
    search?: string; archived: boolean; sort: 'nextAppointment' | 'lastVisit'; dir: 'asc' | 'desc'; page: number; limit: number;
  },
) {
  const words = (search ?? '').split(/\s+/).filter(Boolean).map((word) => {
    const like = `%${word.replace(/[\\%_]/g, '\\$&')}%`;
    return Prisma.sql`AND (p.first_name ILIKE ${like} OR p.middle_name ILIKE ${like} OR p.last_name ILIKE ${like} OR p.phone ILIKE ${like})`;
  });
  const key =
    sort === 'nextAppointment'
      ? Prisma.sql`SELECT min(a.starts_at) AS v FROM appointments a
          WHERE a.clinic_id = p.clinic_id AND a.patient_id = p.id
            AND a.status IN ('REQUESTED', 'CONFIRMED') AND a.ends_at > now()`
      : Prisma.sql`SELECT max(a.ends_at) AS v FROM appointments a
          WHERE a.clinic_id = p.clinic_id AND a.patient_id = p.id
            AND a.status = 'CONFIRMED' AND a.ends_at <= now()`;
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM patients p
    LEFT JOIN LATERAL (${key}) k ON true
    WHERE p.clinic_id = ${clinicId}::uuid
      AND p.archived_at IS ${archived ? Prisma.sql`NOT NULL` : Prisma.sql`NULL`}
      ${words.length > 0 ? Prisma.join(words, ' ') : Prisma.empty}
    ORDER BY k.v ${dir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`} NULLS LAST, p.id ASC
    LIMIT ${limit} OFFSET ${(page - 1) * limit}`;
  return rows.map((row) => row.id);
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

  list(
    user: AuthenticatedUser,
    { search, archived = false, page, limit, sort, dir }: ListPatientsQuery,
  ) {
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      const where: Prisma.PatientWhereInput = {
        clinicId: user.clinicId,
        archivedAt: archived ? { not: null } : null,
        AND: searchFilter(search),
      };
      let patients;
      if (sort === 'name') {
        patients = await tx.patient.findMany({
          where,
          select: LIST_FIELDS,
          // id comes last so patients with the same name always stay in the same order.
          orderBy: [{ lastName: dir }, { firstName: dir }, { id: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        });
      } else {
        const ids = await sortedPatientIds(tx, user.clinicId, { search, archived, sort, dir, page, limit });
        const found = await tx.patient.findMany({
          where: { ...where, id: { in: ids } },
          select: LIST_FIELDS,
        });
        const byId = new Map(found.map((patient) => [patient.id, patient]));
        patients = ids.flatMap((id) => byId.get(id) ?? []);
      }
      const total = await tx.patient.count({ where });
      const facts = await appointmentFacts(
        tx,
        user.clinicId,
        patients.map((patient) => patient.id),
      );
      await recordAudit(tx, user, 'PATIENT_LISTED', {
        // Whether they searched, not what for: a search box usually holds a patient's name.
        metadata: { searched: Boolean(search), archived, page, resultCount: patients.length, sort, dir },
      });
      return {
        items: patients.map((patient) => ({
          ...withDateOnly(patient),
          nextAppointment: facts.get(patient.id)?.nextAppointment ?? null,
          lastVisitAt: facts.get(patient.id)?.lastVisitAt ?? null,
        })),
        total,
        page,
        limit,
      };
    });
  }

  findOne(user: AuthenticatedUser, id: string) {
    return this.prisma.forClinic(user.clinicId, async (tx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId: user.clinicId, id } },
      });
      if (!patient) throw new NotFoundException('Patient not found');
      await recordAudit(tx, user, 'PATIENT_VIEWED', { entityId: id });
      const facts = (await appointmentFacts(tx, user.clinicId, [id])).get(id);
      return {
        ...withDateOnly(patient),
        nextAppointment: facts?.nextAppointment ?? null,
        lastVisitAt: facts?.lastVisitAt ?? null,
        chartSummary: await this.chartSummary(tx, user.clinicId, id),
      };
    });
  }

  // How the teeth are now, counted by condition, and the newest entry. Read with the same
  // rule as the chart page, but without logging a chart view: this is part of the record.
  private async chartSummary(tx: Prisma.TransactionClient, clinicId: string, patientId: string) {
    const records = await tx.toothRecord.findMany({
      where: { clinicId, patientId },
      select: CHART_RECORD_FIELDS,
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      take: 2000,
    });
    const teeth = Object.entries(currentTeeth(records));
    const counts: Record<string, number> = {};
    for (const [, now] of teeth) counts[now.condition] = (counts[now.condition] ?? 0) + 1;
    // The newest current entry; records are newest first, so the first match wins.
    const newest = new Set(teeth.map(([, now]) => now.recordId));
    const latest = records.find((record) => newest.has(record.id));
    return {
      counts,
      latest:
        latest && latest.condition
          ? {
              tooth: latest.tooth,
              condition: latest.condition,
              recordedAt: latest.recordedAt,
              recordedBy: {
                firstName: latest.recordedBy.firstName,
                lastName: latest.recordedBy.lastName,
                role: latest.recordedBy.role,
              },
            }
          : null,
    };
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
