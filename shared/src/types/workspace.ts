import type { Visibility } from './enums.js';

export interface Workspace {
  id: string;
  name: string;
  color: string;
  icon: string;
  ownerId: string;
  position: number;
  visibility: Visibility;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface CreateWorkspaceInput {
  name: string;
  color: string;
  icon: string;
  visibility?: Visibility;
}

export interface UpdateWorkspaceInput {
  name?: string;
  color?: string;
  icon?: string;
  position?: number;
  visibility?: Visibility;
}

/**
 * Workspace membership is now a pure access list — there is no per-workspace
 * role. What a member can do inside a workspace is determined by their
 * app-level role + per-user permission overrides on the User record.
 */
export interface WorkspaceMember {
  workspaceId: string;
  userId: string;
  invitedBy: string;
  invitedAt: Date;
  acceptedAt: Date | null;
}

export interface InviteMemberInput {
  workspaceId: string;
  email: string;
}
