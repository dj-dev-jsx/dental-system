import {
  Body,
  type CallHandler,
  Controller,
  type ExecutionContext,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  type NestInterceptor,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { CurrentPatient, PatientRoute, Public } from '../auth/auth.decorators.js';
import { PATIENT_SESSION_LIFETIME_MS, PortalAuthService } from './portal-auth.service.js';
import {
  bookingRequestSchema,
  type BookingRequestInput,
  cancelSchema,
  type CancelInput,
  emailSchema,
  idSchema,
  loginSchema,
  type RegisterInput,
  registerSchema,
  resetPasswordSchema,
  type SlotsQuery,
  slotsSchema,
  tokenSchema,
} from './portal.schemas.js';
import { PortalService } from './portal.service.js';
import { type AuthenticatedPatient, PATIENT_SESSION_COOKIE } from './portal.types.js';

/** Patients' answers may hold their details, so browsers must never keep a copy (shared phones, kiosks). */
@Injectable()
class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}

const TEN_MINUTES = 10 * 60_000;

// Online booking, for patients: /api/v1/portal/... Signed-in routes take the patient from
// their session. While online booking is switched off every route answers 404.
// Rate limits are per IP address, so nobody can mass-create accounts, guess passwords or
// flood a clinic with requests.
@Controller('portal')
@UseInterceptors(NoStoreInterceptor)
export class PortalController {
  constructor(
    private readonly portal: PortalService,
    private readonly auth: PortalAuthService,
    private readonly config: ConfigService,
  ) {}

  private setSessionCookie(response: Response, token: string) {
    response.cookie(PATIENT_SESSION_COOKIE, token, {
      httpOnly: true, // page JavaScript can't read it, so an XSS bug can't steal it
      sameSite: 'strict', // other websites can't send requests using this login
      secure: this.config.get('NODE_ENV') === 'production', // HTTPS only in production
      maxAge: PATIENT_SESSION_LIFETIME_MS,
      path: '/',
    });
  }

  @Public()
  @Get()
  info() {
    return this.portal.info();
  }

  @Public()
  @Get('slots')
  slots(@Query({ schema: slotsSchema }) query: SlotsQuery) {
    return this.portal.slots(query);
  }

  // 202 Accepted with nothing in it, whatever happened: the answer never says whether the
  // email already had an account. The email that arrives does.
  @Public()
  @Throttle({ default: { limit: 5, ttl: TEN_MINUTES } })
  @Post('register')
  @HttpCode(202)
  async register(@Body({ schema: registerSchema }) body: RegisterInput) {
    await this.auth.register(body);
    return {};
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: TEN_MINUTES } })
  @Post('verify')
  @HttpCode(200)
  async verify(
    @Body({ schema: tokenSchema }) body: z.infer<typeof tokenSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { sessionToken, ...result } = await this.auth.verify(body.token);
    this.setSessionCookie(response, sessionToken);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: TEN_MINUTES } })
  @Post('resend-verification')
  @HttpCode(202)
  async resendVerification(@Body({ schema: emailSchema }) body: z.infer<typeof emailSchema>) {
    await this.auth.resendVerification(body.email);
    return {};
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(204)
  async login(
    @Body({ schema: loginSchema }) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(body.email, body.password);
    // One message for every failure, so it never reveals which emails exist. Only someone who
    // knows the password learns the email still needs confirming.
    if (!result) throw new UnauthorizedException('Invalid email or password');
    if (result === 'UNVERIFIED') throw new ForbiddenException('EMAIL_NOT_VERIFIED');
    this.setSessionCookie(response, result.token);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: TEN_MINUTES } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body({ schema: emailSchema }) body: z.infer<typeof emailSchema>) {
    await this.auth.forgotPassword(body.email);
    return {};
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: TEN_MINUTES } })
  @Post('reset-password')
  @HttpCode(204)
  async resetPassword(
    @Body({ schema: resetPasswordSchema }) body: z.infer<typeof resetPasswordSchema>,
  ) {
    await this.auth.resetPassword(body.token, body.newPassword);
  }

  @PatientRoute()
  @Get('me')
  me(@CurrentPatient() patient: AuthenticatedPatient) {
    return this.auth.me(patient);
  }

  @PatientRoute()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentPatient() patient: AuthenticatedPatient,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(patient, (request.cookies as Record<string, string>)[PATIENT_SESSION_COOKIE]);
    response.clearCookie(PATIENT_SESSION_COOKIE, { path: '/' });
  }

  @PatientRoute()
  @Get('appointments')
  appointments(@CurrentPatient() patient: AuthenticatedPatient) {
    return this.portal.appointments(patient);
  }

  @PatientRoute()
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  @Post('appointments')
  book(
    @CurrentPatient() patient: AuthenticatedPatient,
    @Body({ schema: bookingRequestSchema }) body: BookingRequestInput,
  ) {
    return this.portal.book(patient, body);
  }

  @PatientRoute()
  @Post('appointments/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentPatient() patient: AuthenticatedPatient,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: cancelSchema }) body: CancelInput,
  ) {
    return this.portal.cancel(patient, id, body.reason);
  }
}
