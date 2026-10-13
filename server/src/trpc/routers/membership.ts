import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  inviteMember,
  listMembers,
  removeMember,
} from '../../services/membership.js';
import { resolveWorkspace } from '../../services/workspace-scope.js';

export const membershipRouter = router({
  listForWorkspace: authedDbProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await resolveWorkspace(ctx.db, ctx.user, input.workspaceId);
      return listMembers(ctx.db, input.workspaceId);
    }),

  invite: authedDbProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        email: z.string().email(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await resolveWorkspace(ctx.db, ctx.user, input.workspaceId);
      const actor = makeActor(ctx.user, ctx);
      return inviteMember(ctx.db, actor, input);
    }),

  remove: authedDbProcedure
    .input(
      z.object({
        workspaceId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await resolveWorkspace(ctx.db, ctx.user, input.workspaceId);
      const actor = makeActor(ctx.user, ctx);
      return removeMember(ctx.db, actor, input);
    }),
});
