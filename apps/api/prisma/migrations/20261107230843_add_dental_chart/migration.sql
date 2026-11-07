-- CreateEnum
CREATE TYPE "ToothCondition" AS ENUM ('HEALTHY', 'DECAYED', 'FILLED', 'CROWN', 'ROOT_CANAL', 'IMPLANT', 'MISSING', 'EXTRACTED');

-- CreateEnum
CREATE TYPE "ToothSurface" AS ENUM ('MESIAL', 'DISTAL', 'OCCLUSAL', 'BUCCAL', 'LINGUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CHART_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'TOOTH_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'TOOTH_CORRECTED';

-- CreateTable
CREATE TABLE "tooth_records" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "tooth" VARCHAR(2) NOT NULL,
    "condition" "ToothCondition",
    "surfaces" "ToothSurface"[],
    "note" VARCHAR(1000),
    "recorded_by_id" UUID NOT NULL,
    "appointment_id" UUID,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "corrects_id" UUID,
    "correction_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tooth_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tooth_records_corrects_id_key" ON "tooth_records"("corrects_id");

-- CreateIndex
CREATE INDEX "tooth_records_clinic_id_patient_id_tooth_recorded_at_idx" ON "tooth_records"("clinic_id", "patient_id", "tooth", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "tooth_records_clinic_id_id_key" ON "tooth_records"("clinic_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tooth_records_clinic_id_patient_id_tooth_id_key" ON "tooth_records"("clinic_id", "patient_id", "tooth", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tooth_records_clinic_id_patient_id_tooth_corrects_id_key" ON "tooth_records"("clinic_id", "patient_id", "tooth", "corrects_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_clinic_id_patient_id_id_key" ON "appointments"("clinic_id", "patient_id", "id");

-- AddForeignKey
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_clinic_id_patient_id_fkey" FOREIGN KEY ("clinic_id", "patient_id") REFERENCES "patients"("clinic_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_clinic_id_recorded_by_id_fkey" FOREIGN KEY ("clinic_id", "recorded_by_id") REFERENCES "users"("clinic_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_clinic_id_patient_id_appointment_id_fkey" FOREIGN KEY ("clinic_id", "patient_id", "appointment_id") REFERENCES "appointments"("clinic_id", "patient_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_clinic_id_patient_id_tooth_corrects_id_fkey" FOREIGN KEY ("clinic_id", "patient_id", "tooth", "corrects_id") REFERENCES "tooth_records"("clinic_id", "patient_id", "tooth", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ---------------------------------------------------------------------------
-- Rules Prisma can't express, so they're written by hand.
-- ---------------------------------------------------------------------------

-- An adult tooth's FDI number: quadrant 1 to 4, then position 1 to 8.
-- Widen this when baby teeth (51 to 85) are added.
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_adult_fdi_number"
  CHECK (tooth ~ '^[1-4][1-8]$');

-- A correction always says why, and only a correction may say why.
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_correction_has_reason"
  CHECK ((corrects_id IS NULL) = (correction_reason IS NULL));

-- Only a correction may leave the condition empty: it withdraws the wrong entry.
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_condition_unless_withdrawn"
  CHECK (condition IS NOT NULL OR corrects_id IS NOT NULL);

-- An entry can't correct itself.
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_not_self_correcting"
  CHECK (corrects_id IS DISTINCT FROM id);

-- Surfaces only mean something for decay and fillings.
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_surfaces_for_decay_or_filling"
  CHECK (cardinality(coalesce(surfaces, '{}')) = 0 OR condition IN ('DECAYED', 'FILLED'));

-- Same protection as the other patient records: each clinic sees only its own.
ALTER TABLE "tooth_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tooth_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON "tooth_records"
  USING (clinic_id = current_clinic_id())
  WITH CHECK (clinic_id = current_clinic_id());

-- The chart is written in pen: the API can add entries, never change or remove them.
REVOKE UPDATE, DELETE ON "tooth_records" FROM dental_app;
