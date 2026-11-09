import { z } from 'zod';
import { todayInManila } from '../common/manila.js';
import { PHONE_REGEX } from '../patients/patients.schemas.js';

// What patients may send. Strict objects refuse unknown fields, so nobody can slip in a
// patientId or a status. Rules that need the clinic (is this time on the grid,
// is it free) are checked in the service.

const name = z.string().trim().min(1).max(100);
const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
// Times say their time zone, like 2026-11-10T01:00:00.000Z or 2026-11-10T09:00:00+08:00.
const moment = z.iso.datetime({ offset: true }).transform((text) => new Date(text));
const reason = z.string().trim().min(1).max(500);
// The length cap stops someone sending a huge "password" to tie up the server.
const newPassword = z.string().min(10).max(128);
const token = z.string().min(1).max(200);

export const bookingRequestSchema = z.strictObject({
  startsAt: moment,
  // null (or left out): any dentist.
  dentistId: z.uuid().nullable().optional().transform((id) => id ?? null),
  reason,
});

export const registerSchema = z.strictObject({
  firstName: name,
  lastName: name,
  birthDate: z.iso
    .date()
    .refine((date) => date >= '1900-01-01', 'Birth date is too far in the past')
    .refine((date) => date <= todayInManila(), 'Birth date is in the future'),
  phone: z.string().trim().regex(PHONE_REGEX, 'Invalid phone number'),
  email,
  password: newPassword,
  // They must tick the box: an account can't exist without consent to the privacy notice.
  privacyConsent: z.literal(true),
  // The appointment they were booking when they signed up. Saved once the email is confirmed.
  request: bookingRequestSchema.optional(),
});

export const tokenSchema = z.strictObject({ token });
export const emailSchema = z.strictObject({ email });
export const loginSchema = z.strictObject({ email, password: z.string().min(1).max(200) });
export const resetPasswordSchema = z.strictObject({ token, newPassword });

export const slotsSchema = z.strictObject({
  date: z.iso.date(),
  dentistId: z.uuid().optional(),
});

export const cancelSchema = z
  .strictObject({
    reason: z.string().trim().max(500).optional().transform((text) => text || null),
  })
  .default({ reason: null });

export const idSchema = z.uuid();

export type RegisterInput = z.infer<typeof registerSchema>;
export type BookingRequestInput = z.infer<typeof bookingRequestSchema>;
export type SlotsQuery = z.infer<typeof slotsSchema>;
export type CancelInput = z.infer<typeof cancelSchema>;
