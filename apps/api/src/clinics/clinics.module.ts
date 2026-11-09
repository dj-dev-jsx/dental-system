import { Module } from '@nestjs/common';
import { ClinicController, SiteController } from './clinics.controller.js';
import { ClinicsService } from './clinics.service.js';

@Module({
  controllers: [SiteController, ClinicController],
  providers: [ClinicsService],
})
export class ClinicsModule {}
