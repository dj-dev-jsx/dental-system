// Fills the development database with FAKE clinics and staff. Never run this on real data.
//   pnpm --filter api db:seed
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.js';
import { PrismaClient, type UserRole } from '../src/generated/prisma/client.js';

const password = process.env['SEED_PASSWORD'];
if (!password) throw new Error('Set SEED_PASSWORD in apps/api/.env');
if (process.env['NODE_ENV'] === 'production') throw new Error('Refusing to seed production');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const staff: [emailName: string, firstName: string, lastName: string, role: UserRole][] = [
  ['admin', 'Ana', 'Reyes', 'ADMIN'],
  ['dentist', 'Jose', 'Santos', 'DENTIST'],
  ['reception', 'Liza', 'Cruz', 'RECEPTIONIST'],
];

async function seedClinic(id: string, name: string, emailDomain: string) {
  await prisma.clinic.upsert({ where: { id }, update: {}, create: { id, name } });
  const passwordHash = await hashPassword(password!);
  for (const [emailName, firstName, lastName, role] of staff) {
    const email = `${emailName}@${emailDomain}`;
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { clinicId: id, email, passwordHash, firstName, lastName, role },
    });
  }
}

// Fixed ids, so running the seed twice updates these rows instead of adding more.
// Two clinics, so we can later prove one can't see the other's data.
await seedClinic('00000000-0000-7000-8000-00000000000a', 'Sample Dental Clinic A', 'clinic-a.example');
await seedClinic('00000000-0000-7000-8000-00000000000b', 'Sample Dental Clinic B', 'clinic-b.example');
await prisma.$disconnect();
console.log('Seeded 2 fake clinics, each with an admin, a dentist and a receptionist.');
