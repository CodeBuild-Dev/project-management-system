import type { Response } from 'express';

/**
 * Single source of truth for the auth cookie name + flags.
 *
 *   - HttpOnly: JS can't read it → no XSS exfiltration of the JWT.
 *   - Secure: only sent over HTTPS in production.
 *   - SameSite=Strict: never sent on cross-site requests, blocking CSRF
 *     even though Bearer-style was already CSRF-safe — strict still helps
 *     against same-domain subdomain attacks and unintentional embeds.
 *   - Path=/: applies to /api/trpc and /api/realtime.
 *
 * Same-site dev (Vite proxy → Express) and prod (Express serves SPA on the
 * same origin) means SameSite=Strict works without extra config.
 */
export const AUTH_COOKIE_NAME = 'projectmgmt_auth';

const isProd = process.env.NODE_ENV === 'production';

export interface SetCookieOptions {
  /** Token TTL in seconds. Cookie's Max-Age mirrors the JWT exp. */
  maxAgeSeconds: number;
}

/**
 * Set the HttpOnly auth cookie on the response. Call from login / register
 * after `signAccessToken` succeeds.
 */
export function setAuthCookie(
  res: Response,
  token: string,
  opts: SetCookieOptions
): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
    maxAge: opts.maxAgeSeconds * 1000,
  });
}

/**
 * Clear the auth cookie. Sets Max-Age=0 so the browser drops it
 * immediately. Cookie attributes (path, sameSite, secure) must match the
 * setter for `clearCookie` to actually remove the original.
 */
export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path: '/',
  });
}

/**
 * Parse the `Cookie` request header and return the auth-token value, or
 * null if not present. We avoid `cookie-parser` so the server keeps a
 * minimal dependency footprint — the cookie format is trivial to parse.
 */
export function readAuthCookie(header: string | undefined): string | null {
  if (!header) return null;
  // Cookie header format: "name=value; name2=value2". Values may be wrapped
  // in quotes; we strip them. Whitespace around `;` is tolerated per RFC.
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name !== AUTH_COOKIE_NAME) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    return decodeURIComponent(value);
  }
  return null;
}
