import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Attachment, Board, Task, TaskGroup, StatusType, PriorityType, TaskUpdate, ActivityEntry, Column, ColumnOption, ColumnType, COLUMN_TYPE_LABELS, Person, resolveColumnOptions } from '@/data/types';
import { trpc } from '@/lib/trpc/client';
import { Briefcase as BriefcaseIcon } from 'lucide-react';
import { GroupSection } from './GroupSection';
import { SelectionToolbar } from './SelectionToolbar';
import { DashboardView } from './DashboardView';
import { BudgetView } from './BudgetView';
import { CalendarView } from './CalendarView';
import { ViewSwitcher, BoardViewKind } from './ViewSwitcher';
import { TaskDetailPanel } from './TaskDetailPanel';
import { AutomationsDialog } from './AutomationsDialog';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { Star, Filter, Search, Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';
import { PersonAvatar } from './PersonAvatar';
import { BulkUpdateWizard } from '@/components/wizard/BulkUpdateWizard';
import { OutcomeWizard } from '@/components/wizard/OutcomeWizard';
import { EmptyState } from '@/components/EmptyState';
import { ListTodo, SearchX } from 'lucide-react';

interface BoardViewProps {
  board: Board;
  /** Workspace this board belongs to. Used to build canonical URLs. */
  workspaceId: string;
  /** Task currently selected via URL (`/.../tasks/:taskId`), if any. */
  taskIdFromUrl: string | null;
  onBoardChange: (board: Board) => void;
}

let nextId = 100;
let updateCounter = 0;
let activityCounter = 0;

const CUSTOM_TYPES: ColumnType[] = ['text', 'number', 'date', 'checkbox', 'rating'];
function isCustomType(t: ColumnType): boolean {
  return CUSTOM_TYPES.includes(t);
}

/**
 * Convert a `bg-status-*` Tailwind class (the option-picker palette) to an
 * `hsl(...)` string suitable for inline CSS. Unknown values pass through.
 */
function tailwindClassToHsl(c: string): string {
  const match = c.match(/^bg-status-([a-z]+)$/);
  return match ? `hsl(var(--status-${match[1]}))` : c;
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Filter;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted transition-colors"
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

/**
 * Toolbar trigger used as a Popover trigger. Uses forwardRef via the
 * shadcn Popover asChild, and shows a small dot when the feature is
 * active so users see at a glance that a filter / sort is applied.
 */
const ToolbarTrigger = forwardRef<
  HTMLButtonElement,
  {
    icon: typeof Filter;
    label: string;
    active?: boolean;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ icon: Icon, label, active, ...props }, ref) => (
  <button
    ref={ref}
    className={`relative flex items-center gap-1 text-xs px-2 py-1.5 rounded-md hover:bg-muted transition-colors ${
      active ? 'text-primary bg-primary/10 hover:bg-primary/15' : 'text-muted-foreground hover:text-foreground'
    }`}
    title={label}
    {...props}
  >
    <Icon className="w-3.5 h-3.5" />
    {label}
    {active && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />}
  </button>
));
ToolbarTrigger.displayName = 'ToolbarTrigger';

function PersonFilterItem({
  label,
  checked,
  onToggle,
  avatar,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  avatar: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm ${
        checked ? 'bg-primary/10' : 'hover:bg-muted'
      }`}
    >
      {avatar}
      <span className="flex-1 text-left truncate">{label}</span>
      {checked && <Check className="w-3.5 h-3.5 text-primary" />}
    </button>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-full text-[11px] border capitalize transition-colors ${
        active
          ? 'bg-primary/10 border-primary text-primary'
          : 'border-border text-muted-foreground hover:bg-muted'
      }`}
    >
      {label.replace('-', ' ')}
    </button>
  );
}

