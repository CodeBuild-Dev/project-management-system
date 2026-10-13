import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowUpRight,
  Briefcase,
  Clock,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type {
  ActiveProject,
  CurrencyAmount,
  OutstandingProject,
  RevenueByMonth,
  TopClient,
} from '@projectmgmt/shared';
import { trpc } from '@/lib/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import { ColoredHeader } from '@/components/ColoredHeader';

function formatMoney(c: CurrencyAmount | undefined): string {
  if (!c) return '—';
  return `${(c.amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${c.currency}`;
}

function formatMoneyList(list: CurrencyAmount[]): string {
  if (list.length === 0) return '—';
  return list.map(formatMoney).join(' · ');
}

function formatHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface ChartDatum {
  month: string;
  label: string;
  amount: number;
  hours: number;
}

function buildChartData(rev: RevenueByMonth[]): { data: ChartDatum[]; currency: string } {
  // Pick the dominant currency (largest total) to drive the chart axis.
  const totals = new Map<string, number>();
  for (const r of rev) {
    for (const a of r.amounts) {
      totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.amount);
    }
  }
  const dominantCurrency = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';

  const data: ChartDatum[] = rev.map((r) => {
    const dateObj = parseISO(r.month);
    const amount = r.amounts.find((a) => a.currency === dominantCurrency)?.amount ?? 0;
    return {
      month: r.month,
      label: format(dateObj, 'MMM'),
      amount: amount / 100, // chart uses major units
      hours: Math.round((r.loggedMinutes / 60) * 10) / 10,
    };
  });

  return { data, currency: dominantCurrency };
}

const STATUS_TONE: Record<string, string> = {
  proposal: 'bg-status-yellow/20 text-status-yellow-fg',
  active: 'bg-status-green/20 text-status-green-fg',
  invoiced: 'bg-status-blue/20 text-status-blue-fg',
  paid: 'bg-muted text-muted-foreground',
};

