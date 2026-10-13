import { eq, inArray } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { boards, tasks, workspaceMembers } from '@projectmgmt/drizzle';
import { eventBus } from './event-bus.js';
import { recordActivity } from './activity.js';
import { createNotifications } from './notification.js';
import { runAutomationsForEvent } from './automation.js';

/**
 * boards.workspace_id is immutable (a board can't move workspaces), so we
 * cache the mapping per-process. First lookup is one indexed SELECT;
 * subsequent lookups are O(1) memory reads. Saves an N+1 against the
 * boards table for every task / group / comment event we record an
 * activity row for.
 */
const boardWorkspaceCache = new Map<string, string>();

async function workspaceIdForBoardCached(
  db: DbClient,
  boardId: string
): Promise<string | null> {
  const cached = boardWorkspaceCache.get(boardId);
  if (cached) return cached;
  const [row] = await db
    .select({ workspaceId: boards.workspaceId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!row) return null;
  boardWorkspaceCache.set(boardId, row.workspaceId);
  return row.workspaceId;
}

/**
 * Subscribe domain events → derived side effects (activities today;
 * notifications + realtime in later sprints). Call once from server boot.
 */
async function workspaceIdForBoard(
  db: DbClient,
  boardId: string
): Promise<string | null> {
  return workspaceIdForBoardCached(db, boardId);
}

export function registerDomainHandlers(db: DbClient): void {
  eventBus.on('board.created', async ({ board, actor }) => {
    await recordActivity(db, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      type: 'board_created',
      summary: `${actor.email} created board "${board.name}"`,
      performedBy: actor.id,
    });
  });

  eventBus.on('board.updated', async ({ board, previous, actor }) => {
    const changes: string[] = [];
    if (previous.name !== board.name) changes.push(`renamed to "${board.name}"`);
    if (previous.visibility !== board.visibility) {
      changes.push(`visibility: ${previous.visibility} → ${board.visibility}`);
    }
    await recordActivity(db, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      type: 'board_updated',
      summary: `${actor.email} updated board${changes.length ? ` (${changes.join(', ')})` : ''}`,
      performedBy: actor.id,
    });
  });

  eventBus.on('board.deleted', async ({ board, actor }) => {
    await recordActivity(db, {
      workspaceId: board.workspaceId,
      boardId: board.id,
      type: 'board_deleted',
      summary: `${actor.email} archived board "${board.name}"`,
      performedBy: actor.id,
    });
  });

  eventBus.on('group.created', async ({ group, actor }) => {
    const wsId = await workspaceIdForBoard(db, group.boardId);
    if (!wsId) return;
    await recordActivity(db, {
      workspaceId: wsId,
      boardId: group.boardId,
      type: 'group_created',
      summary: `${actor.email} created group "${group.name}"`,
      performedBy: actor.id,
    });
  });

  eventBus.on('group.updated', async ({ group, previous, actor }) => {
    const wsId = await workspaceIdForBoard(db, group.boardId);
    if (!wsId) return;
    const changes: string[] = [];
    if (previous.name !== group.name) changes.push(`renamed to "${group.name}"`);
    await recordActivity(db, {
      workspaceId: wsId,
      boardId: group.boardId,
      type: 'group_updated',
      summary: `${actor.email} updated group${changes.length ? ` (${changes.join(', ')})` : ''}`,
      performedBy: actor.id,
    });
  });

  eventBus.on('group.deleted', async ({ group, actor }) => {
    const wsId = await workspaceIdForBoard(db, group.boardId);
    if (!wsId) return;
    await recordActivity(db, {
      workspaceId: wsId,
      boardId: group.boardId,
      type: 'group_deleted',
      summary: `${actor.email} deleted group "${group.name}"`,
      performedBy: actor.id,
    });
  });

  eventBus.on('task.created', async ({ task, actor }) => {
    const wsId = await workspaceIdForBoard(db, task.boardId);
    if (!wsId) return;
    await recordActivity(db, {
      workspaceId: wsId,
      boardId: task.boardId,
      taskId: task.id,
      type: 'task_created',
      summary: `${actor.email} created "${task.name}"`,
      performedBy: actor.id,
    });
  });

  eventBus.on('task.updated', async ({ task, previous, actor }) => {
    const wsId = await workspaceIdForBoard(db, task.boardId);
    if (!wsId) return;

    const writes: Promise<unknown>[] = [];
    const push = (
      type: Parameters<typeof recordActivity>[1]['type'],
      field: string,
      from: string | null,
      to: string | null,
      summary: string
    ) =>
      writes.push(
        recordActivity(db, {
          workspaceId: wsId,
          boardId: task.boardId,
          taskId: task.id,
          type,
          field,
          fromValue: from,
          toValue: to,
          summary,
          performedBy: actor.id,
        })
      );

    if (previous.status !== task.status) {
      push(
        'status_changed',
        'status',
        previous.status,
        task.status,
        `${actor.email} changed status: ${previous.status} → ${task.status}`
      );
    }
    if (previous.priority !== task.priority) {
      push(
        'priority_changed',
        'priority',
        previous.priority,
        task.priority,
        `${actor.email} changed priority: ${previous.priority} → ${task.priority}`
      );
    }
    if (previous.assigneeId !== task.assigneeId) {
      push(
        'assignee_changed',
        'assigneeId',
        previous.assigneeId,
        task.assigneeId,
        `${actor.email} updated assignee`
      );
    }
    const prevDue = previous.dueDate?.toISOString() ?? null;
    const nextDue = task.dueDate?.toISOString() ?? null;
    if (prevDue !== nextDue) {
      push(
        'due_date_changed',
        'dueDate',
        prevDue,
        nextDue,
        `${actor.email} changed due date`
      );
    }

    if (writes.length === 0) {
      await recordActivity(db, {
        workspaceId: wsId,
        boardId: task.boardId,
        taskId: task.id,
        type: 'task_updated',
        summary: `${actor.email} updated "${task.name}"`,
        performedBy: actor.id,
      });
    } else {
      await Promise.all(writes);
    }
  });

  eventBus.on('task.moved', async ({ task, previous, actor }) => {
    const wsId = await workspaceIdForBoard(db, task.boardId);
    if (!wsId) return;
    await recordActivity(db, {
      workspaceId: wsId,
      boardId: task.boardId,
      taskId: task.id,
      type: 'task_moved',
      field: 'groupId',
      fromValue: previous.groupId,
      toValue: task.groupId,
      summary: `${actor.email} moved "${task.name}" to a different group`,
      performedBy: actor.id,
    });
  });

  eventBus.on('task.deleted', async ({ task, actor }) => {
    const wsId = await workspaceIdForBoard(db, task.boardId);
    if (!wsId) return;
    await recordActivity(db, {
      workspaceId: wsId,
      boardId: task.boardId,
      taskId: task.id,
      type: 'task_archived',
      summary: `${actor.email} archived "${task.name}"`,
      performedBy: actor.id,
    });
  });

  eventBus.on('task_update.created', async ({ update, task, actor }) => {
    const wsId = await workspaceIdForBoard(db, task.boardId);
    if (!wsId) return;
    await recordActivity(db, {
      workspaceId: wsId,
      boardId: task.boardId,
      taskId: task.id,
      type: 'comment_added',
      summary: `${actor.email} commented on "${task.name}"`,
      performedBy: actor.id,
    });
    void update;
  });

  eventBus.on('member.added', async ({ workspaceId, actor }) => {
    await recordActivity(db, {
      workspaceId,
      type: 'member_added',
      summary: `${actor.email} added a member`,
      performedBy: actor.id,
    });
  });

  eventBus.on('member.removed', async ({ workspaceId, actor }) => {
    await recordActivity(db, {
      workspaceId,
      type: 'member_removed',
      summary: `${actor.email} removed a member`,
      performedBy: actor.id,
    });
  });

  // --- Notifications ---

  // New task with an assignee → notify the assignee. Was previously a gap
  // (only assignee CHANGES on existing tasks fired a notification, so anyone
  // creating a new task and pre-filling the assignee got nothing).
  eventBus.on('task.created', async ({ task, actor }) => {
    if (!task.assigneeId || task.assigneeId === actor.id) return;
    await createNotifications(db, [
      {
        userId: task.assigneeId,
        entityType: 'task',
        entityId: task.id,
        type: 'assignment',
        title: 'You were assigned a task',
        message: `"${task.name}" · assigned by ${actor.email}`,
      },
    ]);
  });

  // Assignee change → notify the new assignee (if they exist + aren't the actor).
  eventBus.on('task.updated', async ({ task, previous, actor }) => {
    if (!task.assigneeId || task.assigneeId === previous.assigneeId) return;
    if (task.assigneeId === actor.id) return;
    await createNotifications(db, [
      {
        userId: task.assigneeId,
        entityType: 'task',
        entityId: task.id,
        type: 'assignment',
        title: 'You were assigned a task',
        message: `"${task.name}" · assigned by ${actor.email}`,
      },
    ]);
  });

  // Status change → notify assignee (except when the actor changed their own task).
  eventBus.on('task.updated', async ({ task, previous, actor }) => {
    if (task.status === previous.status) return;
    if (!task.assigneeId || task.assigneeId === actor.id) return;
    await createNotifications(db, [
      {
        userId: task.assigneeId,
        entityType: 'task',
        entityId: task.id,
        type: 'status_changed',
        title: `Status changed to ${task.status}`,
        message: `"${task.name}" · changed by ${actor.email}`,
      },
    ]);
  });

  // New comment → notify task assignee + mentioned users (dedup + no self-notify).
  eventBus.on('task_update.created', async ({ update, task, actor }) => {
    const recipients = new Set<string>();
    if (task.assigneeId && task.assigneeId !== actor.id) recipients.add(task.assigneeId);
    for (const mentioned of update.mentions ?? []) {
      if (mentioned !== actor.id) recipients.add(mentioned);
    }
    if (recipients.size === 0) return;

    await createNotifications(
      db,
      Array.from(recipients).map((userId) => ({
        userId,
        entityType: 'task_update' as const,
        entityId: update.id,
        type: (update.mentions ?? []).includes(userId)
          ? ('mention' as const)
          : ('comment_added' as const),
        title: (update.mentions ?? []).includes(userId)
          ? `${actor.email} mentioned you`
          : `${actor.email} commented on your task`,
        message: `"${task.name}" · ${update.content.slice(0, 160)}`,
      }))
    );
  });

  // New member added → notify the member.
  eventBus.on('member.added', async ({ member, workspaceId, actor }) => {
    if (member.userId === actor.id) return;
    await createNotifications(db, [
      {
        userId: member.userId,
        entityType: 'workspace',
        entityId: workspaceId,
        type: 'invited',
        title: 'You were added to a workspace',
        message: `Invited by ${actor.email}`,
      },
    ]);
  });

  // ----- Automation engine wiring -------------------------------------
  //
  // Every domain event the engine cares about funnels into
  // runAutomationsForEvent(boardId, event). Each handler is small on
  // purpose — the engine itself is the only place that knows which
  // recipes match. Subscribers added later for new triggers (cron,
  // additional event kinds) can reuse the same call shape.
  eventBus.on('task.created', async ({ task, actor }) => {
    await runAutomationsForEvent(
      db,
      task.boardId,
      { kind: 'task.created', task },
      actor
    );
  });
  eventBus.on('task.updated', async ({ task, previous, actor }) => {
    await runAutomationsForEvent(
      db,
      task.boardId,
      { kind: 'task.updated', task, previous },
      actor
    );
  });
  eventBus.on('task.moved', async ({ task, previous, actor }) => {
    await runAutomationsForEvent(
      db,
      task.boardId,
      { kind: 'task.moved', task, previous },
      actor
    );
  });
  eventBus.on('task_update.created', async ({ update, task, actor }) => {
    await runAutomationsForEvent(
      db,
      task.boardId,
      {
        kind: 'task_update.created',
        task,
        authorId: actor.id,
        mentionedIds: (update.mentions as string[] | null) ?? [],
      },
      actor
    );
  });
}

// Suppress unused-import warnings — `inArray` is kept available for future handlers.
void inArray;
