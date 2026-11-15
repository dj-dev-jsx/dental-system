import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** What was saved: the random key it was stored under, its size, and its SHA-256 (hex). */
export type StoredFile = { key: string; size: number; sha256: string };

/**
 * Where scan files live. The rest of the app only knows this interface, so the local disk
 * below can be swapped for S3 or R2 later without touching anything else.
 */
export abstract class ScanStorage {
  /** Saves the stream under a new random key, refusing (and keeping nothing) past maxBytes. */
  abstract put(source: Readable, maxBytes: number): Promise<StoredFile>;
  /** The file's bytes. Rejects with a 404 when the file is gone. */
  abstract open(key: string): Promise<Readable>;
  /** Deletes a file. Never fails when it's already gone. */
  abstract remove(key: string): Promise<void>;
}

/** Keys are made here, never from user input; this guards the one place a key becomes a path. */
const KEY = /^[0-9a-f]{48}$/;

/**
 * Keeps files in one folder on this computer's disk (SCAN_STORAGE_DIR, by default
 * apps/api/storage/scans, created on first use).
 *
 * Production: scans are health records. Use object storage (S3 or R2) with encryption at rest
 * and backups by writing another ScanStorage, or at least put this folder on an encrypted disk.
 */
@Injectable()
export class LocalScanStorage extends ScanStorage {
  constructor(private readonly config: ConfigService) {
    super();
  }

  private dir() {
    const configured = this.config.get<string>('SCAN_STORAGE_DIR');
    // The default is relative to the API's folder, where its scripts run from.
    return configured ? resolve(configured) : resolve(process.cwd(), 'storage', 'scans');
  }

  private path(key: string) {
    if (!KEY.test(key)) throw new Error('Not a storage key');
    return join(this.dir(), key);
  }

  async put(source: Readable, maxBytes: number): Promise<StoredFile> {
    await mkdir(this.dir(), { recursive: true });
    const key = randomBytes(24).toString('hex');
    const finalPath = this.path(key);
    const tempPath = `${finalPath}.part`;

    const hash = createHash('sha256');
    let size = 0;
    const measure = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        size += chunk.length;
        if (size > maxBytes) return done(new PayloadTooLargeException('SCAN_TOO_LARGE'));
        hash.update(chunk);
        done(null, chunk);
      },
    });
    try {
      await pipeline(source, measure, createWriteStream(tempPath, { flags: 'wx' }));
      await rename(tempPath, finalPath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
    return { key, size, sha256: hash.digest('hex') };
  }

  async open(key: string): Promise<Readable> {
    const path = this.path(key);
    try {
      await stat(path);
    } catch {
      throw new NotFoundException('The scan file is missing');
    }
    return createReadStream(path);
  }

  async remove(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }
}
