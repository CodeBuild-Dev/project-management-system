import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  createBoardCredential,
  deleteBoardCredential,
  listBoardCredentials,
  revealBoardCredential,
  updateBoardCredential,
} from '../../services/board-credential.js';

const credentialDraft = z.object({
  label: z.string().trim().min(1).max(120),
  username: z.string().trim().max(255).nullish(),
  url: z.string().url().max(2000).nullish(),
  notes: z.string().trim().max(5000).nullish(),
  password: z.string().min(1).max(2000),
});

const createInput = credentialDraft.extend({
  boardId: z.string().uuid(),
});

const updateInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      label: z.string().trim().min(1).max(120).optional(),
      username: z.string().trim().max(255).nullish(),
      url: z.string().url().max(2000).nullish(),
      notes: z.string().trim().max(5000).nullish(),
      password: z.string().min(1).max(2000).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'No fields to update'),
});

export const boardCredentialRouter = router({
  listByBoard: authedDbProcedure
    .input(z.object({ boardId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return listBoardCredentials(ctx.db, actor, input.boardId);
    }),

  reveal: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return revealBoardCredential(ctx.db, actor, input.id);
    }),

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return createBoardCredential(ctx.db, actor, input);
  }),

  update: authedDbProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return updateBoardCredential(ctx.db, actor, input.id, input.data);
  }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return deleteBoardCredential(ctx.db, actor, input.id);
    }),
});
