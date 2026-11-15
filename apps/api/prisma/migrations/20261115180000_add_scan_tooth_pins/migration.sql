-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SCAN_PINS_UPDATED';

-- CreateTable
CREATE TABLE "scan_tooth_pins" (
    "scan_id" UUID NOT NULL,
    "tooth" VARCHAR(2) NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "z" DOUBLE PRECISION NOT NULL,
    "placed_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scan_tooth_pins_pkey" PRIMARY KEY ("scan_id","tooth")
);

-- AddForeignKey
ALTER TABLE "scan_tooth_pins" ADD CONSTRAINT "scan_tooth_pins_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "patient_scans"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scan_tooth_pins" ADD CONSTRAINT "scan_tooth_pins_placed_by_id_fkey" FOREIGN KEY ("placed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ---------------------------------------------------------------------------
-- Rules Prisma can't express, so they're written by hand.
-- ---------------------------------------------------------------------------

-- An adult tooth's FDI number, like tooth_records.
ALTER TABLE "scan_tooth_pins" ADD CONSTRAINT "scan_tooth_pins_tooth_fdi"
  CHECK (tooth ~ '^[1-4][1-8]$');

-- A point somewhere real: no NaN or infinity.
ALTER TABLE "scan_tooth_pins" ADD CONSTRAINT "scan_tooth_pins_point_finite"
  CHECK (
    x NOT IN ('NaN', 'Infinity', '-Infinity')
    AND y NOT IN ('NaN', 'Infinity', '-Infinity')
    AND z NOT IN ('NaN', 'Infinity', '-Infinity')
  );

-- Pins are a labelling aid, not a medical record: the API may replace them freely. Who changed
-- them, and how, is in the audit log (SCAN_PINS_UPDATED).
GRANT SELECT, INSERT, UPDATE, DELETE ON "scan_tooth_pins" TO dental_app;
