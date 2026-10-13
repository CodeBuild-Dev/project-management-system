import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  listBoards,
  getBoard,
  createBoard,
  updateBoard,
  deleteBoard,
  reorderBoards,
  updateBudget,
  getBoardBudgetSummary,
} from '../../services/board.js';
import { resolveWorkspace } from '../../services/workspace-scope.js';
import { visibilityEnum } from './shared.js';

const billingTypeEnum = z.enum(['non_billable', 'hourly', 'fixed']);
const projectStatusEnum = z.enum(['proposal', 'active', 'invoiced', 'paid']);
const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'Currency must be a 3-letter ISO 4217 code.');

const budgetInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      billingType: billingTypeEnum.optional(),
      fixedPrice: z.number().int().min(0).max(1_000_000_000_000).optional(),
      hourlyRateOverride: z
        .union([z.number().int().min(0).max(1_000_000_000), z.null()])
        .optional(),
      budgetMinutes: z
        .union([z.number().int().min(0).max(10_000_000), z.null()])
        .optional(),
      budgetAmount: z
        .union([z.number().int().min(0).max(1_000_000_000_000), z.null()])
        .optional(),
      projectStatus: projectStatusEnum.optional(),
      currencyOverride: z.union([currencyCode, z.null()]).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'No fields to update'),
});

const optionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(64),
  color: z.string().trim().min(1).max(64),
});

const columnSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(120),
  type: z.enum([
    'person',
    'status',
    'priority',
    'dueDate',
    'timeline',
    'tags',
    'progress',
    'text',
    'number',
    'date',
    'checkbox',
    'rating',
  ]),
  width: z.number().int().positive().optional(),
  /** Per-board options for status / priority columns. */
  options: z.array(optionSchema).max(20).optional(),
});

const moneyCents = z.number().int().min(0).max(1_000_000_000);

const createInput = z.object({
  workspaceId: z.string().uuid(),
  clientId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  visibility: visibilityEnum.optional(),
  columnsConfig: z.array(columnSchema).max(50).optional(),
  deadline: z.string().datetime().nullish(),
  billingType: billingTypeEnum.optional(),
  projectStatus: projectStatusEnum.optional(),
  fixedPrice: moneyCents.optional(),
  hourlyRateOverride: moneyCents.nullish(),
  budgetAmount: moneyCents.nullish(),
  budgetMinutes: z.number().int().min(0).nullish(),
  currencyOverride: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, 'Currency must be a 3-letter ISO code.')
    .nullish(),
});

const updateInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      clientId: z.union([z.string().uuid(), z.null()]).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      description: z.string().max(2000).optional(),
      favorite: z.boolean().optional(),
      position: z.number().int().min(0).optional(),
      visibility: visibilityEnum.optional(),
      columnsConfig: z.array(columnSchema).max(50).optional(),
      deadline: z.union([z.string().datetime(), z.null()]).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'No fields to update'),
});

export const boardRouter = router({
  listByWorkspace: authedDbProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { workspaceId } = await resolveWorkspace(
        ctx.db,
        ctx.user,
        input.workspaceId
      );
      const actor = makeActor(ctx.user, ctx);
      return listBoards(ctx.db, actor, workspaceId);
    }),

  getById: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return getBoard(ctx.db, actor, input.id);
    }),

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    await resolveWorkspace(ctx.db, ctx.user, input.workspaceId);
    const actor = makeActor(ctx.user, ctx);
    return createBoard(ctx.db, actor, input);
  }),

  update: authedDbProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const board = await getBoard(ctx.db, makeActor(ctx.user, ctx), input.id);
    await resolveWorkspace(ctx.db, ctx.user, board.workspaceId);
    const actor = makeActor(ctx.user, ctx);
    return updateBoard(ctx.db, actor, input.id, input.data);
  }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const board = await getBoard(ctx.db, makeActor(ctx.user, ctx), input.id);
      await resolveWorkspace(ctx.db, ctx.user, board.workspaceId);
      const actor = makeActor(ctx.user, ctx);
      return deleteBoard(ctx.db, actor, input.id);
    }),

  reorder: authedDbProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        orderedIds: z.array(z.string().uuid()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await resolveWorkspace(ctx.db, ctx.user, input.workspaceId);
      const actor = makeActor(ctx.user, ctx);
      return reorderBoards(ctx.db, actor, input.workspaceId, input.orderedIds);
    }),

  updateBudget: authedDbProcedure
    .input(budgetInput)
    .mutation(async ({ ctx, input }) => {
      const board = await getBoard(ctx.db, makeActor(ctx.user, ctx), input.id);
      await resolveWorkspace(ctx.db, ctx.user, board.workspaceId);
      const actor = makeActor(ctx.user, ctx);
      return updateBudget(ctx.db, actor, input.id, input.data);
    }),

  getBudgetSummary: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return getBoardBudgetSummary(ctx.db, actor, input.id);
    }),
});
