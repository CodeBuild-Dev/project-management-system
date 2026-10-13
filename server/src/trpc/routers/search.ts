import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import { globalSearch } from '../../services/search.js';
import { hasPermission } from '../../services/permissions.js';

export const searchRouter = router({
  global: authedDbProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(25).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return globalSearch(ctx.db, {
        userId: ctx.user.id,
        seesAllWorkspaces: hasPermission(actor, 'workspace', 'listAll'),
        query: input.query,
        limit: input.limit,
      });
    }),
});
