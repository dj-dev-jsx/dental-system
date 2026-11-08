import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  type CreateStaffInput,
  type ListStaffQuery,
  listStaffSchema,
  createStaffSchema,
  staffIdSchema,
  type UpdateStaffInput,
  updateStaffSchema,
} from './staff.schemas.js';
import { StaffService } from './staff.service.js';

// Responses hold names, emails and (once) a temporary password: never cache them.
const NO_STORE = 'no-store';

// @Roles on the class applies to every route in it: admins only.
@Roles('ADMIN')
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @Header('Cache-Control', NO_STORE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query({ schema: listStaffSchema }) query: ListStaffQuery,
  ) {
    return this.staff.list(user, query);
  }

  @Post()
  @Header('Cache-Control', NO_STORE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: createStaffSchema }) body: CreateStaffInput,
  ) {
    return this.staff.create(user, body);
  }

  @Patch(':id')
  @Header('Cache-Control', NO_STORE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: staffIdSchema }) id: string,
    @Body({ schema: updateStaffSchema }) body: UpdateStaffInput,
  ) {
    return this.staff.update(user, id, body);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: staffIdSchema }) id: string,
  ) {
    return this.staff.resetPassword(user, id);
  }

  @Post(':id/unlock')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  unlock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', { schema: staffIdSchema }) id: string,
  ) {
    return this.staff.unlock(user, id);
  }
}
