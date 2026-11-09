import { z } from 'zod';
import { PHONE_REGEX } from '../patients/patients.schemas.js';

// Opening hours are minutes after midnight (420 = 7:00 AM), in 15-minute steps.
const minuteOfDay = z.number().int().min(0).max(1440).multipleOf(15);

// strictObject refuses unknown fields; partial makes every field optional, where a missing
// field means "leave it alone" and null (for the nullable ones) means "clear it".
export const updateClinicSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(200),
    address: z.string().trim().min(1).max(500).nullable(),
    phone: z.string().trim().regex(PHONE_REGEX, 'Invalid phone number').nullable(),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)).nullable(),
    opensAt: minuteOfDay,
    closesAt: minuteOfDay,
    defaultVisitMinutes: z.number().int().min(5).max(480).multipleOf(5),
    onlineBookingEnabled: z.boolean(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Send at least one field to change')
  .refine(
    (input) =>
      input.opensAt === undefined || input.closesAt === undefined || input.opensAt < input.closesAt,
    { message: 'Opening time must be before closing time', path: ['opensAt'] },
  );

export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
