import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/client.js';

/** Who is making this request. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  /** True after an admin set a temporary password: nothing else works until it is changed. */
  mustChangePassword: boolean;
};

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

export const SESSION_COOKIE = 'dental_session';
