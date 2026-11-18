import { z } from 'zod';
import { todayInManila } from '../common/manila.js';

export const idSchema = z.uuid();

/** The text fields sent alongside the file (a multipart form sends everything as text). */
export const uploadScanSchema = z.strictObject({
  title: z.string().trim().min(1).max(100),
  note: z
    .string()
    .trim()
    .max(500)
    .transform((text) => text || null)
    .optional(),
  // The day the patient was scanned, Philippine time. Today when left out.
  scannedOn: z.iso
    .date()
    .refine((day) => day <= todayInManila(), 'The scan date can’t be in the future')
    .optional(),
});

export const withdrawScanSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500),
});

export type UploadScanInput = z.infer<typeof uploadScanSchema>;
export type WithdrawScanInput = z.infer<typeof withdrawScanSchema>;

/** The tooth pins on a scan: the whole set, replacing what was there. */
export const setPinsSchema = z.strictObject({
  pins: z
    .array(
      z.strictObject({
        // An adult tooth's FDI number, like the chart.
        tooth: z.string().regex(/^[1-4][1-8]$/, 'Choose an adult tooth, 11 to 48'),
        // A point in the scan file's own coordinates. JSON can't send NaN, but this says so anyway.
        x: z.number(),
        y: z.number(),
        z: z.number(),
        // Where the crown meets the gum on the cheek side, when the automatic check found it.
        neck: z.strictObject({ x: z.number(), y: z.number(), z: z.number() }).nullable().optional(),
      }),
    )
    .max(32)
    .refine((pins) => new Set(pins.map((p) => p.tooth)).size === pins.length, 'Each tooth can be marked once'),
});

export type SetPinsInput = z.infer<typeof setPinsSchema>;

/** How a scan is shown when it opens. The whole set, replacing what was there. */
export const viewSettingsSchema = z.strictObject({
  view: z.enum(['SCAN_ONLY', 'IN_SKULL']),
  hideGums: z.boolean(),
  gumMethod: z.enum(['COLOUR', 'PINS']).nullable(),
  // mm below each tooth's pin; a crown is about 7 to 11 mm tall.
  gumLineMm: z.number().min(0).max(12).nullable(),
  colourSensitivity: z.number().min(0).max(100).nullable(),
});

export type ViewSettingsInput = z.infer<typeof viewSettingsSchema>;
