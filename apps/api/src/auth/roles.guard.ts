import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '../generated/prisma/client.js';
import { ROLES_KEY } from './auth.decorators.js';
import type { AuthenticatedRequest } from './auth.types.js';

// Runs after SessionGuard, so request.user is already set on protected routes.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return roles.includes(user.role); // false makes Nest answer 403 Forbidden
  }
}
