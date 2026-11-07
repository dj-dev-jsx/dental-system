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

type FakePatient = { id: string; firstName: string; lastName: string; birthDate: string; phone: string };

async function seedPatients(clinicId: string, patients: FakePatient[]) {
  await prisma.$transaction(async (tx) => {
    // Row-level security refuses patient rows until we say which clinic we're acting for.
    await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, TRUE)`;
    for (const { birthDate, ...patient } of patients) {
      await tx.patient.upsert({
        where: { id: patient.id },
        update: {},
        create: { ...patient, clinicId, birthDate: new Date(birthDate) },
      });
    }
  });
}

// Fixed ids, so running the seed twice updates these rows instead of adding more.
// Two clinics, so we can prove one can't see the other's data.
const CLINIC_A = '00000000-0000-7000-8000-00000000000a';
const CLINIC_B = '00000000-0000-7000-8000-00000000000b';
await seedClinic(CLINIC_A, 'Sample Dental Clinic A', 'clinic-a.example');
await seedClinic(CLINIC_B, 'Sample Dental Clinic B', 'clinic-b.example');
await seedPatients(CLINIC_A, [
  { id: '00000000-0000-7000-8000-0000000a0001', firstName: 'Maria', lastName: 'Dela Cruz', birthDate: '1985-03-14', phone: '0900 000 0001' },
  { id: '00000000-0000-7000-8000-0000000a0002', firstName: 'Juan', lastName: 'Dela Cruz', birthDate: '1982-11-02', phone: '0900 000 0002' },
  { id: '00000000-0000-7000-8000-0000000a0003', firstName: 'Pedro', lastName: 'Penduko', birthDate: '2011-07-21', phone: '0900 000 0003' },
]);
await seedPatients(CLINIC_B, [
  { id: '00000000-0000-7000-8000-0000000b0001', firstName: 'Bea', lastName: 'Bautista', birthDate: '1990-01-30', phone: '0900 000 0004' },
  { id: '00000000-0000-7000-8000-0000000b0002', firstName: 'Carlo', lastName: 'Mendoza', birthDate: '1975-09-09', phone: '0900 000 0005' },
]);
await prisma.$disconnect();
console.log('Seeded 2 fake clinics, each with an admin, a dentist, a receptionist and fake patients.');
