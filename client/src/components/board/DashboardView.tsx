import { Board, ColumnOption, resolveColumnOptions } from '@/data/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface DashboardViewProps {
  board: Board;
}

/** Map a Tailwind palette class (`bg-status-green`) to its CSS variable. */
function classToCssColor(c: string): string {
  const m = c.match(/^bg-status-([a-z]+)$/);
  return m ? `hsl(var(--status-${m[1]}))` : c;
}

function buildLookup(options: ColumnOption[]) {
  const labels: Record<string, string> = {};
  const colors: Record<string, string> = {};
  for (const opt of options) {
    labels[opt.id] = opt.label;
    colors[opt.id] = classToCssColor(opt.color);
  }
  return { labels, colors };
}

export function DashboardView({ board }: DashboardViewProps) {
  const allTasks = board.groups.flatMap((g) => g.tasks);
  const total = allTasks.length;

  const statusCol = board.columns.find((c) => c.type === 'status');
  const priorityCol = board.columns.find((c) => c.type === 'priority');
  const statusLookup = buildLookup(statusCol ? resolveColumnOptions(statusCol) : []);
  const priorityLookup = buildLookup(priorityCol ? resolveColumnOptions(priorityCol) : []);

  // Status distribution — keyed by option id, surfaced with the per-board label.
  const statusData = Object.entries(
    allTasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1;
      return acc;
    }, {})
  ).map(([key, value]) => ({
    name: statusLookup.labels[key] || key,
    value,
    color: statusLookup.colors[key] || '#888',
  }));

  // Priority distribution
  const priorityData = Object.entries(
    allTasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.priority] = (acc[t.priority] || 0) + 1;
      return acc;
    }, {})
  ).map(([key, value]) => ({
    name: priorityLookup.labels[key] || key,
    value,
    color: priorityLookup.colors[key] || '#888',
  }));

  // Assignee distribution
  const assigneeData = Object.entries(
    allTasks.reduce<Record<string, number>>((acc, t) => {
      const name = t.person?.name || 'Unassigned';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {})
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const ASSIGNEE_COLORS = ['hsl(240,100%,69%)', 'hsl(154,68%,45%)', 'hsl(28,100%,58%)', 'hsl(0,72%,55%)', 'hsl(210,100%,56%)', 'hsl(45,100%,55%)'];

  // Progress average
  const avgProgress = total > 0 ? Math.round(allTasks.reduce((s, t) => s + t.progress, 0) / total) : 0;

  // Group distribution
  const groupData = board.groups.map((g) => ({
    name: g.name,
    tasks: g.tasks.length,
    color: g.color,
  }));

  const renderCustomLabel = ({ name, percent }: { name: string; percent: number }) =>
    `${name} ${(percent * 100).toFixed(0)}%`;

  return (
    <div className="flex-1 overflow-auto px-6 py-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Tasks', value: total, accent: 'text-primary' },
          { label: 'Completed', value: allTasks.filter((t) => t.status === 'done').length, accent: 'text-[hsl(154,68%,45%)]' },
          { label: 'In Progress', value: allTasks.filter((t) => t.status === 'working').length, accent: 'text-[hsl(28,100%,58%)]' },
          { label: 'Avg Progress', value: `${avgProgress}%`, accent: 'text-primary' },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className={`text-3xl font-bold ${card.accent}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Status Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tasks by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={renderCustomLabel}
                  labelLine={false}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Priority Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tasks by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  label={renderCustomLabel}
                  labelLine={false}
                >
                  {priorityData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Assignee Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tasks by Assignee</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={assigneeData} layout="vertical" margin={{ left: 20 }}>
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="Tasks" radius={[0, 4, 4, 0]}>
                  {assigneeData.map((_, i) => (
                    <Cell key={i} fill={ASSIGNEE_COLORS[i % ASSIGNEE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Group Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tasks by Group</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={groupData}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="tasks" name="Tasks" radius={[4, 4, 0, 0]}>
                  {groupData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
