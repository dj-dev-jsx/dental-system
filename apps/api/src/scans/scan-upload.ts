import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import type { ScanFormat } from '../generated/prisma/client.js';
import type { ScanStorage } from './scan-storage.js';

export const SCAN_FIELD = 'file';

const FORMATS: Record<string, ScanFormat> = { stl: 'STL', ply: 'PLY', obj: 'OBJ' };

/** The format named by a file's extension, whatever the capital letters. */
export function formatOf(fileName: string): ScanFormat | null {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? null : (FORMATS[fileName.slice(dot + 1).toLowerCase()] ?? null);
}

/** A file name safe to store and show: no folders, no control characters, at most 200 long. */
export function cleanFileName(name: string) {
  // Browsers send UTF-8 names that the form parser reads as latin1; undo that when it fits.
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  const text = decoded.includes('�') ? name : decoded;
  // oxlint-disable-next-line no-control-regex -- removing control characters is the point
  const base = (text.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
  if (base.length <= 200) return base || 'scan';
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 && base.length - dot <= 10 ? base.slice(dot) : '';
  return base.slice(0, 200 - ext.length) + ext;
}

/** What the upload leaves on req.file, in addition to multer's usual fields. */
export type SavedScan = Express.Multer.File & {
  storageKey: string;
  sha256: string;
  format: ScanFormat;
  cleanName: string;
};

/**
 * Multer storage engine that streams the upload straight into ScanStorage: never held in
 * memory, hashed as it is saved, refused as soon as it passes the size limit.
 */
export function scanUploadEngine(storage: ScanStorage, maxBytes: () => number): StorageEngine {
  return {
    _handleFile(_req: Request, file, done) {
      const format = formatOf(file.originalname);
      if (!format) {
        file.stream.resume();
        return done(new BadRequestException('SCAN_FORMAT_UNSUPPORTED'));
      }
      storage.put(file.stream, maxBytes()).then(
        (saved) =>
          done(null, {
            size: saved.size,
            storageKey: saved.key,
            sha256: saved.sha256,
            format,
            cleanName: cleanFileName(file.originalname),
          } as Partial<SavedScan>),
        (error: unknown) => {
          file.stream.resume();
          done(error as Error);
        },
      );
    },
    _removeFile(_req, file, done) {
      const key = (file as Partial<SavedScan>).storageKey;
      (key ? storage.remove(key) : Promise.resolve()).then(() => done(null), done);
    },
  };
}
