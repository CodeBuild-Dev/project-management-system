import { TRPCError } from '@trpc/server';
import type { DbClient } from '@projectmgmt/drizzle';
import { protectedProcedure } from './trpc.js';
import type { ContextUser } from './context.js';

/**
 * Requires both authentication and a configured database. Most domain
 * procedures use this — they all need `ctx.db` and `ctx.user`.
 */
export const authedDbProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.db) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Database not configured.',
    });
  }
  return next({
    ctx: {
      ...ctx,
      db: ctx.db as DbClient,
      user: ctx.user as ContextUser,
    },
  });
});

/**
 * Admin panel gate: allows Owner, Super Admin, and Admin. Fine-grained
 * (resource, action) checks happen inside the service via
 * requirePermission(); this procedure exists so the router can fail fast on
 * Staff users hitting admin-only endpoints.
 */
export const adminDbProcedure = authedDbProcedure.use(({ ctx, next }) => {
  const role = ctx.user.role;
  if (role !== 'owner' && role !== 'super_admin' && role !== 'admin') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Admin panel access requires Owner, Super Admin, or Admin role.',
    });
  }
  return next();
});
