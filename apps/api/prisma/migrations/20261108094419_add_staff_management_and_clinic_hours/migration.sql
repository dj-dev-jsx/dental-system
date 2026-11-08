-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'STAFF_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE 'STAFF_UNLOCKED';
ALTER TYPE "AuditAction" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'CLINIC_UPDATED';

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "closes_at" INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN     "default_visit_minutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "opens_at" INTEGER NOT NULL DEFAULT 420;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;


-- Rules Prisma can't express.
-- Opening hours are minutes in one day, opening before closing; visits last 5 minutes to 8 hours.
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_hours_make_sense"
  CHECK (opens_at >= 0 AND closes_at <= 1440 AND opens_at < closes_at);
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_visit_length_makes_sense"
  CHECK (default_visit_minutes BETWEEN 5 AND 480);
