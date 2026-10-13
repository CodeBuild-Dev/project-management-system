import { sql } from 'drizzle-orm';
import { router, publicProcedure } from '../trpc.js';

export const healthRouter = router({
  /** Liveness probe — returns server info regardless of DB state. */
  ping: publicProcedure.query(() => ({
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION ?? '0.0.0',
  })),

  /** Readiness probe — tries a trivial query so orchestrators can gate traffic on DB health. */
  db: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.db) {
      return { status: 'not_configured' as const };
    }
    try {
      await ctx.db.execute(sql`select 1`);
      return { status: 'ok' as const };
    } catch (err) {
      return {
        status: 'error' as const,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }),
});
