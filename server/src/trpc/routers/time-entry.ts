import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  createTimeEntry,
  deleteTimeEntry,
  getActiveTimer,
  listTimeEntriesByBoard,
  listTimeEntriesByTask,
  startTimer,
  stopTimer,
  updateTimeEntry,
} from '../../services/time-entry.js';

const isoDate = z.union([z.string().datetime(), z.date()]);

const startInput = z.object({
  taskId: z.string().uuid(),
  note: z.string().trim().max(500).nullish(),
});

const createInput = z.object({
  taskId: z.string().uuid(),
  startedAt: isoDate,
  endedAt: z.union([isoDate, z.null()]).optional(),
  note: z.string().trim().max(500).nullish(),
  billable: z.boolean().optional(),
});

const updateInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      startedAt: isoDate.optional(),
      endedAt: z.union([isoDate, z.null()]).optional(),
      note: z.string().trim().max(500).nullish(),
      billable: z.boolean().optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'No fields to update'),
});

export const timeEntryRouter = router({
  listByTask: authedDbProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return listTimeEntriesByTask(ctx.db, actor, input.taskId);
    }),

  listByBoard: authedDbProcedure
    .input(
      z.object({
        boardId: z.string().uuid(),
        billableOnly: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return listTimeEntriesByBoard(ctx.db, actor, input.boardId, {
        billableOnly: input.billableOnly,
      });
    }),

  active: authedDbProcedure.query(async ({ ctx }) => {
    const actor = makeActor(ctx.user, ctx);
    return getActiveTimer(ctx.db, actor);
  }),

  start: authedDbProcedure.input(startInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return startTimer(ctx.db, actor, input);
  }),

  stop: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return stopTimer(ctx.db, actor, input.id);
    }),

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return createTimeEntry(ctx.db, actor, input);
  }),

  update: authedDbProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return updateTimeEntry(ctx.db, actor, input.id, input.data);
  }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return deleteTimeEntry(ctx.db, actor, input.id);
    }),
});
