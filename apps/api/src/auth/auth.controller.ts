import {
  Body,
  Controller,
  Get,
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
import { CurrentUser, Public } from './auth.decorators.js';
import { AuthService, SESSION_LIFETIME_MS } from './auth.service.js';
import { type AuthenticatedUser, SESSION_COOKIE } from './auth.types.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // The length cap stops someone sending a huge "password" to tie up the server.
  password: z.string().min(1).max(200),
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

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(
      (request.cookies as Record<string, string>)[SESSION_COOKIE],
    );
    response.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
