import { useMemo, useState } from 'react';
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  parseISO,
  setMonth,
  setYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  eachDayOfInterval,
} from 'date-fns';
import {
  Board,
  Task,
  ColumnOption,
  FALLBACK_OPTION,
  resolveColumnOptions,
} from '@/data/types';
import { ChevronLeft, ChevronRight, ChevronDown, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getGermanHoliday } from '@/lib/calendar/germanHolidays';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PersonAvatar } from './PersonAvatar';

interface CalendarViewProps {
  board: Board;
  onUpdateTask: (groupId: string, task: Task) => void;
  onOpenDetail: (taskId: string, groupId: string) => void;
  /** Create a new task on the given due date in the chosen group. */
  onCreateTaskOnDate: (dueDate: string, groupId: string, name: string) => void;
}

/** Yellow needs dark text; everything else in our palette stays white. */
function textForOptionColor(color: string): string {
  return color === 'bg-status-yellow' ? 'text-foreground' : 'text-white';
}

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function CalendarView({
  board,
  onUpdateTask: _onUpdateTask,
  onOpenDetail,
  onCreateTaskOnDate,
}: CalendarViewProps) {
  const [cursor, setCursor] = useState<Date>(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState<number>(new Date().getFullYear());
  // Create-task modal state. `null` = closed; otherwise the ISO date the user clicked.
  const [createForDate, setCreateForDate] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskGroupId, setNewTaskGroupId] = useState<string>('');

  const statusOptions = useMemo(() => {
    const col = board.columns.find((c) => c.type === 'status');
    return col ? resolveColumnOptions(col) : [];
  }, [board.columns]);
  const priorityOptions = useMemo(() => {
    const col = board.columns.find((c) => c.type === 'priority');
    return col ? resolveColumnOptions(col) : [];
  }, [board.columns]);

  const optionByIdFor = (opts: ColumnOption[], id: string): ColumnOption =>
    opts.find((o) => o.id === id) ?? FALLBACK_OPTION;

  const allTasks = useMemo<TaskPillEntry[]>(
    () =>
      board.groups.flatMap((g) =>
        g.tasks.map((task) => ({
          task,
          groupId: g.id,
          groupColor: g.color,
          groupName: g.name,
          statusOption: optionByIdFor(statusOptions, task.status),
          priorityOption: optionByIdFor(priorityOptions, task.priority),
        }))
      ),
    [board, statusOptions, priorityOptions]
  );

  const dueByDay = useMemo(() => {
    const map = new Map<string, typeof allTasks>();
    for (const entry of allTasks) {
      if (!entry.task.dueDate) continue;
      const key = entry.task.dueDate.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    }
    return map;
  }, [allTasks]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const unscheduled = allTasks.filter((t) => !t.task.dueDate);
  const today = new Date();
  const todayStart = startOfDay(today);
  const cursorMonth = cursor.getMonth();
  const cursorYear = cursor.getFullYear();

  const openCreateModal = (dateKey: string) => {
    setCreateForDate(dateKey);
    setNewTaskName('');
    setNewTaskGroupId(board.groups[0]?.id ?? '');
  };

  const submitCreate = () => {
    if (!createForDate || !newTaskGroupId) return;
    const name = newTaskName.trim() || 'New task';
    onCreateTaskOnDate(createForDate, newTaskGroupId, name);
    setCreateForDate(null);
  };

  const jumpToMonth = (monthIdx: number) => {
    let next = setYear(cursor, pickerYear);
    next = setMonth(next, monthIdx);
    setCursor(next);
    setPickerOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-4 border-b border-border bg-background">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg"
          onClick={() => setCursor((c) => subMonths(c, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-lg"
          onClick={() => setCursor(new Date())}
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-lg"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>

        {/* Month + year picker */}
        <Popover
          open={pickerOpen}
          onOpenChange={(o) => {
            setPickerOpen(o);
            if (o) setPickerYear(cursorYear);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 ml-1 px-3 gap-1.5 text-lg font-semibold tracking-tight hover:bg-muted/60"
            >
              <CalendarIcon className="w-4 h-4 text-primary" />
              {format(cursor, 'MMMM yyyy')}
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            {/* Year nav */}
            <div className="flex items-center justify-between mb-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPickerYear((y) => y - 1)}
                aria-label="Previous year"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold tabular-nums">{pickerYear}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPickerYear((y) => y + 1)}
                aria-label="Next year"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {/* Month grid */}
            <div className="grid grid-cols-3 gap-1.5">
              {MONTH_SHORT.map((m, i) => {
                const isCurrent = i === cursorMonth && pickerYear === cursorYear;
                const isThisMonth = i === today.getMonth() && pickerYear === today.getFullYear();
                return (
                  <button
                    key={m}
                    onClick={() => jumpToMonth(i)}
                    className={`h-9 rounded-md text-xs font-medium transition-all ${
                      isCurrent
                        ? 'bg-brand-gradient text-white shadow-sm shadow-primary/30'
                        : isThisMonth
                          ? 'bg-primary/10 text-primary hover:bg-primary/15'
                          : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />
        {unscheduled.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {unscheduled.length} unscheduled
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w, idx) => {
            const isWeekendHeader = idx >= 5;
            return (
              <div
                key={w}
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-wider text-center py-1',
                  isWeekendHeader ? 'text-rose-500/80 dark:text-rose-400/80' : 'text-muted-foreground',
                )}
              >
                {w}
              </div>
            );
          })}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-2 auto-rows-fr">
          {days.map((d) => {
            const key = format(d, 'yyyy-MM-dd');
            const dayTasks = dueByDay.get(key) ?? [];
            const inMonth = isSameMonth(d, cursor);
            const isToday = isSameDay(d, today);
            const isPast = isBefore(startOfDay(d), todayStart);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const holidayName = getGermanHoliday(d);
            const isHoliday = holidayName !== null;
            const isOff = isWeekend || isHoliday;
            const canCreate = !isPast && board.groups.length > 0;
            return (
              <div
                key={key}
                onClick={canCreate ? () => openCreateModal(key) : undefined}
                role={canCreate ? 'button' : undefined}
                tabIndex={canCreate ? 0 : -1}
                onKeyDown={
                  canCreate
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openCreateModal(key);
                        }
                      }
                    : undefined
                }
                aria-disabled={isPast}
                aria-label={
                  canCreate
                    ? `Create task on ${format(d, 'MMMM d, yyyy')}${holidayName ? ` (${holidayName})` : isWeekend ? ' (weekend)' : ''}`
                    : isPast
                      ? `${format(d, 'MMMM d, yyyy')} (past, locked)`
                      : undefined
                }
                className={cn(
                  'group/day relative min-h-[110px] rounded-xl border p-2 flex flex-col gap-1.5 transition-all',
                  isPast && 'bg-muted border-border text-muted-foreground cursor-not-allowed',
                  !isPast && isHoliday && inMonth && 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200/70 dark:border-rose-900/40 hover:border-rose-400 hover:shadow-sm cursor-pointer',
                  !isPast && isHoliday && !inMonth && 'bg-rose-50/30 dark:bg-rose-950/10 border-rose-200/40 dark:border-rose-900/30 text-muted-foreground hover:border-rose-400/60 cursor-pointer',
                  !isPast && !isHoliday && isWeekend && inMonth && 'bg-muted/50 border-border hover:border-primary hover:shadow-sm cursor-pointer',
                  !isPast && !isHoliday && isWeekend && !inMonth && 'bg-muted/30 border-border text-muted-foreground hover:border-primary/60 cursor-pointer',
                  !isPast && !isHoliday && !isWeekend && inMonth && 'bg-card border-border hover:border-primary hover:shadow-sm cursor-pointer',
                  !isPast && !isHoliday && !isWeekend && !inMonth && 'bg-card/60 border-border text-muted-foreground hover:border-primary/60 hover:bg-card cursor-pointer',
                  isToday && 'ring-2 ring-primary border-primary shadow-md shadow-primary/20',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      'text-xs font-semibold flex items-center justify-center transition-all',
                      isToday && 'bg-brand-gradient text-white rounded-full w-6 h-6 shadow-sm shadow-primary/30',
                      !isToday && isPast && 'text-muted-foreground line-through',
                      !isToday && !isPast && isHoliday && 'text-rose-600 dark:text-rose-400',
                      !isToday && !isPast && !isHoliday && isWeekend && 'text-rose-500/90 dark:text-rose-400/90',
                      !isToday && !isPast && !isOff && (inMonth ? 'text-foreground' : 'text-muted-foreground'),
                    )}
                  >
                    {format(d, 'd')}
                  </span>
                  {dayTasks.length > 0 && (
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                      {dayTasks.length}
                    </span>
                  )}
                </div>
                {holidayName && (
                  <div
                    className="text-[10px] font-medium text-rose-600 dark:text-rose-400 leading-tight truncate"
                    title={holidayName}
                  >
                    {holidayName}
                  </div>
                )}
                <div
                  className="flex flex-col gap-1 overflow-hidden"
                  // Don't let clicks on task pills bubble up to the day cell
                  // and trigger the create-task modal.
                  onClick={(e) => e.stopPropagation()}
                >
                  {dayTasks.slice(0, 3).map((entry) => (
                    <TaskPill
                      key={entry.task.id}
                      entry={entry}
                      onClick={() => onOpenDetail(entry.task.id, entry.groupId)}
                    />
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[10px] text-muted-foreground pl-1.5">
                      +{dayTasks.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Unscheduled list */}
        {unscheduled.length > 0 && (
          <div className="mt-6 p-4 border border-dashed border-border rounded-xl bg-card/60">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
              Unscheduled · {unscheduled.length}
            </h3>
            <div className="flex flex-wrap gap-2">
              {unscheduled.map((entry) => (
                <TaskPill
                  key={entry.task.id}
                  entry={entry}
                  onClick={() => onOpenDetail(entry.task.id, entry.groupId)}
                  variant="chip"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create-task modal — opened by clicking a future or current day cell. */}
      <Dialog
        open={createForDate !== null}
        onOpenChange={(o) => !o && setCreateForDate(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createForDate
                ? `New task on ${format(parseISO(createForDate), 'EEEE, MMMM d')}`
                : 'New task'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Task name
              </label>
              <Input
                autoFocus
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="What needs to get done?"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTaskName.trim()) {
                    e.preventDefault();
                    submitCreate();
                  }
                }}
              />
            </div>
            {board.groups.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Add to group
                </label>
                <Select value={newTaskGroupId} onValueChange={setNewTaskGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {board.groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: g.color }}
                          />
                          {g.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateForDate(null)}>
              Cancel
            </Button>
            <Button
              onClick={submitCreate}
              disabled={!newTaskName.trim() || !newTaskGroupId}
            >
              Create task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface TaskPillEntry {
  task: Task;
  groupId: string;
  groupColor: string;
  groupName: string;
  statusOption: ColumnOption;
  priorityOption: ColumnOption;
}

function TaskPill({
  entry,
  onClick,
  variant = 'row',
}: {
  entry: TaskPillEntry;
  onClick: () => void;
  variant?: 'row' | 'chip';
}) {
  const { task, groupColor, groupName, statusOption, priorityOption } = entry;
  const statusBgClass = statusOption.color;
  const priorityBgClass = priorityOption.color;
  const priorityTextClass = textForOptionColor(priorityOption.color);

  const trigger =
    variant === 'row' ? (
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 text-left text-[11px] px-1.5 py-1 rounded-md bg-muted/70 hover:bg-muted hover:shadow-sm transition-all truncate w-full border border-border/50"
        style={{ borderLeft: `3px solid ${groupColor}` }}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusBgClass}`} />
        <span className="truncate font-medium text-foreground">{task.name}</span>
      </button>
    ) : (
      <button
        onClick={onClick}
        className="flex items-center gap-1.5 bg-card border border-border hover:border-primary/40 hover:shadow-sm rounded-md px-2.5 py-1.5 text-xs font-medium transition-all"
        style={{ borderLeft: `3px solid ${groupColor}` }}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${statusBgClass}`} />
        {task.name}
      </button>
    );

  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 p-0 overflow-hidden">
        {/* Accent bar */}
        <div className="h-1" style={{ backgroundColor: groupColor }} />
        <div className="p-3.5 space-y-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">
              {groupName}
            </p>
            <p className="text-sm font-semibold leading-snug">{task.name}</p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span
              className={`${statusBgClass} text-white text-[10px] font-semibold px-2 py-0.5 rounded`}
            >
              {statusOption.label}
            </span>
            <span
              className={`${priorityBgClass} ${priorityTextClass} text-[10px] font-semibold px-2 py-0.5 rounded`}
            >
              {priorityOption.label}
            </span>
          </div>

          <div className="space-y-1.5 pt-1 border-t border-border/60">
            {task.person ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <PersonAvatar person={task.person} />
                <span className="truncate text-foreground">{task.person.name}</span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Unassigned</div>
            )}
            {task.dueDate && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarIcon className="w-3 h-3" />
                Due {format(parseISO(task.dueDate), 'MMM d, yyyy')}
              </div>
            )}
            {task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {task.tags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0.5 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
                {task.tags.length > 4 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{task.tags.length - 4}
                  </span>
                )}
              </div>
            )}
            {task.progress > 0 && (
              <div className="space-y-1 pt-0.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Progress</span>
                  <span className="tabular-nums">{task.progress}%</span>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-status-green rounded-full transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

