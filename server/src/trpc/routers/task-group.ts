import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { boards, taskGroups } from '@projectmgmt/drizzle';
import { TRPCError } from '@trpc/server';
import type { DbClient } from '@projectmgmt/drizzle';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
} from '../../services/task-group.js';
import { resolveWorkspace } from '../../services/workspace-scope.js';

async function workspaceIdForBoard(db: DbClient, boardId: string) {
  const [row] = await db
    .select({ workspaceId: boards.workspaceId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board not found.' });
  return row.workspaceId;
}

async function workspaceIdForGroup(db: DbClient, groupId: string) {
  const [row] = await db
    .select({ boardId: taskGroups.boardId })
    .from(taskGroups)
    .where(eq(taskGroups.id, groupId))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found.' });
  return workspaceIdForBoard(db, row.boardId);
}

const createInput = z.object({
  boardId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  color: z.string().min(1).max(32),
});

const updateInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      color: z.string().min(1).max(32).optional(),
      position: z.number().int().min(0).optional(),
      collapsed: z.boolean().optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'No fields to update'),
});

export const taskGroupRouter = router({
  listByBoard: authedDbProcedure
    .input(z.object({ boardId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const wsId = await workspaceIdForBoard(ctx.db, input.boardId);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      const actor = makeActor(ctx.user, ctx);
      return listGroups(ctx.db, actor, input.boardId);
    }),

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const wsId = await workspaceIdForBoard(ctx.db, input.boardId);
    await resolveWorkspace(ctx.db, ctx.user, wsId);
    const actor = makeActor(ctx.user, ctx);
    return createGroup(ctx.db, actor, input);
  }),

  update: authedDbProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const wsId = await workspaceIdForGroup(ctx.db, input.id);
    await resolveWorkspace(ctx.db, ctx.user, wsId);
    const actor = makeActor(ctx.user, ctx);
    return updateGroup(ctx.db, actor, input.id, input.data);
  }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await workspaceIdForGroup(ctx.db, input.id);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      const actor = makeActor(ctx.user, ctx);
      return deleteGroup(ctx.db, actor, input.id);
    }),

  reorder: authedDbProcedure
    .input(
      z.object({
        boardId: z.string().uuid(),
        orderedIds: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wsId = await workspaceIdForBoard(ctx.db, input.boardId);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      const actor = makeActor(ctx.user, ctx);
      return reorderGroups(ctx.db, actor, input.boardId, input.orderedIds);
    }),
});