function togglePersonId(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function toggleSetItem<T>(prev: Set<T>, item: T): Set<T> {
  const next = new Set(prev);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

type SortField = 'name' | 'status' | 'priority' | 'dueDate' | 'progress';
type SortDir = 'asc' | 'desc';
type GroupByKind = 'default' | 'status' | 'priority' | 'person';

export function BoardView({ board, workspaceId, taskIdFromUrl, onBoardChange }: BoardViewProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<BoardViewKind>('table');
  const [dragInfo, setDragInfo] = useState<{ taskId: string; sourceGroupId: string } | null>(null);
  const [bulkWizardOpen, setBulkWizardOpen] = useState(false);
  const [outcomeTaskId, setOutcomeTaskId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const { members } = useWorkspaces();
  const { user: authUser } = useAuth();
  // Resolve the linked client (if any) to render a badge in the board header.
  // Active-only — archived clients shouldn't show as live badges, but the
  // historical link on the board itself is preserved.
  const { data: activeClients = [] } = trpc.clients.list.useQuery({ status: 'active' });
  const linkedClient = useMemo(
    () => (board.clientId ? activeClients.find((c) => c.id === board.clientId) ?? null : null),
    [activeClients, board.clientId]
  );
  const currentUser: Person = authUser
    ? {
        id: authUser.id,
        name: `${authUser.firstName} ${authUser.lastName}`.trim() || authUser.email,
        initials: authUser.initials,
        color: authUser.color,
        avatar: authUser.avatarUrl ?? undefined,
      }
    : { id: 'anon', name: 'You', initials: '??', color: 'hsl(220 8% 56%)' };

  // Board-scoped keyboard shortcuts: 'n' adds a task to the first group, '/' focuses search.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      const isTyping =
        tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        const first = board.groups[0];
        if (first) {
          e.preventDefault();
          handleAddTask(first.id);
        }
      } else if (e.key === '/') {
        if (searchRef.current) {
          e.preventDefault();
          searchRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.groups[0]?.id]);

  // Toolbar state
  const [filterStatuses, setFilterStatuses] = useState<Set<StatusType>>(new Set());
  const [filterPriorities, setFilterPriorities] = useState<Set<PriorityType>>(new Set());
  const [filterAssignees, setFilterAssignees] = useState<Set<string>>(new Set());
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<{ field: SortField; dir: SortDir } | null>(null);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupByKind>('default');
  const [automationsOpen, setAutomationsOpen] = useState(false);

  // Drawer state — driven entirely by the URL so deep-links (`/.../tasks/:id`)
  // and refresh both restore the open task.
  const [updates, setUpdates] = useState<TaskUpdate[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  const boardUrl = `/workspaces/${workspaceId}/boards/${board.id}`;
  const navigateToBoard = useCallback(
    (opts?: { replace?: boolean }) => navigate(boardUrl, opts),
    [navigate, boardUrl]
  );
  const navigateToTask = useCallback(
    (taskId: string) => navigate(`${boardUrl}/tasks/${taskId}`),
    [navigate, boardUrl]
  );

  const updateGroups = (groups: TaskGroup[]) => {
    onBoardChange({ ...board, groups });
  };

  // Wrap onUpdate with activity-logging.
  const logActivity = (task: Task, prev: Task) => {
    const entries: ActivityEntry[] = [];
    const push = (summary: string) => {
      activityCounter++;
      entries.push({
        id: `act-${Date.now()}-${activityCounter}`,
        taskId: task.id,
        type: 'status_changed',
        actor: currentUser,
        summary,
        createdAt: new Date().toISOString(),
      });
    };
    if (task.status !== prev.status) push(`changed status from "${prev.status}" to "${task.status}"`);
    if (task.priority !== prev.priority) push(`changed priority from "${prev.priority}" to "${task.priority}"`);
    if (task.person?.id !== prev.person?.id)
      push(
        task.person
          ? `assigned task to ${task.person.name}`
          : `unassigned the task`
      );
    if (task.dueDate !== prev.dueDate) push(`updated the due date`);
    if (task.progress !== prev.progress) push(`updated progress to ${task.progress}%`);
    if (task.name !== prev.name) push(`renamed the task`);
    if (entries.length) setActivity((a) => [...entries, ...a]);
  };

  // Updates a task by ID, regardless of which (real or virtual) group
  // the row currently lives under. This lets us also work correctly when
  // the view is grouped by status / priority / person.
  const handleUpdateTask = (_groupId: string, updatedTask: Task) => {
    let prev: Task | undefined;
    const groups = board.groups.map((g) => {
      const idx = g.tasks.findIndex((t) => t.id === updatedTask.id);
      if (idx < 0) return g;
      prev = g.tasks[idx];
      const next = [...g.tasks];
      next[idx] = updatedTask;
      return { ...g, tasks: next };
    });
    updateGroups(groups);
    if (prev) {
      logActivity(updatedTask, prev);
      // Trigger the Outcome Wizard when a task transitions into "done"
      if (prev.status !== 'done' && updatedTask.status === 'done') {
        setOutcomeTaskId(updatedTask.id);
      }
    }
  };

  const handleAddTask = (groupId: string) => {
    nextId++;
    const newTask: Task = {
      id: `new-${nextId}`,
      name: 'New task',
      person: null,
      status: 'not-started',
      priority: 'medium',
      dueDate: null,
      timelineStart: null,
      timelineEnd: null,
      tags: [],
      progress: 0,
      selected: false,
    };
    const groups = board.groups.map((g) =>
      g.id === groupId ? { ...g, tasks: [...g.tasks, newTask] } : g
    );
    updateGroups(groups);
    activityCounter++;
    setActivity((a) => [
      {
        id: `act-${Date.now()}-${activityCounter}`,
        taskId: newTask.id,
        type: 'task_created',
        actor: currentUser,
        summary: 'created this task',
        createdAt: new Date().toISOString(),
      },
      ...a,
    ]);
  };

  // Used by CalendarView when the user clicks a future or today's day cell.
  const handleCreateTaskOnDate = (
    dueDate: string,
    groupId: string,
    name: string
  ) => {
    nextId++;
    const newTask: Task = {
      id: `new-${nextId}`,
      name,
      person: null,
      status: 'not-started',
      priority: 'medium',
      dueDate,
      timelineStart: null,
      timelineEnd: null,
      tags: [],
      progress: 0,
      selected: false,
    };
    const groups = board.groups.map((g) =>
      g.id === groupId ? { ...g, tasks: [...g.tasks, newTask] } : g
    );
    updateGroups(groups);
    activityCounter++;
    setActivity((a) => [
      {
        id: `act-${Date.now()}-${activityCounter}`,
        taskId: newTask.id,
        type: 'task_created',
        actor: currentUser,
        summary: `created this task on ${dueDate}`,
        createdAt: new Date().toISOString(),
      },
      ...a,
    ]);
  };

  const handleToggleCollapse = (groupId: string) => {
    updateGroups(board.groups.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)));
  };

  const handleRenameGroup = (groupId: string, name: string) => {
    updateGroups(board.groups.map((g) => (g.id === groupId ? { ...g, name } : g)));
  };

  // Top-level "New Task" button → adds to the first group (or creates one if none).
  const handleQuickAddTask = () => {
    const first = board.groups[0];
    if (first) {
      handleAddTask(first.id);
      return;
    }
    // If no groups, create one first and then add a task.
    handleAddGroupInternal();
  };

  const handleAddGroupInternal = () => {
    nextId++;
    const colors = ['hsl(240 100% 69%)', 'hsl(154 68% 45%)', 'hsl(28 100% 58%)', 'hsl(0 72% 55%)', 'hsl(210 100% 56%)'];
    const newGroup: TaskGroup = {
      id: `grp-${nextId}`,
      name: 'New Group',
      color: colors[board.groups.length % colors.length],
      collapsed: false,
      tasks: [],
    };
    updateGroups([...board.groups, newGroup]);
  };

  const handleDeleteTask = (taskId: string, _groupId: string) => {
    const groups = board.groups.map((g) => ({
      ...g,
      tasks: g.tasks.filter((t) => t.id !== taskId),
    }));
    updateGroups(groups);
    // Drawer auto-closes via the stale-task effect when the URL no longer matches.
  };

  const handleDuplicateTask = (taskId: string, _groupId: string) => {
    let sourceGroupId: string | undefined;
    let source: Task | undefined;
    for (const g of board.groups) {
      const t = g.tasks.find((tt) => tt.id === taskId);
      if (t) {
        source = t;
        sourceGroupId = g.id;
        break;
      }
    }
    if (!source || !sourceGroupId) return;
    nextId++;
    const copy: Task = {
      ...source,
      id: `new-${nextId}`,
      name: `${source.name} (copy)`,
      selected: false,
    };
    const groups = board.groups.map((grp) =>
      grp.id === sourceGroupId ? { ...grp, tasks: [...grp.tasks, copy] } : grp
    );
    updateGroups(groups);
  };

  const handleDeleteGroup = (groupId: string) => {
    const groups = board.groups.filter((g) => g.id !== groupId);
    updateGroups(groups);
    // Drawer auto-closes via the stale-task effect if the open task lived in this group.
  };

  const handleAddGroup = () => {
    nextId++;
    const colors = ['hsl(240 100% 69%)', 'hsl(154 68% 45%)', 'hsl(28 100% 58%)', 'hsl(0 72% 55%)', 'hsl(210 100% 56%)'];
    const newGroup: TaskGroup = {
      id: `grp-${nextId}`,
      name: 'New Group',
      color: colors[board.groups.length % colors.length],
      collapsed: false,
      tasks: [],
    };
    updateGroups([...board.groups, newGroup]);
  };

  // Drag and drop (table view: move between groups)
  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, taskId: string, groupId: string) => {
    setDragInfo({ taskId, sourceGroupId: groupId });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-projectmgmt-task', taskId);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleGroupDragStart = (e: React.DragEvent, groupId: string) => {
    setDraggedGroupId(groupId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-projectmgmt-group', groupId);
  };
  const handleGroupDragEnd = () => {
    setDraggedGroupId(null);
  };
  const handleDrop = (e: React.DragEvent, targetGroupId: string) => {
    e.preventDefault();

    // Group-level reorder takes priority when the drag originated from a group handle.
    const draggedGroup = e.dataTransfer.getData('application/x-projectmgmt-group');
    if (draggedGroup && draggedGroup !== targetGroupId) {
      const from = board.groups.findIndex((g) => g.id === draggedGroup);
      const to = board.groups.findIndex((g) => g.id === targetGroupId);
      if (from !== -1 && to !== -1) {
        const next = [...board.groups];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        updateGroups(next);
      }
      setDraggedGroupId(null);
      setDragInfo(null);
      return;
    }

    // Task move across groups (existing behavior).
    if (!dragInfo || dragInfo.sourceGroupId === targetGroupId) {
      setDragInfo(null);
      return;
    }
    const sourceGroup = board.groups.find((g) => g.id === dragInfo.sourceGroupId);
    const task = sourceGroup?.tasks.find((t) => t.id === dragInfo.taskId);
    if (!task) {
      setDragInfo(null);
      return;
    }
    const groups = board.groups.map((g) => {
      if (g.id === dragInfo.sourceGroupId) {
        return { ...g, tasks: g.tasks.filter((t) => t.id !== dragInfo.taskId) };
      }
      if (g.id === targetGroupId) {
        return { ...g, tasks: [...g.tasks, task] };
      }
      return g;
    });
    updateGroups(groups);
    setDragInfo(null);
  };

  // Selection actions
  const allTasks = board.groups.flatMap((g) => g.tasks);
  const selectedTasks = allTasks.filter((t) => t.selected);
  const outcomeTask = outcomeTaskId
    ? allTasks.find((t) => t.id === outcomeTaskId) ?? null
    : null;

  const handleDeleteSelected = () => {
    const ids = new Set(selectedTasks.map((t) => t.id));
    updateGroups(board.groups.map((g) => ({ ...g, tasks: g.tasks.filter((t) => !ids.has(t.id)) })));
    toast({
      title: `Deleted ${ids.size} task${ids.size === 1 ? '' : 's'}`,
    });
  };

  const handleDuplicateSelected = () => {
    const ids = new Set(selectedTasks.map((t) => t.id));
    const groups = board.groups.map((g) => {
      const copies = g.tasks
        .filter((t) => ids.has(t.id))
        .map((src) => {
          nextId++;
          return { ...src, id: `new-${nextId}`, name: `${src.name} (copy)`, selected: false };
        });
      return {
        ...g,
        tasks: [...g.tasks.map((t) => (ids.has(t.id) ? { ...t, selected: false } : t)), ...copies],
      };
    });
    updateGroups(groups);
    toast({ title: `Duplicated ${ids.size} task${ids.size === 1 ? '' : 's'}` });
  };

  const handleArchiveSelected = () => {
    const ids = new Set(selectedTasks.map((t) => t.id));
    // Server soft-archives on delete (sets archivedAt); removing here routes
    // through task.delete via diffBoard, so archives persist.
    updateGroups(
      board.groups.map((g) => ({
        ...g,
        tasks: g.tasks.filter((t) => !ids.has(t.id)),
      }))
    );
    toast({
      title: `Archived ${ids.size} task${ids.size === 1 ? '' : 's'}`,
      description: 'Archived tasks are hidden from views.',
    });
  };

  const handleMoveSelectedTo = (targetGroupId: string) => {
    const ids = new Set(selectedTasks.map((t) => t.id));
    // Collect selected tasks across all groups (in original order).
    const moving: Task[] = [];
    for (const g of board.groups) {
      for (const t of g.tasks) {
        if (ids.has(t.id)) moving.push({ ...t, selected: false });
      }
    }
    if (moving.length === 0) return;
    const groups = board.groups.map((g) => {
      if (g.id === targetGroupId) {
        // Drop already-present copies (they're leaving their old group next line) then append.
        return { ...g, tasks: [...g.tasks.filter((t) => !ids.has(t.id)), ...moving] };
      }
      return { ...g, tasks: g.tasks.filter((t) => !ids.has(t.id)) };
    });
    updateGroups(groups);
    const target = board.groups.find((g) => g.id === targetGroupId);
    toast({
      title: `Moved ${moving.length} task${moving.length === 1 ? '' : 's'}`,
      description: target ? `→ ${target.name}` : undefined,
    });
  };

  const handleExportSelected = () => {
    const rows = selectedTasks.map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      priority: t.priority,
      person: t.person?.name ?? '',
      dueDate: t.dueDate ?? '',
      timelineStart: t.timelineStart ?? '',
      timelineEnd: t.timelineEnd ?? '',
      tags: t.tags.join('; '),
      progress: t.progress,
    }));
    const headers = Object.keys(rows[0] ?? {
      id: '', name: '', status: '', priority: '', person: '',
      dueDate: '', timelineStart: '', timelineEnd: '', tags: '', progress: '',
    });
    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const v = String((r as Record<string, unknown>)[h] ?? '');
            // quote if contains comma, quote, or newline
            return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${board.name.replace(/[^a-z0-9]+/gi, '_')}_${rows.length}_tasks.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: `Exported ${rows.length} task${rows.length === 1 ? '' : 's'} to CSV` });
  };
  const handleBulkStatusChange = (status: StatusType) => {
    const ids = new Set(selectedTasks.map((t) => t.id));
    updateGroups(
      board.groups.map((g) => ({
        ...g,
        tasks: g.tasks.map((t) => (ids.has(t.id) ? { ...t, status, selected: false } : t)),
      }))
    );
  };
  const handleBulkPriorityChange = (priority: PriorityType) => {
    const ids = new Set(selectedTasks.map((t) => t.id));
    updateGroups(
      board.groups.map((g) => ({
        ...g,
        tasks: g.tasks.map((t) => (ids.has(t.id) ? { ...t, priority, selected: false } : t)),
      }))
    );
  };

  /**
   * Generic bulk patcher for the BulkUpdateWizard. For `tags`, the patch is
   * additive (appended without duplicates); all other keys overwrite.
   */
  const handleBulkPatch = (patch: Partial<Task>) => {
    const ids = new Set(selectedTasks.map((t) => t.id));
    updateGroups(
      board.groups.map((g) => ({
        ...g,
        tasks: g.tasks.map((t) => {
          if (!ids.has(t.id)) return t;
          const next: Task = { ...t, selected: false };
          for (const [rawKey, rawValue] of Object.entries(patch)) {
            if (rawKey === 'tags' && Array.isArray(rawValue)) {
              const existing = new Set(t.tags ?? []);
              for (const tag of rawValue) existing.add(tag);
              next.tags = Array.from(existing);
            } else {
              (next as unknown as Record<string, unknown>)[rawKey] = rawValue;
            }
          }
          return next;
        }),
      }))
    );
  };

  const handleDeselectAll = () => {
    updateGroups(board.groups.map((g) => ({ ...g, tasks: g.tasks.map((t) => ({ ...t, selected: false })) })));
  };

  // Count updates per task so TaskRow can show the comment-bubble badge
  const updateCountByTaskId = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of updates) counts[u.taskId] = (counts[u.taskId] ?? 0) + 1;
    return counts;
  }, [updates]);

  // ---------- Derived: filtered + sorted + (optionally) virtually-grouped rows
  const visibleColumns = useMemo(
    () => board.columns.filter((c) => !hiddenColumnIds.has(c.id)),
    [board.columns, hiddenColumnIds]
  );

  // The board's authoritative status / priority option lists — used by every
  // filter, bulk wizard, dashboard view that needs to know the current labels.
  const boardStatusOptions: ColumnOption[] = useMemo(() => {
    const col = board.columns.find((c) => c.type === 'status');
    return col ? resolveColumnOptions(col) : [];
  }, [board.columns]);
  const boardPriorityOptions: ColumnOption[] = useMemo(() => {
    const col = board.columns.find((c) => c.type === 'priority');
    return col ? resolveColumnOptions(col) : [];
  }, [board.columns]);

  const visibleGroups = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    const passes = (t: Task) => {
      if (t.archived) return false;
      if (lowerSearch && !t.name.toLowerCase().includes(lowerSearch)) return false;
      if (filterStatuses.size && !filterStatuses.has(t.status)) return false;
      if (filterPriorities.size && !filterPriorities.has(t.priority)) return false;
      if (filterAssignees.size) {
        const pid = t.person?.id ?? '__unassigned';
        if (!filterAssignees.has(pid)) return false;
      }
      if (filterTags.size) {
        const taskTags = t.tags ?? [];
        if (!taskTags.some((tag) => filterTags.has(tag))) return false;
      }
      return true;
    };

    // Per-board option order drives sort rank — first option = rank 0.
    const statusCol = board.columns.find((c) => c.type === 'status');
    const priorityCol = board.columns.find((c) => c.type === 'priority');
    const statusOptions = statusCol ? resolveColumnOptions(statusCol) : [];
    const priorityOptions = priorityCol ? resolveColumnOptions(priorityCol) : [];
    const rankOf = (opts: typeof statusOptions, value: string) => {
      const idx = opts.findIndex((o) => o.id === value);
      return idx === -1 ? opts.length : idx;
    };
    const sortTasks = (tasks: Task[]): Task[] => {
      if (!sortBy) return tasks;
      const dir = sortBy.dir === 'asc' ? 1 : -1;
      const cmp = (a: Task, b: Task): number => {
        switch (sortBy.field) {
          case 'name': return a.name.localeCompare(b.name) * dir;
          case 'status': return (rankOf(statusOptions, a.status) - rankOf(statusOptions, b.status)) * dir;
          case 'priority': return (rankOf(priorityOptions, a.priority) - rankOf(priorityOptions, b.priority)) * dir;
          case 'dueDate': {
            const av = a.dueDate ?? '';
            const bv = b.dueDate ?? '';
            if (!av && !bv) return 0;
            if (!av) return 1; // nulls last
            if (!bv) return -1;
            return av.localeCompare(bv) * dir;
          }
          case 'progress': return (a.progress - b.progress) * dir;
        }
      };
      return [...tasks].sort(cmp);
    };

    if (groupBy === 'default') {
      return board.groups.map((g) => ({
        ...g,
        tasks: sortTasks(g.tasks.filter(passes)),
      }));
    }

    const allTasks = board.groups.flatMap((g) => g.tasks).filter(passes);

    if (groupBy === 'status') {
      return statusOptions
        .map((opt) => ({
          id: `virtual-status-${opt.id}`,
          name: opt.label,
          color: tailwindClassToHsl(opt.color),
          collapsed: false,
          tasks: sortTasks(allTasks.filter((t) => t.status === opt.id)),
        }))
        .filter((g) => g.tasks.length > 0);
    }

    if (groupBy === 'priority') {
      return priorityOptions
        .map((opt) => ({
          id: `virtual-priority-${opt.id}`,
          name: opt.label,
          color: tailwindClassToHsl(opt.color),
          collapsed: false,
          tasks: sortTasks(allTasks.filter((t) => t.priority === opt.id)),
        }))
        .filter((g) => g.tasks.length > 0);
    }

    // groupBy === 'person'
    const byPerson = new Map<string, { name: string; color: string; tasks: Task[] }>();
    for (const t of allTasks) {
      const key = t.person?.id ?? '__unassigned';
      const entry = byPerson.get(key) ?? {
        name: t.person?.name ?? 'Unassigned',
        color: t.person?.color ?? 'hsl(220 8% 56%)',
        tasks: [],
      };
      entry.tasks.push(t);
      byPerson.set(key, entry);
    }
    return Array.from(byPerson.entries()).map(([k, v]) => ({
      id: `virtual-person-${k}`,
      name: v.name,
      color: v.color,
      collapsed: false,
      tasks: sortTasks(v.tasks),
    }));
  }, [
    board.groups,
    searchTerm,
    filterStatuses,
    filterPriorities,
    filterAssignees,
    filterTags,
    sortBy,
    groupBy,
  ]);

  const isDefaultGrouping = groupBy === 'default';

  // Drawer — derived from the URL `taskId` segment, not local state.
  const activeTaskGroup = useMemo(() => {
    if (!taskIdFromUrl) return null;
    for (const group of board.groups) {
      const task = group.tasks.find((t) => t.id === taskIdFromUrl);
      if (task) return { task, group };
    }
    return null;
  }, [taskIdFromUrl, board]);

  // If the URL points at a task that no longer exists (deleted, moved off
  // this board, stale link), drop the segment so the URL stays canonical.
  // Skip this while groups haven't loaded yet — otherwise we'd strip the
  // taskId during the initial render before the board data arrives.
  useEffect(() => {
    if (taskIdFromUrl && !activeTaskGroup && board.groups.length > 0) {
      navigateToBoard({ replace: true });
    }
  }, [taskIdFromUrl, activeTaskGroup, board.groups.length, navigateToBoard]);

  const handleOpenDetail = (taskId: string, _groupId: string) => {
    navigateToTask(taskId);
  };

  const handleAddUpdate = (
    taskId: string,
    payload: { content: string; mentions: string[]; attachments: Attachment[] }
  ) => {
    updateCounter++;
    setUpdates((u) => [
      {
        id: `u-${Date.now()}-${updateCounter}`,
        taskId,
        author: currentUser,
        content: payload.content,
        mentions: payload.mentions,
        attachments: payload.attachments,
        likedBy: [],
        createdAt: new Date().toISOString(),
      },
      ...u,
    ]);
    activityCounter++;
    setActivity((a) => [
      {
        id: `act-${Date.now()}-${activityCounter}`,
        taskId,
        type: 'comment_added',
        actor: currentUser,
        summary: 'posted an update',
        createdAt: new Date().toISOString(),
      },
      ...a,
    ]);
  };

  const handleDeleteTaskFromDrawer = (taskId: string) => {
    updateGroups(
      board.groups.map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.id !== taskId) }))
    );
    navigateToBoard();
  };

  // ---------- Column management ----------
  const updateColumns = (columns: Column[]) => {
    onBoardChange({ ...board, columns });
  };

  const handleAddColumn = (type: ColumnType) => {
    nextId++;
    const label = COLUMN_TYPE_LABELS[type];
    // Unique name per board (append number if duplicate)
    let name = label;
    let suffix = 2;
    while (board.columns.some((c) => c.name === name)) {
      name = `${label} ${suffix++}`;
    }
    const newColumn: Column = {
      id: `col-${nextId}-${Date.now()}`,
      name,
      type,
    };
    updateColumns([...board.columns, newColumn]);
  };

  const handleRenameColumn = (columnId: string, newName: string) => {
    updateColumns(board.columns.map((c) => (c.id === columnId ? { ...c, name: newName } : c)));
  };

  const handleDeleteColumn = (columnId: string) => {
    const target = board.columns.find((c) => c.id === columnId);
    if (!target) return;
    const nextColumns = board.columns.filter((c) => c.id !== columnId);
    onBoardChange({
      ...board,
      columns: nextColumns,
      // For custom-type columns, also clean up customCells values on every task
      ...(isCustomType(target.type)
        ? {
            groups: board.groups.map((g) => ({
              ...g,
              tasks: g.tasks.map((t) => {
                if (!t.customCells || !(columnId in t.customCells)) return t;
                const { [columnId]: _removed, ...rest } = t.customCells;
                return { ...t, customCells: rest };
              }),
            })),
          }
        : {}),
    });
  };

  const handleMoveColumn = (columnId: string, direction: 'left' | 'right') => {
    const idx = board.columns.findIndex((c) => c.id === columnId);
    if (idx < 0) return;
    const swapWith = direction === 'left' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= board.columns.length) return;
    const next = [...board.columns];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    updateColumns(next);
  };

  const handleColumnOptionsChange = (columnId: string, options: ColumnOption[]) => {
    updateColumns(
      board.columns.map((c) => (c.id === columnId ? { ...c, options } : c))
    );
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView board={board} />;
      case 'budget':
        return <BudgetView boardId={board.id} />;
      case 'calendar':
        return (
          <CalendarView
            board={board}
            onUpdateTask={handleUpdateTask}
            onOpenDetail={handleOpenDetail}
            onCreateTaskOnDate={handleCreateTaskOnDate}
          />
        );
      case 'table':
      default:
        return (
          <>
            <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
              {visibleGroups.length === 0 ? (
                (() => {
                  const boardHasAnyTask = board.groups.some(
                    (g) => g.tasks.some((t) => !t.archived)
                  );
                  if (boardHasAnyTask) {
                    return (
                      <EmptyState
                        icon={SearchX}
                        title="No matching tasks"
                        description="Try clearing filters, search, or group-by to see more tasks."
                      />
                    );
                  }
                  return (
                    <EmptyState
                      icon={ListTodo}
                      title="This board is empty"
                      description="Kick things off by adding your first task, or import from a CSV."
                      actionLabel="Add a task"
                      onAction={() => {
                        const first = board.groups[0];
                        if (first) handleAddTask(first.id);
                      }}
                    />
                  );
                })()
              ) : (
                visibleGroups.map((group) => (
                  <GroupSection
                    key={group.id}
                    group={group}
                    columns={visibleColumns}
                    updateCountByTaskId={updateCountByTaskId}
                    onUpdateTask={handleUpdateTask}
                    onAddTask={handleAddTask}
                    onToggleCollapse={handleToggleCollapse}
                    onRenameGroup={handleRenameGroup}
                    // Group-level mutations only make sense for real groups
                    onDeleteGroup={isDefaultGrouping ? handleDeleteGroup : undefined}
                    onDeleteTask={handleDeleteTask}
                    onDuplicateTask={handleDuplicateTask}
                    onOpenDetail={handleOpenDetail}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onGroupDragStart={isDefaultGrouping ? handleGroupDragStart : undefined}
                    onGroupDragEnd={handleGroupDragEnd}
                    isDragging={draggedGroupId === group.id}
                    onAddColumn={handleAddColumn}
                    onRenameColumn={handleRenameColumn}
                    onDeleteColumn={handleDeleteColumn}
                    onMoveColumn={handleMoveColumn}
                    onColumnOptionsChange={handleColumnOptionsChange}
                  />
                ))
              )}

              {isDefaultGrouping && (
                <button
                  onClick={handleAddGroup}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary px-2 py-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add new group
                </button>
              )}
            </div>

            <SelectionToolbar
              selectedCount={selectedTasks.length}
              groups={board.groups}
              statusOptions={boardStatusOptions}
              priorityOptions={boardPriorityOptions}
              onDelete={handleDeleteSelected}
              onDuplicate={handleDuplicateSelected}
              onExport={handleExportSelected}
              onArchive={handleArchiveSelected}
              onMoveTo={handleMoveSelectedTo}
              onStatusChange={handleBulkStatusChange}
              onPriorityChange={handleBulkPriorityChange}
              onOpenBulkWizard={() => setBulkWizardOpen(true)}
              onDeselectAll={handleDeselectAll}
            />

            <BulkUpdateWizard
              open={bulkWizardOpen}
              onOpenChange={setBulkWizardOpen}
              selectedCount={selectedTasks.length}
              groups={board.groups}
              statusOptions={boardStatusOptions}
              priorityOptions={boardPriorityOptions}
              onApplyPatch={handleBulkPatch}
              onMoveTo={handleMoveSelectedTo}
              onArchive={handleArchiveSelected}
              onDelete={handleDeleteSelected}
            />

            <OutcomeWizard
              open={outcomeTaskId !== null}
              onOpenChange={(o) => !o && setOutcomeTaskId(null)}
              task={outcomeTask}
              groups={board.groups}
              onCreateFollowup={(input) => {
                nextId++;
                const newTask: Task = {
                  id: `new-${nextId}`,
                  name: input.name,
                  person: input.assigneeId
                    ? members.find((p) => p.id === input.assigneeId) ?? null
                    : null,
                  status: 'not-started',
                  priority: 'medium',
                  dueDate: input.dueDate ?? null,
                  timelineStart: null,
                  timelineEnd: null,
                  tags: [],
                  progress: 0,
                  selected: false,
                };
                updateGroups(
                  board.groups.map((g) =>
                    g.id === input.groupId
                      ? { ...g, tasks: [...g.tasks, newTask] }
                      : g
                  )
                );
              }}
              onAssignReview={(input) => {
                const reviewer = members.find((p) => p.id === input.reviewerId);
                if (!reviewer) return;
                updateGroups(
                  board.groups.map((g) => ({
                    ...g,
                    tasks: g.tasks.map((t) =>
                      t.id === input.taskId
                        ? {
                            ...t,
                            person: reviewer,
                            dueDate: input.dueDate ?? t.dueDate,
                          }
                        : t
                    ),
                  }))
                );
              }}
              onAddNote={(taskId, note) =>
                handleAddUpdate(taskId, {
                  content: note,
                  mentions: [],
                  attachments: [],
                })
              }
            />
          </>
        );
    }
  };

  // Toolbar helper — only Status filter is exposed in the UI now, but the
  // underlying filter sets (priority/assignee/tags) still feed the rendering
  // pipeline if/when they're set programmatically.
  const filtersActive =
    filterStatuses.size > 0 ||
    filterPriorities.size > 0 ||
    filterAssignees.size > 0 ||
    filterTags.size > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Board header — three rows: title / tabs / toolbar */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 border-b border-border shrink-0">
        {/* Row 1: title + favorite + visibility */}
        <div className="flex items-center gap-2 sm:gap-3 mb-1 flex-wrap">
          <h1 className="text-lg sm:text-xl font-bold text-foreground truncate max-w-full">
            {board.name}
          </h1>
          <button
            onClick={() => onBoardChange({ ...board, favorite: !board.favorite })}
            className="hover:scale-110 transition-transform"
            title={board.favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star
              className={`w-5 h-5 ${
                board.favorite ? 'fill-status-yellow text-status-yellow' : 'text-muted-foreground'
              }`}
            />
          </button>

          {/* Client picker — only renders when a client is linked. Use the
              Project details tab to set one initially or change it. */}
          {linkedClient && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                title={`Linked to ${linkedClient.company ?? linkedClient.name}`}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-all border shadow-sm border-border bg-card text-foreground hover:bg-muted"
              >
                <span className={`w-2.5 h-2.5 rounded-sm ${linkedClient.color}`} />
                <BriefcaseIcon className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium">{linkedClient.name}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                Client
              </div>
              <button
                onClick={() => onBoardChange({ ...board, clientId: null })}
                className={`w-full flex items-center gap-2 px-2 py-2 text-xs rounded-sm text-left ${
                  !board.clientId ? 'bg-muted' : 'hover:bg-muted'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-sm border border-border" />
                <span className="flex-1 text-muted-foreground italic">
                  No client (internal)
                </span>
                {!board.clientId && (
                  <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                )}
              </button>
              {activeClients.length > 0 && (
                <div className="border-t border-border my-1" />
              )}
              <div className="max-h-60 overflow-y-auto">
                {activeClients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      onBoardChange({ ...board, clientId: c.id })
                    }
                    className={`w-full flex items-center gap-2 px-2 py-2 text-xs rounded-sm text-left ${
                      board.clientId === c.id ? 'bg-muted' : 'hover:bg-muted'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-sm shrink-0 ${c.color}`}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="font-medium block truncate">
                        {c.name}
                      </span>
                      {c.company && (
                        <span className="block text-[10px] text-muted-foreground truncate">
                          {c.company}
                        </span>
                      )}
                    </span>
                    {board.clientId === c.id && (
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
              {activeClients.length === 0 && (
                <p className="px-2 py-3 text-[11px] text-muted-foreground">
                  No active clients yet —{' '}
                  <Link to="/clients" className="text-primary hover:underline">
                    add one
                  </Link>{' '}
                  to link.
                </p>
              )}
            </PopoverContent>
          </Popover>
          )}

          <div className="flex-1" />
        </div>

        {/* Client + description subtitle so it's obvious who the project is for */}
        {(linkedClient || board.description) && (
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
            {linkedClient && (
              <span className="text-muted-foreground">
                Project for{' '}
                <span className="text-foreground font-medium">
                  {linkedClient.company ?? linkedClient.name}
                </span>
              </span>
            )}
            {linkedClient && board.description && (
              <span className="text-muted-foreground/50">·</span>
            )}
            {board.description && (
              <span className="text-muted-foreground">{board.description}</span>
            )}
          </div>
        )}

        {/* Row 2: view tabs */}
        <div className="flex items-end gap-2 mt-3 -mb-px">
          <ViewSwitcher value={activeView} onChange={setActiveView} />
        </div>
      </div>

      {/* Toolbar row (sticky under the tabs) */}
      <div className="px-4 sm:px-6 py-2.5 border-b border-border shrink-0 bg-gradient-to-r from-indigo-50/60 via-card to-card dark:from-indigo-950/30">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            onClick={handleQuickAddTask}
            className="h-8 gap-1 px-3 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            New Task
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          <div className="flex items-center bg-card border border-border rounded-md px-2 py-1 gap-1.5">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              placeholder="Search"
              className="bg-transparent text-xs outline-none w-28 placeholder:text-muted-foreground"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {/* Filter (status only) */}
          <Popover>
            <PopoverTrigger asChild>
              <ToolbarTrigger icon={Filter} label="Filter" active={filtersActive} />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-2 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Status
                  </span>
                  {filterStatuses.size > 0 && (
                    <button
                      onClick={() => setFilterStatuses(new Set())}
                      className="text-[11px] text-primary hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {boardStatusOptions.map((opt) => (
                    <FilterChip
                      key={opt.id}
                      label={opt.label}
                      active={filterStatuses.has(opt.id)}
                      onClick={() =>
                        setFilterStatuses((prev) => toggleSetItem(prev, opt.id))
                      }
                    />
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

        </div>
      </div>

      {/* View body + inline task detail panel */}
      <div className="flex-1 flex overflow-hidden">
        <div
          className={`flex-1 flex flex-col overflow-hidden ${
            activeTaskGroup ? 'hidden md:flex' : 'flex'
          }`}
        >
          {renderActiveView()}
        </div>
        {activeTaskGroup && (
          <TaskDetailPanel
            task={activeTaskGroup.task}
            columns={board.columns}
            groupName={activeTaskGroup.group.name}
            boardName={board.name}
            updates={updates}
            activity={activity}
            currentUser={currentUser}
            onClose={() => navigateToBoard()}
            onUpdate={(t) => handleUpdateTask(activeTaskGroup.group.id, t)}
            onAddUpdate={handleAddUpdate}
            onDelete={handleDeleteTaskFromDrawer}
            onColumnOptionsChange={handleColumnOptionsChange}
          />
        )}
      </div>

      <AutomationsDialog
        board={board}
        open={automationsOpen}
        onOpenChange={setAutomationsOpen}
      />
    </div>
  );
}
