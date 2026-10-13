import { TRPCError } from '@trpc/server';
import type { PermissionOverrides, UserRole } from '@projectmgmt/shared';
import {
  OWNER_PROTECTED_USER_ACTIONS,
  PERMISSIONS,
  type Resource,
} from './permissions-registry.js';

/**
 * Role-default capability matrix. Owner and Super Admin bypass this matrix
 * (see hasPermission below) — they're listed for documentation only.
 *
 * Admin and Staff defaults serve as the starting point for a user's effective
 * permissions; per-user `permission_overrides.grants` and `denies` mutate
 * those defaults.
 *
 * Workspace-membership scoping is enforced by resolveWorkspace() at the
 * service boundary. This matrix only answers "is the user allowed to do
 * <resource:action> at all", not "in which workspaces".
 */
const ROLE_DEFAULTS: Record<UserRole, Partial<Record<Resource, readonly string[]>>> =
  {
    // owner bypasses, but listed for documentation + UI grid rendering.
    owner: {
      user: [...PERMISSIONS.user],
      workspace: [...PERMISSIONS.workspace],
      board: [...PERMISSIONS.board],
      group: [...PERMISSIONS.group],
      task: [...PERMISSIONS.task],
      task_update: [...PERMISSIONS.task_update],
      member: [...PERMISSIONS.member],
      audit: [...PERMISSIONS.audit],
      settings: [...PERMISSIONS.settings],
      client: [...PERMISSIONS.client],
      time_entry: [...PERMISSIONS.time_entry],
      expense: [...PERMISSIONS.expense],
      budget: [...PERMISSIONS.budget],
      report: [...PERMISSIONS.report],
    },
    // super_admin bypasses except for Owner-protected actions.
    super_admin: {
      user: [...PERMISSIONS.user],
      workspace: [...PERMISSIONS.workspace],
      board: [...PERMISSIONS.board],
      group: [...PERMISSIONS.group],
      task: [...PERMISSIONS.task],
      task_update: [...PERMISSIONS.task_update],
      member: [...PERMISSIONS.member],
      audit: [...PERMISSIONS.audit],
      settings: [...PERMISSIONS.settings],
      client: [...PERMISSIONS.client],
      time_entry: [...PERMISSIONS.time_entry],
      expense: [...PERMISSIONS.expense],
      budget: [...PERMISSIONS.budget],
      report: [...PERMISSIONS.report],
    },
    admin: {
      user: ['read'],
      workspace: ['create', 'read', 'update', 'delete', 'listAll'],
      board: ['create', 'read', 'update', 'delete'],
      group: ['create', 'read', 'update', 'delete'],
      task: ['create', 'read', 'update', 'delete'],
      task_update: ['create', 'read', 'update', 'delete'],
      member: ['read', 'invite', 'remove'],
      audit: ['read'],
      client: ['create', 'read', 'update', 'delete'],
      time_entry: ['create', 'read', 'update', 'delete'],
      expense: ['create', 'read', 'update', 'delete'],
      budget: ['read', 'update'],
      report: ['read'],
    },
    staff: {
      workspace: ['create', 'read'],
      board: ['create', 'read', 'update'],
      group: ['create', 'read', 'update'],
      task: ['create', 'read', 'update'],
      task_update: ['create', 'read', 'update'],
      member: ['read'],
      client: ['read'],
      // Staff log their own time + see budget, but can't change billing settings.
      time_entry: ['create', 'read', 'update'],
      expense: ['read'],
      budget: ['read'],
    },
  };

export interface PermissionActor {
  userId: string;
  userRole: UserRole;
  overrides: PermissionOverrides;
}

export interface PermissionOptions {
  /**
   * Role of the user being acted on. Used to apply Owner-protection: nobody
   * except the Owner themselves can mutate the Owner's account, regardless
   * of role or overrides.
   */
  targetUserRole?: UserRole;
  /**
   * The actor's own user id. Required when checking actions where "self"
   * should be allowed (e.g. Owner editing their own profile).
   */
  selfTargetsOk?: boolean;
}

/**
 * Returns true if the given `(resource:action)` is reserved for the Owner
 * — i.e. a Super Admin (or anyone else) cannot perform it on the Owner's
 * account even though they would otherwise have the bypass.
 */
export function isOwnerProtected(resource: Resource, action: string): boolean {
  return resource === 'user' && OWNER_PROTECTED_USER_ACTIONS.has(action);
}

export function hasPermission(
  actor: PermissionActor,
  resource: Resource,
  action: string,
  opts: PermissionOptions = {}
): boolean {
  const ownerTargeted = opts.targetUserRole === 'owner';
  const protectedHere = ownerTargeted && isOwnerProtected(resource, action);

  // The Owner themselves can do anything, including mutate their own record.
  if (actor.userRole === 'owner') return true;

  // Super Admin bypasses, except for Owner-protected actions.
  if (actor.userRole === 'super_admin') {
    return !protectedHere;
  }

  // Admins and Staff cannot touch the Owner regardless of their grid.
  if (protectedHere) return false;

  const key = `${resource}:${action}`;
  if (actor.overrides.denies.includes(key)) return false;
  if (actor.overrides.grants.includes(key)) return true;
  return ROLE_DEFAULTS[actor.userRole][resource]?.includes(action) ?? false;
}

export function requirePermission(
  actor: PermissionActor,
  resource: Resource,
  action: string,
  opts: PermissionOptions = {}
): void {
  if (!hasPermission(actor, resource, action, opts)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Your role doesn't allow this action (${resource}:${action}).`,
    });
  }
}

/**
 * Task-delete carve-out: a user without `task:delete` in their effective
 * permissions can still delete tasks they personally created or are
 * assigned to. This preserves the "tidy up your own work" affordance for
 * Staff users without granting them workspace-wide delete power.
 */
export function canDeleteTask(
  actor: PermissionActor,
  task: { createdBy: string; assigneeId: string | null },
  actorUserId: string
): boolean {
  if (hasPermission(actor, 'task', 'delete')) return true;
  return task.createdBy === actorUserId || task.assigneeId === actorUserId;
}

export { type Resource } from './permissions-registry.js';
