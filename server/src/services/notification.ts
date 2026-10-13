import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { notifications } from '@projectmgmt/drizzle';
import type {
  Notification,
  NotificationEntityType,
  NotificationType,
} from '@projectmgmt/shared';

function toNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    userId: row.userId,
    entityType: row.entityType,
    entityId: row.entityId,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.isRead,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export interface CreateNotificationInput {
  userId: string;
  entityType: NotificationEntityType;
  entityId: string;
  type: NotificationType;
  title: string;
  message: string;
}

export async function createNotifications(
  db: DbClient,
  inputs: CreateNotificationInput[]
): Promise<void> {
  if (inputs.length === 0) return;
  await db.insert(notifications).values(inputs);
}

export async function listForUser(
  db: DbClient,
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {}
): Promise<Notification[]> {
  const limit = opts.limit ?? 50;
  const rows = await db
    .select()
    .from(notifications)
    .where(
      opts.unreadOnly
        ? and(eq(notifications.userId, userId), eq(notifications.isRead, false))
        : eq(notifications.userId, userId)
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map(toNotification);
}

export async function countUnread(
  db: DbClient,
  userId: string
): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  return row?.c ?? 0;
}

export async function markRead(
  db: DbClient,
  userId: string,
  ids: string[]
): Promise<{ count: number }> {
  if (ids.length === 0) return { count: 0 };
  const res = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), inArray(notifications.id, ids))
    )
    .returning({ id: notifications.id });
  return { count: res.length };
}

export async function markAllRead(
  db: DbClient,
  userId: string
): Promise<{ count: number }> {
  const res = await db
    .update(notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), eq(notifications.isRead, false))
    )
    .returning({ id: notifications.id });
  return { count: res.length };
}
