import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Project Management Postgres schema. Mirrors docs/DATA_MODELS.md.
 *
 * Conventions:
 *   - All ids are UUIDs with gen_random_uuid() defaults.
 *   - All writable tables carry created_at and updated_at (default NOW()).
 *   - Enums live in dedicated pgEnum() declarations so they survive schema changes.
 *   - Soft-delete uses `archived_at` (nullable timestamp); never hard-delete by default.
 *   - FK relationships cascade where it's safe (board → tasks), otherwise RESTRICT.
 */

// --------------------------------- Enums ---------------------------------

export const userRoleEnum = pgEnum('user_role', [
  'owner',
  'super_admin',
  'admin',
  'staff',
]);

export const workModeEnum = pgEnum('work_mode', ['remote', 'on_site', 'hybrid']);

export const visibilityEnum = pgEnum('visibility', ['public', 'private']);

// status & priority are stored as plain text — the allowed values come from
// the `options` array on the board's status/priority column (in
// boards.columns_config), so each board can rename or extend them.
export const taskSourceEnum = pgEnum('task_source', ['manual', 'import', 'api']);

export const clientStatusEnum = pgEnum('client_status', [
  'prospect',
  'active',
  'archived',
]);

export const billingTypeEnum = pgEnum('billing_type', [
  'non_billable',
  'hourly',
  'fixed',
]);

export const projectStatusEnum = pgEnum('project_status', [
  'proposal',
  'active',
  'invoiced',
  'paid',
]);

export const activityTypeEnum = pgEnum('activity_type', [
  'task_created',
  'task_updated',
  'task_moved',
  'task_deleted',
  'task_archived',
  'status_changed',
  'assignee_changed',
  'due_date_changed',
  'priority_changed',
  'comment_added',
  'board_created',
  'board_updated',
  'board_deleted',
  'group_created',
  'group_updated',
  'group_deleted',
  'member_added',
  'member_removed',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'assignment',
  'mention',
  'comment_added',
  'due_soon',
  'overdue',
  'status_changed',
  'invited',
  'board_shared',
  'system',
]);

export const notificationEntityTypeEnum = pgEnum('notification_entity_type', [
  'task',
  'board',
  'workspace',
  'task_update',
]);

// --------------------------------- Users ---------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    avatarUrl: text('avatar_url'),
    initials: varchar('initials', { length: 4 }).notNull(),
    color: varchar('color', { length: 32 }).notNull(),
    role: userRoleEnum('role').notNull().default('staff'),
    permissionOverrides: jsonb('permission_overrides')
      .notNull()
      .default(sql`'{"grants":[],"denies":[]}'::jsonb`),
    jobTitle: varchar('job_title', { length: 120 }),
    workMode: workModeEnum('work_mode'),
    primaryWorkspaceId: uuid('primary_workspace_id'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    totpSecret: varchar('totp_secret', { length: 64 }),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    totpVerifiedAt: timestamp('totp_verified_at', { withTimezone: true }),
    backupCodesHash: text('backup_codes_hash'),
    notificationPreferences: jsonb('notification_preferences'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    roleIdx: index('users_role_idx').on(t.role),
    // Admin user list uses `WHERE created_at < $cursor ORDER BY created_at DESC`
    // for cursor pagination.
    createdAtIdx: index('users_created_at_idx').on(t.createdAt),
  })
);

// --------------------------------- Workspaces ---------------------------------

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 120 }).notNull(),
    color: varchar('color', { length: 32 }).notNull(),
    icon: varchar('icon', { length: 8 }).notNull(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
    visibility: visibilityEnum('visibility').notNull().default('public'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    ownerIdx: index('workspaces_owner_idx').on(t.ownerId),
    positionIdx: index('workspaces_position_idx').on(t.position),
  })
);

/**
 * Workspace membership is a pure access list — no per-workspace role.
 * What a member can do inside a workspace is determined by their app-level
 * role + per-user permission overrides on the User record.
 */
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    invitedAt: timestamp('invited_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
    userIdx: index('workspace_members_user_idx').on(t.userId),
    workspaceIdx: index('workspace_members_workspace_idx').on(t.workspaceId),
  })
);

// --------------------------------- Clients ---------------------------------

