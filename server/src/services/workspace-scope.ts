import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { workspaceMembers } from '@projectmgmt/drizzle';
import type { UserRole } from '@projectmgmt/shared';

export interface ActorContext {
  id: string;
  role: UserRole;
  primaryWorkspaceId: string | null;
}

/** Roles that can transparently access any workspace without being a member. */
function bypassesMembership(role: UserRole): boolean {
  return role === 'owner' || role === 'super_admin';
}

/**
 * Resolve the workspace the caller is asking about, then verify access.
 * - If `explicit` is provided, the caller is targeting a specific workspace.
 * - Otherwise we fall back to the user's primary workspace.
 *
 * Throws BAD_REQUEST when no workspace can be resolved, FORBIDDEN when the
 * caller is not a member (and is not Owner / Super Admin).
 */
export async function resolveWorkspace(
  db: DbClient,
  actor: ActorContext,
  explicit: string | null | undefined
): Promise<{ workspaceId: string }> {
  const workspaceId = explicit ?? actor.primaryWorkspaceId;
  if (!workspaceId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'No workspace specified and the user has no primary workspace.',
    });
  }

  if (bypassesMembership(actor.role)) {
    return { workspaceId };
  }

  const [row] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, actor.id)
      )
    )
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You are not a member of this workspace.',
    });
  }

  return { workspaceId };
}

/**
 * List all workspace IDs the actor is a member of. Owner and Super Admin see
 * everything (returned as the literal 'all' so callers can short-circuit).
 */
export async function listUserWorkspaceIds(
  db: DbClient,
  userId: string,
  actorRole: UserRole
): Promise<string[] | 'all'> {
  if (bypassesMembership(actorRole)) return 'all';
  const rows = await db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
  return rows.map((r) => r.id);
}
