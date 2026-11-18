import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ZodType } from 'zod';
import { recordAudit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { todayInManila } from '../common/manila.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { looksLike } from './scan-content.js';
import { ScanStorage } from './scan-storage.js';
import type { SavedScan } from './scan-upload.js';
import {
  type SetPinsInput,
  uploadScanSchema,
  type ViewSettingsInput,
  type WithdrawScanInput,
} from './scans.schemas.js';

const PIN_FIELDS = {
  tooth: true,
  x: true,
  y: true,
  z: true,
  neckX: true,
  neckY: true,
  neckZ: true,
  updatedAt: true,
  placedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ScanToothPinSelect;

type PinRow = Prisma.ScanToothPinGetPayload<{ select: typeof PIN_FIELDS }>;

/** The pins the web app reads, with who last changed the set and when. */
function toPins(rows: PinRow[]) {
  const latest = rows.reduce<PinRow | null>((a, b) => (!a || b.updatedAt > a.updatedAt ? b : a), null);
  return {
    items: rows.map(({ tooth, x, y, z, neckX, neckY, neckZ }) => ({
      tooth,
      x,
      y,
      z,
      neck: neckX !== null && neckY !== null && neckZ !== null ? { x: neckX, y: neckY, z: neckZ } : null,
    })),
    updatedAt: latest ? latest.updatedAt.toISOString() : null,
    updatedBy: latest ? latest.placedBy : null,
  };
}

const VIEW_FIELDS = {
  view: true,
  hideGums: true,
  gumMethod: true,
  gumLineMm: true,
  colourSensitivity: true,
  updatedAt: true,
  updatedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ScanViewSettingsSelect;

type ViewRow = Prisma.ScanViewSettingsGetPayload<{
  select: typeof VIEW_FIELDS;
}>;

/** A scan nobody has set a view for opens on its own, with its gums. */
function toViewSettings(row: ViewRow | null) {
  if (!row) {
    return {
      view: 'SCAN_ONLY',
      hideGums: false,
      gumMethod: null,
      gumLineMm: null,
      colourSensitivity: null,
      updatedAt: null,
      updatedBy: null,
    };
  }
  const { updatedAt, ...rest } = row;
  return { ...rest, updatedAt: updatedAt.toISOString() };
}

const SCAN_FIELDS = {
  id: true,
  title: true,
  note: true,
  format: true,
  fileName: true,
  sizeBytes: true,
  scannedOn: true,
  createdAt: true,
  withdrawnAt: true,
  withdrawReason: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { toothPins: true } },
} satisfies Prisma.PatientScanSelect;

type ScanRow = Prisma.PatientScanGetPayload<{ select: typeof SCAN_FIELDS }>;

/** The shape the web app reads. */
function toScan(row: ScanRow) {
  const { scannedOn, withdrawnAt, withdrawReason, _count, ...rest } = row;
  return {
    ...rest,
    pinCount: _count.toothPins,
    scannedOn: scannedOn.toISOString().slice(0, 10),
    withdrawn: withdrawnAt !== null,
    withdrawnAt,
    withdrawReason,
  };
}

/** Opening the same file again within this long by the same person is logged once. */
const VIEW_WINDOW_MS = 10 * 60_000;

/** Checks input with a Zod schema, answering like the rest of the API does when it's wrong. */
function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new BadRequestException(
    result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
  );
}

@Injectable()
export class ScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ScanStorage,
  ) {}

  /** A patient's scans, newest first, withdrawn ones included and marked. */
  async list(patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) throw new NotFoundException('Patient not found');
    const rows = await this.prisma.patientScan.findMany({
      where: { patientId },
      select: SCAN_FIELDS,
      orderBy: [{ scannedOn: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return { items: rows.map(toScan) };
  }

  /**
   * Adds the scan whose file was already saved by the upload. Whatever goes wrong, the saved
   * file is deleted again, so a refused upload leaves nothing behind.
   */
  async upload(user: AuthenticatedUser, patientId: string, file: SavedScan | undefined, body: unknown) {
    if (!file) throw new BadRequestException('SCAN_FILE_REQUIRED');
    try {
      const input = parse(uploadScanSchema, { ...(body as object) });
      const patient = await this.prisma.patient.findUnique({
        where: { id: patientId },
        select: { archivedAt: true },
      });
      if (!patient) throw new NotFoundException('Patient not found');
      if (patient.archivedAt) {
        throw new ConflictException('This patient is archived. An admin can restore them first.');
      }
      const valid = await looksLike(file.format, file.size, () => this.storage.open(file.storageKey));
      if (!valid) throw new BadRequestException('SCAN_FILE_INVALID');

      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.patientScan.create({
          data: {
            patientId,
            title: input.title,
            note: input.note ?? null,
            format: file.format,
            fileName: file.cleanName,
            sizeBytes: file.size,
            sha256: file.sha256,
            storageKey: file.storageKey,
            scannedOn: new Date(`${input.scannedOn ?? todayInManila()}T00:00:00Z`),
            uploadedById: user.id,
          },
          select: SCAN_FIELDS,
        });
        await recordAudit(tx, user, 'SCAN_UPLOADED', {
          entityId: row.id,
          metadata: { patientId, title: row.title, format: row.format, sizeBytes: row.sizeBytes },
        });
        return toScan(row);
      });
    } catch (error) {
      await this.storage.remove(file.storageKey);
      throw error;
    }
  }

  /** Opens a scan's file, noting in the audit log who looked (once per 10 minutes). */
  async open(user: AuthenticatedUser, patientId: string, scanId: string) {
    const scan = await this.findScan(this.prisma, patientId, scanId);
    // A withdrawn scan was wrong or unwanted; only an admin may still get at the file.
    if (scan.withdrawnAt && user.role !== 'ADMIN') throw new GoneException('SCAN_WITHDRAWN');

    const stream = await this.storage.open(scan.storageKey);
    try {
      await this.prisma.$transaction(async (tx) => {
        const recent = await tx.auditLog.findFirst({
          where: {
            action: 'SCAN_VIEWED',
            entityId: scan.id,
            actorUserId: user.id,
            createdAt: { gte: new Date(Date.now() - VIEW_WINDOW_MS) },
          },
          select: { id: true },
        });
        if (recent) return;
        await recordAudit(tx, user, 'SCAN_VIEWED', {
          entityId: scan.id,
          metadata: { patientId, title: scan.title, format: scan.format, sizeBytes: scan.sizeBytes },
        });
      });
    } catch (error) {
      stream.destroy();
      throw error;
    }
    return { stream, format: scan.format, size: scan.sizeBytes };
  }

  /** Marks a scan as wrong or unwanted, with a reason. The row and file stay. */
  withdraw(user: AuthenticatedUser, patientId: string, scanId: string, input: WithdrawScanInput) {
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { archivedAt: true } });
      if (!patient) throw new NotFoundException('Patient not found');
      if (patient.archivedAt) {
        throw new ConflictException('This patient is archived. An admin can restore them first.');
      }
      const scan = await this.findScan(tx, patientId, scanId);
      if (scan.withdrawnAt) throw new ConflictException('ALREADY_WITHDRAWN');

      // The database only lets this change the withdrawn_* columns; the condition makes two
      // people withdrawing at once resolve to one winner.
      const changed = await tx.patientScan.updateMany({
        where: { id: scan.id, withdrawnAt: null },
        data: { withdrawnAt: new Date(), withdrawnById: user.id, withdrawReason: input.reason },
      });
      if (changed.count === 0) throw new ConflictException('ALREADY_WITHDRAWN');
      await recordAudit(tx, user, 'SCAN_WITHDRAWN', {
        entityId: scan.id,
        metadata: { patientId, title: scan.title, format: scan.format, sizeBytes: scan.sizeBytes },
      });
      return toScan(await tx.patientScan.findUniqueOrThrow({ where: { id: scan.id }, select: SCAN_FIELDS }));
    });
  }

  /** The tooth pins on one of this patient's scans, in tooth order. */
  async pins(patientId: string, scanId: string) {
    await this.findScan(this.prisma, patientId, scanId);
    const rows = await this.prisma.scanToothPin.findMany({
      where: { scanId },
      select: PIN_FIELDS,
      orderBy: { tooth: 'asc' },
    });
    return toPins(rows);
  }

  /**
   * Replaces all the pins on a scan at once. The audit line says which teeth were added,
   * removed or moved (tooth numbers only).
   */
  setPins(user: AuthenticatedUser, patientId: string, scanId: string, input: SetPinsInput) {
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUnique({ where: { id: patientId }, select: { archivedAt: true } });
      if (!patient) throw new NotFoundException('Patient not found');
      if (patient.archivedAt) {
        throw new ConflictException('This patient is archived. An admin can restore them first.');
      }
      const scan = await this.findScan(tx, patientId, scanId);
      if (scan.withdrawnAt) throw new ConflictException('SCAN_WITHDRAWN');

      // Two people saving at once: the second waits here for the first.
      await tx.$executeRaw`SELECT 1 FROM patient_scans WHERE id = ${scan.id}::uuid FOR UPDATE`;
      const before = await tx.scanToothPin.findMany({ where: { scanId } });
      const old = new Map(before.map((p) => [p.tooth, p]));
      const next = new Map(input.pins.map((p) => [p.tooth, p]));
      const sorted = (list: string[]) => list.sort();
      const added = sorted(input.pins.filter((p) => !old.has(p.tooth)).map((p) => p.tooth));
      const removed = sorted(before.filter((p) => !next.has(p.tooth)).map((p) => p.tooth));
      const moved = sorted(
        input.pins
          .filter((p) => {
            const was = old.get(p.tooth);
            const neck = p.neck ?? null;
            const neckChanged = neck
              ? was?.neckX !== neck.x || was?.neckY !== neck.y || was?.neckZ !== neck.z
              : was?.neckX !== null;
            return was && (was.x !== p.x || was.y !== p.y || was.z !== p.z || neckChanged);
          })
          .map((p) => p.tooth),
      );

      if (added.length + removed.length + moved.length > 0) {
        await tx.scanToothPin.deleteMany({ where: { scanId } });
        if (input.pins.length > 0) {
          await tx.scanToothPin.createMany({
            data: input.pins.map((p) => ({
              scanId,
              tooth: p.tooth,
              x: p.x,
              y: p.y,
              z: p.z,
              neckX: p.neck?.x ?? null,
              neckY: p.neck?.y ?? null,
              neckZ: p.neck?.z ?? null,
              placedById: user.id,
            })),
          });
        }
        await recordAudit(tx, user, 'SCAN_PINS_UPDATED', {
          entityId: scan.id,
          metadata: { patientId, count: input.pins.length, added, removed, moved },
        });
      }
      const rows = await tx.scanToothPin.findMany({ where: { scanId }, select: PIN_FIELDS, orderBy: { tooth: 'asc' } });
      return toPins(rows);
    });
  }

  /** How one of this patient's scans is shown when it opens (the defaults when nobody chose). */
  async viewSettings(patientId: string, scanId: string) {
    await this.findScan(this.prisma, patientId, scanId);
    return toViewSettings(
      await this.prisma.scanViewSettings.findUnique({
        where: { scanId },
        select: VIEW_FIELDS,
      }),
    );
  }

  /**
   * Sets how a scan is shown, for everyone. Display only: the file is never changed. The audit
   * line has the settings before and after; saving the same settings again logs nothing.
   */
  setViewSettings(
    user: AuthenticatedUser,
    patientId: string,
    scanId: string,
    input: ViewSettingsInput,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findUnique({
        where: { id: patientId },
        select: { archivedAt: true },
      });
      if (!patient) throw new NotFoundException('Patient not found');
      if (patient.archivedAt) {
        throw new ConflictException(
          'This patient is archived. An admin can restore them first.',
        );
      }
      const scan = await this.findScan(tx, patientId, scanId);
      if (scan.withdrawnAt) throw new ConflictException('SCAN_WITHDRAWN');

      await tx.$executeRaw`SELECT 1 FROM patient_scans WHERE id = ${scan.id}::uuid FOR UPDATE`;
      const before = await tx.scanViewSettings.findUnique({
        where: { scanId },
      });
      const was = {
        view: before?.view ?? 'SCAN_ONLY',
        hideGums: before?.hideGums ?? false,
        gumMethod: before?.gumMethod ?? null,
        gumLineMm: before?.gumLineMm ?? null,
        colourSensitivity: before?.colourSensitivity ?? null,
      };
      // REAL keeps about 7 digits: compare what will be stored, not what was sent.
      const same = (a: unknown, b: unknown) =>
        typeof a === 'number' && typeof b === 'number'
          ? Math.fround(a) === Math.fround(b)
          : a === b;
      const changed = (Object.keys(was) as (keyof typeof was)[]).filter(
        (key) => !same(input[key], was[key]),
      );
      if (!before || changed.length > 0) {
        await tx.scanViewSettings.upsert({
          where: { scanId },
          create: { scanId, ...input, updatedById: user.id },
          update: { ...input, updatedById: user.id },
        });
      }
      if (changed.length > 0) {
        await recordAudit(tx, user, 'SCAN_VIEW_SETTINGS_UPDATED', {
          entityId: scan.id,
          metadata: {
            patientId,
            changes: Object.fromEntries(
              changed.map((key) => [key, { from: was[key], to: input[key] }]),
            ),
          },
        });
      }
      return toViewSettings(
        await tx.scanViewSettings.findUnique({
          where: { scanId },
          select: VIEW_FIELDS,
        }),
      );
    });
  }

  /** The scan, only if it belongs to this patient. */
  private async findScan(db: Prisma.TransactionClient | PrismaService, patientId: string, scanId: string) {
    const scan = await db.patientScan.findFirst({
      where: { id: scanId, patientId },
      select: { id: true, title: true, format: true, sizeBytes: true, storageKey: true, withdrawnAt: true },
    });
    if (!scan) throw new NotFoundException('Scan not found');
    return scan;
  }
}
