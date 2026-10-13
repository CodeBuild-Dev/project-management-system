import type { UserRole } from '@projectmgmt/shared';
import { PERMISSIONS, type Resource } from './registry';

/**
 * Mirrors server/src/services/permissions.ts ROLE_DEFAULTS. The server is the
 * source of truth for enforcement; this copy is what the admin grid renders
 * as the "filled by role" baseline.
 */
export const ROLE_DEFAULTS: Record<
  UserRole,
  Partial<Record<Resource, readonly string[]>>
> = {
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
  },
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
  },
  staff: {
    workspace: ['create', 'read'],
    board: ['create', 'read', 'update'],
    group: ['create', 'read', 'update'],
    task: ['create', 'read', 'update'],
    task_update: ['create', 'read', 'update'],
    member: ['read'],
  },
};

export function roleHasDefault(
  role: UserRole,
  resource: Resource,
  action: string
): boolean {
  return ROLE_DEFAULTS[role][resource]?.includes(action) ?? false;
}
