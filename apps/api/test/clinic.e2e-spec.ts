import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/password.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ownerClient, resetDatabase } from './test-db.js';

const PASSWORD = 'a-long-test-password';

describe('Clinic settings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const owner = ownerClient();
  const http = () => request(app.getHttpServer());
  let clinicId: string;
  let otherClinicId: string;

  async function session(email: string) {
    const response = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(204);
    return ([response.headers['set-cookie']].flat() as unknown as string[])[0].split(';')[0];
  }
  const audit = () => owner.auditLog.findMany({ where: { action: 'CLINIC_UPDATED' } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(owner);
    const clinic = await prisma.clinic.create({
      data: { name: 'Clinic A', phone: '+63 912 345 6789' },
    });
    const other = await prisma.clinic.create({ data: { name: 'Clinic B' } });
    clinicId = clinic.id;
    otherClinicId = other.id;
    const passwordHash = await hashPassword(PASSWORD);
    const mk = (
      cid: string,
      key: string,
      role: 'ADMIN' | 'DENTIST' | 'RECEPTIONIST' | 'ASSISTANT',
    ) =>
      prisma.user.create({
        data: {
          clinicId: cid,
          email: `${key}@test.example`,
          passwordHash,
          firstName: 'F',
          lastName: 'L',
          role,
        },
      });
    await mk(clinicId, 'admin', 'ADMIN');
    await mk(clinicId, 'reception', 'RECEPTIONIST');
    await mk(clinicId, 'dentist', 'DENTIST');
    await mk(clinicId, 'assistant', 'ASSISTANT');
    await mk(otherClinicId, 'adminb', 'ADMIN');
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  it('keeps the public hello route working', async () => {
    await http().get('/api/v1/clinics/hello').expect(200);
  });

  it('shows every role their own clinic', async () => {
    for (const key of ['admin', 'reception', 'dentist', 'assistant']) {
      const cookie = await session(`${key}@test.example`);
      const res = await http().get('/api/v1/clinic').set('Cookie', cookie).expect(200);
      expect(res.body).toEqual({
        id: clinicId,
        name: 'Clinic A',
        address: null,
        phone: '+63 912 345 6789',
        email: null,
        opensAt: 420,
        closesAt: 1200,
        defaultVisitMinutes: 30,
        updatedAt: expect.any(String),
      });
      expect(Number.isNaN(Date.parse(res.body.updatedAt))).toBe(false);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    await http().get('/api/v1/clinic').expect(401);
    const cookieB = await session('adminb@test.example');
    const b = await http().get('/api/v1/clinic').set('Cookie', cookieB).expect(200);
    expect(b.body.id).toBe(otherClinicId);
  });

  it('lets only admins update, and refuses a clinic id in the body', async () => {
    for (const key of ['reception', 'dentist', 'assistant']) {
      const cookie = await session(`${key}@test.example`);
      await http().patch('/api/v1/clinic').set('Cookie', cookie).send({ name: 'Nope' }).expect(403);
    }
    const admin = await session('admin@test.example');
    await http().patch('/api/v1/clinic').set('Cookie', admin).send({ id: otherClinicId, name: 'X' }).expect(400);
    await http().patch('/api/v1/clinic').set('Cookie', admin).send({ name: 'Renamed' }).expect(200);
    const b = await owner.clinic.findUniqueOrThrow({ where: { id: otherClinicId } });
    expect(b.name).toBe('Clinic B');
  });

  it('updates fields, saves only real changes and audits them as strings', async () => {
    const admin = await session('admin@test.example');
    const res = await http()
      .patch('/api/v1/clinic')
      .set('Cookie', admin)
      .send({
        name: ' New Name ',
        address: '1 Test St',
        email: 'Info@Test.Example',
        phone: '+63 2 8123 4567',
        opensAt: 480,
        closesAt: 1080,
        defaultVisitMinutes: 45,
      })
      .expect(200);
    expect(res.body).toEqual({
      id: clinicId,
      name: 'New Name',
      address: '1 Test St',
      phone: '+63 2 8123 4567',
      email: 'info@test.example',
      opensAt: 480,
      closesAt: 1080,
      defaultVisitMinutes: 45,
      updatedAt: expect.any(String),
    });
    const lines = await audit();
    expect(lines).toHaveLength(1);
    expect(lines[0].metadata).toEqual({
      changes: {
        name: { from: 'Clinic A', to: 'New Name' },
        address: { from: null, to: '1 Test St' },
        phone: { from: '+63 912 345 6789', to: '+63 2 8123 4567' },
        email: { from: null, to: 'info@test.example' },
        opensAt: { from: '420', to: '480' },
        closesAt: { from: '1200', to: '1080' },
        defaultVisitMinutes: { from: '30', to: '45' },
      },
    });

    // Same value again: nothing saved, nothing logged. Nullable fields can be cleared.
    await http().patch('/api/v1/clinic').set('Cookie', admin).send({ name: 'New Name' }).expect(200);
    expect(await audit()).toHaveLength(1);
    const cleared = await http()
      .patch('/api/v1/clinic')
      .set('Cookie', admin)
      .send({ address: null, phone: null })
      .expect(200);
    expect(cleared.body).toMatchObject({ address: null, phone: null });
    expect(await audit()).toHaveLength(2);
  });

  it('validates the fields', async () => {
    const admin = await session('admin@test.example');
    const bad: object[] = [
      {},
      { name: '' },
      { name: 'x'.repeat(201) },
      { address: 'x'.repeat(501) },
      { phone: 'abc' },
      { email: 'nope' },
      { opensAt: 425 },
      { opensAt: -15 },
      { closesAt: 1455 },
      { opensAt: 7.5 },
      { opensAt: 600, closesAt: 600 },
      { opensAt: 900, closesAt: 600 },
      { defaultVisitMinutes: 0 },
      { defaultVisitMinutes: 3 },
      { defaultVisitMinutes: 32 },
      { defaultVisitMinutes: 485 },
      { defaultVisitMinutes: '30' },
      { opensAt: '480' },
    ];
    for (const body of bad) {
      await http().patch('/api/v1/clinic').set('Cookie', admin).send(body).expect(400);
    }
    // Boundary values are accepted.
    await http()
      .patch('/api/v1/clinic')
      .set('Cookie', admin)
      .send({ opensAt: 0, closesAt: 1440, defaultVisitMinutes: 480 })
      .expect(200);
    await http().patch('/api/v1/clinic').set('Cookie', admin).send({ defaultVisitMinutes: 5 }).expect(200);
  });

  it('checks a single hour against the stored other one', async () => {
    const admin = await session('admin@test.example'); // stored 420..1200
    await http().patch('/api/v1/clinic').set('Cookie', admin).send({ opensAt: 1200 }).expect(409);
    await http().patch('/api/v1/clinic').set('Cookie', admin).send({ opensAt: 1250 }).expect(400);
    await http().patch('/api/v1/clinic').set('Cookie', admin).send({ closesAt: 420 }).expect(409);
    await http().patch('/api/v1/clinic').set('Cookie', admin).send({ closesAt: 435 }).expect(200);
    const row = await owner.clinic.findUniqueOrThrow({ where: { id: clinicId } });
    expect([row.opensAt, row.closesAt]).toEqual([420, 435]);
  });
});
