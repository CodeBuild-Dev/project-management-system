import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { createDb, users, type DbClient } from '@projectmgmt/drizzle';
import type { PermissionOverrides, UserRole } from '@projectmgmt/shared';
import { EMPTY_PERMISSION_OVERRIDES } from '@projectmgmt/shared';
import { verifyAccessToken } from '../auth/jwt.js';
import { readAuthCookie } from '../auth/cookie.js';
import { sanitizeOverrides } from '../services/user-permissions.js';

/**
 * Lazily-initialized DB client — the server process boots cleanly even if
 * DATABASE_URL isn't set (useful for local frontend-only dev).
 */
let lazyDb: DbClient | null = null;
function getDb(): DbClient | null {
  if (lazyDb) return lazyDb;
  if (!process.env.DATABASE_URL) return null;
  lazyDb = createDb().db;
  return lazyDb;
}

export interface ContextUser {
  id: string;
  email: string;
  role: UserRole;
  permissionOverrides: PermissionOverrides;
  /** Resolved per-request so workspace-scoped queries have a fallback. */
  primaryWorkspaceId: string | null;
}

export interface TrpcContext {
  db: DbClient | null;
  /** Token-authenticated user identity. Null for anonymous requests. */
  user: ContextUser | null;
  /** Request metadata used for audit logging. */
  ipAddress: string;
  userAgent: string;
  /** Express response — exposed so auth procedures can set/clear the auth cookie. */
  res: Response;
}

export async function createContext({
  req,
  res,
}: {
  req: Request;
  res: Response;
}): Promise<TrpcContext> {
  // Auth comes from the HttpOnly cookie. Authorization header is still
  // accepted as a fallback so server-to-server callers (curl, integration
  // tests) keep working.
  const cookieToken = readAuthCookie(req.headers.cookie);
  const bearer = req.header('authorization');
  const headerToken = bearer?.toLowerCase().startsWith('bearer ')
    ? bearer.slice(7).trim()
    : null;
  const token = cookieToken ?? headerToken;
  const payload = token ? verifyAccessToken(token) : null;
  const db = getDb();

  let user: ContextUser | null = null;
  if (payload && db) {
    const [row] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        permissionOverrides: users.permissionOverrides,
        primaryWorkspaceId: users.primaryWorkspaceId,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);
    if (row && row.isActive) {
      user = {
        id: row.id,
        email: row.email,
        role: row.role,
        permissionOverrides: sanitizeOverrides(row.permissionOverrides),
        primaryWorkspaceId: row.primaryWorkspaceId,
      };
    }
  } else if (payload && !db) {
    // DB not configured yet — trust the JWT so /api/health etc still work.
    user = {
      id: payload.userId,
      email: payload.email,
      role: payload.role,
      permissionOverrides: EMPTY_PERMISSION_OVERRIDES,
      primaryWorkspaceId: null,
    };
  }

  return {
    db,
    user,
    ipAddress:
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
    res,
  };
}
