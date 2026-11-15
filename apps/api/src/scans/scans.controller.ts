import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  StreamableFile,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ScanUploadInterceptor } from './scan-upload.interceptor.js';
import type { SavedScan } from './scan-upload.js';
import {
  idSchema,
  type SetPinsInput,
  setPinsSchema,
  type WithdrawScanInput,
  withdrawScanSchema,
} from './scans.schemas.js';
import { ScansService } from './scans.service.js';

// Any staff member can list and open scans (like the read-only chart); only dentists and
// admins add or withdraw them.
@Controller('patients/:patientId/scans')
export class ScansController {
  constructor(private readonly scans: ScansService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Param('patientId', { schema: idSchema }) patientId: string) {
    return this.scans.list(patientId);
  }

  @Roles('DENTIST', 'ADMIN')
  @Post()
  // A scan is big: 20 uploads an hour from one address is plenty for a clinic.
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @UseInterceptors(ScanUploadInterceptor)
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId', { schema: idSchema }) patientId: string,
    @Req() req: Request & { file?: SavedScan },
    @Body() body: unknown,
  ) {
    return this.scans.upload(user, patientId, req.file, body);
  }

  @Get(':scanId/file')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async file(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId', { schema: idSchema }) patientId: string,
    @Param('scanId', { schema: idSchema }) scanId: string,
  ) {
    const { stream, format, size } = await this.scans.open(user, patientId, scanId);
    return new StreamableFile(stream, {
      type: 'application/octet-stream',
      length: size,
      // A fixed, safe name: the original is never put into a header.
      disposition: `inline; filename="scan.${format.toLowerCase()}"`,
    });
  }

  @Roles('DENTIST', 'ADMIN')
  @Post(':scanId/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId', { schema: idSchema }) patientId: string,
    @Param('scanId', { schema: idSchema }) scanId: string,
    @Body({ schema: withdrawScanSchema }) body: WithdrawScanInput,
  ) {
    return this.scans.withdraw(user, patientId, scanId, body);
  }

  // Where each tooth is on the scan. Anyone on staff can read them, to click a tooth.
  @Get(':scanId/pins')
  @Header('Cache-Control', 'no-store')
  pins(
    @Param('patientId', { schema: idSchema }) patientId: string,
    @Param('scanId', { schema: idSchema }) scanId: string,
  ) {
    return this.scans.pins(patientId, scanId);
  }

  @Roles('DENTIST', 'ADMIN')
  @Put(':scanId/pins')
  setPins(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId', { schema: idSchema }) patientId: string,
    @Param('scanId', { schema: idSchema }) scanId: string,
    @Body({ schema: setPinsSchema }) body: SetPinsInput,
  ) {
    return this.scans.setPins(user, patientId, scanId, body);
  }
}
