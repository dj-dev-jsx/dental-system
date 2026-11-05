import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import { type AuthenticatedRequest, SESSION_COOKIE } from './auth.types.js';

// A guard is like auth middleware in Express, with one big difference: this one is
// registered globally, so a new route is locked even if you forget to protect it.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = (request.cookies as Record<string, unknown>)[SESSION_COOKIE];
    const user =
      typeof token === 'string' ? await this.auth.findSessionUser(token) : null;
    if (!user) throw new UnauthorizedException();

    (request as AuthenticatedRequest).user = user;
    return true;
  }
}
