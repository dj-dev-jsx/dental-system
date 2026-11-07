import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { hashPassword } from '../src/auth/password.js';
import { addDays, todayInManila } from '../src/common/manila.js';
import { configureApp } from '../src/configure-app.js';
import type { UserRole } from '../src/generated/prisma/client.js';
import { ownerClient, resetDatabase } from './test-db.js';

const PASSWORD = 'a-long-test-password';
const URL = '/api/v1/appointments';

// Appointments are always in the future, so the tests use dates counted from today.
const TOMORROW = addDays(todayInManila(), 1);
/** A Philippine time on a day relative to tomorrow, like at('09:00') or at('14:30', 2). */
const at = (time: string, dayOffset = 0) => `${addDays(TOMORROW, dayOffset)}T${time}:00+08:00`;

describe('Appointments (e2e)', () => {
  let app: INestApplication;
  let passwordHash: string;
  const owner = ownerClient();
  const cookies = {} as Record<'ADMIN' | 'RECEPTIONIST' | 'ADMIN_B', string>;
  let clinicA: string;
  let clinicB: string;
  let santos: string; // a Clinic A dentist
  let lim: string; // another Clinic A dentist
  let receptionist: string;
  let dentistB: string;
  let maria: string; // a Clinic A patient
  let bea: string; // a Clinic B patient

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof cookies) => ({
    get: (url: string) => http().get(url).set('Cookie', cookies[who]),
    post: (url: string) => http().post(url).set('Cookie', cookies[who]),
    patch: (url: string) => http().patch(url).set('Cookie', cookies[who]),
  });
  const audit = (action: string) =>
    owner.auditLog.findMany({ where: { action: action as never }, orderBy: { createdAt: 'asc' } });

  async function addUser(clinicId: string, role: UserRole, email: string, lastName: string) {
    const user = await owner.user.create({
      data: { clinicId, email, passwordHash, firstName: 'T', lastName, role },
    });
    if (role === 'DENTIST') return { id: user.id, cookie: '' };
    const response = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(204);
    const cookie = ([response.headers['set-cookie']].flat() as unknown as string[])[0].split(';')[0];
    return { id: user.id, cookie };
  }

  /** Staff booking for Maria with Dr. Santos, tomorrow from 9:00 to 9:30 unless told otherwise. */
  const book = (fields: Record<string, unknown> = {}, who: keyof typeof cookies = 'RECEPTIONIST') =>
    as(who)
      .post(URL)
      .send({ patientId: maria, dentistId: santos, startsAt: at('09:00'), endsAt: at('09:30'), ...fields });

  /** A request as online booking will make it: no dentist chosen yet. */
  const addRequest = (startsAt = at('10:00'), endsAt = at('10:30')) =>
    owner.appointment.create({
      data: {
        clinicId: clinicA,
        patientId: maria,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        reason: 'Tooth ache',
      },
    });

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
    cookies.ADMIN = (await addUser(clinicA, 'ADMIN', 'admin@a.example', 'Admin')).cookie;
    const desk = await addUser(clinicA, 'RECEPTIONIST', 'desk@a.example', 'Desk');
    receptionist = desk.id;
    cookies.RECEPTIONIST = desk.cookie;
    cookies.ADMIN_B = (await addUser(clinicB, 'ADMIN', 'admin@b.example', 'AdminB')).cookie;
    santos = (await addUser(clinicA, 'DENTIST', 'santos@a.example', 'Santos')).id;
    lim = (await addUser(clinicA, 'DENTIST', 'lim@a.example', 'Lim')).id;
    dentistB = (await addUser(clinicB, 'DENTIST', 'dentist@b.example', 'Bee')).id;
    const patient = (clinicId: string, firstName: string) =>
      owner.patient.create({
        data: { clinicId, firstName, lastName: 'Test', birthDate: new Date('1990-01-01') },
      });
    maria = (await patient(clinicA, 'Maria')).id;
    bea = (await patient(clinicB, 'Bea')).id;
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  it('requires a login for every route', async () => {
    const id = randomUUID();
    await http().get(URL).query({ from: TOMORROW, to: TOMORROW }).expect(401);
    await http().get(`${URL}/requests`).expect(401);
    await http().get(`${URL}/requests/count`).expect(401);
    await http().get(`${URL}/${id}`).expect(401);
    await http().post(URL).send({}).expect(401);
    await http().patch(`${URL}/${id}`).send({ reason: 'x' }).expect(401);
    await http().post(`${URL}/${id}/confirm`).expect(401);
    await http().post(`${URL}/${id}/decline`).expect(401);
    await http().post(`${URL}/${id}/cancel`).expect(401);
    await http().get(`/api/v1/patients/${maria}/appointments`).expect(401);
    await http().get('/api/v1/dentists').expect(401);
  });

  describe('booking', () => {
    it('confirms a booking made by staff straight away, and logs it', async () => {
      const response = await book({ reason: 'Cleaning' }).expect(201);
      expect(response.body).toMatchObject({
        status: 'CONFIRMED',
        reason: 'Cleaning',
        startsAt: new Date(at('09:00')).toISOString(),
        patient: { id: maria, firstName: 'Maria' },
        dentist: { id: santos, lastName: 'Santos' },
      });
      const [entry] = await audit('APPOINTMENT_CREATED');
      expect(entry).toMatchObject({ actorUserId: receptionist, entityId: response.body.id });
    });

    it('refuses to double-book a dentist, and says when they are busy', async () => {
      await book().expect(201);
      const clash = await book({ startsAt: at('09:15'), endsAt: at('09:45') }).expect(409);
      expect(clash.body.message).toBe(
        'Dr. Santos already has an appointment from 9:00 AM to 9:30 AM. Choose another time or dentist.',
      );
      // Back to back is fine, and so is another dentist at the same time.
      await book({ startsAt: at('09:30'), endsAt: at('10:00') }).expect(201);
      await book({ dentistId: lim }).expect(201);
    });

    it('lets only one of two bookings for the same slot through, even at the same instant', async () => {
      // Both checks for a clash can pass before either booking is saved. The database's
      // exclusion constraint is what stops the second one.
      const results = await Promise.all(Array.from({ length: 5 }, () => book()));
      const statuses = results.map((response) => response.status).sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      expect(await owner.appointment.count()).toBe(1);
    });

    it('refuses times that make no sense', async () => {
      const backwards = await book({ startsAt: at('10:00'), endsAt: at('09:00') }).expect(400);
      expect(backwards.body.message).toEqual(['endsAt: The appointment must end after it starts']);
      const yesterday = `${addDays(todayInManila(), -1)}T09:00:00+08:00`;
      const past = await book({ startsAt: yesterday, endsAt: at('09:00', -2) }).expect(400);
      expect(past.body.message).toContain('startsAt: That day has already passed');
      await book({ startsAt: at('08:00'), endsAt: at('17:00') }).expect(400); // 9 hours
      await book({ startsAt: at('09:00', 400), endsAt: at('09:30', 400) }).expect(400);
      // A time must say its time zone, so it can't be read as the wrong hour.
      await book({ startsAt: `${TOMORROW}T09:00:00`, endsAt: `${TOMORROW}T09:30:00` }).expect(400);
    });

    it('books only with a dentist of this clinic', async () => {
      const notADentist = await book({ dentistId: receptionist }).expect(400);
      expect(notADentist.body.message).toEqual(['dentistId: Choose one of the clinic’s dentists']);
      await book({ dentistId: dentistB }).expect(400);
      await owner.user.update({ where: { id: lim }, data: { isActive: false } });
      await book({ dentistId: lim }).expect(400);
    });

    it("won't book an archived patient", async () => {
      await owner.patient.update({ where: { id: maria }, data: { archivedAt: new Date() } });
      await book().expect(409);
    });

    it('refuses fields it does not expect, like a status', async () => {
      await book({ status: 'DECLINED' }).expect(400);
      await book({ clinicId: clinicB }).expect(400);
    });
  });

  describe('keeping clinics apart', () => {
    it("never shows or changes another clinic's appointments", async () => {
      const { body } = await book().expect(201);
      const list = await as('ADMIN_B').get(URL).query({ from: TOMORROW, to: TOMORROW }).expect(200);
      expect(list.body.items).toEqual([]);
      await as('ADMIN_B').get(`${URL}/${body.id}`).expect(404);
      await as('ADMIN_B').post(`${URL}/${body.id}/cancel`).expect(404);
      await as('ADMIN_B').patch(`${URL}/${body.id}`).send({ reason: 'x' }).expect(404);
      await as('ADMIN_B').get(`/api/v1/patients/${maria}/appointments`).expect(404);
      const stored = await owner.appointment.findUniqueOrThrow({ where: { id: body.id } });
      expect(stored.status).toBe('CONFIRMED');
    });

    it("can't book another clinic's patient or dentist", async () => {
      await book({ patientId: bea }).expect(400);
      await book({ patientId: bea, dentistId: dentistB }).expect(400);
      expect(await owner.appointment.count()).toBe(0);
    });

    it('lists only this clinic’s dentists, and only active ones', async () => {
      await owner.user.update({ where: { id: lim }, data: { isActive: false } });
      const { body } = await as('RECEPTIONIST').get('/api/v1/dentists').expect(200);
      expect(body.items).toEqual([{ id: santos, firstName: 'T', lastName: 'Santos' }]);
    });
  });

  describe('requests', () => {
    it('lists waiting requests and counts them', async () => {
      const waiting = await addRequest();
      await book().expect(201); // confirmed, so not a request
      const { body } = await as('RECEPTIONIST').get(`${URL}/requests`).expect(200);
      expect(body.items.map((item: { id: string }) => item.id)).toEqual([waiting.id]);
      expect(body.total).toBe(1);
      const count = await as('RECEPTIONIST').get(`${URL}/requests/count`).expect(200);
      expect(count.body).toEqual({ count: 1 });
    });

    it('needs a dentist before confirming', async () => {
      const waiting = await addRequest();
      const response = await as('RECEPTIONIST').post(`${URL}/${waiting.id}/confirm`).expect(400);
      expect(response.body.message).toEqual(['dentistId: Choose a dentist before confirming']);
    });

    it('confirms at another time agreed with the patient, and logs what changed', async () => {
      const waiting = await addRequest();
      const response = await as('RECEPTIONIST')
        .post(`${URL}/${waiting.id}/confirm`)
        .send({ dentistId: santos, startsAt: at('14:00'), endsAt: at('14:30') })
        .expect(200);
      expect(response.body).toMatchObject({ status: 'CONFIRMED', dentist: { id: santos } });
      const [entry] = await audit('APPOINTMENT_CONFIRMED');
      expect(entry.metadata).toEqual({
        changes: {
          status: { from: 'REQUESTED', to: 'CONFIRMED' },
          dentistId: { from: null, to: santos },
          startsAt: { from: new Date(at('10:00')).toISOString(), to: new Date(at('14:00')).toISOString() },
          endsAt: { from: new Date(at('10:30')).toISOString(), to: new Date(at('14:30')).toISOString() },
        },
      });
      // Confirming twice is refused, not done again.
      const again = await as('RECEPTIONIST').post(`${URL}/${waiting.id}/confirm`).expect(409);
      expect(again.body.message).toBe('This appointment is already confirmed.');
    });

    it("won't confirm a request into a time the dentist is busy", async () => {
      await book({ startsAt: at('10:00'), endsAt: at('11:00') }).expect(201);
      const waiting = await addRequest(at('10:30'), at('11:00'));
      await as('RECEPTIONIST').post(`${URL}/${waiting.id}/confirm`).send({ dentistId: santos }).expect(409);
      await as('RECEPTIONIST').post(`${URL}/${waiting.id}/confirm`).send({ dentistId: lim }).expect(200);
    });

    it("won't confirm a request whose time has passed without a new time", async () => {
      const yesterday = addDays(todayInManila(), -1);
      const stale = await addRequest(`${yesterday}T09:00:00+08:00`, `${yesterday}T09:30:00+08:00`);
      const response = await as('RECEPTIONIST')
        .post(`${URL}/${stale.id}/confirm`)
        .send({ dentistId: santos })
        .expect(400);
      expect(response.body.message).toEqual(['startsAt: That day has already passed']);
    });

    it('declines with a note, after which the request is closed', async () => {
      const waiting = await addRequest();
      const response = await as('RECEPTIONIST')
        .post(`${URL}/${waiting.id}/decline`)
        .send({ note: 'Clinic closed that day' })
        .expect(200);
      expect(response.body).toMatchObject({ status: 'DECLINED', statusNote: 'Clinic closed that day' });
      await as('RECEPTIONIST').post(`${URL}/${waiting.id}/confirm`).send({ dentistId: santos }).expect(409);
      await as('RECEPTIONIST').post(`${URL}/${waiting.id}/cancel`).expect(409);
      await as('RECEPTIONIST').patch(`${URL}/${waiting.id}`).send({ reason: 'x' }).expect(409);
    });

    it('declines only requests', async () => {
      const { body } = await book().expect(201);
      const response = await as('RECEPTIONIST').post(`${URL}/${body.id}/decline`).expect(409);
      expect(response.body.message).toBe('This appointment is already confirmed.');
    });
  });

  describe('changing a booking', () => {
    it('cancels with a note and frees the time for someone else', async () => {
      const { body } = await book().expect(201);
      await as('RECEPTIONIST').post(`${URL}/${body.id}/cancel`).send({ note: 'Patient called' }).expect(200);
      await book().expect(201);
      const [entry] = await audit('APPOINTMENT_CANCELLED');
      expect(entry.metadata).toEqual({
        changes: {
          status: { from: 'CONFIRMED', to: 'CANCELLED' },
          statusNote: { from: null, to: 'Patient called' },
        },
      });
    });

    it('moves a booking, logs old and new times, and refuses a move into a clash', async () => {
      const first = (await book().expect(201)).body;
      await book({ startsAt: at('11:00'), endsAt: at('11:30') }).expect(201);
      await as('RECEPTIONIST')
        .patch(`${URL}/${first.id}`)
        .send({ startsAt: at('11:15'), endsAt: at('11:45') })
        .expect(409);
      // Moving within its own time doesn't clash with itself.
      await as('RECEPTIONIST').patch(`${URL}/${first.id}`).send({ endsAt: at('09:45') }).expect(200);
      const [entry] = await audit('APPOINTMENT_UPDATED');
      expect(entry.metadata).toEqual({
        changes: {
          endsAt: { from: new Date(at('09:30')).toISOString(), to: new Date(at('09:45')).toISOString() },
        },
      });
    });

    it("doesn't log a change that changes nothing", async () => {
      const { body } = await book({ reason: 'Cleaning' }).expect(201);
      await as('RECEPTIONIST').patch(`${URL}/${body.id}`).send({ reason: 'Cleaning' }).expect(200);
      expect(await audit('APPOINTMENT_UPDATED')).toEqual([]);
    });

    it('keeps a dentist on a confirmed booking', async () => {
      const { body } = await book().expect(201);
      const response = await as('RECEPTIONIST').patch(`${URL}/${body.id}`).send({ dentistId: null }).expect(400);
      expect(response.body.message).toEqual(['dentistId: A confirmed appointment needs a dentist']);
    });
  });

  describe('schedules', () => {
    it('lists what overlaps the chosen days, in time order, and logs the look', async () => {
      const later = (await book({ startsAt: at('15:00'), endsAt: at('15:30') }).expect(201)).body;
      const earlier = (await book().expect(201)).body;
      const nextDay = (await book({ startsAt: at('09:00', 1), endsAt: at('09:30', 1) }).expect(201)).body;
      const request = await addRequest();

      const day = await as('RECEPTIONIST').get(URL).query({ from: TOMORROW, to: TOMORROW }).expect(200);
      expect(day.body.items.map((item: { id: string }) => item.id)).toEqual([earlier.id, request.id, later.id]);

      const confirmedOnly = await as('RECEPTIONIST')
        .get(URL)
        .query({ from: TOMORROW, to: addDays(TOMORROW, 6), status: 'CONFIRMED' })
        .expect(200);
      expect(confirmedOnly.body.items.map((item: { id: string }) => item.id)).toEqual([
        earlier.id,
        later.id,
        nextDay.id,
      ]);

      const [entry] = await audit('APPOINTMENT_LISTED');
      expect(entry.metadata).toEqual({ from: TOMORROW, to: TOMORROW, status: null, resultCount: 3 });
    });

    it('refuses a range that is backwards, too long, or has an unknown status', async () => {
      await as('RECEPTIONIST').get(URL).query({ from: TOMORROW, to: addDays(TOMORROW, -1) }).expect(400);
      await as('RECEPTIONIST').get(URL).query({ from: TOMORROW, to: addDays(TOMORROW, 42) }).expect(400);
      await as('RECEPTIONIST').get(URL).query({ from: TOMORROW, to: TOMORROW, status: 'MAYBE' }).expect(400);
      await as('RECEPTIONIST').get(URL).expect(400);
    });

    it("lists one patient's appointments, latest first, logged against the patient", async () => {
      const first = (await book().expect(201)).body;
      const second = (await book({ startsAt: at('09:00', 3), endsAt: at('09:30', 3) }).expect(201)).body;
      const { body } = await as('RECEPTIONIST').get(`/api/v1/patients/${maria}/appointments`).expect(200);
      expect(body.items.map((item: { id: string }) => item.id)).toEqual([second.id, first.id]);
      const [entry] = await audit('APPOINTMENT_LISTED');
      expect(entry.entityId).toBe(maria);
    });
  });

  describe('in the database itself', () => {
    it('refuses overlapping confirmed appointments even without the API', async () => {
      const row = {
        clinicId: clinicA,
        patientId: maria,
        dentistId: santos,
        status: 'CONFIRMED' as const,
      };
      await owner.appointment.create({
        data: { ...row, startsAt: new Date(at('09:00')), endsAt: new Date(at('10:00')) },
      });
      await expect(
        owner.appointment.create({
          data: { ...row, startsAt: new Date(at('09:30')), endsAt: new Date(at('10:30')) },
        }),
      ).rejects.toThrow(/23P01|exclusion constraint/);
      // Requests may overlap: they don't hold the dentist's time yet.
      await owner.appointment.create({
        data: { ...row, status: 'REQUESTED', startsAt: new Date(at('09:30')), endsAt: new Date(at('10:30')) },
      });
    });

    it('refuses an appointment that ends before it starts, or is confirmed without a dentist', async () => {
      const row = { clinicId: clinicA, patientId: maria };
      await expect(
        owner.appointment.create({
          data: { ...row, startsAt: new Date(at('10:00')), endsAt: new Date(at('09:00')) },
        }),
      ).rejects.toThrow(/23514|check constraint/);
      await expect(
        owner.appointment.create({
          data: { ...row, status: 'CONFIRMED', startsAt: new Date(at('09:00')), endsAt: new Date(at('10:00')) },
        }),
      ).rejects.toThrow(/23514|check constraint/);
    });

    it("won't link an appointment to another clinic's patient or dentist", async () => {
      const times = { startsAt: new Date(at('09:00')), endsAt: new Date(at('10:00')) };
      await expect(
        owner.appointment.create({ data: { clinicId: clinicA, patientId: bea, ...times } }),
      ).rejects.toThrow();
      await expect(
        owner.appointment.create({ data: { clinicId: clinicA, patientId: maria, dentistId: dentistB, ...times } }),
      ).rejects.toThrow();
    });
  });
});
