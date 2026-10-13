import { TRPCError } from '@trpc/server';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  boards,
  clients,
  tasks,
  timeEntries,
  type TimeEntryRow,
} from '@projectmgmt/drizzle';
import type {
  CreateTimeEntryInput,
  StartTimerInput,
  TimeEntry,
  UpdateTimeEntryInput,
} from '@projectmgmt/shared';
import { AUDIT_ACTIONS } from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import { eventBus } from './event-bus.js';
import { requirePermission, type PermissionActor } from './permissions.js';

export interface TimeEntryActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toTimeEntry(row: TimeEntryRow): TimeEntry {
  return {
    id: row.id,
    taskId: row.taskId,
    userId: row.userId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    note: row.note,
    billable: row.billable,
    hourlyRateSnapshot: row.hourlyRateSnapshot,
    currencySnapshot: row.currencySnapshot,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

/**
 * Resolve the effective (rate, currency) for a task by walking task → board
 * → client. Used when starting a timer so the snapshot reflects the live
 * billing context.
 */
async function resolveBillingSnapshot(
  db: DbClient,
  taskId: string
): Promise<{ rateMinor: number; currency: string }> {
  const [row] = await db
    .select({
      hourlyRateOverride: boards.hourlyRateOverride,
      currencyOverride: boards.currencyOverride,
      clientRate: clients.defaultHourlyRate,
      clientCurrency: clients.currency,
    })
    .from(tasks)
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .leftJoin(clients, eq(clients.id, boards.clientId))
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!row) {
    return { rateMinor: 0, currency: 'USD' };
  }

  const rateMinor = row.hourlyRateOverride ?? row.clientRate ?? 0;
  const currency = row.currencyOverride ?? row.clientCurrency ?? 'USD';
  return { rateMinor, currency };
}

export async function listTimeEntriesByTask(
  db: DbClient,
  actor: TimeEntryActor,
  taskId: string
): Promise<TimeEntry[]> {
  requirePermission(actor, 'time_entry', 'read');
  const rows = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.taskId, taskId))
    .orderBy(desc(timeEntries.startedAt));
  return rows.map(toTimeEntry);
}

export async function listTimeEntriesByBoard(
  db: DbClient,
  actor: TimeEntryActor,
  boardId: string,
  opts: { billableOnly?: boolean } = {}
): Promise<TimeEntry[]> {
  requirePermission(actor, 'time_entry', 'read');
  const conditions = [eq(tasks.boardId, boardId)];
  if (opts.billableOnly) conditions.push(eq(timeEntries.billable, true));
  const rows = await db
    .select({ entry: timeEntries })
    .from(timeEntries)
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.startedAt));
  return rows.map((r) => toTimeEntry(r.entry));
}

export async function getActiveTimer(
  db: DbClient,
  actor: TimeEntryActor
): Promise<TimeEntry | null> {
  requirePermission(actor, 'time_entry', 'read');
  const [row] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, actor.id), isNull(timeEntries.endedAt)))
    .orderBy(desc(timeEntries.startedAt))
    .limit(1);
  return row ? toTimeEntry(row) : null;
}

/**
 * Start a fresh timer on a task. If the user already has an open entry,
 * close it at "now" before opening the new one — only one running timer
 * per user at a time.
 */
export async function startTimer(
  db: DbClient,
  actor: TimeEntryActor,
  input: StartTimerInput
): Promise<TimeEntry> {
  requirePermission(actor, 'time_entry', 'create');

  const now = new Date();
  const snapshot = await resolveBillingSnapshot(db, input.taskId);

  const entry = await db.transaction(async (tx) => {
    // Close any other open timer this user has — keeps the active-timer
    // invariant: at most one row per user with ended_at IS NULL.
    await tx
      .update(timeEntries)
      .set({ endedAt: now, updatedAt: now })
      .where(
        and(eq(timeEntries.userId, actor.id), isNull(timeEntries.endedAt))
      );

    const [inserted] = await tx
      .insert(timeEntries)
      .values({
        taskId: input.taskId,
        userId: actor.id,
        startedAt: now,
        endedAt: null,
        note: input.note ?? null,
        billable: true,
        hourlyRateSnapshot: snapshot.rateMinor,
        currencySnapshot: snapshot.currency,
      })
      .returning();
    return inserted;
  });

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.TIME_ENTRY_CREATE,
    entityType: 'time_entry',
    entityId: entry.id,
    newValue: { taskId: entry.taskId, startedAt: entry.startedAt },
  });

  const result = toTimeEntry(entry);
  eventBus.emit('time_entry.created', {
    entry: result,
    actor: { id: actor.id, email: actor.email },
  });
  return result;
}

