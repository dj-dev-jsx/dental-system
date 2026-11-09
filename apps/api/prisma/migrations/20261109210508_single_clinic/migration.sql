-- ---------------------------------------------------------------------------
-- One clinic only. The system now serves a single clinic, Sample Dental Clinic, so the
-- database stops modelling clinics: the clinics table becomes one settings row, every
-- clinic_id column goes, and so do row-level security and the two-column foreign keys
-- that kept clinics apart. The append-only rules (REVOKEd UPDATE/DELETE) stay.
--
-- The order matters, which is why this is written by hand rather than taken straight from
-- prisma migrate diff: the settings are copied and other clinics' rows removed before the
-- columns that say which clinic a row belongs to are dropped.
-- ---------------------------------------------------------------------------

-- 1. Row-level security off. Policies refer to clinic_id, so they must go before the column.
DROP POLICY IF EXISTS clinic_isolation ON "patients";
DROP POLICY IF EXISTS clinic_isolation ON "audit_logs";
DROP POLICY IF EXISTS clinic_isolation ON "appointments";
DROP POLICY IF EXISTS clinic_isolation ON "tooth_records";
DROP POLICY IF EXISTS clinic_isolation ON "patient_accounts";
DROP POLICY IF EXISTS clinic_isolation ON "patient_sessions";
DROP POLICY IF EXISTS clinic_isolation ON "patient_tokens";
ALTER TABLE "patients" NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
ALTER TABLE "appointments" NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
ALTER TABLE "tooth_records" NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_accounts" NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_sessions" NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
ALTER TABLE "patient_tokens" NO FORCE ROW LEVEL SECURITY, DISABLE ROW LEVEL SECURITY;
DROP FUNCTION IF EXISTS current_clinic_id();

-- 2. The clinic's details become the single settings row, copied from the clinic kept below.
-- id is always 1 (a check further down), so a second row can never exist.
CREATE TABLE "clinic_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" VARCHAR(200) NOT NULL,
    "address" VARCHAR(500),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "opens_at" INTEGER NOT NULL DEFAULT 420,
    "closes_at" INTEGER NOT NULL DEFAULT 1200,
    "default_visit_minutes" INTEGER NOT NULL DEFAULT 30,
    "online_booking_enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clinic_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "clinic_settings"
  ("id", "name", "address", "phone", "email", "opens_at", "closes_at", "default_visit_minutes", "online_booking_enabled", "updated_at")
