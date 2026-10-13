import { z } from 'zod';
import { router } from '../trpc.js';
import { authedDbProcedure } from '../procedures.js';
import { makeActor } from '../actor.js';
import {
  listAutomationsByBoard,
  createAutomation,
  updateAutomation,
  deleteAutomation,
} from '../../services/automation.js';

// --------------------------------- DSL schemas ---------------------------------
//
// These mirror the discriminated unions in shared/types/automation.ts. zod
// validates every recipe at the API boundary so a malformed body can never
// reach the runtime evaluator.

const triggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('status_changed_to'), statusId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('priority_changed_to'), priorityId: z.string().min(1).max(64) }),
  z.object({
    kind: z.literal('person_assigned'),
    personId: z.union([z.string().uuid(), z.literal('anyone')]),
  }),
  z.object({ kind: z.literal('task_created') }),
  z.object({ kind: z.literal('task_moved_to_group'), groupId: z.string().uuid() }),
  z.object({ kind: z.literal('comment_added') }),
  z.object({ kind: z.literal('mentioned_in_comment') }),
  z.object({ kind: z.literal('due_today') }),
  z.object({ kind: z.literal('overdue') }),
]);

const conditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('priority_is'), priorityId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('status_is'), statusId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('assignee_is'), personId: z.string().uuid() }),
  z.object({ kind: z.literal('in_group'), groupId: z.string().uuid() }),
  z.object({ kind: z.literal('has_tag'), tag: z.string().min(1).max(64) }),
]);

const actionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('notify_person'),
    personId: z.union([z.string().uuid(), z.literal('assignee')]),
  }),
  z.object({ kind: z.literal('change_status'), statusId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('assign_to'), personId: z.string().uuid() }),
  z.object({ kind: z.literal('move_to_group'), groupId: z.string().uuid() }),
  z.object({ kind: z.literal('add_tag'), tag: z.string().min(1).max(64) }),
  z.object({
    kind: z.literal('send_email'),
    to: z.union([z.string().email(), z.literal('assignee')]),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(4000),
  }),
]);

const createInput = z.object({
  boardId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(20).optional(),
  actions: z.array(actionSchema).min(1).max(10),
  enabled: z.boolean().optional(),
});

const updateInput = z.object({
  id: z.string().uuid(),
  data: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      enabled: z.boolean().optional(),
      trigger: triggerSchema.optional(),
      conditions: z.array(conditionSchema).max(20).optional(),
      actions: z.array(actionSchema).min(1).max(10).optional(),
      position: z.number().int().min(0).optional(),
    })
    .strict(),
});

// --------------------------------- Router ---------------------------------

export const automationRouter = router({
  listByBoard: authedDbProcedure
    .input(z.object({ boardId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return listAutomationsByBoard(
        ctx.db,
        makeActor(ctx.user, ctx),
        input.boardId
      );
    }),

  create: authedDbProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    return createAutomation(ctx.db, makeActor(ctx.user, ctx), input);
  }),

  update: authedDbProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    return updateAutomation(
      ctx.db,
      makeActor(ctx.user, ctx),
      input.id,
      input.data
    );
  }),

  delete: authedDbProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return deleteAutomation(ctx.db, makeActor(ctx.user, ctx), input.id);
    }),

  /** Enable/disable shortcut — used by the row-level toggle in the UI. */
  toggle: authedDbProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return updateAutomation(
        ctx.db,
        makeActor(ctx.user, ctx),
        input.id,
        { enabled: input.enabled }
      );
    }),
});
