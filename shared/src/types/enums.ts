/** Cross-entity enums used by the API, schema, and UI. Source of truth per docs/DATA_MODELS.md. */

/**
 * Status & priority are option ids drawn from the board's column config —
 * each board owns its own labels and can extend the list, so the type is
 * just a plain string. The default seed (`'done'`, `'working'`, `'stuck'`,
 * `'not-started'` for status and `'critical'`, `'high'`, `'medium'`, `'low'`
 * for priority) is what every new board starts with.
 */
export type StatusType = string;
export type PriorityType = string;
export type TaskSource = 'manual' | 'import' | 'api';

export type UserRole = 'owner' | 'super_admin' | 'admin' | 'staff';
export type WorkMode = 'remote' | 'on_site' | 'hybrid';

export type ActivityType =
  | 'task_created'
  | 'task_updated'
  | 'task_moved'
  | 'task_deleted'
  | 'task_archived'
  | 'status_changed'
  | 'assignee_changed'
  | 'due_date_changed'
  | 'priority_changed'
  | 'comment_added'
  | 'board_created'
  | 'board_updated'
  | 'board_deleted'
  | 'group_created'
  | 'group_updated'
  | 'group_deleted'
  | 'member_added'
  | 'member_removed';

export type NotificationType =
  | 'assignment'
  | 'mention'
  | 'comment_added'
  | 'due_soon'
  | 'overdue'
  | 'status_changed'
  | 'invited'
  | 'board_shared'
  | 'system';

export type NotificationEntityType = 'task' | 'board' | 'workspace' | 'task_update';

export type Visibility = 'public' | 'private';
