import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Hourglass,
  ListChecks,
  PlayCircle,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type {
  CurrencyAmount,
  RevenueByMonth,
  SessionStats,
} from '@projectmgmt/shared';
import { trpc } from '@/lib/trpc/client';
import { Skeleton } from '@/components/ui/skeleton';
import { ColoredHeader } from '@/components/ColoredHeader';

const EMPTY_SESSION_STATS: SessionStats = {
  total: 0,
  pending: 0,
  inProgress: 0,
  invoiced: 0,
  completed: 0,
};

function formatMoney(c: CurrencyAmount | undefined): string {
  if (!c) return '—';
  return `${(c.amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${c.currency}`;
}

function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

interface ChartPoint {
  month: string;
  label: string;
  earned: number;
  hours: number;
}

function buildChart(revenue: RevenueByMonth[] | undefined): {
  data: ChartPoint[];
  currency: string;
  total: number;
} {
  if (!revenue || revenue.length === 0) {
    return { data: [], currency: 'USD', total: 0 };
  }
  const counts = new Map<string, number>();
  for (const m of revenue) for (const a of m.amounts) counts.set(a.currency, (counts.get(a.currency) ?? 0) + a.amount);
  const dominant = [...counts.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'USD';
  let total = 0;
  const data = revenue.map((m) => {
    const earnedMinor = m.amounts.find((a) => a.currency === dominant)?.amount ?? 0;
    total += earnedMinor;
    return {
      month: m.month,
      label: format(parseISO(m.month), 'MMM'),
      earned: Math.round(earnedMinor / 100),
      hours: Math.round((m.loggedMinutes / 60) * 10) / 10,
    };
  });
  return { data, currency: dominant, total };
}

interface StatusCardProps {
  icon: typeof PlayCircle;
  label: string;
  value: string;
  sub: string;
  /** Tailwind gradient stops, e.g. "from-emerald-500 to-emerald-600". */
  gradient: string;
  /** Soft tint used for the icon bubble background. */
  iconBg: string;
  loading?: boolean;
}

function StatusCard({ icon: Icon, label, value, sub, gradient, iconBg, loading }: StatusCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} text-white p-5 shadow-lg shadow-black/5 ring-1 ring-white/10`}
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
      <div className="relative flex items-start justify-between mb-6">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg} backdrop-blur-sm`}>
          <Icon className="w-5 h-5" strokeWidth={2.25} />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-white/70 font-medium">
          {sub}
        </span>
      </div>
      <div className="relative">
        <p className="text-xs text-white/80 font-medium uppercase tracking-wider">{label}</p>
        {loading ? (
          <Skeleton className="h-9 w-20 mt-1 bg-white/20" />
        ) : (
          <p className="text-3xl font-bold mt-1 tabular-nums tracking-tight">{value}</p>
        )}
      </div>
    </div>
  );
}

interface KpiCardProps {
  icon: typeof PlayCircle;
  label: string;
  value: string;
  sub?: string;
  iconTone: string;
  loading?: boolean;
}

