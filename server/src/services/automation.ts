import { TRPCError } from '@trpc/server';
import { and, asc, eq, gte, isNull, lt, max, ne, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  automations,
  tasks,
  type AutomationRow,
  type TaskRow,
} from '@projectmgmt/drizzle';
import type {
  Automation,
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
  CreateAutomationInput,
  UpdateAutomationInput,
  Task,
} from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import {
  hasPermission,
  requirePermission,
  type PermissionActor,
} from './permissions.js';
import { runActions } from './automation-executor.js';

export interface AutomationServiceActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    boardId: row.boardId,
    name: row.name,
    enabled: row.enabled,
    trigger: row.trigger as AutomationTrigger,
    conditions: (row.conditions as AutomationCondition[] | null) ?? [],
    actions: (row.actions as AutomationAction[] | null) ?? [],
    position: row.position,
    lastRunAt: row.lastRunAt,
    runCount: row.runCount,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// --------------------------------- CRUD ---------------------------------

export async function listAutomationsByBoard(
  db: DbClient,
  actor: AutomationServiceActor,
  boardId: string
): Promise<Automation[]> {
  // Read uses board.read — anyone who can see the board can see its
  // recipes (but not run their actions, which is enforced separately).
  requirePermission(actor, 'board', 'read');
  const rows = await db
    .select()
    .from(automations)
    .where(eq(automations.boardId, boardId))
    .orderBy(asc(automations.position), asc(automations.createdAt));
  return rows.map(toAutomation);
}

export async function createAutomation(
  db: DbClient,
  actor: AutomationServiceActor,
  input: CreateAutomationInput
): Promise<Automation> {
  // Edit gate: anyone who can update the board can author its automations.
  // Tighten with a dedicated `automation.create` permission once
  // staff/admin separation matters here.
  requirePermission(actor, 'board', 'update');

  // Append to the bottom of the list — UI exposes drag-reorder later.
  const [maxRow] = await db
    .select({ p: max(automations.position) })
    .from(automations)
    .where(eq(automations.boardId, input.boardId));
  const nextPosition = (maxRow?.p ?? -1) + 1;

  const [inserted] = await db
    .insert(automations)
    .values({
      boardId: input.boardId,
      name: input.name.trim(),
      enabled: input.enabled ?? true,
      trigger: input.trigger,
      conditions: input.conditions ?? [],
      actions: input.actions,
      position: nextPosition,
      createdBy: actor.id,
    })
    .returning();
  const automation = toAutomation(inserted);

  await writeAuditLog(db, actor, {
    action: 'automation.create',
    entityType: 'automation',
    entityId: automation.id,
    newValue: {
      boardId: automation.boardId,
      name: automation.name,
      trigger: automation.trigger,
    },
  });

  return automation;
}

export async function updateAutomation(
  db: DbClient,
  actor: AutomationServiceActor,
  id: string,
  patch: UpdateAutomationInput
): Promise<Automation> {
  requirePermission(actor, 'board', 'update');
  const [previous] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, id))
    .limit(1);
  if (!previous) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Automation not found.' });
  }

  const set: Partial<AutomationRow> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.trigger !== undefined) set.trigger = patch.trigger;
  if (patch.conditions !== undefined) set.conditions = patch.conditions;
  if (patch.actions !== undefined) set.actions = patch.actions;
  if (patch.position !== undefined) set.position = patch.position;

  const [updated] = await db
    .update(automations)
    .set(set)
    .where(eq(automations.id, id))
    .returning();

  await writeAuditLog(db, actor, {
    action: 'automation.update',
    entityType: 'automation',
    entityId: id,
    previousValue: toAutomation(previous) as unknown as Record<string, unknown>,
    newValue: toAutomation(updated) as unknown as Record<string, unknown>,
  });

  return toAutomation(updated);
}

export async function deleteAutomation(
  db: DbClient,
  actor: AutomationServiceActor,
  id: string
): Promise<{ ok: true }> {
  requirePermission(actor, 'board', 'update');
  const [previous] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, id))
    .limit(1);
  if (!previous) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Automation not found.' });
  }
  await db.delete(automations).where(eq(automations.id, id));
  await writeAuditLog(db, actor, {
    action: 'automation.delete',
    entityType: 'automation',
    entityId: id,
    previousValue: toAutomation(previous) as unknown as Record<string, unknown>,
  });
  void hasPermission;
  return { ok: true };
}

