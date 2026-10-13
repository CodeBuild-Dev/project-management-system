import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  AlertTriangle,
  Briefcase,
  Clock,
  FileText,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react';
import type {
  BillingType,
  ProjectStatus,
  Expense,
} from '@projectmgmt/shared';
import { EXPENSE_CATEGORIES } from '@projectmgmt/shared';
import { trpc } from '@/lib/trpc/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface BudgetViewProps {
  boardId: string;
}

const BILLING_LABELS: Record<BillingType, string> = {
  non_billable: 'Non-billable (internal)',
  hourly: 'Hourly',
  fixed: 'Fixed price',
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  proposal: 'Proposal',
  active: 'Active',
  invoiced: 'Invoiced',
  paid: 'Paid',
};

function fromMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}

function parseMinorOrZero(v: string): number {
  const n = Number.parseFloat(v.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function parseMinorOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed === '') return null;
  return parseMinorOrZero(trimmed);
}

function parseIntOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed === '') return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatMoney(minor: number, currency: string): string {
  return `${(minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

interface ExpenseFormState {
  amountMajor: string;
  currency: string;
  category: string;
  date: string;
  note: string;
  billable: boolean;
}

function newExpenseForm(currency: string): ExpenseFormState {
  return {
    amountMajor: '',
    currency,
    category: 'other',
    date: format(new Date(), 'yyyy-MM-dd'),
    note: '',
    billable: true,
  };
}

export function BudgetView({ boardId }: BudgetViewProps) {
  const utils = trpc.useUtils();

  const summaryQuery = trpc.board.getBudgetSummary.useQuery(
    { id: boardId },
    { enabled: !!boardId }
  );
  const boardQuery = trpc.board.getById.useQuery(
    { id: boardId },
    { enabled: !!boardId }
  );
  const expensesQuery = trpc.expenses.listByBoard.useQuery(
    { boardId },
    { enabled: !!boardId }
  );

  const summary = summaryQuery.data;
  const board = boardQuery.data;
  const effectiveCurrency = summary?.effectiveCurrency ?? 'USD';

  // ---------- Settings form ----------
  const [billingType, setBillingType] = useState<BillingType>('non_billable');
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>('active');
  const [hourlyRateMajor, setHourlyRateMajor] = useState('');
  const [fixedPriceMajor, setFixedPriceMajor] = useState('');
  const [budgetHours, setBudgetHours] = useState('');
  const [budgetAmountMajor, setBudgetAmountMajor] = useState('');
  const [currencyOverride, setCurrencyOverride] = useState('');

  // ---------- Metadata form (name / description / deadline / client) ----------
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(''); // yyyy-mm-dd
  const [clientId, setClientId] = useState<string>('none');

  const { data: activeClients = [] } = trpc.clients.list.useQuery({ status: 'active' });

  useEffect(() => {
    if (!board) return;
    setBillingType(board.billingType);
    setProjectStatus(board.projectStatus);
    setHourlyRateMajor(
      board.hourlyRateOverride !== null ? fromMinor(board.hourlyRateOverride) : ''
    );
    setFixedPriceMajor(board.fixedPrice > 0 ? fromMinor(board.fixedPrice) : '');
    setBudgetHours(
      board.budgetMinutes !== null ? String(Math.round(board.budgetMinutes / 60)) : ''
    );
    setBudgetAmountMajor(
      board.budgetAmount !== null ? fromMinor(board.budgetAmount) : ''
    );
    setCurrencyOverride(board.currencyOverride ?? '');
    setName(board.name);
    setDescription(board.description ?? '');
    setDeadline(board.deadline ? format(new Date(board.deadline), 'yyyy-MM-dd') : '');
    setClientId(board.clientId ?? 'none');
  }, [board]);

  const updateBoardMut = trpc.board.update.useMutation({
    onSuccess: () => {
      utils.board.getById.invalidate({ id: boardId });
      utils.workspace.list.invalidate();
      toast({ title: 'Project details saved' });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const saveMetadata = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ title: 'Project needs a title', variant: 'destructive' });
      return;
    }
    updateBoardMut.mutate({
      id: boardId,
      data: {
        name: trimmed,
        description: description.trim(),
        deadline: deadline ? new Date(deadline).toISOString() : null,
        clientId: clientId === 'none' ? null : clientId,
      },
    });
  };

  const updateBudgetMut = trpc.board.updateBudget.useMutation({
    onSuccess: () => {
      utils.board.getById.invalidate({ id: boardId });
      utils.board.getBudgetSummary.invalidate({ id: boardId });
      toast({ title: 'Budget saved' });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const saveBudget = () => {
    const hoursAsMinutes = (() => {
      const h = parseIntOrNull(budgetHours);
      return h === null ? null : h * 60;
    })();
    updateBudgetMut.mutate({
      id: boardId,
      data: {
        billingType,
        projectStatus,
        hourlyRateOverride: parseMinorOrNull(hourlyRateMajor),
        fixedPrice: parseMinorOrZero(fixedPriceMajor),
        budgetMinutes: hoursAsMinutes,
        budgetAmount: parseMinorOrNull(budgetAmountMajor),
        currencyOverride: currencyOverride.trim() === '' ? null : currencyOverride.trim().toUpperCase(),
      },
    });
  };

  // ---------- Expense form ----------
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(() =>
    newExpenseForm(effectiveCurrency)
  );
  // Keep currency synced with the board's effective currency unless the user
  // overrides it during entry.
  useEffect(() => {
    setExpenseForm((f) => (f.currency ? f : { ...f, currency: effectiveCurrency }));
  }, [effectiveCurrency]);

  const createExpenseMut = trpc.expenses.create.useMutation({
    onSuccess: () => {
      utils.expenses.listByBoard.invalidate({ boardId });
      utils.board.getBudgetSummary.invalidate({ id: boardId });
      setExpenseForm(newExpenseForm(effectiveCurrency));
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const deleteExpenseMut = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      utils.expenses.listByBoard.invalidate({ boardId });
      utils.board.getBudgetSummary.invalidate({ id: boardId });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const submitExpense = () => {
    const amount = parseMinorOrZero(expenseForm.amountMajor);
    if (amount <= 0) {
      toast({ title: 'Enter an amount', variant: 'destructive' });
      return;
    }
    const incurredAt = new Date(expenseForm.date);
    if (Number.isNaN(incurredAt.getTime())) {
      toast({ title: 'Invalid date', variant: 'destructive' });
      return;
    }
    createExpenseMut.mutate({
      boardId,
      amount,
      currency: expenseForm.currency.toUpperCase(),
      category: expenseForm.category,
      incurredAt: incurredAt.toISOString(),
      note: expenseForm.note.trim() || null,
      billable: expenseForm.billable,
    });
  };

  // ---------- Derived ----------
  const expenses: Expense[] = expensesQuery.data ?? [];
  const expenseTotalsByCurrency = useMemo(() => {
    const map = new Map<string, { total: number; billable: number }>();
    for (const e of expenses) {
      const cur = map.get(e.currency) ?? { total: 0, billable: 0 };
      cur.total += e.amount;
      if (e.billable) cur.billable += e.amount;
      map.set(e.currency, cur);
    }
    return map;
  }, [expenses]);

  // ---------- Render ----------
  if (summaryQuery.isLoading || boardQuery.isLoading) {
    return (
      <div className="px-6 py-6 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!summary || !board) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        Could not load budget for this board.
      </div>
    );
  }

  const loggedHours = summary.loggedMinutes / 60;
  const budgetHoursTarget = summary.budgetMinutes !== null ? summary.budgetMinutes / 60 : null;
  const hoursPct =
    budgetHoursTarget && budgetHoursTarget > 0
      ? Math.min(100, (loggedHours / budgetHoursTarget) * 100)
      : null;
  const amountTarget =
    summary.billingType === 'fixed'
      ? summary.fixedPrice
      : summary.budgetAmount;
  const amountPct =
    amountTarget && amountTarget > 0
      ? Math.min(100, (summary.earnedAmount / amountTarget) * 100)
      : null;

  const overTime =
    budgetHoursTarget !== null && budgetHoursTarget > 0 && loggedHours > budgetHoursTarget;
  const overBudget =
    amountTarget !== null && amountTarget > 0 && summary.earnedAmount > amountTarget;

  return (
    <div className="px-4 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6 overflow-auto">
      {/* Summary cards — colorful gradient hero tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={Briefcase}
          label="Project status"
          value={STATUS_LABELS[summary.projectStatus]}
          sub={BILLING_LABELS[summary.billingType]}
          gradient="from-violet-500 to-indigo-600"
        />
        <SummaryCard
          icon={Clock}
          label="Logged time"
          value={formatHm(summary.loggedMinutes)}
          sub={
            budgetHoursTarget !== null
              ? `of ${formatHm(summary.budgetMinutes ?? 0)} budget`
              : `${formatHm(summary.billableMinutes)} billable`
          }
          progress={hoursPct}
          warn={overTime}
          gradient="from-sky-500 to-blue-600"
        />
        <SummaryCard
          icon={Wallet}
          label="Earned"
          value={formatMoney(summary.earnedAmount, summary.effectiveCurrency)}
          sub={
            summary.billingType === 'fixed'
              ? `Fixed: ${formatMoney(summary.fixedPrice, summary.effectiveCurrency)}`
              : summary.billingType === 'hourly'
                ? `${formatMoney(summary.effectiveHourlyRate, summary.effectiveCurrency)}/h`
                : 'Non-billable'
          }
          progress={amountPct}
          warn={overBudget}
          gradient="from-emerald-500 to-teal-600"
        />
        <SummaryCard
          icon={Receipt}
          label="Expenses"
          value={formatMoney(summary.expensesAmount, summary.effectiveCurrency)}
          sub={`${formatMoney(summary.expensesBillableAmount, summary.effectiveCurrency)} billable`}
          gradient="from-amber-500 to-orange-600"
        />
      </div>

      {(overTime || overBudget) && (
        <div className="rounded-md border border-status-orange/40 bg-status-orange/10 px-3 py-2 flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-status-orange" />
          <span>
            {overTime && 'Over time budget. '}
            {overBudget && 'Over money budget. '}
            Consider raising the cap or invoicing now.
          </span>
        </div>
      )}

      {/* Metadata (title / description / deadline) */}
      <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-indigo-50 via-card to-card dark:from-indigo-950/30 border-b border-border/40">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm bg-gradient-to-br from-indigo-500 to-violet-600">
              <FileText className="w-4 h-4" strokeWidth={2.25} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Project details</h2>
              <p className="text-[11px] text-muted-foreground">
                Title, scope, and delivery date.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={saveMetadata} disabled={updateBoardMut.isPending}>
            Save
          </Button>
        </header>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bv-name">Project title</Label>
            <Input
              id="bv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bv-client">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger id="bv-client">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client (internal)</SelectItem>
                {activeClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="inline-flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-sm ${c.color}`} aria-hidden />
                      {c.name}
                      {c.company && (
                        <span className="text-muted-foreground">· {c.company}</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bv-desc">Description</Label>
            <Textarea
              id="bv-desc"
              rows={3}
              value={description}
              placeholder="What is this project about? Scope, goals, links."
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bv-deadline">Deadline</Label>
            <Input
              id="bv-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Whole-project delivery date (separate from per-task due dates).
            </p>
          </div>
        </div>
      </section>

      {/* Settings */}
      <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-emerald-50 via-card to-card dark:from-emerald-950/30 border-b border-border/40">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm bg-gradient-to-br from-emerald-500 to-teal-600">
              <Wallet className="w-4 h-4" strokeWidth={2.25} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Billing & budget</h2>
              <p className="text-[11px] text-muted-foreground">
                How this project is priced and tracked.
              </p>
            </div>
          </div>
          <Button size="sm" onClick={saveBudget} disabled={updateBudgetMut.isPending}>
            Save
          </Button>
        </header>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bv-billing">Billing type</Label>
            <Select value={billingType} onValueChange={(v) => setBillingType(v as BillingType)}>
              <SelectTrigger id="bv-billing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="non_billable">{BILLING_LABELS.non_billable}</SelectItem>
                <SelectItem value="hourly">{BILLING_LABELS.hourly}</SelectItem>
                <SelectItem value="fixed">{BILLING_LABELS.fixed}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="bv-status">Project status</Label>
            <Select value={projectStatus} onValueChange={(v) => setProjectStatus(v as ProjectStatus)}>
              <SelectTrigger id="bv-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="proposal">{STATUS_LABELS.proposal}</SelectItem>
                <SelectItem value="active">{STATUS_LABELS.active}</SelectItem>
                <SelectItem value="invoiced">{STATUS_LABELS.invoiced}</SelectItem>
                <SelectItem value="paid">{STATUS_LABELS.paid}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {billingType === 'hourly' && (
            <div>
              <Label htmlFor="bv-rate">
                Hourly rate ({effectiveCurrency} per hour)
              </Label>
              <Input
                id="bv-rate"
                inputMode="decimal"
                value={hourlyRateMajor}
                onChange={(e) => setHourlyRateMajor(e.target.value)}
                placeholder="Leave empty to use client default"
              />
            </div>
          )}

          {billingType === 'fixed' && (
            <div>
              <Label htmlFor="bv-fixed">Fixed price ({effectiveCurrency})</Label>
              <Input
                id="bv-fixed"
                inputMode="decimal"
                value={fixedPriceMajor}
                onChange={(e) => setFixedPriceMajor(e.target.value)}
              />
            </div>
          )}

          <div>
            <Label htmlFor="bv-budget-h">Time budget (hours)</Label>
            <Input
              id="bv-budget-h"
              inputMode="numeric"
              value={budgetHours}
              onChange={(e) => setBudgetHours(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="No cap"
            />
          </div>

          {billingType !== 'fixed' && (
            <div>
              <Label htmlFor="bv-budget-a">Money budget ({effectiveCurrency})</Label>
              <Input
                id="bv-budget-a"
                inputMode="decimal"
                value={budgetAmountMajor}
                onChange={(e) => setBudgetAmountMajor(e.target.value)}
                placeholder="No cap"
              />
            </div>
          )}

          <div>
            <Label htmlFor="bv-currency">Currency override (3-letter)</Label>
            <Input
              id="bv-currency"
              maxLength={3}
              value={currencyOverride}
              onChange={(e) => setCurrencyOverride(e.target.value.toUpperCase())}
              placeholder="Inherit from client"
            />
          </div>
        </div>
      </section>

      {/* Expenses */}
      <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <header className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-amber-50 via-card to-card dark:from-amber-950/30 border-b border-border/40">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm bg-gradient-to-br from-amber-500 to-orange-600">
            <Receipt className="w-4 h-4" strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Expenses</h2>
            <p className="text-[11px] text-muted-foreground">
              Out-of-pocket spending tied to this project.
            </p>
          </div>
        </header>

        <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="md:col-span-1">
            <Label htmlFor="ex-amount" className="text-xs">
              Amount
            </Label>
            <Input
              id="ex-amount"
              inputMode="decimal"
              value={expenseForm.amountMajor}
              onChange={(e) =>
                setExpenseForm((f) => ({ ...f, amountMajor: e.target.value }))
              }
            />
          </div>
          <div>
            <Label htmlFor="ex-currency" className="text-xs">
              Currency
            </Label>
            <Input
              id="ex-currency"
              maxLength={3}
              value={expenseForm.currency}
              onChange={(e) =>
                setExpenseForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))
              }
            />
          </div>
          <div>
            <Label htmlFor="ex-category" className="text-xs">
              Category
            </Label>
            <Select
              value={expenseForm.category}
              onValueChange={(v) => setExpenseForm((f) => ({ ...f, category: v }))}
            >
              <SelectTrigger id="ex-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="ex-date" className="text-xs">
              Date
            </Label>
            <Input
              id="ex-date"
              type="date"
              value={expenseForm.date}
              onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="ex-note" className="text-xs">
              Note
            </Label>
            <Textarea
              id="ex-note"
              rows={1}
              value={expenseForm.note}
              onChange={(e) => setExpenseForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <div className="flex items-end justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Switch
                checked={expenseForm.billable}
                onCheckedChange={(v) => setExpenseForm((f) => ({ ...f, billable: v }))}
              />
              Billable
            </label>
            <Button
              size="sm"
              onClick={submitExpense}
              disabled={createExpenseMut.isPending}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No expenses logged.
          </p>
        ) : (
          <div className="rounded border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Date</th>
                  <th className="text-left font-medium px-3 py-2">Category</th>
                  <th className="text-left font-medium px-3 py-2">Note</th>
                  <th className="text-right font-medium px-3 py-2">Amount</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground/80">
                      {format(new Date(e.incurredAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-3 py-2 capitalize text-foreground/80">{e.category}</td>
                    <td className="px-3 py-2 text-foreground/80">
                      {e.note ?? '—'}
                      {!e.billable && (
                        <span className="ml-2 text-[10px] text-muted-foreground">non-billable</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(e.amount, e.currency)}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => deleteExpenseMut.mutate({ id: e.id })}
                        className="w-7 h-7 rounded hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {[...expenseTotalsByCurrency.entries()].map(([cur, t]) => (
                  <tr key={cur} className="border-t border-border bg-muted/20 text-foreground">
                    <td className="px-3 py-2 text-xs text-muted-foreground" colSpan={3}>
                      Total {cur}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatMoney(t.total, cur)}
                    </td>
                    <td />
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}
        </div>
      </section>
    </div>
  );
}

interface SummaryCardProps {
  icon: typeof Briefcase;
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  progress?: number | null;
  warn?: boolean;
  /** Tailwind gradient stops, e.g. "from-emerald-500 to-teal-600". */
  gradient: string;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  progress,
  warn,
  gradient,
}: SummaryCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} text-white p-4 shadow-lg shadow-black/5 ring-1 ring-white/10`}
    >
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10 blur-xl pointer-events-none" />
      <div className="relative flex items-start justify-between mb-3">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20 backdrop-blur-sm">
          <Icon className="w-5 h-5" strokeWidth={2.25} />
        </span>
      </div>
      <div className="relative">
        <p className="text-[11px] text-white/80 font-medium uppercase tracking-wider">
          {label}
        </p>
        <p className="text-lg font-bold mt-0.5 truncate tabular-nums tracking-tight">
          {value}
        </p>
        <p className="text-[11px] text-white/70 mt-1 truncate">{sub}</p>
        {progress !== null && progress !== undefined && (
          <div className="mt-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className={`h-full rounded-full ${warn ? 'bg-rose-200' : 'bg-white'}`}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
