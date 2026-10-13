import { createContext, useContext, useMemo, ReactNode, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { PermissionOverrides } from '@projectmgmt/shared';
import type { AuthRole } from '@/lib/auth/AuthContext';
import { useAuth } from '@/lib/auth/AuthContext';

/**
 * Directory of all users in the system, as seen by Owner / Super Admin /
 * Admin. Backed by trpc.user.adminList + adminUpdate / changeRole /
 * updatePermissions / delete; users without admin-panel access see an empty
 * list because the gated query returns nothing for them.
 */

export type UserStatus = 'active' | 'invited' | 'suspended';

export interface DirectoryUser {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  permissionOverrides: PermissionOverrides;
  status: UserStatus;
  workspaceIds: string[];
  boardIds: string[];
  color: string;
  initials: string;
  avatarUrl: string | null;
  lastLogin: string | null;
  createdAt: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  role: AuthRole;
  permissionOverrides: PermissionOverrides;
  workspaceIds: string[];
  boardIds: string[];
  password?: string;
  status?: UserStatus;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: AuthRole;
  permissionOverrides?: PermissionOverrides;
  status?: UserStatus;
  workspaceIds?: string[];
  boardIds?: string[];
}

interface UserRegistryContextValue {
  users: DirectoryUser[];
  isLoading: boolean;
  createUser: (input: CreateUserInput) => Promise<DirectoryUser | null>;
  updateUser: (id: string, patch: UpdateUserInput) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  setUserStatus: (id: string, status: UserStatus) => Promise<void>;
}

const UserRegistryContext = createContext<UserRegistryContextValue | null>(null);

function pickStatus(isActive: boolean, lastLoginAt: unknown): UserStatus {
  if (!isActive) return 'suspended';
  if (!lastLoginAt) return 'invited';
  return 'active';
}

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim() || '(no name)';
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function emptyOverrides(): PermissionOverrides {
  return { grants: [], denies: [] };
}

export function UserRegistryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdminPanelAllowed =
    user?.role === 'owner' || user?.role === 'super_admin' || user?.role === 'admin';
  const utils = trpc.useUtils();

  const listQuery = trpc.user.adminList.useQuery(
    { limit: 100 },
    { enabled: !!isAdminPanelAllowed }
  );

  const registerMutation = trpc.auth.register.useMutation();
  const adminUpdateMutation = trpc.user.adminUpdate.useMutation({
    onSuccess: () => void utils.user.adminList.invalidate(),
  });
  const changeRoleMutation = trpc.user.changeRole.useMutation({
    onSuccess: () => void utils.user.adminList.invalidate(),
  });
  const transferOwnershipMutation = trpc.user.transferOwnership.useMutation({
    onSuccess: () => void utils.user.adminList.invalidate(),
  });
  const updatePermissionsMutation = trpc.user.updatePermissions.useMutation({
    onSuccess: () => void utils.user.adminList.invalidate(),
  });
  const deleteMutation = trpc.user.delete.useMutation({
    onSuccess: () => void utils.user.adminList.invalidate(),
  });
  const inviteMemberMutation = trpc.member.invite.useMutation();

  const users: DirectoryUser[] = useMemo(() => {
    return (listQuery.data?.users ?? []).map((u) => ({
      id: u.id,
      name: fullName(u.firstName, u.lastName),
      email: u.email,
      role: u.role,
      permissionOverrides: {
        grants: Array.isArray(u.permissionOverrides?.grants)
          ? [...u.permissionOverrides.grants]
          : [],
        denies: Array.isArray(u.permissionOverrides?.denies)
          ? [...u.permissionOverrides.denies]
          : [],
      },
      status: pickStatus(u.isActive, u.lastLoginAt),
      workspaceIds: [],
      boardIds: [],
      color: u.color,
      initials: u.initials,
      avatarUrl: u.avatarUrl ?? null,
      lastLogin:
        u.lastLoginAt instanceof Date
          ? u.lastLoginAt.toISOString()
          : u.lastLoginAt
          ? new Date(u.lastLoginAt as unknown as string).toISOString()
          : null,
      createdAt:
        u.createdAt instanceof Date
          ? u.createdAt.toISOString()
          : new Date(u.createdAt as unknown as string).toISOString(),
    }));
  }, [listQuery.data]);

  const createUser = useCallback<UserRegistryContextValue['createUser']>(
    async ({ name, email, role, permissionOverrides, password, workspaceIds }) => {
      // No dedicated super-admin "create user" endpoint exists; use
      // auth.register (creates a Staff user with the supplied password), then
      // promote via changeRole / transferOwnership and apply permission
      // overrides afterwards. Workspace assignment goes through member.invite,
      // which is idempotent-ish (CONFLICT on dup).
      const [first, ...rest] = name.trim().split(/\s+/);
      const firstName = first || email.split('@')[0];
      const lastName = rest.join(' ');
      const pw = password?.trim() || Math.random().toString(36).slice(2, 12) + 'A1!';

      try {
        const result = await registerMutation.mutateAsync({
          email: email.trim().toLowerCase(),
          password: pw,
          firstName,
          lastName,
        });

        if (role === 'owner') {
          await transferOwnershipMutation.mutateAsync({ id: result.user.id });
        } else if (role !== 'staff') {
          await changeRoleMutation.mutateAsync({ id: result.user.id, role });
        }

        const hasOverrides =
          permissionOverrides.grants.length > 0 ||
          permissionOverrides.denies.length > 0;
        if (hasOverrides && role !== 'owner' && role !== 'super_admin') {
          await updatePermissionsMutation.mutateAsync({
            id: result.user.id,
            overrides: permissionOverrides,
          });
        }

        for (const wsId of workspaceIds) {
          try {
            await inviteMemberMutation.mutateAsync({
              workspaceId: wsId,
              email: result.user.email,
            });
          } catch (err) {
            // CONFLICT means they're already a member — safe to ignore.
            console.warn('[users.create] member.invite failed:', wsId, err);
          }
        }
        await utils.user.adminList.invalidate();
        const display: DirectoryUser = {
          id: result.user.id,
          name: fullName(firstName, lastName),
          email: result.user.email,
          role,
          permissionOverrides:
            role === 'owner' || role === 'super_admin'
              ? emptyOverrides()
              : permissionOverrides,
          status: 'active',
          workspaceIds,
          boardIds: [],
          color: result.user.color,
          initials: result.user.initials || initialsFor(name),
          avatarUrl: result.user.avatarUrl ?? null,
          lastLogin: null,
          createdAt: new Date().toISOString(),
        };
        return display;
      } catch (err) {
        console.warn('[users.create] failed:', err);
        return null;
      }
    },
    [
      registerMutation,
      changeRoleMutation,
      transferOwnershipMutation,
      updatePermissionsMutation,
      inviteMemberMutation,
      utils,
    ]
  );

  const updateUser = useCallback<UserRegistryContextValue['updateUser']>(
    async (id, patch) => {
      const data: {
        firstName?: string;
        lastName?: string;
        email?: string;
        isActive?: boolean;
      } = {};
      if (patch.name) {
        const [first, ...rest] = patch.name.trim().split(/\s+/);
        data.firstName = first;
        data.lastName = rest.join(' ');
      }
      if (patch.email) data.email = patch.email.trim().toLowerCase();
      if (patch.status) data.isActive = patch.status !== 'suspended';
      if (Object.keys(data).length > 0) {
        await adminUpdateMutation.mutateAsync({ id, data });
      }
      if (patch.role) {
        if (patch.role === 'owner') {
          await transferOwnershipMutation.mutateAsync({ id });
        } else {
          await changeRoleMutation.mutateAsync({ id, role: patch.role });
        }
      }
      if (patch.permissionOverrides) {
        await updatePermissionsMutation.mutateAsync({
          id,
          overrides: patch.permissionOverrides,
        });
      }
    },
    [
      adminUpdateMutation,
      changeRoleMutation,
      transferOwnershipMutation,
      updatePermissionsMutation,
    ]
  );

  const deleteUser = useCallback<UserRegistryContextValue['deleteUser']>(
    async (id) => {
      await deleteMutation.mutateAsync({ id });
    },
    [deleteMutation]
  );

  const setUserStatus = useCallback<UserRegistryContextValue['setUserStatus']>(
    async (id, status) => {
      await adminUpdateMutation.mutateAsync({
        id,
        data: { isActive: status !== 'suspended' },
      });
    },
    [adminUpdateMutation]
  );

  const value = useMemo<UserRegistryContextValue>(
    () => ({
      users,
      isLoading: listQuery.isLoading,
      createUser,
      updateUser,
      deleteUser,
      setUserStatus,
    }),
    [users, listQuery.isLoading, createUser, updateUser, deleteUser, setUserStatus]
  );

  return <UserRegistryContext.Provider value={value}>{children}</UserRegistryContext.Provider>;
}

export function useUserRegistry(): UserRegistryContextValue {
  const ctx = useContext(UserRegistryContext);
  if (!ctx) throw new Error('useUserRegistry must be used inside <UserRegistryProvider>');
  return ctx;
}