// --------------------------------- Engine ---------------------------------

/**
 * Trigger event — what the engine receives when an event-bus subscriber
 * decides "this might match a recipe on board X". The shape carries the
 * domain task (or the originating data needed to find one) so trigger
 * matchers don't each have to re-fetch.
 */
export type AutomationEvent =
  | {
      kind: 'task.updated';
      task: Task;
      previous: Task;
    }
  | {
      kind: 'task.created';
      task: Task;
    }
  | {
      kind: 'task.moved';
      task: Task;
      previous: Task;
    }
  | {
      kind: 'task_update.created';
      task: Task;
      authorId: string;
      mentionedIds: string[];
    }
  // Cron-driven events — `runAutomationsForCron` constructs these for
  // every task that satisfies the time-based predicate, then fans out to
  // matching recipes the same way as event-bus events do.
  | {
      kind: 'cron.due_today';
      task: Task;
    }
  | {
      kind: 'cron.overdue';
      task: Task;
    };

/**
 * Decide whether a trigger matches an incoming event. Pure function — no DB
 * access, no side effects. Each kind handles the comparison its semantics
 * require (e.g. status_changed_to compares previous.status !== task.status
 * AND task.status === param).
 */
export function matchesTrigger(
  trigger: AutomationTrigger,
  event: AutomationEvent
): boolean {
  switch (trigger.kind) {
    case 'status_changed_to':
      if (event.kind !== 'task.updated') return false;
      return (
        event.previous.status !== event.task.status &&
        event.task.status === trigger.statusId
      );

    case 'priority_changed_to':
      if (event.kind !== 'task.updated') return false;
      return (
        event.previous.priority !== event.task.priority &&
        event.task.priority === trigger.priorityId
      );

    case 'person_assigned': {
      if (event.kind !== 'task.updated') return false;
      const prevId = event.previous.assigneeId ?? null;
      const nextId = event.task.assigneeId ?? null;
      // Trigger fires only on a change to a non-null assignee.
      if (prevId === nextId || nextId === null) return false;
      if (trigger.personId === 'anyone') return true;
      return nextId === trigger.personId;
    }

    case 'task_created':
      return event.kind === 'task.created';

    case 'task_moved_to_group':
      if (event.kind !== 'task.moved' && event.kind !== 'task.updated') return false;
      return (
        event.previous.groupId !== event.task.groupId &&
        event.task.groupId === trigger.groupId
      );

    case 'comment_added':
      return event.kind === 'task_update.created';

    case 'mentioned_in_comment':
      return (
        event.kind === 'task_update.created' && event.mentionedIds.length > 0
      );

    case 'due_today':
      return event.kind === 'cron.due_today';

    case 'overdue':
      return event.kind === 'cron.overdue';
  }
}

/**
 * Evaluate AND-conditions against the task the trigger landed on. Empty
 * conditions array = unconditional match. Pure.
 */
export function matchesConditions(
  conditions: AutomationCondition[],
  event: AutomationEvent
): boolean {
  // Pull the canonical task — `task` is the post-mutation state, which
  // is what conditions are evaluated against.
  const task = event.task;
  if (!task) return false;
  for (const c of conditions) {
    switch (c.kind) {
      case 'priority_is':
        if (task.priority !== c.priorityId) return false;
        break;
      case 'status_is':
        if (task.status !== c.statusId) return false;
        break;
      case 'assignee_is':
        if ((task.assigneeId ?? null) !== c.personId) return false;
        break;
      case 'in_group':
        if (task.groupId !== c.groupId) return false;
        break;
      case 'has_tag':
        if (!task.tags.includes(c.tag)) return false;
        break;
    }
  }
  return true;
}

/**
 * Run every enabled recipe on the board against the supplied event. Each
 * matching recipe's actions execute sequentially via runActions. Failures
 * are caught and audited per-recipe so one bad recipe can't block the
 * others.
 *
 * Called from event-bus subscribers in handlers.ts, NOT from inside service
 * mutations — keeps the regular write path independent of automation
 * latency.
 */
