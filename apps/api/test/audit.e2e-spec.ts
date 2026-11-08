import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/password.js';
import { configureApp } from '../src/configure-app.js';
import type { UserRole } from '../src/generated/prisma/client.js';
import { ownerClient, resetDatabase } from './test-db.js';

const PASSWORD = 'a-long-test-password';
const URL = '/api/v1/audit-logs';

describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let passwordHash: string;
  const owner = ownerClient();
  const cookies = {} as Record<'ADMIN' | 'RECEPTIONIST' | 'ADMIN_B', string>;
  let clinicA: string;
  let clinicB: string;
  let adminId: string;
  let deskId: string;
  let maria: string;
  let appointment: string;
  let bea: string;

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof cookies) => ({ get: (url: string) => http().get(url).set('Cookie', cookies[who]) });

  async function addUser(clinicId: string, role: UserRole, email: string, lastName: string) {
    const user = await owner.user.create({ data: { clinicId, email, passwordHash, firstName: 'T', lastName, role } });
    const response = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);
    const cookie = ([response.headers['set-cookie']].flat() as unknown as string[])[0].split(';')[0];
    return { id: user.id, cookie };
  }

  const line = (clinicId: string, actorUserId: string, action: string, entityId?: string, createdAt = new Date()) =>
    owner.auditLog.create({ data: { clinicId, actorUserId, action: action as never, entityId, createdAt } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    passwordHash = await hashPassword(PASSWORD);
  });

  beforeEach(async () => {
    await resetDatabase(owner);
    clinicA = (await owner.clinic.create({ data: { name: 'Clinic A' } })).id;
    clinicB = (await owner.clinic.create({ data: { name: 'Clinic B' } })).id;
    const admin = await addUser(clinicA, 'ADMIN', 'admin@a.example', 'Admin');
    adminId = admin.id;
    cookies.ADMIN = admin.cookie;
    const desk = await addUser(clinicA, 'RECEPTIONIST', 'desk@a.example', 'Desk');
    deskId = desk.id;
    cookies.RECEPTIONIST = desk.cookie;
    cookies.ADMIN_B = (await addUser(clinicB, 'ADMIN', 'admin@b.example', 'AdminB')).cookie;
    const patient = (clinicId: string, firstName: string) =>
      owner.patient.create({ data: { clinicId, firstName, lastName: 'Test', birthDate: new Date('1990-01-01') } });
    maria = (await patient(clinicA, 'Maria')).id;
    bea = (await patient(clinicB, 'Bea')).id;
    appointment = (
      await owner.appointment.create({
        data: { clinicId: clinicA, patientId: maria, startsAt: new Date(Date.now() + 864e5), endsAt: new Date(Date.now() + 864e5 + 18e5) },
      })
    ).id;
    await owner.auditLog.deleteMany(); // start from the lines each test adds
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  it('is for admins only', async () => {
    await http().get(URL).expect(401);
    await as('RECEPTIONIST').get(URL).expect(403);
    await as('ADMIN').get(URL).expect(200);
  });

  it('names what each line is about', async () => {
    await line(clinicA, deskId, 'PATIENT_VIEWED', maria);
    await line(clinicA, deskId, 'APPOINTMENT_CONFIRMED', appointment);
    await line(clinicA, adminId, 'STAFF_PASSWORD_RESET', deskId);
    await line(clinicA, adminId, 'CLINIC_UPDATED');
    const { body } = await as('ADMIN').get(URL).expect(200);
    const by = Object.fromEntries(body.items.map((i: { action: string }) => [i.action, i]));
    expect(by['PATIENT_VIEWED'].subject).toEqual({ kind: 'patient', id: maria, name: 'Maria Test' });
    expect(by['APPOINTMENT_CONFIRMED'].subject).toMatchObject({ kind: 'appointment', id: appointment, name: 'Maria Test' });
    expect(by['STAFF_PASSWORD_RESET'].subject).toEqual({ kind: 'staff', id: deskId, name: 'T Desk' });
    expect(by['CLINIC_UPDATED'].subject).toBeNull();
    expect(by['PATIENT_VIEWED'].actor).toMatchObject({ lastName: 'Desk', role: 'RECEPTIONIST' });
  });

  it('never names records of another clinic', async () => {
    await line(clinicA, deskId, 'PATIENT_VIEWED', bea); // an id from Clinic B
    const { body } = await as('ADMIN').get(URL).expect(200);
    expect(body.items[0].subject).toBeNull();
    const other = await as('ADMIN_B').get(URL).expect(200);
    expect(other.body.items).toHaveLength(0);
  });

  it('filters by several kinds, dates and routine lookups', async () => {
    await line(clinicA, deskId, 'LOGIN_FAILED');
    await line(clinicA, deskId, 'PATIENT_ARCHIVED', maria);
    await line(clinicA, deskId, 'PATIENT_LISTED');
    await line(clinicA, deskId, 'APPOINTMENT_LISTED');
    await line(clinicA, deskId, 'APPOINTMENT_VIEWED', appointment);
    const kinds = async (q: Record<string, string>) =>
      (await as('ADMIN').get(URL).query(q).expect(200)).body.items.map((i: { action: string }) => i.action).sort();

    expect(await kinds({ actions: 'LOGIN_FAILED,PATIENT_ARCHIVED' })).toEqual(['LOGIN_FAILED', 'PATIENT_ARCHIVED']);
    expect(await kinds({ excludeRoutine: 'true' })).toEqual(['LOGIN_FAILED', 'PATIENT_ARCHIVED']);
    expect(await kinds({ excludeRoutine: 'false' })).toHaveLength(5);
    expect(await kinds({})).toHaveLength(5);
    expect(await kinds({ from: '2000-01-01', to: '2000-01-02' })).toEqual([]);
    expect(await kinds({ from: '2000-01-01' })).toHaveLength(5);
    await as('ADMIN').get(URL).query({ actions: 'NOPE' }).expect(400);
    await as('ADMIN').get(URL).query({ from: '2026-02-01', to: '2026-01-01' }).expect(400);
    await as('ADMIN').get(URL).query({ excludeRoutine: 'maybe' }).expect(400);
    await as('ADMIN').get(URL).query({ other: '1' }).expect(400);
  });

  it('counts a record opened again within a minute once', async () => {
    const now = Date.now();
    await line(clinicA, deskId, 'PATIENT_VIEWED', maria, new Date(now - 120_000));
    await line(clinicA, deskId, 'PATIENT_VIEWED', maria, new Date(now - 100_000));
    await line(clinicA, deskId, 'PATIENT_VIEWED', maria, new Date(now - 10_000));
    await line(clinicA, adminId, 'PATIENT_VIEWED', maria, new Date(now - 5_000)); // someone else
    const { body } = await as('ADMIN').get(URL).query({ excludeRoutine: 'true' }).expect(200);
    // The first view, the view more than a minute later, and the other person's.
    expect(body.items).toHaveLength(3);
    const all = await as('ADMIN').get(URL).expect(200);
    expect(all.body.items).toHaveLength(4);
  });
});
