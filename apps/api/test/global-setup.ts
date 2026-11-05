import { execSync } from 'node:child_process';
import 'dotenv/config';

// Runs once before the end-to-end tests: brings the test database up to date.
export default function setup() {
  const url = process.env['TEST_MIGRATION_DATABASE_URL'];
  if (!url?.includes('_test')) {
    throw new Error('TEST_MIGRATION_DATABASE_URL must point to a *_test database');
  }
  execSync('pnpm exec prisma migrate deploy', {
    env: { ...process.env, MIGRATION_DATABASE_URL: url },
    stdio: 'pipe',
  });
}
