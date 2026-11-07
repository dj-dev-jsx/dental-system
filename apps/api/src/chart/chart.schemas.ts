import { z } from 'zod';
import { ToothCondition, ToothSurface } from '../generated/prisma/client.js';

// An adult tooth's FDI number: quadrant 1 to 4, then position 1 to 8 counted from the middle.
const tooth = z.string().regex(/^[1-4][1-8]$/, 'Choose an adult tooth, 11 to 48');
const note = z.string().trim().min(1).max(1000).nullable().optional();
// Each surface once, in a fixed order, however they were sent.
const surfaces = z
  .array(z.enum(ToothSurface))
  .max(5)
  .default([])
  .transform((list) => Object.values(ToothSurface).filter((surface) => list.includes(surface)));

const SURFACE_CONDITIONS: (ToothCondition | null)[] = ['DECAYED', 'FILLED'];
const surfacesMakeSense = (input: { condition: ToothCondition | null; surfaces: ToothSurface[] }) =>
  input.surfaces.length === 0 || SURFACE_CONDITIONS.includes(input.condition);
const surfacesMessage = { message: 'Surfaces are only for decay and fillings', path: ['surfaces'] };

/** A new finding on one tooth. */
export const recordToothSchema = z
  .strictObject({
    tooth,
    condition: z.enum(ToothCondition),
    surfaces,
    note,
    // The visit it was found in. Must be one of this patient's appointments.
    appointmentId: z.uuid().optional(),
  })
  .refine(surfacesMakeSense, surfacesMessage);

/**
 * Fixes a wrong entry. The tooth and date come from the entry being corrected; a null
 * condition withdraws it with nothing in its place, such as when it was put on the wrong tooth.
 */
export const correctToothSchema = z
  .strictObject({
    condition: z.enum(ToothCondition).nullable(),
    surfaces,
    note,
    reason: z.string().trim().min(1).max(500),
  })
  .refine(surfacesMakeSense, surfacesMessage);

export const idSchema = z.uuid();

export type RecordToothInput = z.infer<typeof recordToothSchema>;
export type CorrectToothInput = z.infer<typeof correctToothSchema>;
