import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/password.js';
import { configureApp } from '../src/configure-app.js';
import type { UserRole } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ownerClient, resetDatabase } from './test-db.js';

const PASSWORD = 'a-long-test-password';

describe('Dental chart (e2e)', () => {
  let app: INestApplication;
  let passwordHash: string;
  const owner = ownerClient();
  // The API's own database login, for proving what the database itself refuses.
  const appDb = new PrismaService(new ConfigService({ DATABASE_URL: process.env['DATABASE_URL'] }));
  const cookies = {} as Record<UserRole | 'ADMIN_B', string>;
  const ids = {} as Record<UserRole, string>;
  let clinicA: string;
  let maria: string;
  let juan: string;
  let bea: string; // Clinic B

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof cookies) => ({
    get: (url: string) => http().get(url).set('Cookie', cookies[who]),
    post: (url: string) => http().post(url).set('Cookie', cookies[who]),
  });
  const chartOf = (patientId: string) => `/api/v1/patients/${patientId}/chart`;
  const record = (fields: Record<string, unknown>, who: keyof typeof cookies = 'DENTIST', patientId = maria) =>
    as(who).post(`${chartOf(patientId)}/records`).send(fields);
  const correct = (recordId: string, fields: Record<string, unknown>, who: keyof typeof cookies = 'DENTIST') =>
    as(who).post(`${chartOf(maria)}/records/${recordId}/correct`).send(fields);

  async function addStaff(clinicId: string, role: UserRole, email: string) {
    const user = await owner.user.create({
      data: { clinicId, email, passwordHash, firstName: 'T', lastName: role, role },
    });
    const response = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);
    const cookie = ([response.headers['set-cookie']].flat() as unknown as string[])[0].split(';')[0];
    return { id: user.id, cookie };
  }

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
    const clinicB = (await owner.clinic.create({ data: { name: 'Clinic B' } })).id;
    for (const role of ['ADMIN', 'DENTIST', 'RECEPTIONIST', 'ASSISTANT'] as const) {
      const staff = await addStaff(clinicA, role, `${role.toLowerCase()}@a.example`);
      cookies[role] = staff.cookie;
      ids[role] = staff.id;
    }
    cookies.ADMIN_B = (await addStaff(clinicB, 'ADMIN', 'admin@b.example')).cookie;
    const patient = (clinicId: string, firstName: string) =>
      owner.patient.create({ data: { clinicId, firstName, lastName: 'Test', birthDate: new Date('1990-01-01') } });
    maria = (await patient(clinicA, 'Maria')).id;
    juan = (await patient(clinicA, 'Juan')).id;
    bea = (await patient(clinicB, 'Bea')).id;
  });

  afterAll(async () => {
    await app.close();
    await appDb.$disconnect();
    await owner.$disconnect();
  });

  it('requires a login', async () => {
    await http().get(chartOf(maria)).expect(401);
    await http().post(`${chartOf(maria)}/records`).send({ tooth: '16', condition: 'DECAYED' }).expect(401);
  });

  it('starts empty: no tooth has anything recorded', async () => {
    const { body } = await as('RECEPTIONIST').get(chartOf(maria)).expect(200);
    expect(body).toEqual({ teeth: {}, records: [] });
  });

  describe('who can write in it', () => {
    it('lets dentists and admins record findings', async () => {
      await record({ tooth: '16', condition: 'DECAYED' }, 'DENTIST').expect(201);
      await record({ tooth: '26', condition: 'FILLED' }, 'ADMIN').expect(201);
    });

    it('lets receptionists and assistants look, but not write', async () => {
      await record({ tooth: '16', condition: 'DECAYED' }, 'RECEPTIONIST').expect(403);
      await record({ tooth: '16', condition: 'DECAYED' }, 'ASSISTANT').expect(403);
      await as('RECEPTIONIST').get(chartOf(maria)).expect(200);
      await as('ASSISTANT').get(chartOf(maria)).expect(200);
    });
  });

  describe('recording', () => {
    it('shows each tooth as its latest finding, with who recorded it', async () => {
      await record({ tooth: '16', condition: 'DECAYED', surfaces: ['OCCLUSAL', 'MESIAL', 'MESIAL'], note: 'Deep' }).expect(201);
      await record({ tooth: '16', condition: 'FILLED', surfaces: ['OCCLUSAL'] }).expect(201);
      await record({ tooth: '48', condition: 'EXTRACTED' }).expect(201);

      const { body } = await as('RECEPTIONIST').get(chartOf(maria)).expect(200);
      expect(body.teeth['16']).toMatchObject({ condition: 'FILLED', surfaces: ['OCCLUSAL'] });
      expect(body.teeth['48']).toMatchObject({ condition: 'EXTRACTED' });
      expect(Object.keys(body.teeth).sort()).toEqual(['16', '48']);
      expect(body.records).toHaveLength(3);
      // Surfaces come back once each, in a fixed order.
      const decay = body.records.find((entry: { condition: string }) => entry.condition === 'DECAYED');
      expect(decay).toMatchObject({ surfaces: ['MESIAL', 'OCCLUSAL'], note: 'Deep', recordedBy: { id: ids.DENTIST } });
    });

    it('refuses what makes no sense', async () => {
      await record({ tooth: '19', condition: 'DECAYED' }).expect(400); // no such tooth
      await record({ tooth: '55', condition: 'DECAYED' }).expect(400); // baby teeth come later
      await record({ tooth: '16', condition: 'BROKEN' }).expect(400);
      const surfaces = await record({ tooth: '16', condition: 'CROWN', surfaces: ['OCCLUSAL'] }).expect(400);
      expect(surfaces.body.message).toEqual(['surfaces: Surfaces are only for decay and fillings']);
      await record({ tooth: '16', condition: 'DECAYED', recordedAt: '2020-01-01T00:00:00Z' }).expect(400);
    });

    it('links an entry to the visit, but only to this patient’s own appointment', async () => {
      // An hour apart, or the database's no-double-booking rule refuses the second.
      const visit = (patientId: string, hoursFromNow: number) =>
        owner.appointment.create({
          data: {
            clinicId: clinicA,
            patientId,
            dentistId: ids.DENTIST,
            status: 'CONFIRMED',
            startsAt: new Date(Date.now() + hoursFromNow * 3600_000),
            endsAt: new Date(Date.now() + hoursFromNow * 3600_000 + 1800_000),
          },
        });
      const mariasVisit = await visit(maria, 0);
      const juansVisit = await visit(juan, 1);
      const ok = await record({ tooth: '16', condition: 'DECAYED', appointmentId: mariasVisit.id }).expect(201);
      expect(ok.body.appointment).toMatchObject({ id: mariasVisit.id });
      await record({ tooth: '16', condition: 'DECAYED', appointmentId: juansVisit.id }).expect(400);
    });

    it("won't write in an archived patient's chart", async () => {
      await owner.patient.update({ where: { id: maria }, data: { archivedAt: new Date() } });
      await record({ tooth: '16', condition: 'DECAYED' }).expect(409);
      await as('DENTIST').get(chartOf(maria)).expect(200); // still readable
    });

    it('logs every look and every entry against the patient', async () => {
      await as('RECEPTIONIST').get(chartOf(maria)).expect(200);
      const { body } = await record({ tooth: '16', condition: 'DECAYED' }).expect(201);
      const log = await owner.auditLog.findMany({ where: { entityId: maria }, orderBy: { createdAt: 'asc' } });
      expect(log.map((entry) => entry.action)).toEqual(['CHART_VIEWED', 'TOOTH_RECORDED']);
      expect(log[1].metadata).toEqual({ recordId: body.id, tooth: '16', condition: 'DECAYED' });
    });
  });

  describe('corrections', () => {
    it('replaces a wrong entry in its own place in the timeline, and keeps it in the history', async () => {
      const first = (await record({ tooth: '16', condition: 'FILLED' }).expect(201)).body;
      await record({ tooth: '16', condition: 'CROWN' }).expect(201);
      // The first entry should have said decayed. Correcting it must not undo the later crown.
      const fix = await correct(first.id, { condition: 'DECAYED', reason: 'Misread the X-ray' }).expect(201);
      expect(fix.body).toMatchObject({ tooth: '16', correctsId: first.id, correctionReason: 'Misread the X-ray', recordedAt: first.recordedAt });

      const { body } = await as('DENTIST').get(chartOf(maria)).expect(200);
      expect(body.teeth['16'].condition).toBe('CROWN');
      const wrong = body.records.find((entry: { id: string }) => entry.id === first.id);
      expect(wrong.correctedBy).toEqual({ id: fix.body.id });
    });

    it('can withdraw an entry with nothing in its place, such as one put on the wrong tooth', async () => {
      await record({ tooth: '26', condition: 'FILLED' }).expect(201);
      const wrong = (await record({ tooth: '26', condition: 'EXTRACTED' }).expect(201)).body;
      await correct(wrong.id, { condition: null, reason: 'Wrong tooth: it was 27' }).expect(201);
      const { body } = await as('DENTIST').get(chartOf(maria)).expect(200);
      expect(body.teeth['26'].condition).toBe('FILLED');
    });

    it('needs a reason, and corrects each entry only once', async () => {
      const wrong = (await record({ tooth: '16', condition: 'FILLED' }).expect(201)).body;
      await correct(wrong.id, { condition: 'DECAYED' }).expect(400);
      const fix = (await correct(wrong.id, { condition: 'DECAYED', reason: 'Typo' }).expect(201)).body;
      const again = await correct(wrong.id, { condition: 'CROWN', reason: 'Again' }).expect(409);
      expect(again.body.message).toMatch(/already been corrected/);
      // The correction itself can be corrected.
      await correct(fix.id, { condition: 'CROWN', reason: 'Still wrong' }).expect(201);
    });

    it('lets only one of two simultaneous corrections through', async () => {
      const wrong = (await record({ tooth: '16', condition: 'FILLED' }).expect(201)).body;
      const results = await Promise.all(
        Array.from({ length: 4 }, (_, i) => correct(wrong.id, { condition: 'DECAYED', reason: `Try ${i}` })),
      );
      expect(results.map((response) => response.status).sort((a, b) => a - b)).toEqual([201, 409, 409, 409]);
    });

    it('is for dentists and admins only', async () => {
      const wrong = (await record({ tooth: '16', condition: 'FILLED' }).expect(201)).body;
      await correct(wrong.id, { condition: 'DECAYED', reason: 'x' }, 'RECEPTIONIST').expect(403);
      await correct(wrong.id, { condition: 'DECAYED', reason: 'x' }, 'ADMIN').expect(201);
    });
  });

  describe('keeping clinics apart', () => {
    it("can't see, write in or correct another clinic's chart", async () => {
      const entry = (await record({ tooth: '16', condition: 'DECAYED' }).expect(201)).body;
      await as('ADMIN_B').get(chartOf(maria)).expect(404);
      await record({ tooth: '16', condition: 'DECAYED' }, 'ADMIN_B').expect(404);
      await as('ADMIN_B').post(`${chartOf(bea)}/records/${entry.id}/correct`).send({ condition: null, reason: 'x' }).expect(404);
      await as('DENTIST').post(`${chartOf(maria)}/records/${randomUUID()}/correct`).send({ condition: null, reason: 'x' }).expect(404);
      expect(await owner.toothRecord.count()).toBe(1);
    });
  });

  describe('in the database itself', () => {
    const entry = (fields: Record<string, unknown> = {}) => ({
      clinicId: clinicA,
      patientId: maria,
      tooth: '16',
      condition: 'DECAYED' as const,
      recordedById: ids.DENTIST,
      recordedAt: new Date(),
      ...fields,
    });

    it('is written in pen: the API’s login can add entries but never change or delete them', async () => {
      const saved = await appDb.forClinic(clinicA, (tx) => tx.toothRecord.create({ data: entry() }));
      await expect(
        appDb.forClinic(clinicA, (tx) => tx.toothRecord.update({ where: { id: saved.id }, data: { condition: 'FILLED' } })),
      ).rejects.toThrow(/permission denied/);
      await expect(
        appDb.forClinic(clinicA, (tx) => tx.toothRecord.delete({ where: { id: saved.id } })),
      ).rejects.toThrow(/permission denied/);
    });

    it('refuses impossible entries even without the API', async () => {
      const refused = (fields: Record<string, unknown>) =>
        expect(owner.toothRecord.create({ data: entry(fields) as never })).rejects.toThrow();
      await refused({ tooth: '19' });
      await refused({ condition: null }); // only a correction may be empty
      await refused({ condition: 'CROWN', surfaces: ['OCCLUSAL'] });
      await refused({ patientId: bea }); // another clinic's patient
      const original = await owner.toothRecord.create({ data: entry() });
      await refused({ correctsId: original.id }); // a correction without a reason
      await refused({ correctsId: original.id, correctionReason: 'x', tooth: '17' }); // another tooth
      await refused({ correctsId: original.id, correctionReason: 'x', patientId: juan }); // another patient
    });
  });
});
