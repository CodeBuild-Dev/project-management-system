import type { PublicUser } from './user.js';

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  /** ISO timestamp — clients use this to short-circuit expired tokens. */
  expiresAt: string;
}