SELECT 1, 'Sample Dental Clinic', address, phone, email, opens_at, closes_at, default_visit_minutes, online_booking_enabled, CURRENT_TIMESTAMP
FROM "clinics" WHERE id = '00000000-0000-7000-8000-00000000000a';
-- A database without that clinic (a fresh one) still gets its row.
INSERT INTO "clinic_settings" ("id", "name", "updated_at")
VALUES (1, 'Sample Dental Clinic', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 3. Keep only the first clinic's data (development data is all made up). Children first, so
-- no foreign key is left pointing at a removed row. This runs as the migration's owner login,
-- so the REVOKEd DELETEs don't apply here; the API's login still can't delete these rows.
DELETE FROM "tooth_records"    WHERE clinic_id <> '00000000-0000-7000-8000-00000000000a';
DELETE FROM "audit_logs"       WHERE clinic_id <> '00000000-0000-7000-8000-00000000000a';
DELETE FROM "appointments"     WHERE clinic_id <> '00000000-0000-7000-8000-00000000000a';
DELETE FROM "patient_tokens"   WHERE clinic_id <> '00000000-0000-7000-8000-00000000000a';
DELETE FROM "patient_sessions" WHERE clinic_id <> '00000000-0000-7000-8000-00000000000a';
DELETE FROM "patient_accounts" WHERE clinic_id <> '00000000-0000-7000-8000-00000000000a';
DELETE FROM "sessions" WHERE user_id IN
  (SELECT id FROM "users" WHERE clinic_id <> '00000000-0000-7000-8000-00000000000a');
DELETE FROM "patients"         WHERE clinic_id <> '00000000-0000-7000-8000-00000000000a';
DELETE FROM "users"            WHERE clinic_id <> '00000000-0000-7000-8000-00000000000a';

-- The development logins move to the clinic's own address, so they keep working without
-- seeding again. Only these exact seeded addresses change.
UPDATE "users" SET email = replace(email, '@clinic-a.example', '@clinic.example')
WHERE email IN ('admin@clinic-a.example', 'dentist@clinic-a.example', 'dentist2@clinic-a.example', 'reception@clinic-a.example');
UPDATE "patient_accounts" SET email = replace(email, '@clinic-a.example', '@clinic.example')
WHERE email IN ('maria.patient@clinic-a.example', 'new.patient@clinic-a.example');

-- 4. From here on, what prisma migrate diff produces, minus the clinics table it would create
-- the settings from (created above, dropped at the end).

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clinic_id_dentist_id_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clinic_id_patient_account_id_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_clinic_id_patient_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_clinic_id_actor_patient_account_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_clinic_id_actor_user_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "patient_accounts" DROP CONSTRAINT "patient_accounts_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "patient_accounts" DROP CONSTRAINT "patient_accounts_clinic_id_linked_by_id_fkey";

-- DropForeignKey
ALTER TABLE "patient_accounts" DROP CONSTRAINT "patient_accounts_clinic_id_patient_id_fkey";

-- DropForeignKey
ALTER TABLE "patient_sessions" DROP CONSTRAINT "patient_sessions_clinic_id_account_id_fkey";

-- DropForeignKey
ALTER TABLE "patient_sessions" DROP CONSTRAINT "patient_sessions_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "patient_tokens" DROP CONSTRAINT "patient_tokens_clinic_id_account_id_fkey";

-- DropForeignKey
ALTER TABLE "patient_tokens" DROP CONSTRAINT "patient_tokens_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "patients" DROP CONSTRAINT "patients_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "tooth_records" DROP CONSTRAINT "tooth_records_clinic_id_fkey";

-- DropForeignKey
ALTER TABLE "tooth_records" DROP CONSTRAINT "tooth_records_clinic_id_patient_id_appointment_id_fkey";

-- DropForeignKey
ALTER TABLE "tooth_records" DROP CONSTRAINT "tooth_records_clinic_id_patient_id_fkey";

-- DropForeignKey
ALTER TABLE "tooth_records" DROP CONSTRAINT "tooth_records_clinic_id_patient_id_tooth_corrects_id_fkey";

-- DropForeignKey
ALTER TABLE "tooth_records" DROP CONSTRAINT "tooth_records_clinic_id_recorded_by_id_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_clinic_id_fkey";

-- DropIndex
DROP INDEX "appointments_clinic_id_id_key";

-- DropIndex
DROP INDEX "appointments_clinic_id_patient_account_id_starts_at_idx";

-- DropIndex
DROP INDEX "appointments_clinic_id_patient_id_id_key";

-- DropIndex
DROP INDEX "appointments_clinic_id_patient_id_starts_at_idx";

-- DropIndex
DROP INDEX "appointments_clinic_id_starts_at_idx";

-- DropIndex
DROP INDEX "appointments_clinic_id_status_starts_at_idx";

-- DropIndex
DROP INDEX "audit_logs_clinic_id_created_at_idx";

-- DropIndex
DROP INDEX "audit_logs_clinic_id_entity_id_created_at_idx";

-- DropIndex
DROP INDEX "patient_accounts_clinic_id_email_key";

-- DropIndex
DROP INDEX "patient_accounts_clinic_id_id_key";

-- DropIndex
DROP INDEX "patient_accounts_clinic_id_patient_id_key";

-- DropIndex
DROP INDEX "patient_sessions_clinic_id_account_id_idx";

-- DropIndex
DROP INDEX "patient_tokens_clinic_id_account_id_idx";

-- DropIndex
DROP INDEX "patients_clinic_id_id_key";

-- DropIndex
DROP INDEX "patients_clinic_id_last_name_first_name_idx";

-- DropIndex
DROP INDEX "tooth_records_clinic_id_id_key";

-- DropIndex
DROP INDEX "tooth_records_clinic_id_patient_id_tooth_corrects_id_key";

-- DropIndex
DROP INDEX "tooth_records_clinic_id_patient_id_tooth_id_key";

-- DropIndex
DROP INDEX "tooth_records_clinic_id_patient_id_tooth_recorded_at_idx";

-- DropIndex
DROP INDEX "users_clinic_id_id_key";

-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "clinic_id";

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "clinic_id";

-- AlterTable
ALTER TABLE "patient_accounts" DROP COLUMN "clinic_id";

-- AlterTable
ALTER TABLE "patient_sessions" DROP COLUMN "clinic_id";

-- AlterTable
ALTER TABLE "patient_tokens" DROP COLUMN "clinic_id";

-- AlterTable
ALTER TABLE "patients" DROP COLUMN "clinic_id";

-- AlterTable
ALTER TABLE "tooth_records" DROP COLUMN "clinic_id";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "clinic_id";


-- CreateIndex
CREATE INDEX "appointments_starts_at_idx" ON "appointments"("starts_at");

-- CreateIndex
CREATE INDEX "appointments_patient_id_starts_at_idx" ON "appointments"("patient_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_status_starts_at_idx" ON "appointments"("status", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_patient_account_id_starts_at_idx" ON "appointments"("patient_account_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_patient_id_id_key" ON "appointments"("patient_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_id_created_at_idx" ON "audit_logs"("entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "patient_accounts_email_key" ON "patient_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "patient_accounts_patient_id_key" ON "patient_accounts"("patient_id");

-- CreateIndex
CREATE INDEX "patient_sessions_account_id_idx" ON "patient_sessions"("account_id");

-- CreateIndex
CREATE INDEX "patient_tokens_account_id_idx" ON "patient_tokens"("account_id");

-- CreateIndex
CREATE INDEX "patients_last_name_first_name_idx" ON "patients"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "tooth_records_patient_id_tooth_recorded_at_idx" ON "tooth_records"("patient_id", "tooth", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "tooth_records_patient_id_tooth_id_key" ON "tooth_records"("patient_id", "tooth", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tooth_records_patient_id_tooth_corrects_id_key" ON "tooth_records"("patient_id", "tooth", "corrects_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_patient_account_id_fkey" FOREIGN KEY ("actor_patient_account_id") REFERENCES "patient_accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_account_id_fkey" FOREIGN KEY ("patient_account_id") REFERENCES "patient_accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_accounts" ADD CONSTRAINT "patient_accounts_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_sessions" ADD CONSTRAINT "patient_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "patient_accounts"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "patient_tokens" ADD CONSTRAINT "patient_tokens_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "patient_accounts"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_patient_id_appointment_id_fkey" FOREIGN KEY ("patient_id", "appointment_id") REFERENCES "appointments"("patient_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tooth_records" ADD CONSTRAINT "tooth_records_patient_id_tooth_corrects_id_fkey" FOREIGN KEY ("patient_id", "tooth", "corrects_id") REFERENCES "tooth_records"("patient_id", "tooth", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- DropTable (after the foreign keys to it are gone)
DROP TABLE "clinics";

-- ---------------------------------------------------------------------------
-- Rules Prisma can't express, so they're written by hand.
-- ---------------------------------------------------------------------------

-- Only one settings row can ever exist, and its hours and visit length must make sense
-- (the same checks the clinics table had).
ALTER TABLE "clinic_settings" ADD CONSTRAINT "clinic_settings_single_row" CHECK (id = 1);
ALTER TABLE "clinic_settings" ADD CONSTRAINT "clinic_settings_hours_make_sense"
  CHECK (opens_at >= 0 AND closes_at <= 1440 AND opens_at < closes_at);
ALTER TABLE "clinic_settings" ADD CONSTRAINT "clinic_settings_visit_length_makes_sense"
  CHECK (default_visit_minutes BETWEEN 5 AND 480);

-- The API's login reads and changes the settings but can never remove the row. The default
-- privileges from docker/postgres-init already grant row access; this states it outright.
GRANT SELECT, INSERT, UPDATE ON "clinic_settings" TO dental_app;
REVOKE DELETE ON "clinic_settings" FROM dental_app;

-- The appointments_no_double_booking exclusion constraint never included clinic_id (dentist
-- ids are unique on their own), so it is unchanged: two CONFIRMED appointments for the same
-- dentist still can't overlap. The REVOKEs on patients, audit_logs, appointments,
-- tooth_records, patient_accounts and patient_tokens are unchanged too.
