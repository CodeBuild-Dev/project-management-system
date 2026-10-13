import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { users } from '@projectmgmt/drizzle';
import type { PermissionOverrides, UserRole } from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import { sanitizeOverrides } from './user-permissions.js';
import {
  hasPermission,
  isOwnerProtected,
  type PermissionActor,
} from './permissions.js';

/**
 * Single funnel for mutations to a user's role + permission overrides.
 * All Owner-protection and "no last Owner" guards live here so the rules
 * don't drift across call sites.
 */

type MutatorActor = AuditActor & PermissionActor;

async function loadTarget(db: DbClient, targetId: string) {
  const [row] = await db
    .select({ id: users.id, role: users.role, email: users.email })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
  return row;
}

/**
 * Promote / demote a user. Will not promote anyone *to* `owner` — that
 * requires the dedicated transferOwnership flow so the previous Owner is
 * atomically demoted and never leaves the count above one.
 */
export async function changeUserRole(
  db: DbClient,
  actor: MutatorActor,
  targetId: string,
  newRole: UserRole
): Promise<void> {
  if (newRole === 'owner') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Use transferOwnership to make someone the Owner.',
    });
  }
  const target = await loadTarget(db, targetId);
  if (target.role === newRole) return; // no-op

  // Caller needs the changeRole capability.
  if (!hasPermission(actor, 'user', 'changeRole', { targetUserRole: target.role })) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You cannot change this user\'s role.',
    });
  }

  // Owner can never be demoted via this path — only via transferOwnership.
  if (target.role === 'owner') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Owner cannot be demoted directly. Transfer ownership first.',
    });
  }

  // Only the Owner can change a Super Admin's role.
  if (target.role === 'super_admin' && actor.userRole !== 'owner') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the Owner can change a Super Admin\'s role.',
    });
  }

  // Only the Owner can promote someone to Super Admin.
  if (newRole === 'super_admin' && actor.userRole !== 'owner') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the Owner can promote a user to Super Admin.',
    });
  }

  await db
    .update(users)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(users.id, targetId));

  await writeAuditLog(db, actor, {
    action: 'user.role.change',
    entityType: 'user',
    entityId: targetId,
    previousValue: { role: target.role },
    newValue: { role: newRole },
  });
}

/**
 * Atomic ownership transfer: demotes the current Owner (the actor) to
 * super_admin and promotes `newOwnerId` to owner in the same transaction.
 */
export async function transferOwnership(
  db: DbClient,
  actor: MutatorActor,
  newOwnerId: string
): Promise<void> {
  if (actor.userRole !== 'owner') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the Owner can transfer ownership.',
    });
  }
  if (newOwnerId === actor.userId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'You are already the Owner.',
    });
  }
  const target = await loadTarget(db, newOwnerId);
  if (target.role === 'owner') {
    // Should be unreachable while the singleton invariant holds.
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Target user is already the Owner.',
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ role: 'super_admin', updatedAt: new Date() })
      .where(eq(users.id, actor.userId));
    await tx
      .update(users)
      .set({ role: 'owner', updatedAt: new Date() })
      .where(eq(users.id, newOwnerId));
  });

  await writeAuditLog(db, actor, {
    action: 'user.role.transfer',
    entityType: 'user',
    entityId: newOwnerId,
    previousValue: {
      previousOwnerId: actor.userId,
      previousOwnerNewRole: 'super_admin',
      newOwnerPreviousRole: target.role,
    },
    newValue: {
      newOwnerId,
      newOwnerRole: 'owner',
    },
  });
}

/**
 * Replace a user's permission overrides. Owner is locked — overriding the
 * Owner's permissions would meaningfully limit them, which is exactly what
 * the singleton/protection rules forbid.
 */
export async function updatePermissionOverrides(
  db: DbClient,
  actor: MutatorActor,
  targetId: string,
  next: PermissionOverrides
): Promise<PermissionOverrides> {
  const target = await loadTarget(db, targetId);

  if (target.role === 'owner') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Owner permissions cannot be overridden.',
    });
  }
  if (target.role === 'super_admin' && actor.userRole !== 'owner') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the Owner can adjust a Super Admin\'s permissions.',
    });
  }
  if (!hasPermission(actor, 'user', 'update', { targetUserRole: target.role })) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You cannot edit this user.',
    });
  }

  const sanitized = sanitizeOverrides(next);

  const [previousRow] = await db
    .select({ permissionOverrides: users.permissionOverrides })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);

  await db
    .update(users)
    .set({ permissionOverrides: sanitized, updatedAt: new Date() })
    .where(eq(users.id, targetId));

  await writeAuditLog(db, actor, {
    action: 'user.permissions.update',
    entityType: 'user',
    entityId: targetId,
    previousValue: { permissionOverrides: previousRow?.permissionOverrides ?? null },
    newValue: { permissionOverrides: sanitized },
  });

  return sanitized;
}

/**
 * Soft-delete a user. Owner is undeletable.
 *
 * A hard DELETE fails because the schema has ON DELETE RESTRICT on every
 * FK that points at users (boards.created_by, audit_logs.user_id,
 * task_updates.author_id, workspaces.owner_id, etc.) — losing those
 * references would corrupt history. Instead we tombstone the row:
 *
 *   - mark is_active = false (so login + listings skip it)
 *   - rewrite email to `deleted-{id}@deleted.local` so the unique index
 *     doesn't block a future user from re-registering with the same
 *     address, and so listings can pattern-match it out
 *   - clear password_hash / totp_secret / backup_codes_hash so the
 *     account becomes unusable even if the row is somehow accessed
 *   - drop permission overrides so a future restore doesn't surprise
 *     anyone with leftover grants
 *   - rename to "Deleted user" for any view that still references the row
 *     by FK (audit log, ownership transfer history)
 */
export async function deleteUser(
  db: DbClient,
  actor: MutatorActor,
  targetId: string
): Promise<void> {
  const target = await loadTarget(db, targetId);

  if (target.role === 'owner') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'The Owner account cannot be deleted. Transfer ownership first.',
    });
  }
  if (!hasPermission(actor, 'user', 'delete', { targetUserRole: target.role })) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You cannot delete this user.',
    });
  }
  if (target.role === 'super_admin' && actor.userRole !== 'owner') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the Owner can delete a Super Admin.',
    });
  }

  const tombstoneEmail = `deleted-${targetId}@deleted.local`;
  await db
    .update(users)
    .set({
      isActive: false,
      email: tombstoneEmail,
      passwordHash: '',
      totpSecret: null,
      totpEnabled: false,
      backupCodesHash: null,
      firstName: 'Deleted',
      lastName: 'user',
      avatarUrl: null,
      jobTitle: null,
      workMode: null,
      permissionOverrides: { grants: [], denies: [] },
      updatedAt: new Date(),
    })
    .where(eq(users.id, targetId));

  await writeAuditLog(db, actor, {
    action: 'user.delete',
    entityType: 'user',
    entityId: targetId,
    previousValue: { email: target.email, role: target.role },
    newValue: { email: tombstoneEmail, isActive: false },
  });
}

/** Re-export so callers can centralise their owner-protection checks. */
export { isOwnerProtected };
