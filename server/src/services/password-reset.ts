import { TRPCError } from '@trpc/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { randomBytes, createHash } from 'node:crypto';
import type { DbClient } from '@projectmgmt/drizzle';
import { passwordResetTokens, users } from '@projectmgmt/drizzle';
import { hashPassword } from '../auth/password.js';
import { writeAuditLog } from './audit.js';
import { mailerIsLive, passwordResetMail, sendMail } from './mailer.js';

const TOKEN_TTL_MS = 60 * 60_000; // 1 hour
/**
 * Welcome-link tokens — minted at admin-created user creation — get a much
 * longer TTL than a regular self-service reset because the new user might
 * not check their email for a couple of days.
 */
export const WELCOME_TOKEN_TTL_MS = 7 * 24 * 60 * 60_000; // 7 days
const MAX_ATTEMPTS = 5;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate a fresh password-reset token row + return the raw token so the
 * caller can hand it to a mailer. Extracted from `requestPasswordReset` so
 * `auth.register` can also call it (admin-created accounts get a welcome
 * email with a reset link instead of a plaintext password).
 */
export async function mintPasswordResetToken(
  db: DbClient,
  userId: string,
  email: string,
  ttlMs: number = TOKEN_TTL_MS
): Promise<{ raw: string; expiresAt: Date }> {
  const raw = randomBytes(32).toString('hex');
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(passwordResetTokens).values({
    userId,
    email,
    tokenHash,
    expiresAt,
  });
  return { raw, expiresAt };
}

export interface ResetRequestResult {
  /** Only returned in dev (NODE_ENV !== 'production') so the caller can test locally. */
  devToken?: string;
}

/**
 * Kick off a password reset. Always returns success — we never leak which
 * emails exist. If the email is known, we store a short-lived hashed token
 * and (in production) send a reset link by email. In dev we surface the raw
 * token so the test flow works without a mailer.
 */
export async function requestPasswordReset(
  db: DbClient,
  input: {
    email: string;
    ipAddress: string;
    userAgent: string;
  }
): Promise<ResetRequestResult> {
  const email = input.email.trim().toLowerCase();
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    // Act like we sent a mail to avoid enumeration. Small constant delay.
    await new Promise((r) => setTimeout(r, 200));
    return {};
  }

  const { raw } = await mintPasswordResetToken(db, user.id, email);

  await writeAuditLog(
    db,
    {
      id: user.id,
      role: user.role,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
    {
      action: 'password.reset.request',
      entityType: 'user',
      entityId: user.id,
      newValue: { email },
    }
  );

  // Fire the mailer — real in prod (SENDGRID_API_KEY set), logs in dev.
  await sendMail(passwordResetMail(email, raw));

  // Only surface the dev token when no real mailer is wired — saves the local
  // test flow without exposing the token in prod responses.
  if (!mailerIsLive()) {
    return { devToken: raw };
  }
  return {};
}

/**
 * Redeem a reset token and set a new password. Bumps attempt count on miss
 * and locks the row after MAX_ATTEMPTS to stop guessing.
 */
export async function completePasswordReset(
  db: DbClient,
  input: {
    token: string;
    newPassword: string;
    ipAddress: string;
    userAgent: string;
  }
): Promise<{ ok: true }> {
  if (input.newPassword.length < 8) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Password must be at least 8 characters.',
    });
  }
  const tokenHash = hashToken(input.token);
  const now = new Date();

  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        gt(passwordResetTokens.expiresAt, now),
        isNull(passwordResetTokens.usedAt)
      )
    )
    .limit(1);

  if (!row || row.attempts >= MAX_ATTEMPTS) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'That reset link is invalid or has expired.',
    });
  }

  const newHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: newHash, isActive: true, updatedAt: now })
      .where(eq(users.id, row.userId));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, row.id));
  });

  await writeAuditLog(
    db,
    {
      id: row.userId,
      role: 'user',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    },
    {
      action: 'password.reset.complete',
      entityType: 'user',
      entityId: row.userId,
    }
  );

  return { ok: true };
}
