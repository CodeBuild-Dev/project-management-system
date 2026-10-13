import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  createTaskUpdate,
  deleteTaskUpdate,
  listForTask,
  updateTaskUpdate,
} from '../../services/task-update.js';
import { resolveWorkspace } from '../../services/workspace-scope.js';
import { eq } from 'drizzle-orm';
import { boards, tasks } from '@projectmgmt/drizzle';
import type { DbClient } from '@projectmgmt/drizzle';
import { TRPCError } from '@trpc/server';

async function workspaceIdForTask(db: DbClient, taskId: string) {
  const [t] = await db.select({ boardId: tasks.boardId }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!t) throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found.' });
  const [b] = await db
    .select({ workspaceId: boards.workspaceId })
    .from(boards)
    .where(eq(boards.id, t.boardId))
    .limit(1);
  if (!b) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board not found.' });
  return b.workspaceId;
}

export const taskUpdateRouter = router({
  listForTask: authedDbProcedure
    .input(
      z.object({
        taskId: z.string().uuid(),
        order: z.enum(['asc', 'desc']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const wsId = await workspaceIdForTask(ctx.db, input.taskId);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      const actor = makeActor(ctx.user, ctx);
      return listForTask(ctx.db, actor, input.taskId, input.order ?? 'asc');
    }),

  create: authedDbProcedure
    .input(
      z
        .object({
          taskId: z.string().uuid(),
          content: z.string().trim().max(10_000).default(''),
          mentions: z.array(z.string().uuid()).optional(),
          attachments: z
            .array(
              z.object({
                id: z.string(),
                name: z.string(),
                mimeType: z.string(),
                size: z.number().int().nonnegative(),
                url: z.string(),
              })
            )
            .optional(),
        })
        .refine(
          (v) => v.content.length > 0 || (v.attachments?.length ?? 0) > 0,
          { message: 'Comment must have text or at least one attachment.' }
        )
    )
    .mutation(async ({ ctx, input }) => {
      const wsId = await workspaceIdForTask(ctx.db, input.taskId);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      const actor = makeActor(ctx.user, ctx);
      return createTaskUpdate(ctx.db, actor, input);
    }),

  update: authedDbProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        content: z.string().trim().min(1).max(10_000),
        mentions: z.array(z.string().uuid()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return updateTaskUpdate(ctx.db, actor, input);
    }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return deleteTaskUpdate(ctx.db, actor, input.id);
    }),
});
