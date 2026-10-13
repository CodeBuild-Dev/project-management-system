import { eq } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { tasks, notifications, users } from '@projectmgmt/drizzle';
import type { Automation, AutomationAction, Task } from '@projectmgmt/shared';
import { eventBus } from './event-bus.js';
import { sendMail } from './mailer.js';
import type { AutomationEvent } from './automation.js';

/**
 * Action executor — implements each AutomationAction.kind. Designed to:
 *
 *   1. Write directly to the DB rather than calling the regular service
 *      layer, so an automation-originated change doesn't re-trigger
 *      other automations subscribed to the same event. Self-loop
 *      protection without a depth counter.
 *
 *   2. Still emit `notification.created` for actions that create
 *      notifications, so the realtime SSE bridge wakes the recipient's
 *      UI just like a user-driven notification would.
 *
 *   3. Cap the action library to the v1 set (notify_person, change_status).
 *      The other action kinds throw a clear error so the UI can flag
 *      "this recipe references an action that isn't shipped yet" rather
 *      than silently no-op.
 */

interface ActionContext {
  db: DbClient;
  recipe: Automation;
  event: AutomationEvent;
  actor: { id: string; email: string };
}

function eventTask(event: AutomationEvent): Task {
  // Every AutomationEvent variant carries a task — kept for clarity at
  // call sites, in case a non-task variant ever lands.
  return event.task;
}

/**
 * Tiny mustache-style interpolation for email subject + body. Supports a
 * fixed allowlist of variables: {{task.name}}, {{task.status}},
 * {{task.priority}}, {{task.dueDate}}, {{recipe.name}}. Anything else is
 * left literal so a malformed template doesn't blow up an action chain.
 */
function interpolate(
  template: string,
  task: Task,
  recipe: Automation
): string {
  return template.replace(/\{\{\s*([a-z.]+)\s*\}\}/gi, (match, key: string) => {
    switch (key) {
      case 'task.name':
        return task.name;
      case 'task.status':
        return task.status;
      case 'task.priority':
        return task.priority;
      case 'task.dueDate':
        return task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '';
      case 'recipe.name':
        return recipe.name;
      default:
        return match;
    }
  });
}

/**
 * Resolve a `personId | 'assignee'` literal against the event's task.
 * Returns null if the special 'assignee' is requested but the task is
 * unassigned — the caller should treat that as a skip, not a failure.
 */
function resolvePersonId(
  literal: string | 'assignee',
  ctx: ActionContext
): string | null {
  if (literal === 'assignee') {
    const task = eventTask(ctx.event);
    return task?.assigneeId ?? null;
  }
  return literal;
}

async function notifyPersonAction(
  action: Extract<AutomationAction, { kind: 'notify_person' }>,
  ctx: ActionContext
): Promise<void> {
  const recipientId = resolvePersonId(action.personId, ctx);
  if (!recipientId) return; // unassigned + 'assignee' → silent skip
  const task = eventTask(ctx.event);
  if (!task) return;

  await ctx.db.insert(notifications).values({
    userId: recipientId,
    entityType: 'task',
    entityId: task.id,
    type: 'system',
    title: `Automation: ${ctx.recipe.name}`,
    message: `"${task.name}"`,
  });

  // Wake the recipient's SSE channel so the bell flips immediately.
  eventBus.emit('notification.created', {
    userId: recipientId,
    entityId: task.id,
    type: 'system',
  });
}

async function changeStatusAction(
  action: Extract<AutomationAction, { kind: 'change_status' }>,
  ctx: ActionContext
): Promise<void> {
  const task = eventTask(ctx.event);
  if (task.status === action.statusId) return;
  await ctx.db
    .update(tasks)
    .set({ status: action.statusId, updatedAt: new Date() })
    .where(eq(tasks.id, task.id));
}

async function assignToAction(
  action: Extract<AutomationAction, { kind: 'assign_to' }>,
  ctx: ActionContext
): Promise<void> {
  const task = eventTask(ctx.event);
  if (task.assigneeId === action.personId) return;
  await ctx.db
    .update(tasks)
    .set({ assigneeId: action.personId, updatedAt: new Date() })
    .where(eq(tasks.id, task.id));
}

async function moveToGroupAction(
  action: Extract<AutomationAction, { kind: 'move_to_group' }>,
  ctx: ActionContext
): Promise<void> {
  const task = eventTask(ctx.event);
  if (task.groupId === action.groupId) return;
  await ctx.db
    .update(tasks)
    .set({ groupId: action.groupId, updatedAt: new Date() })
    .where(eq(tasks.id, task.id));
}

async function addTagAction(
  action: Extract<AutomationAction, { kind: 'add_tag' }>,
  ctx: ActionContext
): Promise<void> {
  const task = eventTask(ctx.event);
  // Read-modify-write — needs the existing array to dedupe. jsonb || would
  // produce duplicates and we'd rather pay one extra round-trip than
  // store dirty data.
  const tag = action.tag.trim();
  if (!tag) return;
  const current = task.tags ?? [];
  if (current.includes(tag)) return;
  await ctx.db
    .update(tasks)
    .set({ tags: [...current, tag], updatedAt: new Date() })
    .where(eq(tasks.id, task.id));
}

async function sendEmailAction(
  action: Extract<AutomationAction, { kind: 'send_email' }>,
  ctx: ActionContext
): Promise<void> {
  const task = eventTask(ctx.event);

  // Resolve the recipient address. 'assignee' looks up the assigned
  // user's email; a literal string is treated as an email address.
  let to: string | null = null;
  if (action.to === 'assignee') {
    if (!task.assigneeId) return; // unassigned + 'assignee' → silent skip
    const [u] = await ctx.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, task.assigneeId))
      .limit(1);
    to = u?.email ?? null;
  } else {
    to = action.to;
  }
  if (!to) return;

  const subject = interpolate(action.subject, task, ctx.recipe);
  const body = interpolate(action.body, task, ctx.recipe);
  await sendMail({
    to,
    subject,
    text: body,
    // Keep the HTML body to a minimal wrapper so admin-authored copy
    // doesn't accidentally render as raw text.
    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">${body
      .split('\n')
      .map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`)
      .join('')}</div>`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Run every action in the recipe sequentially. Stops on the first error
 * — the AutomationService's caller catches and audits the failure.
 */
export async function runActions(
  db: DbClient,
  recipe: Automation,
  event: AutomationEvent,
  actor: { id: string; email: string }
): Promise<void> {
  const ctx: ActionContext = { db, recipe, event, actor };
  for (const action of recipe.actions) {
    switch (action.kind) {
      case 'notify_person':
        await notifyPersonAction(action, ctx);
        break;
      case 'change_status':
        await changeStatusAction(action, ctx);
        break;
      case 'assign_to':
        await assignToAction(action, ctx);
        break;
      case 'move_to_group':
        await moveToGroupAction(action, ctx);
        break;
      case 'add_tag':
        await addTagAction(action, ctx);
        break;
      case 'send_email':
        await sendEmailAction(action, ctx);
        break;
    }
  }
}
