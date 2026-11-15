// Empties the DEVELOPMENT database so `pnpm db:reset` can rebuild it from the migrations.
//   pnpm --filter api db:reset
//
// Why not `prisma migrate reset`: it drops the whole `public` schema, and with it the access
// the API's limited login (dental_app) was given when the database was first created
// (docker/postgres-init). The API then gets "permission denied for schema public".
// This recreates the schema and gives that access back before the migrations run.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

if (process.env['NODE_ENV'] === 'production') throw new Error('Refusing to reset production');
const url = process.env['MIGRATION_DATABASE_URL'];
if (!url) throw new Error('Set MIGRATION_DATABASE_URL in apps/api/.env');

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const [{ name }] = await owner.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
if (name.endsWith('_test')) throw new Error('This is for the development database; tests reset their own');

const statements = [
  'DROP SCHEMA IF EXISTS public CASCADE',
  'CREATE SCHEMA public',
  'GRANT USAGE ON SCHEMA public TO dental_app',
  // Tables the migrations create from now on: the API may read and write rows, not change structure.
  // The migrations then take back what they must (no UPDATE/DELETE on the audit log, chart, scans).
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dental_app',
  'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO dental_app',
];
for (const sql of statements) await owner.$executeRawUnsafe(sql);
await owner.$disconnect();
console.log(`Emptied ${name}. Next: migrations, then the fake data.`);
