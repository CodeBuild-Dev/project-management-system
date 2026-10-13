import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { users, auditLogs } from '@projectmgmt/drizzle';
import { router, publicProcedure, protectedProcedure, dbProcedure } from '../trpc.js';
import { hashPassword, comparePassword } from '../../auth/password.js';
import { signAccessToken } from '../../auth/jwt.js';
import { setAuthCookie, clearAuthCookie } from '../../auth/cookie.js';
import { toPublicUser, getUser } from '../../services/user.js';

// JWT TTL is 7d (see auth/jwt.ts) — cookie Max-Age mirrors that.
const AUTH_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
import {
  completePasswordReset,
  mintPasswordResetToken,
  requestPasswordReset,
  WELCOME_TOKEN_TTL_MS,
} from '../../services/password-reset.js';
import { sendMail, welcomeMail } from '../../services/mailer.js';
import { verifyLoginTotp } from '../../services/totp.js';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^\S+@\S+\.\S+$/, 'Invalid email');

const registerInput = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().trim().min(1, 'First name required'),
  lastName: z.string().trim().min(1, 'Last name required'),
});

const loginInput = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password required'),
  /** Required when the account has TOTP enabled — 6-digit authenticator code. */
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});

// Hand-rolled palette pick (avoids importing a client-side util into server).
const AVATAR_COLORS = [
  'hsl(340 82% 58%)',
  'hsl(154 68% 45%)',
  'hsl(28 100% 58%)',
  'hsl(0 72% 55%)',
  'hsl(210 100% 56%)',
  'hsl(280 60% 55%)',
];
function pickColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export const authRouter = router({
  /**
   * Create a new user account. Locked to Owner / Super Admin / Admin — the
   * only way to onboard users is through the Admin panel. The Owner is
   * bootstrapped on server boot via SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
   * env vars, not through this endpoint.
   */
  register: dbProcedure.input(registerInput).mutation(async ({ ctx, input }) => {
    const callerRole = ctx.user?.role;
    const allowed =
      callerRole === 'owner' ||
      callerRole === 'super_admin' ||
      callerRole === 'admin';
    if (!ctx.user || !allowed) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message:
          'Only admins can create new accounts. Ask your workspace admin to invite you.',
      });
    }

    const existing = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing.length > 0) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'An account with that email already exists.',
      });
    }

    const passwordHash = await hashPassword(input.password);
    const initials = `${input.firstName[0] ?? ''}${input.lastName[0] ?? ''}`.toUpperCase();

    const [inserted] = await ctx.db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        initials: initials || '??',
        color: pickColor(input.email),
        role: 'staff',
      })
      .returning();

    // register is admin-only — the caller is creating an account FOR
    // someone else. We must NOT set an auth cookie on the response (that
    // would log the admin out and log them in as the new user) and we
    // must NOT sign a JWT for the new user. Instead, mint a 7-day
    // password-reset token and send a welcome email; the new user picks
    // their own password on first sign-in.
    const { raw: welcomeToken } = await mintPasswordResetToken(
      ctx.db,
      inserted.id,
      inserted.email,
      WELCOME_TOKEN_TTL_MS
    );
    void sendMail(welcomeMail(inserted.email, ctx.user.email, welcomeToken));

    // Audit the account creation. The acting user is the admin (ctx.user),
    // not the newly-created account.
    await ctx.db.insert(auditLogs).values({
      userId: ctx.user.id,
      userRole: ctx.user.role,
      action: 'user.register',
      entityType: 'user',
      entityId: inserted.id,
      newValue: { email: inserted.email, role: inserted.role },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    return {
      user: toPublicUser(inserted),
    };
  }),

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

    // 2FA gate: if enabled, require a valid TOTP code in the same request.
    if (row.totpEnabled && row.totpSecret) {
      if (!input.totpCode) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'TOTP_REQUIRED',
        });
      }
      if (!verifyLoginTotp(row.totpSecret, input.totpCode)) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid authenticator code.',
        });
      }
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
   * Start a password reset. Always returns ok — we never leak which emails
   * exist in the database.
   */
  requestPasswordReset: dbProcedure
    .input(z.object({ email: emailSchema }))
    .mutation(async ({ ctx, input }) => {
      return requestPasswordReset(ctx.db, {
        email: input.email,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    }),

  /**
   * Change the signed-in user's password. Requires the current password as
   * proof of possession; rejects if the new password matches the old one.
   */
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, 'New password must be at least 8 characters'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.db || !ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }
      const [row] = await ctx.db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

      const ok = await comparePassword(input.currentPassword, row.passwordHash);
      if (!ok) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect.' });
      }
      if (await comparePassword(input.newPassword, row.passwordHash)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'New password must be different from your current password.',
        });
      }

      const newHash = await hashPassword(input.newPassword);
      await ctx.db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));

      await ctx.db.insert(auditLogs).values({
        userId: ctx.user.id,
        userRole: ctx.user.role,
        action: 'user.password.change',
        entityType: 'user',
        entityId: ctx.user.id,
        ipAddress: ctx.ipAddress ?? '',
        userAgent: ctx.userAgent ?? '',
      });

      return { ok: true };
    }),

  /** Redeem a reset token and set a new password. */
  completePasswordReset: dbProcedure
    .input(
      z.object({
        token: z.string().min(16).max(128),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return completePasswordReset(ctx.db, {
        token: input.token,
        newPassword: input.newPassword,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
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
