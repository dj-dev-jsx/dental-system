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

describe('Scan tooth pins (e2e)', () => {
  let app: INestApplication;
  let passwordHash: string;
  let storageDir: string;
  const owner = ownerClient();
  const cookies = {} as Record<UserRole, string>;
  let maria: string;
  let juan: string;
  let scan: string;

  const http = () => request(app.getHttpServer());
  const pinsOf = (patientId: string, scanId: string) => `/api/v1/patients/${patientId}/scans/${scanId}/pins`;
  const put = (body: unknown, who: UserRole = 'DENTIST', path = pinsOf(maria, scan)) =>
    http().put(path).set('Cookie', cookies[who]).send(body as object);
  const get = (who: UserRole = 'DENTIST', path = pinsOf(maria, scan)) => http().get(path).set('Cookie', cookies[who]);
  const pin = (tooth: string, x = 1, y = 2, z = 3) => ({ tooth, x, y, z, neck: null as { x: number; y: number; z: number } | null });
  const pinAudits = () =>
    owner.auditLog.findMany({ where: { action: 'SCAN_PINS_UPDATED' }, orderBy: { createdAt: 'asc' } });

  async function addStaff(role: UserRole, email: string) {
    await owner.user.create({ data: { email, passwordHash, firstName: 'T', lastName: role, role } });
    const response = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);
    return ([response.headers['set-cookie']].flat() as unknown as string[])[0].split(';')[0];
  }

  beforeAll(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'dental-pins-test-'));
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
    for (const role of ['ADMIN', 'DENTIST', 'RECEPTIONIST', 'ASSISTANT'] as const) {
      cookies[role] = await addStaff(role, `${role.toLowerCase()}@a.example`);
    }
    const patient = (firstName: string) =>
      owner.patient.create({ data: { firstName, lastName: 'Test', birthDate: new Date('1990-01-01') } });
    maria = (await patient('Maria')).id;
    juan = (await patient('Juan')).id;
    const created = await http()
      .post(`/api/v1/patients/${maria}/scans`)
      .set('Cookie', cookies.DENTIST)
      .field('title', 'Upper arch')
      .attach('file', binaryStl(2), 'upper.stl')
      .expect(201);
    scan = created.body.id;
    expect(created.body.pinCount).toBe(0);
  });

  afterAll(async () => {
    await app.close();
    await owner.$disconnect();
    delete process.env['SCAN_STORAGE_DIR'];
    rmSync(storageDir, { recursive: true, force: true });
  });

  it('starts empty, then sets and replaces the whole set', async () => {
    const empty = await get().expect(200);
    expect(empty.headers['cache-control']).toBe('no-store');
    expect(empty.body).toEqual({ items: [], updatedAt: null, updatedBy: null });

    const first = await put({ pins: [pin('16', 1.5, -2.25, 3), pin('11'), pin('21')] }).expect(200);
    expect(first.body.items).toEqual([pin('11'), pin('16', 1.5, -2.25, 3), pin('21')]);
    expect(first.body.updatedBy).toMatchObject({ firstName: 'T', lastName: 'DENTIST' });
    expect(typeof first.body.updatedAt).toBe('string');

    await put({ pins: [pin('11'), pin('21', 9, 9, 9), pin('22')] }, 'ADMIN').expect(200);
    const after = await get('RECEPTIONIST').expect(200);
    expect(after.body.items).toEqual([pin('11'), pin('21', 9, 9, 9), pin('22')]);
    expect(after.body.updatedBy).toMatchObject({ lastName: 'ADMIN' });

    const list = await http().get(`/api/v1/patients/${maria}/scans`).set('Cookie', cookies.RECEPTIONIST).expect(200);
    expect(list.body.items[0].pinCount).toBe(3);

    await put({ pins: [] }).expect(200);
    expect((await get().expect(200)).body.items).toEqual([]);
  });

  it('keeps where each tooth meets the gum, when given, and logs a changed one as moved', async () => {
    const withNeck = { ...pin('16'), neck: { x: 1, y: 2, z: -5.5 } };
    const saved = await put({ pins: [withNeck, { tooth: '11', x: 1, y: 2, z: 3 }] }).expect(200);
    expect(saved.body.items).toEqual([pin('11'), withNeck]);
    const before = (await pinAudits()).length;
    await put({ pins: [{ ...withNeck, neck: { x: 1, y: 2, z: -6 } }, pin('11')] }).expect(200);
    const lines = await pinAudits();
    expect(lines).toHaveLength(before + 1);
    expect(lines.at(-1)?.metadata).toMatchObject({ added: [], removed: [], moved: ['16'] });
    await put({ pins: [] }).expect(200);
  });

  it('refuses a neck point missing a coordinate', async () => {
    await put({ pins: [{ ...pin('16'), neck: { x: 1, y: 2 } }] }).expect(400);
  });

  it('logs which teeth were added, removed and moved', async () => {
    await put({ pins: [pin('16'), pin('11')] }).expect(200);
    await put({ pins: [pin('11', 5, 5, 5), pin('21')] }).expect(200);
    // Saving the same set again changes nothing and logs nothing.
    await put({ pins: [pin('21'), pin('11', 5, 5, 5)] }).expect(200);
    const lines = await pinAudits();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      entityId: scan,
      metadata: { patientId: maria, count: 2, added: ['11', '16'], removed: [], moved: [] },
    });
    expect(lines[1].metadata).toEqual({ patientId: maria, count: 2, added: ['21'], removed: ['16'], moved: ['11'] });

    // The patient's history shows it, named after the patient.
    const history = await http()
      .get(`/api/v1/audit-logs?entityId=${maria}&action=SCAN_PINS_UPDATED`)
      .set('Cookie', cookies.ADMIN)
      .expect(200);
    expect(history.body.items).toHaveLength(2);
    expect(history.body.items[0].subject).toMatchObject({ kind: 'patient', id: maria, name: 'Maria Test' });
  });

  const tooMany = Array.from({ length: 33 }, (_, i) => pin(`${1 + (Math.floor(i / 8) % 4)}${1 + (i % 8)}`));
  it.each([
    ['a baby tooth', { pins: [pin('51')] }],
    ['tooth 19', { pins: [pin('19')] }],
    ['a number for a tooth', { pins: [{ tooth: 11, x: 1, y: 1, z: 1 }] }],
    ['the same tooth twice', { pins: [pin('11'), pin('11', 4, 4, 4)] }],
    ['more than 32', { pins: tooMany }],
    ['a missing coordinate', { pins: [{ tooth: '11', x: 1, y: 1 }] }],
    ['a text coordinate', { pins: [{ tooth: '11', x: 'NaN', y: 1, z: 1 }] }],
    ['a null coordinate (how JSON sends NaN)', { pins: [{ tooth: '11', x: null, y: 1, z: 1 }] }],
    ['an extra field', { pins: [{ ...pin('11'), label: 'x' }] }],
    ['no pins field', {}],
  ])('refuses %s', async (_name, body) => {
    await put(body).expect(400);
    expect(await pinAudits()).toHaveLength(0);
  });

  it('refuses NaN and wrong teeth in the database too', async () => {
    const insert = (tooth: string, x: string) =>
      owner.$executeRaw`INSERT INTO scan_tooth_pins (scan_id, tooth, x, y, z, placed_by_id, updated_at)
        SELECT ${scan}::uuid, ${tooth}, ${x}::double precision, 0, 0, id, now() FROM users LIMIT 1`;
    await expect(insert('11', 'NaN')).rejects.toThrow();
    await expect(insert('11', 'Infinity')).rejects.toThrow();
    await expect(insert('19', '0')).rejects.toThrow();
    expect(await insert('11', '0')).toBe(1);
  });

  it('lets only dentists and admins change pins, and any staff read them', async () => {
    await http().get(pinsOf(maria, scan)).expect(401);
    await put({ pins: [pin('11')] }, 'RECEPTIONIST').expect(403);
    await put({ pins: [pin('11')] }, 'ASSISTANT').expect(403);
    await get('RECEPTIONIST').expect(200);
    await get('ASSISTANT').expect(200);
    expect((await get().expect(200)).body.items).toEqual([]);
  });

  it('refuses changes on a withdrawn scan but still shows its pins', async () => {
    await put({ pins: [pin('11')] }).expect(200);
    await http()
      .post(`/api/v1/patients/${maria}/scans/${scan}/withdraw`)
      .set('Cookie', cookies.DENTIST)
      .send({ reason: 'Wrong patient' })
      .expect(200);
    const refused = await put({ pins: [pin('21')] }).expect(409);
    expect(refused.body.message).toBe('SCAN_WITHDRAWN');
    expect((await get().expect(200)).body.items).toEqual([pin('11')]);
  });

  it('refuses changes for an archived patient', async () => {
    await owner.patient.update({ where: { id: maria }, data: { archivedAt: new Date() } });
    await put({ pins: [pin('11')] }).expect(409);
  });

  it('answers 404 for an unknown scan or another patient’s scan', async () => {
    const missing = '00000000-0000-7000-8000-000000000999';
    await get('DENTIST', pinsOf(maria, missing)).expect(404);
    await put({ pins: [pin('11')] }, 'DENTIST', pinsOf(maria, missing)).expect(404);
    await get('DENTIST', pinsOf(juan, scan)).expect(404);
    await put({ pins: [pin('11')] }, 'DENTIST', pinsOf(juan, scan)).expect(404);
    await put({ pins: [pin('11')] }, 'DENTIST', pinsOf(missing, scan)).expect(404);
    await get('DENTIST', `/api/v1/patients/${maria}/scans/not-a-uuid/pins`).expect(400);
  });
});
