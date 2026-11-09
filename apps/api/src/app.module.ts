import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ClinicsModule } from './clinics/clinics.module.js';
import { StaffModule } from './staff/staff.module.js';
import { PatientsModule } from './patients/patients.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AppointmentsModule } from './appointments/appointments.module.js';
import { ChartModule } from './chart/chart.module.js';
import { MailModule } from './mail/mail.module.js';
import { PortalModule } from './portal/portal.module.js';
import { PatientAccountsModule } from './patient-accounts/patient-accounts.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MailModule,
    AuthModule,
    PatientsModule,
    AuditModule,
    AppointmentsModule,
    ChartModule,
    ClinicsModule,
    StaffModule,
    PortalModule,
    PatientAccountsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
