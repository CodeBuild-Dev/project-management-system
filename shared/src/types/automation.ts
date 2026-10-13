/**
 * Automation recipe DSL. Each board can have any number of recipes that
 * follow the shape:
 *
 *   when {trigger}
 *   if {condition_1} and {condition_2} and …
 *   then {action_1}, {action_2}, …
 *
 * Triggers, conditions, and actions are tagged unions keyed by `kind` so
 * the runtime evaluator + UI builder can fan out cleanly. New kinds get
 * added by extending the union here and implementing them in the
 * AutomationService — no schema migration required, since the rows are
 * stored as jsonb.
 */

// --------------------------------- Triggers ---------------------------------

/**
 * Triggers fire on a single domain event. The runtime supplies the event
 * payload; the trigger params filter which payloads cause a recipe to match.
 *
 * v1 ships with `status_changed_to`. The remaining shapes are reserved so
 * the recipe builder UI can render the full library without needing a
 * type-extending follow-up commit later.
 */
export type AutomationTrigger =
  | { kind: 'status_changed_to'; statusId: string }
  | { kind: 'priority_changed_to'; priorityId: string }
  | { kind: 'person_assigned'; personId: string | 'anyone' }
  | { kind: 'task_created' }
  | { kind: 'task_moved_to_group'; groupId: string }
  | { kind: 'comment_added' }
  | { kind: 'mentioned_in_comment' }
  // Time-based triggers fire from the daily/hourly cron, not from the
  // event bus. The runtime resolves them by scanning every enabled recipe
  // of these kinds during each tick.
  | { kind: 'due_today' }
  | { kind: 'overdue' };

// --------------------------------- Conditions ---------------------------------

/**
 * Conditions are evaluated against the task that the trigger landed on.
 * All conditions on a recipe are ANDed; OR-of-AND can be expressed by
 * splitting into multiple recipes. v1 keeps it strictly AND for clarity.
 */
export type AutomationCondition =
  | { kind: 'priority_is'; priorityId: string }
  | { kind: 'status_is'; statusId: string }
  | { kind: 'assignee_is'; personId: string }
  | { kind: 'in_group'; groupId: string }
  | { kind: 'has_tag'; tag: string };

// --------------------------------- Actions ---------------------------------

/**
 * Actions are the side-effects a matching recipe performs. They run
 * sequentially in the order declared; a failure in one action aborts the
 * remaining actions for that recipe and writes a failure audit entry.
 *
 * `personId` may be the literal string `'assignee'` (resolved against the
 * task's current assignee at run time) — useful for "notify the assignee"
 * recipes that don't bind to a specific user.
 */
export type AutomationAction =
  | { kind: 'notify_person'; personId: string | 'assignee' }
  | { kind: 'change_status'; statusId: string }
  | { kind: 'assign_to'; personId: string }
  | { kind: 'move_to_group'; groupId: string }
  | { kind: 'add_tag'; tag: string }
  | {
      kind: 'send_email';
      to: string | 'assignee';
      subject: string;
      body: string;
    };

// --------------------------------- Recipe ---------------------------------

export interface Automation {
  id: string;
  boardId: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  position: number;
  /** Last successful run, or null if never. */
  lastRunAt: Date | null;
  runCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAutomationInput {
  boardId: string;
  name: string;
  trigger: AutomationTrigger;
  conditions?: AutomationCondition[];
  actions: AutomationAction[];
  enabled?: boolean;
}

export interface UpdateAutomationInput {
  name?: string;
  enabled?: boolean;
  trigger?: AutomationTrigger;
  conditions?: AutomationCondition[];
  actions?: AutomationAction[];
  position?: number;
}

/**
 * Distinct names for the trigger / condition / action kinds. Useful for
 * iterating over the library in the UI builder without hand-listing.
 */
export const TRIGGER_KINDS = [
  'status_changed_to',
  'priority_changed_to',
  'person_assigned',
  'task_created',
  'task_moved_to_group',
  'comment_added',
  'mentioned_in_comment',
  'due_today',
  'overdue',
] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const CONDITION_KINDS = [
  'priority_is',
  'status_is',
  'assignee_is',
  'in_group',
  'has_tag',
] as const;
export type ConditionKind = (typeof CONDITION_KINDS)[number];

export const ACTION_KINDS = [
  'notify_person',
  'change_status',
  'assign_to',
  'move_to_group',
  'add_tag',
  'send_email',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
