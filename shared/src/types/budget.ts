export type BillingType = 'non_billable' | 'hourly' | 'fixed';
export type ProjectStatus = 'proposal' | 'active' | 'invoiced' | 'paid';

/**
 * Per-task time entry. `endedAt === null` means the timer is currently
 * running. Duration is computed at read time, never stored — the SSOT is
 * (startedAt, endedAt).
 */
export interface TimeEntry {
  id: string;
  taskId: string;
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
  note: string | null;
  billable: boolean;
  /** Cents per hour at log time. Stays fixed even if the underlying rate later changes. */
  hourlyRateSnapshot: number;
  currencySnapshot: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTimeEntryInput {
  taskId: string;
  startedAt: Date | string;
  endedAt?: Date | string | null;
  note?: string | null;
  billable?: boolean;
}

export interface UpdateTimeEntryInput {
  startedAt?: Date | string;
  endedAt?: Date | string | null;
  note?: string | null;
  billable?: boolean;
}

export interface StartTimerInput {
  taskId: string;
  note?: string | null;
}

export interface Expense {
  id: string;
  boardId: string;
  /** Cents in the entry's currency. */
  amount: number;
  currency: string;
  category: string;
  incurredAt: Date;
  note: string | null;
  billable: boolean;
  receiptUrl: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExpenseInput {
  boardId: string;
  amount: number;
  currency?: string;
  category?: string;
  incurredAt: Date | string;
  note?: string | null;
  billable?: boolean;
  receiptUrl?: string | null;
}

export interface UpdateExpenseInput {
  amount?: number;
  currency?: string;
  category?: string;
  incurredAt?: Date | string;
  note?: string | null;
  billable?: boolean;
  receiptUrl?: string | null;
}

/** Board budget settings (subset of Board, exposed for partial updates). */
export interface UpdateBudgetInput {
  billingType?: BillingType;
  fixedPrice?: number;
  hourlyRateOverride?: number | null;
  budgetMinutes?: number | null;
  budgetAmount?: number | null;
  projectStatus?: ProjectStatus;
  currencyOverride?: string | null;
}

/**
 * Board-level budget summary. Computed on read by the BoardService —
 * never persisted. Currency is the effective currency (override → client → 'USD').
 */
export interface BoardBudgetSummary {
  boardId: string;
  billingType: BillingType;
  projectStatus: ProjectStatus;
  effectiveCurrency: string;
  effectiveHourlyRate: number;
  fixedPrice: number;
  budgetMinutes: number | null;
  budgetAmount: number | null;
  /** Total minutes across all entries on this board's tasks. */
  loggedMinutes: number;
  /** Subset of loggedMinutes where billable = true. */
  billableMinutes: number;
  /** Sum of (minutes/60 * hourlyRateSnapshot) for billable entries — historical value. */
  earnedAmount: number;
  expensesAmount: number;
  expensesBillableAmount: number;
}

export const EXPENSE_CATEGORIES = [
  'travel',
  'software',
  'hardware',
  'subcontractor',
  'food',
  'office',
  'marketing',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
