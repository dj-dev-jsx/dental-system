import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  type CreatePatientInput,
  createPatientSchema,
  type ListPatientsQuery,
  listPatientsSchema,
  patientIdSchema,
  type UpdatePatientInput,
  updatePatientSchema,
} from './patients.schemas.js';
import { PatientsService } from './patients.service.js';

// no-store stops the browser keeping a copy of patient details on a shared clinic computer.
const NO_STORE = 'no-store';

// Routes without @Roles allow any logged-in staff. In small clinics assistants often
// register patients too, so only archiving is limited to admins.
// The clinic always comes from the logged-in user, never from the request.
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: createPatientSchema }) body: CreatePatientInput,
  ) {
    return this.patients.create(user, body);
  }

  @Get()
  @Header('Cache-Control', NO_STORE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: listPatientsSchema }) query: ListPatientsQuery,
  ) {
    return this.patients.list(user, query);
  }

  @Get(':id')
  @Header('Cache-Control', NO_STORE)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: patientIdSchema }) id: string,
  ) {
    return this.patients.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: patientIdSchema }) id: string,
    @Body({ schema: updatePatientSchema }) body: UpdatePatientInput,
  ) {
    return this.patients.update(user, id, body);
  }

  @Roles('ADMIN')
  @Post(':id/archive')
  @HttpCode(204)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: patientIdSchema }) id: string,
  ) {
    return this.patients.archive(user, id);
  }

  @Roles('ADMIN')
  @Post(':id/restore')
  @HttpCode(204)
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: patientIdSchema }) id: string,
  ) {
    return this.patients.restore(user, id);
  }
}
