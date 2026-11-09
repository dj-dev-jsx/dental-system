// Fills the development database with FAKE clinic details, staff and patients. Never run this on real data.
//   pnpm --filter api db:seed
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '../src/auth/password.js';
import { addDays, todayInManila } from '../src/common/manila.js';
import { type AppointmentStatus, PrismaClient, type UserRole } from '../src/generated/prisma/client.js';

const password = process.env['SEED_PASSWORD'];
if (!password) throw new Error('Set SEED_PASSWORD in apps/api/.env');
if (process.env['NODE_ENV'] === 'production') throw new Error('Refusing to seed production');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const staff: [emailName: string, firstName: string, lastName: string, role: UserRole][] = [
  ['admin', 'Ana', 'Reyes', 'ADMIN'],
  ['dentist', 'Jose', 'Santos', 'DENTIST'],
  ['dentist2', 'Carmen', 'Lim', 'DENTIST'],
  ['reception', 'Liza', 'Cruz', 'RECEPTIONIST'],
];

const DOMAIN = 'clinic.example';

// The clinic's details (one row, id 1). Online booking is switched on at every run.
async function seedClinic() {
  const details = {
    name: 'Sample Dental Clinic',
    address: '23 Mabini Street, Barangay San Roque, Quezon City, Metro Manila',
    phone: '0900 000 0100',
    email: `hello@${DOMAIN}`,
  };
  await prisma.clinicSettings.upsert({
    where: { id: 1 },
    update: { ...details, onlineBookingEnabled: true },
    create: { id: 1, ...details, onlineBookingEnabled: true },
  });
  const passwordHash = await hashPassword(password!);
  for (const [emailName, firstName, lastName, role] of staff) {
    const email = `${emailName}@${DOMAIN}`;
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash },
      create: { email, passwordHash, firstName, lastName, role },
    });
  }
}

type FakePatient = { id: string; firstName: string; lastName: string; birthDate: string; phone: string };

async function seedPatients(patients: FakePatient[]) {
  await prisma.$transaction(async (tx) => {
    for (const { birthDate, ...patient } of patients) {
      await tx.patient.upsert({
        where: { id: patient.id },
        update: {},
        create: { ...patient, birthDate: new Date(birthDate) },
      });
    }
  });
}

// Fixed ids, so running the seed twice updates these rows instead of adding more.
await seedClinic();
await seedPatients([
  { id: '00000000-0000-7000-8000-0000000a0001', firstName: 'Maria', lastName: 'Dela Cruz', birthDate: '1985-03-14', phone: '0900 000 0001' },
  { id: '00000000-0000-7000-8000-0000000a0002', firstName: 'Juan', lastName: 'Dela Cruz', birthDate: '1982-11-02', phone: '0900 000 0002' },
  { id: '00000000-0000-7000-8000-0000000a0003', firstName: 'Pedro', lastName: 'Penduko', birthDate: '2011-07-21', phone: '0900 000 0003' },
]);

type FakeAppointment = {
  id: string;
  patientId: string;
  dentistEmail?: string; // left out for a request where the patient didn't choose
  day: number; // days from today
  from: string;
  to: string;
  status: AppointmentStatus;
  reason: string;
};

// Dates count from the day the seed first runs. Running it again leaves existing
// appointments alone, so anything confirmed or cancelled while trying the app stays that way.
async function seedAppointments(appointments: FakeAppointment[]) {
  const today = todayInManila();
  await prisma.$transaction(async (tx) => {
    for (const { id, patientId, dentistEmail, day, from, to, status, reason } of appointments) {
      const dentist = dentistEmail
        ? await tx.user.findUniqueOrThrow({ where: { email: dentistEmail } })
        : null;
      const date = addDays(today, day);
      await tx.appointment.upsert({
        where: { id },
        update: {},
        create: {
          id,
          patientId,
          dentistId: dentist?.id ?? null,
          startsAt: new Date(`${date}T${from}:00+08:00`),
          endsAt: new Date(`${date}T${to}:00+08:00`),
          status,
          reason,
        },
      });
    }
  });
}

const MARIA = '00000000-0000-7000-8000-0000000a0001';
const JUAN = '00000000-0000-7000-8000-0000000a0002';
const PEDRO = '00000000-0000-7000-8000-0000000a0003';
await seedAppointments([
  { id: '00000000-0000-7000-8000-0000a0000001', patientId: MARIA, dentistEmail: 'dentist@clinic.example', day: 1, from: '09:00', to: '09:30', status: 'CONFIRMED', reason: 'Cleaning' },
  { id: '00000000-0000-7000-8000-0000a0000002', patientId: JUAN, dentistEmail: 'dentist2@clinic.example', day: 1, from: '10:00', to: '11:00', status: 'CONFIRMED', reason: 'Extraction, lower right molar' },
  { id: '00000000-0000-7000-8000-0000a0000003', patientId: PEDRO, dentistEmail: 'dentist@clinic.example', day: 2, from: '14:00', to: '14:30', status: 'CONFIRMED', reason: 'Check-up' },
  // Two requests waiting for the clinic. The first asks for a time Dr. Santos is already busy.
  { id: '00000000-0000-7000-8000-0000a0000004', patientId: PEDRO, day: 1, from: '09:00', to: '09:30', status: 'REQUESTED', reason: 'Tooth ache' },
  { id: '00000000-0000-7000-8000-0000a0000005', patientId: JUAN, dentistEmail: 'dentist2@clinic.example', day: 3, from: '15:00', to: '15:30', status: 'REQUESTED', reason: 'Braces consultation' },
]);

