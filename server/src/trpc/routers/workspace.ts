import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  reorderWorkspaces,
  adminListWorkspaces,
} from '../../services/workspace.js';
import { resolveWorkspace } from '../../services/workspace-scope.js';
import { hasPermission } from '../../services/permissions.js';
import { visibilityEnum } from './shared.js';

const createInput = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.string().min(1).max(32),
  icon: z.string().min(1).max(8),
  visibility: visibilityEnum.optional(),
});

const updateInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      color: z.string().min(1).max(32).optional(),
      icon: z.string().min(1).max(8).optional(),
      position: z.number().int().min(0).optional(),
      visibility: visibilityEnum.optional(),
    })
    .refine((d) => Object.keys(d).length > 0, 'No fields to update'),
});

export const workspaceRouter = router({
  list: authedDbProcedure.query(async ({ ctx }) => {
    const actor = makeActor(ctx.user, ctx);
    return listWorkspaces(ctx.db, actor);
  }),

  /** Returns every workspace; gated by `workspace:listAll`. */
  adminList: authedDbProcedure.query(async ({ ctx }) => {
    const actor = makeActor(ctx.user, ctx);
    if (!hasPermission(actor, 'workspace', 'listAll')) return [];
    return adminListWorkspaces(ctx.db);
  }),

  getById: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return getWorkspace(ctx.db, actor, input.id);
    }),

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const actor = makeActor(ctx.user, ctx);
    return createWorkspace(ctx.db, actor, input);
  }),

  update: authedDbProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    await resolveWorkspace(ctx.db, ctx.user, input.id);
    const actor = makeActor(ctx.user, ctx);
    return updateWorkspace(ctx.db, actor, input.id, input.data);
  }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await resolveWorkspace(ctx.db, ctx.user, input.id);
      const actor = makeActor(ctx.user, ctx);
      return deleteWorkspace(ctx.db, actor, input.id);
    }),

  reorder: authedDbProcedure
    .input(z.object({ orderedIds: z.array(z.string().uuid()) }))
    .mutation(async ({ ctx, input }) => {
      const actor = makeActor(ctx.user, ctx);
      return reorderWorkspaces(ctx.db, actor, input.orderedIds);
    }),
});
