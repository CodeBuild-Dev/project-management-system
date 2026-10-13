import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import {
  listMembers,
} from '../../services/membership.js';
import { resolveWorkspace } from '../../services/workspace-scope.js';

export const membershipRouter = router({
  listForWorkspace: authedDbProcedure
    .input(z.object({ workspaceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await resolveWorkspace(ctx.db, ctx.user, input.workspaceId);
      return listMembers(ctx.db, input.workspaceId);
    }),

});
