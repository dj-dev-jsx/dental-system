import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { PatientAccountsService } from './patient-accounts.service.js';

const idSchema = z.uuid();
const linkSchema = z.strictObject({ patientId: z.uuid() });

const NO_STORE = 'no-store';

// Online booking accounts, for staff. Answering online requests is front-desk work, so like
// confirming them these routes are open to all staff; only undoing a link is for admins.
@Controller('patient-accounts')
export class PatientAccountsController {
  constructor(private readonly accounts: PatientAccountsService) {}

  @Get(':id')
  @Header('Cache-Control', NO_STORE)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', { schema: idSchema }) id: string) {
    return this.accounts.findOne(user, id);
  }

  @Get(':id/matches')
  @Header('Cache-Control', NO_STORE)
  matches(@CurrentUser() user: AuthenticatedUser, @Param('id', { schema: idSchema }) id: string) {
    return this.accounts.matches(user, id);
  }

  @Post(':id/link')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: linkSchema }) body: z.infer<typeof linkSchema>,
  ) {
    return this.accounts.link(user, id, body.patientId);
  }

  @Post(':id/create-patient')
  createPatient(@CurrentUser() user: AuthenticatedUser, @Param('id', { schema: idSchema }) id: string) {
    return this.accounts.createPatient(user, id);
  }

  @Roles('ADMIN')
  @Post(':id/unlink')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  unlink(@CurrentUser() user: AuthenticatedUser, @Param('id', { schema: idSchema }) id: string) {
    return this.accounts.unlink(user, id);
  }
}
