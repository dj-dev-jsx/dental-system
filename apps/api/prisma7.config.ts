import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations change tables, so they use the owner login, not the API's limited one.
    url: process.env['MIGRATION_DATABASE_URL'],
  },
});
