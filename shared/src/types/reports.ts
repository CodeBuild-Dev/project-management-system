import type { BillingType, ProjectStatus } from './budget.js';
import type { ClientStatus } from './client.js';

/**
 * Cross-project reporting shapes. The server materialises these on
 * read — no aggregation table — so revenue figures always reflect the
 * current state of time_entries / expenses / boards. Currency totals
 * are reported per-currency: there's no FX conversion in v1.
 */

export interface CurrencyAmount {
  currency: string;
  amount: number; // minor units (cents)
}

export interface RevenueByMonth {
  /** First day of the month, ISO date string (YYYY-MM-01). */
  month: string;
  /** earned per currency for that month. */
  amounts: CurrencyAmount[];
  loggedMinutes: number;
  billableMinutes: number;
}

export interface TopClient {
  clientId: string;
  name: string;
  company: string | null;
  color: string;
  status: ClientStatus;
  amounts: CurrencyAmount[];
  billableMinutes: number;
  projectCount: number;
}

export interface OutstandingProject {
  boardId: string;
  workspaceId: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  billingType: BillingType;
  projectStatus: ProjectStatus;
  amount: CurrencyAmount;
  /** Days since the board moved to 'invoiced' — proxy for "how late". */
  daysOutstanding: number;
}

export interface ActiveProject {
  boardId: string;
  workspaceId: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  billingType: BillingType;
  projectStatus: ProjectStatus;
  loggedMinutes: number;
  billableMinutes: number;
  earned: CurrencyAmount;
  budgetMinutes: number | null;
  budgetAmount: number | null;
  /** 0..1 progress against the time budget; null if no time budget set. */
  timeUsedRatio: number | null;
  amountUsedRatio: number | null;
}

export interface SessionStats {
  total: number;
  /** project_status === 'proposal' — work session not yet started. */
  pending: number;
  /** project_status === 'active' — work in progress. */
  inProgress: number;
  /** project_status === 'invoiced' — delivered, awaiting payment. */
  invoiced: number;
  /** project_status === 'paid' — fully completed and paid. */
  completed: number;
}

export interface ReportsOverview {
  revenueByMonth: RevenueByMonth[];
  /** Sums the most recent N months. */
  totalsThisYear: CurrencyAmount[];
  totalsThisMonth: CurrencyAmount[];
  hoursThisWeek: number;
  hoursThisMonth: number;
  activeProjectsCount: number;
  /** Counts of work sessions across every status, for the Home dashboard. */
  sessionStats: SessionStats;
  outstandingTotal: CurrencyAmount[];
  topClients: TopClient[];
  outstandingProjects: OutstandingProject[];
  activeProjects: ActiveProject[];
}
