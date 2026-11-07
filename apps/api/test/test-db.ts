import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * A connection as the database owner, which row-level security doesn't apply to. Tests use
 * it to set up both clinics' data and to clean up. The API itself never connects this way.
 */
export function ownerClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env['TEST_MIGRATION_DATABASE_URL'] }),
  });
}

/** Empties every table. It refuses to run on anything but a *_test database. */
export async function resetDatabase(owner: PrismaClient) {
  const [{ name }] = await owner.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!name.endsWith('_test')) throw new Error(`Refusing to empty database ${name}`);
  // Everything belongs to a clinic, so CASCADE empties the other tables too.
  await owner.$executeRaw`TRUNCATE clinics CASCADE`;
}
