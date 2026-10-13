import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  taskGroups,
  boards,
  workspaceMembers,
  type TaskGroupRow,
} from '@projectmgmt/drizzle';
import type {
  CreateTaskGroupInput,
  TaskGroup,
  UpdateTaskGroupInput,
} from '@projectmgmt/shared';
import { AUDIT_ACTIONS } from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import { eventBus } from './event-bus.js';
import { requirePermission, type PermissionActor } from './permissions.js';

export interface TaskGroupServiceActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toGroup(row: TaskGroupRow): TaskGroup {
  return {
    id: row.id,
    boardId: row.boardId,
    name: row.name,
    color: row.color,
    position: row.position,
    collapsed: row.collapsed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertBoardMember(
  db: DbClient,
  actor: TaskGroupServiceActor,
  boardId: string
): Promise<{ workspaceId: string }> {
  const [board] = await db
    .select({ id: boards.id, workspaceId: boards.workspaceId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!board) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board not found.' });
  if (actor.userRole === 'owner' || actor.userRole === 'super_admin') {
    return { workspaceId: board.workspaceId };
  }

  const [member] = await db
    .select({ id: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, board.workspaceId),
        eq(workspaceMembers.userId, actor.id)
      )
    )
    .limit(1);
  if (!member) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You cannot access this board.',
    });
  }
  return { workspaceId: board.workspaceId };
}

export async function listGroups(
  db: DbClient,
  actor: TaskGroupServiceActor,
  boardId: string
): Promise<TaskGroup[]> {
  await assertBoardMember(db, actor, boardId);
  const rows = await db
    .select()
    .from(taskGroups)
    .where(eq(taskGroups.boardId, boardId))
    .orderBy(asc(taskGroups.position), asc(taskGroups.createdAt));
  return rows.map(toGroup);
}

export async function createGroup(
  db: DbClient,
  actor: TaskGroupServiceActor,
  input: CreateTaskGroupInput
): Promise<TaskGroup> {
  const { workspaceId } = await assertBoardMember(db, actor, input.boardId);
  requirePermission(actor, 'group', 'create');

  const [{ maxPos } = { maxPos: null }] = await db
    .select({ maxPos: max(taskGroups.position) })
    .from(taskGroups)
    .where(eq(taskGroups.boardId, input.boardId));
  const nextPosition = (maxPos ?? -1) + 1;

  const [inserted] = await db
    .insert(taskGroups)
    .values({
      boardId: input.boardId,
      name: input.name.trim(),
      color: input.color,
      position: nextPosition,
    })
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.GROUP_CREATE,
    entityType: 'group',
    entityId: inserted.id,
    workspaceId,
    newValue: { name: inserted.name, boardId: inserted.boardId },
  });

  const group = toGroup(inserted);
  eventBus.emit('group.created', {
    group,
    actor: { id: actor.id, email: actor.email },
  });
  return group;
}

export async function updateGroup(
  db: DbClient,
  actor: TaskGroupServiceActor,
  id: string,
  input: UpdateTaskGroupInput
): Promise<TaskGroup> {
  const [previous] = await db
    .select()
    .from(taskGroups)
    .where(eq(taskGroups.id, id))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found.' });

  const { workspaceId } = await assertBoardMember(db, actor, previous.boardId);
  requirePermission(actor, 'group', 'update');

  const patch: Partial<TaskGroupRow> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.color !== undefined) patch.color = input.color;
  if (input.position !== undefined) patch.position = input.position;
  if (input.collapsed !== undefined) patch.collapsed = input.collapsed;

  const [updated] = await db
    .update(taskGroups)
    .set(patch)
    .where(eq(taskGroups.id, id))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.GROUP_UPDATE,
    entityType: 'group',
    entityId: id,
    workspaceId,
    previousValue: previous as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
  });

  const group = toGroup(updated);
  eventBus.emit('group.updated', {
    group,
    previous: toGroup(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return group;
}

export async function deleteGroup(
  db: DbClient,
  actor: TaskGroupServiceActor,
  id: string
): Promise<{ ok: true }> {
  const [previous] = await db
    .select()
    .from(taskGroups)
    .where(eq(taskGroups.id, id))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found.' });

  const { workspaceId } = await assertBoardMember(db, actor, previous.boardId);
  requirePermission(actor, 'group', 'delete');

  await db.delete(taskGroups).where(eq(taskGroups.id, id));

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.GROUP_DELETE,
    entityType: 'group',
    entityId: id,
    workspaceId,
    previousValue: previous as unknown as Record<string, unknown>,
  });

  eventBus.emit('group.deleted', {
    group: toGroup(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return { ok: true };
}

export async function reorderGroups(
  db: DbClient,
  actor: TaskGroupServiceActor,
  boardId: string,
  orderedIds: string[]
): Promise<{ ok: true }> {
  await assertBoardMember(db, actor, boardId);
  requirePermission(actor, 'group', 'update');
  if (orderedIds.length === 0) return { ok: true };
  // Single CASE-based UPDATE replaces an in-transaction loop of N
  // statements; the board_id filter keeps the update scoped.
  const cases = orderedIds.map(
    (id, i) => sql`WHEN ${taskGroups.id} = ${id} THEN ${i}`
  );
  await db
    .update(taskGroups)
    .set({
      position: sql`CASE ${sql.join(cases, sql` `)} ELSE ${taskGroups.position} END`,
      updatedAt: new Date(),
    })
    .where(and(inArray(taskGroups.id, orderedIds), eq(taskGroups.boardId, boardId)));
  return { ok: true };
}
