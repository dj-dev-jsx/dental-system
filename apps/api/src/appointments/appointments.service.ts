import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { recordAudit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { addDays, manilaTime, startOfManilaDay, todayInManila } from '../common/manila.js';
import type { AppointmentStatus, AuditAction, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AvailabilityQuery,
  ConfirmAppointmentInput,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from './appointments.schemas.js';

// Like the patients service, every query filters by clinicId as well as relying on
// row-level security: two separate locks.

// What every response includes: enough to show the appointment and call the patient.
const FIELDS = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  reason: true,
  statusNote: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      suffix: true,
      phone: true,
      archivedAt: true,
    },
  },
  dentist: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AppointmentSelect;

const HISTORY_ACTIONS: AuditAction[] = [
  'APPOINTMENT_CREATED',
  'APPOINTMENT_UPDATED',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_DECLINED',
  'APPOINTMENT_CANCELLED',
];

const HOUR_MS = 60 * 60 * 1000;
const LONGEST_VISIT_HOURS = 8;
const FURTHEST_AHEAD_DAYS = 366;

/** Times that make sense: ends after it starts, not too long, not in the past, not years away. */
function checkTimes(startsAt: Date, endsAt: Date, now = new Date()) {
  const problems: string[] = [];
  if (endsAt <= startsAt) {
    problems.push('endsAt: The appointment must end after it starts');
  } else if (endsAt.getTime() - startsAt.getTime() > LONGEST_VISIT_HOURS * HOUR_MS) {
    problems.push(`endsAt: An appointment can last at most ${LONGEST_VISIT_HOURS} hours`);
  }
  // Earlier today is allowed, so a walk-in can be entered after they've been seen.
  if (startsAt < startOfManilaDay(todayInManila(now))) {
    problems.push('startsAt: That day has already passed');
  } else if (startsAt.getTime() > now.getTime() + FURTHEST_AHEAD_DAYS * 24 * HOUR_MS) {
    problems.push('startsAt: Appointments can be booked up to a year ahead');
  }
  // Same shape as the validation pipe's errors: a list of "field: message".
  if (problems.length > 0) throw new BadRequestException(problems);
}

type Editable = { dentistId: string | null; startsAt: Date; endsAt: Date; reason: string | null };
type Changes = Record<string, { from: string | null; to: string | null }>;

function auditValue(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return (value as string | null | undefined) ?? null;
}

/**
 * Compares the requested changes with the appointment as it is. Returns only what really
 * changes (to save), each change's old and new value (for the audit log), and the result.
 */
function diff(current: Editable, input: Partial<Editable>) {
  const data: Partial<Editable> = {};
  const changes: Changes = {};
  for (const field of ['dentistId', 'startsAt', 'endsAt', 'reason'] as const) {
    if (input[field] === undefined) continue;
    const from = auditValue(current[field]);
    const to = auditValue(input[field]);
    if (from === to) continue;
    changes[field] = { from, to };
    Object.assign(data, { [field]: input[field] });
  }
  return { data, changes, next: { ...current, ...data } };
}

// What to say when an appointment is no longer in a state where the action makes sense.
const NOT_ALLOWED: Record<AppointmentStatus, string> = {
  REQUESTED: 'This appointment is still a request. Confirm it first.',
  CONFIRMED: 'This appointment is already confirmed.',
  DECLINED: 'This request was declined, so it can’t be changed.',
  CANCELLED: 'This appointment was cancelled, so it can’t be changed.',
};

