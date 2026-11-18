import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

function binaryStl(triangles = 1) {
  const buffer = Buffer.alloc(84 + 50 * triangles);
  buffer.write('binary stl made by a test', 0, 'latin1');
  buffer.writeUInt32LE(triangles, 80);
  return buffer;
}

describe('Scan view settings (e2e)', () => {
  let app: INestApplication;
  let passwordHash: string;
  let storageDir: string;
  const owner = ownerClient();
  const cookies = {} as Record<UserRole, string>;
  let maria: string;
  let juan: string;
  let scan: string;

  const http = () => request(app.getHttpServer());
  const settingsOf = (patientId: string, scanId: string) =>
    `/api/v1/patients/${patientId}/scans/${scanId}/view-settings`;
  const put = (
    body: unknown,
    who: UserRole = 'DENTIST',
    path = settingsOf(maria, scan),
  ) =>
    http()
      .put(path)
      .set('Cookie', cookies[who])
      .send(body as object);
  const get = (who: UserRole = 'DENTIST', path = settingsOf(maria, scan)) =>
    http().get(path).set('Cookie', cookies[who]);
  const DEFAULTS = {
    view: 'SCAN_ONLY',
    hideGums: false,
    gumMethod: null,
    gumLineMm: null,
    colourSensitivity: null,
  };
  const skull = {
    view: 'IN_SKULL',
    hideGums: true,
    gumMethod: 'PINS',
    gumLineMm: 6.5,
    colourSensitivity: null,
  };
  const audits = () =>
    owner.auditLog.findMany({
      where: { action: 'SCAN_VIEW_SETTINGS_UPDATED' },
      orderBy: { createdAt: 'asc' },
    });

  async function addStaff(role: UserRole, email: string) {
    await owner.user.create({
      data: { email, passwordHash, firstName: 'T', lastName: role, role },
    });
    const response = await http()
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(204);
    return (
      [response.headers['set-cookie']].flat() as unknown as string[]
    )[0].split(';')[0];
  }

  beforeAll(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'dental-view-test-'));
    process.env['SCAN_STORAGE_DIR'] = storageDir;
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
    for (const role of [
      'ADMIN',
      'DENTIST',
      'RECEPTIONIST',
      'ASSISTANT',
    ] as const) {
      cookies[role] = await addStaff(role, `${role.toLowerCase()}@a.example`);
    }
    const patient = (firstName: string) =>
      owner.patient.create({
        data: {
          firstName,
          lastName: 'Test',
          birthDate: new Date('1990-01-01'),
        },
      });
    maria = (await patient('Maria')).id;
    juan = (await patient('Juan')).id;
    const created = await http()
      .post(`/api/v1/patients/${maria}/scans`)
      .set('Cookie', cookies.DENTIST)
      .field('title', 'Upper arch')
      .attach('file', binaryStl(2), 'upper.stl')
      .expect(201);
    scan = created.body.id;
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
    delete process.env['SCAN_STORAGE_DIR'];
    rmSync(storageDir, { recursive: true, force: true });
  });

  it('starts with the defaults, then saves the whole set for everyone', async () => {
    const empty = await get('RECEPTIONIST').expect(200);
    expect(empty.headers['cache-control']).toBe('no-store');
    expect(empty.body).toEqual({
      ...DEFAULTS,
      updatedAt: null,
      updatedBy: null,
    });

    const saved = await put(skull).expect(200);
    expect(saved.body).toMatchObject(skull);
    expect(saved.body.updatedBy).toMatchObject({
      firstName: 'T',
      lastName: 'DENTIST',
    });
    expect(typeof saved.body.updatedAt).toBe('string');

    const colour = {
      view: 'SCAN_ONLY',
      hideGums: true,
      gumMethod: 'COLOUR',
      gumLineMm: 6.5,
      colourSensitivity: 62.5,
    };
    await put(colour, 'ADMIN').expect(200);
    for (const who of ['RECEPTIONIST', 'ASSISTANT', 'DENTIST'] as const) {
      const read = await get(who).expect(200);
      expect(read.body).toMatchObject(colour);
      expect(read.body.updatedBy).toMatchObject({ lastName: 'ADMIN' });
    }
  });

  it('logs what changed, and nothing when nothing changed', async () => {
    await put(skull).expect(200);
    await put({ ...skull, gumLineMm: 8 }).expect(200);
    await put({ ...skull, gumLineMm: 8 }).expect(200); // the same again
    const lines = await audits();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      entityId: scan,
      metadata: {
        patientId: maria,
        changes: {
          view: { from: 'SCAN_ONLY', to: 'IN_SKULL' },
          hideGums: { from: false, to: true },
          gumMethod: { from: null, to: 'PINS' },
          gumLineMm: { from: null, to: 6.5 },
        },
      },
    });
    expect(lines[1].metadata).toEqual({
      patientId: maria,
      changes: { gumLineMm: { from: 6.5, to: 8 } },
    });

    // The patient's history shows it, named after the patient.
    const history = await http()
      .get(
        `/api/v1/audit-logs?entityId=${maria}&action=SCAN_VIEW_SETTINGS_UPDATED`,
      )
      .set('Cookie', cookies.ADMIN)
      .expect(200);
    expect(history.body.items).toHaveLength(2);
    expect(history.body.items[0].subject).toMatchObject({
      kind: 'patient',
      id: maria,
      name: 'Maria Test',
    });
  });

  it.each([
    ['an unknown view', { ...skull, view: 'IN_MOUTH' }],
    ['an unknown gum method', { ...skull, gumMethod: 'AI' }],
    ['a gum line below 0', { ...skull, gumLineMm: -1 }],
    ['a gum line over 12 mm', { ...skull, gumLineMm: 12.5 }],
    ['a text gum line', { ...skull, gumLineMm: '6' }],
    ['a sensitivity over 100', { ...skull, colourSensitivity: 101 }],
    ['a negative sensitivity', { ...skull, colourSensitivity: -0.5 }],
    ['hideGums as text', { ...skull, hideGums: 'yes' }],
    [
      'a missing field',
      { view: 'IN_SKULL', hideGums: true, gumMethod: null, gumLineMm: null },
    ],
    ['an extra field', { ...skull, camera: [0, 0, 1] }],
    ['an empty body', {}],
  ])('refuses %s', async (_name, body) => {
    await put(body).expect(400);
    expect(await audits()).toHaveLength(0);
    expect((await get().expect(200)).body).toMatchObject(DEFAULTS);
  });

  it('refuses out-of-range and NaN values in the database too', async () => {
    const insert = (gumLine: string, sensitivity: string) =>
      owner.$executeRaw`INSERT INTO scan_view_settings (scan_id, gum_line_mm, colour_sensitivity, updated_by_id, updated_at)
        SELECT ${scan}::uuid, ${gumLine}::real, ${sensitivity}::real, id, now() FROM users LIMIT 1`;
    await expect(insert('13', '50')).rejects.toThrow();
    await expect(insert('NaN', '50')).rejects.toThrow();
    await expect(insert('6', '-1')).rejects.toThrow();
    await expect(insert('6', 'NaN')).rejects.toThrow();
    expect(await insert('6', '50')).toBe(1);
  });

  it('lets only dentists and admins choose, and any staff read', async () => {
    await http().get(settingsOf(maria, scan)).expect(401);
    await http().put(settingsOf(maria, scan)).send(skull).expect(401);
    await put(skull, 'RECEPTIONIST').expect(403);
    await put(skull, 'ASSISTANT').expect(403);
    expect((await get('ASSISTANT').expect(200)).body).toMatchObject(DEFAULTS);
    expect(await audits()).toHaveLength(0);
  });

  it('refuses changes on a withdrawn scan but still reads its settings', async () => {
    await put(skull).expect(200);
    await http()
      .post(`/api/v1/patients/${maria}/scans/${scan}/withdraw`)
      .set('Cookie', cookies.DENTIST)
      .send({ reason: 'Wrong patient' })
      .expect(200);
    const refused = await put({ ...skull, view: 'SCAN_ONLY' }).expect(409);
    expect(refused.body.message).toBe('SCAN_WITHDRAWN');
    expect((await get().expect(200)).body).toMatchObject(skull);
  });

  it('refuses changes for an archived patient', async () => {
    await owner.patient.update({
      where: { id: maria },
      data: { archivedAt: new Date() },
    });
    await put(skull).expect(409);
    expect(await audits()).toHaveLength(0);
  });

  it('answers 404 for an unknown scan or another patient’s scan', async () => {
    const missing = '00000000-0000-7000-8000-000000000999';
    await get('DENTIST', settingsOf(maria, missing)).expect(404);
    await put(skull, 'DENTIST', settingsOf(maria, missing)).expect(404);
    await get('DENTIST', settingsOf(juan, scan)).expect(404);
    await put(skull, 'DENTIST', settingsOf(juan, scan)).expect(404);
    await put(skull, 'DENTIST', settingsOf(missing, scan)).expect(404);
    await get(
      'DENTIST',
      `/api/v1/patients/${maria}/scans/not-a-uuid/view-settings`,
    ).expect(400);
  });
});
