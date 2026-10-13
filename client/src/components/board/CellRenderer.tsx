import { useState } from 'react';
import { format, parseISO, startOfToday } from 'date-fns';
import {
  Column,
  ColumnOption,
  Task,
  Person,
  resolveColumnOptions,
} from '@/data/types';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { OptionBadge } from './OptionBadge';
import { PersonAvatar } from './PersonAvatar';
import { TimelineBar } from './TimelineBar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Star, UserPlus } from 'lucide-react';

interface CellRendererProps {
  column: Column;
  task: Task;
  onChange: (task: Task) => void;
  /** Persists the option list when the user edits it inline. */
  onColumnOptionsChange?: (columnId: string, options: ColumnOption[]) => void;
}

/**
 * Renders an editable cell for a given column on a task.
 * Handles both built-in column types (values on Task directly) and
 * custom types (values in task.customCells[column.id]).
 */
export function CellRenderer({
  column,
  task,
  onChange,
  onColumnOptionsChange,
}: CellRendererProps) {
  switch (column.type) {
    case 'person':
      return (
        <PersonCell
          person={task.person}
          onChange={(p) => onChange({ ...task, person: p })}
        />
      );

    case 'status':
      return (
        <OptionBadge
          value={task.status}
          options={resolveColumnOptions(column)}
          minWidth={110}
          onChange={(status) => onChange({ ...task, status })}
          onOptionsChange={
            onColumnOptionsChange
              ? (next) => onColumnOptionsChange(column.id, next)
              : undefined
          }
        />
      );

    case 'priority':
      return (
        <OptionBadge
          value={task.priority}
          options={resolveColumnOptions(column)}
          minWidth={80}
          onChange={(priority) => onChange({ ...task, priority })}
          onOptionsChange={
            onColumnOptionsChange
              ? (next) => onColumnOptionsChange(column.id, next)
              : undefined
          }
        />
      );

    case 'dueDate':
      return (
        <DateCell
          value={task.dueDate}
          onChange={(dueDate) => onChange({ ...task, dueDate })}
        />
      );

    case 'timeline':
      return <TimelineBar start={task.timelineStart} end={task.timelineEnd} />;

    case 'tags':
      return <TagsCell tags={task.tags} />;

    case 'progress':
      return <ProgressCell value={task.progress} />;

    // ---------- Custom types (live in customCells) ----------
    case 'text': {
      const value = readCustom<string>(task, column.id) ?? '';
      return (
        <TextCell
          value={value}
          onChange={(v) => onChange(writeCustom(task, column.id, v))}
        />
      );
    }
    case 'number': {
      const value = readCustom<number | null>(task, column.id) ?? null;
      return (
        <NumberCell
          value={value}
          onChange={(v) => onChange(writeCustom(task, column.id, v))}
        />
      );
    }
    case 'date': {
      const value = readCustom<string | null>(task, column.id) ?? null;
      return (
        <DateCell
          value={value}
          onChange={(v) => onChange(writeCustom(task, column.id, v))}
        />
      );
    }
    case 'checkbox': {
      const value = readCustom<boolean>(task, column.id) ?? false;
      return (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={value}
            onCheckedChange={(v) => onChange(writeCustom(task, column.id, !!v))}
          />
        </div>
      );
    }
    case 'rating': {
      const value = readCustom<number>(task, column.id) ?? 0;
      return (
        <RatingCell
          value={value}
          onChange={(v) => onChange(writeCustom(task, column.id, v))}
        />
      );
    }
  }
}

// ---------- helpers ----------

function readCustom<T>(task: Task, columnId: string): T | undefined {
  const raw = task.customCells?.[columnId];
  return raw as T | undefined;
}

function writeCustom(task: Task, columnId: string, value: unknown): Task {
  return {
    ...task,
    customCells: { ...(task.customCells ?? {}), [columnId]: value },
  };
}

// ---------- cell sub-components ----------

function PersonCell({
  person,
  onChange,
}: {
  person: Person | null;
  onChange: (p: Person | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const { members } = useWorkspaces();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="hover:opacity-80 transition-opacity">
          <PersonAvatar person={person} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        <button
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
        >
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
            <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <span className="text-xs">Unassigned</span>
        </button>
        <div className="h-px bg-border my-1" />
        {members.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              onChange(p);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold overflow-hidden shrink-0"
              style={{ backgroundColor: p.color }}
            >
              {p.avatar ? (
                <img
                  src={p.avatar}
                  alt={p.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                p.initials
              )}
            </div>
            <span className="text-xs">{p.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function DateCell({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-xs text-muted-foreground whitespace-nowrap hover:text-foreground transition-colors">
          {value ? format(parseISO(value), 'MMM d') : '—'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ? parseISO(value) : undefined}
          onSelect={(d) => {
            onChange(d ? format(d, 'yyyy-MM-dd') : null);
            if (d) setOpen(false);
          }}
          disabled={(d) => d < startOfToday()}
          initialFocus
        />
        {value && (
          <div className="p-2 border-t border-border">
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
            >
              Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TagsCell({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded-full font-medium"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function ProgressCell({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-status-green rounded-full transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-medium w-7 text-right">{value}%</span>
    </div>
  );
}

function TextCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onChange(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onChange(draft);
            setEditing(false);
          } else if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="h-7 text-xs"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-left hover:text-foreground text-muted-foreground w-full truncate"
    >
      {value || '—'}
    </button>
  );
}

function NumberCell({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  if (editing) {
    return (
      <Input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onChange(draft === '' ? null : Number(draft));
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onChange(draft === '' ? null : Number(draft));
            setEditing(false);
          } else if (e.key === 'Escape') {
            setDraft(value === null ? '' : String(value));
            setEditing(false);
          }
        }}
        className="h-7 text-xs"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-muted-foreground hover:text-foreground text-left w-full tabular-nums"
    >
      {value === null ? '—' : value}
    </button>
  );
}

function RatingCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n === value ? 0 : n)}
          className="text-muted-foreground hover:scale-110 transition-transform"
        >
          <Star className={`w-3.5 h-3.5 ${n <= value ? 'fill-status-yellow text-status-yellow' : ''}`} />
        </button>
      ))}
    </div>
  );
}
