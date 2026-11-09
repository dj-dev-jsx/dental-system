import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PortalAuthService } from '../portal/portal-auth.service.js';
import { PATIENT_SESSION_COOKIE, type PatientRequest } from '../portal/portal.types.js';
import {
  ALLOW_PASSWORD_CHANGE_PENDING_KEY,
  IS_PATIENT_ROUTE_KEY,
  IS_PUBLIC_KEY,
} from './auth.decorators.js';
import { AuthService } from './auth.service.js';
import { type AuthenticatedRequest, SESSION_COOKIE } from './auth.types.js';

// A guard is like auth middleware in Express, with one big difference: this one is
// registered globally, so a new route is locked even if you forget to protect it.
//
// There are two kinds of login, and each route accepts exactly one of them. A @PatientRoute
// reads only the patient cookie; every other route reads only the staff cookie. A patient's
// cookie is never even looked at on a staff route, so it can't open one, and the other way round.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly portalAuth: PortalAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flag = (key: string) =>
      this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]);
    if (flag(IS_PUBLIC_KEY)) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const cookies = request.cookies as Record<string, unknown>;

    if (flag(IS_PATIENT_ROUTE_KEY)) {
      const patient = await this.portalAuth.authenticate(cookies[PATIENT_SESSION_COOKIE]);
      if (!patient) throw new UnauthorizedException();
      (request as PatientRequest).patient = patient;
      return true;
    }

    const token = cookies[SESSION_COOKIE];
    const user =
      typeof token === 'string' ? await this.auth.findSessionUser(token) : null;
    if (!user) throw new UnauthorizedException();

    // A user holding a temporary password may only change it (or look at /me, or log out).
    if (user.mustChangePassword && !flag(ALLOW_PASSWORD_CHANGE_PENDING_KEY)) {
      throw new ForbiddenException('PASSWORD_CHANGE_REQUIRED');
    }

    (request as AuthenticatedRequest).user = user;
    return true;
  }
}
