import { and, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  workspaces,
  workspaceMembers,
  boards,
  tasks,
  users,
} from '@projectmgmt/drizzle';

/**
 * Cross-workspace search restricted to the workspaces the caller is a member
 * of. Callers with `workspace:listAll` (Owner / Super Admin, by default)
 * search everywhere. Case-insensitive ILIKE on name/email.
 */

export interface SearchResults {
  workspaces: { id: string; name: string; color: string; icon: string }[];
  boards: { id: string; workspaceId: string; name: string; workspaceName: string }[];
  tasks: {
    id: string;
    boardId: string;
    workspaceId: string;
    name: string;
    status: string;
    boardName: string;
  }[];
  people: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    initials: string;
    color: string;
    avatarUrl: string | null;
  }[];
}

export async function globalSearch(
  db: DbClient,
  opts: { userId: string; seesAllWorkspaces: boolean; query: string; limit?: number }
): Promise<SearchResults> {
  const q = opts.query.trim();
  if (!q) return { workspaces: [], boards: [], tasks: [], people: [] };
  const pattern = `%${q}%`;
  const limit = opts.limit ?? 10;

  // 1. Resolve the set of workspaces the caller can see.
  let accessibleWorkspaceIds: string[] = [];
  if (opts.seesAllWorkspaces) {
    const all = await db.select({ id: workspaces.id }).from(workspaces);
    accessibleWorkspaceIds = all.map((w) => w.id);
  } else {
    const mine = await db
      .select({ id: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, opts.userId));
    accessibleWorkspaceIds = mine.map((r) => r.id);
  }
  if (accessibleWorkspaceIds.length === 0) {
    return { workspaces: [], boards: [], tasks: [], people: [] };
  }

  // 2. Workspaces matching the query.
  const wsRows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      color: workspaces.color,
      icon: workspaces.icon,
    })
    .from(workspaces)
    .where(
      and(
        inArray(workspaces.id, accessibleWorkspaceIds),
        isNull(workspaces.archivedAt),
        ilike(workspaces.name, pattern)
      )
    )
    .limit(limit);

  // 3. Boards (need to join workspace name for display context).
  const boardRows = await db
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      name: boards.name,
      workspaceName: workspaces.name,
    })
    .from(boards)
    .innerJoin(workspaces, eq(workspaces.id, boards.workspaceId))
    .where(
      and(
        inArray(boards.workspaceId, accessibleWorkspaceIds),
        isNull(boards.archivedAt),
        ilike(boards.name, pattern)
      )
    )
    .limit(limit);

  // 4. Tasks.
  const taskRows = await db
    .select({
      id: tasks.id,
      boardId: tasks.boardId,
      workspaceId: boards.workspaceId,
      name: tasks.name,
      status: tasks.status,
      boardName: boards.name,
    })
    .from(tasks)
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .where(
      and(
        inArray(boards.workspaceId, accessibleWorkspaceIds),
        isNull(tasks.archivedAt),
        ilike(tasks.name, pattern)
      )
    )
    .limit(limit);

  // 5. People — restrict to members of the accessible workspaces, and
  // skip tombstoned (soft-deleted) accounts whose email starts with
  // `deleted-…@deleted.local`.
  const peopleRows = await db
    .selectDistinct({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      initials: users.initials,
      color: users.color,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
    .where(
      and(
        inArray(workspaceMembers.workspaceId, accessibleWorkspaceIds),
        sql`${users.email} NOT LIKE 'deleted-%@deleted.local'`,
        or(
          ilike(users.firstName, pattern),
          ilike(users.lastName, pattern),
          ilike(users.email, pattern),
          sql`concat(${users.firstName}, ' ', ${users.lastName}) ILIKE ${pattern}`
        )
      )
    )
    .limit(limit);

  return {
    workspaces: wsRows,
    boards: boardRows,
    tasks: taskRows,
    people: peopleRows,
  };
}
