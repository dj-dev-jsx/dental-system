-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_LISTED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_DECLINED';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_CANCELLED';

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "dentist_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" VARCHAR(500),
    "status_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_clinic_id_starts_at_idx" ON "appointments"("clinic_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_patient_id_starts_at_idx" ON "appointments"("clinic_id", "patient_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_status_starts_at_idx" ON "appointments"("clinic_id", "status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_clinic_id_id_key" ON "appointments"("clinic_id", "id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_patient_id_fkey" FOREIGN KEY ("clinic_id", "patient_id") REFERENCES "patients"("clinic_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_dentist_id_fkey" FOREIGN KEY ("clinic_id", "dentist_id") REFERENCES "users"("clinic_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Rules Prisma can't express, so they're written by hand.
-- ---------------------------------------------------------------------------

-- An appointment ends after it starts, and only a request may leave the dentist open.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_ends_after_start"
  CHECK (ends_at > starts_at);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_confirmed_has_dentist"
  CHECK (status <> 'CONFIRMED' OR dentist_id IS NOT NULL);

-- No double booking. An exclusion constraint is like a unique constraint, but instead of
-- "no two rows are equal" it says "no two rows have the same dentist AND overlapping
-- times". tstzrange(starts_at, ends_at) is the time span from start to end; && means
-- "overlaps". The '[)' makes the end exclusive, so 9:00-9:30 and 9:30-10:00 can both be
-- booked. Only confirmed appointments take up the dentist's time. MySQL has nothing like it.
-- btree_gist lets this kind of index compare plain values like dentist_id with =.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_double_booking"
  EXCLUDE USING gist (dentist_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status = 'CONFIRMED');

-- Same protection as the patient records: each clinic sees only its own appointments.
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON "appointments"
  USING (clinic_id = current_clinic_id())
  WITH CHECK (clinic_id = current_clinic_id());

-- Appointments are declined or cancelled, never deleted, so the history stays complete.
REVOKE DELETE ON "appointments" FROM dental_app;
