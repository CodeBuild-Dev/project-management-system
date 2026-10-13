/**
 * Client-side mirror of the server's permission registry. Kept in sync with
 * server/src/services/permissions-registry.ts so the admin grid and the
 * usePermission() helper share one vocabulary.
 *
 * If the server adds a new (resource, action) pair, add it here too —
 * otherwise the grid won't render the new toggle.
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
} as const;

export type Resource = keyof typeof PERMISSIONS;
export type Action<R extends Resource> = (typeof PERMISSIONS)[R][number];
export type PermissionKey = `${Resource}:${string}`;

export const RESOURCES: readonly Resource[] = Object.keys(PERMISSIONS) as Resource[];

export const PERMISSION_KEYS: readonly string[] = (
  Object.entries(PERMISSIONS) as [Resource, readonly string[]][]
).flatMap(([resource, actions]) => actions.map((a) => `${resource}:${a}`));

const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS);

export function isValidPermissionKey(key: string): boolean {
  return PERMISSION_KEY_SET.has(key);
}
