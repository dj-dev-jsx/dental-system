import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/password.js';
import { configureApp } from '../src/configure-app.js';
import type { UserRole } from '../src/generated/prisma/client.js';
import { createPatientSchema } from '../src/patients/patients.schemas.js';
import { ownerClient, resetDatabase } from './test-db.js';

const PASSWORD = 'a-long-test-password';
const URL = '/api/v1/patients';

describe('Patients (e2e)', () => {
  let app: INestApplication;
  let passwordHash: string;
  const owner = ownerClient();
  // Logged-in cookies, by role.
  const cookies = {} as Record<UserRole, string>;
  let adminA: string;
  let maria: string;

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof cookies) => ({
    get: (url: string) => http().get(url).set('Cookie', cookies[who]),
    post: (url: string) => http().post(url).set('Cookie', cookies[who]),
    patch: (url: string) => http().patch(url).set('Cookie', cookies[who]),
  });
  const auditLogs = () => owner.auditLog.findMany({ orderBy: { createdAt: 'asc' } });

  const newPatient = { firstName: 'Pedro', lastName: 'Penduko', birthDate: '2011-07-21' };

  async function addStaff(role: UserRole, email: string) {
    const user = await owner.user.create({
      data: { email, passwordHash, firstName: 'T', lastName: role, role },
    });
    const response = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(204);
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

    const admin = await addStaff('ADMIN', 'admin@a.example');
    adminA = admin.id;
    cookies.ADMIN = admin.cookie;
    cookies.DENTIST = (await addStaff('DENTIST', 'dentist@a.example')).cookie;
    cookies.RECEPTIONIST = (await addStaff('RECEPTIONIST', 'desk@a.example')).cookie;
    cookies.ASSISTANT = (await addStaff('ASSISTANT', 'assist@a.example')).cookie;

    maria = (
      await owner.patient.create({
        data: {
          firstName: 'Maria',
          lastName: 'Dela Cruz',
          birthDate: new Date('1985-03-14'),
          phone: '0900 000 0001',
          address: '1 Secret Street',
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  it('refuses fields like a clinic id when creating', async () => {
    await as('ADMIN').post(URL).send({ ...newPatient, clinicId: randomUUID() }).expect(400);
  });

  it('answers for a patient that does not exist with 404', async () => {
    await as('ADMIN').get(`${URL}/${randomUUID()}`).expect(404);
    await as('ADMIN').patch(`${URL}/${randomUUID()}`).send({ firstName: 'X' }).expect(404);
    await as('ADMIN').post(`${URL}/${randomUUID()}/archive`).expect(404);
    await as('ADMIN').post(`${URL}/${randomUUID()}/restore`).expect(404);
  });

  it('requires a login for every route', async () => {
    await http().get(URL).expect(401);
    await http().post(URL).send(newPatient).expect(401);
    await http().get(`${URL}/${maria}`).expect(401);
    await http().patch(`${URL}/${maria}`).send({ firstName: 'X' }).expect(401);
    await http().post(`${URL}/${maria}/archive`).expect(401);
  });

  describe('roles', () => {
    it('lets any staff look patients up', async () => {
      for (const role of ['ADMIN', 'DENTIST', 'RECEPTIONIST', 'ASSISTANT'] as const) {
        await as(role).get(URL).expect(200);
        await as(role).get(`${URL}/${maria}`).expect(200);
      }
    });

    it('lets any staff, assistants included, add and edit patients', async () => {
      for (const role of ['ADMIN', 'DENTIST', 'RECEPTIONIST', 'ASSISTANT'] as const) {
        await as(role).post(URL).send(newPatient).expect(201);
        await as(role).patch(`${URL}/${maria}`).send({ suffix: role }).expect(200);
      }
    });

    it('lets only admins archive and restore', async () => {
      for (const role of ['DENTIST', 'RECEPTIONIST', 'ASSISTANT'] as const) {
        await as(role).post(`${URL}/${maria}/archive`).expect(403);
      }
      await as('ADMIN').post(`${URL}/${maria}/archive`).expect(204);
      for (const role of ['DENTIST', 'RECEPTIONIST', 'ASSISTANT'] as const) {
        await as(role).post(`${URL}/${maria}/restore`).expect(403);
      }
      await as('ADMIN').post(`${URL}/${maria}/restore`).expect(204);
    });
  });

  describe('creating', () => {
    it('saves a patient and returns the birth date as a plain date', async () => {
      const response = await as('RECEPTIONIST')
        .post(URL)
        .send({ ...newPatient, email: ' PEDRO@Example.COM ', sex: 'MALE', phone: '+63 900 000 0003' })
        .expect(201);
      expect(response.body).toMatchObject({
        firstName: 'Pedro',
        birthDate: '2011-07-21',
        email: 'pedro@example.com',
        sex: 'MALE',
        privacyConsentAt: null,
      });
    });

    it.each([
      ['no first name', { firstName: undefined }],
      ['a blank first name', { firstName: '   ' }],
      ['a date that does not exist', { birthDate: '2023-02-30' }],
      ['a date from before 1900', { birthDate: '1899-12-31' }],
      ['a badly formatted date', { birthDate: '07/21/2011' }],
      ['a bad email', { email: 'not-an-email' }],
      ['a bad phone number', { phone: 'call me' }],
      ['an unknown sex value', { sex: 'OTHER' }],
      ['a timestamp the server should set', { archivedAt: '2020-01-01T00:00:00Z' }],
    ])('refuses %s', async (_label, change) => {
      await as('ADMIN').post(URL).send({ ...newPatient, ...change }).expect(400);
      expect(await owner.patient.count({})).toBe(1);
    });

    it('allows a birth date of today in Manila, before UTC has reached that day', () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-06T16:30:00Z') });
      try {
        const parse = (birthDate: string) =>
          createPatientSchema.safeParse({ ...newPatient, birthDate }).success;
        // It's already 00:30 on November 7 in Manila.
        expect(parse('2026-11-07')).toBe(true);
        expect(parse('2026-11-08')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('listing', () => {
    it('finds a patient by any part of the name, in any order and any capitals', async () => {
      for (const search of ['maria', 'CRUZ', 'dela cruz maria', '0900 000']) {
        const response = await as('ADMIN').get(URL).query({ search }).expect(200);
        expect(response.body.total, search).toBe(1);
      }
      const noMatch = await as('ADMIN').get(URL).query({ search: 'maria santos' }).expect(200);
      expect(noMatch.body.total).toBe(0);
    });

    it('treats % and _ as ordinary characters, not wildcards', async () => {
      for (const search of ['%', '_', 'mar%a', 'mar_a']) {
        const response = await as('ADMIN').get(URL).query({ search }).expect(200);
        expect(response.body.total, search).toBe(0);
      }
    });

    it('splits results into pages, sorted by name, without repeating anyone', async () => {
      for (const lastName of ['Abad', 'Zamora']) {
        await as('ADMIN').post(URL).send({ ...newPatient, lastName }).expect(201);
      }
      const names = async (page: number) => {
        const response = await as('ADMIN').get(URL).query({ page, limit: 2 }).expect(200);
        expect(response.body.total).toBe(3);
        return response.body.items.map((patient: { lastName: string }) => patient.lastName);
      };
      expect(await names(1)).toEqual(['Abad', 'Dela Cruz']);
      expect(await names(2)).toEqual(['Zamora']);
      expect(await names(3)).toEqual([]);
    });

    it('rejects bad paging values', async () => {
      await as('ADMIN').get(URL).query({ limit: 101 }).expect(400);
      await as('ADMIN').get(URL).query({ page: 0 }).expect(400);
      await as('ADMIN').get(URL).query({ clinicId: randomUUID() }).expect(400);
    });

    it('leaves the address and other details out of the list', async () => {
      const response = await as('ADMIN').get(URL).expect(200);
      expect(response.body.items[0].phone).toBe('0900 000 0001');
      expect(JSON.stringify(response.body)).not.toContain('Secret Street');
    });
  });

  describe('appointments and sorting in the list', () => {
    const HOUR = 3_600_000;
    const at = (hours: number) => new Date(Date.now() + hours * HOUR);
    const book = (
      patientId: string,
      startHours: number,
      status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' | 'DECLINED' = 'CONFIRMED',
      dentistId: string | null = adminA,
    ) =>
      owner.appointment.create({
        data: {
          patientId,
          dentistId,
          startsAt: at(startHours),
          endsAt: at(startHours + 0.5),
          status,
          reason: 'Cleaning',
        },
      });
    let abad: string;
    let zamora: string;

    beforeEach(async () => {
      const make = async (lastName: string) =>
        (await as('ADMIN').post(URL).send({ ...newPatient, lastName }).expect(201)).body.id as string;
      abad = await make('Abad');
      zamora = await make('Zamora');
    });

    const order = async (query: Record<string, unknown>) => {
      const response = await as('ADMIN').get(URL).query(query).expect(200);
      return response.body.items.map((patient: { lastName: string }) => patient.lastName);
    };

    it('shows the soonest upcoming request or confirmed visit, with the dentist', async () => {
      await book(maria, 72);
      const soonest = await book(maria, 24, 'REQUESTED');
      await book(maria, 5, 'CANCELLED');
      await book(maria, 6, 'DECLINED');
      const response = await as('ADMIN').get(URL).query({ search: 'maria' }).expect(200);
      const item = response.body.items[0];
      expect(item.nextAppointment).toMatchObject({
        id: soonest.id,
        status: 'REQUESTED',
        dentist: { id: adminA, lastName: 'ADMIN' },
      });
      expect(item.lastVisitAt).toBeNull();
    });

    it('gives a null dentist for a request that named none', async () => {
      await book(maria, 24, 'REQUESTED', null);
      const response = await as('ADMIN').get(URL).query({ search: 'maria' }).expect(200);
      expect(response.body.items[0].nextAppointment.dentist).toBeNull();
    });

    it('reports the end of the latest confirmed visit that already ended', async () => {
      await book(maria, -96);
      const latest = await book(maria, -48);
      await book(maria, -24, 'CANCELLED');
      await book(maria, 24);
      const response = await as('ADMIN').get(URL).query({ search: 'maria' }).expect(200);
      expect(response.body.items[0].lastVisitAt).toBe(latest.endsAt.toISOString());
      expect(response.body.items[0].nextAppointment).not.toBeNull();
    });

    it('sorts by name in either direction', async () => {
      expect(await order({ sort: 'name', dir: 'desc' })).toEqual(['Zamora', 'Dela Cruz', 'Abad']);
      expect(await order({})).toEqual(['Abad', 'Dela Cruz', 'Zamora']);
    });

    it('sorts by next appointment, soonest first, with patients who have none last', async () => {
      await book(zamora, 10);
      await book(maria, 30);
      expect(await order({ sort: 'nextAppointment' })).toEqual(['Zamora', 'Dela Cruz', 'Abad']);
      expect(await order({ sort: 'nextAppointment', dir: 'desc' })).toEqual(['Dela Cruz', 'Zamora', 'Abad']);
    });

    it('sorts by last visit, with patients never seen last in both directions', async () => {
      await book(abad, -100);
      await book(maria, -10);
      await book(zamora, 10); // upcoming only: no visit yet
      expect(await order({ sort: 'lastVisit' })).toEqual(['Abad', 'Dela Cruz', 'Zamora']);
      expect(await order({ sort: 'lastVisit', dir: 'desc' })).toEqual(['Dela Cruz', 'Abad', 'Zamora']);
    });

    it('pages a sorted list without repeating or skipping anyone, ties broken by id', async () => {
      for (const lastName of ['Bravo', 'Cruz', 'Dizon', 'Eala']) {
        await as('ADMIN').post(URL).send({ ...newPatient, lastName }).expect(201);
      }
      // Seven patients (Maria, the two from setup and four more), none with an appointment: all tie, so the id decides.
      const seen: string[] = [];
      for (const page of [1, 2, 3, 4]) {
        const response = await as('ADMIN').get(URL).query({ sort: 'nextAppointment', limit: 2, page }).expect(200);
        expect(response.body.total).toBe(7);
        seen.push(...response.body.items.map((patient: { id: string }) => patient.id));
      }
      expect(new Set(seen).size).toBe(7);
      expect(seen).toEqual([...seen].sort());
    });

    it('keeps search and the archived view working while sorted', async () => {
      await book(zamora, 10);
      const found = await as('ADMIN').get(URL).query({ sort: 'lastVisit', search: 'zamora' }).expect(200);
      expect(found.body.total).toBe(1);
      expect(found.body.items[0].lastName).toBe('Zamora');
      await as('ADMIN').post(`${URL}/${zamora}/archive`).expect(204);
      expect(await order({ sort: 'nextAppointment', archived: true })).toEqual(['Zamora']);
      expect(await order({ sort: 'nextAppointment', search: '%' })).toEqual([]);
    });

    it('refuses an unknown sort or direction', async () => {
      await as('ADMIN').get(URL).query({ sort: 'lastName' }).expect(400);
      await as('ADMIN').get(URL).query({ sort: 'name; DROP TABLE patients' }).expect(400);
      await as('ADMIN').get(URL).query({ dir: 'up' }).expect(400);
    });

    it('logs the sort without what was searched for', async () => {
      await as('ADMIN').get(URL).query({ sort: 'lastVisit', dir: 'desc', search: 'zamora' }).expect(200);
      const logs = await auditLogs();
      const listed = logs.filter((log) => log.action === 'PATIENT_LISTED').at(-1);
      expect(listed?.metadata).toMatchObject({ sort: 'lastVisit', dir: 'desc', searched: true });
      expect(JSON.stringify(logs)).not.toContain('zamora');
    });
  });

  describe('the record summary', () => {
    it('includes the next appointment, last visit and a chart summary without logging a chart view', async () => {
      const day = 24 * 3_600_000;
      const upcoming = await owner.appointment.create({
        data: { patientId: maria, dentistId: adminA, startsAt: new Date(Date.now() + day), endsAt: new Date(Date.now() + day + 1_800_000), status: 'CONFIRMED' },
      });
      await owner.appointment.create({
        data: { patientId: maria, dentistId: adminA, startsAt: new Date(Date.now() - 3 * day), endsAt: new Date(Date.now() - 3 * day + 1_800_000), status: 'CONFIRMED' },
      });
      const record = (tooth: string, condition: 'DECAYED' | 'FILLED' | null, hoursAgo: number, extra = {}) =>
        owner.toothRecord.create({
          data: { patientId: maria, tooth, condition, recordedById: adminA, recordedAt: new Date(Date.now() - hoursAgo * 3_600_000), ...extra },
        });
      await record('16', 'DECAYED', 10);
      const wrong = await record('26', 'FILLED', 9);
      await record('26', 'DECAYED', 9, { correctsId: wrong.id, correctionReason: 'typo' });
      await record('36', 'FILLED', 8);
      const before = (await auditLogs()).length;

      const response = await as('DENTIST').get(`${URL}/${maria}`).expect(200);
      expect(response.body.nextAppointment).toMatchObject({ id: upcoming.id, dentist: { id: adminA } });
      expect(response.body.lastVisitAt).not.toBeNull();
      expect(response.body.chartSummary.counts).toEqual({ DECAYED: 2, FILLED: 1 });
      expect(response.body.chartSummary.latest).toMatchObject({ tooth: '36', recordedBy: { role: 'ADMIN' } });
      const logs = (await auditLogs()).slice(before);
      expect(logs.map((log) => log.action)).toEqual(['PATIENT_VIEWED']);
    });

    it('has an empty summary for a patient with no appointments or chart', async () => {
      const response = await as('ADMIN').get(`${URL}/${maria}`).expect(200);
      expect(response.body).toMatchObject({ nextAppointment: null, lastVisitAt: null });
      expect(response.body.chartSummary).toEqual({ counts: {}, latest: null });
    });

  });

  describe('viewing', () => {
    it('returns the full record', async () => {
      const response = await as('ASSISTANT').get(`${URL}/${maria}`).expect(200);
      expect(response.body).toMatchObject({
        address: '1 Secret Street',
        birthDate: '1985-03-14',
      });
    });

    it('rejects an id that is not a UUID', async () => {
      await as('ADMIN').get(`${URL}/not-a-uuid`).expect(400);
    });

    it('tells the browser not to keep a copy', async () => {
      const one = await as('ADMIN').get(`${URL}/${maria}`).expect(200);
      expect(one.headers['cache-control']).toBe('no-store');
      const list = await as('ADMIN').get(URL).expect(200);
      expect(list.headers['cache-control']).toBe('no-store');
    });
  });

  describe('updating', () => {
    it('changes only the fields sent, and null clears an optional one', async () => {
      const response = await as('ADMIN')
        .patch(`${URL}/${maria}`)
        .send({ firstName: 'Mariel', phone: null })
        .expect(200);
      expect(response.body).toMatchObject({
        firstName: 'Mariel',
        lastName: 'Dela Cruz',
        phone: null,
        address: '1 Secret Street',
      });
    });

    it('refuses an empty update, a cleared required field and unknown fields', async () => {
      await as('ADMIN').patch(`${URL}/${maria}`).send({}).expect(400);
      await as('ADMIN').patch(`${URL}/${maria}`).send({ firstName: null }).expect(400);
      await as('ADMIN').patch(`${URL}/${maria}`).send({ clinicId: randomUUID() }).expect(400);
    });

    it('records when consent was given, and keeps that date', async () => {
      const given = await as('ADMIN').patch(`${URL}/${maria}`).send({ privacyConsent: true }).expect(200);
      expect(given.body.privacyConsentAt).toBeTruthy();

      const again = await as('ADMIN').patch(`${URL}/${maria}`).send({ privacyConsent: true }).expect(200);
      expect(again.body.privacyConsentAt).toBe(given.body.privacyConsentAt);

      const withdrawn = await as('ADMIN').patch(`${URL}/${maria}`).send({ privacyConsent: false }).expect(200);
      expect(withdrawn.body.privacyConsentAt).toBeNull();
    });
  });

  describe('archiving', () => {
    it('hides the patient from lists but keeps the record', async () => {
      await as('ADMIN').post(`${URL}/${maria}/archive`).expect(204);
      const list = await as('ADMIN').get(URL).expect(200);
      expect(list.body.total).toBe(0);
      const record = await as('ADMIN').get(`${URL}/${maria}`).expect(200);
      expect(record.body.archivedAt).toBeTruthy();
    });

    it('refuses changes to an archived patient', async () => {
      await as('ADMIN').post(`${URL}/${maria}/archive`).expect(204);
      await as('ADMIN').patch(`${URL}/${maria}`).send({ firstName: 'X' }).expect(409);
    });

    it('does nothing and logs nothing the second time', async () => {
      await as('ADMIN').post(`${URL}/${maria}/archive`).expect(204);
      const first = await owner.patient.findUniqueOrThrow({ where: { id: maria } });
      await as('ADMIN').post(`${URL}/${maria}/archive`).expect(204);
      const second = await owner.patient.findUniqueOrThrow({ where: { id: maria } });
      expect(second.archivedAt).toEqual(first.archivedAt);
      expect(await owner.auditLog.count({ where: { action: 'PATIENT_ARCHIVED' } })).toBe(1);
    });

    it('lists archived patients only when asked, so they can be found and restored', async () => {
      await as('ADMIN').post(URL).send(newPatient).expect(201);
      await as('ADMIN').post(`${URL}/${maria}/archive`).expect(204);

      const active = await as('ADMIN').get(URL).expect(200);
      expect(active.body.items.map((p: { lastName: string }) => p.lastName)).toEqual(['Penduko']);
      const archived = await as('RECEPTIONIST').get(URL).query({ archived: 'true' }).expect(200);
      expect(archived.body.items.map((p: { id: string }) => p.id)).toEqual([maria]);
      expect(archived.body.total).toBe(1);
      await as('ADMIN').get(URL).query({ archived: 'maybe' }).expect(400);
    });

    it('restores an archived patient to the list', async () => {
      await as('ADMIN').post(`${URL}/${maria}/archive`).expect(204);
      await as('ADMIN').post(`${URL}/${maria}/restore`).expect(204);
      const list = await as('ADMIN').get(URL).expect(200);
      expect(list.body.total).toBe(1);
      await as('ADMIN').patch(`${URL}/${maria}`).send({ firstName: 'Mariel' }).expect(200);
    });

    it('does nothing and logs nothing when restoring an active patient', async () => {
      await as('ADMIN').post(`${URL}/${maria}/restore`).expect(204);
      expect(await owner.auditLog.count({ where: { action: 'PATIENT_RESTORED' } })).toBe(0);
    });

  });

  describe('audit log', () => {
    // Logging in writes its own audit lines; these tests are about patient actions.
    const patientLogs = async () =>
      (await auditLogs()).filter((log) => log.action.startsWith('PATIENT_'));

    it('records who did what, for every action', async () => {
      const created = await as('ADMIN').post(URL).send(newPatient).expect(201);
      await as('ADMIN').get(URL).expect(200);
      await as('ADMIN').get(`${URL}/${maria}`).expect(200);
      await as('ADMIN').patch(`${URL}/${maria}`).send({ phone: '0900 000 0009' }).expect(200);
      await as('ADMIN').post(`${URL}/${maria}/archive`).expect(204);
      await as('ADMIN').post(`${URL}/${maria}/restore`).expect(204);

      const logs = await patientLogs();
      expect(logs.map(({ action, entityId }) => [action, entityId])).toEqual([
        ['PATIENT_CREATED', created.body.id],
        ['PATIENT_LISTED', null],
        ['PATIENT_VIEWED', maria],
        ['PATIENT_UPDATED', maria],
        ['PATIENT_ARCHIVED', maria],
        ['PATIENT_RESTORED', maria],
      ]);
      for (const log of logs) {
        expect(log.actorUserId).toBe(adminA);
      }
    });

    it('keeps the old and new value of each field that changed', async () => {
      await as('ADMIN')
        .patch(`${URL}/${maria}`)
        .send({
          firstName: 'Mariel',
          lastName: 'Dela Cruz', // unchanged, so not logged
          phone: null,
          birthDate: '1985-03-15',
          privacyConsent: true,
        })
        .expect(200);
      const [update] = await patientLogs();
      const changes = (update.metadata as { changes: Record<string, unknown> }).changes;
      expect(changes).toMatchObject({
        firstName: { from: 'Maria', to: 'Mariel' },
        phone: { from: '0900 000 0001', to: null },
        birthDate: { from: '1985-03-14', to: '1985-03-15' },
        privacyConsentAt: { from: null, to: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) },
      });
      expect(Object.keys(changes).sort()).toEqual(
        ['birthDate', 'firstName', 'phone', 'privacyConsentAt'].sort(),
      );
    });

    it('saves and logs nothing when an update changes nothing', async () => {
      const before = await owner.patient.findUniqueOrThrow({ where: { id: maria } });
      await as('ADMIN')
        .patch(`${URL}/${maria}`)
        .send({ firstName: 'Maria', birthDate: '1985-03-14' })
        .expect(200);
      const after = await owner.patient.findUniqueOrThrow({ where: { id: maria } });
      expect(after.updatedAt).toEqual(before.updatedAt);
      expect(await patientLogs()).toEqual([]);
    });

    it('never logs what was typed in the search box', async () => {
      await as('ADMIN').get(URL).query({ search: 'Penduko' }).expect(200);
      const [list] = await patientLogs();
      expect(list.metadata).toEqual({ sort: 'name', dir: 'asc', searched: true, archived: false, page: 1, resultCount: 0 });
    });

    it('logs nothing when a lookup finds no patient', async () => {
      await as('ADMIN').get(`${URL}/${randomUUID()}`).expect(404);
      expect(await patientLogs()).toEqual([]);
    });

    describe('when the log cannot be written', () => {
      beforeEach(async () => {
        await owner.$executeRaw`REVOKE INSERT ON audit_logs FROM dental_app`;
      });
      afterEach(async () => {
        await owner.$executeRaw`GRANT INSERT ON audit_logs TO dental_app`;
      });

      it('undoes the change instead of leaving it unrecorded', async () => {
        await as('ADMIN').post(URL).send(newPatient).expect(500);
        expect(await owner.patient.count({ where: { lastName: 'Penduko' } })).toBe(0);

        await as('ADMIN').patch(`${URL}/${maria}`).send({ firstName: 'X' }).expect(500);
        const stored = await owner.patient.findUniqueOrThrow({ where: { id: maria } });
        expect(stored.firstName).toBe('Maria');
      });

      it('shows nothing, rather than letting someone read without a trace', async () => {
        const response = await as('ADMIN').get(`${URL}/${maria}`).expect(500);
        expect(JSON.stringify(response.body)).not.toContain('Maria');
      });
    });
  });

  describe('reading the audit log', () => {
    const LOGS = '/api/v1/audit-logs';

    it('is for admins only', async () => {
      for (const role of ['DENTIST', 'RECEPTIONIST', 'ASSISTANT'] as const) {
        await as(role).get(LOGS).expect(403);
      }
      const response = await as('ADMIN').get(LOGS).expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it("gives one patient's history, newest first, with who did it", async () => {
      await as('ADMIN').get(`${URL}/${maria}`).expect(200);
      await as('DENTIST').patch(`${URL}/${maria}`).send({ firstName: 'Mariel' }).expect(200);
      await as('ADMIN').get(`${URL}/${randomUUID()}`).expect(404);

      const response = await as('ADMIN').get(LOGS).query({ entityId: maria }).expect(200);
      expect(response.body.total).toBe(2);
      const [newest, oldest] = response.body.items;
      expect(newest).toMatchObject({
        action: 'PATIENT_UPDATED',
        actor: { lastName: 'DENTIST', role: 'DENTIST' },
        metadata: { changes: { firstName: { from: 'Maria', to: 'Mariel' } } },
      });
      expect(oldest.action).toBe('PATIENT_VIEWED');
    });

    it('rejects unknown filters', async () => {
      await as('ADMIN').get(LOGS).query({ clinicId: randomUUID() }).expect(400);
      await as('ADMIN').get(LOGS).query({ action: 'NOT_AN_ACTION' }).expect(400);
    });
  });
});