/**
 * Freelance clients. Lives globally (no workspace_id) — a client can have
 * boards across multiple workspaces. Soft-delete is handled via `status =
 * 'archived'` rather than a separate archivedAt column to keep the workflow
 * state and the visibility flag in one place.
 */
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 120 }).notNull(),
    company: varchar('company', { length: 120 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    country: varchar('country', { length: 64 }),
    /** Where this client came from — Fiverr, Upwork, LinkedIn, direct, referral, or other. */
    source: varchar('source', { length: 32 })
      .notNull()
      .default('direct')
      .$type<'fiverr' | 'upwork' | 'linkedin' | 'direct' | 'referral' | 'other'>(),
    notes: text('notes'),
    status: clientStatusEnum('status').notNull().default('active'),
    /** ISO 4217 code (USD, EUR, GBP, …). Used as the default for budgets/expenses on this client's boards. */
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    /** Default hourly rate in minor units (cents). 0 = unset. Per-board override allowed in Phase D. */
    defaultHourlyRate: integer('default_hourly_rate').notNull().default(0),
    /** Default pricing model for new boards under this client. */
    defaultPricingModel: varchar('default_pricing_model', { length: 16 })
      .notNull()
      .default('hourly')
      .$type<'hourly' | 'fixed'>(),
    color: varchar('color', { length: 32 }).notNull().default('bg-blue-500'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    statusIdx: index('clients_status_idx').on(t.status),
    createdAtIdx: index('clients_created_at_idx').on(t.createdAt),
  })
);

// --------------------------------- Boards & Groups ---------------------------------

export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Optional link to a client. Set null when the board is internal/non-billable. */
    clientId: uuid('client_id').references(() => clients.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description').notNull().default(''),
    favorite: boolean('favorite').notNull().default(false),
    position: integer('position').notNull().default(0),
    visibility: visibilityEnum('visibility').notNull().default('public'),
    /**
     * Per-board column configuration (order + custom columns). Empty array
     * means "use the default built-in column set"; once the user customises
     * it, every column — built-in and custom — is serialised here.
     */
    columnsConfig: jsonb('columns_config').notNull().default(sql`'[]'::jsonb`),
    /** non_billable | hourly | fixed — drives how budget summaries are computed. */
    billingType: billingTypeEnum('billing_type').notNull().default('non_billable'),
    /** Fixed price (cents). Only meaningful when billingType = 'fixed'. */
    fixedPrice: integer('fixed_price').notNull().default(0),
    /** Per-board hourly rate (cents). Null = inherit client.defaultHourlyRate. */
    hourlyRateOverride: integer('hourly_rate_override'),
    /** Optional time budget in minutes; null = no cap. */
    budgetMinutes: integer('budget_minutes'),
    /** Optional money budget in cents; null = no cap. */
    budgetAmount: integer('budget_amount'),
    /** Project lifecycle: proposal → active → invoiced → paid. */
    projectStatus: projectStatusEnum('project_status').notNull().default('active'),
    /** ISO 4217 override. Null = inherit client.currency or 'USD'. */
    currencyOverride: varchar('currency_override', { length: 3 }),
    /** Whole-project delivery date — distinct from per-task due dates. */
    deadline: timestamp('deadline', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    workspaceIdx: index('boards_workspace_idx').on(t.workspaceId),
    positionIdx: index('boards_workspace_position_idx').on(
      t.workspaceId,
      t.position
    ),
    clientIdx: index('boards_client_idx').on(t.clientId),
  })
);

/**
 * Encrypted vault for tool/CRM credentials scoped to a project (board).
 * `secretCiphertext` is the AES-256-GCM ciphertext of the password (utf8),
 * with `secretIv` (12 bytes) and `secretTag` (16 bytes) stored alongside.
 * The encryption key lives in the RESOURCE_VAULT_KEY env var — no plaintext
 * password is ever persisted.
 */
export const boardCredentials = pgTable(
  'board_credentials',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    /** Display name, e.g. "WordPress admin", "Stripe dashboard". */
    label: varchar('label', { length: 120 }).notNull(),
    /** Optional username / email. Stored in clear (not a secret on its own). */
    username: varchar('username', { length: 255 }),
    /** Optional login URL. */
    url: varchar('url', { length: 2000 }),
    /** Free-form notes (clear). */
    notes: text('notes'),
    /** AES-256-GCM ciphertext (base64) of the password. */
    secretCiphertext: text('secret_ciphertext').notNull(),
    /** AES-256-GCM IV (base64). */
    secretIv: varchar('secret_iv', { length: 64 }).notNull(),
    /** AES-256-GCM auth tag (base64). */
    secretTag: varchar('secret_tag', { length: 64 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    boardIdx: index('board_credentials_board_idx').on(t.boardId),
  })
);

export const taskGroups = pgTable(
  'task_groups',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    color: varchar('color', { length: 32 }).notNull(),
    position: integer('position').notNull().default(0),
    collapsed: boolean('collapsed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    boardIdx: index('task_groups_board_idx').on(t.boardId),
    positionIdx: index('task_groups_board_position_idx').on(
      t.boardId,
      t.position
    ),
  })
);

