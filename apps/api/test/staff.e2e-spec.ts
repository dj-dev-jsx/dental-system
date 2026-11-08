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
const NEW_PASSWORD = 'a-brand-new-password';
// Four groups of four, from the alphabet without 0/O/1/l/I.
const TEMP_FORMAT = /^[a-km-npq-zA-HJ-NP-Z2-9]{4}(-[a-km-npq-zA-HJ-NP-Z2-9]{4}){3}$/;

type Role = 'ADMIN' | 'DENTIST' | 'RECEPTIONIST' | 'ASSISTANT';

describe('Staff management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const owner = ownerClient();
  const http = () => request(app.getHttpServer());
  let clinicId: string;
  let otherClinicId: string;
  const ids: Record<string, string> = {};

  const login = (email: string, password = PASSWORD) =>
    http().post('/api/v1/auth/login').send({ email, password });
  async function session(email: string, password = PASSWORD) {
    const response = await login(email, password).expect(204);
    return ([response.headers['set-cookie']].flat() as unknown as string[])[0].split(';')[0];
  }
  const audit = (action: string) =>
    owner.auditLog.findMany({ where: { action: action as never }, orderBy: { createdAt: 'asc' } });

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
    const clinic = await prisma.clinic.create({ data: { name: 'Clinic A' } });
    const other = await prisma.clinic.create({ data: { name: 'Clinic B' } });
    clinicId = clinic.id;
    otherClinicId = other.id;
    const passwordHash = await hashPassword(PASSWORD);
    const make = async (key: string, cid: string, role: Role, last: string) => {
      const u = await prisma.user.create({
        data: {
          clinicId: cid,
          email: `${key}@test.example`,
          passwordHash,
          firstName: 'F',
          lastName: last,
          role,
        },
      });
      ids[key] = u.id;
    };
    await make('admin', clinicId, 'ADMIN', 'Adams');
    await make('admin2', clinicId, 'ADMIN', 'Baker');
    await make('reception', clinicId, 'RECEPTIONIST', 'Cruz');
    await make('dentist', clinicId, 'DENTIST', 'Dela');
    await make('assistant', clinicId, 'ASSISTANT', 'Eve');
    await make('adminb', otherClinicId, 'ADMIN', 'Other');
    await make('userb', otherClinicId, 'DENTIST', 'Other2');
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  it('lists staff without password hashes, active first, no-store', async () => {
    await owner.user.update({ where: { id: ids['assistant'] }, data: { isActive: false } });
    await owner.user.update({ where: { id: ids['admin'] }, data: { lastName: 'Zed' } });
    const cookie = await session('admin@test.example');
    const res = await http().get('/api/v1/staff').set('Cookie', cookie).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.items.map((u: { lastName: string }) => u.lastName)).toEqual([
      'Baker', 'Cruz', 'Dela', 'Zed', 'Eve',
    ]);
    expect(res.body.items[4].isActive).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    expect(Object.keys(res.body.items[0]).sort()).toEqual([
      'createdAt', 'email', 'firstName', 'id', 'isActive', 'lastName', 'lastSignInAt',
      'lockedUntil', 'mustChangePassword', 'role',
    ]);
    // Only this clinic's people.
    expect(res.body.items).toHaveLength(5);
  });

  describe('list filters and sorting', () => {
    const get = (cookie: string, qs: string) =>
      http().get(`/api/v1/staff${qs}`).set('Cookie', cookie);
    const lastNames = (res: { body: { items: { lastName: string }[] } }) =>
      res.body.items.map((u) => u.lastName);

    it('reports the latest sign-in, null for people who never signed in', async () => {
      const dentist = await session('dentist@test.example');
      await session('dentist@test.example');
      const cookie = await session('admin@test.example');
      const res = await get(cookie, '').expect(200);
      const by = (key: string) =>
        res.body.items.find((u: { id: string }) => u.id === ids[key]);
      expect(by('reception').lastSignInAt).toBeNull();
      const latest = await owner.auditLog.findFirstOrThrow({
        where: { actorUserId: ids['dentist'], action: 'LOGIN_SUCCEEDED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(by('dentist').lastSignInAt).toBe(latest.createdAt.toISOString());
      expect(dentist).toBeTruthy();
    });

    it('filters by status, role and search', async () => {
      await owner.user.update({ where: { id: ids['assistant'] }, data: { isActive: false } });
      const cookie = await session('admin@test.example');
      expect(lastNames(await get(cookie, '?status=active').expect(200))).toEqual([
        'Adams', 'Baker', 'Cruz', 'Dela',
      ]);
      expect(lastNames(await get(cookie, '?status=deactivated').expect(200))).toEqual(['Eve']);
      expect(lastNames(await get(cookie, '?role=ADMIN').expect(200))).toEqual(['Adams', 'Baker']);
      expect(lastNames(await get(cookie, '?search=CRU').expect(200))).toEqual(['Cruz']);
      expect(lastNames(await get(cookie, '?search=dentist@test').expect(200))).toEqual(['Dela']);
      expect(lastNames(await get(cookie, '?search=zzz').expect(200))).toEqual([]);
    });

    it('sorts with nulls last and a stable tiebreak', async () => {
      await session('dentist@test.example');
      await session('reception@test.example');
      const cookie = await session('admin@test.example');
      expect(lastNames(await get(cookie, '?sort=name&dir=desc').expect(200))).toEqual([
        'Eve', 'Dela', 'Cruz', 'Baker', 'Adams',
      ]);
      const asc = lastNames(await get(cookie, '?sort=lastSignInAt&dir=asc').expect(200));
      const desc = lastNames(await get(cookie, '?sort=lastSignInAt&dir=desc').expect(200));
      expect(asc.slice(0, 3)).toEqual(['Dela', 'Cruz', 'Adams']);
      expect(desc.slice(0, 3)).toEqual(['Adams', 'Cruz', 'Dela']);
      // Never signed in: last either way, then by id.
      expect(asc.slice(3)).toHaveLength(2);
      expect(desc.slice(3)).toHaveLength(2);
      const byRole = await get(cookie, '?sort=role').expect(200);
      expect(byRole.body.items[0].role).toBe('ADMIN');
    });

    it('refuses unknown or bad parameters and stays inside the clinic', async () => {
      const cookie = await session('admin@test.example');
      await get(cookie, '?sort=password').expect(400);
      await get(cookie, '?status=maybe').expect(400);
      await get(cookie, '?role=OWNER').expect(400);
      await get(cookie, '?clinicId=x').expect(400);
      expect(lastNames(await get(cookie, '?search=Other').expect(200))).toEqual([]);
    });
  });

  it.each(['reception', 'dentist', 'assistant'])('refuses %s everywhere with 403', async (key) => {
    const cookie = await session(`${key}@test.example`);
    const id = ids['admin2'];
    // Functions, so each request is only created when it is about to be sent.
    const calls = [
      () => http().get('/api/v1/staff'),
      () =>
        http()
          .post('/api/v1/staff')
          .send({ email: 'x@test.example', firstName: 'X', lastName: 'Y', role: 'DENTIST' }),
      () => http().patch(`/api/v1/staff/${id}`).send({ firstName: 'Z' }),
      () => http().post(`/api/v1/staff/${id}/reset-password`),
      () => http().post(`/api/v1/staff/${id}/unlock`),
    ];
    for (const call of calls) await call().set('Cookie', cookie).expect(403);
    expect(await audit('STAFF_UPDATED')).toHaveLength(0);
    expect(await owner.user.count({ where: { email: 'x@test.example' } })).toBe(0);
  });

  it('requires a login', async () => {
    await http().get('/api/v1/staff').expect(401);
  });

  it('creates staff, returns the temporary password once and never stores it', async () => {
    const cookie = await session('admin@test.example');
    const res = await http()
      .post('/api/v1/staff')
      .set('Cookie', cookie)
      .send({ email: '  New.Person@Test.Example ', firstName: ' Nina ', lastName: 'Nunez', role: 'DENTIST' })
      .expect(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const { user, temporaryPassword } = res.body;
    expect(temporaryPassword).toMatch(TEMP_FORMAT);
    expect(user).toMatchObject({
      email: 'new.person@test.example',
      firstName: 'Nina',
      role: 'DENTIST',
      isActive: true,
      mustChangePassword: true,
      lockedUntil: null,
    });
    expect(user.passwordHash).toBeUndefined();

    const stored = await owner.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.clinicId).toBe(clinicId);
    expect(stored.passwordHash).not.toContain(temporaryPassword);

    const lines = await audit('STAFF_CREATED');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ entityId: user.id, actorUserId: ids['admin'], clinicId });
    expect(lines[0].metadata).toEqual({ role: 'DENTIST' });
    expect(JSON.stringify(await owner.auditLog.findMany())).not.toContain(temporaryPassword);

    const list = await http().get('/api/v1/staff').set('Cookie', cookie).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(temporaryPassword);
  });

  it('validates new staff', async () => {
    const cookie = await session('admin@test.example');
    const ok = { email: 'v@test.example', firstName: 'V', lastName: 'W', role: 'ASSISTANT' };
    const bad = [
      { ...ok, email: 'nope' },
      { ...ok, firstName: '' },
      { ...ok, lastName: 'x'.repeat(101) },
      { ...ok, role: 'KING' },
      { ...ok, clinicId: otherClinicId },
      { ...ok, password: 'hunter2hunter2' },
    ];
    for (const body of bad) {
      await http().post('/api/v1/staff').set('Cookie', cookie).send(body).expect(400);
    }
    expect(await owner.user.count({ where: { email: 'v@test.example' } })).toBe(0);
  });

  it('refuses a duplicate email, even one used in another clinic, with 409', async () => {
    const cookie = await session('admin@test.example');
    for (const email of ['RECEPTION@test.example', 'userb@test.example']) {
      const res = await http()
        .post('/api/v1/staff')
        .set('Cookie', cookie)
        .send({ email, firstName: 'D', lastName: 'Up', role: 'DENTIST' })
        .expect(409);
      expect(res.body.message).toBe('That email is already used by another account.');
    }
    expect(await audit('STAFF_CREATED')).toHaveLength(0);
  });

  it('handles two simultaneous creates with the same email', async () => {
    const cookie = await session('admin@test.example');
    const send = () =>
      http()
        .post('/api/v1/staff')
        .set('Cookie', cookie)
        .send({ email: 'race@test.example', firstName: 'R', lastName: 'Ace', role: 'DENTIST' });
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([201, 409]);
  });

  it('forces a new staff member to change the temporary password before anything else', async () => {
    const admin = await session('admin@test.example');
    const created = await http()
      .post('/api/v1/staff')
      .set('Cookie', admin)
      .send({ email: 'temp@test.example', firstName: 'T', lastName: 'Emp', role: 'RECEPTIONIST' })
      .expect(201);
    const temp: string = created.body.temporaryPassword;

    const cookie = await session('temp@test.example', temp);
    const me = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(me.body.mustChangePassword).toBe(true);
    for (const path of ['/api/v1/patients', '/api/v1/clinic', '/api/v1/appointments']) {
      const res = await http().get(path).set('Cookie', cookie).expect(403);
      expect(res.body.message).toBe('PASSWORD_CHANGE_REQUIRED');
    }

    // Wrong current password, short and extra-field requests are refused.
    const change = (body: object) =>
      http().post('/api/v1/auth/change-password').set('Cookie', cookie).send(body);
    const wrong = await change({ currentPassword: 'wrong-wrong-wrong', newPassword: NEW_PASSWORD }).expect(400);
    expect(wrong.body.message).toBe('Your current password is wrong.');
    await change({ currentPassword: temp, newPassword: 'short' }).expect(400);
    await change({ currentPassword: temp, newPassword: NEW_PASSWORD, extra: 1 }).expect(400);

    await change({ currentPassword: temp, newPassword: NEW_PASSWORD }).expect(204);
    expect(await audit('PASSWORD_CHANGED')).toHaveLength(1);
    const after = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    expect(after.body.mustChangePassword).toBe(false);
    await http().get('/api/v1/patients').set('Cookie', cookie).expect(200);

    await login('temp@test.example', temp).expect(401);
    await login('temp@test.example', NEW_PASSWORD).expect(204);
  });

  it('can log out while a password change is pending', async () => {
    const admin = await session('admin@test.example');
    const created = await http()
      .post('/api/v1/staff')
      .set('Cookie', admin)
      .send({ email: 'lo@test.example', firstName: 'L', lastName: 'O', role: 'ASSISTANT' })
      .expect(201);
    const cookie = await session('lo@test.example', created.body.temporaryPassword);
    await http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
  });

  describe('update', () => {
    it('changes names and role, deletes sessions on a role change, and audits', async () => {
      const admin = await session('admin@test.example');
      const victim = await session('reception@test.example');
      const res = await http()
        .patch(`/api/v1/staff/${ids['reception']}`)
        .set('Cookie', admin)
        .send({ firstName: 'Rita', role: 'DENTIST', lastName: 'Cruz' })
        .expect(200);
      expect(res.body).toMatchObject({ firstName: 'Rita', role: 'DENTIST' });
      expect(res.body.passwordHash).toBeUndefined();
      await http().get('/api/v1/auth/me').set('Cookie', victim).expect(401);
      const lines = await audit('STAFF_UPDATED');
      expect(lines).toHaveLength(1);
      expect(lines[0].entityId).toBe(ids['reception']);
      expect(lines[0].metadata).toEqual({
        changes: {
          firstName: { from: 'F', to: 'Rita' },
          role: { from: 'RECEPTIONIST', to: 'DENTIST' },
        },
      });
    });

    it('keeps sessions when only the name changes, and logs nothing for a no-op', async () => {
      const admin = await session('admin@test.example');
      const other = await session('dentist@test.example');
      const patch = () =>
        http().patch(`/api/v1/staff/${ids['dentist']}`).set('Cookie', admin).send({ firstName: 'Dan' });
      await patch().expect(200);
      await http().get('/api/v1/auth/me').set('Cookie', other).expect(200);
      await patch().expect(200);
      expect(await audit('STAFF_UPDATED')).toHaveLength(1);
    });

    it('validates input', async () => {
      const admin = await session('admin@test.example');
      const patch = (body: object, id = ids['dentist']) =>
        http().patch(`/api/v1/staff/${id}`).set('Cookie', admin).send(body);
      await patch({}).expect(400);
      await patch({ email: 'x@test.example' }).expect(400);
      await patch({ clinicId: otherClinicId }).expect(400);
      await patch({ role: 'KING' }).expect(400);
      await patch({ isActive: 'no' }).expect(400);
      await patch({ firstName: '' }).expect(400);
      await patch({ firstName: 'A' }, 'not-a-uuid').expect(400);
    });

    it('deactivating kills sessions and login, and reactivating restores login', async () => {
      const admin = await session('admin@test.example');
      const victim = await session('dentist@test.example');
      const patch = (isActive: boolean) =>
        http().patch(`/api/v1/staff/${ids['dentist']}`).set('Cookie', admin).send({ isActive });
      await patch(false).expect(200);
      await http().get('/api/v1/auth/me').set('Cookie', victim).expect(401);
      await login('dentist@test.example').expect(401);
      await patch(true).expect(200);
      await login('dentist@test.example').expect(204);
    });

    it('404s for another clinic and changes nothing', async () => {
      const admin = await session('admin@test.example');
      const victim = await session('userb@test.example');
      await http()
        .patch(`/api/v1/staff/${ids['userb']}`)
        .set('Cookie', admin)
        .send({ firstName: 'Hacked', role: 'ADMIN', isActive: false })
        .expect(404);
      const row = await owner.user.findUniqueOrThrow({ where: { id: ids['userb'] } });
      expect(row).toMatchObject({ firstName: 'F', role: 'DENTIST', isActive: true });
      await http().get('/api/v1/auth/me').set('Cookie', victim).expect(200);
      expect(await audit('STAFF_UPDATED')).toHaveLength(0);
      await http()
        .patch('/api/v1/staff/00000000-0000-4000-8000-000000000000')
        .set('Cookie', admin)
        .send({ firstName: 'Q' })
        .expect(404);
    });

    it('stops admins changing their own role or deactivating themselves', async () => {
      const admin = await session('admin@test.example');
      const patch = (body: object) =>
        http().patch(`/api/v1/staff/${ids['admin']}`).set('Cookie', admin).send(body);
      await patch({ role: 'DENTIST' }).expect(409);
      await patch({ isActive: false }).expect(409);
      // Renaming yourself, or "changing" to the role you already have, is fine.
      await patch({ firstName: 'Me', role: 'ADMIN' }).expect(200);
      const row = await owner.user.findUniqueOrThrow({ where: { id: ids['admin'] } });
      expect(row).toMatchObject({ role: 'ADMIN', isActive: true, firstName: 'Me' });
    });

    it('never leaves the clinic without an active admin, even with simultaneous demotions', async () => {
      // Two admins each try to demote the other at the same moment.
      const a = await session('admin@test.example');
      const b = await session('admin2@test.example');
      const results = await Promise.all([
        http().patch(`/api/v1/staff/${ids['admin2']}`).set('Cookie', a).send({ role: 'ASSISTANT' }),
        http().patch(`/api/v1/staff/${ids['admin']}`).set('Cookie', b).send({ role: 'ASSISTANT' }),
      ]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409]);
      const admins = await owner.user.count({ where: { clinicId, role: 'ADMIN', isActive: true } });
      expect(admins).toBe(1);
    });

    it('refuses to deactivate the last admin (and simultaneous deactivations)', async () => {
      const a = await session('admin@test.example');
      const b = await session('admin2@test.example');
      const results = await Promise.all([
        http().patch(`/api/v1/staff/${ids['admin2']}`).set('Cookie', a).send({ isActive: false }),
        http().patch(`/api/v1/staff/${ids['admin']}`).set('Cookie', b).send({ isActive: false }),
      ]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([200, 409]);
      const admins = await owner.user.count({ where: { clinicId, role: 'ADMIN', isActive: true } });
      expect(admins).toBe(1);
    });
  });

  describe('reset password', () => {
    it('sets a new temporary password, unlocks and signs the user out', async () => {
      const admin = await session('admin@test.example');
      const victim = await session('reception@test.example');
      await owner.user.update({
        where: { id: ids['reception'] },
        data: { failedLogins: 3, lockedUntil: new Date(Date.now() + 600_000) },
      });
      const res = await http()
        .post(`/api/v1/staff/${ids['reception']}/reset-password`)
        .set('Cookie', admin)
        .expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const temp: string = res.body.temporaryPassword;
      expect(temp).toMatch(TEMP_FORMAT);
      expect(Object.keys(res.body)).toEqual(['temporaryPassword']);

      const row = await owner.user.findUniqueOrThrow({ where: { id: ids['reception'] } });
      expect(row).toMatchObject({ mustChangePassword: true, failedLogins: 0, lockedUntil: null });
      expect(row.passwordHash).not.toContain(temp);
      await http().get('/api/v1/auth/me').set('Cookie', victim).expect(401);
      await login('reception@test.example').expect(401); // the old password
      const cookie = await session('reception@test.example', temp);
      const me = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      expect(me.body.mustChangePassword).toBe(true);

      const lines = await audit('STAFF_PASSWORD_RESET');
      expect(lines).toHaveLength(1);
      expect(lines[0].entityId).toBe(ids['reception']);
      expect(JSON.stringify(await owner.auditLog.findMany())).not.toContain(temp);
    });

    it('refuses to reset yourself (409) and another clinic (404)', async () => {
      const admin = await session('admin@test.example');
      await http().post(`/api/v1/staff/${ids['admin']}/reset-password`).set('Cookie', admin).expect(409);
      const before = await owner.user.findUniqueOrThrow({ where: { id: ids['userb'] } });
      await http().post(`/api/v1/staff/${ids['userb']}/reset-password`).set('Cookie', admin).expect(404);
      const after = await owner.user.findUniqueOrThrow({ where: { id: ids['userb'] } });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.mustChangePassword).toBe(false);
      expect(await audit('STAFF_PASSWORD_RESET')).toHaveLength(0);
    });
  });

  describe('unlock', () => {
    it('clears the lock and audits', async () => {
      const admin = await session('admin@test.example');
      await owner.user.update({
        where: { id: ids['dentist'] },
        data: { failedLogins: 4, lockedUntil: new Date(Date.now() + 600_000) },
      });
      const res = await http()
        .post(`/api/v1/staff/${ids['dentist']}/unlock`)
        .set('Cookie', admin)
        .expect(200);
      expect(res.body).toMatchObject({ id: ids['dentist'], lockedUntil: null });
      expect(res.body.passwordHash).toBeUndefined();
      const row = await owner.user.findUniqueOrThrow({ where: { id: ids['dentist'] } });
      expect(row).toMatchObject({ failedLogins: 0, lockedUntil: null });
      await login('dentist@test.example').expect(204);
      expect(await audit('STAFF_UNLOCKED')).toHaveLength(1);
    });

    it('404s for another clinic and changes nothing', async () => {
      const admin = await session('admin@test.example');
      const locked = new Date(Date.now() + 600_000);
      await owner.user.update({
        where: { id: ids['userb'] },
        data: { failedLogins: 4, lockedUntil: locked },
      });
      await http().post(`/api/v1/staff/${ids['userb']}/unlock`).set('Cookie', admin).expect(404);
      const row = await owner.user.findUniqueOrThrow({ where: { id: ids['userb'] } });
      expect(row.failedLogins).toBe(4);
      expect(row.lockedUntil).not.toBeNull();
      expect(await audit('STAFF_UNLOCKED')).toHaveLength(0);
    });
  });
});
