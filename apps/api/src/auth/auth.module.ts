import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PortalModule } from '../portal/portal.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { RolesGuard } from './roles.guard.js';
import { SessionGuard } from './session.guard.js';

@Module({
  // PortalModule, for the guard to check patient sessions as well as staff ones.
  imports: [ThrottlerModule.forRoot([{ limit: 300, ttl: 60_000 }]), PortalModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    ThrottlerGuard, // listed separately so tests can swap it out
    // APP_GUARD applies these to every route in the app, in this order.
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
