import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, max, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  tasks,
  boards,
  taskGroups,
  workspaceMembers,
  type TaskRow,
} from '@projectmgmt/drizzle';
import type {
  CreateTaskInput,
  Task,
  UpdateTaskInput,
} from '@projectmgmt/shared';
import { AUDIT_ACTIONS } from '@projectmgmt/shared';
import { writeAuditLog, writeAuditLogs, type AuditActor, type AuditWrite } from './audit.js';
import { eventBus } from './event-bus.js';
import {
  canDeleteTask,
  requirePermission,
  type PermissionActor,
} from './permissions.js';

export interface TaskServiceActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    boardId: row.boardId,
    groupId: row.groupId,
    assigneeId: row.assigneeId,
    name: row.name,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    timelineStart: row.timelineStart,
    timelineEnd: row.timelineEnd,
    tags: (row.tags as string[] | null) ?? [],
    progress: row.progress,
    estimatedMinutes: row.estimatedMinutes,
    position: row.position,
    source: row.source,
    customCells:
      (row.customCells as Record<string, unknown> | null) ?? {},
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

async function assertTaskAccess(
  db: DbClient,
  actor: TaskServiceActor,
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

export async function listTasksByBoard(
  db: DbClient,
  actor: TaskServiceActor,
  boardId: string
): Promise<Task[]> {
  await assertTaskAccess(db, actor, boardId);
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.boardId, boardId))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  return rows.map(toTask);
}

export async function getTask(
  db: DbClient,
  actor: TaskServiceActor,
  id: string
): Promise<Task> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found.' });
  await assertTaskAccess(db, actor, row.boardId);
  return toTask(row);
}

export async function createTask(
  db: DbClient,
  actor: TaskServiceActor,
  input: CreateTaskInput
): Promise<Task> {
  const { workspaceId } = await assertTaskAccess(db, actor, input.boardId);
  requirePermission(actor, 'task', 'create');

  // Validate group belongs to board.
  const [group] = await db
    .select({ id: taskGroups.id, boardId: taskGroups.boardId })
    .from(taskGroups)
    .where(eq(taskGroups.id, input.groupId))
    .limit(1);
  if (!group || group.boardId !== input.boardId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Group does not belong to this board.',
    });
  }

  const [{ maxPos } = { maxPos: null }] = await db
    .select({ maxPos: max(tasks.position) })
    .from(tasks)
    .where(eq(tasks.groupId, input.groupId));
  const nextPosition = (maxPos ?? -1) + 1;

  const [inserted] = await db
    .insert(tasks)
    .values({
      boardId: input.boardId,
      groupId: input.groupId,
      name: input.name,
      assigneeId: input.assigneeId ?? null,
      status: input.status ?? 'not-started',
      priority: input.priority ?? 'medium',
      dueDate: input.dueDate ?? null,
      timelineStart: input.timelineStart ?? null,
      timelineEnd: input.timelineEnd ?? null,
      tags: input.tags ?? [],
      progress: input.progress ?? 0,
      position: nextPosition,
      createdBy: actor.id,
    })
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.TASK_CREATE,
    entityType: 'task',
    entityId: inserted.id,
    workspaceId,
    newValue: inserted as unknown as Record<string, unknown>,
  });

  const task = toTask(inserted);
  eventBus.emit('task.created', {
    task,
    actor: { id: actor.id, email: actor.email },
  });
  return task;
}

export async function updateTask(
  db: DbClient,
  actor: TaskServiceActor,
  id: string,
  input: UpdateTaskInput
): Promise<Task> {
  const [previous] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found.' });

  const { workspaceId } = await assertTaskAccess(db, actor, previous.boardId);
  requirePermission(actor, 'task', 'update');

  const patch: Partial<TaskRow> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.assigneeId !== undefined) patch.assigneeId = input.assigneeId;
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
  if (input.timelineStart !== undefined) patch.timelineStart = input.timelineStart;
  if (input.timelineEnd !== undefined) patch.timelineEnd = input.timelineEnd;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.customCells !== undefined) patch.customCells = input.customCells;
  if (input.progress !== undefined) {
    patch.progress = Math.max(0, Math.min(100, input.progress));
  }
  if (input.position !== undefined) patch.position = input.position;
  if (input.groupId !== undefined) {
    // Moving between groups — validate the new group is in the same board.
    const [newGroup] = await db
      .select({ boardId: taskGroups.boardId })
      .from(taskGroups)
      .where(eq(taskGroups.id, input.groupId))
      .limit(1);
    if (!newGroup || newGroup.boardId !== previous.boardId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Cannot move task to a group outside its board.',
      });
    }
    patch.groupId = input.groupId;
  }

  const [updated] = await db
    .update(tasks)
    .set(patch)
    .where(eq(tasks.id, id))
    .returning();

  const wasMoved = input.groupId !== undefined && input.groupId !== previous.groupId;
  await writeAuditLog(db, actor, {
    action: wasMoved ? AUDIT_ACTIONS.TASK_MOVE : AUDIT_ACTIONS.TASK_UPDATE,
    entityType: 'task',
    entityId: id,
    workspaceId,
    previousValue: previous as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
  });

  const task = toTask(updated);
  eventBus.emit(wasMoved ? 'task.moved' : 'task.updated', {
    task,
    previous: toTask(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return task;
}

export async function deleteTask(
  db: DbClient,
  actor: TaskServiceActor,
  id: string
): Promise<{ ok: true }> {
  const [previous] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found.' });

  const { workspaceId } = await assertTaskAccess(db, actor, previous.boardId);
  if (!canDeleteTask(actor, previous, actor.id)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You can only delete tasks you created or are assigned to.',
    });
  }

  const now = new Date();
  const [archived] = await db
    .update(tasks)
    .set({ archivedAt: now, updatedAt: now })
    .where(eq(tasks.id, id))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.TASK_DELETE,
    entityType: 'task',
    entityId: id,
    workspaceId,
    previousValue: previous as unknown as Record<string, unknown>,
  });

  eventBus.emit('task.deleted', {
    task: toTask(archived),
    actor: { id: actor.id, email: actor.email },
  });
  return { ok: true };
}

