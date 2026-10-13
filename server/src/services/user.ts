import { TRPCError } from '@trpc/server';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { users, type UserRow } from '@projectmgmt/drizzle';
import type { PublicUser, UpdateUserInput } from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import { redactUserFields } from './sanitize.js';
import { requirePermission, type PermissionActor } from './permissions.js';
import { sanitizeOverrides } from './user-permissions.js';

/**
 * Column projection that maps 1:1 to PublicUser. Everything sensitive
 * (password_hash / totp_secret / backup_codes_hash) is excluded at the
 * SQL layer — sensitive fields never leave Postgres unless a query
 * explicitly asks for them (auth.login, totp setup, password reset).
 */
const PUBLIC_USER_COLUMNS = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  avatarUrl: users.avatarUrl,
  initials: users.initials,
  color: users.color,
  role: users.role,
  permissionOverrides: users.permissionOverrides,
  primaryWorkspaceId: users.primaryWorkspaceId,
  isActive: users.isActive,
  lastLoginAt: users.lastLoginAt,
  totpEnabled: users.totpEnabled,
  totpVerifiedAt: users.totpVerifiedAt,
  notificationPreferences: users.notificationPreferences,
  jobTitle: users.jobTitle,
  workMode: users.workMode,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

/**
 * Build a PublicUser by EXPLICITLY picking each safe column from the row.
 * This is an allowlist (not a `delete passwordHash` blocklist) so adding a
 * new sensitive column to the schema can never silently leak through —
 * the new field just won't be included until someone updates this list.
 */
function rowToPublicUser(row: Partial<UserRow>): PublicUser {
  return {
    id: row.id!,
    email: row.email!,
    firstName: row.firstName!,
    lastName: row.lastName!,
    avatarUrl: row.avatarUrl ?? null,
    initials: row.initials!,
    color: row.color!,
    role: row.role!,
    permissionOverrides: sanitizeOverrides(row.permissionOverrides),
    primaryWorkspaceId: row.primaryWorkspaceId ?? null,
    isActive: row.isActive!,
    lastLoginAt: row.lastLoginAt ?? null,
    totpEnabled: row.totpEnabled!,
    totpVerifiedAt: row.totpVerifiedAt ?? null,
    notificationPreferences:
      (row.notificationPreferences as PublicUser['notificationPreferences']) ?? null,
    jobTitle: row.jobTitle ?? null,
    workMode: row.workMode ?? null,
    createdAt: row.createdAt!,
    updatedAt: row.updatedAt!,
  };
}

/**
 * Convert a full UserRow (which may include passwordHash, totpSecret, etc.)
 * into a PublicUser. Allowlist semantics — sensitive fields are never copied
 * because we explicitly pick the ones we want.
 */
export function toPublicUser(row: UserRow): PublicUser {
  return rowToPublicUser(row);
}

export interface ListUsersOptions {
  /** Free-text match on first/last/email (ILIKE both ends). Server-side so we don't ship every row to the client. */
  search?: string;
  limit?: number;
  /** Cursor: createdAt ISO of the last row from the previous page. */
  cursor?: string;
}

export interface PaginatedUsers {
  users: PublicUser[];
  nextCursor: string | null;
}

export async function listAllUsers(
  db: DbClient,
  opts: ListUsersOptions = {}
): Promise<PaginatedUsers> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 50));
  const conditions = [] as ReturnType<typeof eq>[];
  // Hide soft-deleted (tombstoned) accounts. deleteUser() rewrites the
  // email to `deleted-{id}@deleted.local`; everything else stays so FK
  // references in audit/activity history don't dangle.
  conditions.push(sql`${users.email} NOT LIKE 'deleted-%@deleted.local'` as never);
  if (opts.search && opts.search.trim()) {
    const pattern = `%${opts.search.trim()}%`;
    conditions.push(
      or(
        ilike(users.firstName, pattern),
        ilike(users.lastName, pattern),
        ilike(users.email, pattern),
        sql`concat(${users.firstName}, ' ', ${users.lastName}) ILIKE ${pattern}`
      )!
    );
  }
  if (opts.cursor) {
    const cursorDate = new Date(opts.cursor);
    if (!isNaN(cursorDate.getTime())) {
      // descending by createdAt → next page = createdAt < cursor.
      conditions.push(sql`${users.createdAt} < ${cursorDate}` as never);
    }
  }

  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : sql`${conditions.reduce((acc, c, i) => i === 0 ? c : sql`${acc} AND ${c}`, conditions[0])}`;

  const rows = await db
    .select(PUBLIC_USER_COLUMNS)
    .from(users)
    .where(where as never)
    .orderBy(desc(users.createdAt))
    .limit(limit + 1); // fetch one extra to know if there's a next page

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? (page[page.length - 1].createdAt as Date).toISOString()
    : null;

  return {
    users: page.map(rowToPublicUser),
    nextCursor,
  };
}

