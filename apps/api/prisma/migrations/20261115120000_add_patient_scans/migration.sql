-- CreateEnum
CREATE TYPE "ScanFormat" AS ENUM ('STL', 'PLY', 'OBJ');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SCAN_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'SCAN_VIEWED';
ALTER TYPE "AuditAction" ADD VALUE 'SCAN_WITHDRAWN';

-- CreateTable
CREATE TABLE "patient_scans" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "note" VARCHAR(500),
    "format" "ScanFormat" NOT NULL,
    "file_name" VARCHAR(200) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(64) NOT NULL,
    "scanned_on" DATE NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdrawn_by_id" UUID,
    "withdraw_reason" VARCHAR(500),

    CONSTRAINT "patient_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_scans_storage_key_key" ON "patient_scans"("storage_key");

-- CreateIndex
CREATE INDEX "patient_scans_patient_id_scanned_on_created_at_idx" ON "patient_scans"("patient_id", "scanned_on" DESC, "created_at" DESC);

-- AddForeignKey
ALTER TABLE "patient_scans" ADD CONSTRAINT "patient_scans_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_scans" ADD CONSTRAINT "patient_scans_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_scans" ADD CONSTRAINT "patient_scans_withdrawn_by_id_fkey" FOREIGN KEY ("withdrawn_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ---------------------------------------------------------------------------
-- Rules Prisma can't express, so they're written by hand.
-- ---------------------------------------------------------------------------

ALTER TABLE "patient_scans" ADD CONSTRAINT "patient_scans_size_positive"
  CHECK (size_bytes > 0);

ALTER TABLE "patient_scans" ADD CONSTRAINT "patient_scans_title_not_blank"
  CHECK (btrim(title) <> '');

ALTER TABLE "patient_scans" ADD CONSTRAINT "patient_scans_sha256_hex"
  CHECK (sha256 ~ '^[0-9a-f]{64}$');

-- A withdrawn scan has when, who and why; a scan still in use has none of them.
ALTER TABLE "patient_scans" ADD CONSTRAINT "patient_scans_withdrawn_all_or_nothing"
  CHECK (
    (withdrawn_at IS NULL) = (withdrawn_by_id IS NULL)
    AND (withdrawn_at IS NULL) = (withdraw_reason IS NULL)
  );

-- Written in pen, like the chart: the API can add scans and read them, never delete one or
-- edit what it says. The only change allowed is withdrawing a scan (those three columns).
REVOKE UPDATE, DELETE ON "patient_scans" FROM dental_app;
GRANT UPDATE (withdrawn_at, withdrawn_by_id, withdraw_reason) ON "patient_scans" TO dental_app;
