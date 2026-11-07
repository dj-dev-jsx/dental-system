import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ownerClient, resetDatabase } from './test-db.js';

// These tests skip the API and talk straight to the database, using the same limited login
// the API uses. No query here filters by clinic, on purpose: that's the mistake we're
// proving the database catches. Whatever the code forgets, these must still hold.
describe('Row-level security', () => {
  const owner = ownerClient();
  const app = new PrismaService(new ConfigService({ DATABASE_URL: process.env['DATABASE_URL'] }));
  let clinicA: string;
  let clinicB: string;
  let userA: string;
  let userB: string;
  let patientA: string;
  let patientB: string;

  const newPatient = (clinicId: string) => ({
    clinicId,
    firstName: 'Test',
    lastName: 'Patient',
    birthDate: new Date('2000-01-01'),
  });

  beforeEach(async () => {
    await resetDatabase(owner);
    const [a, b] = await Promise.all([
      owner.clinic.create({ data: { name: 'Clinic A' } }),
      owner.clinic.create({ data: { name: 'Clinic B' } }),
    ]);
    clinicA = a.id;
    clinicB = b.id;
    const user = (clinicId: string, email: string) =>
      owner.user.create({
        data: { clinicId, email, passwordHash: 'x', firstName: 'T', lastName: 'U', role: 'ADMIN' },
      });
    userA = (await user(clinicA, 'a@test.example')).id;
    userB = (await user(clinicB, 'b@test.example')).id;
    patientA = (await owner.patient.create({ data: newPatient(clinicA) })).id;
    patientB = (await owner.patient.create({ data: newPatient(clinicB) })).id;
    await owner.auditLog.create({
      data: { clinicId: clinicB, actorUserId: userB, action: 'PATIENT_VIEWED', entityId: patientB },
    });
  });

  afterAll(async () => {
    await app.$disconnect();
    await owner.$disconnect();
  });

  it('connects with a login that cannot skip row-level security', async () => {
    const [login] = await app.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(login).toEqual({ rolname: 'dental_app', rolsuper: false, rolbypassrls: false });
  });

  describe('when the code forgets to say which clinic', () => {
    it('shows nothing', async () => {
      expect(await app.patient.findMany()).toEqual([]);
      expect(await app.auditLog.findMany()).toEqual([]);
    });

    it('refuses to create patients', async () => {
      await expect(app.patient.create({ data: newPatient(clinicA) })).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  describe('when acting for Clinic A', () => {
    it('shows only Clinic A, even with no filter in the query', async () => {
      const patients = await app.forClinic(clinicA, (tx) => tx.patient.findMany());
      expect(patients.map((patient) => patient.id)).toEqual([patientA]);
    });

    it("can't find a Clinic B patient by id", async () => {
      const found = await app.forClinic(clinicA, (tx) =>
        tx.patient.findUnique({ where: { id: patientB } }),
      );
      expect(found).toBeNull();
    });

    it("can't create a patient for Clinic B", async () => {
      await expect(
        app.forClinic(clinicA, (tx) => tx.patient.create({ data: newPatient(clinicB) })),
      ).rejects.toThrow(/row-level security/);
    });

    it("can't change a Clinic B patient", async () => {
      const { count } = await app.forClinic(clinicA, (tx) =>
        tx.patient.updateMany({ data: { firstName: 'Hacked' } }),
      );
      expect(count).toBe(1); // only Clinic A's own patient
      const untouched = await owner.patient.findUniqueOrThrow({ where: { id: patientB } });
      expect(untouched.firstName).toBe('Test');
    });

    it("can't move its patient to Clinic B", async () => {
      await expect(
        app.forClinic(clinicA, (tx) =>
          tx.$executeRaw`UPDATE patients SET clinic_id = ${clinicB}::uuid WHERE id = ${patientA}::uuid`,
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("can't read Clinic B's audit log", async () => {
      expect(await app.forClinic(clinicA, (tx) => tx.auditLog.findMany())).toEqual([]);
    });

    it("can't write to Clinic B's audit log", async () => {
      await expect(
        app.forClinic(clinicA, (tx) =>
          tx.auditLog.create({
            data: { clinicId: clinicB, actorUserId: userB, action: 'PATIENT_VIEWED' },
          }),
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("can't blame a user from another clinic in its own audit log", async () => {
      await expect(
        app.forClinic(clinicA, (tx) =>
          tx.auditLog.create({
            data: { clinicId: clinicA, actorUserId: userB, action: 'PATIENT_VIEWED' },
          }),
        ),
      ).rejects.toThrow(/Foreign key|foreign key/);
    });
  });

  it('accepts only a real id as the clinic, and fails rather than showing rows', async () => {
    await expect(app.forClinic('not-a-uuid', (tx) => tx.patient.findMany())).rejects.toThrow(
      /uuid/i,
    );
    expect(await app.forClinic(randomUUID(), (tx) => tx.patient.findMany())).toEqual([]);
  });

  it('forgets the clinic when the transaction ends, on every pooled connection', async () => {
    // Connections are reused between requests. If the setting survived, the next request on
    // that connection would act as the wrong clinic. Running these at the same time makes
    // the pool open several connections, so the checks after it cover more than one.
    const inside = await Promise.all(
      Array.from({ length: 8 }, () => app.forClinic(clinicA, (tx) => tx.patient.count())),
    );
    expect(inside).toEqual(Array(8).fill(1));

    const outside = await Promise.all(Array.from({ length: 20 }, () => app.patient.count()));
    expect(outside).toEqual(Array(20).fill(0));
  });

  describe('records that must be kept', () => {
    it("won't delete a patient, even the clinic's own", async () => {
      await expect(
        app.forClinic(clinicA, (tx) => tx.patient.delete({ where: { id: patientA } })),
      ).rejects.toThrow(/permission denied/);
      await expect(
        app.forClinic(clinicA, (tx) => tx.$executeRaw`TRUNCATE patients CASCADE`),
      ).rejects.toThrow(/permission denied/);
    });

    it('lets the audit log grow, but never changes or removes a line', async () => {
      const entry = await app.forClinic(clinicA, (tx) =>
        tx.auditLog.create({
          data: { clinicId: clinicA, actorUserId: userA, action: 'PATIENT_VIEWED' },
        }),
      );
      await expect(
        app.forClinic(clinicA, (tx) =>
          tx.auditLog.update({ where: { id: entry.id }, data: { action: 'PATIENT_LISTED' } }),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        app.forClinic(clinicA, (tx) => tx.auditLog.delete({ where: { id: entry.id } })),
      ).rejects.toThrow(/permission denied/);
      await expect(
        app.forClinic(clinicA, (tx) => tx.$executeRaw`TRUNCATE audit_logs`),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it('protects every table that has a clinic_id', async () => {
    // Fails when someone adds a clinic-owned table and forgets row-level security.
    // The API must read users before it knows the clinic, during login. Move a table to this
    // list only with a reason like that one.
    const allowedWithout = ['users'];
    const tables = await owner.$queryRaw<
      { table_name: string; enabled: boolean; forced: boolean }[]
    >`
      SELECT c.relname AS table_name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'clinic_id' AND NOT a.attisdropped
    `;
    const unprotected = tables
      .filter((table) => !(table.enabled && table.forced))
      .map((table) => table.table_name);
    expect(tables.length).toBeGreaterThanOrEqual(3);
    expect(unprotected).toEqual(allowedWithout);
  });
});