/** Update a set of tasks with the same patch (used by the selection toolbar). */
export async function bulkUpdateTasks(
  db: DbClient,
  actor: TaskServiceActor,
  ids: string[],
  patch: Pick<UpdateTaskInput, 'status' | 'priority' | 'assigneeId' | 'dueDate'>
): Promise<{ count: number }> {
  if (ids.length === 0) return { count: 0 };
  requirePermission(actor, 'task', 'update');

  const before = await db.select().from(tasks).where(inArray(tasks.id, ids));
  if (before.length === 0) return { count: 0 };

  // Ensure all targeted tasks belong to boards the caller can access — and
  // pre-resolve workspace ids so the audit-log loop below doesn't run a
  // SELECT per task (was N+1 against the `boards` table).
  const boardIds = Array.from(new Set(before.map((t) => t.boardId)));
  for (const bId of boardIds) {
    await assertTaskAccess(db, actor, bId);
  }
  const boardWorkspaceRows = await db
    .select({ id: boards.id, workspaceId: boards.workspaceId })
    .from(boards)
    .where(inArray(boards.id, boardIds));
  const workspaceByBoard = new Map(
    boardWorkspaceRows.map((r) => [r.id, r.workspaceId])
  );

  const now = new Date();
  const setValues: Partial<TaskRow> = { updatedAt: now };
  if (patch.status !== undefined) setValues.status = patch.status;
  if (patch.priority !== undefined) setValues.priority = patch.priority;
  if (patch.assigneeId !== undefined) setValues.assigneeId = patch.assigneeId;
  if (patch.dueDate !== undefined) setValues.dueDate = patch.dueDate;

  await db.update(tasks).set(setValues).where(inArray(tasks.id, ids));

  const after = await db.select().from(tasks).where(inArray(tasks.id, ids));
  const afterById = new Map(after.map((t) => [t.id, t]));

  // Build all audit entries up front and write them in ONE multi-row INSERT
  // rather than `before.length` sequential round-trips against audit_logs.
  const auditEntries: AuditWrite[] = [];
  for (const prev of before) {
    const next = afterById.get(prev.id);
    if (!next) continue;
    auditEntries.push({
      action: AUDIT_ACTIONS.TASK_UPDATE,
      entityType: 'task',
      entityId: prev.id,
      workspaceId: workspaceByBoard.get(prev.boardId) ?? null,
      previousValue: prev as unknown as Record<string, unknown>,
      newValue: next as unknown as Record<string, unknown>,
    });
    eventBus.emit('task.updated', {
      task: toTask(next),
      previous: toTask(prev),
      actor: { id: actor.id, email: actor.email },
    });
  }
  await writeAuditLogs(db, actor, auditEntries);

  return { count: after.length };
}

/** Reorder tasks within a single group. */
export async function reorderTasksInGroup(
  db: DbClient,
  actor: TaskServiceActor,
  groupId: string,
  orderedIds: string[]
): Promise<{ ok: true }> {
  const [group] = await db
    .select({ boardId: taskGroups.boardId })
    .from(taskGroups)
    .where(eq(taskGroups.id, groupId))
    .limit(1);
  if (!group) throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found.' });
  await assertTaskAccess(db, actor, group.boardId);
  requirePermission(actor, 'task', 'update');

  if (orderedIds.length === 0) return { ok: true };

  // Single UPDATE with a CASE expression assigns every position in one
  // round-trip. The id IN (...) WHERE clause keeps the row count bounded;
  // the group_id filter scopes the update to the requested group so a
  // malicious payload can't shift tasks in a different group. Postgres
  // parameterises the bind values, so this is safe against injection.
  const cases = orderedIds.map(
    (id, i) => sql`WHEN ${tasks.id} = ${id} THEN ${i}`
  );
  await db
    .update(tasks)
    .set({
      position: sql`CASE ${sql.join(cases, sql` `)} ELSE ${tasks.position} END`,
      updatedAt: new Date(),
    })
    .where(and(inArray(tasks.id, orderedIds), eq(tasks.groupId, groupId)));
  return { ok: true };
}
