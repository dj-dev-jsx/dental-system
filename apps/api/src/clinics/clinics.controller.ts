import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { type UpdateClinicInput, updateClinicSchema } from './clinics.schemas.js';
import { ClinicsService } from './clinics.service.js';

@Controller('clinics')
export class ClinicsController {
  // Has @Public(), so anyone can open it.
  @Public()
  @Get('hello')
  hello() {
    return { message: 'Hello from ClinicsController!' };
  }
}

// /clinic (singular) is the logged-in user's own clinic. There is no id in the URL on
// purpose: nobody can ask for another clinic.
@Controller('clinic')
export class ClinicController {
  constructor(private readonly clinics: ClinicsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.clinics.get(user);
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
