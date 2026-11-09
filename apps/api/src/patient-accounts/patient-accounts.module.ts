import { Module } from '@nestjs/common';
import { PatientAccountsController } from './patient-accounts.controller.js';
import { PatientAccountsService } from './patient-accounts.service.js';

@Module({
  controllers: [PatientAccountsController],
  providers: [PatientAccountsService],
})
export class PatientAccountsModule {}