/** True for the database's no-double-booking rule (an exclusion constraint, code 23P01). */
function isDoubleBooking(error: unknown) {
  const meta = (error as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } })
    .meta;
  return meta?.driverAdapterError?.cause?.originalCode === '23P01';
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Like prisma.forClinic, plus one safety net. The code checks for a clash before
   * booking, but two people can book the same slot at the same instant, and both checks
   * pass. The database's rule then refuses the second booking, and this turns that
   * refusal into the same answer the check would have given.
   */
  private forClinic<T>(user: AuthenticatedUser, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.forClinic(user.clinicId, work).catch((error: unknown) => {
      if (isDoubleBooking(error)) {
        throw new ConflictException(
          'The dentist already has an appointment at that time. Choose another time or dentist.',
        );
      }
      throw error;
    });
  }

  /** Every appointment that overlaps these Philippine dates (both included). */
  list(user: AuthenticatedUser, { from, to, dentistId, status }: ListAppointmentsQuery) {
    const rangeStart = startOfManilaDay(from);
    const rangeEnd = startOfManilaDay(addDays(to, 1));
    return this.forClinic(user, async (tx) => {
      const items = await tx.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          // Overlaps the range: starts before it ends, and ends after it starts.
          startsAt: { lt: rangeEnd },
          endsAt: { gt: rangeStart },
          dentistId,
          status: status ? { in: status } : undefined,
        },
        select: FIELDS,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 1000,
      });
      await recordAudit(tx, user, 'APPOINTMENT_LISTED', {
        metadata: { from, to, status: status ?? null, resultCount: items.length },
      });
      return { items: await this.withConflicts(tx, user, items) };
    });
  }

  /** Requests waiting for the clinic to answer, soonest first, including ones whose time has passed. */
  requests(user: AuthenticatedUser) {
    return this.forClinic(user, async (tx) => {
      const where = { clinicId: user.clinicId, status: 'REQUESTED' } as const;
      const items = await tx.appointment.findMany({
        where,
        select: FIELDS,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 200,
      });
      const total = await tx.appointment.count({ where });
      await recordAudit(tx, user, 'APPOINTMENT_LISTED', {
        metadata: { status: ['REQUESTED'], resultCount: items.length },
      });
      return { items: await this.withConflicts(tx, user, items), total };
    });
  }

  /**
   * How many requests are waiting, for the number in the menu. It's only a number, with
   * nothing about any patient, so it isn't logged: the menu asks for it every minute.
   */
  requestCount(user: AuthenticatedUser) {
    return this.forClinic(user, async (tx) => ({
      count: await tx.appointment.count({
        where: { clinicId: user.clinicId, status: 'REQUESTED' },
      }),
    }));
  }

  /** One patient's appointments, latest first. */
  forPatient(user: AuthenticatedUser, patientId: string) {
    return this.forClinic(user, async (tx) => {
      const patient = await tx.patient.findUnique({
        where: { clinicId_id: { clinicId: user.clinicId, id: patientId } },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient not found');
      const items = await tx.appointment.findMany({
        where: { clinicId: user.clinicId, patientId },
        select: FIELDS,
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
      // Logged against the patient, so it shows in their record's history.
      await recordAudit(tx, user, 'APPOINTMENT_LISTED', {
        entityId: patientId,
        metadata: { resultCount: items.length },
      });
      return { items };
    });
  }

  findOne(user: AuthenticatedUser, id: string) {
    return this.forClinic(user, async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { clinicId_id: { clinicId: user.clinicId, id } },
        select: FIELDS,
      });
      if (!appointment) throw new NotFoundException('Appointment not found');
      await recordAudit(tx, user, 'APPOINTMENT_VIEWED', { entityId: id });
      const [withConflict] = await this.withConflicts(tx, user, [appointment]);
      return withConflict;
    });
  }

  /** The lines of the audit log about one appointment, oldest first, for its activity list. */
  history(user: AuthenticatedUser, id: string) {
    return this.forClinic(user, async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { clinicId_id: { clinicId: user.clinicId, id } },
        select: { id: true },
      });
      if (!appointment) throw new NotFoundException('Appointment not found');
      const items = await tx.auditLog.findMany({
        where: { clinicId: user.clinicId, entityId: id, action: { in: HISTORY_ACTIONS } },
        select: {
          id: true,
          action: true,
          createdAt: true,
          metadata: true,
          actor: { select: { firstName: true, lastName: true, role: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 200,
      });
      // Dentists named in the lines by id only, so the page can say "moved from Dr. X to Dr. Y".
      const ids = new Set<string>();
      for (const item of items) {
        const meta = item.metadata as {
          dentistId?: string;
          changes?: { dentistId?: { from: string | null; to: string | null } };
        } | null;
        for (const value of [meta?.dentistId, meta?.changes?.dentistId?.from, meta?.changes?.dentistId?.to]) {
          if (value) ids.add(value);
        }
      }
      // Users have no row-level security, so the clinic filter here is the only lock.
      const found =
        ids.size > 0
          ? await tx.user.findMany({
              where: { clinicId: user.clinicId, id: { in: [...ids] } },
              select: { id: true, firstName: true, lastName: true },
            })
          : [];
      const dentists = Object.fromEntries(
        found.map((d) => [d.id, { firstName: d.firstName, lastName: d.lastName }]),
      );
      return { items, dentists };
    });
  }

  /**
   * Is this dentist free for these times? If not, which confirmed appointment is in the way,
   * and up to three other slots of the same length that day (Philippine time, 15-minute steps,
   * inside the clinic's opening hours), nearest first.
   */
  availability(user: AuthenticatedUser, { dentistId, startsAt, endsAt, exceptId }: AvailabilityQuery) {
    return this.forClinic(user, async (tx) => {
      await this.findDentist(tx, user, dentistId);
      const clinic = await tx.clinic.findUniqueOrThrow({
        where: { id: user.clinicId },
        select: { opensAt: true, closesAt: true },
      });
      const day = todayInManila(startsAt);
      const dayStart = startOfManilaDay(day);
      const dayEnd = startOfManilaDay(addDays(day, 1));
      const busy = await tx.appointment.findMany({
        where: {
          clinicId: user.clinicId,
          dentistId,
          status: 'CONFIRMED',
          startsAt: { lt: dayEnd },
          endsAt: { gt: dayStart },
          id: exceptId ? { not: exceptId } : undefined,
        },
        select: { startsAt: true, endsAt: true },
        orderBy: { startsAt: 'asc' },
      });
      const clashes = (from: Date, to: Date) => busy.find((b) => b.startsAt < to && b.endsAt > from);
      const clash = clashes(startsAt, endsAt) ?? null;
      const suggestions: { startsAt: Date; endsAt: Date }[] = [];
      if (clash) {
        const length = endsAt.getTime() - startsAt.getTime();
        const candidates: { startsAt: Date; endsAt: Date }[] = [];
        for (let minute = clinic.opensAt; minute + length / 60_000 <= clinic.closesAt; minute += 15) {
          const from = new Date(dayStart.getTime() + minute * 60_000);
          const to = new Date(from.getTime() + length);
          if (!clashes(from, to)) candidates.push({ startsAt: from, endsAt: to });
        }
        const distance = (c: { startsAt: Date }) => Math.abs(c.startsAt.getTime() - startsAt.getTime());
        candidates.sort((a, b) => distance(a) - distance(b));
        suggestions.push(...candidates.slice(0, 3).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()));
      }
      return {
        free: !clash,
        clash: clash && { startsAt: clash.startsAt, endsAt: clash.endsAt },
        suggestions,
      };
    });
  }

  /**
   * Adds `conflict` to each request: the first confirmed appointment that overlaps the time
   * asked for, with the dentist asked for. One query for the whole list. Null when there is
   * no dentist, no overlap, or the appointment isn't a request.
   */
  private async withConflicts<
    T extends {
      status: AppointmentStatus;
      startsAt: Date;
      endsAt: Date;
      dentist: { id: string; lastName: string } | null;
    },
  >(tx: Prisma.TransactionClient, user: AuthenticatedUser, items: T[]) {
    const asked = items.filter((item) => item.status === 'REQUESTED' && item.dentist);
    const confirmed =
      asked.length > 0
        ? await tx.appointment.findMany({
            where: {
              clinicId: user.clinicId,
              status: 'CONFIRMED',
              dentistId: { in: [...new Set(asked.map((item) => (item.dentist as { id: string }).id))] },
              startsAt: { lt: new Date(Math.max(...asked.map((item) => item.endsAt.getTime()))) },
              endsAt: { gt: new Date(Math.min(...asked.map((item) => item.startsAt.getTime()))) },
            },
            select: { dentistId: true, startsAt: true, endsAt: true },
            orderBy: { startsAt: 'asc' },
          })
        : [];
    return items.map((item) => {
      const dentist = item.status === 'REQUESTED' ? item.dentist : null;
      const clash = dentist
        ? confirmed.find((c) => c.dentistId === dentist.id && c.startsAt < item.endsAt && c.endsAt > item.startsAt)
        : undefined;
      return {
        ...item,
        conflict:
          dentist && clash
            ? { dentist: { id: dentist.id, lastName: dentist.lastName }, startsAt: clash.startsAt, endsAt: clash.endsAt }
            : null,
      };
    });
  }

  /** Staff booking directly. There's no one to wait for, so it's confirmed at once. */
  create(user: AuthenticatedUser, input: CreateAppointmentInput) {
    checkTimes(input.startsAt, input.endsAt);
    return this.forClinic(user, async (tx) => {
      await this.checkPatient(tx, user, input.patientId);
      await this.findDentist(tx, user, input.dentistId);
      await this.checkFree(tx, user, input.dentistId, input.startsAt, input.endsAt);
      const appointment = await tx.appointment.create({
        data: { ...input, clinicId: user.clinicId, status: 'CONFIRMED' },
        select: FIELDS,
      });
      await recordAudit(tx, user, 'APPOINTMENT_CREATED', {
        entityId: appointment.id,
        metadata: {
          patientId: input.patientId,
          dentistId: input.dentistId,
          startsAt: input.startsAt.toISOString(),
          endsAt: input.endsAt.toISOString(),
          status: 'CONFIRMED',
        },
      });
      return appointment;
    });
  }

  /** Moves an appointment, or changes its dentist or reason. */
  update(user: AuthenticatedUser, id: string, input: UpdateAppointmentInput) {
    return this.forClinic(user, async (tx) => {
      const current = await this.findForChange(tx, user, id, ['REQUESTED', 'CONFIRMED']);
      const { data, changes, next } = diff(current, input);
      if (Object.keys(changes).length === 0) return this.select(tx, user, id); // nothing to save or log

      if (changes.startsAt || changes.endsAt) checkTimes(next.startsAt, next.endsAt);
      if (changes.dentistId && next.dentistId) await this.findDentist(tx, user, next.dentistId);
      if (current.status === 'CONFIRMED') {
        if (!next.dentistId) {
          throw new BadRequestException(['dentistId: A confirmed appointment needs a dentist']);
        }
        if (changes.dentistId || changes.startsAt || changes.endsAt) {
          await this.checkFree(tx, user, next.dentistId, next.startsAt, next.endsAt, id);
        }
      }

      const appointment = await tx.appointment.update({
        where: { clinicId_id: { clinicId: user.clinicId, id } },
        data,
        select: FIELDS,
      });
      await recordAudit(tx, user, 'APPOINTMENT_UPDATED', { entityId: id, metadata: { changes } });
      return appointment;
    });
  }

  /** Accepts a request, possibly at another time or with another dentist agreed with the patient. */
  confirm(user: AuthenticatedUser, id: string, input: ConfirmAppointmentInput) {
    return this.forClinic(user, async (tx) => {
      const current = await this.findForChange(tx, user, id, ['REQUESTED']);
      await this.checkPatient(tx, user, current.patientId);
      const { data, changes, next } = diff(current, input);
      if (!next.dentistId) {
        throw new BadRequestException(['dentistId: Choose a dentist before confirming']);
      }
      await this.findDentist(tx, user, next.dentistId);
      // Checked even if unchanged: a request's time may have passed while it waited.
      checkTimes(next.startsAt, next.endsAt);
      await this.checkFree(tx, user, next.dentistId, next.startsAt, next.endsAt, id);

      const appointment = await tx.appointment.update({
        where: { clinicId_id: { clinicId: user.clinicId, id } },
        data: { ...data, status: 'CONFIRMED' },
        select: FIELDS,
      });
      changes['status'] = { from: 'REQUESTED', to: 'CONFIRMED' };
      await recordAudit(tx, user, 'APPOINTMENT_CONFIRMED', { entityId: id, metadata: { changes } });
      return appointment;
    });
  }

  /** The clinic says no to a request. */
  decline(user: AuthenticatedUser, id: string, note?: string | null) {
    return this.close(user, id, 'DECLINED', ['REQUESTED'], note);
  }

  /** Called off, by the clinic or because the patient asked. Frees the dentist's time. */
  cancel(user: AuthenticatedUser, id: string, note?: string | null) {
    return this.close(user, id, 'CANCELLED', ['REQUESTED', 'CONFIRMED'], note);
  }

  /** The active dentists, for choosing one. Users have no row-level security, so the clinic filter here is the only lock. */
  dentists(user: AuthenticatedUser) {
    return this.prisma.user
      .findMany({
        where: { clinicId: user.clinicId, role: 'DENTIST', isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      })
      .then((items) => ({ items }));
  }

  private close(
    user: AuthenticatedUser,
    id: string,
    status: 'DECLINED' | 'CANCELLED',
    allowedFrom: AppointmentStatus[],
    note?: string | null,
  ) {
    return this.forClinic(user, async (tx) => {
      const current = await this.findForChange(tx, user, id, allowedFrom);
      const appointment = await tx.appointment.update({
        where: { clinicId_id: { clinicId: user.clinicId, id } },
        data: { status, statusNote: note ?? null },
        select: FIELDS,
      });
      const changes: Changes = { status: { from: current.status, to: status } };
      if (note) changes['statusNote'] = { from: current.statusNote, to: note };
      await recordAudit(tx, user, status === 'DECLINED' ? 'APPOINTMENT_DECLINED' : 'APPOINTMENT_CANCELLED', {
        entityId: id,
        metadata: { changes },
      });
      return appointment;
    });
  }

  private select(tx: Prisma.TransactionClient, user: AuthenticatedUser, id: string) {
    return tx.appointment.findUniqueOrThrow({
      where: { clinicId_id: { clinicId: user.clinicId, id } },
      select: FIELDS,
    });
  }

  /** The appointment, if it exists and is in a status that allows the change. */
  private async findForChange(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    id: string,
    allowed: AppointmentStatus[],
  ) {
    const current = await tx.appointment.findUnique({
      where: { clinicId_id: { clinicId: user.clinicId, id } },
    });
    if (!current) throw new NotFoundException('Appointment not found');
    if (!allowed.includes(current.status)) throw new ConflictException(NOT_ALLOWED[current.status]);
    return current;
  }

  private async checkPatient(tx: Prisma.TransactionClient, user: AuthenticatedUser, patientId: string) {
    const patient = await tx.patient.findUnique({
      where: { clinicId_id: { clinicId: user.clinicId, id: patientId } },
      select: { archivedAt: true },
    });
    if (!patient) throw new BadRequestException(['patientId: Patient not found']);
    if (patient.archivedAt) {
      throw new ConflictException('This patient is archived. An admin can restore them first.');
    }
  }

  private async findDentist(tx: Prisma.TransactionClient, user: AuthenticatedUser, dentistId: string) {
    const dentist = await tx.user.findFirst({
      where: { id: dentistId, clinicId: user.clinicId, role: 'DENTIST', isActive: true },
      select: { id: true },
    });
    if (!dentist) throw new BadRequestException(['dentistId: Choose one of the clinic’s dentists']);
  }

  /** Refuses a time that overlaps another confirmed appointment with the same dentist. */
  private async checkFree(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    dentistId: string,
    startsAt: Date,
    endsAt: Date,
    exceptId?: string,
  ) {
    const clash = await tx.appointment.findFirst({
      where: {
        clinicId: user.clinicId,
        dentistId,
        status: 'CONFIRMED',
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        id: exceptId ? { not: exceptId } : undefined,
      },
      select: { startsAt: true, endsAt: true, dentist: { select: { lastName: true } } },
      orderBy: { startsAt: 'asc' },
    });
    if (clash) {
      throw new ConflictException(
        `Dr. ${clash.dentist?.lastName} already has an appointment from ${manilaTime(clash.startsAt)} to ${manilaTime(clash.endsAt)}. Choose another time or dentist.`,
      );
    }
  }
}
