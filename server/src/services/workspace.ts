import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  workspaces,
  workspaceMembers,
  type WorkspaceRow,
} from '@projectmgmt/drizzle';
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  Workspace,
} from '@projectmgmt/shared';
import { AUDIT_ACTIONS } from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import { eventBus } from './event-bus.js';
import {
  hasPermission,
  requirePermission,
  type PermissionActor,
} from './permissions.js';

export interface WorkspaceServiceActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    ownerId: row.ownerId,
    position: row.position,
    visibility: row.visibility,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

/**
 * List workspaces the actor can see. Owner / Super Admin (and anyone with
 * `workspace:listAll` granted via overrides) sees every workspace; everyone
 * else sees only the workspaces they're a member of.
 */
export async function listWorkspaces(
  db: DbClient,
  actor: WorkspaceServiceActor
): Promise<Workspace[]> {
  if (hasPermission(actor, 'workspace', 'listAll')) {
    const rows = await db
      .select()
      .from(workspaces)
      .where(isNull(workspaces.archivedAt))
      .orderBy(asc(workspaces.position), asc(workspaces.createdAt));
    return rows.map(toWorkspace);
  }

  const rows = await db
    .select({ w: workspaces })
    .from(workspaces)
    .innerJoin(
      workspaceMembers,
      eq(workspaceMembers.workspaceId, workspaces.id)
    )
    .where(
      and(eq(workspaceMembers.userId, actor.id), isNull(workspaces.archivedAt))
    )
    .orderBy(asc(workspaces.position), asc(workspaces.createdAt));
  return rows.map((r) => toWorkspace(r.w));
}

export async function getWorkspace(
  db: DbClient,
  actor: WorkspaceServiceActor,
  id: string
): Promise<Workspace> {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });

  if (!hasPermission(actor, 'workspace', 'listAll')) {
    const [member] = await db
      .select({ id: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, id),
          eq(workspaceMembers.userId, actor.id)
        )
      )
      .limit(1);
    if (!member) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You are not a member of this workspace.',
      });
    }
  }

  return toWorkspace(row);
}

/**
 * Create a new workspace. The creator is auto-added as the owner member.
 * Position defaults to the end of the list.
 */
export async function createWorkspace(
  db: DbClient,
  actor: WorkspaceServiceActor,
  input: CreateWorkspaceInput
): Promise<Workspace> {
  // Any authenticated user can create a workspace (they'll be its owner).
  const [{ maxPos } = { maxPos: null }] = await db
    .select({ maxPos: max(workspaces.position) })
    .from(workspaces);
  const nextPosition = (maxPos ?? -1) + 1;

  const workspace = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(workspaces)
      .values({
        name: input.name.trim(),
        color: input.color,
        icon: input.icon,
        ownerId: actor.id,
        createdBy: actor.id,
        position: nextPosition,
        visibility: input.visibility ?? 'public',
      })
      .returning();

    await tx.insert(workspaceMembers).values({
      workspaceId: inserted.id,
      userId: actor.id,
      invitedBy: actor.id,
      acceptedAt: new Date(),
    });

    return inserted;
  });

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.WORKSPACE_CREATE,
    entityType: 'workspace',
    entityId: workspace.id,
    workspaceId: workspace.id,
    newValue: { name: workspace.name, visibility: workspace.visibility },
  });

  const result = toWorkspace(workspace);
  eventBus.emit('workspace.created', {
    workspace: result,
    actor: { id: actor.id, email: actor.email },
  });
  return result;
}

export async function updateWorkspace(
  db: DbClient,
  actor: WorkspaceServiceActor,
  id: string,
  input: UpdateWorkspaceInput
): Promise<Workspace> {
  requirePermission(actor, 'workspace', 'update');

  const [previous] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });

  const patch: Partial<WorkspaceRow> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.color !== undefined) patch.color = input.color;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.position !== undefined) patch.position = input.position;
  if (input.visibility !== undefined) patch.visibility = input.visibility;

  const [updated] = await db
    .update(workspaces)
    .set(patch)
    .where(eq(workspaces.id, id))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.WORKSPACE_UPDATE,
    entityType: 'workspace',
    entityId: id,
    workspaceId: id,
    previousValue: previous as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
  });

  const result = toWorkspace(updated);
  eventBus.emit('workspace.updated', {
    workspace: result,
    previous: toWorkspace(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return result;
}

/** Soft-delete (archive) — hard deletes cascade too aggressively for production data. */
export async function deleteWorkspace(
  db: DbClient,
  actor: WorkspaceServiceActor,
  id: string
): Promise<{ ok: true }> {
  requirePermission(actor, 'workspace', 'delete');

  const [previous] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });

  const now = new Date();
  const [archived] = await db
    .update(workspaces)
    .set({ archivedAt: now, updatedAt: now })
    .where(eq(workspaces.id, id))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.WORKSPACE_DELETE,
    entityType: 'workspace',
    entityId: id,
    workspaceId: id,
    previousValue: previous as unknown as Record<string, unknown>,
  });

  eventBus.emit('workspace.deleted', {
    workspace: toWorkspace(archived),
    actor: { id: actor.id, email: actor.email },
  });
  return { ok: true };
}

/**
 * Bulk reorder by passing ordered ids. Only workspaces the caller can update
 * are moved — for non-bypass roles that means: must be a member of the
 * workspace AND must hold the `workspace:update` permission.
 */
export async function reorderWorkspaces(
  db: DbClient,
  actor: WorkspaceServiceActor,
  orderedIds: string[]
): Promise<{ ok: true }> {
  const seesAll = hasPermission(actor, 'workspace', 'listAll');
  const canUpdate = hasPermission(actor, 'workspace', 'update');
  if (!canUpdate) return { ok: true };
  if (orderedIds.length === 0) return { ok: true };

  // For non-listAll users, fetch the subset of `orderedIds` they're a
  // member of in one query instead of N membership lookups in a loop.
  let allowedIds: string[] = orderedIds;
  if (!seesAll) {
    const memberRows = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, actor.id),
          inArray(workspaceMembers.workspaceId, orderedIds)
        )
      );
    const memberSet = new Set(memberRows.map((r) => r.workspaceId));
    allowedIds = orderedIds.filter((id) => memberSet.has(id));
    if (allowedIds.length === 0) return { ok: true };
  }

  // Single CASE-based UPDATE: each row's new position comes from its index
  // in the original `orderedIds` array (so removed-by-permission ids still
  // reserve their slot — this matches the previous loop's behaviour).
  const cases = orderedIds.map((id, i) =>
    sql`WHEN ${workspaces.id} = ${id} THEN ${i}`
  );
  await db
    .update(workspaces)
    .set({
      position: sql`CASE ${sql.join(cases, sql` `)} ELSE ${workspaces.position} END`,
      updatedAt: new Date(),
    })
    .where(inArray(workspaces.id, allowedIds));
  return { ok: true };
}

/** Used by the Admin panel — full list without workspace-membership filtering. */
export async function adminListWorkspaces(
  db: DbClient
): Promise<Workspace[]> {
  const rows = await db
    .select()
    .from(workspaces)
    .orderBy(desc(workspaces.createdAt));
  return rows.map(toWorkspace);
}