export async function getUser(db: DbClient, id: string): Promise<PublicUser> {
  const [row] = await db
    .select(PUBLIC_USER_COLUMNS)
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
  return rowToPublicUser(row);
}

/** Update the caller's own profile. Restricted fields require admin. */
export async function updateProfile(
  db: DbClient,
  actor: AuditActor & { id: string },
  input: UpdateUserInput
): Promise<PublicUser> {
  const [previous] = await db
    .select(PUBLIC_USER_COLUMNS)
    .from(users)
    .where(eq(users.id, actor.id))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

  const patch: Partial<UserRow> = { updatedAt: new Date() };
  if (input.firstName !== undefined) patch.firstName = input.firstName;
  if (input.lastName !== undefined) patch.lastName = input.lastName;
  if (input.color !== undefined) patch.color = input.color;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
  if (input.jobTitle !== undefined) {
    patch.jobTitle = input.jobTitle === null ? null : input.jobTitle.trim() || null;
  }
  if (input.workMode !== undefined) patch.workMode = input.workMode;
  if (input.notificationPreferences !== undefined) {
    patch.notificationPreferences = input.notificationPreferences;
  }

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, actor.id))
    .returning(PUBLIC_USER_COLUMNS);

  await writeAuditLog(db, actor, {
    action: 'user.profile.update',
    entityType: 'user',
    entityId: actor.id,
    previousValue: redactUserFields(previous as unknown as Record<string, unknown>),
    newValue: redactUserFields(updated as unknown as Record<string, unknown>),
  });

  return rowToPublicUser(updated);
}

/**
 * Admin / Super Admin / Owner: edit profile, email, color, avatar, suspend.
 * Role changes and permission overrides do NOT flow through here — they
 * have their own funnels in user-role.ts so guards (Owner singleton, etc.)
 * stay in one place.
 */
export async function adminUpdateUser(
  db: DbClient,
  actor: AuditActor & PermissionActor,
  targetId: string,
  input: UpdateUserInput
): Promise<PublicUser> {
  const [previous] = await db
    .select(PUBLIC_USER_COLUMNS)
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });

  if (input.role !== undefined) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Use changeRole / transferOwnership to change a user\'s role.',
    });
  }
  if (input.permissionOverrides !== undefined) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Use updatePermissions to change a user\'s permission overrides.',
    });
  }

  const wantsSuspendChange =
    input.isActive !== undefined && input.isActive !== previous.isActive;

  // Suspending vs editing profile fields are separate capabilities so admins
  // can be granted profile-edit without account-disable powers.
  if (wantsSuspendChange) {
    requirePermission(actor, 'user', 'suspend', { targetUserRole: previous.role });
  }
  const editingProfile =
    input.firstName !== undefined ||
    input.lastName !== undefined ||
    input.email !== undefined ||
    input.color !== undefined ||
    input.avatarUrl !== undefined;
  if (editingProfile) {
    requirePermission(actor, 'user', 'update', { targetUserRole: previous.role });
  }

  const patch: Partial<UserRow> = { updatedAt: new Date() };
  if (input.firstName !== undefined) patch.firstName = input.firstName;
  if (input.lastName !== undefined) patch.lastName = input.lastName;
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();
  if (input.color !== undefined) patch.color = input.color;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, targetId))
    .returning(PUBLIC_USER_COLUMNS);

  await writeAuditLog(db, actor, {
    action: 'user.admin.update',
    entityType: 'user',
    entityId: targetId,
    previousValue: redactUserFields(previous as unknown as Record<string, unknown>),
    newValue: redactUserFields(updated as unknown as Record<string, unknown>),
  });

  return rowToPublicUser(updated);
}
