import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hashPassword } from '../src/auth/password.js';
import { addDays, todayInManila } from '../src/common/manila.js';
import { SESSION_COOKIE } from '../src/auth/auth.types.js';
import { PATIENT_SESSION_COOKIE } from '../src/portal/portal.types.js';
import { ownerClient, resetDatabase } from './test-db.js';
import {
  at,
  cookieNamed,
  outbox,
  PATIENT_PASSWORD,
  signUpBody,
  STAFF_PASSWORD,
  startApp,
  TOMORROW,
  tokenIn,
} from './portal-fixtures.js';

const A = '/api/v1/portal';

describe('Online booking, patient side (e2e)', () => {
  let app: INestApplication;
  const owner = ownerClient();
  let santos: string;
  let lim: string;
  let retired: string;
  let maria: string; // a patient record
  let staffCookie: string;
  let passwordHash: string;

  const http = () => request(app.getHttpServer());
  const mails = () => outbox(app);
  const lastMail = () => mails().at(-1)!;
  const as = (cookie: string) => ({
    get: (url: string) => http().get(url).set('Cookie', cookie),
    post: (url: string) => http().post(url).set('Cookie', cookie),
  });

  /** Signs up and clicks the link in the email: returns the patient cookie and what verify said. */
  async function signUp(fields: Record<string, unknown> = {}) {
    await http().post(`${A}/register`).send(signUpBody(fields)).expect(202);
    const response = await http().post(`${A}/verify`).send({ token: tokenIn(lastMail()) }).expect(200);
    return { cookie: cookieNamed(response, PATIENT_SESSION_COOKIE)!, body: response.body };
  }

  /** A verified account made straight in the database, signed in through the API. */
  async function account(email: string, fields: Record<string, unknown> = {}) {
    const row = await owner.patientAccount.create({
      data: {
        email,
        passwordHash,
        firstName: 'Ana',
        lastName: 'Online',
        birthDate: new Date('1990-01-01'),
        phone: '0917 000 0000',
        privacyConsentAt: new Date(),
        emailVerifiedAt: new Date(),
        ...fields,
      },
    });
    const response = await http().post(`${A}/login`).send({ email, password: PATIENT_PASSWORD }).expect(204);
    return { id: row.id, cookie: cookieNamed(response, PATIENT_SESSION_COOKIE)! };
  }

  const confirmed = (dentistId: string, startsAt: string, endsAt: string, patientId = maria) =>
    owner.appointment.create({
      data: { patientId, dentistId, startsAt: new Date(startsAt), endsAt: new Date(endsAt), status: 'CONFIRMED' },
    });

  beforeAll(async () => {
    app = await startApp();
    passwordHash = await hashPassword(PATIENT_PASSWORD);
  });

  beforeEach(async () => {
    // Open 9:00 to 12:00, 30-minute visits, so six times a day.
    await resetDatabase(owner, {
      name: 'Clinic A',
      phone: '0900 111 1111',
      address: '1 Test St',
      onlineBookingEnabled: true,
      opensAt: 540,
      closesAt: 720,
      defaultVisitMinutes: 30,
    });
    mails().length = 0;
    const staffHash = await hashPassword(STAFF_PASSWORD);
    const user = (email: string, lastName: string, role: 'DENTIST' | 'RECEPTIONIST', isActive = true) =>
      owner.user.create({ data: { email, passwordHash: staffHash, firstName: 'T', lastName, role, isActive } });
    santos = (await user('santos@a.example', 'Santos', 'DENTIST')).id;
    lim = (await user('lim@a.example', 'Lim', 'DENTIST')).id;
    retired = (await user('old@a.example', 'Retired', 'DENTIST', false)).id;
    await user('desk@a.example', 'Desk', 'RECEPTIONIST');
    const login = await http().post('/api/v1/auth/login').send({ email: 'desk@a.example', password: STAFF_PASSWORD }).expect(204);
    staffCookie = cookieNamed(login, SESSION_COOKIE)!;
    maria = (await owner.patient.create({ data: { firstName: 'Maria', lastName: 'Dela Cruz', birthDate: new Date('1985-03-14') } })).id;
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  describe('the clinic page and the booking switch', () => {
    it('shows the clinic page: hours, booking window and active dentists only', async () => {
      const res = await http().get(A).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        name: 'Clinic A',
        address: '1 Test St',
        phone: '0900 111 1111',
        email: null,
        opensAt: 540,
        closesAt: 720,
        defaultVisitMinutes: 30,
        slotMinutes: 30,
        firstBookableDate: TOMORROW,
        lastBookableDate: addDays(todayInManila(), 60),
        dentists: [
          { id: lim, firstName: 'T', lastName: 'Lim' },
          { id: santos, firstName: 'T', lastName: 'Santos' },
        ],
      });
    });

    it('answers 404 BOOKING_NOT_AVAILABLE on every route while booking is switched off', async () => {
      const someone = await account('ana@example.test');
      expect((await as(someone.cookie).get(`${A}/me`).expect(200)).body.email).toBe('ana@example.test');
      // Switching booking off closes it at once, even for a signed-in patient.
      await owner.clinicSettings.update({ where: { id: 1 }, data: { onlineBookingEnabled: false } });
      for (const base of [A]) {
        const checks = [
          () => http().get(base),
          () => http().get(`${base}/slots`).query({ date: TOMORROW }),
          () => http().post(`${base}/register`).send(signUpBody()),
          () => http().post(`${base}/verify`).send({ token: 'x' }),
          () => http().post(`${base}/resend-verification`).send({ email: 'a@b.example' }),
          () => http().post(`${base}/login`).send({ email: 'a@b.example', password: 'x' }),
          () => http().post(`${base}/forgot-password`).send({ email: 'a@b.example' }),
          () => http().post(`${base}/reset-password`).send({ token: 'x', newPassword: 'long-enough-1' }),
          () => as(someone.cookie).get(`${base}/me`),
          () => as(someone.cookie).post(`${base}/logout`),
          () => as(someone.cookie).get(`${base}/appointments`),
          () => as(someone.cookie).post(`${base}/appointments`).send({ startsAt: at('09:00'), dentistId: null, reason: 'x' }),
          () => as(someone.cookie).post(`${base}/appointments/${randomUUID()}/cancel`),
          () => http().get(`${base}/me`), // no cookie at all
        ];
        for (const check of checks) {
          const res = await check().expect(404);
          expect(res.body.message).toBe('BOOKING_NOT_AVAILABLE');
        }
      }
      // Back on, the same session works again. The old per-clinic addresses are gone.
      await owner.clinicSettings.update({ where: { id: 1 }, data: { onlineBookingEnabled: true } });
      expect((await as(someone.cookie).get(`${A}/me`).expect(200)).body.email).toBe('ana@example.test');
      await http().get('/api/v1/portal/clinic-a/slots').query({ date: TOMORROW }).expect(404);
    });
  });

  describe('free times', () => {
    const times = async (query: Record<string, string>) =>
      (await http().get(`${A}/slots`).query(query).expect(200)).body.slots.map((s: { startsAt: string }) => s.startsAt);

    it('offers every 30 minutes from opening, ending by closing', async () => {
      const res = await http().get(`${A}/slots`).query({ date: TOMORROW }).expect(200);
      expect(res.body.date).toBe(TOMORROW);
      expect(res.body.slots).toHaveLength(6);
      expect(res.body.slots[0]).toEqual({ startsAt: at('09:00'), endsAt: at('09:30') });
      expect(res.body.slots.at(-1)).toEqual({ startsAt: at('11:30'), endsAt: at('12:00') });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('leaves out times taken by confirmed appointments, and never says by whom', async () => {
      await confirmed(santos, at('09:00'), at('09:30'));
      // Lim is still free at 9:00, so "any dentist" keeps it; Santos doesn't have it.
      expect(await times({ date: TOMORROW })).toContain(at('09:00'));
      expect(await times({ date: TOMORROW, dentistId: santos })).not.toContain(at('09:00'));
      // An overlap of a few minutes is enough to take a time.
      await confirmed(lim, at('08:45'), at('09:10'));
      expect(await times({ date: TOMORROW })).not.toContain(at('09:00'));
      // Requests don't take anyone's time yet.
      await owner.appointment.create({ data: { patientId: maria, dentistId: santos, startsAt: new Date(at('10:00')), endsAt: new Date(at('10:30')) } });
      expect(await times({ date: TOMORROW, dentistId: santos })).toContain(at('10:00'));
      const raw = await http().get(`${A}/slots`).query({ date: TOMORROW }).expect(200);
      for (const slot of raw.body.slots) expect(Object.keys(slot).sort()).toEqual(['endsAt', 'startsAt']);
      expect(JSON.stringify(raw.body)).not.toMatch(/Santos|Lim|Maria|patient|dentist/i);
    });

    it('has no times outside the booking window or without dentists', async () => {
      expect(await times({ date: todayInManila() })).toEqual([]);
      expect(await times({ date: addDays(todayInManila(), 60) })).toHaveLength(6);
      expect(await times({ date: addDays(todayInManila(), 61) })).toEqual([]);
      expect(await times({ date: '2020-01-01' })).toEqual([]);
      await owner.user.updateMany({ where: { role: 'DENTIST' }, data: { isActive: false } });
      expect(await times({ date: TOMORROW })).toEqual([]);
    });

    it('refuses a bad date or a dentist who is not one of the active dentists', async () => {
      await http().get(`${A}/slots`).expect(400);
      await http().get(`${A}/slots`).query({ date: '2026-13-01' }).expect(400);
      await http().get(`${A}/slots`).query({ date: TOMORROW, other: '1' }).expect(400);
      for (const dentistId of [retired, randomUUID()]) {
        await http().get(`${A}/slots`).query({ date: TOMORROW, dentistId }).expect(400);
      }
      await http().get(`${A}/slots`).query({ date: TOMORROW, dentistId: 'nope' }).expect(400);
    });
  });

  describe('signing up', () => {
    // A function, because the dentist's id only exists once beforeEach has run.
    let request: { startsAt: string; dentistId: string; reason: string };
    beforeEach(() => {
      request = { startsAt: at('10:00'), dentistId: santos, reason: 'Tooth ache' };
    });

    it('creates an unconfirmed account, emails a link, and books the request once the link is clicked', async () => {
      const res = await http().post(`${A}/register`).send(signUpBody({ email: ' Rosa@Example.TEST ', request })).expect(202);
      expect(res.body).toEqual({});
      const stored = await owner.patientAccount.findFirstOrThrow();
      expect(stored).toMatchObject({ email: 'rosa@example.test', emailVerifiedAt: null, patientId: null });
      expect(stored.privacyConsentAt).toBeInstanceOf(Date);
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      expect(stored.pendingRequest).toEqual({ startsAt: at('10:00'), dentistId: santos, reason: 'Tooth ache' });
      expect(await owner.appointment.count()).toBe(0); // nothing reaches the clinic before the email is confirmed

      expect(mails()).toHaveLength(1);
      const mail = mails()[0];
      expect(mail).toMatchObject({ kind: 'verify-email', to: 'rosa@example.test', from: '"Clinic A" <no-reply@localhost>' });
      expect(mail.text).toContain('http://localhost:5173/verify?token=');
      expect(mail.text).toContain('0900 111 1111'); // the clinic's phone, in the footer
      expect(mail.html).toContain('Clinic A');
      // The token is only stored as a hash.
      const token = tokenIn(mail);
      expect(JSON.stringify(await owner.patientToken.findMany())).not.toContain(token);

      // Unconfirmed accounts can't sign in, even with the right password.
      const blocked = await http().post(`${A}/login`).send({ email: 'rosa@example.test', password: PATIENT_PASSWORD }).expect(403);
      expect(blocked.body.message).toBe('EMAIL_NOT_VERIFIED');

      const verified = await http().post(`${A}/verify`).send({ token }).expect(200);
      expect(verified.headers['cache-control']).toBe('no-store');
      const cookie = ([verified.headers['set-cookie']].flat() as string[]).find((c) => c.startsWith(`${PATIENT_SESSION_COOKIE}=`))!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(verified.body).toEqual({
        account: { id: stored.id, firstName: 'Rosa', lastName: 'Villanueva', email: 'rosa@example.test', phone: '0900 000 0010', birthDate: '1995-05-05' },
        request: {
          id: expect.any(String),
          startsAt: at('10:00'),
          endsAt: at('10:30'),
          status: 'REQUESTED',
          reason: 'Tooth ache',
          statusNote: null,
          dentist: { firstName: 'T', lastName: 'Santos' },
          canCancel: true,
        },
      });
      const appointment = await owner.appointment.findFirstOrThrow();
      expect(appointment).toMatchObject({ status: 'REQUESTED', patientId: null, patientAccountId: stored.id, dentistId: santos });
      const after = await owner.patientAccount.findFirstOrThrow();
      expect(after.emailVerifiedAt).toBeInstanceOf(Date);
      expect(after.pendingRequest).toBeNull();
      expect(lastMail()).toMatchObject({ kind: 'request-received', to: 'rosa@example.test' });

      // Signed in by the link.
      const me = await as(cookieNamed(verified, PATIENT_SESSION_COOKIE)!).get(`${A}/me`).expect(200);
      expect(me.body.email).toBe('rosa@example.test');
      expect(me.headers['cache-control']).toBe('no-store');

      // A link works once.
      const again = await http().post(`${A}/verify`).send({ token }).expect(400);
      expect(again.body.message).toBe('TOKEN_INVALID');

      // Every step is in the clinic's log, done by the patient's account rather than a staff member.
      const lines = await owner.auditLog.findMany({ where: { NOT: { action: 'LOGIN_SUCCEEDED' } } }); // not the staff login in beforeEach
      // Lines written in one transaction share a time, so their order among themselves isn't fixed.
      expect(lines.map((l) => l.action).sort()).toEqual(
        ['PATIENT_ACCOUNT_REGISTERED', 'PATIENT_LOGIN_FAILED', 'PATIENT_EMAIL_VERIFIED', 'APPOINTMENT_REQUESTED_ONLINE', 'PATIENT_LOGIN_SUCCEEDED'].sort(),
      );
      for (const line of lines) {
        expect(line).toMatchObject({ actorUserId: null, actorPatientAccountId: stored.id });
      }
      expect(JSON.stringify(lines)).not.toContain(PATIENT_PASSWORD);
    });

    it('works without a request, and verify then returns request: null', async () => {
      const { body } = await signUp();
      expect(body.request).toBeNull();
      expect(await owner.appointment.count()).toBe(0);
    });

    it('drops a request whose time passed before the link was clicked', async () => {
      await http().post(`${A}/register`).send(signUpBody({ request })).expect(202);
      await owner.patientAccount.updateMany({
        data: { pendingRequest: { startsAt: new Date(Date.now() - 60_000).toISOString(), dentistId: null, reason: 'Late' } },
      });
      const res = await http().post(`${A}/verify`).send({ token: tokenIn(lastMail()) }).expect(200);
      expect(res.body.request).toBeNull();
      expect(await owner.appointment.count()).toBe(0);
    });

    it('never reveals whether an email already has an account, and changes nothing', async () => {
      await signUp();
      const before = await owner.patientAccount.findFirstOrThrow();
      mails().length = 0;
      const res = await http()
        .post(`${A}/register`)
        .send(signUpBody({ firstName: 'Mallory', password: 'another-password', email: 'ROSA@example.test', request }))
        .expect(202);
      expect(res.body).toEqual({});
      expect(await owner.patientAccount.count()).toBe(1);
      const after = await owner.patientAccount.findFirstOrThrow();
      expect(after).toEqual(before);
      expect(await owner.appointment.count()).toBe(0);
      // Only the owner of the address hears about it.
      expect(mails()).toHaveLength(1);
      expect(lastMail()).toMatchObject({ kind: 'already-registered', to: 'rosa@example.test' });
      expect(lastMail().text).not.toContain('verify?token=');
      expect(lastMail().text).toContain('http://localhost:5173/sign-in');
      await http().post(`${A}/login`).send({ email: 'rosa@example.test', password: 'another-password' }).expect(401);
    });

    it('sends a fresh confirmation link to an existing account that never confirmed', async () => {
      await http().post(`${A}/register`).send(signUpBody()).expect(202);
      await http().post(`${A}/register`).send(signUpBody({ firstName: 'Other' })).expect(202);
      expect(lastMail().kind).toBe('already-registered');
      expect(lastMail().text).toContain('http://localhost:5173/verify?token=');
      await http().post(`${A}/verify`).send({ token: tokenIn(lastMail()) }).expect(200);
      expect((await owner.patientAccount.findFirstOrThrow()).firstName).toBe('Rosa');
    });

    it('checks what is sent before creating anything', async () => {
      const bad = [
        signUpBody({ privacyConsent: false }),
        signUpBody({ privacyConsent: undefined }),
        signUpBody({ password: 'too-short' }),
        signUpBody({ password: 'x'.repeat(129) }),
        signUpBody({ email: 'nope' }),
        signUpBody({ phone: 'call me' }),
        signUpBody({ birthDate: addDays(todayInManila(), 1) }),
        signUpBody({ firstName: '' }),
        signUpBody({ patientId: maria }),
        signUpBody({ request: { ...request, reason: '' } }),
        signUpBody({ request: { ...request, startsAt: 'tomorrow' } }),
      ];
      for (const body of bad) await http().post(`${A}/register`).send(body).expect(400);
      // A time that isn't on the grid, or isn't bookable.
      for (const startsAt of [at('09:10'), at('08:30'), at('11:45'), at('12:00'), new Date(`${todayInManila()}T10:00:00+08:00`).toISOString(), at('10:00', 60)]) {
        const res = await http().post(`${A}/register`).send(signUpBody({ request: { ...request, startsAt } })).expect(400);
        expect(res.body.message).toBe('SLOT_NOT_AVAILABLE');
      }
      await http().post(`${A}/register`).send(signUpBody({ request: { ...request, dentistId: retired } })).expect(400);
      expect(await owner.patientAccount.count()).toBe(0);
      expect(mails()).toHaveLength(0);
    });

    it('refuses a bad, used, expired or wrong-purpose link', async () => {
      await http().post(`${A}/verify`).send({ token: 'made-up' }).expect(400);
      await http().post(`${A}/verify`).send({}).expect(400);
      await http().post(`${A}/register`).send(signUpBody()).expect(202);
      const token = tokenIn(lastMail());
      await owner.patientToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await http().post(`${A}/verify`).send({ token }).expect(400)).body.message).toBe('TOKEN_INVALID');
      // A reset link can't confirm an email, and a used link can't be used again.
      await http().post(`${A}/forgot-password`).send({ email: 'rosa@example.test' }).expect(202);
      const reset = tokenIn(lastMail());
      await http().post(`${A}/verify`).send({ token: reset }).expect(400);
      await http().post(`${A}/resend-verification`).send({ email: 'rosa@example.test' }).expect(202);
      const fresh = tokenIn(lastMail());
      await http().post(`${A}/verify`).send({ token: fresh }).expect(200);
      await http().post(`${A}/verify`).send({ token: fresh }).expect(400);
    });

    it('resends the confirmation link only to accounts that need it, answering the same either way', async () => {
      await http().post(`${A}/register`).send(signUpBody()).expect(202);
      mails().length = 0;
      expect((await http().post(`${A}/resend-verification`).send({ email: 'rosa@example.test' }).expect(202)).body).toEqual({});
      expect(lastMail().kind).toBe('verify-email');
      await http().post(`${A}/resend-verification`).send({ email: 'nobody@example.test' }).expect(202);
      await account('done@example.test');
      await http().post(`${A}/resend-verification`).send({ email: 'done@example.test' }).expect(202);
      expect(mails()).toHaveLength(1);
    });
  });

  describe('signing in', () => {
    it('answers a wrong password and an unknown email identically', async () => {
      await account('ana@example.test');
      const wrong = await http().post(`${A}/login`).send({ email: 'ana@example.test', password: 'wrong-password' }).expect(401);
      const unknown = await http().post(`${A}/login`).send({ email: 'nobody@example.test', password: 'wrong-password' }).expect(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.message).toBe('Invalid email or password');
    });

    it('locks the account after 5 wrong passwords, even for the right one, then lets them in after', async () => {
      const { id } = await account('ana@example.test');
      for (let i = 0; i < 5; i++) {
        await http().post(`${A}/login`).send({ email: 'ana@example.test', password: 'wrong-password' }).expect(401);
      }
      await http().post(`${A}/login`).send({ email: 'ana@example.test', password: PATIENT_PASSWORD }).expect(401);
      const locked = await owner.patientAccount.findUniqueOrThrow({ where: { id } });
      expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
      const reasons = (await owner.auditLog.findMany({ where: { action: 'PATIENT_LOGIN_FAILED' }, orderBy: { createdAt: 'asc' } })).map((l) => l.metadata);
      expect(reasons.at(-2)).toEqual({ reason: 'WRONG_PASSWORD', accountLocked: true });
      expect(reasons.at(-1)).toEqual({ reason: 'ACCOUNT_LOCKED' });
      await owner.patientAccount.update({ where: { id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
      await http().post(`${A}/login`).send({ email: 'ana@example.test', password: PATIENT_PASSWORD }).expect(204);
    });

    it('keeps sessions as hashes, ends them on logout, and refuses expired or made-up ones', async () => {
      const { id, cookie } = await account('ana@example.test');
      const session = await owner.patientSession.findFirstOrThrow({ where: { accountId: id } });
      expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(cookie).not.toContain(session.tokenHash);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 864e5);
      const out = await as(cookie).post(`${A}/logout`).expect(204);
      expect(([out.headers['set-cookie']].flat() as string[]).join()).toContain(`${PATIENT_SESSION_COOKIE}=;`);
      await as(cookie).get(`${A}/me`).expect(401);
      expect(await owner.patientSession.count()).toBe(0);
      expect(await owner.auditLog.count({ where: { action: 'PATIENT_LOGOUT', actorPatientAccountId: id } })).toBe(1);

      const again = await account('bo@example.test');
      await owner.patientSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      await as(again.cookie).get(`${A}/me`).expect(401);
      await as(`${PATIENT_SESSION_COOKIE}=made-up`).get(`${A}/me`).expect(401);
      await http().get(`${A}/me`).expect(401);
    });

    it('resets a password from the emailed link once, ends every session and clears the lock', async () => {
      const { id, cookie } = await account('ana@example.test');
      await owner.patientAccount.update({ where: { id }, data: { lockedUntil: new Date(Date.now() + 600_000) } });
      mails().length = 0;
      expect((await http().post(`${A}/forgot-password`).send({ email: 'ANA@example.test' }).expect(202)).body).toEqual({});
      expect(lastMail()).toMatchObject({ kind: 'reset-password', to: 'ana@example.test' });
      expect(lastMail().text).toContain('http://localhost:5173/reset-password?token=');
      const token = tokenIn(lastMail());
      await http().post(`${A}/reset-password`).send({ token, newPassword: 'short' }).expect(400);
      await http().post(`${A}/reset-password`).send({ token, newPassword: 'a-brand-new-password' }).expect(204);
      await as(cookie).get(`${A}/me`).expect(401); // signed out everywhere
      const reused = await http().post(`${A}/reset-password`).send({ token, newPassword: 'yet-another-password' }).expect(400);
      expect(reused.body.message).toBe('TOKEN_INVALID');
      await http().post(`${A}/login`).send({ email: 'ana@example.test', password: PATIENT_PASSWORD }).expect(401);
      await http().post(`${A}/login`).send({ email: 'ana@example.test', password: 'a-brand-new-password' }).expect(204);
      const line = await owner.auditLog.findFirstOrThrow({ where: { action: 'PATIENT_PASSWORD_RESET' } });
      expect(line).toMatchObject({ actorPatientAccountId: id, entityId: id });
      expect(JSON.stringify(line)).not.toContain('a-brand-new-password');
      // An unknown email gets the same answer and no email.
      mails().length = 0;
      await http().post(`${A}/forgot-password`).send({ email: 'nobody@example.test' }).expect(202);
      expect(mails()).toHaveLength(0);
    });

    it('confirms the email of an account that resets its password, and books its pending request', async () => {
      await http().post(`${A}/register`).send(signUpBody({ request: { startsAt: at('09:30'), dentistId: null, reason: 'Cleaning' } })).expect(202);
      await http().post(`${A}/forgot-password`).send({ email: 'rosa@example.test' }).expect(202);
      await http().post(`${A}/reset-password`).send({ token: tokenIn(lastMail()), newPassword: 'a-brand-new-password' }).expect(204);
      await http().post(`${A}/login`).send({ email: 'rosa@example.test', password: 'a-brand-new-password' }).expect(204);
      expect(await owner.appointment.count({ where: { status: 'REQUESTED', dentistId: null } })).toBe(1);
    });

    it('accepts only the patient cookie on patient routes and only the staff cookie on staff routes', async () => {
      const { cookie } = await account('ana@example.test');
      const patientToken = cookie.split('=')[1];
      const staffToken = staffCookie.split('=')[1];
      // A patient's cookie opens no staff route, even renamed to the staff cookie's name.
      await as(cookie).get('/api/v1/auth/me').expect(401);
      await as(cookie).get('/api/v1/appointments/requests').expect(401);
      await as(cookie).get(`/api/v1/patients/${maria}`).expect(401);
      await as(`${SESSION_COOKIE}=${patientToken}`).get('/api/v1/auth/me').expect(401);
      // And a staff cookie opens no patient route.
      await as(staffCookie).get(`${A}/me`).expect(401);
      await as(staffCookie).get(`${A}/appointments`).expect(401);
      await as(`${PATIENT_SESSION_COOKIE}=${staffToken}`).get(`${A}/me`).expect(401);
      // Each still works where it belongs, even when the browser sends both.
      await as(`${cookie}; ${staffCookie}`).get(`${A}/me`).expect(200);
      await as(`${cookie}; ${staffCookie}`).get('/api/v1/auth/me').expect(200);
    });

  });

  describe('booking and my appointments', () => {
    const ask = (cookie: string, fields: Record<string, unknown> = {}) =>
      as(cookie).post(`${A}/appointments`).send({ startsAt: at('09:00'), dentistId: null, reason: 'Check-up', ...fields });

    it('books a free time as a request and emails that it was received', async () => {
      const { id, cookie } = await account('ana@example.test');
      mails().length = 0;
      const res = await ask(cookie, { dentistId: lim, reason: '  Cleaning  ' }).expect(201);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        id: expect.any(String),
        startsAt: at('09:00'),
        endsAt: at('09:30'),
        status: 'REQUESTED',
        reason: 'Cleaning',
        statusNote: null,
        dentist: { firstName: 'T', lastName: 'Lim' },
        canCancel: true,
      });
      expect(await owner.appointment.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject({
        patientAccountId: id,
        patientId: null,
        status: 'REQUESTED',
      });
      expect(lastMail()).toMatchObject({ kind: 'request-received', to: 'ana@example.test' });
      expect(await owner.auditLog.count({ where: { action: 'APPOINTMENT_REQUESTED_ONLINE', actorPatientAccountId: id, entityId: res.body.id } })).toBe(1);
      // Accepts a time written with an offset too.
      await ask(cookie, { startsAt: `${TOMORROW}T10:00:00+08:00` }).expect(201);
    });

    it('refuses times /slots would not offer, and dentists who can’t be booked', async () => {
      const { cookie } = await account('ana@example.test');
      for (const startsAt of [at('09:15'), at('08:30'), at('11:45'), at('12:00'), new Date(`${todayInManila()}T10:00:00+08:00`).toISOString(), at('09:00', 60), new Date(Date.parse(at('09:00')) + 30_000).toISOString()]) {
        const res = await ask(cookie, { startsAt }).expect(400);
        expect(res.body.message).toBe('SLOT_NOT_AVAILABLE');
      }
      for (const dentistId of [retired, randomUUID()]) await ask(cookie, { dentistId }).expect(400);
      await ask(cookie, { reason: '' }).expect(400);
      await ask(cookie, { reason: 'x'.repeat(501) }).expect(400);
      await ask(cookie, { status: 'CONFIRMED' }).expect(400);
      await ask(cookie, { patientId: maria }).expect(400);
      // Taken by a confirmed appointment: with that dentist, or with every dentist.
      await confirmed(santos, at('10:00'), at('10:30'));
      const taken = await ask(cookie, { startsAt: at('10:00'), dentistId: santos }).expect(409);
      expect(taken.body.message).toBe('SLOT_TAKEN');
      await ask(cookie, { startsAt: at('10:00') }).expect(201); // Lim is free
      await confirmed(lim, at('10:00'), at('10:30'));
      expect((await ask(cookie, { startsAt: at('10:00') }).expect(409)).body.message).toBe('SLOT_TAKEN');
      expect(await owner.appointment.count({ where: { status: 'REQUESTED' } })).toBe(1);
    });

    it('allows at most 3 requests waiting at once', async () => {
      const { cookie } = await account('ana@example.test');
      for (const time of ['09:00', '09:30', '10:00']) await ask(cookie, { startsAt: at(time) }).expect(201);
      const res = await ask(cookie, { startsAt: at('10:30') }).expect(409);
      expect(res.body.message).toBe('TOO_MANY_REQUESTS');
      // Once one is answered (or cancelled), another can be asked for.
      await owner.appointment.updateMany({ where: { startsAt: new Date(at('09:00')) }, data: { status: 'DECLINED' } });
      await ask(cookie, { startsAt: at('10:30') }).expect(201);
    });

    it('lists only my own appointments: upcoming soonest first, past newest first', async () => {
      const linked = await account('maria@example.test', { patientId: maria, linkedAt: new Date(), linkedById: (await owner.user.findFirstOrThrow({ where: { role: 'RECEPTIONIST' } })).id });
      const other = await account('other@example.test');
      const mine = (await ask(linked.cookie, { startsAt: at('11:00', 1) }).expect(201)).body.id;
      const theirs = (await ask(other.cookie, { startsAt: at('09:00') }).expect(201)).body.id;
      // Made by staff for Maria's record: hers too, because her account is linked to it.
      const byStaff = (await confirmed(santos, at('09:00'), at('09:30'))).id;
      const past = await owner.appointment.create({ data: { patientId: maria, dentistId: santos, status: 'CONFIRMED', startsAt: new Date(Date.now() - 864e5), endsAt: new Date(Date.now() - 864e5 + 18e5) } });
      const cancelled = await owner.appointment.create({ data: { patientId: maria, status: 'CANCELLED', startsAt: new Date(at('11:00', 2)), endsAt: new Date(at('11:30', 2)) } });
      // Another patient's record.
      const juan = await owner.patient.create({ data: { firstName: 'Juan', lastName: 'X', birthDate: new Date('1980-01-01') } });
      await confirmed(lim, at('11:00'), at('11:30'), juan.id);

      const res = await as(linked.cookie).get(`${A}/appointments`).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.upcoming.map((a: { id: string }) => a.id)).toEqual([byStaff, mine]);
      expect(res.body.past.map((a: { id: string }) => a.id)).toEqual([cancelled.id, past.id]);
      expect(res.body.past[1].canCancel).toBe(false);
      expect(Object.keys(res.body.upcoming[0]).sort()).toEqual(['canCancel', 'dentist', 'endsAt', 'id', 'reason', 'startsAt', 'status', 'statusNote']);
      expect(JSON.stringify(res.body)).not.toContain(theirs);

      const otherList = await as(other.cookie).get(`${A}/appointments`).expect(200);
      expect(otherList.body.upcoming.map((a: { id: string }) => a.id)).toEqual([theirs]);
      expect(otherList.body.past).toEqual([]);
    });

    it('cancels my own appointment, and treats anyone else’s as not found', async () => {
      const { id, cookie } = await account('ana@example.test');
      const other = await account('other@example.test');
      const mine = (await ask(cookie).expect(201)).body.id;
      const theirs = (await ask(other.cookie).expect(201)).body.id;
      const staffMade = (await confirmed(santos, at('10:00'), at('10:30'))).id; // Maria's, not linked to anyone

      for (const notMine of [theirs, staffMade, randomUUID()]) {
        const res = await as(cookie).post(`${A}/appointments/${notMine}/cancel`).send({}).expect(404);
        expect(res.body.message).toBe('Appointment not found');
      }
      await as(cookie).post(`${A}/appointments/not-a-uuid/cancel`).expect(400);
      expect(await owner.appointment.count({ where: { status: 'CANCELLED' } })).toBe(0);

      const res = await as(cookie).post(`${A}/appointments/${mine}/cancel`).send({ reason: 'Feeling better' }).expect(200);
      expect(res.body).toMatchObject({ id: mine, status: 'CANCELLED', statusNote: 'Feeling better', canCancel: false });
      const again = await as(cookie).post(`${A}/appointments/${mine}/cancel`).expect(409);
      expect(again.body.message).toBe('CANNOT_CANCEL');
      await as(cookie).post(`${A}/appointments/${theirs}/cancel`).send({ reason: 'x'.repeat(501) }).expect(400);
      const line = await owner.auditLog.findFirstOrThrow({ where: { action: 'APPOINTMENT_CANCELLED_BY_PATIENT' } });
      expect(line).toMatchObject({ entityId: mine, actorPatientAccountId: id, actorUserId: null });
      expect(line.metadata).toEqual({
        changes: { status: { from: 'REQUESTED', to: 'CANCELLED' }, statusNote: { from: null, to: 'Feeling better' } },
      });
      // One that has already started can't be cancelled online.
      const started = await owner.appointment.create({ data: { patientAccountId: id, startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 60_000) } });
      expect((await as(cookie).post(`${A}/appointments/${started.id}/cancel`).expect(409)).body.message).toBe('CANNOT_CANCEL');
    });

    it('shows the signed-in patient only their own details', async () => {
      const { id, cookie } = await account('ana@example.test', { patientId: maria, linkedAt: new Date(), linkedById: (await owner.user.findFirstOrThrow({ where: { role: 'RECEPTIONIST' } })).id });
      const res = await as(cookie).get(`${A}/me`).expect(200);
      expect(res.body).toEqual({ id, firstName: 'Ana', lastName: 'Online', email: 'ana@example.test', phone: '0917 000 0000', birthDate: '1990-01-01' });
    });
  });

  describe('database rules', () => {
    it('names exactly one actor on every audit line', async () => {
      const { id } = await account('ana@example.test');
      const staff = await owner.user.findFirstOrThrow({ where: { role: 'DENTIST' } });
      await expect(owner.auditLog.create({ data: { action: 'PATIENT_VIEWED' } })).rejects.toThrow(/audit_logs_one_actor/);
      await expect(
        owner.auditLog.create({ data: { actorUserId: staff.id, actorPatientAccountId: id, action: 'PATIENT_VIEWED' } }),
      ).rejects.toThrow(/audit_logs_one_actor/);
      // An account that doesn't exist can't be named as the actor.
      await expect(
        owner.auditLog.create({ data: { actorPatientAccountId: randomUUID(), action: 'PATIENT_LOGOUT' } }),
      ).rejects.toThrow(/foreign key/i);
    });

    it('lets an appointment wait without a patient only as an unconfirmed online request', async () => {
      const { id } = await account('ana@example.test');
      const times = { startsAt: new Date(at('09:00')), endsAt: new Date(at('09:30')) };
      await expect(owner.appointment.create({ data: { ...times } })).rejects.toThrow(/appointments_has_patient_unless_online_request/);
      const waiting = await owner.appointment.create({ data: { patientAccountId: id, ...times } });
      await expect(
        owner.appointment.update({ where: { id: waiting.id }, data: { status: 'CONFIRMED', dentistId: santos } }),
      ).rejects.toThrow(/appointments_has_patient_unless_online_request/);
      await owner.appointment.update({ where: { id: waiting.id }, data: { status: 'DECLINED' } });
    });

    it('stores emails in lowercase, once', async () => {
      await account('ana@example.test');
      const base = { passwordHash: 'x', firstName: 'A', lastName: 'B', birthDate: new Date('1990-01-01'), phone: '0917', privacyConsentAt: new Date() };
      await expect(owner.patientAccount.create({ data: { ...base, email: 'Upper@example.test' } })).rejects.toThrow(/patient_accounts_email_lowercase/);
      await expect(owner.patientAccount.create({ data: { ...base, email: 'ana@example.test' } })).rejects.toThrow(/Unique constraint/i);
    });
  });
});

describe('Online booking rate limits (e2e)', () => {
  it('blocks a 6th sign-up from one IP within 10 minutes, and an 11th login within a minute', async () => {
    const owner = ownerClient();
    await resetDatabase(owner, { name: 'Clinic A', onlineBookingEnabled: true });
    const app = await startApp({ rateLimits: true });
    const http = () => request(app.getHttpServer());
    for (let i = 0; i < 5; i++) await http().post(`${A}/register`).send({}).expect(400);
    await http().post(`${A}/register`).send({}).expect(429);
    for (let i = 0; i < 10; i++) await http().post(`${A}/login`).send({}).expect(400);
    await http().post(`${A}/login`).send({}).expect(429);
    for (let i = 0; i < 3; i++) await http().post(`${A}/forgot-password`).send({}).expect(400);
    await http().post(`${A}/forgot-password`).send({}).expect(429);
    for (let i = 0; i < 3; i++) await http().post(`${A}/resend-verification`).send({}).expect(400);
    await http().post(`${A}/resend-verification`).send({}).expect(429);
    await app.close();
    await owner.$disconnect();
  });
});
