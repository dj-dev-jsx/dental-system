import { PrismaPg } from '@prisma/adapter-pg';
import { type Prisma, PrismaClient } from '../src/generated/prisma/client.js';

/**
 * A connection as the database owner, which the REVOKEd permissions don't apply to. Tests use
 * it to set up data and to clean up. The API itself never connects this way.
 */
export function ownerClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['TEST_MIGRATION_DATABASE_URL'] }),
  });
}

/**
 * Empties every table and puts back the clinic's settings row (with `settings` applied), which
 * the app expects to always exist. It refuses to run on anything but a *_test database.
 */
export async function resetDatabase(
  owner: PrismaClient,
  settings: Partial<Prisma.ClinicSettingsCreateInput> = {},
) {
  const [{ name }] = await owner.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!name.endsWith('_test')) throw new Error(`Refusing to empty database ${name}`);
  await owner.$executeRaw`TRUNCATE clinic_settings, users, sessions, patients, audit_logs, appointments,
    patient_accounts, patient_sessions, patient_tokens, tooth_records`;
  await owner.clinicSettings.create({ data: { name: 'Sample Dental Clinic', ...settings, id: 1 } });
}
