import type { Visibility } from './enums.js';
import type { BillingType, ProjectStatus } from './budget.js';

/**
 * Column definition stored on the board. Built-in types (person/status/...)
 * pull their value from the task row directly; custom types look up
 * `task.customCells[column.id]`.
 */
export type BoardColumnType =
  | 'person'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'timeline'
  | 'tags'
  | 'progress'
  | 'text'
  | 'number'
  | 'date'
  | 'checkbox'
  | 'rating';

export interface ColumnOption {
  /** Stable identifier — stored on tasks as the option value. */
  id: string;
  label: string;
  /** Tailwind background class (preferred) or raw hex/hsl. */
  color: string;
}

export interface BoardColumn {
  id: string;
  name: string;
  type: BoardColumnType;
  width?: number;
  /** Present for status / priority columns. Empty/missing means use the default seed. */
  options?: ColumnOption[];
}

export interface Board {
  id: string;
  workspaceId: string;
  /** Optional link to a Client. Null for internal/non-billable boards. */
  clientId: string | null;
  name: string;
  description: string;
  favorite: boolean;
  position: number;
  visibility: Visibility;
  columnsConfig: BoardColumn[];
  /** non_billable | hourly | fixed — drives how the budget summary is computed. */
  billingType: BillingType;
  /** Cents — only meaningful when billingType === 'fixed'. */
  fixedPrice: number;
  /** Cents per hour. Null = inherit client.defaultHourlyRate. */
  hourlyRateOverride: number | null;
  /** Optional time budget (minutes); null = no cap. */
  budgetMinutes: number | null;
  /** Optional money budget (cents); null = no cap. */
  budgetAmount: number | null;
  projectStatus: ProjectStatus;
  /** ISO 4217 override; null = inherit client.currency or 'USD'. */
  currencyOverride: string | null;
  /** Whole-project delivery date — distinct from per-task due dates. */
  deadline: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface CreateBoardInput {
  workspaceId: string;
  clientId?: string | null;
  name: string;
  description?: string;
  visibility?: Visibility;
  columnsConfig?: BoardColumn[];
  /** ISO date string. */
  deadline?: string | null;
  billingType?: BillingType;
  projectStatus?: ProjectStatus;
  /** Cents. Only meaningful for fixed billing. */
  fixedPrice?: number;
  /** Cents/hour. Optional override of the client's default. */
  hourlyRateOverride?: number | null;
  budgetAmount?: number | null;
  budgetMinutes?: number | null;
  currencyOverride?: string | null;
}

export interface UpdateBoardInput {
  clientId?: string | null;
  name?: string;
  description?: string;
  favorite?: boolean;
  position?: number;
  visibility?: Visibility;
  columnsConfig?: BoardColumn[];
  /** ISO date string, or null to clear. */
  deadline?: string | null;
}

export interface TaskGroup {
  id: string;
  boardId: string;
  name: string;
  color: string;
  position: number;
  collapsed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskGroupInput {
  boardId: string;
  name: string;
  color: string;
}

export interface UpdateTaskGroupInput {
  name?: string;
  color?: string;
  position?: number;
  collapsed?: boolean;
}
