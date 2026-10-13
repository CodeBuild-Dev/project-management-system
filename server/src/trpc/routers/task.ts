import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { boards, tasks, taskGroups } from '@projectmgmt/drizzle';
import { TRPCError } from '@trpc/server';
import type { DbClient } from '@projectmgmt/drizzle';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  listTasksByBoard,
  createTask,
  updateTask,
  deleteTask,
  reorderTasksInGroup,
} from '../../services/task.js';
import { resolveWorkspace } from '../../services/workspace-scope.js';
import { nullableDateOptional, optionId } from './shared.js';

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
  groupId: z.string().uuid(),
  name: z.string().trim().min(1).max(500),
  assigneeId: z.string().uuid().optional(),
  status: optionId.optional(),
  priority: optionId.optional(),
  dueDate: z.union([z.string().datetime(), z.date()]).optional().transform((v) =>
    v === undefined ? undefined : v instanceof Date ? v : new Date(v)
  ),
  timelineStart: z.union([z.string().datetime(), z.date()]).optional().transform((v) =>
    v === undefined ? undefined : v instanceof Date ? v : new Date(v)
  ),
  timelineEnd: z.union([z.string().datetime(), z.date()]).optional().transform((v) =>
    v === undefined ? undefined : v instanceof Date ? v : new Date(v)
  ),
  tags: z.array(z.string().min(1).max(64)).optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

const updateInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      name: z.string().trim().min(1).max(500).optional(),
      assigneeId: z.string().uuid().nullable().optional(),
      status: optionId.optional(),
      priority: optionId.optional(),
      dueDate: nullableDateOptional,
      timelineStart: nullableDateOptional,
      timelineEnd: nullableDateOptional,
      tags: z.array(z.string().min(1).max(64)).optional(),
      progress: z.number().int().min(0).max(100).optional(),
      position: z.number().int().min(0).optional(),
      groupId: z.string().uuid().optional(),
      customCells: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'No fields to update'),
});


export const taskRouter = router({
  listByBoard: authedDbProcedure
    .input(z.object({ boardId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const wsId = await workspaceIdForBoard(ctx.db, input.boardId);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      const actor = makeActor(ctx.user, ctx);
      return listTasksByBoard(ctx.db, actor, input.boardId);
    }),

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const wsId = await workspaceIdForBoard(ctx.db, input.boardId);
    await resolveWorkspace(ctx.db, ctx.user, wsId);
    const actor = makeActor(ctx.user, ctx);
    return createTask(ctx.db, actor, input);
  }),

  update: authedDbProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const wsId = await workspaceIdForTask(ctx.db, input.id);
    await resolveWorkspace(ctx.db, ctx.user, wsId);
    const actor = makeActor(ctx.user, ctx);
    return updateTask(ctx.db, actor, input.id, input.data);
  }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const wsId = await workspaceIdForTask(ctx.db, input.id);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      const actor = makeActor(ctx.user, ctx);
      return deleteTask(ctx.db, actor, input.id);
    }),

  reorderInGroup: authedDbProcedure
    .input(
      z.object({
        groupId: z.string().uuid(),
        orderedIds: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const wsId = await workspaceIdForGroup(ctx.db, input.groupId);
      await resolveWorkspace(ctx.db, ctx.user, wsId);
      const actor = makeActor(ctx.user, ctx);
      return reorderTasksInGroup(ctx.db, actor, input.groupId, input.orderedIds);
    }),
});