// --------------------------------- Tasks ---------------------------------

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => taskGroups.id, { onDelete: 'cascade' }),
    assigneeId: uuid('assignee_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    status: text('status').notNull().default('not-started'),
    priority: text('priority').notNull().default('medium'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    timelineStart: timestamp('timeline_start', { withTimezone: true }),
    timelineEnd: timestamp('timeline_end', { withTimezone: true }),
    tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
    /** Values for user-defined columns (text/number/date/checkbox/rating), keyed by column id. */
    customCells: jsonb('custom_cells').notNull().default(sql`'{}'::jsonb`),
    progress: integer('progress').notNull().default(0),
    /** Optional time estimate in minutes; null = unestimated. */
    estimatedMinutes: integer('estimated_minutes'),
    position: integer('position').notNull().default(0),
    source: taskSourceEnum('source').notNull().default('manual'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => ({
    boardIdx: index('tasks_board_idx').on(t.boardId),
    groupIdx: index('tasks_group_position_idx').on(t.groupId, t.position),
    assigneeIdx: index('tasks_assignee_idx').on(t.assigneeId),
    dueIdx: index('tasks_due_idx').on(t.dueDate),
  })
);

export const taskUpdates = pgTable(
  'task_updates',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    content: text('content').notNull(),
    mentions: jsonb('mentions').notNull().default(sql`'[]'::jsonb`),
    attachments: jsonb('attachments').notNull().default(sql`'[]'::jsonb`),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    taskIdx: index('task_updates_task_idx').on(t.taskId, t.createdAt),
    authorIdx: index('task_updates_author_idx').on(t.authorId),
  })
);

// --------------------------------- Activity & Audit ---------------------------------

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id').references(() => boards.id, {
      onDelete: 'cascade',
    }),
    taskId: uuid('task_id').references(() => tasks.id, {
      onDelete: 'cascade',
    }),
    type: activityTypeEnum('type').notNull(),
    field: varchar('field', { length: 64 }),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    summary: text('summary').notNull(),
    performedAt: timestamp('performed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    performedBy: uuid('performed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    workspaceIdx: index('activities_workspace_idx').on(
      t.workspaceId,
      t.performedAt
    ),
    taskIdx: index('activities_task_idx').on(t.taskId, t.performedAt),
    // Board-level activity feed: WHERE board_id = ? ORDER BY performed_at DESC.
    boardIdx: index('activities_board_idx').on(t.boardId, t.performedAt),
  })
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    userRole: varchar('user_role', { length: 32 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    entityType: varchar('entity_type', { length: 32 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }).notNull(),
    previousValue: jsonb('previous_value'),
    newValue: jsonb('new_value'),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    ipAddress: varchar('ip_address', { length: 64 }).notNull(),
    userAgent: text('user_agent').notNull(),
    performedAt: timestamp('performed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index('audit_user_idx').on(t.userId, t.performedAt),
    entityIdx: index('audit_entity_idx').on(t.entityType, t.entityId),
    workspaceIdx: index('audit_logs_workspace_idx').on(t.workspaceId),
    performedIdx: index('audit_logs_performed_idx').on(t.performedAt),
  })
);

// --------------------------------- Notifications ---------------------------------

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entityType: notificationEntityTypeEnum('entity_type').notNull(),
    entityId: varchar('entity_id', { length: 64 }).notNull(),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userUnreadIdx: index('notifications_user_unread_idx').on(
      t.userId,
      t.isRead,
      t.createdAt
    ),
    // Cron dedup: NOT EXISTS lookup by (entityId, type, userId) to skip
    // re-emitting a notification we already sent for the same task/event.
    dedupIdx: index('notifications_dedup_idx').on(
      t.entityId,
      t.type,
      t.userId
    ),
  })
);

// --------------------------------- Auth helpers ---------------------------------

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index('password_reset_user_idx').on(t.userId),
    expiresIdx: index('password_reset_expires_idx').on(t.expiresAt),
    // Redemption looks up the row by tokenHash on every reset attempt.
    // Unique because two valid tokens can't share a hash without breaking
    // the redeem-once invariant.
    tokenIdx: uniqueIndex('password_reset_token_idx').on(t.tokenHash),
  })
);

// --------------------------------- Workspace invites ---------------------------------

export const workspaceInvites = pgTable(
  'workspace_invites',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    maxUses: integer('max_uses').notNull().default(100),
    usedCount: integer('used_count').notNull().default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    workspaceIdx: index('workspace_invites_workspace_idx').on(t.workspaceId),
    tokenIdx: uniqueIndex('workspace_invites_token_idx').on(t.tokenHash),
  })
);

// --------------------------------- Automations ---------------------------------

