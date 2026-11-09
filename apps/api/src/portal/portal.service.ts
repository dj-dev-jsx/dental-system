import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { recordPatientAudit } from '../audit/audit.js';
import type { Prisma } from '../generated/prisma/client.js';
import * as mails from '../mail/mail.templates.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  activeDentists,
  bookableWindow,
  checkBookable,
  checkDentist,
  createOnlineRequest,
  findBookingClinic,
  freeSlots,
  MAX_OPEN_REQUESTS,
  PORTAL_FIELDS,
  SLOT_MINUTES,
  toPortalAppointment,
} from './booking.js';
import { PortalAuthService } from './portal-auth.service.js';
import type { BookingRequestInput, SlotsQuery } from './portal.schemas.js';
import type { AuthenticatedPatient } from './portal.types.js';

/** The account's appointments: booked online by it, or made for the patient record it's linked to. */
function mine(patient: AuthenticatedPatient): Prisma.AppointmentWhereInput {
  return {
    OR: [{ patientAccountId: patient.id }, ...(patient.patientId ? [{ patientId: patient.patientId }] : [])],
  };
}

// Online booking for patients. For a signed-in patient, every query only ever reaches their
// own appointments.
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly auth: PortalAuthService,
  ) {}

  /** The clinic's public page: name, hours, how to reach it, and who patients can book with. */
  async info() {
    const clinic = await findBookingClinic(this.prisma);
    const dentists = await this.prisma.$transaction((tx) => activeDentists(tx));
    const { first, last } = bookableWindow();
    return {
      name: clinic.name,
      address: clinic.address,
      phone: clinic.phone,
      email: clinic.email,
      opensAt: clinic.opensAt,
      closesAt: clinic.closesAt,
      defaultVisitMinutes: clinic.defaultVisitMinutes,
      slotMinutes: SLOT_MINUTES,
      firstBookableDate: first,
      lastBookableDate: last,
      dentists,
    };
  }

  /** The free start times on one day. A day outside the booking window has none. */
  async slots({ date, dentistId }: SlotsQuery) {
    const clinic = await findBookingClinic(this.prisma);
    const { first, last } = bookableWindow();
    const slots = await this.prisma.$transaction(async (tx) => {
      // Asking about someone who isn't one of the clinic's dentists is a mistake, not "no times".
      if (dentistId) await checkDentist(tx, dentistId);
      if (date < first || date > last) return [];
      return freeSlots(tx, clinic, date, dentistId);
    });
    return { date, slots };
  }

  /** Upcoming (still to happen and not called off), soonest first; then the rest, newest first. */
  async appointments(patient: AuthenticatedPatient) {
    const now = new Date();
    const open = { status: { in: ['REQUESTED', 'CONFIRMED'] as ('REQUESTED' | 'CONFIRMED')[] }, endsAt: { gt: now } };
    return this.prisma.$transaction(async (tx) => {
      const upcoming = await tx.appointment.findMany({
        where: { AND: [mine(patient), open] },
        select: PORTAL_FIELDS,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        take: 100,
      });
      const past = await tx.appointment.findMany({
        where: { AND: [mine(patient), { NOT: open }] },
        select: PORTAL_FIELDS,
        orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
        take: 50,
      });
      return {
        upcoming: upcoming.map((a) => toPortalAppointment(a, now)),
        past: past.map((a) => toPortalAppointment(a, now)),
      };
    });
  }

  /** A signed-in patient asks for one of the free times. */
  async book(patient: AuthenticatedPatient, input: BookingRequestInput) {
    const clinic = await findBookingClinic(this.prisma);
    const request = await this.prisma.$transaction(async (tx) => {
      const waiting = await tx.appointment.count({
        where: { AND: [mine(patient), { status: 'REQUESTED', startsAt: { gt: new Date() } }] },
      });
      if (waiting >= MAX_OPEN_REQUESTS) throw new ConflictException('TOO_MANY_REQUESTS');
      const endsAt = await checkBookable(tx, clinic, input.startsAt, input.dentistId);
      return createOnlineRequest(tx, patient, { ...input, endsAt });
    });
    const links = mails.portalLinks(this.mail.webOrigin);
    this.auth.sendTo(clinic, patient.email, mails.requestReceived(clinic, patient.firstName, request, links.appointments));
    return request;
  }

  /** The patient calls off one of their own requests or appointments, before it starts. */
  cancel(patient: AuthenticatedPatient, id: string, reason: string | null) {
    return this.prisma.$transaction(async (tx) => {
      // Someone else's appointment is "not found", exactly like one that doesn't exist.
      const current = await tx.appointment.findFirst({
        where: { AND: [mine(patient), { id }] },
        select: { ...PORTAL_FIELDS, patientId: true },
      });
      if (!current) throw new NotFoundException('Appointment not found');
      if (!toPortalAppointment(current).canCancel) throw new ConflictException('CANNOT_CANCEL');
      const appointment = await tx.appointment.update({
        where: { id },
        data: { status: 'CANCELLED', statusNote: reason },
        select: PORTAL_FIELDS,
      });
      const changes: Record<string, { from: string | null; to: string | null }> = {
        status: { from: current.status, to: 'CANCELLED' },
      };
      if (reason) changes['statusNote'] = { from: current.statusNote, to: reason };
      await recordPatientAudit(tx, patient, 'APPOINTMENT_CANCELLED_BY_PATIENT', {
        entityId: id,
        metadata: { changes },
      });
      return toPortalAppointment(appointment);
    });
  }
}
