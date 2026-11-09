import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { UserRole } from '../generated/prisma/client.js';
import type { AuthenticatedRequest } from './auth.types.js';
import type { PatientRequest } from '../portal/portal.types.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = 'allowPasswordChangePending';

/**
 * Marks a route that still works while the user must change their password
 * (me, logout and change-password). Every other route answers 403 until they do.
 */
export const AllowWhenPasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);

/** Opens a route to anyone. Every route without this requires a login. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Limits a route to these roles. A route without this allows any logged-in staff. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Gives a route handler the logged-in user, the way req.user does in Express. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

export const IS_PATIENT_ROUTE_KEY = 'isPatientRoute';

/**
 * Marks an online booking route for a signed-in patient. It accepts only the patient cookie;
 * no staff route accepts that cookie, and this route never
 * accepts a staff one.
 */
export const PatientRoute = () => SetMetadata(IS_PATIENT_ROUTE_KEY, true);

/** Gives a @PatientRoute handler the signed-in patient's account. */
export const CurrentPatient = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<PatientRequest>().patient,
);
