import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { authenticator } from 'otplib';
import type { DbClient } from '@projectmgmt/drizzle';
import { users } from '@projectmgmt/drizzle';
import { writeAuditLog } from './audit.js';

/**
 * TOTP setup follows the standard RFC 6238 flow:
 *   1. setup() generates a secret, stores it pending verification, returns an
 *      otpauth URI the client renders as QR code.
 *   2. verifyAndEnable() accepts a 6-digit code; if it checks out we flip
 *      totpEnabled = true so login begins requiring the second factor.
 *   3. disable() requires a valid code (or password re-auth for recovery) to
 *      clear the secret.
 *
 * The secret is stored in users.totp_secret as the base32 string — in a
 * production deployment you'd encrypt at rest with a KMS-wrapped key; that's
 * deferred until we have an encryption service.
 */

authenticator.options = {
  // Allow ±1 step (30s either side) for clock drift.
  window: 1,
};

const ISSUER = 'Project Management';

export interface TotpSetupResult {
  secret: string;
  otpauthUri: string;
}

export async function setupTotp(
  db: DbClient,
  actor: { id: string; email: string; role: string; ipAddress: string; userAgent: string }
): Promise<TotpSetupResult> {
  const secret = authenticator.generateSecret(32);
  const otpauthUri = authenticator.keyuri(actor.email, ISSUER, secret);

  // Store the secret immediately; totpEnabled stays false until verifyAndEnable
  // succeeds. Users can re-run setup to rotate before confirming.
  await db
    .update(users)
    .set({ totpSecret: secret, totpEnabled: false, updatedAt: new Date() })
    .where(eq(users.id, actor.id));

  await writeAuditLog(db, actor, {
    action: 'totp.setup',
    entityType: 'user',
    entityId: actor.id,
  });

  return { secret, otpauthUri };
}

export async function verifyAndEnableTotp(
  db: DbClient,
  actor: { id: string; role: string; ipAddress: string; userAgent: string },
  code: string
): Promise<{ ok: true }> {
  const [row] = await db
    .select({
      totpSecret: users.totpSecret,
      totpEnabled: users.totpEnabled,
    })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  if (!row?.totpSecret) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Run setup first — no TOTP secret is pending.',
    });
  }
  if (!authenticator.check(code, row.totpSecret)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid code.' });
  }
  const now = new Date();
  await db
    .update(users)
    .set({ totpEnabled: true, totpVerifiedAt: now, updatedAt: now })
    .where(eq(users.id, actor.id));

  await writeAuditLog(db, actor, {
    action: 'totp.verify',
    entityType: 'user',
    entityId: actor.id,
    newValue: { enabled: true },
  });

  return { ok: true };
}

export async function disableTotp(
  db: DbClient,
  actor: { id: string; role: string; ipAddress: string; userAgent: string },
  code: string
): Promise<{ ok: true }> {
  const [row] = await db
    .select({ totpSecret: users.totpSecret, totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  if (!row?.totpEnabled || !row?.totpSecret) {
    return { ok: true }; // already disabled
  }
  if (!authenticator.check(code, row.totpSecret)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid code.' });
  }
  await db
    .update(users)
    .set({
      totpEnabled: false,
      totpSecret: null,
      totpVerifiedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, actor.id));

  await writeAuditLog(db, actor, {
    action: 'totp.verify', // reuse action name for on/off events
    entityType: 'user',
    entityId: actor.id,
    newValue: { enabled: false },
  });

  return { ok: true };
}

/** Used by auth.login when the user has 2FA enabled. */
export function verifyLoginTotp(secret: string, code: string): boolean {
  return authenticator.check(code, secret);
}
