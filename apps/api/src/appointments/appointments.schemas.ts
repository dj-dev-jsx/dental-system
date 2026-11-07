import { z } from 'zod';
import { daysBetween } from '../common/manila.js';
import { AppointmentStatus } from '../generated/prisma/client.js';

// Times must say their time zone, like 2026-11-10T09:00:00+08:00, so a computer set to the
// wrong zone can't book 9 AM as 5 PM. They arrive as text and become real Dates here.
const moment = z.iso.datetime({ offset: true }).transform((text) => new Date(text));
const note = z.string().trim().min(1).max(500).nullable().optional();

// Rules that need the whole picture (ends after it starts, not in the past, not
// double-booked) are checked in the service, because a change may send only some fields.

// Staff booking directly, for a phone call or a walk-in. It's confirmed straight away.
export const createAppointmentSchema = z.strictObject({
  patientId: z.uuid(),
  dentistId: z.uuid(),
  startsAt: moment,
  endsAt: moment,
  reason: note,
});

// A missing field means "leave it alone". A request may have no dentist yet (null).
export const updateAppointmentSchema = z
  .strictObject({
    dentistId: z.uuid().nullable(),
    startsAt: moment,
    endsAt: moment,
    reason: note,
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Send at least one field to change');

// Confirming a request can also change it: after calling the patient, the clinic may agree
// on another time or dentist. With no body, the request is confirmed as it is.
export const confirmAppointmentSchema = z
  .strictObject({ dentistId: z.uuid(), startsAt: moment, endsAt: moment })
  .partial()
  .default({});

// Declining or cancelling can say why, like "Patient called to cancel".
export const statusNoteSchema = z.strictObject({ note }).default({});

const date = z.iso.date();
const MAX_DAYS = 42; // six weeks: more than any calendar view needs

export const listAppointmentsSchema = z
  .strictObject({
    // Philippine dates, both included: from=2026-11-09&to=2026-11-15 is one week.
    from: date,
    to: date,
    dentistId: z.uuid().optional(),
    // ?status=REQUESTED,CONFIRMED. Leave it out to get every status.
    status: z
      .string()
      .transform((text) => text.split(','))
      .pipe(z.array(z.enum(AppointmentStatus)).min(1))
      .optional(),
  })
  .refine(({ from, to }) => to >= from, { message: 'to is before from', path: ['to'] })
  .refine(({ from, to }) => daysBetween(from, to) < MAX_DAYS, {
    message: `Ask for at most ${MAX_DAYS} days at a time`,
    path: ['to'],
  });

export const idSchema = z.uuid();

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type ConfirmAppointmentInput = z.infer<typeof confirmAppointmentSchema>;
export type StatusNoteInput = z.infer<typeof statusNoteSchema>;
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsSchema>;