function KpiCard({ icon: Icon, label, value, sub, iconTone, loading }: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow min-w-0">
      <span
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconTone}`}
      >
        <Icon className="w-5 h-5" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </p>
        {loading ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <p className="text-xl font-bold mt-0.5 truncate tabular-nums tracking-tight">{value}</p>
        )}
        {sub && !loading && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { data: overview, isLoading: overviewLoading } =
    trpc.reports.overview.useQuery();
  const { data: clients = [], isLoading: clientsLoading } =
    trpc.clients.list.useQuery({});

  const sessionStats = overview?.sessionStats ?? EMPTY_SESSION_STATS;
  const recentClients = clients.slice(0, 5);
  const activeClientCount = clients.filter((c) => c.status === 'active').length;
  const topClients = overview?.topClients.slice(0, 5) ?? [];

  const chart = useMemo(() => buildChart(overview?.revenueByMonth), [overview?.revenueByMonth]);

  return (
    <div className="flex-1 overflow-y-auto bg-gradient-to-br from-indigo-50/60 via-background to-violet-50/40 dark:from-indigo-950/20 dark:via-background dark:to-violet-950/15">
      <div className="w-full px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-6">
        {/* Status hero — 4 colorful gradient cards */}
        <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatusCard
            icon={ListChecks}
            label="Total projects"
            value={String(sessionStats.total)}
            sub="All time"
            gradient="from-indigo-600 to-violet-700"
            iconBg="bg-white/15 text-white"
            loading={overviewLoading}
          />
          <StatusCard
            icon={Hourglass}
            label="Pending"
            value={String(sessionStats.pending)}
            sub="Proposal"
            gradient="from-amber-500 to-orange-600"
            iconBg="bg-white/20 text-white"
            loading={overviewLoading}
          />
          <StatusCard
            icon={PlayCircle}
            label="In progress"
            value={String(sessionStats.inProgress)}
            sub="Active"
            gradient="from-sky-500 to-blue-600"
            iconBg="bg-white/20 text-white"
            loading={overviewLoading}
          />
          <StatusCard
            icon={CheckCircle2}
            label="Completed"
            value={String(sessionStats.completed)}
            sub={sessionStats.invoiced > 0 ? `+${sessionStats.invoiced} invoiced` : 'Paid'}
            gradient="from-emerald-500 to-teal-600"
            iconBg="bg-white/20 text-white"
            loading={overviewLoading}
          />
        </section>

        {/* Chart + side stats */}
        <section className="grid gap-4 lg:grid-cols-3">
          {/* Chart */}
          <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
            <ColoredHeader
              icon={TrendingUp}
              title="Revenue · last 12 months"
              subtitle={
                overviewLoading
                  ? '…'
                  : chart.total > 0
                    ? `Total earned: ${(chart.total / 100).toLocaleString()} ${chart.currency}`
                    : 'No billable time logged yet.'
              }
              gradient="from-violet-50 via-card to-card dark:from-violet-950/30"
              iconGradient="from-violet-500 to-indigo-600"
              trailing={
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2.5 py-0.5 font-semibold bg-card/60">
                  {chart.currency}
                </span>
              }
            />
            <div className="h-64 -ml-2 p-4">
              {overviewLoading ? (
                <Skeleton className="h-full w-full rounded-md" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart.data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 10,
                        fontSize: 12,
                        boxShadow: '0 10px 30px -10px rgba(0,0,0,.15)',
                      }}
                      formatter={(value: number) => [`${value.toLocaleString()} ${chart.currency}`, 'Earned']}
                    />
                    <Area
                      type="monotone"
                      dataKey="earned"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2.5}
                      fill="url(#rev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Side stats */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-1">
            <KpiCard
              icon={Wallet}
              label="Revenue · YTD"
              value={formatMoney(overview?.totalsThisYear[0])}
              sub="This year"
              iconTone="bg-violet-500/15 text-violet-600 dark:text-violet-300"
              loading={overviewLoading}
            />
            <KpiCard
              icon={TrendingUp}
              label="Revenue · MTD"
              value={formatMoney(overview?.totalsThisMonth[0])}
              sub="This month"
              iconTone="bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
              loading={overviewLoading}
            />
            <KpiCard
              icon={AlertCircle}
              label="Outstanding"
              value={formatMoney(overview?.outstandingTotal[0])}
              sub="Awaiting payment"
              iconTone="bg-rose-500/15 text-rose-600 dark:text-rose-300"
              loading={overviewLoading}
            />
            <KpiCard
              icon={Clock}
              label="Hours · this month"
              value={formatHours(overview?.hoursThisMonth ? overview.hoursThisMonth * 60 : 0)}
              sub={`Week: ${formatHours(overview?.hoursThisWeek ? overview.hoursThisWeek * 60 : 0)}`}
              iconTone="bg-cyan-500/15 text-cyan-600 dark:text-cyan-300"
              loading={overviewLoading}
            />
          </div>
        </section>

        {/* Tables */}
        <section className="grid gap-4 lg:grid-cols-2">
          {/* Recent clients */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <ColoredHeader
              icon={Users}
              title="Recent clients"
              subtitle={
                clientsLoading
                  ? '…'
                  : `${activeClientCount} active · ${clients.length} total`
              }
              gradient="from-amber-50 via-card to-card dark:from-amber-950/30"
              iconGradient="from-amber-500 to-orange-600"
              trailing={
                <Link
                  to="/clients"
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  View all <ArrowUpRight className="w-3 h-3" />
                </Link>
              }
            />
            {clientsLoading ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentClients.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-medium">No clients yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add your first client to get started.
                </p>
                <Link
                  to="/clients"
                  className="inline-block mt-4 text-xs font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Add client
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-6 py-2.5">Client</th>
                    <th className="text-left font-semibold px-3 py-2.5">Country</th>
                    <th className="text-left font-semibold px-3 py-2.5">Status</th>
                    <th className="text-right font-semibold px-6 py-2.5">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClients.map((c) => (
                    <tr key={c.id} className="border-t border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold text-white shrink-0 shadow-sm ${c.color}`}
                          >
                            {c.name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((p) => p[0]?.toUpperCase())
                              .join('')}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {c.company ?? c.email ?? '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-foreground/70 text-xs truncate">{c.country ?? '—'}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
                            c.status === 'active'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : c.status === 'archived'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-xs tabular-nums font-medium">
                        {c.defaultHourlyRate > 0
                          ? `${(c.defaultHourlyRate / 100).toFixed(0)} ${c.currency}/h`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>

          {/* Top clients by revenue */}
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <ColoredHeader
              icon={TrendingUp}
              title="Top clients by revenue"
              subtitle="Across all currencies"
              gradient="from-emerald-50 via-card to-card dark:from-emerald-950/30"
              iconGradient="from-emerald-500 to-teal-600"
              trailing={
                <Link
                  to="/reports"
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                >
                  See reports <ArrowUpRight className="w-3 h-3" />
                </Link>
              }
            />
            {overviewLoading ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : topClients.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-medium">No revenue yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  Start a timer on any task to populate this list.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[480px]">
                <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-6 py-2.5">Client</th>
                    <th className="text-right font-semibold px-3 py-2.5">Projects</th>
                    <th className="text-right font-semibold px-3 py-2.5">Hours</th>
                    <th className="text-right font-semibold px-6 py-2.5">Earned</th>
                  </tr>
                </thead>
                <tbody>
                  {topClients.map((c) => (
                    <tr key={c.clientId} className="border-t border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold text-white shrink-0 shadow-sm ${c.color}`}
                          >
                            {c.name
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((p) => p[0]?.toUpperCase())
                              .join('')}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{c.name}</div>
                            {c.company && (
                              <div className="text-xs text-muted-foreground truncate">
                                {c.company}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums">{c.projectCount}</td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums">
                        {formatHours(c.billableMinutes)}
                      </td>
                      <td className="px-6 py-3 text-right text-xs font-semibold tabular-nums">
                        {formatMoney(c.amounts[0])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
