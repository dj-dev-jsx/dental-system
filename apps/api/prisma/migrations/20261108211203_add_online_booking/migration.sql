-- CreateEnum
CREATE TYPE "PatientTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_ACCOUNT_REGISTERED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_EMAIL_VERIFIED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_LOGIN_SUCCEEDED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_LOGIN_FAILED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_LOGOUT';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_PASSWORD_RESET';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_REQUESTED_ONLINE';
ALTER TYPE "AuditAction" ADD VALUE 'APPOINTMENT_CANCELLED_BY_PATIENT';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_ACCOUNT_LINKED';
ALTER TYPE "AuditAction" ADD VALUE 'PATIENT_ACCOUNT_UNLINKED';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "patient_account_id" UUID,
ALTER COLUMN "patient_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_patient_account_id" UUID,
ALTER COLUMN "actor_user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "online_booking_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slug" VARCHAR(60);

-- CreateTable
CREATE TABLE "patient_accounts" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "birth_date" DATE NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "privacy_consent_at" TIMESTAMPTZ(3) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "patient_id" UUID,
    "linked_at" TIMESTAMPTZ(3),
    "linked_by_id" UUID,
    "pending_request" JSONB,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patient_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "account_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_tokens" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "purpose" "PatientTokenPurpose" NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_accounts_clinic_id_id_key" ON "patient_accounts"("clinic_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_accounts_clinic_id_email_key" ON "patient_accounts"("clinic_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "patient_accounts_clinic_id_patient_id_key" ON "patient_accounts"("clinic_id", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_sessions_token_hash_key" ON "patient_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "patient_sessions_clinic_id_account_id_idx" ON "patient_sessions"("clinic_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "patient_tokens_token_hash_key" ON "patient_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "patient_tokens_clinic_id_account_id_idx" ON "patient_tokens"("clinic_id", "account_id");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_patient_account_id_starts_at_idx" ON "appointments"("clinic_id", "patient_account_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_slug_key" ON "clinics"("slug");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_clinic_id_actor_patient_account_id_fkey" FOREIGN KEY ("clinic_id", "actor_patient_account_id") REFERENCES "patient_accounts"("clinic_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_patient_account_id_fkey" FOREIGN KEY ("clinic_id", "patient_account_id") REFERENCES "patient_accounts"("clinic_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_clinic_id_patient_id_fkey" FOREIGN KEY ("clinic_id", "patient_id") REFERENCES "patients"("clinic_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_clinic_id_linked_by_id_fkey" FOREIGN KEY ("clinic_id", "linked_by_id") REFERENCES "users"("clinic_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_sessions" ADD CONSTRAINT "patient_sessions_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_sessions" ADD CONSTRAINT "patient_sessions_clinic_id_account_id_fkey" FOREIGN KEY ("clinic_id", "account_id") REFERENCES "patient_accounts"("clinic_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_tokens" ADD CONSTRAINT "patient_tokens_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_tokens" ADD CONSTRAINT "patient_tokens_clinic_id_account_id_fkey" FOREIGN KEY ("clinic_id", "account_id") REFERENCES "patient_accounts"("clinic_id", "id") ON DELETE CASCADE ON UPDATE RESTRICT;



-- ---------------------------------------------------------------------------
-- Rules Prisma can't express, so they're written by hand.
-- ---------------------------------------------------------------------------

-- The booking address: lowercase letters and digits, words joined by single dashes, like
-- "sample-clinic-a". Booking can only be switched on once the clinic has one.
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_slug_format"
  CHECK (slug IS NULL OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 60));
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_booking_needs_slug"
  CHECK (NOT online_booking_enabled OR slug IS NOT NULL);

-- Emails are stored lowercase, so the unique rule can't be dodged with capital letters.
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_email_lowercase"
  CHECK (email = lower(email));
-- Linked means all three are filled in; unlinked means none are.
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_link_complete"
  CHECK ((patient_id IS NULL) = (linked_at IS NULL) AND (patient_id IS NULL) = (linked_by_id IS NULL));

-- An appointment belongs to a patient record. The one exception is an online request from an
-- account staff haven't linked yet: it can wait, be declined or be cancelled, but it can't be
-- confirmed until staff know which patient it is.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_has_patient_unless_online_request"
  CHECK (patient_id IS NOT NULL OR (patient_account_id IS NOT NULL AND status <> 'CONFIRMED'));

-- Every audit line names exactly one actor: a staff member or a patient account.
-- num_nonnulls counts how many of its arguments are not NULL.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_one_actor"
  CHECK (num_nonnulls(actor_user_id, actor_patient_account_id) = 1);

-- Same protection as the other clinic tables: each clinic sees only its own rows. The API
-- finds the clinic from the booking address (/clinic/<slug>) before it touches these.
ALTER TABLE "patient_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON "patient_accounts"
  USING (clinic_id = current_clinic_id())
  WITH CHECK (clinic_id = current_clinic_id());

ALTER TABLE "patient_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_sessions" FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON "patient_sessions"
  USING (clinic_id = current_clinic_id())
  WITH CHECK (clinic_id = current_clinic_id());

ALTER TABLE "patient_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON "patient_tokens"
  USING (clinic_id = current_clinic_id())
  WITH CHECK (clinic_id = current_clinic_id());

-- The API's login gets row access to the new tables through the default privileges set up in
-- docker/postgres-init. Accounts hold the patient's consent date and the audit log points at
-- them, so they are never deleted. Sessions may be (logging out deletes one). A used link is
-- marked used_at rather than deleted, so its row stays as a record.
REVOKE DELETE ON "patient_accounts" FROM dental_app;
REVOKE DELETE ON "patient_tokens" FROM dental_app;
