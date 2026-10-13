import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  createExpense,
  deleteExpense,
  listExpensesByBoard,
  updateExpense,
} from '../../services/expense.js';

const isoDate = z.union([z.string().datetime(), z.date()]);
const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'Currency must be a 3-letter ISO 4217 code.');

const createInput = z.object({
  boardId: z.string().uuid(),
  amount: z.number().int().min(0).max(1_000_000_000_000),
  currency: currencyCode.optional(),
  category: z.string().trim().min(1).max(64).optional(),
  incurredAt: isoDate,
  note: z.string().trim().max(2000).nullish(),
  billable: z.boolean().optional(),
  receiptUrl: z.string().url().max(2000).nullish(),
});

const updateInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      amount: z.number().int().min(0).max(1_000_000_000_000).optional(),
      currency: currencyCode.optional(),
      category: z.string().trim().min(1).max(64).optional(),
      incurredAt: isoDate.optional(),
      note: z.string().trim().max(2000).nullish(),
      billable: z.boolean().optional(),
      receiptUrl: z.union([z.string().url().max(2000), z.null()]).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'No fields to update'),
});

export const expenseRouter = router({
  listByBoard: authedDbProcedure
    .input(z.object({ boardId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return listExpensesByBoard(ctx.db, actor, input.boardId);
    }),

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return createExpense(ctx.db, actor, input);
  }),

  update: authedDbProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return updateExpense(ctx.db, actor, input.id, input.data);
  }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return deleteExpense(ctx.db, actor, input.id);
    }),
});
