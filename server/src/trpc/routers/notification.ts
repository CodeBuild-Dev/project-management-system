import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import {
  countUnread,
  listForUser,
  markAllRead,
  markRead,
} from '../../services/notification.js';

export const notificationRouter = router({
  list: authedDbProcedure
    .input(
      z
        .object({
          unreadOnly: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return listForUser(ctx.db, ctx.user.id, input ?? {});
    }),

  unreadCount: authedDbProcedure.query(async ({ ctx }) => {
    return countUnread(ctx.db, ctx.user.id);
  }),

  markRead: authedDbProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      return markRead(ctx.db, ctx.user.id, input.ids);
    }),

  markAllRead: authedDbProcedure.mutation(async ({ ctx }) => {
    return markAllRead(ctx.db, ctx.user.id);
  }),
});
