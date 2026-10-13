import { useMemo } from 'react';
import type { PermissionOverrides, UserRole } from '@projectmgmt/shared';
import { useAuth } from '@/lib/auth/AuthContext';
import { roleHasDefault } from './matrix';
import type { Resource } from './registry';

const OWNER_PROTECTED_USER_ACTIONS = new Set<string>([
  'update',
  'delete',
  'changeRole',
  'resetPassword',
  'suspend',
]);

interface PermissionInputs {
  role: UserRole;
  overrides: PermissionOverrides;
  targetUserRole?: UserRole;
}

/**
 * Pure check — same resolution rules the server enforces. Centralised so
 * the UI hides actions the server would reject anyway.
 */
export function checkPermission(
  inputs: PermissionInputs,
  resource: Resource,
  action: string
): boolean {
  const ownerTargeted = inputs.targetUserRole === 'owner';
  const protectedHere =
    ownerTargeted &&
    resource === 'user' &&
    OWNER_PROTECTED_USER_ACTIONS.has(action);

  if (inputs.role === 'owner') return true;
  if (inputs.role === 'super_admin') return !protectedHere;
  if (protectedHere) return false;

  const key = `${resource}:${action}`;
  if (inputs.overrides.denies.includes(key)) return false;
  if (inputs.overrides.grants.includes(key)) return true;
  return roleHasDefault(inputs.role, resource, action);
}

/**
 * React hook over the current logged-in user. Pass `targetUserRole` if the
 * action is targeted at another user — needed so Owner-protection kicks in
 * (e.g., a Super Admin shouldn't see "delete" on the Owner row).
 */
export function usePermission(targetUserRole?: UserRole) {
  const { user } = useAuth();
  return useMemo(() => {
    if (!user) return () => false;
    return (resource: Resource, action: string) =>
      checkPermission(
        {
          role: user.role,
          overrides: user.permissionOverrides,
          targetUserRole,
        },
        resource,
        action
      );
  }, [user, targetUserRole]);
}

/** Convenience: returns true iff the current user has the permission. */
export function useHasPermission(
  resource: Resource,
  action: string,
  targetUserRole?: UserRole
): boolean {
  const can = usePermission(targetUserRole);
  return can(resource, action);
}
