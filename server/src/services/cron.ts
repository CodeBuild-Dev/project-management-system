import { and, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { tasks, notifications } from '@projectmgmt/drizzle';
import { eventBus } from './event-bus.js';
import { runCronAutomations } from './automation.js';

/**
 * Periodic notification jobs. Run in-process — single Railway replica
 * means we don't need an external scheduler. Each job is idempotent: a
 * NOT EXISTS sub-select against `notifications` blocks duplicate inserts
 * if the job fires twice (cold-start, manual restart, etc.).
 *
 * Schedule:
 *   - due-soon: every hour. Catches tasks whose dueDate falls within the
 *     next 24h, not done, not archived, with an assignee.
 *   - overdue:  every hour. Catches tasks whose dueDate is in the past,
 *     same filters.
 *
 * On boot we kick a single immediate run so a freshly-started container
 * doesn't wait an hour to send its first notification.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface DueRow {
  id: string;
  name: string;
  assigneeId: string;
  dueDate: Date;
}

async function findCandidates(
  db: DbClient,
  type: 'due_soon' | 'overdue'
): Promise<DueRow[]> {
  const now = new Date();
  const horizon = new Date(now.getTime() + DAY_MS);
  const dueDateFilter =
    type === 'due_soon'
      ? and(gt(tasks.dueDate, now), lt(tasks.dueDate, horizon))
      : lt(tasks.dueDate, now);

  const rows = await db
    .select({
      id: tasks.id,
      name: tasks.name,
      assigneeId: tasks.assigneeId,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .where(
      and(
        isNull(tasks.archivedAt),
        ne(tasks.status, 'done'),
        dueDateFilter,
        sql`${tasks.assigneeId} IS NOT NULL`,
        // Dedup at the SQL layer — never insert the same (user, task, type)
        // notification twice. Cheaper than a SELECT+filter+INSERT round-trip.
        sql`NOT EXISTS (SELECT 1 FROM ${notifications} WHERE
              ${notifications.userId} = ${tasks.assigneeId}
              AND ${notifications.entityId} = ${tasks.id}::text
              AND ${notifications.type} = ${type})`
      )
    );
  return rows.filter(
    (r): r is DueRow => !!r.assigneeId && !!r.dueDate
  );
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function runJob(
  db: DbClient,
  type: 'due_soon' | 'overdue'
): Promise<number> {
  const rows = await findCandidates(db, type);
  if (rows.length === 0) return 0;
  const now = formatDay(new Date());
  await db.insert(notifications).values(
    rows.map((r) => ({
      userId: r.assigneeId,
      entityType: 'task' as const,
      entityId: r.id,
      type,
      title: type === 'due_soon' ? 'Task due soon' : 'Task overdue',
      message:
        type === 'due_soon'
          ? `"${r.name}" is due ${formatDay(r.dueDate)}`
          : `"${r.name}" was due ${formatDay(r.dueDate)}`,
    }))
  );
  // Refresh each affected user's bell over SSE without making cron know
  // about the realtime bridge — the bridge listens to 'notification.created'.
  for (const r of rows) {
    eventBus.emit('notification.created', {
      userId: r.assigneeId,
      entityId: r.id,
      type,
    });
  }
  void now;
  return rows.length;
}

async function tick(db: DbClient) {
  try {
    const due = await runJob(db, 'due_soon');
    const overdue = await runJob(db, 'overdue');
    if (due > 0 || overdue > 0) {
      console.log(`[cron] notifications: due_soon=${due} overdue=${overdue}`);
    }
  } catch (err) {
    console.error('[cron] tick failed:', err);
  }
}

let timer: NodeJS.Timeout | null = null;
let automationTimer: NodeJS.Timeout | null = null;

/**
 * Daily pass for time-based automation triggers (due_today, overdue).
 * Separate from the hourly notification cron because:
 *   - notification cron has SQL-level dedup against the notifications
 *     table; automation actions don't (a `change_status` action would
 *     fire 24x/day if the cron ran hourly).
 *   - daily granularity is fine for "task is overdue" — sub-day cadence
 *     would just produce noise.
 *
 * Per-recipe-per-task dedup at sub-day resolution is left for a follow-up
 * sprint with a dedicated `automation_runs` table.
 */
async function automationTick(db: DbClient) {
  try {
    const result = await runCronAutomations(db);
    if (result.dueToday > 0 || result.overdue > 0) {
      console.log(
        `[cron] automations evaluated: due_today=${result.dueToday} overdue=${result.overdue}`
      );
    }
  } catch (err) {
    console.error('[cron] automation tick failed:', err);
  }
}

export function startNotificationCron(db: DbClient): void {
  if (timer) return; // idempotent
  // Kick once on boot so a freshly-started container doesn't wait an hour.
  // Defer slightly so it doesn't block the main listen() callback.
  setTimeout(() => void tick(db), 5_000);
  timer = setInterval(() => void tick(db), HOUR_MS);

  // Automation pass runs less often (every 24h) — see automationTick comment.
  setTimeout(() => void automationTick(db), 10_000);
  automationTimer = setInterval(() => void automationTick(db), DAY_MS);
}

export function stopNotificationCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (automationTimer) {
    clearInterval(automationTimer);
    automationTimer = null;
  }
}
