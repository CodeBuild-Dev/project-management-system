import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure, adminDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  adminUpdateUser,
  getUser,
  listAllUsers,
  updateProfile,
} from '../../services/user.js';
import {
  changeUserRole,
  deleteUser,
  transferOwnership,
  updatePermissionOverrides,
} from '../../services/user-role.js';
import {
  disableTotp,
  setupTotp,
  verifyAndEnableTotp,
} from '../../services/totp.js';
import { userRoleEnum } from './shared.js';

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

const permissionOverridesInput = z.object({
  grants: z.array(z.string().min(3).max(64)).max(200),
  denies: z.array(z.string().min(3).max(64)).max(200),
});

export const userRouter = router({
  /** Current user's full profile (safe fields). */
  me: authedDbProcedure.query(async ({ ctx }) => {
    return getUser(ctx.db, ctx.user.id);
  }),

  updateProfile: authedDbProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      return updateProfile(ctx.db, makeActor(ctx.user, ctx), input);
    }),

  /** Owner / Super Admin / Admin — paginated user list with optional search. */
  adminList: adminDbProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(120).optional(),
          limit: z.number().int().min(1).max(100).optional(),
          cursor: z.string().datetime().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      return listAllUsers(ctx.db, input ?? {});
    }),

  /** Generate a fresh TOTP secret + otpauth URI for the caller. */
  totpSetup: authedDbProcedure.mutation(async ({ ctx }) => {
    return setupTotp(ctx.db, {
      id: ctx.user.id,
      email: ctx.user.email,
      role: ctx.user.role,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });
  }),

  /** Confirm the pending secret by providing a valid 6-digit code. Enables 2FA. */
  totpVerify: authedDbProcedure
    .input(z.object({ code: z.string().regex(/^\d{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      return verifyAndEnableTotp(
        ctx.db,
        {
          id: ctx.user.id,
          role: ctx.user.role,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
        input.code
      );
    }),

  /** Turn 2FA off — requires a current valid code as proof of possession. */
  totpDisable: authedDbProcedure
    .input(z.object({ code: z.string().regex(/^\d{6}$/) }))
    .mutation(async ({ ctx, input }) => {
      return disableTotp(
        ctx.db,
        {
          id: ctx.user.id,
          role: ctx.user.role,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
        input.code
      );
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

  /** Promote / demote a user. Cannot be used to make someone Owner — use transferOwnership. */
  changeRole: adminDbProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        role: userRoleEnum,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await changeUserRole(ctx.db, makeActor(ctx.user, ctx), input.id, input.role);
      return { ok: true as const };
    }),

  /**
   * Transfer ownership atomically: caller (must be Owner) becomes
   * super_admin, target becomes Owner.
   */
  transferOwnership: adminDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await transferOwnership(ctx.db, makeActor(ctx.user, ctx), input.id);
      return { ok: true as const };
    }),

  /** Replace a user's permission overrides. Owner is locked. */
  updatePermissions: adminDbProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        overrides: permissionOverridesInput,
      })
    )
    .mutation(async ({ ctx, input }) => {
      return updatePermissionOverrides(
        ctx.db,
        makeActor(ctx.user, ctx),
        input.id,
        input.overrides
      );
    }),

  /** Hard-delete a user. Owner is undeletable. */
  delete: adminDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await deleteUser(ctx.db, makeActor(ctx.user, ctx), input.id);
      return { ok: true as const };
    }),
});
