import { z } from 'zod';
import { UserRole } from '../generated/prisma/client.js';

const name = z.string().trim().min(1).max(100);

export const createStaffSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  firstName: name,
  lastName: name,
  role: z.enum(UserRole),
});

export const updateStaffSchema = z
  .strictObject({
    firstName: name,
    lastName: name,
    role: z.enum(UserRole),
    isActive: z.boolean(),
  })
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Send at least one field to change');

// Every field is optional; strict so a typo in a parameter is an error, not silently ignored.
export const listStaffSchema = z.strictObject({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'deactivated', 'all']).default('all'),
  role: z.enum(UserRole).optional(),
  sort: z.enum(['name', 'role', 'lastSignInAt']).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
});

export const staffIdSchema = z.uuid();

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type ListStaffQuery = z.infer<typeof listStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
