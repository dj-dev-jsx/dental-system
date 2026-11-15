import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { SCAN_FIELD, scanUploadEngine } from './scan-upload.js';
import { ScanStorage } from './scan-storage.js';

/** The biggest scan accepted, in bytes: SCAN_MAX_MB megabytes, 150 unless set. */
export function maxScanBytes(config: ConfigService) {
  const mb = Number(config.get<string>('SCAN_MAX_MB'));
  return (Number.isFinite(mb) && mb > 0 ? mb : 150) * 1024 * 1024;
}

/** Reads the multipart upload, streaming the one file into storage. Leaves it on req.file. */
@Injectable()
export class ScanUploadInterceptor implements NestInterceptor {
  constructor(
    private readonly storage: ScanStorage,
    private readonly config: ConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const upload = multer({
      storage: scanUploadEngine(this.storage, () => maxScanBytes(this.config)),
      // One file and a few short text fields, nothing else.
      limits: { files: 1, fields: 6, fieldSize: 4096, parts: 8 },
    }).single(SCAN_FIELD);

    await new Promise<void>((resolve, reject) => {
      upload(http.getRequest<Request>(), http.getResponse<Response>(), (error: unknown) => {
        if (!error) return resolve();
        if (error instanceof HttpException) return reject(error);
        if (error instanceof MulterError) return reject(new BadRequestException(`SCAN_UPLOAD_INVALID: ${error.message}`));
        reject(error);
      });
    });
    return next.handle();
  }
}
