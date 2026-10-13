import type { ActivityType, NotificationType, NotificationEntityType } from './enums.js';

export interface Activity {
  id: string;
  workspaceId: string;
  boardId: string | null;
  taskId: string | null;
  type: ActivityType;
  field: string | null;
  fromValue: string | null;
  toValue: string | null;
  summary: string;
  performedAt: Date;
  performedBy: string | null;
}

export interface AuditLog {
  id: string;
  userId: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  workspaceId: string | null;
  ipAddress: string;
  userAgent: string;
  performedAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  entityType: NotificationEntityType;
  entityId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export const AUDIT_ACTIONS = {
  WORKSPACE_CREATE: 'workspace.create',
  WORKSPACE_UPDATE: 'workspace.update',
  WORKSPACE_DELETE: 'workspace.delete',
  BOARD_CREATE: 'board.create',
  BOARD_UPDATE: 'board.update',
  BOARD_DELETE: 'board.delete',
  GROUP_CREATE: 'group.create',
  GROUP_UPDATE: 'group.update',
  GROUP_DELETE: 'group.delete',
  TASK_CREATE: 'task.create',
  TASK_UPDATE: 'task.update',
  TASK_DELETE: 'task.delete',
  TASK_MOVE: 'task.move',
  MEMBER_INVITE: 'member.invite',
  MEMBER_REMOVE: 'member.remove',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',
  USER_ROLE_CHANGE: 'user.role.change',
  USER_ROLE_TRANSFER: 'user.role.transfer',
  USER_PERMISSIONS_UPDATE: 'user.permissions.update',
  PASSWORD_RESET_REQUEST: 'password.reset.request',
  PASSWORD_RESET_COMPLETE: 'password.reset.complete',
  TOTP_SETUP: 'totp.setup',
  TOTP_VERIFY: 'totp.verify',
  CLIENT_CREATE: 'client.create',
  CLIENT_UPDATE: 'client.update',
  CLIENT_DELETE: 'client.delete',
  TIME_ENTRY_CREATE: 'time_entry.create',
  TIME_ENTRY_UPDATE: 'time_entry.update',
  TIME_ENTRY_DELETE: 'time_entry.delete',
  EXPENSE_CREATE: 'expense.create',
  EXPENSE_UPDATE: 'expense.update',
  EXPENSE_DELETE: 'expense.delete',
  BUDGET_UPDATE: 'budget.update',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
