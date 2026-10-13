import { eq } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  boards,
  clients,
  expenses,
  tasks,
  timeEntries,
} from '@projectmgmt/drizzle';
import type {
  ActiveProject,
  CurrencyAmount,
  OutstandingProject,
  ReportsOverview,
  RevenueByMonth,
  TopClient,
} from '@projectmgmt/shared';
import { requirePermission, type PermissionActor } from './permissions.js';

export interface ReportsActor extends PermissionActor {
  id: string;
}

interface CurrencyBucket {
  [currency: string]: number;
}

function bucketAdd(b: CurrencyBucket, currency: string, amount: number): void {
  b[currency] = (b[currency] ?? 0) + amount;
}

function bucketToList(b: CurrencyBucket): CurrencyAmount[] {
  return Object.entries(b)
    .filter(([, amount]) => amount !== 0)
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfYearUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

function startOfWeekUtc(d: Date): Date {
  // Monday-anchored week to match most timesheet conventions.
  const day = d.getUTCDay(); // 0=Sun
  const diffToMon = (day + 6) % 7;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMon)
  );
}

function entryMinutes(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
}

/**
 * Aggregate everything the Reports page needs in one shot. Three SELECTs
 * (one per relevant table) — assembled in JS rather than a stack of SQL
 * GROUP BYs because the dataset is small (a freelance solo user's history)
 * and JS aggregation keeps the code easy to extend.
 */
