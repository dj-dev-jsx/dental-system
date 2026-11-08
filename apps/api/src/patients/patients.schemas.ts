import { z } from 'zod';
import { todayInManila } from '../common/manila.js';
import { Sex } from '../generated/prisma/client.js';

const name = z.string().trim().min(1).max(100);
const optionalText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();
export const PHONE_REGEX = /^\+?[0-9][0-9 ()-]{5,28}$/;
const phone = z
  .string()
  .trim()
  .regex(PHONE_REGEX, 'Invalid phone number')
  .nullable()
  .optional();

const patientFields = {
  firstName: name,
  middleName: optionalText(100),
  lastName: name,
  suffix: optionalText(20),
  // Dates stay as 'YYYY-MM-DD' strings, so comparing them as text compares them as dates.
  // "Today" means today in the Philippines: the server's clock is usually UTC, which would
  // refuse a baby registered before 8 AM Manila time.
  birthDate: z.iso
    .date()
    .refine((date) => date >= '1900-01-01', 'Birth date is too far in the past')
    .refine((date) => date <= todayInManila(), 'Birth date is in the future'),
  sex: z.enum(Sex).nullable().optional(),
  phone,
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)).nullable().optional(),
  address: optionalText(500),
  emergencyContactName: optionalText(200),
  emergencyContactPhone: phone,
  // Staff tick this; the server records when. Nobody can send their own timestamp.
  privacyConsent: z.boolean().optional(),
};

// Strict objects refuse unknown fields. Without this, someone could try sending their own
// clinicId or archivedAt and hope it gets saved.
export const createPatientSchema = z.strictObject(patientFields);

// In an update, a missing field means "leave it alone", and null means "clear it".
export const updatePatientSchema = z
  .strictObject(patientFields)
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Send at least one field to change');

export const listPatientsSchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  // ?archived=true lists archived patients instead, so an admin can find one to restore.
  // stringbool turns the text "true" or "false" into a real boolean.
  archived: z.stringbool().optional(),
  // Query strings are always text, so coerce turns "2" into 2.
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  // Sorting is chosen from a fixed list, never a column name from the request.
  sort: z.enum(['name', 'nextAppointment', 'lastVisit']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});

export const patientIdSchema = z.uuid();

export type CreatePatientInput = z.infer<typeof createPatientSchema>;
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;
export type ListPatientsQuery = z.infer<typeof listPatientsSchema>;
