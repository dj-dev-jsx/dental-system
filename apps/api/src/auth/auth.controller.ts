import {
  Body,
  Controller,
  BadRequestException,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AllowWhenPasswordChangePending, CurrentUser, Public } from './auth.decorators.js';
import { AuthService, SESSION_LIFETIME_MS } from './auth.service.js';
import { type AuthenticatedUser, SESSION_COOKIE } from './auth.types.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // The length cap stops someone sending a huge "password" to tie up the server.
  password: z.string().min(1).max(200),
});

const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(12).max(128),
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: 'The new password must be different from the current one.',
    path: ['newPassword'],
  });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // per IP address, per minute
  @Post('login')
  @HttpCode(204)
  async login(
    @Body({ schema: loginSchema }) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.auth.login(body.email, body.password);
    // One message for every failure, so it never reveals which emails exist.
    if (!token) throw new UnauthorizedException('Invalid email or password');

    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true, // page JavaScript can't read it, so an XSS bug can't steal it
      sameSite: 'strict', // other websites can't send requests using this login
      secure: this.config.get('NODE_ENV') === 'production', // HTTPS only in production
      maxAge: SESSION_LIFETIME_MS,
      path: '/',
    });
  }

  @AllowWhenPasswordChangePending()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(
      user,
      (request.cookies as Record<string, string>)[SESSION_COOKIE],
    );
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  // Same limit as login, since it checks a password too.
  @AllowWhenPasswordChangePending()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Body({ schema: changePasswordSchema }) body: z.infer<typeof changePasswordSchema>,
  ) {
    const token = (request.cookies as Record<string, string>)[SESSION_COOKIE];
    const ok = await this.auth.changePassword(user, token, body.currentPassword, body.newPassword);
    if (!ok) throw new BadRequestException('Your current password is wrong.');
  }

  // Only the caller's own lines, so a person can spot someone else using their account.
  @Get('my-activity')
  @Header('Cache-Control', 'no-store')
  myActivity(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.myActivity(user);
  }

  @AllowWhenPasswordChangePending()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
