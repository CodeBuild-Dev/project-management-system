/**
 * Source-of-truth resource × action registry.
 *
 * Every (resource, action) pair the system enforces appears here. The
 * permission grid in the admin UI is generated from this file, and the
 * default-permissions matrix per role lives next to it (see permissions.ts).
 *
 * To add a new gated capability:
 *   1. Add the (resource, action) here.
 *   2. Add it to ROLE_DEFAULTS in permissions.ts under the roles that should
 *      have it by default.
 *   3. Call `requirePermission(actor, resource, action)` at the enforcement
 *      site.
 *
 * Note: workspace-membership scoping is enforced separately by
 * resolveWorkspace() — these flags say "what can the user do with a
 * resource", not "in which workspaces".
 */

export const PERMISSIONS = {
  user: [
    'create',
    'read',
    'update',
    'delete',
    'changeRole',
    'resetPassword',
    'suspend',
  ],
  workspace: ['create', 'read', 'update', 'delete', 'listAll'],
  board: ['create', 'read', 'update', 'delete'],
  group: ['create', 'read', 'update', 'delete'],
  task: ['create', 'read', 'update', 'delete'],
  task_update: ['create', 'read', 'update', 'delete'],
  member: ['read', 'invite', 'remove'],
  audit: ['read'],
  settings: ['manage'],
  client: ['create', 'read', 'update', 'delete'],
  time_entry: ['create', 'read', 'update', 'delete'],
  expense: ['create', 'read', 'update', 'delete'],
  budget: ['read', 'update'],
  report: ['read'],
} as const;

export type Resource = keyof typeof PERMISSIONS;
export type Action<R extends Resource> = (typeof PERMISSIONS)[R][number];

/** Flat list of every "<resource>:<action>" key, used by the override grid. */
export const PERMISSION_KEYS: readonly string[] = (
  Object.entries(PERMISSIONS) as [Resource, readonly string[]][]
).flatMap(([resource, actions]) => actions.map((a) => `${resource}:${a}`));

const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS);

/** True if "resource:action" is a registered key. Used to validate override input. */
export function isValidPermissionKey(key: string): boolean {
  return PERMISSION_KEY_SET.has(key);
}

/**
 * Actions on the `user` resource that target an existing account and so are
 * subject to Owner-protection. Read/create are excluded — they don't mutate
 * a specific user's record.
 */
export const OWNER_PROTECTED_USER_ACTIONS = new Set<string>([
  'update',
  'delete',
  'changeRole',
  'resetPassword',
  'suspend',
]);