// Maria's chart: a few years of findings, including one corrected by mistake.
// Chart entries can never be changed, so a second run only adds what's missing.
async function seedChart(patientId: string) {
  const dentist = await prisma.user.findUniqueOrThrow({ where: { email: 'dentist@clinic.example' } });
  const daysAgo = (days: number) => new Date(Date.now() - days * 864e5);
  const entry = (n: number, tooth: string, condition: 'DECAYED' | 'FILLED' | 'CROWN' | 'ROOT_CANAL' | 'MISSING' | 'EXTRACTED', days: number, extra: { surfaces?: ('MESIAL' | 'DISTAL' | 'OCCLUSAL')[]; note?: string } = {}) => ({
    id: `00000000-0000-7000-8000-0000c0000${String(n).padStart(3, '0')}`,
    patientId,
    tooth,
    condition,
    recordedById: dentist.id,
    recordedAt: daysAgo(days),
    ...extra,
  });
  await prisma.$transaction(async (tx) => {
    await tx.toothRecord.createMany({
      skipDuplicates: true,
      data: [
        entry(1, '11', 'CROWN', 420, { note: 'Porcelain crown, done elsewhere' }),
        entry(2, '38', 'MISSING', 420, { note: 'Never erupted' }),
        entry(3, '48', 'EXTRACTED', 300),
        entry(4, '26', 'FILLED', 200, { surfaces: ['OCCLUSAL'] }),
        entry(5, '36', 'ROOT_CANAL', 120),
        entry(6, '46', 'CROWN', 90),
        entry(7, '16', 'DECAYED', 60, { surfaces: ['OCCLUSAL', 'DISTAL'], note: 'Deep, sensitive to cold' }),
        entry(8, '16', 'FILLED', 30, { surfaces: ['OCCLUSAL', 'DISTAL'], note: 'Composite' }),
        entry(9, '24', 'FILLED', 10, { surfaces: ['MESIAL'] }),
      ],
    });
    // 24 was charted as filled by mistake: corrected to decayed, on the same date.
    await tx.toothRecord.createMany({
      skipDuplicates: true,
      data: [
        {
          ...entry(10, '24', 'DECAYED', 10, { surfaces: ['MESIAL'] }),
          correctsId: '00000000-0000-7000-8000-0000c0000009',
          correctionReason: 'Charted as filled by mistake: it still needs filling',
        },
      ],
    });
  });
}
await seedChart(MARIA);

// Online booking accounts, both with SEED_PASSWORD and already confirmed:
//  - Maria's, linked by the admin to her patient record, so she sees her appointments;
//  - Rosa's, signed up on her own and NOT linked to anyone, with one request waiting, so staff
//    can try "Who is this?" (Rosa matches no patient: she's new).
async function seedPatientAccounts() {
  const passwordHash = await hashPassword(password!);
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@clinic.example' } });
  const now = new Date();
  const date = addDays(todayInManila(), 4);
  await prisma.$transaction(async (tx) => {
    await tx.patientAccount.upsert({
      where: { id: '00000000-0000-7000-8000-0000000ac001' },
      update: { passwordHash },
      create: {
        id: '00000000-0000-7000-8000-0000000ac001',
        email: 'maria.patient@clinic.example',
        passwordHash,
        firstName: 'Maria',
        lastName: 'Dela Cruz',
        birthDate: new Date('1985-03-14'),
        phone: '0900 000 0001',
        privacyConsentAt: now,
        emailVerifiedAt: now,
        patientId: MARIA,
        linkedAt: now,
        linkedById: admin.id,
      },
    });
    const rosa = await tx.patientAccount.upsert({
      where: { id: '00000000-0000-7000-8000-0000000ac002' },
      update: { passwordHash },
      create: {
        id: '00000000-0000-7000-8000-0000000ac002',
        email: 'new.patient@clinic.example',
        passwordHash,
        firstName: 'Rosa',
        lastName: 'Villanueva',
        birthDate: new Date('1995-05-05'),
        phone: '0900 000 0010',
        privacyConsentAt: now,
        emailVerifiedAt: now,
      },
    });
    // No patient yet: staff link Rosa's account (or register her) before it can be confirmed.
    await tx.appointment.upsert({
      where: { id: '00000000-0000-7000-8000-0000a0000006' },
      update: {},
      create: {
        id: '00000000-0000-7000-8000-0000a0000006',
        patientAccountId: rosa.id,
        startsAt: new Date(`${date}T11:00:00+08:00`),
        endsAt: new Date(`${date}T11:30:00+08:00`),
        status: 'REQUESTED',
        reason: 'First check-up and cleaning',
      },
    });
  });
}
await seedPatientAccounts();

await prisma.$disconnect();
console.log('Seeded Sample Dental Clinic (fake details) with an admin, two dentists, a receptionist, fake patients, appointments, a chart and two online booking accounts.');
