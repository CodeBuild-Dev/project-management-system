import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  taskUpdates,
  tasks,
  boards,
  workspaceMembers,
  type TaskUpdateRow,
} from '@projectmgmt/drizzle';
import type {
  CreateTaskUpdateInput,
  TaskUpdate,
  TaskUpdateAttachment,
} from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import { eventBus } from './event-bus.js';
import { hasPermission, requirePermission, type PermissionActor } from './permissions.js';

export interface TaskUpdateServiceActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toTaskUpdate(row: TaskUpdateRow): TaskUpdate {
  return {
    id: row.id,
    taskId: row.taskId,
    authorId: row.authorId,
    content: row.content,
    mentions: (row.mentions as string[] | null) ?? [],
    attachments:
      (row.attachments as TaskUpdateAttachment[] | null) ?? [],
    editedAt: row.editedAt,
    createdAt: row.createdAt,
  };
}

async function assertTaskAccessByTaskId(
  db: DbClient,
  actor: TaskUpdateServiceActor,
  taskId: string
): Promise<{ workspaceId: string; task: typeof tasks.$inferSelect }> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found.' });
  const [board] = await db
    .select({ workspaceId: boards.workspaceId })
    .from(boards)
    .where(eq(boards.id, task.boardId))
    .limit(1);
  if (!board) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board not found.' });

  if (actor.userRole !== 'owner' && actor.userRole !== 'super_admin') {
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
        message: 'You cannot access this task.',
      });
    }
  }
  return { workspaceId: board.workspaceId, task };
}

export async function listForTask(
  db: DbClient,
  actor: TaskUpdateServiceActor,
  taskId: string,
  order: 'asc' | 'desc' = 'asc'
): Promise<TaskUpdate[]> {
  await assertTaskAccessByTaskId(db, actor, taskId);
  const rows = await db
    .select()
    .from(taskUpdates)
    .where(eq(taskUpdates.taskId, taskId))
    .orderBy(
      order === 'asc' ? asc(taskUpdates.createdAt) : desc(taskUpdates.createdAt)
    );
  return rows.map(toTaskUpdate);
}

export async function createTaskUpdate(
  db: DbClient,
  actor: TaskUpdateServiceActor,
  input: CreateTaskUpdateInput
): Promise<TaskUpdate> {
  const { workspaceId, task } = await assertTaskAccessByTaskId(db, actor, input.taskId);
  requirePermission(actor, 'task_update', 'create');

  const content = input.content.trim();
  const attachments = input.attachments ?? [];
  if (!content && attachments.length === 0) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Comment cannot be empty.' });
  }

  const [inserted] = await db
    .insert(taskUpdates)
    .values({
      taskId: input.taskId,
      authorId: actor.id,
      content,
      mentions: input.mentions ?? [],
      attachments,
    })
    .returning();

  await writeAuditLog(db, actor, {
    action: 'task_update.create',
    entityType: 'task_update',
    entityId: inserted.id,
    workspaceId,
    newValue: { taskId: input.taskId, content },
  });

  const update = toTaskUpdate(inserted);
  eventBus.emit('task_update.created', {
    update,
    task: toEventTask(task),
    actor: { id: actor.id, email: actor.email },
  });
  return update;
}

function toEventTask(task: typeof tasks.$inferSelect) {
  return {
    id: task.id,
    boardId: task.boardId,
    groupId: task.groupId,
    assigneeId: task.assigneeId,
    name: task.name,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    timelineStart: task.timelineStart,
    timelineEnd: task.timelineEnd,
    tags: (task.tags as string[] | null) ?? [],
    progress: task.progress,
    estimatedMinutes: task.estimatedMinutes,
    position: task.position,
    source: task.source,
    customCells: (task.customCells as Record<string, unknown> | null) ?? {},
    archivedAt: task.archivedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    createdBy: task.createdBy,
  };
}

async function loadTaskUpdate(db: DbClient, id: string) {
  const [row] = await db.select().from(taskUpdates).where(eq(taskUpdates.id, id)).limit(1);
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found.' });
  }
  return row;
}

export async function updateTaskUpdate(
  db: DbClient,
  actor: TaskUpdateServiceActor,
  input: { id: string; content: string; mentions?: string[] }
): Promise<TaskUpdate> {
  const existing = await loadTaskUpdate(db, input.id);
  const { workspaceId, task } = await assertTaskAccessByTaskId(db, actor, existing.taskId);

  // Authors can always edit their own update; otherwise require the global perm.
  const isAuthor = existing.authorId === actor.id;
  if (!isAuthor && !hasPermission(actor, 'task_update', 'update')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You can only edit your own comments.',
    });
  }

  const content = input.content.trim();
  if (!content) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Comment cannot be empty.' });
  }

  const previous = toTaskUpdate(existing);
  const [updatedRow] = await db
    .update(taskUpdates)
    .set({
      content,
      mentions: input.mentions ?? (existing.mentions as string[] | null) ?? [],
      editedAt: new Date(),
    })
    .where(eq(taskUpdates.id, input.id))
    .returning();

  await writeAuditLog(db, actor, {
    action: 'task_update.update',
    entityType: 'task_update',
    entityId: input.id,
    workspaceId,
    previousValue: { content: previous.content, mentions: previous.mentions },
    newValue: { content, mentions: updatedRow.mentions },
  });

  const next = toTaskUpdate(updatedRow);
  eventBus.emit('task_update.updated', {
    update: next,
    previous,
    task: toEventTask(task),
    actor: { id: actor.id, email: actor.email },
  });
  return next;
}

export async function deleteTaskUpdate(
  db: DbClient,
  actor: TaskUpdateServiceActor,
  id: string
): Promise<{ id: string }> {
  const existing = await loadTaskUpdate(db, id);
  const { workspaceId, task } = await assertTaskAccessByTaskId(db, actor, existing.taskId);

  const isAuthor = existing.authorId === actor.id;
  if (!isAuthor && !hasPermission(actor, 'task_update', 'delete')) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'You can only delete your own comments.',
    });
  }

  await db.delete(taskUpdates).where(eq(taskUpdates.id, id));

  await writeAuditLog(db, actor, {
    action: 'task_update.delete',
    entityType: 'task_update',
    entityId: id,
    workspaceId,
    previousValue: {
      taskId: existing.taskId,
      authorId: existing.authorId,
      content: existing.content,
      mentions: (existing.mentions as string[] | null) ?? [],
    },
  });

  eventBus.emit('task_update.deleted', {
    updateId: id,
    taskId: existing.taskId,
    task: toEventTask(task),
    actor: { id: actor.id, email: actor.email },
  });
  return { id };
}
