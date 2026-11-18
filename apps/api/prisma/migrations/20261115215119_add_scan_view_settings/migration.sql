-- CreateEnum
CREATE TYPE "ScanView" AS ENUM ('SCAN_ONLY', 'IN_SKULL');

-- CreateEnum
CREATE TYPE "GumMethod" AS ENUM ('COLOUR', 'PINS');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SCAN_VIEW_SETTINGS_UPDATED';

-- CreateTable
CREATE TABLE "scan_view_settings" (
    "scan_id" UUID NOT NULL,
    "view" "ScanView" NOT NULL DEFAULT 'SCAN_ONLY',
    "hide_gums" BOOLEAN NOT NULL DEFAULT false,
    "gum_method" "GumMethod",
    "gum_line_mm" REAL,
    "colour_sensitivity" REAL,
    "updated_by_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scan_view_settings_pkey" PRIMARY KEY ("scan_id")
);

-- AddForeignKey
ALTER TABLE "scan_view_settings" ADD CONSTRAINT "scan_view_settings_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "patient_scans"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scan_view_settings" ADD CONSTRAINT "scan_view_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;




-- ---------------------------------------------------------------------------
-- Rules Prisma can't express, so they're written by hand.
-- ---------------------------------------------------------------------------

-- The gum line sits 0 to 12 mm below each tooth's pin (a crown is about 7 to 11 mm tall).
ALTER TABLE "scan_view_settings" ADD CONSTRAINT "scan_view_settings_gum_line_range"
  CHECK (gum_line_mm IS NULL OR (gum_line_mm >= 0 AND gum_line_mm <= 12));

ALTER TABLE "scan_view_settings" ADD CONSTRAINT "scan_view_settings_colour_sensitivity_range"
  CHECK (colour_sensitivity IS NULL OR (colour_sensitivity >= 0 AND colour_sensitivity <= 100));

-- How a scan is shown is a display preference, not a medical record: the API may change it
-- freely (never delete it). Who changed it, and to what, is in the audit log.
GRANT SELECT, INSERT, UPDATE ON "scan_view_settings" TO dental_app;
