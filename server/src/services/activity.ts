import { desc, eq } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { activities } from '@projectmgmt/drizzle';
import type { Activity, ActivityType } from '@projectmgmt/shared';
import { eventBus } from './event-bus.js';

function toActivity(row: typeof activities.$inferSelect): Activity {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    boardId: row.boardId,
    taskId: row.taskId,
    type: row.type,
    field: row.field,
    fromValue: row.fromValue,
    toValue: row.toValue,
    summary: row.summary,
    performedAt: row.performedAt,
    performedBy: row.performedBy,
  };
}

export interface RecordActivityInput {
  workspaceId: string;
  boardId?: string | null;
  taskId?: string | null;
  type: ActivityType;
  field?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  summary: string;
  performedBy: string | null;
}

export async function recordActivity(
  db: DbClient,
  input: RecordActivityInput
): Promise<Activity> {
  const [row] = await db
    .insert(activities)
    .values({
      workspaceId: input.workspaceId,
      boardId: input.boardId ?? null,
      taskId: input.taskId ?? null,
      type: input.type,
      field: input.field ?? null,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      summary: input.summary,
      performedBy: input.performedBy,
    })
    .returning();
  const activity = toActivity(row);
  eventBus.emit('activity.recorded', { activity });
  return activity;
}

export async function listActivitiesForTask(
  db: DbClient,
  taskId: string,
  limit = 50
): Promise<Activity[]> {
  const rows = await db
    .select()
    .from(activities)
    .where(eq(activities.taskId, taskId))
    .orderBy(desc(activities.performedAt))
    .limit(limit);
  return rows.map(toActivity);
}
