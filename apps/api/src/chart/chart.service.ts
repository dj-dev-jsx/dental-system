import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { recordAudit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { Prisma, ToothCondition, ToothSurface } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CorrectToothInput, RecordToothInput } from './chart.schemas.js';


export const RECORD_FIELDS = {
  id: true,
  tooth: true,
  condition: true,
  surfaces: true,
  note: true,
  recordedAt: true,
  createdAt: true,
  correctsId: true,
  correctionReason: true,
  recordedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  appointment: { select: { id: true, startsAt: true, endsAt: true } },
  correctedBy: { select: { id: true } },
} satisfies Prisma.ToothRecordSelect;

export type ChartRecord = Prisma.ToothRecordGetPayload<{ select: typeof RECORD_FIELDS }>;

/** What a tooth's chart says now. */
export type ToothNow = {
  condition: ToothCondition;
  surfaces: ToothSurface[];
  recordId: string;
  recordedAt: Date;
};

/**
 * Works out each tooth's current state from its entries, newest finding first. An entry that
 * was corrected no longer counts; its correction stands in its place, on the same date. A
 * correction that withdrew an entry leaves the tooth as it was before that entry.
 */
export function currentTeeth(records: ChartRecord[]) {
  const ordered = [...records].sort(
    (a, b) =>
      b.recordedAt.getTime() - a.recordedAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime(),
  );
  const teeth: Record<string, ToothNow> = {};
  for (const record of ordered) {
    if (record.correctedBy || record.condition === null || teeth[record.tooth]) continue;
    teeth[record.tooth] = {
      condition: record.condition,
      surfaces: record.surfaces,
      recordId: record.id,
      recordedAt: record.recordedAt,
    };
  }
  return teeth;
}

/** True for a unique constraint refusing a second correction of the same entry. */
function isAlreadyCorrected(error: unknown) {
  const known = error as { code?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } };
  return known.code === 'P2002' || known.meta?.driverAdapterError?.cause?.originalCode === '23505';
}

@Injectable()
export class ChartService {
  constructor(private readonly prisma: PrismaService) {}

  /** A patient's whole chart: each tooth as it is now, and every entry ever made, newest first. */
  chart(user: AuthenticatedUser, patientId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.findPatient(tx, user, patientId);
      const records = await tx.toothRecord.findMany({
        where: { patientId },
        select: RECORD_FIELDS,
        orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
        take: 2000,
      });
      await recordAudit(tx, user, 'CHART_VIEWED', { entityId: patientId });
      return { teeth: currentTeeth(records), records };
    });
  }

  /** Adds a finding to one tooth. */
  record(user: AuthenticatedUser, patientId: string, input: RecordToothInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.findPatient(tx, user, patientId, { forChange: true });
      if (input.appointmentId) {
        const appointment = await tx.appointment.findFirst({
          where: { patientId, id: input.appointmentId },
          select: { id: true },
        });
        if (!appointment) {
          throw new BadRequestException(['appointmentId: That isn’t one of this patient’s appointments']);
        }
      }
      const record = await tx.toothRecord.create({
        data: {
          ...input,
          patientId,
          recordedById: user.id,
          recordedAt: new Date(),
        },
        select: RECORD_FIELDS,
      });
      await recordAudit(tx, user, 'TOOTH_RECORDED', {
        entityId: patientId,
        metadata: { recordId: record.id, tooth: record.tooth, condition: record.condition },
      });
      return record;
    });
  }

  /** Corrects a wrong entry with a new one that takes its place and says why. */
  correct(user: AuthenticatedUser, patientId: string, recordId: string, input: CorrectToothInput) {
    return this.prisma
      .$transaction(async (tx) => {
        await this.findPatient(tx, user, patientId, { forChange: true });
        const wrong = await tx.toothRecord.findFirst({
          where: { patientId, id: recordId },
          select: { id: true, tooth: true, condition: true, recordedAt: true, appointmentId: true, correctedBy: { select: { id: true } } },
        });
        if (!wrong) throw new NotFoundException('Chart entry not found');
        if (wrong.correctedBy) throw new ConflictException(ALREADY_CORRECTED);

        const { reason, ...fields } = input;
        const correction = await tx.toothRecord.create({
          data: {
            ...fields,
            patientId,
            tooth: wrong.tooth,
            // Takes the wrong entry's place in the tooth's timeline.
            recordedAt: wrong.recordedAt,
            appointmentId: wrong.appointmentId,
            recordedById: user.id,
            correctsId: wrong.id,
            correctionReason: reason,
          },
          select: RECORD_FIELDS,
        });
        await recordAudit(tx, user, 'TOOTH_CORRECTED', {
          entityId: patientId,
          metadata: {
            recordId: correction.id,
            corrects: wrong.id,
            tooth: wrong.tooth,
            changes: { condition: { from: wrong.condition, to: input.condition } },
          },
        });
        return correction;
      })
      .catch((error: unknown) => {
        // Two people correcting the same entry at once: the database lets only one through.
        if (isAlreadyCorrected(error)) throw new ConflictException(ALREADY_CORRECTED);
        throw error;
      });
  }

  private async findPatient(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    patientId: string,
    { forChange = false } = {},
  ) {
    const patient = await tx.patient.findUnique({
      where: { id: patientId },
      select: { archivedAt: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    if (forChange && patient.archivedAt) {
      throw new ConflictException('This patient is archived. An admin can restore them first.');
    }
  }
}

const ALREADY_CORRECTED = 'This entry has already been corrected. To change it again, correct the correction.';
