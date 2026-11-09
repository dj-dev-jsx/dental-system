import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SESSION_COOKIE } from '../src/auth/auth.types.js';
import { hashPassword } from '../src/auth/password.js';
import type { UserRole } from '../src/generated/prisma/client.js';
import { PATIENT_SESSION_COOKIE } from '../src/portal/portal.types.js';
import { ownerClient, resetDatabase } from './test-db.js';
import { at, cookieNamed, outbox, PATIENT_PASSWORD, STAFF_PASSWORD, startApp } from './portal-fixtures.js';

const P = '/api/v1/portal';
const URL = '/api/v1/appointments';
const ACCOUNTS = '/api/v1/patient-accounts';

// The clinic's side of online booking: requests from accounts nobody has linked yet, linking
// them to a patient record, and the emails patients get when staff answer.
describe('Online requests, staff side (e2e)', () => {
  let app: INestApplication;
  const owner = ownerClient();
  const cookies = {} as Record<'ADMIN' | 'RECEPTIONIST', string>;
  let santos: string;
  let receptionist: string;
  let maria: string;
  let rosa: string; // an online account, not linked to anyone
  let rosaCookie: string;
  let request_: string; // Rosa's online request
  let passwordHash: string;
  let patientHash: string;

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof cookies) => ({
    get: (url: string) => http().get(url).set('Cookie', cookies[who]),
    post: (url: string) => http().post(url).set('Cookie', cookies[who]),
    patch: (url: string) => http().patch(url).set('Cookie', cookies[who]),
  });
  const mails = () => outbox(app);

  async function addUser(role: UserRole, email: string, lastName: string) {
    const user = await owner.user.create({ data: { email, passwordHash, firstName: 'T', lastName, role } });
    if (role === 'DENTIST') return { id: user.id, cookie: '' };
    const res = await http().post('/api/v1/auth/login').send({ email, password: STAFF_PASSWORD }).expect(204);
    return { id: user.id, cookie: cookieNamed(res, SESSION_COOKIE)! };
  }

  async function onlineAccount(email: string, fields: Record<string, unknown> = {}) {
    return owner.patientAccount.create({
      data: {
        email,
        passwordHash,
        firstName: 'Rosa',
        lastName: 'Villanueva',
        birthDate: new Date('1995-05-05'),
        phone: '0900 000 0010',
        privacyConsentAt: new Date('2026-01-02T03:04:05Z'),
        emailVerifiedAt: new Date(),
        ...fields,
      },
    });
  }

  beforeAll(async () => {
    app = await startApp();
    passwordHash = await hashPassword(STAFF_PASSWORD);
    patientHash = await hashPassword(PATIENT_PASSWORD);
  });

  beforeEach(async () => {
    await resetDatabase(owner, { name: 'Clinic A', phone: '0900 111 1111', onlineBookingEnabled: true, opensAt: 540, closesAt: 720 });
    cookies.ADMIN = (await addUser('ADMIN', 'admin@a.example', 'Admin')).cookie;
    const desk = await addUser('RECEPTIONIST', 'desk@a.example', 'Desk');
    receptionist = desk.id;
    cookies.RECEPTIONIST = desk.cookie;
    santos = (await addUser('DENTIST', 'santos@a.example', 'Santos')).id;
    const patient = (firstName: string, lastName: string, fields: Record<string, unknown> = {}) =>
      owner.patient.create({ data: { firstName, lastName, birthDate: new Date('1990-01-01'), ...fields } });
    maria = (await patient('Maria', 'Dela Cruz')).id;

    // Rosa signs in and books online, the way a patient would.
    rosa = (await onlineAccount('rosa@example.test', { passwordHash: patientHash })).id;
    const login = await http().post(`${P}/login`).send({ email: 'rosa@example.test', password: PATIENT_PASSWORD }).expect(204);
    rosaCookie = cookieNamed(login, PATIENT_SESSION_COOKIE)!;
    request_ = (
      await http().post(`${P}/appointments`).set('Cookie', rosaCookie).send({ startsAt: at('09:00'), dentistId: santos, reason: 'Tooth ache' }).expect(201)
    ).body.id;
    mails().length = 0;
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  it('shows an online request with who asked, and no patient until it is linked', async () => {
    const { body } = await as('RECEPTIONIST').get(`${URL}/requests`).expect(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: request_,
      status: 'REQUESTED',
      patient: null,
      source: 'ONLINE',
      requester: {
        accountId: rosa,
        firstName: 'Rosa',
        lastName: 'Villanueva',
        email: 'rosa@example.test',
        phone: '0900 000 0010',
        birthDate: '1995-05-05',
        linked: false,
      },
      dentist: { id: santos, lastName: 'Santos' },
      conflict: null,
    });
    expect(body.items[0]).not.toHaveProperty('patientAccount');
    // Every other appointment view copes with an empty patient too.
    const day = at('09:00').slice(0, 10);
    const list = await as('RECEPTIONIST').get(URL).query({ from: day, to: day }).expect(200);
    expect(list.body.items[0]).toMatchObject({ id: request_, patient: null, source: 'ONLINE' });
    const one = await as('RECEPTIONIST').get(`${URL}/${request_}`).expect(200);
    expect(one.body.requester.accountId).toBe(rosa);
    // A booking made by staff says so.
    const staffMade = await as('RECEPTIONIST')
      .post(URL)
      .send({ patientId: maria, dentistId: santos, startsAt: at('10:00'), endsAt: at('10:30') })
      .expect(201);
    expect(staffMade.body).toMatchObject({ source: 'STAFF', requester: null, patient: { id: maria } });
    // The patient list's "next appointment" still works with patient-less requests around.
    await as('RECEPTIONIST').get('/api/v1/patients').query({ sort: 'nextAppointment' }).expect(200);
  });

  it('refuses to confirm until staff say who the patient is, then confirms and emails them', async () => {
    const refused = await as('RECEPTIONIST').post(`${URL}/${request_}/confirm`).expect(409);
    expect(refused.body.message).toBe('PATIENT_NOT_LINKED');
    expect(mails()).toHaveLength(0);

    const linked = await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/link`).send({ patientId: maria }).expect(200);
    expect(linked.body).toMatchObject({ id: rosa, patientId: maria, linkedAt: expect.any(String) });
    const stored = await owner.appointment.findUniqueOrThrow({ where: { id: request_ } });
    expect(stored.patientId).toBe(maria);

    const { body } = await as('RECEPTIONIST').post(`${URL}/${request_}/confirm`).expect(200);
    expect(body).toMatchObject({ status: 'CONFIRMED', patient: { id: maria }, requester: { linked: true } });
    expect(mails()).toHaveLength(1);
    expect(mails()[0]).toMatchObject({ kind: 'appointment-confirmed', to: 'rosa@example.test', from: '"Clinic A" <no-reply@localhost>' });
    expect(mails()[0].text).toContain('Dr. T Santos');
    expect(mails()[0].text).toContain('9:00');
    expect(mails()[0].text).toContain('http://localhost:5173/appointments');

    // Rosa now sees it as confirmed, and also what staff book for Maria's record.
    await as('RECEPTIONIST').post(URL).send({ patientId: maria, dentistId: santos, startsAt: at('10:00'), endsAt: at('10:30') }).expect(201);
    const mine = await http().get(`${P}/appointments`).set('Cookie', rosaCookie).expect(200);
    expect(mine.body.upcoming.map((a: { status: string }) => a.status)).toEqual(['CONFIRMED', 'CONFIRMED']);
  });

  it('emails the patient when staff decline, cancel or move an online appointment', async () => {
    await as('RECEPTIONIST').post(`${URL}/${request_}/decline`).send({ note: 'Dr. Santos is away that day' }).expect(200);
    expect(mails().at(-1)).toMatchObject({ kind: 'appointment-declined', to: 'rosa@example.test' });
    expect(mails().at(-1)!.text).toContain('Dr. Santos is away that day');
    expect(mails().at(-1)!.text).toContain('http://localhost:5173/book');

    const second = (await http().post(`${P}/appointments`).set('Cookie', rosaCookie).send({ startsAt: at('09:30'), reason: 'Again' }).expect(201)).body.id;
    mails().length = 0;
    await as('RECEPTIONIST').patch(`${URL}/${second}`).send({ reason: 'Only the reason' }).expect(200);
    expect(mails()).toHaveLength(0); // nothing the patient needs to know
    await as('RECEPTIONIST').patch(`${URL}/${second}`).send({ dentistId: santos, startsAt: at('11:00'), endsAt: at('11:30') }).expect(200);
    expect(mails().at(-1)).toMatchObject({ kind: 'appointment-changed', to: 'rosa@example.test' });
    expect(mails().at(-1)!.text).toContain('11:00');
    await as('RECEPTIONIST').post(`${URL}/${second}/cancel`).send({ note: 'Clinic closed' }).expect(200);
    expect(mails().at(-1)).toMatchObject({ kind: 'appointment-cancelled', to: 'rosa@example.test' });
    expect(mails()).toHaveLength(2);
  });

  it('emails nobody for a patient without a confirmed online account', async () => {
    const { body } = await as('RECEPTIONIST').post(URL).send({ patientId: maria, dentistId: santos, startsAt: at('10:00'), endsAt: at('10:30') }).expect(201);
    await as('RECEPTIONIST').post(`${URL}/${body.id}/cancel`).expect(200);
    // Linked to an account that never confirmed its email: still nobody.
    const unverified = await onlineAccount('new@example.test', { emailVerifiedAt: null });
    await as('RECEPTIONIST').post(`${ACCOUNTS}/${unverified.id}/link`).send({ patientId: maria }).expect(200);
    const again = await as('RECEPTIONIST').post(URL).send({ patientId: maria, dentistId: santos, startsAt: at('10:30'), endsAt: at('11:00') }).expect(201);
    await as('RECEPTIONIST').post(`${URL}/${again.body.id}/cancel`).expect(200);
    expect(mails()).toHaveLength(0);
    // A staff booking for a patient whose confirmed account is linked does get the email.
    await as('ADMIN').post(`${ACCOUNTS}/${unverified.id}/unlink`).expect(200);
    await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/link`).send({ patientId: maria }).expect(200);
    await as('RECEPTIONIST').post(`${URL}/${again.body.id}/cancel`).expect(409); // already cancelled
    const third = await as('RECEPTIONIST').post(URL).send({ patientId: maria, dentistId: santos, startsAt: at('11:00'), endsAt: at('11:30') }).expect(201);
    expect(mails()).toHaveLength(0); // booking directly is not announced
    await as('RECEPTIONIST').post(`${URL}/${third.body.id}/cancel`).expect(200);
    expect(mails().at(-1)).toMatchObject({ kind: 'appointment-cancelled', to: 'rosa@example.test' });
  });

  describe('accounts', () => {
    it('shows an account to staff only', async () => {
      const res = await as('RECEPTIONIST').get(`${ACCOUNTS}/${rosa}`).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        id: rosa,
        firstName: 'Rosa',
        lastName: 'Villanueva',
        email: 'rosa@example.test',
        phone: '0900 000 0010',
        birthDate: '1995-05-05',
        emailVerifiedAt: expect.any(String),
        createdAt: expect.any(String),
        patientId: null,
        linkedAt: null,
      });
      expect(JSON.stringify(res.body)).not.toMatch(/argon2|passwordHash|pendingRequest/);
      await as('RECEPTIONIST').get(`${ACCOUNTS}/${randomUUID()}`).expect(404);
      await as('RECEPTIONIST').get(`${ACCOUNTS}/nope`).expect(400);
      await http().get(`${ACCOUNTS}/${rosa}`).expect(401);
      await http().get(`${ACCOUNTS}/${rosa}`).set('Cookie', rosaCookie).expect(401);
      await http().post(`${ACCOUNTS}/${rosa}/link`).set('Cookie', rosaCookie).send({ patientId: maria }).expect(401);
    });

    it('suggests patients who might be the account holder, never linking on its own', async () => {
      const patient = (firstName: string, lastName: string, fields: Record<string, unknown>) =>
        owner.patient.create({ data: { firstName, lastName, birthDate: new Date('1980-01-01'), ...fields } });
      const sameBirthAndName = (await patient('Rosa', 'Villa-Nueva', { birthDate: new Date('1995-05-05') })).id;
      const samePhone = (await patient('R', 'Other', { phone: '+63 900-000-0010' })).id;
      const sameEmail = (await patient('R', 'Third', { email: 'Rosa@Example.test' })).id;
      await patient('Rosa', 'Villanueva', { birthDate: new Date('1995-05-05'), archivedAt: new Date() }); // archived
      await patient('Rosa', 'Santos', { birthDate: new Date('1995-05-05') }); // same birthday, different name
      const res = await as('RECEPTIONIST').get(`${ACCOUNTS}/${rosa}/matches`).expect(200);
      const byId = Object.fromEntries(res.body.items.map((m: { id: string }) => [m.id, m]));
      expect(Object.keys(byId).sort()).toEqual([sameBirthAndName, samePhone, sameEmail].sort());
      expect(byId[sameBirthAndName]).toMatchObject({ matchedOn: ['BIRTH_DATE_AND_NAME'], birthDate: '1995-05-05', hasOnlineAccount: false });
      expect(byId[samePhone].matchedOn).toEqual(['PHONE']);
      expect(byId[sameEmail].matchedOn).toEqual(['EMAIL']);
      expect(await owner.patientAccount.count({ where: { patientId: { not: null } } })).toBe(0);
      // At most five.
      for (let i = 0; i < 6; i++) await patient(`P${i}`, 'X', { phone: '0900 000 0010' });
      expect((await as('RECEPTIONIST').get(`${ACCOUNTS}/${rosa}/matches`).expect(200)).body.items).toHaveLength(5);
    });

    it('links only to an existing, active patient, once', async () => {
      await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/link`).send({ patientId: randomUUID() }).expect(400);
      await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/link`).send({}).expect(400);
      await owner.patient.update({ where: { id: maria }, data: { archivedAt: new Date() } });
      expect((await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/link`).send({ patientId: maria }).expect(409)).body.message).toBe('PATIENT_ARCHIVED');
      await owner.patient.update({ where: { id: maria }, data: { archivedAt: null } });
      await as('RECEPTIONIST').post(`${ACCOUNTS}/${randomUUID()}/link`).send({ patientId: maria }).expect(404);

      await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/link`).send({ patientId: maria }).expect(200);
      const twice = await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/link`).send({ patientId: maria }).expect(409);
      expect(twice.body.message).toBe('ALREADY_LINKED');
      // A patient record has at most one online account.
      const other = await onlineAccount('other@example.test');
      const taken = await as('RECEPTIONIST').post(`${ACCOUNTS}/${other.id}/link`).send({ patientId: maria }).expect(409);
      expect(taken.body.message).toBe('PATIENT_HAS_ACCOUNT');

      const line = await owner.auditLog.findFirstOrThrow({ where: { action: 'PATIENT_ACCOUNT_LINKED' } });
      expect(line).toMatchObject({ actorUserId: receptionist, actorPatientAccountId: null, entityId: maria });
      expect(line.metadata).toEqual({ accountId: rosa, appointmentsUpdated: 1 });
      // The patient record shows the account.
      const record = await as('RECEPTIONIST').get(`/api/v1/patients/${maria}`).expect(200);
      expect(record.body.onlineAccount).toEqual({ id: rosa, email: 'rosa@example.test', emailVerifiedAt: expect.any(String), linkedAt: expect.any(String) });
    });

    it('registers the account holder as a new patient and links them', async () => {
      const res = await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/create-patient`).expect(201);
      const created = await owner.patient.findUniqueOrThrow({ where: { id: res.body.patientId } });
      expect(res.body).toEqual({ patientId: created.id });
      expect(created).toMatchObject({
        firstName: 'Rosa',
        lastName: 'Villanueva',
        phone: '0900 000 0010',
        email: 'rosa@example.test',
        privacyConsentAt: new Date('2026-01-02T03:04:05Z'),
      });
      expect(created.birthDate.toISOString().slice(0, 10)).toBe('1995-05-05');
      expect((await owner.appointment.findUniqueOrThrow({ where: { id: request_ } })).patientId).toBe(created.id);
      expect((await owner.patientAccount.findUniqueOrThrow({ where: { id: rosa } })).linkedById).toBe(receptionist);
      expect((await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/create-patient`).expect(409)).body.message).toBe('ALREADY_LINKED');
      expect(await owner.patient.count({ where: { lastName: 'Villanueva' } })).toBe(1);
      const actions = (await owner.auditLog.findMany({ where: { actorUserId: receptionist } })).map((l) => l.action).sort();
      expect(actions).toEqual(['LOGIN_SUCCEEDED', 'PATIENT_ACCOUNT_LINKED', 'PATIENT_CREATED']);
      await as('RECEPTIONIST').post(`${URL}/${request_}/confirm`).expect(200);
    });

    it('lets only admins unlink, and appointments keep their patient', async () => {
      await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/link`).send({ patientId: maria }).expect(200);
      await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/unlink`).expect(403);
      const res = await as('ADMIN').post(`${ACCOUNTS}/${rosa}/unlink`).expect(200);
      expect(res.body).toMatchObject({ id: rosa, patientId: null, linkedAt: null });
      expect((await owner.appointment.findUniqueOrThrow({ where: { id: request_ } })).patientId).toBe(maria);
      expect((await as('ADMIN').post(`${ACCOUNTS}/${rosa}/unlink`).expect(409)).body.message).toBe('NOT_LINKED');
      const record = await as('ADMIN').get(`/api/v1/patients/${maria}`).expect(200);
      expect(record.body.onlineAccount).toBeNull();
      const line = await owner.auditLog.findFirstOrThrow({ where: { action: 'PATIENT_ACCOUNT_UNLINKED' } });
      expect(line).toMatchObject({ entityId: maria, metadata: { accountId: rosa } });
      // Rosa still sees the request she made herself.
      const mine = await http().get(`${P}/appointments`).set('Cookie', rosaCookie).expect(200);
      expect(mine.body.upcoming.map((a: { id: string }) => a.id)).toEqual([request_]);
    });
  });

  describe('activity log', () => {
    it('names patients as actors, and what their lines are about', async () => {
      const { body } = await as('ADMIN').get('/api/v1/audit-logs').expect(200);
      const requested = body.items.find((i: { action: string }) => i.action === 'APPOINTMENT_REQUESTED_ONLINE');
      expect(requested.actor).toEqual({ kind: 'patient', id: rosa, firstName: 'Rosa', lastName: 'Villanueva', role: 'PATIENT' });
      expect(requested.subject).toMatchObject({ kind: 'appointment', id: request_, name: 'Rosa Villanueva' });
      const staffLine = body.items.find((i: { action: string }) => i.action === 'LOGIN_SUCCEEDED');
      expect(staffLine.actor).toMatchObject({ kind: 'staff', role: expect.any(String) });
      expect(body.items.find((i: { action: string }) => i.action === 'PATIENT_LOGIN_SUCCEEDED').actor.kind).toBe('patient');

      // Sign-up lines name the account.
      await http().post(`${P}/register`).send({ firstName: 'Nina', lastName: 'New', birthDate: '2000-02-02', phone: '0917 555 0000', email: 'nina@example.test', password: 'nina-password-1', privacyConsent: true }).expect(202);
      const nina = await owner.patientAccount.findFirstOrThrow({ where: { email: 'nina@example.test' } });
      const after = await as('ADMIN').get('/api/v1/audit-logs').query({ action: 'PATIENT_ACCOUNT_REGISTERED' }).expect(200);
      expect(after.body.items[0].subject).toEqual({ kind: 'patientAccount', id: nina.id, name: 'Nina New' });

      // Filtering by person still means a staff member.
      const bySomeone = await as('ADMIN').get('/api/v1/audit-logs').query({ actorUserId: receptionist }).expect(200);
      expect(bySomeone.body.items.every((i: { actor: { kind: string; id: string } }) => i.actor.kind === 'staff' && i.actor.id === receptionist)).toBe(true);
      // Linking shows in the patient's own history.
      await as('RECEPTIONIST').post(`${ACCOUNTS}/${rosa}/link`).send({ patientId: maria }).expect(200);
      const history = await as('ADMIN').get('/api/v1/audit-logs').query({ entityId: maria }).expect(200);
      expect(history.body.items[0]).toMatchObject({ action: 'PATIENT_ACCOUNT_LINKED', subject: { kind: 'patient', id: maria } });
    });

    it('includes what the patient did in an appointment’s history', async () => {
      await http().post(`${P}/appointments/${request_}/cancel`).set('Cookie', rosaCookie).send({}).expect(200);
      const { body } = await as('RECEPTIONIST').get(`${URL}/${request_}/history`).expect(200);
      expect(body.items.map((i: { action: string }) => i.action)).toEqual(['APPOINTMENT_REQUESTED_ONLINE', 'APPOINTMENT_CANCELLED_BY_PATIENT']);
      expect(body.items[1].actor).toEqual({ kind: 'patient', id: rosa, firstName: 'Rosa', lastName: 'Villanueva', role: 'PATIENT' });
    });
  });
});
