import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure, adminDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  adminUpdateUser,
  updateProfile,
} from '../../services/user.js';

/**
 * Cap avatarUrl at ~750 KB. Accepts both http(s) and `data:image/...` URLs
 * (the client resizes uploads to a small JPEG before sending as a data URL).
 */
const avatarUrlSchema = z
  .string()
  .min(1)
  .max(750_000)
  .refine(
    (v) => /^https?:\/\//i.test(v) || /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(v),
    'avatarUrl must be an http(s) or data:image URL'
  );

const updateProfileInput = z
  .object({
    // firstName is the only display-name field that must be non-empty (used
    // for greetings + initials). lastName is freely optional — single-name
    // accounts and mononyms are common.
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    color: z.string().min(1).max(32).optional(),
    avatarUrl: avatarUrlSchema.nullable().optional(),
    jobTitle: z.string().trim().max(120).nullable().optional(),
    workMode: z.enum(['remote', 'on_site', 'hybrid']).nullable().optional(),
    notificationPreferences: z
      .object({
        emailEnabled: z.boolean(),
        pushEnabled: z.boolean(),
        digestFrequency: z.enum(['realtime', 'hourly', 'daily', 'never']),
      })
      .nullable()
      .optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');


export const userRouter = router({

  updateProfile: authedDbProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      return updateProfile(ctx.db, makeActor(ctx.user, ctx), input);
    }),

  /**
   * Edit non-role fields on a target user. Role and permission overrides
   * have their own dedicated procedures so guards (Owner singleton, etc.)
   * stay in one place.
   */
  adminUpdate: adminDbProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: z
          .object({
            firstName: z.string().trim().min(1).max(100).optional(),
            lastName: z.string().trim().max(100).optional(),
            email: z.string().email().optional(),
            color: z.string().min(1).max(32).optional(),
            avatarUrl: z.string().url().nullable().optional(),
            isActive: z.boolean().optional(),
          })
          .refine((d) => Object.keys(d).length > 0, 'Nothing to update'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return adminUpdateUser(ctx.db, makeActor(ctx.user, ctx), input.id, input.data);
    }),

});
