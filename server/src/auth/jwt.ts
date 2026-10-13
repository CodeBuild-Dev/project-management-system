import jwt from 'jsonwebtoken';
import type { UserRole } from '@projectmgmt/shared';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

const DEFAULT_TTL = '7d';

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'JWT_SECRET must be set to a random string of at least 16 characters.'
    );
  }
  return s;
}

export function signAccessToken(
  payload: JwtPayload,
  expiresIn: string | number = DEFAULT_TTL
): { token: string; expiresAt: Date } {
  const token = jwt.sign(payload, secret(), { expiresIn } as jwt.SignOptions);
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expiresAt = new Date((decoded?.exp ?? Math.floor(Date.now() / 1000) + 604800) * 1000);
  return { token, expiresAt };
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret()) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}
