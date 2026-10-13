import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { boards, tasks } from '@projectmgmt/drizzle';
import { TRPCError } from '@trpc/server';
import type { DbClient } from '@projectmgmt/drizzle';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { resolveWorkspace } from '../../services/workspace-scope.js';
import {
  listActivitiesForBoard,
  listActivitiesForTask,
  listActivitiesForWorkspace,
} from '../../services/activity.js';

async function workspaceIdForBoard(db: DbClient, boardId: string) {
  const [row] = await db
    .select({ workspaceId: boards.workspaceId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board not found.' });
  return row.workspaceId;
}

async function workspaceIdForTask(db: DbClient, taskId: string) {
  const [row] = await db
    .select({ boardId: tasks.boardId })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found.' });
  return workspaceIdForBoard(db, row.boardId);
}

export const activityRouter = router({
  listForTask: authedDbProcedure
    .input(
      z.object({
        taskId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const wsId = await workspaceIdForTask(ctx.db, input.taskId);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      return listActivitiesForTask(ctx.db, input.taskId, input.limit ?? 50);
    }),

  listForBoard: authedDbProcedure
    .input(
      z.object({
        boardId: z.string().uuid(),
        limit: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const wsId = await workspaceIdForBoard(ctx.db, input.boardId);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      return listActivitiesForBoard(ctx.db, input.boardId, input.limit ?? 100);
    }),

  listForWorkspace: authedDbProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await resolveWorkspace(ctx.db, ctx.user, input.workspaceId);
      return listActivitiesForWorkspace(ctx.db, input.workspaceId, input.limit ?? 100);
    }),
});
