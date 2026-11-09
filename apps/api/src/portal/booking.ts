import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { recordPatientAudit } from '../audit/audit.js';
import { addDays, manilaMinuteOfDay, startOfManilaDay, todayInManila } from '../common/manila.js';
import type { Prisma } from '../generated/prisma/client.js';

// The rules of online booking, shared by the booking routes and by email confirmation (which
// turns the request made while signing up into a real one).

/** Patients pick a start time from a grid with this step. */
export const SLOT_MINUTES = 30;
/** Bookable from tomorrow until this many days ahead, Philippine dates. */
export const BOOKING_DAYS_AHEAD = 60;
/** Requests still waiting for the clinic, per account. More would let one person fill the list. */
export const MAX_OPEN_REQUESTS = 3;

const CLINIC_FIELDS = {
  name: true,
  address: true,
  phone: true,
  email: true,
  opensAt: true,
  closesAt: true,
  defaultVisitMinutes: true,
  onlineBookingEnabled: true,
} satisfies Prisma.ClinicSettingsSelect;

export type BookingClinic = Prisma.ClinicSettingsGetPayload<{ select: typeof CLINIC_FIELDS }>;

/** The clinic's settings, or 404 BOOKING_NOT_AVAILABLE while online booking is switched off. */
export async function findBookingClinic(prisma: Prisma.TransactionClient): Promise<BookingClinic> {
  const clinic = await prisma.clinicSettings.findUnique({ where: { id: 1 }, select: CLINIC_FIELDS });
  if (!clinic || !clinic.onlineBookingEnabled) throw new NotFoundException('BOOKING_NOT_AVAILABLE');
  return clinic;
}

/** The first and last day a patient can book, as Philippine 'YYYY-MM-DD' dates. */
export function bookableWindow(now = new Date()) {
  const today = todayInManila(now);
  return { first: addDays(today, 1), last: addDays(today, BOOKING_DAYS_AHEAD) };
}

/** Every start time on the grid for one day: every 30 minutes from opening, ending by closing. */
export function gridFor(clinic: BookingClinic, date: string) {
  const dayStart = startOfManilaDay(date).getTime();
  const slots: { startsAt: Date; endsAt: Date }[] = [];
  for (let minute = clinic.opensAt; minute + clinic.defaultVisitMinutes <= clinic.closesAt; minute += SLOT_MINUTES) {
    const startsAt = new Date(dayStart + minute * 60_000);
    slots.push({ startsAt, endsAt: new Date(startsAt.getTime() + clinic.defaultVisitMinutes * 60_000) });
  }
  return slots;
}

/** The clinic's active dentists. */
export function activeDentists(tx: Prisma.TransactionClient) {
  return tx.user.findMany({
    where: { role: 'DENTIST', isActive: true },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
  });
}

/** Refuses anything but one of the clinic's active dentists. */
export async function checkDentist(tx: Prisma.TransactionClient, dentistId: string) {
  const dentist = await tx.user.findFirst({
    where: { id: dentistId, role: 'DENTIST', isActive: true },
    select: { id: true },
  });
  if (!dentist) throw new BadRequestException(['dentistId: Choose one of the clinic’s dentists']);
}

/**
 * The free times on one day. A time is free when the chosen dentist, or without one at least
 * one active dentist, has no confirmed appointment overlapping it. Requests don't count: they
 * don't take up anyone's time yet. Only the times come back, never who is booked.
 */
export async function freeSlots(
  tx: Prisma.TransactionClient,
  clinic: BookingClinic,
  date: string,
  dentistId?: string | null,
) {
  const grid = gridFor(clinic, date);
  if (grid.length === 0) return [];
  const dentists = dentistId ? [dentistId] : (await activeDentists(tx)).map((d) => d.id);
  if (dentists.length === 0) return [];
  const busy = await tx.appointment.findMany({
    where: {
      status: 'CONFIRMED',
      dentistId: { in: dentists },
      startsAt: { lt: grid.at(-1)!.endsAt },
      endsAt: { gt: grid[0].startsAt },
    },
    select: { dentistId: true, startsAt: true, endsAt: true },
  });
  const isFree = (dentist: string, slot: { startsAt: Date; endsAt: Date }) =>
    !busy.some((b) => b.dentistId === dentist && b.startsAt < slot.endsAt && b.endsAt > slot.startsAt);
  return grid.filter((slot) => dentists.some((dentist) => isFree(dentist, slot)));
}

/**
 * Checks a time a patient asked for is one /slots would offer: inside the booking window, on
 * the grid, within opening hours, and still free. Returns when it would end.
 */
export async function checkBookable(
  tx: Prisma.TransactionClient,
  clinic: BookingClinic,
  startsAt: Date,
  dentistId: string | null,
  now = new Date(),
) {
  if (dentistId) await checkDentist(tx, dentistId);
  const date = todayInManila(startsAt);
  const { first, last } = bookableWindow(now);
  const minute = manilaMinuteOfDay(startsAt);
  const onGrid =
    date >= first &&
    date <= last &&
    startsAt.getTime() % 60_000 === 0 &&
    minute >= clinic.opensAt &&
    (minute - clinic.opensAt) % SLOT_MINUTES === 0 &&
    minute + clinic.defaultVisitMinutes <= clinic.closesAt;
  if (!onGrid) throw new BadRequestException('SLOT_NOT_AVAILABLE');
  const free = await freeSlots(tx, clinic, date, dentistId);
  if (!free.some((slot) => slot.startsAt.getTime() === startsAt.getTime())) {
    throw new ConflictException('SLOT_TAKEN');
  }
  return new Date(startsAt.getTime() + clinic.defaultVisitMinutes * 60_000);
}

/** What a patient sees of an appointment: never who else is booked, never any dental record. */
export const PORTAL_FIELDS = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  reason: true,
  statusNote: true,
  dentist: { select: { firstName: true, lastName: true } },
} satisfies Prisma.AppointmentSelect;

type PortalRow = Prisma.AppointmentGetPayload<{ select: typeof PORTAL_FIELDS }>;

export function toPortalAppointment(row: PortalRow, now = new Date()) {
  return {
    ...row,
    canCancel: (row.status === 'REQUESTED' || row.status === 'CONFIRMED') && row.startsAt > now,
  };
}

export type PortalAppointment = ReturnType<typeof toPortalAppointment>;

/** Saves an online request and its audit line, with the patient's account as the actor. */
export async function createOnlineRequest(
  tx: Prisma.TransactionClient,
  account: { id: string; patientId: string | null },
  request: { startsAt: Date; endsAt: Date; dentistId: string | null; reason: string },
) {
  const appointment = await tx.appointment.create({
    data: {
      patientAccountId: account.id,
      // Null until staff link the account to a patient record.
      patientId: account.patientId,
      dentistId: request.dentistId,
      startsAt: request.startsAt,
      endsAt: request.endsAt,
      reason: request.reason,
      status: 'REQUESTED',
    },
    select: PORTAL_FIELDS,
  });
  await recordPatientAudit(tx, account, 'APPOINTMENT_REQUESTED_ONLINE', {
    entityId: appointment.id,
    metadata: {
      patientId: account.patientId,
      dentistId: request.dentistId,
      startsAt: request.startsAt.toISOString(),
      endsAt: request.endsAt.toISOString(),
      status: 'REQUESTED',
    },
  });
  return toPortalAppointment(appointment);
}
