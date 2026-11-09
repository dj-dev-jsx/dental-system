import { type INestApplication, Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { Public, Roles } from '../src/auth/auth.decorators.js';
import { FAILED_LOGIN_MIN_MS } from '../src/auth/auth.service.js';
import { hashPassword } from '../src/auth/password.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ownerClient, resetDatabase } from './test-db.js';

// Test-only routes, to prove how the guards treat routes nobody remembered to protect.
@Controller('test-routes')
class TestRoutesController {
  @Get('unprotected')
  forgotToProtect() {
    return { secret: 'data' };
  }

  @Public()
  @Get('public')
  openToAnyone() {
    return { ok: true };
  }

  @Roles('ADMIN')
  @Get('admin-only')
  adminOnly() {
    return { ok: true };
  }
}

const PASSWORD = 'a-long-test-password';
const ADMIN_EMAIL = 'admin@test-clinic.example';
const RECEPTION_EMAIL = 'reception@test-clinic.example';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const owner = ownerClient();
  const http = () => request(app.getHttpServer());
  const login = (email: string, password = PASSWORD) =>
    http().post('/api/v1/auth/login').send({ email, password });
  const cookieFrom = (response: request.Response) =>
    ([response.headers['set-cookie']].flat() as unknown as string[])[0].split(';')[0];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestRoutesController],
    })
      // The rate limit has its own test below; here it would trip on repeated logins.
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDatabase(owner, { name: 'Test Clinic' });
    const passwordHash = await hashPassword(PASSWORD);
    await prisma.user.createMany({
      data: [
        { email: ADMIN_EMAIL, passwordHash, firstName: 'A', lastName: 'Admin', role: 'ADMIN' },
        { email: RECEPTION_EMAIL, passwordHash, firstName: 'R', lastName: 'Desk', role: 'RECEPTIONIST' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
  });

  it('uses the test database, never development data', async () => {
    const [{ current_database: name }] = await prisma.$queryRaw<
      { current_database: string }[]
    >`SELECT current_database()`;
    expect(name).toBe('dental_clinic_test');
  });

  it('locks a route nobody remembered to protect', async () => {
    await http().get('/api/v1/test-routes/unprotected').expect(401);
  });

  it('leaves @Public routes open', async () => {
    await http().get('/api/v1/test-routes/public').expect(200);
    await http().get('/api/v1/health').expect(200);
  });

  it('logs in, identifies the user, and never returns the password hash', async () => {
    const response = await login(ADMIN_EMAIL).expect(204);
    const me = await http()
      .get('/api/v1/auth/me')
      .set('Cookie', cookieFrom(response))
      .expect(200);
    expect(me.body.email).toBe(ADMIN_EMAIL);
    expect(me.body.role).toBe('ADMIN');
    expect(me.body).not.toHaveProperty('clinicId');
    expect(me.body.clinicName).toBe('Test Clinic');
    expect(JSON.stringify(me.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('accepts an email typed with different capitals and spaces', async () => {
    await login('  ADMIN@Test-Clinic.example ').expect(204);
  });

  it('sets a cookie page scripts and other websites cannot use', async () => {
    const response = await login(ADMIN_EMAIL).expect(204);
    const cookie = ([response.headers['set-cookie']].flat() as unknown as string[])[0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('stores only a hash of the token', async () => {
    const response = await login(ADMIN_EMAIL).expect(204);
    const token = cookieFrom(response).split('=')[1];
    const session = await prisma.session.findFirstOrThrow();
    expect(session.tokenHash).not.toBe(token);
    expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const wrongPassword = await login(ADMIN_EMAIL, 'wrong-password').expect(401);
    const unknownEmail = await login('nobody@test-clinic.example').expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('stores passwords with at least the recommended Argon2id strength', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('takes the same minimum time for every kind of failed login', async () => {
    const elapsed = async (email: string, password?: string) => {
      const startedAt = performance.now();
      await login(email, password).expect(401);
      return performance.now() - startedAt;
    };
    const wrongPassword = await elapsed(ADMIN_EMAIL, 'wrong-password');
    const unknownEmail = await elapsed('nobody@test-clinic.example');
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { isActive: false } });
    const deactivated = await elapsed(ADMIN_EMAIL);
    await prisma.user.update({
      where: { email: RECEPTION_EMAIL },
      data: { lockedUntil: new Date(Date.now() + 60_000) },
    });
    const locked = await elapsed(RECEPTION_EMAIL);

    const times = [wrongPassword, unknownEmail, deactivated, locked];
    for (const time of times) expect(time).toBeGreaterThanOrEqual(FAILED_LOGIN_MIN_MS - 5);
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(100);
  });

  it('rejects malformed input without trying to log in', async () => {
    await http().post('/api/v1/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
    await http().post('/api/v1/auth/login').send({ email: ADMIN_EMAIL }).expect(400);
    await http().post('/api/v1/auth/login').send({ email: ADMIN_EMAIL, password: 'x'.repeat(201) }).expect(400);
  });

  it('enforces roles: 403 for the wrong role, 200 for the right one', async () => {
    const reception = cookieFrom(await login(RECEPTION_EMAIL).expect(204));
    const admin = cookieFrom(await login(ADMIN_EMAIL).expect(204));
    await http().get('/api/v1/test-routes/admin-only').set('Cookie', reception).expect(403);
    await http().get('/api/v1/test-routes/admin-only').set('Cookie', admin).expect(200);
  });

  it('ends the session on logout', async () => {
    const cookie = cookieFrom(await login(ADMIN_EMAIL).expect(204));
    await http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it('cuts off a deactivated user immediately, even mid-session', async () => {
    const cookie = cookieFrom(await login(ADMIN_EMAIL).expect(204));
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { isActive: false } });
    await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    await login(ADMIN_EMAIL).expect(401);
  });

  it('rejects an expired session', async () => {
    const cookie = cookieFrom(await login(ADMIN_EMAIL).expect(204));
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
  });

  it('rejects a made-up session token', async () => {
    await http().get('/api/v1/auth/me').set('Cookie', 'dental_session=made-up').expect(401);
  });

  it('locks the account after 5 wrong passwords, even for the right password', async () => {
    for (let i = 0; i < 5; i++) await login(ADMIN_EMAIL, 'wrong-password').expect(401);
    await login(ADMIN_EMAIL).expect(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    // The other staff member's account is unaffected.
    await login(RECEPTION_EMAIL).expect(204);
  });

  describe('audit log', () => {
    const logs = () =>
      owner.auditLog.findMany({
        orderBy: { createdAt: 'asc' },
        select: { action: true, metadata: true, actor: { select: { email: true } } },
      });

    it('records logins, failures with their reason, and logouts', async () => {
      const cookie = cookieFrom(await login(ADMIN_EMAIL).expect(204));
      await http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
      await login(ADMIN_EMAIL, 'wrong-password').expect(401);
      await prisma.user.update({ where: { email: RECEPTION_EMAIL }, data: { isActive: false } });
      await login(RECEPTION_EMAIL).expect(401);

      expect(await logs()).toEqual([
        { action: 'LOGIN_SUCCEEDED', metadata: null, actor: { email: ADMIN_EMAIL } },
        { action: 'LOGOUT', metadata: null, actor: { email: ADMIN_EMAIL } },
        {
          action: 'LOGIN_FAILED',
          metadata: { reason: 'WRONG_PASSWORD', accountLocked: false },
          actor: { email: ADMIN_EMAIL },
        },
        {
          action: 'LOGIN_FAILED',
          metadata: { reason: 'ACCOUNT_DEACTIVATED' },
          actor: { email: RECEPTION_EMAIL },
        },
      ]);
    });

    it('records the attempt that locks the account, and attempts while locked', async () => {
      for (let i = 0; i < 5; i++) await login(ADMIN_EMAIL, 'wrong-password').expect(401);
      await login(ADMIN_EMAIL).expect(401);
      const entries = (await logs()).map((entry) => entry.metadata);
      expect(entries.at(-2)).toEqual({ reason: 'WRONG_PASSWORD', accountLocked: true });
      expect(entries.at(-1)).toEqual({ reason: 'ACCOUNT_LOCKED' });
    });

    it('logs nothing for an email that belongs to no account', async () => {
      await login('nobody@test-clinic.example').expect(401);
      expect(await logs()).toEqual([]);
    });
  });

  it('lets the user back in after the lock expires', async () => {
    for (let i = 0; i < 5; i++) await login(ADMIN_EMAIL, 'wrong-password').expect(401);
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    await login(ADMIN_EMAIL).expect(204);
  });

  describe('my activity', () => {
    it('lists only the caller own sign-ins, failures and password changes, newest first, max 10', async () => {
      await http().get('/api/v1/auth/my-activity').expect(401);
      await login(ADMIN_EMAIL, 'wrong-password-here').expect(401);
      await login(RECEPTION_EMAIL).expect(204);
      const cookie = cookieFrom(await login(ADMIN_EMAIL).expect(204));
      const res = await http().get('/api/v1/auth/my-activity').set('Cookie', cookie).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.items.map((i: { action: string }) => i.action)).toEqual([
        'LOGIN_SUCCEEDED',
        'LOGIN_FAILED',
      ]);
      expect(res.body.items[1].reason).toBe('WRONG_PASSWORD');
      expect(res.body.items[0].reason).toBeNull();
      expect(Object.keys(res.body.items[0]).sort()).toEqual(['action', 'createdAt', 'id', 'reason']);
      // The receptionist sees only their own line.
      const desk = cookieFrom(await login(RECEPTION_EMAIL).expect(204));
      const mine = await http().get('/api/v1/auth/my-activity').set('Cookie', desk).expect(200);
      expect(mine.body.items).toHaveLength(2);
      for (let i = 0; i < 12; i++) await login(ADMIN_EMAIL).expect(204);
      const many = await http().get('/api/v1/auth/my-activity').set('Cookie', cookie).expect(200);
      expect(many.body.items).toHaveLength(10);
    });

    it('is refused while a password change is pending', async () => {
      await owner.user.update({ where: { email: ADMIN_EMAIL }, data: { mustChangePassword: true } });
      const cookie = cookieFrom(await login(ADMIN_EMAIL).expect(204));
      await http().get('/api/v1/auth/my-activity').set('Cookie', cookie).expect(403);
    });
  });

  describe('change password', () => {
    const NEW = 'another-long-password';

    it('reports mustChangePassword on /me (false for normal users)', async () => {
      const cookie = cookieFrom(await login(ADMIN_EMAIL).expect(204));
      const me = await http().get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      expect(me.body.mustChangePassword).toBe(false);
    });

    it('needs a login and a correct current password', async () => {
      await http()
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: NEW })
        .expect(401);
      const cookie = cookieFrom(await login(ADMIN_EMAIL).expect(204));
      const res = await http()
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookie)
        .send({ currentPassword: 'not-the-password', newPassword: NEW })
        .expect(400);
      expect(res.body.message).toBe('Your current password is wrong.');
      await login(ADMIN_EMAIL).expect(204); // still the old password
    });

    it('refuses short, long and unchanged new passwords', async () => {
      const cookie = cookieFrom(await login(ADMIN_EMAIL).expect(204));
      for (const newPassword of ['short', 'x'.repeat(129), PASSWORD]) {
        await http()
          .post('/api/v1/auth/change-password')
          .set('Cookie', cookie)
          .send({ currentPassword: PASSWORD, newPassword })
          .expect(400);
      }
    });

    it('changes the password, keeps this session, ends the others and audits', async () => {
      const mine = cookieFrom(await login(ADMIN_EMAIL).expect(204));
      const other = cookieFrom(await login(ADMIN_EMAIL).expect(204));
      await http()
        .post('/api/v1/auth/change-password')
        .set('Cookie', mine)
        .send({ currentPassword: PASSWORD, newPassword: NEW })
        .expect(204);
      await http().get('/api/v1/auth/me').set('Cookie', mine).expect(200);
      await http().get('/api/v1/auth/me').set('Cookie', other).expect(401);
      await login(ADMIN_EMAIL).expect(401);
      await login(ADMIN_EMAIL, NEW).expect(204);
      const lines = await owner.auditLog.findMany({ where: { action: 'PASSWORD_CHANGED' } });
      expect(lines).toHaveLength(1);
      expect(JSON.stringify(lines)).not.toContain(NEW);
    });
  });
});

describe('Login rate limit (e2e)', () => {
  it('blocks an 11th login attempt from one IP within a minute', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@test-clinic.example', password: 'x' });
    for (let i = 0; i < 10; i++) await attempt().expect(401);
    await attempt().expect(429);
    await app.close();
  });
});
