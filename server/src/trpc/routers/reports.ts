import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import { getReportsOverview } from '../../services/reports.js';

export const reportsRouter = router({
  overview: authedDbProcedure.query(async ({ ctx }) => {
    const actor = makeActor(ctx.user, ctx);
    return getReportsOverview(ctx.db, actor);
  }),
});
