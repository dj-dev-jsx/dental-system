import { Controller, Get, Header, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AuditService, type ListAuditLogsQuery, listAuditLogsSchema } from './audit.service.js';

// @Roles on the class applies to every route in it. The log holds patient details and shows
// what every staff member did, so only admins can read it.
@Roles('ADMIN')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: listAuditLogsSchema }) query: ListAuditLogsQuery,
  ) {
    return this.audit.list(user, query);
  }
}
