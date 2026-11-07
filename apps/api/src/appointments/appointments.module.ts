import { Module } from '@nestjs/common';
import {
  AppointmentsController,
  DentistsController,
  PatientAppointmentsController,
} from './appointments.controller.js';
import { AppointmentsService } from './appointments.service.js';

@Module({
  controllers: [AppointmentsController, PatientAppointmentsController, DentistsController],
  providers: [AppointmentsService],
})
export class AppointmentsModule {}