export async function getReportsOverview(
  db: DbClient,
  actor: ReportsActor
): Promise<ReportsOverview> {
  requirePermission(actor, 'report', 'read');

  const now = new Date();
  const endNow = now.getTime();
  const yearStart = startOfYearUtc(now).getTime();
  const monthStart = startOfMonthUtc(now).getTime();
  const weekStart = startOfWeekUtc(now).getTime();
  const twelveMonthsAgo = new Date(
    Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)
  );

  // --- Time entries with their parent board + client (for revenue/top clients).
  const timeRows = await db
    .select({
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      billable: timeEntries.billable,
      rateMinor: timeEntries.hourlyRateSnapshot,
      currency: timeEntries.currencySnapshot,
      boardId: tasks.boardId,
      boardName: boards.name,
      workspaceId: boards.workspaceId,
      billingType: boards.billingType,
      projectStatus: boards.projectStatus,
      currencyOverride: boards.currencyOverride,
      hourlyRateOverride: boards.hourlyRateOverride,
      budgetMinutes: boards.budgetMinutes,
      budgetAmount: boards.budgetAmount,
      fixedPrice: boards.fixedPrice,
      clientId: boards.clientId,
      clientName: clients.name,
      clientCompany: clients.company,
      clientColor: clients.color,
      clientCurrency: clients.currency,
      clientStatus: clients.status,
    })
    .from(timeEntries)
    .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
    .innerJoin(boards, eq(boards.id, tasks.boardId))
    .leftJoin(clients, eq(clients.id, boards.clientId));

  // --- Boards (for outstanding + active projects, even with zero entries).
  const boardRows = await db
    .select({
      id: boards.id,
      workspaceId: boards.workspaceId,
      name: boards.name,
      clientId: boards.clientId,
      billingType: boards.billingType,
      projectStatus: boards.projectStatus,
      fixedPrice: boards.fixedPrice,
      hourlyRateOverride: boards.hourlyRateOverride,
      budgetMinutes: boards.budgetMinutes,
      budgetAmount: boards.budgetAmount,
      currencyOverride: boards.currencyOverride,
      updatedAt: boards.updatedAt,
      clientName: clients.name,
      clientCurrency: clients.currency,
    })
    .from(boards)
    .leftJoin(clients, eq(clients.id, boards.clientId));

  // --- Expenses (per board, separately from time).
  const expenseRows = await db
    .select({
      boardId: expenses.boardId,
      amount: expenses.amount,
      currency: expenses.currency,
      billable: expenses.billable,
    })
    .from(expenses);

  // ---------- Revenue by month ----------
  const monthBuckets = new Map<string, { amounts: CurrencyBucket; logged: number; billable: number }>();
  // Pre-seed last 12 months so empty months show as zero rows.
  for (let i = 0; i < 12; i++) {
    const d = new Date(
      Date.UTC(twelveMonthsAgo.getUTCFullYear(), twelveMonthsAgo.getUTCMonth() + i, 1)
    );
    monthBuckets.set(monthKey(d), { amounts: {}, logged: 0, billable: 0 });
  }

  const yearBucket: CurrencyBucket = {};
  const monthThisBucket: CurrencyBucket = {};
  let weekMinutes = 0;
  let monthMinutes = 0;

  // ---------- Top clients ----------
  type ClientAccum = {
    clientId: string;
    name: string;
    company: string | null;
    color: string;
    status: TopClient['status'];
    amounts: CurrencyBucket;
    billableMinutes: number;
    boardIds: Set<string>;
  };
  const clientAccum = new Map<string, ClientAccum>();

  // ---------- Active projects time totals (by board) ----------
  type BoardTimeAccum = {
    loggedMinutes: number;
    billableMinutes: number;
    earnedByCurrency: CurrencyBucket;
  };
  const boardTime = new Map<string, BoardTimeAccum>();

  for (const r of timeRows) {
    const start = r.startedAt;
    const end = r.endedAt ?? now;
    const startMs = start.getTime();
    const minutes = entryMinutes(start, end);
    if (minutes === 0) continue;
    const earnedMinor = r.billable ? Math.round((minutes * r.rateMinor) / 60) : 0;
    const currency = r.currency;

    const monthBucketKey = monthKey(start);
    const monthRec = monthBuckets.get(monthBucketKey);
    if (monthRec) {
      monthRec.logged += minutes;
      if (r.billable) {
        monthRec.billable += minutes;
        bucketAdd(monthRec.amounts, currency, earnedMinor);
      }
    }

    if (startMs >= yearStart && r.billable) bucketAdd(yearBucket, currency, earnedMinor);
    if (startMs >= monthStart && r.billable) bucketAdd(monthThisBucket, currency, earnedMinor);
    if (startMs >= weekStart) weekMinutes += minutes;
    if (startMs >= monthStart) monthMinutes += minutes;

    if (r.clientId && r.clientName) {
      let entry = clientAccum.get(r.clientId);
      if (!entry) {
        entry = {
          clientId: r.clientId,
          name: r.clientName,
          company: r.clientCompany,
          color: r.clientColor ?? 'bg-blue-500',
          status: r.clientStatus ?? 'active',
          amounts: {},
          billableMinutes: 0,
          boardIds: new Set(),
        };
        clientAccum.set(r.clientId, entry);
      }
      if (r.billable) {
        bucketAdd(entry.amounts, currency, earnedMinor);
        entry.billableMinutes += minutes;
      }
      entry.boardIds.add(r.boardId);
    }

    let bt = boardTime.get(r.boardId);
    if (!bt) {
      bt = { loggedMinutes: 0, billableMinutes: 0, earnedByCurrency: {} };
      boardTime.set(r.boardId, bt);
    }
    bt.loggedMinutes += minutes;
    if (r.billable) {
      bt.billableMinutes += minutes;
      bucketAdd(bt.earnedByCurrency, currency, earnedMinor);
    }
    void endNow;
  }

  const revenueByMonth: RevenueByMonth[] = [...monthBuckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, rec]) => ({
      month,
      amounts: bucketToList(rec.amounts),
      loggedMinutes: rec.logged,
      billableMinutes: rec.billable,
    }));

  // ---------- Outstanding ----------
  const outstandingProjects: OutstandingProject[] = [];
  const outstandingBucket: CurrencyBucket = {};
  for (const b of boardRows) {
    if (b.projectStatus !== 'invoiced') continue;
    const currency = b.currencyOverride ?? b.clientCurrency ?? 'USD';
    let amount = 0;
    if (b.billingType === 'fixed') {
      amount = b.fixedPrice;
    } else if (b.billingType === 'hourly') {
      const earned = boardTime.get(b.id)?.earnedByCurrency ?? {};
      amount = Object.values(earned).reduce((acc, v) => acc + v, 0);
    }
    if (amount > 0) bucketAdd(outstandingBucket, currency, amount);
    const daysOutstanding = Math.max(
      0,
      Math.floor((now.getTime() - b.updatedAt.getTime()) / (24 * 60 * 60 * 1000))
    );
    outstandingProjects.push({
      boardId: b.id,
      workspaceId: b.workspaceId,
      name: b.name,
      clientId: b.clientId,
      clientName: b.clientName,
      billingType: b.billingType,
      projectStatus: b.projectStatus,
      amount: { currency, amount },
      daysOutstanding,
    });
  }
  outstandingProjects.sort((a, b) => b.daysOutstanding - a.daysOutstanding);

  // ---------- Session status counts (whole-of-app rollup for Home) ----------
  const sessionStats = {
    total: boardRows.length,
    pending: 0,
    inProgress: 0,
    invoiced: 0,
    completed: 0,
  };
  for (const b of boardRows) {
    switch (b.projectStatus) {
      case 'proposal':
        sessionStats.pending++;
        break;
      case 'active':
        sessionStats.inProgress++;
        break;
      case 'invoiced':
        sessionStats.invoiced++;
        break;
      case 'paid':
        sessionStats.completed++;
        break;
    }
  }

  // ---------- Active projects ----------
  const activeProjects: ActiveProject[] = [];
  let activeCount = 0;
  for (const b of boardRows) {
    if (b.projectStatus !== 'active') continue;
    activeCount++;
    const currency = b.currencyOverride ?? b.clientCurrency ?? 'USD';
    const time = boardTime.get(b.id) ?? {
      loggedMinutes: 0,
      billableMinutes: 0,
      earnedByCurrency: {} as CurrencyBucket,
    };
    const earnedMinor = time.earnedByCurrency[currency] ?? 0;
    const timeRatio =
      b.budgetMinutes && b.budgetMinutes > 0
        ? Math.min(1, time.loggedMinutes / b.budgetMinutes)
        : null;
    const amountTarget = b.billingType === 'fixed' ? b.fixedPrice : b.budgetAmount;
    const amountRatio =
      amountTarget && amountTarget > 0
        ? Math.min(1, earnedMinor / amountTarget)
        : null;
    activeProjects.push({
      boardId: b.id,
      workspaceId: b.workspaceId,
      name: b.name,
      clientId: b.clientId,
      clientName: b.clientName,
      billingType: b.billingType,
      projectStatus: b.projectStatus,
      loggedMinutes: time.loggedMinutes,
      billableMinutes: time.billableMinutes,
      earned: { currency, amount: earnedMinor },
      budgetMinutes: b.budgetMinutes,
      budgetAmount: b.budgetAmount,
      timeUsedRatio: timeRatio,
      amountUsedRatio: amountRatio,
    });
  }
  // Most-used-budget first; then most logged time.
  activeProjects.sort((a, b) => {
    const ar = a.timeUsedRatio ?? a.amountUsedRatio ?? 0;
    const br = b.timeUsedRatio ?? b.amountUsedRatio ?? 0;
    if (ar !== br) return br - ar;
    return b.loggedMinutes - a.loggedMinutes;
  });

  // ---------- Top clients ----------
  const topClients: TopClient[] = [...clientAccum.values()]
    .map((c) => ({
      clientId: c.clientId,
      name: c.name,
      company: c.company,
      color: c.color,
      status: c.status,
      amounts: bucketToList(c.amounts),
      billableMinutes: c.billableMinutes,
      projectCount: c.boardIds.size,
    }))
    .sort((a, b) => {
      const aTop = a.amounts[0]?.amount ?? 0;
      const bTop = b.amounts[0]?.amount ?? 0;
      if (aTop !== bTop) return bTop - aTop;
      return b.billableMinutes - a.billableMinutes;
    })
    .slice(0, 8);

  // Fold expenses' billable amounts into outstanding for invoiced projects?
  // No — expenses are tracked separately and shouldn't double-bill into "earned".
  void expenseRows;

  return {
    revenueByMonth,
    totalsThisYear: bucketToList(yearBucket),
    totalsThisMonth: bucketToList(monthThisBucket),
    hoursThisWeek: Math.round((weekMinutes / 60) * 10) / 10,
    hoursThisMonth: Math.round((monthMinutes / 60) * 10) / 10,
    activeProjectsCount: activeCount,
    sessionStats,
    outstandingTotal: bucketToList(outstandingBucket),
    topClients,
    outstandingProjects,
    activeProjects,
  };
}
