import type { ContextUser } from './context.js';

/**
 * Build the actor record services consume. Carries everything needed for
 * audit logging + permission resolution. Workspace membership is resolved
 * separately by resolveWorkspace() in the workspace-scope helper.
 */
export function makeActor(
  user: ContextUser,
  ctx: { ipAddress: string; userAgent: string }
) {
  return {
    id: user.id,
    email: user.email,
    role: user.role, // for AuditActor
    userRole: user.role, // for PermissionActor
    userId: user.id, // for PermissionActor
    overrides: user.permissionOverrides,
    primaryWorkspaceId: user.primaryWorkspaceId,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  };
}
