import { and, count, eq, isNull, ne } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { users, workspaces, workspaceMembers } from '@projectmgmt/drizzle';
import { hashPassword } from '../auth/password.js';

/**
 * Ensure exactly one Owner exists. Reads SUPER_ADMIN_EMAIL and
 * SUPER_ADMIN_PASSWORD from the environment and:
 *   1. If an account with that email already exists → promotes it to `owner`,
 *      activates it, and resets the password to the env value so it always
 *      matches what was configured in Railway.
 *   2. Otherwise creates a fresh Owner row.
 *
 * After the Owner is reconciled, demotes any *other* `owner` rows to
 * `super_admin` (defensive — the singleton is also enforced by the migration
 * that introduced the four-tier enum).
 *
 * Skipped silently if the env vars aren't set — useful for installs that
 * bootstrap the Owner through a different mechanism.
 */
export async function bootstrapOwner(db: DbClient): Promise<void> {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    return;
  }
  if (password.length < 8) {
    console.warn('[bootstrap] SUPER_ADMIN_PASSWORD is shorter than 8 chars; skipping.');
    return;
  }

  const firstName = process.env.SUPER_ADMIN_FIRST_NAME?.trim() || 'Admin';
  const lastName = process.env.SUPER_ADMIN_LAST_NAME?.trim() || '';
  const initials =
    `${firstName[0] ?? 'A'}${lastName[0] ?? 'D'}`.toUpperCase().slice(0, 4);

  const [existing] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const passwordHash = await hashPassword(password);
  let ownerId: string;

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: 'owner',
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    ownerId = existing.id;
    console.log(`[bootstrap] Owner ensured: ${email} (${existing.id})`);
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        firstName,
        lastName,
        initials,
        color: 'hsl(280 60% 55%)',
        role: 'owner',
        isActive: true,
      })
      .returning({ id: users.id });
    ownerId = created.id;
    console.log(`[bootstrap] Owner created: ${email}`);
  }

  // Demote any stragglers in a single UPDATE — only one Owner is allowed.
  const demoted = await db
    .update(users)
    .set({ role: 'super_admin', updatedAt: new Date() })
    .where(and(eq(users.role, 'owner'), ne(users.id, ownerId)))
    .returning({ id: users.id });
  for (const row of demoted) {
    console.warn(
      `[bootstrap] demoted stray Owner ${row.id} → super_admin (only ${email} may be Owner)`
    );
  }

  // Final safety net.
  const [{ value: ownerCount }] = await db
    .select({ value: count() })
    .from(users)
    .where(eq(users.role, 'owner'));
  if (ownerCount !== 1) {
    throw new Error(
      `[bootstrap] expected exactly one Owner, found ${ownerCount}. Refusing to start.`
    );
  }
}

/** @deprecated Use {@link bootstrapOwner}. Kept as an alias to avoid breaking existing callers. */
export const bootstrapSuperAdmin = bootstrapOwner;

/**
 * Ensure the Owner has a default workspace. Solo mode removed the "Create
 * workspace" UI; without this, a fresh Owner sees an empty-state with no
 * way to create the workspace boards need to live in.
 *
 * Idempotent: only runs when no non-archived workspaces exist at all. Once
 * the Owner has any workspace (created by this function, by a future
 * import flow, or by a re-introduced UI), this becomes a no-op.
 */
export async function bootstrapDefaultWorkspace(db: DbClient): Promise<void> {
  // Need the Owner to attribute the workspace to. If the Owner bootstrap
  // didn't run (SUPER_ADMIN_EMAIL/PASSWORD unset), there's no one to own
  // the workspace — skip and try again next boot.
  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'owner'))
    .limit(1);
  if (!owner) return;

  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(isNull(workspaces.archivedAt))
    .limit(1);
  if (existing) return;

  const name = process.env.DEFAULT_WORKSPACE_NAME?.trim() || 'My Workspace';

  const [created] = await db
    .insert(workspaces)
    .values({
      name,
      color: '#10b981',
      icon: 'case',
      ownerId: owner.id,
      createdBy: owner.id,
      position: 0,
      visibility: 'private',
    })
    .returning({ id: workspaces.id });

  await db.insert(workspaceMembers).values({
    workspaceId: created.id,
    userId: owner.id,
    invitedBy: owner.id,
    acceptedAt: new Date(),
  });

  console.log(`[bootstrap] Default workspace created: "${name}" (${created.id})`);
}