export default function Reports() {
  const { t } = useTranslation();
  const overviewQuery = trpc.reports.overview.useQuery();

  const chart = useMemo(
    () => buildChartData(overviewQuery.data?.revenueByMonth ?? []),
    [overviewQuery.data?.revenueByMonth]
  );

  if (overviewQuery.isLoading) {
    return (
      <div className="px-8 py-6 space-y-4 flex-1 overflow-auto">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!overviewQuery.data) {
    return (
      <div className="px-8 py-12 flex-1 text-center text-sm text-muted-foreground">
        {t('reports.error')}
      </div>
    );
  }

  const o = overviewQuery.data;

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-indigo-50/40 via-background to-violet-50/30 dark:from-indigo-950/15 dark:via-background dark:to-violet-950/15">
      <div className="w-full px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t('reports.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {t('reports.subtitle')}
          </p>
        </header>

        {/* Chart + side KPI column — Home-style layout */}
        <section className="grid gap-4 lg:grid-cols-3">
          {/* Chart card (2/3) */}
          <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {t('reports.revenueChart.title', { currency: chart.currency })}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('reports.revenueChart.subtitle')}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2.5 py-0.5 font-semibold">
                {chart.currency}
              </span>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="hsl(var(--muted-foreground))"
                    width={50}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                    formatter={(value: number) =>
                      [
                        `${value.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} ${chart.currency}`,
                        t('reports.revenueChart.tooltipLabel'),
                      ] as [string, string]
                    }
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 10,
                      fontSize: 12,
                      boxShadow: '0 10px 30px -10px rgba(0,0,0,.15)',
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    fill="hsl(var(--primary))"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* KPI side column — colorful gradient hero tiles */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-1">
            <KpiCard
              icon={TrendingUp}
              label={t('reports.kpi.revenueYear')}
              value={formatMoneyList(o.totalsThisYear)}
              sub={t('reports.kpi.revenueYearSub')}
              gradient="from-violet-500 to-indigo-600"
            />
            <KpiCard
              icon={Wallet}
              label={t('reports.kpi.revenueMonth')}
              value={formatMoneyList(o.totalsThisMonth)}
              sub={t('reports.kpi.revenueMonthSub')}
              gradient="from-emerald-500 to-teal-600"
            />
            <KpiCard
              icon={Clock}
              label={t('reports.kpi.hoursWeek')}
              value={`${o.hoursThisWeek}h`}
              sub={t('reports.kpi.hoursWeekSub', { month: o.hoursThisMonth })}
              gradient="from-sky-500 to-blue-600"
            />
            <KpiCard
              icon={Briefcase}
              label={t('reports.kpi.activeProjects')}
              value={String(o.activeProjectsCount)}
              sub={t('reports.kpi.outstandingSub', {
                total: formatMoneyList(o.outstandingTotal),
              })}
              gradient="from-amber-500 to-orange-600"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TopClientsCard clients={o.topClients} />
          <OutstandingCard projects={o.outstandingProjects} />
        </div>

        <ActiveProjectsCard projects={o.activeProjects} />
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  gradient,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  /** Tailwind gradient stops, e.g. "from-violet-500 to-indigo-600". */
  gradient: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} text-white p-4 shadow-lg shadow-black/5 ring-1 ring-white/10`}
    >
      <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10 blur-xl pointer-events-none" />
      <div className="relative flex items-start justify-between mb-4">
        <span className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/20 backdrop-blur-sm">
          <Icon className="w-5 h-5" strokeWidth={2.25} />
        </span>
      </div>
      <div className="relative">
        <p className="text-[11px] text-white/80 font-medium uppercase tracking-wider">
          {label}
        </p>
        <p className="text-xl font-bold mt-0.5 truncate tabular-nums tracking-tight">
          {value}
        </p>
        <p className="text-[11px] text-white/70 mt-1 truncate">{sub}</p>
      </div>
    </div>
  );
}

function TopClientsCard({ clients }: { clients: TopClient[] }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <ColoredHeader
        icon={TrendingUp}
        title={t('reports.topClients.title')}
        gradient="from-emerald-50 via-card to-card dark:from-emerald-950/30"
        iconGradient="from-emerald-500 to-teal-600"
      />
      <div className="p-5">
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t('reports.topClients.empty')}
          </p>
        ) : (
          <div className="space-y-1">
            {clients.map((c) => (
              <Link
                key={c.clientId}
                to="/clients"
                className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors"
              >
                <div className={`w-7 h-7 rounded ${c.color} text-white text-[10px] font-semibold flex items-center justify-center shrink-0`}>
                  {c.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() ?? '')
                    .join('')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {t('reports.topClients.projectsLabel', { count: c.projectCount })} ·{' '}
                    {formatHm(c.billableMinutes)}
                  </div>
                </div>
                <div className="text-sm tabular-nums text-foreground shrink-0">
                  {formatMoneyList(c.amounts)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function OutstandingCard({ projects }: { projects: OutstandingProject[] }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <ColoredHeader
        icon={AlertCircle}
        title={t('reports.outstanding.title')}
        gradient="from-amber-50 via-card to-card dark:from-amber-950/30"
        iconGradient="from-amber-500 to-orange-600"
      />
      <div className="p-5">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t('reports.outstanding.empty')}
          </p>
        ) : (
          <div className="space-y-1">
            {projects.map((p) => (
              <Link
                key={p.boardId}
                to={`/workspaces/${p.workspaceId}/boards/${p.boardId}`}
                className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent/50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.clientName ?? t('reports.noClient')} ·{' '}
                    {t('reports.outstanding.daysOutstanding', { days: p.daysOutstanding })}
                  </div>
                </div>
                <div className="text-sm tabular-nums text-foreground shrink-0">
                  {formatMoney(p.amount)}
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ActiveProjectsCard({ projects }: { projects: ActiveProject[] }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <ColoredHeader
        icon={Briefcase}
        title={t('reports.active.title')}
        gradient="from-indigo-50 via-card to-card dark:from-indigo-950/30"
        iconGradient="from-indigo-500 to-violet-600"
      />
      <div className="p-5">
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {t('reports.active.empty')}
        </p>
      ) : (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="text-left font-medium px-3 py-2">{t('reports.active.col.project')}</th>
                <th className="text-left font-medium px-3 py-2">{t('reports.active.col.client')}</th>
                <th className="text-left font-medium px-3 py-2">{t('reports.active.col.billing')}</th>
                <th className="text-right font-medium px-3 py-2">{t('reports.active.col.logged')}</th>
                <th className="text-right font-medium px-3 py-2">{t('reports.active.col.earned')}</th>
                <th className="text-left font-medium px-3 py-2 w-32">{t('reports.active.col.budget')}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.boardId} className="border-t border-border hover:bg-accent/30">
                  <td className="px-3 py-2">
                    <Link
                      to={`/workspaces/${p.workspaceId}/boards/${p.boardId}`}
                      className="font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-foreground/80">
                    {p.clientName ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_TONE[p.projectStatus]}`}
                    >
                      {t(`reports.billingType.${p.billingType}` as never)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatHm(p.loggedMinutes)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(p.earned)}</td>
                  <td className="px-3 py-2">
                    {p.timeUsedRatio !== null ? (
                      <BudgetBar ratio={p.timeUsedRatio} />
                    ) : p.amountUsedRatio !== null ? (
                      <BudgetBar ratio={p.amountUsedRatio} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </section>
  );
}

function BudgetBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  const tone = ratio >= 1 ? 'bg-status-red' : ratio > 0.8 ? 'bg-status-orange' : 'bg-primary';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 rounded-full bg-muted flex-1 overflow-hidden">
        <div className={`h-full ${tone} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-[11px] tabular-nums text-muted-foreground w-9 text-right">{pct}%</span>
    </div>
  );
}
