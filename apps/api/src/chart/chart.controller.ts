import { Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  type CorrectToothInput,
  correctToothSchema,
  idSchema,
  type RecordToothInput,
  recordToothSchema,
} from './chart.schemas.js';
import { ChartService } from './chart.service.js';

// Any staff member can look at a chart, but only dentists and admins (in a small clinic, the
// owner is usually the dentist) can write in it: clinical findings are the dentist's call.
@Controller('patients/:patientId/chart')
export class ChartController {
  constructor(private readonly chart: ChartService) {}

  @Get()
  // Health data: never kept in the browser's cache on a shared computer.
  @Header('Cache-Control', 'no-store')
  find(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId', { schema: idSchema }) patientId: string,
  ) {
    return this.chart.chart(user, patientId);
  }

  @Roles('DENTIST', 'ADMIN')
  @Post('records')
  record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId', { schema: idSchema }) patientId: string,
    @Body({ schema: recordToothSchema }) body: RecordToothInput,
  ) {
    return this.chart.record(user, patientId, body);
  }

  @Roles('DENTIST', 'ADMIN')
  @Post('records/:recordId/correct')
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId', { schema: idSchema }) patientId: string,
    @Param('recordId', { schema: idSchema }) recordId: string,
    @Body({ schema: correctToothSchema }) body: CorrectToothInput,
  ) {
    return this.chart.correct(user, patientId, recordId, body);
  }
}
