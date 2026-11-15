import { Module } from '@nestjs/common';
import { ScanUploadInterceptor } from './scan-upload.interceptor.js';
import { LocalScanStorage, ScanStorage } from './scan-storage.js';
import { ScansController } from './scans.controller.js';
import { ScansService } from './scans.service.js';

@Module({
  controllers: [ScansController],
  providers: [
    ScansService,
    ScanUploadInterceptor,
    // Swap this for an object-storage class (S3, R2) to move the files off this computer.
    { provide: ScanStorage, useClass: LocalScanStorage },
  ],
})
export class ScansModule {}