/**
 * Per-board automation recipes. Each row is a "When {trigger} [if {conditions}]
 * then {actions}" rule that the AutomationService evaluates against domain
 * events on the event bus (task.updated, task.created, task_update.created,
 * etc.) and the daily cron (for time-based triggers).
 *
 * The recipe itself lives in jsonb columns rather than a separate normalized
 * trigger/condition/action schema — the shape changes often during the
 * library expansion phase, and a typed DSL on the application side gives us
 * better safety than a flat relational table would.
 */
export const automations = pgTable(
  'automations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** Single trigger object: { kind, params }. */
    trigger: jsonb('trigger').notNull(),
    /** Array of condition objects ANDed together; empty = no conditions. */
    conditions: jsonb('conditions').notNull().default(sql`'[]'::jsonb`),
    /** Array of action objects, executed sequentially. */
    actions: jsonb('actions').notNull().default(sql`'[]'::jsonb`),
    position: integer('position').notNull().default(0),
    /** Set every time the recipe runs (matched + executed without error). */
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    runCount: integer('run_count').notNull().default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Hot path: evaluate-on-event loads `WHERE board_id = ? AND enabled`.
    boardIdx: index('automations_board_idx').on(t.boardId, t.enabled),
  })
);

// --------------------------------- Time tracking ---------------------------------

/**
 * Per-task time entries. `endedAt IS NULL` means the timer is currently
 * running for that user; service code stops any open entry when a new one
 * starts. Duration is *always* derived from startedAt/endedAt — never
 * persisted as a separate column to avoid SSOT drift on edits.
 *
 * `hourlyRateSnapshot` and `currencySnapshot` capture the rate at log time
 * so that historical revenue reports don't shift when the user later raises
 * a client's default rate.
 */
export const timeEntries = pgTable(
  'time_entries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    note: text('note'),
    billable: boolean('billable').notNull().default(true),
    /** Cents per hour at log time. */
    hourlyRateSnapshot: integer('hourly_rate_snapshot').notNull().default(0),
    currencySnapshot: varchar('currency_snapshot', { length: 3 })
      .notNull()
      .default('USD'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Active-timer lookup: WHERE user_id = ? AND ended_at IS NULL
    userActiveIdx: index('time_entries_user_active_idx').on(t.userId, t.endedAt),
    // Task time list: WHERE task_id = ? ORDER BY started_at DESC
    taskIdx: index('time_entries_task_idx').on(t.taskId, t.startedAt),
  })
);

// --------------------------------- Expenses ---------------------------------

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    /** Cents in the entry's currency (no auto-conversion). */
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    /** Free-text category — kept as text rather than enum because categories evolve faster than the schema. */
    category: varchar('category', { length: 64 }).notNull().default('other'),
    incurredAt: timestamp('incurred_at', { withTimezone: true }).notNull(),
    note: text('note'),
    billable: boolean('billable').notNull().default(true),
    receiptUrl: text('receipt_url'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    boardIdx: index('expenses_board_idx').on(t.boardId, t.incurredAt),
  })
);

// --------------------------------- System settings ---------------------------------

export const systemSettings = pgTable(
  'system_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    key: varchar('key', { length: 64 }).notNull(),
    value: text('value').notNull(),
    description: text('description'),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    keyIdx: uniqueIndex('system_settings_key_idx').on(t.key),
  })
);

// --------------------------------- Inferred types ---------------------------------

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type NewWorkspaceRow = typeof workspaces.$inferInsert;
export type BoardRow = typeof boards.$inferSelect;
export type NewBoardRow = typeof boards.$inferInsert;
export type BoardCredentialRow = typeof boardCredentials.$inferSelect;
export type NewBoardCredentialRow = typeof boardCredentials.$inferInsert;
export type TaskGroupRow = typeof taskGroups.$inferSelect;
export type NewTaskGroupRow = typeof taskGroups.$inferInsert;
export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
export type TaskUpdateRow = typeof taskUpdates.$inferSelect;
export type NewTaskUpdateRow = typeof taskUpdates.$inferInsert;
export type WorkspaceInviteRow = typeof workspaceInvites.$inferSelect;
export type NewWorkspaceInviteRow = typeof workspaceInvites.$inferInsert;
export type AutomationRow = typeof automations.$inferSelect;
export type NewAutomationRow = typeof automations.$inferInsert;
export type ClientRow = typeof clients.$inferSelect;
export type NewClientRow = typeof clients.$inferInsert;
export type TimeEntryRow = typeof timeEntries.$inferSelect;
export type NewTimeEntryRow = typeof timeEntries.$inferInsert;
export type ExpenseRow = typeof expenses.$inferSelect;
export type NewExpenseRow = typeof expenses.$inferInsert;
