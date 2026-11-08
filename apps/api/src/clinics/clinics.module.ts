import { Module } from '@nestjs/common';
import { ClinicController, ClinicsController } from './clinics.controller.js';
import { ClinicsService } from './clinics.service.js';

@Module({
  controllers: [ClinicsController, ClinicController],
  providers: [ClinicsService],
})
export class ClinicsModule {}
