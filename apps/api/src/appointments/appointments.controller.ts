import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  type AvailabilityQuery,
  availabilitySchema,
  type ConfirmAppointmentInput,
  confirmAppointmentSchema,
  type CreateAppointmentInput,
  createAppointmentSchema,
  idSchema,
  type ListAppointmentsQuery,
  listAppointmentsSchema,
  type StatusNoteInput,
  statusNoteSchema,
  type UpdateAppointmentInput,
  updateAppointmentSchema,
} from './appointments.schemas.js';
import { AppointmentsService } from './appointments.service.js';

// Schedules show patients' names and reasons for visits, so nothing here may be kept in the
// browser's cache on a shared front-desk computer.
const NO_STORE = 'no-store';

// Booking and answering requests is front-desk work, so every route is open to all staff.
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @Header('Cache-Control', NO_STORE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: listAppointmentsSchema }) query: ListAppointmentsQuery,
  ) {
    return this.appointments.list(user, query);
  }

  // These two come before ':id', or "requests" would be read as an id.
  @Get('requests')
  @Header('Cache-Control', NO_STORE)
  requests(@CurrentUser() user: AuthenticatedUser) {
    return this.appointments.requests(user);
  }

  @Get('requests/count')
  @Header('Cache-Control', NO_STORE)
  requestCount(@CurrentUser() user: AuthenticatedUser) {
    return this.appointments.requestCount(user);
  }

  // Is a dentist free then? Asked while the booking form is filled in, so it isn't logged.
  @Get('availability')
  @Header('Cache-Control', NO_STORE)
  availability(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: availabilitySchema }) query: AvailabilityQuery,
  ) {
    return this.appointments.availability(user, query);
  }

  // What happened to one appointment. Reading it is not logged, or it would add to what it lists.
  @Get(':id/history')
  @Header('Cache-Control', NO_STORE)
  history(@CurrentUser() user: AuthenticatedUser, @Param('id', { schema: idSchema }) id: string) {
    return this.appointments.history(user, id);
  }

  @Get(':id')
  @Header('Cache-Control', NO_STORE)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', { schema: idSchema }) id: string) {
    return this.appointments.findOne(user, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: createAppointmentSchema }) body: CreateAppointmentInput,
  ) {
    return this.appointments.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: updateAppointmentSchema }) body: UpdateAppointmentInput,
  ) {
    return this.appointments.update(user, id, body);
  }

  // Changes of status are their own routes rather than PATCH { status }, so each one can
  // have its own rules: only a request can be confirmed or declined, for example.
  // They answer 200 with the changed appointment; POST would otherwise answer 201 Created.
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: confirmAppointmentSchema }) body: ConfirmAppointmentInput,
  ) {
    return this.appointments.confirm(user, id, body);
  }

  @Post(':id/decline')
  @HttpCode(200)
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: statusNoteSchema }) body: StatusNoteInput,
  ) {
    return this.appointments.decline(user, id, body.note);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: statusNoteSchema }) body: StatusNoteInput,
  ) {
    return this.appointments.cancel(user, id, body.note);
  }
}

/** One patient's appointments, for their record. */
@Controller('patients/:patientId/appointments')
export class PatientAppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @Header('Cache-Control', NO_STORE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId', { schema: idSchema }) patientId: string,
  ) {
    return this.appointments.forPatient(user, patientId);
  }
}

/** The clinic's dentists, for choosing who an appointment is with. */
@Controller('dentists')
export class DentistsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.appointments.dentists(user);
  }
}
