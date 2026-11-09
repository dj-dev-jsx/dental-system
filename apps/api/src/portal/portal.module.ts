import { Module } from '@nestjs/common';
import { PortalAuthService } from './portal-auth.service.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  controllers: [PortalController],
  providers: [PortalAuthService, PortalService],
  // The global SessionGuard (in AuthModule) uses it to check patient sessions.
  exports: [PortalAuthService],
})
export class PortalModule {}
