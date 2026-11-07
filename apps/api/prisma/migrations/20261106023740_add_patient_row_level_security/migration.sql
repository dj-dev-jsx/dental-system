-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PATIENT_CREATED', 'PATIENT_LISTED', 'PATIENT_VIEWED', 'PATIENT_UPDATED', 'PATIENT_ARCHIVED');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_clinic_id_entity_id_created_at_idx" ON "audit_logs"("clinic_id", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_clinic_id_created_at_idx" ON "audit_logs"("clinic_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_clinic_id_actor_user_id_fkey" FOREIGN KEY ("clinic_id", "actor_user_id") REFERENCES "users"("clinic_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ---------------------------------------------------------------------------
-- Row-level security, added by hand because Prisma can't generate it.
--
-- MySQL has nothing like this. Think of it as PostgreSQL adding a hidden
-- "AND clinic_id = <current clinic>" to every query on these tables, so even a query
-- that forgets the filter can only touch one clinic's rows.
-- ---------------------------------------------------------------------------

-- The clinic the current transaction is acting for. The API sets it for each request
-- (PrismaService.forClinic). Once set on a connection, an unset value reads back as an
-- empty string instead of NULL, and ''::uuid would be an error, hence the NULLIF.
-- If nothing is set this returns NULL, and clinic_id = NULL matches no rows at all.
CREATE FUNCTION current_clinic_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.clinic_id', true), '')::uuid $$;

ALTER TABLE "patients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "patients" FORCE ROW LEVEL SECURITY;
-- USING decides which existing rows can be seen or changed.
-- WITH CHECK decides what a row may look like after an INSERT or UPDATE, so a row can't
-- be created for another clinic or moved to one.
CREATE POLICY clinic_isolation ON "patients"
  USING (clinic_id = current_clinic_id())
  WITH CHECK (clinic_id = current_clinic_id());

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON "audit_logs"
  USING (clinic_id = current_clinic_id())
  WITH CHECK (clinic_id = current_clinic_id());

-- Patients are archived, never deleted, and the audit log can only grow. Taking away the
-- permission means the database enforces both, even if the code tries otherwise.
REVOKE DELETE ON "patients" FROM dental_app;
REVOKE UPDATE, DELETE ON "audit_logs" FROM dental_app;