export async function stopTimer(
  db: DbClient,
  actor: TimeEntryActor,
  entryId: string
): Promise<TimeEntry> {
  requirePermission(actor, 'time_entry', 'update');
  const now = new Date();
  const [previous] = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.id, entryId))
    .limit(1);
  if (!previous) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Time entry not found.' });
  }
  if (previous.endedAt) {
    return toTimeEntry(previous);
  }

  const [updated] = await db
    .update(timeEntries)
    .set({ endedAt: now, updatedAt: now })
    .where(eq(timeEntries.id, entryId))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.TIME_ENTRY_UPDATE,
    entityType: 'time_entry',
    entityId: entryId,
    previousValue: previous as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
  });

  const result = toTimeEntry(updated);
  eventBus.emit('time_entry.updated', {
    entry: result,
    previous: toTimeEntry(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return result;
}

/**
 * Manually log a completed entry (start + end). Used for after-the-fact
 * logging when the user forgot to run a live timer. Snapshot still derived
 * at log time.
 */
export async function createTimeEntry(
  db: DbClient,
  actor: TimeEntryActor,
  input: CreateTimeEntryInput
): Promise<TimeEntry> {
  requirePermission(actor, 'time_entry', 'create');

  const startedAt = toDate(input.startedAt);
  const endedAt =
    input.endedAt === null || input.endedAt === undefined
      ? null
      : toDate(input.endedAt);
  if (endedAt && endedAt < startedAt) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Time entry: end must be after start.',
    });
  }

  const snapshot = await resolveBillingSnapshot(db, input.taskId);

  const [inserted] = await db
    .insert(timeEntries)
    .values({
      taskId: input.taskId,
      userId: actor.id,
      startedAt,
      endedAt,
      note: input.note ?? null,
      billable: input.billable ?? true,
      hourlyRateSnapshot: snapshot.rateMinor,
      currencySnapshot: snapshot.currency,
    })
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.TIME_ENTRY_CREATE,
    entityType: 'time_entry',
    entityId: inserted.id,
    newValue: { taskId: inserted.taskId, startedAt: inserted.startedAt },
  });

  const result = toTimeEntry(inserted);
  eventBus.emit('time_entry.created', {
    entry: result,
    actor: { id: actor.id, email: actor.email },
  });
  return result;
}

export async function updateTimeEntry(
  db: DbClient,
  actor: TimeEntryActor,
  id: string,
  input: UpdateTimeEntryInput
): Promise<TimeEntry> {
  requirePermission(actor, 'time_entry', 'update');
  const [previous] = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.id, id))
    .limit(1);
  if (!previous) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Time entry not found.' });
  }

  const patch: Partial<TimeEntryRow> = { updatedAt: new Date() };
  if (input.startedAt !== undefined) patch.startedAt = toDate(input.startedAt);
  if (input.endedAt !== undefined)
    patch.endedAt = input.endedAt === null ? null : toDate(input.endedAt);
  if (input.note !== undefined) patch.note = input.note;
  if (input.billable !== undefined) patch.billable = input.billable;

  const finalStart = patch.startedAt ?? previous.startedAt;
  const finalEnd =
    patch.endedAt !== undefined ? patch.endedAt : previous.endedAt;
  if (finalEnd && finalEnd < finalStart) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Time entry: end must be after start.',
    });
  }

  const [updated] = await db
    .update(timeEntries)
    .set(patch)
    .where(eq(timeEntries.id, id))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.TIME_ENTRY_UPDATE,
    entityType: 'time_entry',
    entityId: id,
    previousValue: previous as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
  });

  const result = toTimeEntry(updated);
  eventBus.emit('time_entry.updated', {
    entry: result,
    previous: toTimeEntry(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return result;
}

export async function deleteTimeEntry(
  db: DbClient,
  actor: TimeEntryActor,
  id: string
): Promise<{ ok: true }> {
  requirePermission(actor, 'time_entry', 'delete');
  const [previous] = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.id, id))
    .limit(1);
  if (!previous) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Time entry not found.' });
  }

  await db.delete(timeEntries).where(eq(timeEntries.id, id));

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.TIME_ENTRY_DELETE,
    entityType: 'time_entry',
    entityId: id,
    previousValue: previous as unknown as Record<string, unknown>,
  });

  eventBus.emit('time_entry.deleted', {
    entry: toTimeEntry(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return { ok: true };
}

/**
 * Aggregate summary used by the board budget view. SUM happens in Postgres;
 * earned is summed in the app because it depends on a per-row product
 * (minutes × hourlyRateSnapshot ÷ 60). For the row counts we expect, fetching
 * billable rows and summing in JS is faster than a CASE-heavy SQL query.
 */
export async function summarizeBoardTime(
  db: DbClient,
  boardId: string
): Promise<{
  loggedMinutes: number;
  billableMinutes: number;
  earnedAmountMinor: number;
}> {
  const rows = await db
    .select({
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      billable: timeEntries.billable,
      rate: timeEntries.hourlyRateSnapshot,
    })
    .from(timeEntries)
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .where(eq(tasks.boardId, boardId));

  let logged = 0;
  let billable = 0;
  let earned = 0;
  const now = Date.now();
  for (const r of rows) {
    const end = r.endedAt ? r.endedAt.getTime() : now;
    const minutes = Math.max(0, Math.floor((end - r.startedAt.getTime()) / 60_000));
    logged += minutes;
    if (r.billable) {
      billable += minutes;
      earned += Math.round((minutes * r.rate) / 60); // cents
    }
  }
  return { loggedMinutes: logged, billableMinutes: billable, earnedAmountMinor: earned };
}

// Suppress TS unused import warning when sql is not used elsewhere.
void sql;