export async function runAutomationsForEvent(
  db: DbClient,
  boardId: string,
  event: AutomationEvent,
  actor: { id: string; email: string }
): Promise<void> {
  // Hot path — single covered index lookup.
  const rows = await db
    .select()
    .from(automations)
    .where(and(eq(automations.boardId, boardId), eq(automations.enabled, true)));

  for (const row of rows) {
    const recipe = toAutomation(row);
    if (!matchesTrigger(recipe.trigger, event)) continue;
    if (!matchesConditions(recipe.conditions, event)) continue;

    try {
      await runActions(db, recipe, event, actor);
      // Bump the last-run telemetry on success only — failed runs leave it
      // alone so the UI can still surface "last successful run".
      await db
        .update(automations)
        .set({
          lastRunAt: new Date(),
          runCount: sql`${automations.runCount} + 1`,
        })
        .where(eq(automations.id, recipe.id));
    } catch (err) {
      console.error(
        `[automation:${recipe.id}] action chain failed:`,
        err instanceof Error ? err.message : err
      );
      // Audit the failure so admins can debug from the UI.
      await db
        .insert(
          // Avoid importing auditLogs twice — writeAuditLog already covers it.
          // Keeping the failure record minimal: actor is the user whose
          // action triggered the event, not the recipe author.
          (await import('@projectmgmt/drizzle')).auditLogs
        )
        .values({
          userId: actor.id,
          userRole: 'system',
          action: 'automation.run.failed',
          entityType: 'automation',
          entityId: recipe.id,
          newValue: {
            error: err instanceof Error ? err.message : String(err),
            event: event.kind,
          },
          ipAddress: 'system',
          userAgent: 'automation-engine',
        });
    }
  }
}

// --------------------------------- Cron driver ---------------------------------

/**
 * Convert a raw tasks row into the public Task DTO. Mirrors the converter
 * in services/task.ts — kept private here so the cron driver doesn't have
 * to import a private function from that module.
 */
function rowToTask(row: TaskRow): Task {
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
    tags: ((row.tags as string[] | null) ?? []) as string[],
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

const SYSTEM_ACTOR = {
  // No real user id — runAutomationsForEvent uses this only for the
  // failure-audit row's user_id, and audit_logs has ON DELETE RESTRICT
  // against users so an arbitrary uuid would FK-fail. We pass the
  // recipe's createdBy at the call site below to keep the FK valid.
  id: '',
  email: 'system@projectmgmt',
};

/**
 * Once-a-day pass for cron-driven triggers (`due_today`, `overdue`). Loads
 * every non-archived, non-done task with a due date matching either window
 * and dispatches a synthetic event into the regular engine, so the same
 * matchesTrigger / matchesConditions / runActions path runs for cron and
 * event-bus triggers alike.
 *
 * Dedup strategy: we run this once every 24h (see startAutomationCron in
 * cron.ts). Per-recipe-per-task dedup at sub-day resolution would need a
 * dedicated `automation_runs` table — out of scope for v1.
 */
export async function runCronAutomations(
  db: DbClient
): Promise<{ dueToday: number; overdue: number }> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  // Skip the scan entirely if no automation references either trigger.
  const [hasCronTriggers] = await db
    .select({ id: automations.id })
    .from(automations)
    .where(
      and(
        eq(automations.enabled, true),
        sql`${automations.trigger}->>'kind' IN ('due_today', 'overdue')`
      )
    )
    .limit(1);
  if (!hasCronTriggers) return { dueToday: 0, overdue: 0 };

  const dueTodayRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        isNull(tasks.archivedAt),
        ne(tasks.status, 'done'),
        gte(tasks.dueDate, today),
        lt(tasks.dueDate, tomorrow)
      )
    );
  const overdueRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        isNull(tasks.archivedAt),
        ne(tasks.status, 'done'),
        lt(tasks.dueDate, today)
      )
    );

  for (const row of dueTodayRows) {
    const task = rowToTask(row);
    await runAutomationsForEvent(
      db,
      task.boardId,
      { kind: 'cron.due_today', task },
      // Use the task's createdBy as the audit actor — guaranteed to be a
      // valid user_id, satisfying the audit_logs FK.
      { id: task.createdBy, email: SYSTEM_ACTOR.email }
    );
  }
  for (const row of overdueRows) {
    const task = rowToTask(row);
    await runAutomationsForEvent(
      db,
      task.boardId,
      { kind: 'cron.overdue', task },
      { id: task.createdBy, email: SYSTEM_ACTOR.email }
    );
  }

  return { dueToday: dueTodayRows.length, overdue: overdueRows.length };
}
