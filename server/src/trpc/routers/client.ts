import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  createClient,
  deleteClient,
  listClients,
  updateClient,
} from '../../services/client.js';

const clientStatusEnum = z.enum(['prospect', 'active', 'archived']);
const pricingModelEnum = z.enum(['hourly', 'fixed']);
const sourceEnum = z.enum([
  'fiverr',
  'upwork',
  'linkedin',
  'direct',
  'referral',
  'other',
]);
const currencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'Currency must be a 3-letter ISO 4217 code.');
// Stored as integer minor units (cents). Cap at 1e9 to keep ints reasonable.
const hourlyRate = z.number().int().min(0).max(1_000_000_000);

const createInput = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).nullish(),
  email: z.string().trim().email().max(255).nullish(),
  phone: z.string().trim().max(32).nullish(),
  country: z.string().trim().max(64).nullish(),
  notes: z.string().trim().max(5000).nullish(),
  status: clientStatusEnum.optional(),
  currency: currencyCode.optional(),
  defaultHourlyRate: hourlyRate.optional(),
  defaultPricingModel: pricingModelEnum.optional(),
  source: sourceEnum.optional(),
  color: z.string().min(1).max(32).optional(),
  avatarUrl: z.string().url().max(2000).nullish(),
});

const updateInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      company: z.string().trim().max(120).nullish(),
      email: z.union([z.string().trim().email().max(255), z.null()]).optional(),
      phone: z.string().trim().max(32).nullish(),
      country: z.string().trim().max(64).nullish(),
      notes: z.string().trim().max(5000).nullish(),
      status: clientStatusEnum.optional(),
      currency: currencyCode.optional(),
      defaultHourlyRate: hourlyRate.optional(),
      defaultPricingModel: pricingModelEnum.optional(),
      source: sourceEnum.optional(),
      color: z.string().min(1).max(32).optional(),
      avatarUrl: z.union([z.string().url().max(2000), z.null()]).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'No fields to update'),
});

export const clientRouter = router({
  list: authedDbProcedure
    .input(
      z
        .object({
          includeArchived: z.boolean().optional(),
          status: clientStatusEnum.optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return listClients(ctx.db, actor, input ?? {});
    }),

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return createClient(ctx.db, actor, input);
  }),

  update: authedDbProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return updateClient(ctx.db, actor, input.id, input.data);
  }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return deleteClient(ctx.db, actor, input.id);
    }),
});
