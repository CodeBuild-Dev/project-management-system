import type { UserRole, WorkMode } from './enums.js';

export interface NotificationPreferences {
  emailEnabled: boolean;
  pushEnabled: boolean;
  digestFrequency: 'realtime' | 'hourly' | 'daily' | 'never';
}

/**
 * Per-user permission overrides. Each entry is a "<resource>:<action>" key
 * (e.g. "board:delete", "user:changeRole"). `grants` adds capabilities on
 * top of the user's role defaults; `denies` removes them. See
 * server/src/services/permissions.ts for the full resolution order.
 *
 * Owner / Super Admin ignore overrides — they bypass the matrix entirely.
 */
export interface PermissionOverrides {
  grants: string[];
  denies: string[];
}

export const EMPTY_PERMISSION_OVERRIDES: PermissionOverrides = Object.freeze({
  grants: [],
  denies: [],
}) as PermissionOverrides;

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  initials: string;
  color: string;
  role: UserRole;
  permissionOverrides: PermissionOverrides;
  jobTitle: string | null;
  workMode: WorkMode | null;
  primaryWorkspaceId: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  totpSecret: string | null;
  totpEnabled: boolean;
  totpVerifiedAt: Date | null;
  backupCodesHash: string | null;
  notificationPreferences: NotificationPreferences | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Safe shape for responses — never leak password or TOTP secrets. */
export type PublicUser = Omit<
  User,
  'passwordHash' | 'totpSecret' | 'backupCodesHash'
>;

export interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  color?: string;
  avatarUrl?: string | null;
  jobTitle?: string | null;
  workMode?: WorkMode | null;
  isActive?: boolean;
  role?: UserRole;
  permissionOverrides?: PermissionOverrides;
  notificationPreferences?: NotificationPreferences | null;
}
