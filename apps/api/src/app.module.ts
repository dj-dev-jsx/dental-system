import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ClinicsController } from './clinics/clinics.controller.js';
import { PatientsModule } from './patients/patients.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { ChartModule } from './chart/chart.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    PatientsModule,
    AuditModule,
    AppointmentsModule,
    ChartModule,
  ],
  controllers: [HealthController, ClinicsController],
})
export class AppModule {}
