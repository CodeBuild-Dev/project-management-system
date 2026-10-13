import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  createBoardCredential,
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


export const boardCredentialRouter = router({

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return createBoardCredential(ctx.db, actor, input);
  }),

});
