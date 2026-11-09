import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { type UpdateClinicInput, updateClinicSchema } from './clinics.schemas.js';
import { ClinicsService } from './clinics.service.js';

// GET /site: the clinic's public details, for the public pages (landing, sign-in), which
// also use onlineBookingEnabled to decide whether to offer booking. Anyone can open it.
@Controller('site')
export class SiteController {
  constructor(private readonly clinics: ClinicsService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  site() {
    return this.clinics.site();
  }
}

// /clinic: the clinic's details and settings, for staff. Only admins may change them.
@Controller('clinic')
export class ClinicController {
  constructor(private readonly clinics: ClinicsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get() {
    return this.clinics.get();
  }

  @Roles('ADMIN')
  @Patch()
  @Header('Cache-Control', 'no-store')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body({ schema: updateClinicSchema }) body: UpdateClinicInput,
  ) {
    return this.clinics.update(user, body);
  }
}
