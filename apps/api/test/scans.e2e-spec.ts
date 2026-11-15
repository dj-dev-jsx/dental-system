import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// Tiny valid files, made here.
function binaryStl(triangles = 1) {
  const buffer = Buffer.alloc(84 + 50 * triangles);
  buffer.write('binary stl made by a test', 0, 'latin1');
  buffer.writeUInt32LE(triangles, 80);
  return buffer;
}
const asciiStl = Buffer.from(
  'solid tooth\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid tooth\n',
);
const plyAscii = Buffer.from(
  'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n',
);
const plyBinary = Buffer.concat([
  Buffer.from(
    'ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nend_header\n',
  ),
  Buffer.alloc(36),
]);
const obj = Buffer.from('# a test\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');

describe('Scan files (e2e)', () => {
  let app: INestApplication;
  let passwordHash: string;
  let storageDir: string;
  const owner = ownerClient();
  const appDb = new PrismaService(new ConfigService({ DATABASE_URL: process.env['DATABASE_URL'] }));
  const cookies = {} as Record<UserRole, string>;
  const ids = {} as Record<UserRole, string>;
  let maria: string;
  let juan: string;

  const http = () => request(app.getHttpServer());
  const as = (who: keyof typeof cookies) => ({
    get: (url: string) => http().get(url).set('Cookie', cookies[who]),
    post: (url: string) => http().post(url).set('Cookie', cookies[who]),
  });
  const scansOf = (patientId: string) => `/api/v1/patients/${patientId}/scans`;
  const upload = (
    file: Buffer | null,
    fileName = 'upper.stl',
    fields: Record<string, string> = { title: 'Upper arch' },
    who: keyof typeof cookies = 'DENTIST',
    patientId = maria,
  ) => {
    let req = as(who).post(scansOf(patientId));
    for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
    return file ? req.attach('file', file, fileName) : req;
  };
  const filesOnDisk = () => readdirSync(storageDir);

  async function addStaff(role: UserRole, email: string) {
    const user = await owner.user.create({
      data: { email, passwordHash, firstName: 'T', lastName: role, role },
    });
    const response = await http().post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(204);
    const cookie = ([response.headers['set-cookie']].flat() as unknown as string[])[0].split(';')[0];
    return { id: user.id, cookie };
  }

  beforeAll(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'dental-scans-test-'));
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
    delete process.env['SCAN_MAX_MB'];
    await resetDatabase(owner);
    for (const name of filesOnDisk()) rmSync(join(storageDir, name), { force: true });
    for (const role of ['ADMIN', 'DENTIST', 'RECEPTIONIST', 'ASSISTANT'] as const) {
      const staff = await addStaff(role, `${role.toLowerCase()}@a.example`);
      cookies[role] = staff.cookie;
      ids[role] = staff.id;
    }
    const patient = (firstName: string) =>
      owner.patient.create({ data: { firstName, lastName: 'Test', birthDate: new Date('1990-01-01') } });
    maria = (await patient('Maria')).id;
    juan = (await patient('Juan')).id;
  });

  afterAll(async () => {
    await app.close();
    await appDb.$disconnect();
    await owner.$disconnect();
    delete process.env['SCAN_STORAGE_DIR'];
    rmSync(storageDir, { recursive: true, force: true });
  });

  it('requires a login', async () => {
    await http().get(scansOf(maria)).expect(401);
    await http().post(scansOf(maria)).expect(401);
  });

  describe('uploading', () => {
    it.each([
      ['binary STL', binaryStl(2), 'a.stl', 'STL'],
      ['ASCII STL', asciiStl, 'a.STL', 'STL'],
      ['ASCII PLY', plyAscii, 'a.ply', 'PLY'],
      ['binary PLY', plyBinary, 'a.Ply', 'PLY'],
      ['OBJ', obj, 'a.obj', 'OBJ'],
    ])('accepts a %s and returns the bytes unchanged', async (_name, bytes, fileName, format) => {
      const created = await upload(bytes, fileName, {
        title: 'Lower arch',
        note: 'After cleaning',
        scannedOn: '2026-03-04',
      }).expect(201);
      expect(created.body).toMatchObject({
        title: 'Lower arch',
        note: 'After cleaning',
        format,
        fileName,
        sizeBytes: bytes.length,
        scannedOn: '2026-03-04',
        uploadedBy: { id: ids.DENTIST, firstName: 'T', lastName: 'DENTIST' },
        withdrawn: false,
        withdrawnAt: null,
        withdrawReason: null,
      });
      expect(created.body).not.toHaveProperty('storageKey');
      expect(created.body).not.toHaveProperty('sha256');

      const row = await owner.patientScan.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(filesOnDisk()).toEqual([row.storageKey]);

      const file = await as('RECEPTIONIST')
        .get(`${scansOf(maria)}/${created.body.id}/file`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(Buffer.compare(file.body as Buffer, bytes)).toBe(0);
      expect(createHash('sha256').update(file.body as Buffer).digest('hex')).toBe(row.sha256);
      expect(file.headers['content-type']).toBe('application/octet-stream');
      expect(file.headers['content-length']).toBe(String(bytes.length));
      expect(file.headers['content-disposition']).toBe(`inline; filename="scan.${format.toLowerCase()}"`);
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['cache-control']).toBe('private, no-store');
    });

    it('defaults the date to today and cleans the file name', async () => {
      const created = await upload(binaryStl(), '..\\..\\evil/path\\upper.stl').expect(201);
      expect(created.body.fileName).toBe('upper.stl');
      expect(created.body.scannedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('refuses content that is not the named format, saving nothing', async () => {
      for (const [bytes, name] of [
        [Buffer.from('this is not a scan at all'), 'x.stl'],
        [binaryStl(3).subarray(0, 100), 'x.stl'],
        [Buffer.from('not ply\nend_header\n'), 'x.ply'],
        [Buffer.from('ply\nformat ascii 1.0\nelement vertex 0\nend_header\n'), 'x.ply'],
        [Buffer.from('v 0 0 0\nv 1 1 1\n'), 'x.obj'],
        [Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n\0'), 'x.obj'],
      ] as const) {
        const response = await upload(bytes, name).expect(400);
        expect(response.body.message).toBe('SCAN_FILE_INVALID');
      }
      expect(filesOnDisk()).toEqual([]);
      expect(await owner.patientScan.count()).toBe(0);
    });

    it('refuses other extensions, a missing file and bad fields', async () => {
      expect((await upload(obj, 'x.zip').expect(400)).body.message).toBe('SCAN_FORMAT_UNSUPPORTED');
      expect((await upload(obj, 'noextension').expect(400)).body.message).toBe('SCAN_FORMAT_UNSUPPORTED');
      expect((await upload(null).expect(400)).body.message).toBe('SCAN_FILE_REQUIRED');
      await upload(obj, 'x.obj', {}).expect(400);
      await upload(obj, 'x.obj', { title: '  ' }).expect(400);
      await upload(obj, 'x.obj', { title: 'x'.repeat(101) }).expect(400);
      await upload(obj, 'x.obj', { title: 'x', note: 'n'.repeat(501) }).expect(400);
      await upload(obj, 'x.obj', { title: 'x', scannedOn: '2999-01-01' }).expect(400);
      await upload(obj, 'x.obj', { title: 'x', scannedOn: 'yesterday' }).expect(400);
      expect(filesOnDisk()).toEqual([]);
      expect(await owner.patientScan.count()).toBe(0);
    });

    it('refuses a file over the size limit with 413', async () => {
      process.env['SCAN_MAX_MB'] = '0.001'; // about 1 KB
      const big = Buffer.concat([obj, Buffer.from('# padding\n'.repeat(500))]);
      const response = await upload(big, 'big.obj').expect(413);
      expect(response.body.message).toBe('SCAN_TOO_LARGE');
      expect(filesOnDisk()).toEqual([]);
      await upload(obj, 'small.obj').expect(201);
    });

    it('is for dentists and admins only', async () => {
      await upload(obj, 'x.obj', { title: 'x' }, 'RECEPTIONIST').expect(403);
      await upload(obj, 'x.obj', { title: 'x' }, 'ASSISTANT').expect(403);
      await upload(obj, 'x.obj', { title: 'x' }, 'ADMIN').expect(201);
      expect(filesOnDisk()).toHaveLength(1);
    });

    it('refuses an archived patient and unknown patients, saving nothing', async () => {
      await owner.patient.update({ where: { id: juan }, data: { archivedAt: new Date() } });
      await upload(obj, 'x.obj', { title: 'x' }, 'DENTIST', juan).expect(409);
      await upload(obj, 'x.obj', { title: 'x' }, 'DENTIST', '0190a1b2-0000-7000-8000-000000000000').expect(404);
      await as('DENTIST').post('/api/v1/patients/not-a-uuid/scans').expect(400);
      expect(filesOnDisk()).toEqual([]);
      expect(await owner.patientScan.count()).toBe(0);
    });
  });

  describe('listing and opening', () => {
    it('lists newest scan date first for any staff role, and an archived patient too', async () => {
      const older = await upload(obj, 'a.obj', { title: 'Older', scannedOn: '2026-01-01' }).expect(201);
      const newer = await upload(obj, 'b.obj', { title: 'Newer', scannedOn: '2026-02-01' }).expect(201);
      await owner.patient.update({ where: { id: maria }, data: { archivedAt: new Date() } });
      for (const role of ['RECEPTIONIST', 'ASSISTANT', 'DENTIST', 'ADMIN'] as const) {
        const response = await as(role).get(scansOf(maria)).expect(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body.items.map((s: { id: string }) => s.id)).toEqual([newer.body.id, older.body.id]);
      }
      expect((await as('DENTIST').get(scansOf(juan)).expect(200)).body).toEqual({ items: [] });
      await as('DENTIST').get(scansOf('0190a1b2-0000-7000-8000-000000000000')).expect(404);
    });

    it('answers 404 for an unknown scan or one that belongs to another patient', async () => {
      const created = await upload(obj, 'a.obj').expect(201);
      const missing = '0190a1b2-0000-7000-8000-000000000000';
      await as('DENTIST').get(`${scansOf(maria)}/${missing}/file`).expect(404);
      await as('DENTIST').get(`${scansOf(juan)}/${created.body.id}/file`).expect(404);
      await as('DENTIST').post(`${scansOf(juan)}/${created.body.id}/withdraw`).send({ reason: 'x' }).expect(404);
      await as('DENTIST').post(`${scansOf(maria)}/${missing}/withdraw`).send({ reason: 'x' }).expect(404);
    });
  });

  describe('withdrawing', () => {
    it('withdraws once, keeps the file for admins only, and needs a dentist or admin', async () => {
      const created = await upload(obj, 'a.obj').expect(201);
      const path = `${scansOf(maria)}/${created.body.id}`;

      await as('RECEPTIONIST').post(`${path}/withdraw`).send({ reason: 'Wrong patient' }).expect(403);
      await as('DENTIST').post(`${path}/withdraw`).send({}).expect(400);
      await as('DENTIST').post(`${path}/withdraw`).send({ reason: 'r'.repeat(501) }).expect(400);

      const withdrawn = await as('DENTIST').post(`${path}/withdraw`).send({ reason: 'Wrong patient' }).expect(200);
      expect(withdrawn.body).toMatchObject({
        id: created.body.id,
        withdrawn: true,
        withdrawReason: 'Wrong patient',
      });
      expect(withdrawn.body.withdrawnAt).toEqual(expect.any(String));
      const row = await owner.patientScan.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.withdrawnById).toBe(ids.DENTIST);

      expect((await as('ADMIN').post(`${path}/withdraw`).send({ reason: 'again' }).expect(409)).body.message).toBe(
        'ALREADY_WITHDRAWN',
      );

      const listed = await as('RECEPTIONIST').get(scansOf(maria)).expect(200);
      expect(listed.body.items).toHaveLength(1);
      expect(listed.body.items[0]).toMatchObject({ withdrawn: true, withdrawReason: 'Wrong patient' });

      const gone = await as('RECEPTIONIST').get(`${path}/file`).expect(410);
      expect(gone.body.message).toBe('SCAN_WITHDRAWN');
      await as('DENTIST').get(`${path}/file`).expect(410);
      await as('ADMIN').get(`${path}/file`).expect(200);
      expect(filesOnDisk()).toHaveLength(1);
    });

    it('is refused for an archived patient', async () => {
      const created = await upload(obj, 'a.obj').expect(201);
      await owner.patient.update({ where: { id: maria }, data: { archivedAt: new Date() } });
      await as('DENTIST').post(`${scansOf(maria)}/${created.body.id}/withdraw`).send({ reason: 'x' }).expect(409);
    });
  });

  describe('audit log', () => {
    it('records the upload, one view per ten minutes, and the withdrawal', async () => {
      const created = await upload(obj, 'a.obj', { title: 'Upper arch' }).expect(201);
      const path = `${scansOf(maria)}/${created.body.id}`;
      await as('RECEPTIONIST').get(`${path}/file`).expect(200);
      await as('RECEPTIONIST').get(`${path}/file`).expect(200);
      await as('DENTIST').get(`${path}/file`).expect(200);
      await as('DENTIST').post(`${path}/withdraw`).send({ reason: 'Wrong patient' }).expect(200);

      const lines = await owner.auditLog.findMany({
        where: { entityId: created.body.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(lines.map((l) => [l.action, l.actorUserId])).toEqual([
        ['SCAN_UPLOADED', ids.DENTIST],
        ['SCAN_VIEWED', ids.RECEPTIONIST],
        ['SCAN_VIEWED', ids.DENTIST],
        ['SCAN_WITHDRAWN', ids.DENTIST],
      ]);
      expect(lines[0]?.metadata).toEqual({ patientId: maria, title: 'Upper arch', format: 'OBJ', sizeBytes: obj.length });

      // The audit page names the patient, and the patient's history includes these lines.
      const history = await as('ADMIN').get(`/api/v1/audit-logs?entityId=${maria}&limit=100`).expect(200);
      const scanLines = history.body.items.filter((i: { action: string }) => i.action.startsWith('SCAN_'));
      expect(scanLines).toHaveLength(4);
      expect(scanLines[0].subject).toMatchObject({ kind: 'patient', id: maria, name: 'Maria Test' });
    });

    it('logs a withdrawn scan opened by an admin', async () => {
      const created = await upload(obj, 'a.obj').expect(201);
      const path = `${scansOf(maria)}/${created.body.id}`;
      await as('DENTIST').post(`${path}/withdraw`).send({ reason: 'x' }).expect(200);
      await as('ADMIN').get(`${path}/file`).expect(200);
      expect(await owner.auditLog.count({ where: { action: 'SCAN_VIEWED', actorUserId: ids.ADMIN } })).toBe(1);
    });
  });

  describe('database protection', () => {
    it('lets the API login add scans and withdraw them, and nothing else', async () => {
      const created = await upload(obj, 'a.obj').expect(201);
      const id: string = created.body.id;

      await expect(appDb.$executeRaw`DELETE FROM patient_scans WHERE id = ${id}::uuid`).rejects.toThrow();
      for (const run of [
        () => appDb.$executeRaw`UPDATE patient_scans SET title = 'changed' WHERE id = ${id}::uuid`,
        () => appDb.$executeRaw`UPDATE patient_scans SET sha256 = repeat('a', 64) WHERE id = ${id}::uuid`,
        () => appDb.$executeRaw`UPDATE patient_scans SET storage_key = 'x' WHERE id = ${id}::uuid`,
        () => appDb.$executeRaw`UPDATE patient_scans SET size_bytes = 1 WHERE id = ${id}::uuid`,
      ]) {
        await expect(run()).rejects.toThrow();
      }
      // The withdrawn columns are all-or-nothing.
      await expect(
        appDb.$executeRaw`UPDATE patient_scans SET withdrawn_at = now() WHERE id = ${id}::uuid`,
      ).rejects.toThrow();
      expect(
        await appDb.$executeRaw`UPDATE patient_scans SET withdrawn_at = now(), withdrawn_by_id = ${ids.DENTIST}::uuid,
          withdraw_reason = 'ok' WHERE id = ${id}::uuid`,
      ).toBe(1);

      const row = await owner.patientScan.findUniqueOrThrow({ where: { id } });
      expect(row.title).toBe('Upper arch');
    });

    it('refuses an empty file size', async () => {
      await expect(
        owner.patientScan.create({
          data: {
            patientId: maria,
            title: 't',
            format: 'OBJ',
            fileName: 'a.obj',
            sizeBytes: 0,
            sha256: 'a'.repeat(64),
            storageKey: 'k'.repeat(10),
            scannedOn: new Date('2026-01-01'),
            uploadedById: ids.DENTIST,
          },
        }),
      ).rejects.toThrow();
    });
  });
});
