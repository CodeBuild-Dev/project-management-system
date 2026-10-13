import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { TrpcContext } from './context.js';

const isProd = process.env.NODE_ENV === 'production';

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  /**
   * In prod, never leak internal error messages or stack traces to the
   * client. Only known, user-safe codes carry their message through;
   * everything else is collapsed to a generic line. The full error is
   * still logged server-side via onError in index.ts.
   */
  errorFormatter({ shape, error }) {
    if (!isProd) return shape;
    const safeCodes = new Set([
      'BAD_REQUEST',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'TOO_MANY_REQUESTS',
      'PARSE_ERROR',
    ]);
    if (safeCodes.has(error.code)) return shape;
    return {
      ...shape,
      message: 'Something went wrong. Please try again.',
      data: { ...shape.data, stack: undefined, message: undefined },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Requires an authenticated user. Procedures using this can rely on
 * `ctx.user` being non-null and `ctx.db` typically existing.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Sign in to continue.',
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Requires a live DB connection. Fails loudly if DATABASE_URL isn't set.
 */
export const dbProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.db) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database not configured. Set DATABASE_URL on the server.',
    });
  }
  return next({ ctx: { ...ctx, db: ctx.db } });
});
