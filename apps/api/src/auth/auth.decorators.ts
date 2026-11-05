import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { UserRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from './auth.types.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Opens a route to anyone. Every route without this requires a login. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Limits a route to these roles. A route without this allows any logged-in staff. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Gives a route handler the logged-in user, the way req.user does in Express. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
