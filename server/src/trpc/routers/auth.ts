import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users, auditLogs } from '@projectmgmt/drizzle';
import { router, protectedProcedure, dbProcedure } from '../trpc.js';
import { comparePassword } from '../../auth/password.js';
import { signAccessToken } from '../../auth/jwt.js';
import { setAuthCookie, clearAuthCookie } from '../../auth/cookie.js';
import { toPublicUser, getUser } from '../../services/user.js';

// JWT TTL is 7d (see auth/jwt.ts) — cookie Max-Age mirrors that.
const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^\S+@\S+\.\S+$/, 'Invalid email');


const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password required'),
});

// Hand-rolled palette pick (avoids importing a client-side util into server).

export const authRouter = router({

  /** Verify credentials and return a signed JWT session. */
  login: dbProcedure.input(loginInput).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (!row) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password.',
      });
    }
    if (!row.isActive) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'This account has been suspended. Contact support.',
      });
    }

    const ok = await comparePassword(input.password, row.passwordHash);
    if (!ok) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password.',
      });
    }

    await ctx.db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, row.id));

    const { token, expiresAt } = signAccessToken({
      userId: row.id,
      email: row.email,
      role: row.role,
    });

    setAuthCookie(ctx.res, token, {
      maxAgeSeconds: AUTH_COOKIE_MAX_AGE_SECONDS,
    });

    await ctx.db.insert(auditLogs).values({
      userId: row.id,
      userRole: row.role,
      action: 'user.login',
      entityType: 'user',
      entityId: row.id,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return {
      user: toPublicUser({ ...row, lastLoginAt: new Date() }),
      expiresAt: expiresAt.toISOString(),
    };
  }),

  /**
   * Returns the currently-authenticated user's profile. Uses the
   * allowlisted PUBLIC_USER_COLUMNS projection in services/user.ts so
   * sensitive fields (passwordHash, totpSecret, backupCodesHash) never
   * leave Postgres.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.db) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Database not configured.',
      });
    }
    return getUser(ctx.db, ctx.user.id);
  }),

  /**
   * Logout. Server clears the HttpOnly auth cookie (Max-Age=0) and
   * records the audit row. The JWT itself stays valid until its TTL
   * expires; revocation across other devices would need a denylist.
   */
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    clearAuthCookie(ctx.res);
    if (ctx.db) {
      await ctx.db.insert(auditLogs).values({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'user.logout',
        entityType: 'user',
        entityId: ctx.user.id,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }
    return { ok: true as const };
  }),
});
