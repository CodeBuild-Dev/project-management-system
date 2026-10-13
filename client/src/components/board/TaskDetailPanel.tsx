import { useState, useEffect, useMemo, useRef } from 'react';
import { format, formatDistanceToNow, parseISO, startOfToday } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import {
  CalendarIcon,
  MessageSquare,
  History,
  Info as InfoIcon,
  Trash2,
  X,
  UserPlus,
  Paperclip,
  MoreHorizontal,
  Clock,
} from 'lucide-react';
import { TimeTab } from './TimeTab';
import {
  Attachment,
  Task,
  Person,
  ActivityEntry,
  TaskUpdate,
  Column,
  ColumnOption,
  resolveColumnOptions,
} from '@/data/types';
import { OptionBadge } from './OptionBadge';
import { PersonAvatar } from './PersonAvatar';
import { CellRenderer } from './CellRenderer';
import { UpdateComposer, type UpdateComposerHandle } from './UpdateComposer';
import { UpdateCard } from './UpdateCard';
import { trpc } from '@/lib/trpc/client';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { COLLABORATION_ENABLED } from '@/lib/features';

/** Map backend activity_type enum to the UI's narrower ActivityType. */
function mapActivityType(
  t:
    | 'task_created'
    | 'task_updated'
    | 'task_moved'
    | 'task_deleted'
    | 'task_archived'
    | 'status_changed'
    | 'assignee_changed'
    | 'due_date_changed'
    | 'priority_changed'
    | 'comment_added'
    | 'board_created'
    | 'board_updated'
    | 'board_deleted'
    | 'group_created'
    | 'group_updated'
    | 'group_deleted'
    | 'member_added'
    | 'member_removed'
): ActivityEntry['type'] {
  switch (t) {
    case 'status_changed':
    case 'assignee_changed':
    case 'priority_changed':
    case 'due_date_changed':
    case 'comment_added':
    case 'task_created':
      return t;
    default:
      return 'task_updated' as ActivityEntry['type'];
  }
}

interface TaskDetailPanelProps {
  task: Task;
  columns: Column[];
  groupName: string | null;
  boardName: string;
  updates: TaskUpdate[];
  activity: ActivityEntry[];
  currentUser: Person;
  onClose: () => void;
  onUpdate: (task: Task) => void;
  onAddUpdate: (
    taskId: string,
    payload: { content: string; mentions: string[]; attachments: Attachment[] }
  ) => void;
  onDelete?: (taskId: string) => void;
  /** Persists per-column option list edits triggered from the inline picker. */
  onColumnOptionsChange?: (columnId: string, options: ColumnOption[]) => void;
}

/**
 * Inline split panel. Renders as a sibling column
 * next to the board content — not a modal overlay. The parent layout
 * decides how wide it is and when it's mounted.
 */
export function TaskDetailPanel({
  task,
  columns,
  groupName,
  boardName,
  updates,
  activity,
  currentUser,
  onClose,
  onUpdate,
  onAddUpdate,
  onDelete,
  onColumnOptionsChange,
}: TaskDetailPanelProps) {
  const [name, setName] = useState(task.name);
  const [tagInput, setTagInput] = useState('');
  const composerRef = useRef<UpdateComposerHandle>(null);

  useEffect(() => {
    setName(task.name);
  }, [task.id, task.name]);

  // --- Live updates + activity from tRPC ---
  const { members } = useWorkspaces();
  const utils = trpc.useUtils();
  const liveUpdatesQuery = trpc.taskUpdate.listForTask.useQuery(
    { taskId: task.id, order: 'desc' },
    { enabled: !!task.id }
  );
  const liveActivityQuery = trpc.activity.listForTask.useQuery(
    { taskId: task.id, limit: 100 },
    { enabled: !!task.id }
  );
  const addUpdateMutation = trpc.taskUpdate.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.taskUpdate.listForTask.invalidate({ taskId: task.id }),
        utils.activity.listForTask.invalidate({ taskId: task.id }),
      ]);
    },
  });
  const editUpdateMutation = trpc.taskUpdate.update.useMutation({
    onSuccess: async () => {
      await utils.taskUpdate.listForTask.invalidate({ taskId: task.id });
    },
    onError: (err) => {
      toast({
        title: 'Could not edit comment',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
  const deleteUpdateMutation = trpc.taskUpdate.delete.useMutation({
    onSuccess: async () => {
      await utils.taskUpdate.listForTask.invalidate({ taskId: task.id });
    },
    onError: (err) => {
      toast({
        title: 'Could not delete comment',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const taskUpdates: TaskUpdate[] = useMemo(() => {
    const live = liveUpdatesQuery.data;
    if (live) {
      return live.map((u) => {
        const author = members.find((m) => m.id === u.authorId) ?? {
          id: u.authorId,
          name: 'Unknown',
          initials: '??',
          color: 'hsl(220 8% 56%)',
        };
        const editedAt = u.editedAt
          ? u.editedAt instanceof Date
            ? u.editedAt.toISOString()
            : new Date(u.editedAt as unknown as string).toISOString()
          : null;
        return {
          id: u.id,
          taskId: u.taskId,
          author,
          content: u.content,
          mentions: u.mentions,
          attachments: (u.attachments ?? []) as Attachment[],
          likedBy: [],
          createdAt:
            u.createdAt instanceof Date
              ? u.createdAt.toISOString()
              : new Date(u.createdAt as unknown as string).toISOString(),
          editedAt,
        };
      });
    }
    return updates
      .filter((u) => u.taskId === task.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [liveUpdatesQuery.data, updates, task.id, members]);

  const taskActivity: ActivityEntry[] = useMemo(() => {
    const live = liveActivityQuery.data;
    if (live) {
      return live.map((a) => {
        const actor = a.performedBy
          ? members.find((m) => m.id === a.performedBy) ?? {
              id: a.performedBy,
              name: 'Unknown',
              initials: '??',
              color: 'hsl(220 8% 56%)',
            }
          : { id: 'system', name: 'System', initials: 'SY', color: 'hsl(220 8% 56%)' };
        return {
          id: a.id,
          taskId: a.taskId ?? task.id,
          type: mapActivityType(a.type),
          actor,
          summary: a.summary,
          createdAt:
            a.performedAt instanceof Date
              ? a.performedAt.toISOString()
              : new Date(a.performedAt as unknown as string).toISOString(),
        };
      });
    }
    return activity
      .filter((a) => a.taskId === task.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [liveActivityQuery.data, activity, task.id, members]);

  const commitName = () => {
    if (name.trim() && name !== task.name) {
      onUpdate({ ...task, name: name.trim() });
    } else {
      setName(task.name);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || task.tags.includes(t)) return;
    onUpdate({ ...task, tags: [...task.tags, t] });
    setTagInput('');
  };

  const removeTag = (tag: string) =>
    onUpdate({ ...task, tags: task.tags.filter((x) => x !== tag) });

  const setPerson = (p: Person | null) => onUpdate({ ...task, person: p });

  const renderColumnRow = (col: Column) => {
    switch (col.type) {
      case 'status':
        return (
          <InfoRow key={col.id} label={col.name}>
            <OptionBadge
              value={task.status}
              options={resolveColumnOptions(col)}
              onChange={(status) => onUpdate({ ...task, status })}
              onOptionsChange={onColumnOptionsChange ? (next) => onColumnOptionsChange(col.id, next) : undefined}
            />
          </InfoRow>
        );
      case 'priority':
        return (
          <InfoRow key={col.id} label={col.name}>
            <OptionBadge
              value={task.priority}
              options={resolveColumnOptions(col)}
              minWidth={80}
              onChange={(priority) => onUpdate({ ...task, priority })}
              onOptionsChange={onColumnOptionsChange ? (next) => onColumnOptionsChange(col.id, next) : undefined}
            />
          </InfoRow>
        );
      case 'person':
        // Solo deployments: assignee is implicitly the owner — render a
        // compact read-only badge instead of the full picker.
        if (!COLLABORATION_ENABLED) {
          if (!task.person) return null;
          return (
            <InfoRow key={col.id} label={col.name}>
              <div className="flex items-center gap-2 px-1.5 py-1 -ml-1.5">
                <PersonAvatar person={task.person} />
                <span className="text-sm">{task.person.name}</span>
              </div>
            </InfoRow>
          );
        }
        return (
          <InfoRow key={col.id} label={col.name}>
            <PersonPicker person={task.person} onChange={setPerson} />
          </InfoRow>
        );
      case 'dueDate':
        return (
          <InfoRow key={col.id} label={col.name}>
            <DatePickerField
              value={task.dueDate}
              onChange={(dueDate) => onUpdate({ ...task, dueDate })}
            />
          </InfoRow>
        );
      case 'timeline':
        return (
          <InfoRow key={col.id} label={col.name}>
            <div className="flex items-center gap-2 flex-wrap">
              <DatePickerField
                value={task.timelineStart}
                placeholder="Start"
                onChange={(timelineStart) => onUpdate({ ...task, timelineStart })}
              />
              <span className="text-xs text-muted-foreground">→</span>
              <DatePickerField
                value={task.timelineEnd}
                placeholder="End"
                onChange={(timelineEnd) => onUpdate({ ...task, timelineEnd })}
              />
            </div>
          </InfoRow>
        );
      case 'progress':
        return (
          <InfoRow key={col.id} label={col.name}>
            <div className="flex items-center gap-3">
              <Slider
                value={[task.progress]}
                min={0}
                max={100}
                step={5}
                onValueChange={(v) => onUpdate({ ...task, progress: v[0] })}
                className="w-40"
              />
              <span className="text-xs text-muted-foreground font-medium w-10 text-right">
                {task.progress}%
              </span>
            </div>
          </InfoRow>
        );
      case 'tags':
        return (
          <InfoRow key={col.id} label={col.name}>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="gap-1 pr-1 text-[11px] font-normal"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:bg-muted-foreground/20 rounded-sm"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                {task.tags.length === 0 && (
                  <span className="text-xs text-muted-foreground">No tags</span>
                )}
              </div>
              <Input
                placeholder="Add a tag, press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                className="h-8 text-xs"
              />
            </div>
          </InfoRow>
        );
      default:
        return (
          <InfoRow key={col.id} label={col.name}>
            <CellRenderer
              column={col}
              task={task}
              onChange={onUpdate}
              onColumnOptionsChange={onColumnOptionsChange}
            />
          </InfoRow>
        );
    }
  };

  return (
    <aside
      aria-label="Task details"
      className="flex flex-col h-full bg-background border-l border-border shrink-0 w-full md:w-[520px] animate-in slide-in-from-right-8 duration-200 ease-out"
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <button
            onClick={onClose}
            aria-label="Close task detail"
            className="p-1 rounded hover:bg-muted text-muted-foreground mt-1"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-muted-foreground truncate">
              {boardName}
              {groupName ? <> / <span className="font-medium">{groupName}</span></> : null}
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && commitName()}
              className="text-lg font-semibold border-transparent px-2 -ml-2 hover:border-input focus-visible:border-input mt-0.5"
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(task.id)}
              title="Delete task"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="More">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={async () => {
                  const url = `${window.location.origin}/tasks/${task.id}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    toast({ title: 'Link copied', description: 'Paste it anywhere to share.' });
                  } catch {
                    toast({
                      title: 'Could not copy link',
                      description: 'Your browser blocked clipboard access.',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Copy link to task
              </DropdownMenuItem>
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(task.id)}
                  >
                    Delete task
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2 w-fit">
          <TabsTrigger value="info" className="gap-1.5">
            <InfoIcon className="w-3.5 h-3.5" /> Info
          </TabsTrigger>
          <TabsTrigger value="updates" className="gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" /> Updates
            {taskUpdates.length > 0 && (
              <span className="ml-1 text-[10px] bg-muted-foreground/20 rounded-full px-1.5 py-0.5">
                {taskUpdates.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Files
          </TabsTrigger>
          <TabsTrigger value="time" className="gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Time
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <History className="w-3.5 h-3.5" /> Activity
          </TabsTrigger>
        </TabsList>

        {/* Info tab */}
        <TabsContent value="info" className="flex-1 overflow-y-auto px-4 py-4 space-y-5 mt-0">
          {columns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No columns on this board. Add one from the board table.
            </p>
          )}
          {columns.map(renderColumnRow)}
        </TabsContent>

        {/* Updates tab */}
        <TabsContent value="updates" className="flex-1 overflow-y-auto mt-0 px-4 py-4">
          <div className="space-y-3">
            {/* Composer (top) */}
            <UpdateComposer
              ref={composerRef}
              currentUser={currentUser}
              onSubmit={({ content, mentions, attachments }) => {
                // Call the server first so the comment persists. The parent
                // callback is kept in sync so any in-memory bookkeeping (e.g.
                // optimistic UI in BoardView) still runs.
                addUpdateMutation.mutate({
                  taskId: task.id,
                  content,
                  mentions,
                  attachments,
                });
                onAddUpdate(task.id, { content, mentions, attachments });
              }}
            />

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {taskUpdates.length === 0
                  ? 'No updates yet.'
                  : `${taskUpdates.length} update${taskUpdates.length === 1 ? '' : 's'}`}
              </span>
              <div className="flex items-center gap-2">
                <button className="hover:text-foreground">Update via email</button>
                <span>·</span>
                <button className="hover:text-foreground">Subscribe</button>
              </div>
            </div>

            {taskUpdates.map((u) => (
              <UpdateCard
                key={u.id}
                update={u}
                currentUser={currentUser}
                onEdit={async (id, content) => {
                  await editUpdateMutation.mutateAsync({ id, content });
                }}
                onDelete={async (id) => {
                  await deleteUpdateMutation.mutateAsync({ id });
                }}
                onReply={(author) => composerRef.current?.replyTo(author)}
              />
            ))}
          </div>
        </TabsContent>

        {/* Files tab */}
        <TabsContent value="files" className="flex-1 overflow-y-auto mt-0 px-4 py-4">
          <FilesTabContent updates={taskUpdates} />
        </TabsContent>

        {/* Time tab */}
        <TabsContent value="time" className="flex-1 overflow-y-auto mt-0 px-4 py-4">
          <TimeTab taskId={task.id} />
        </TabsContent>

        {/* Activity tab */}
        <TabsContent value="activity" className="flex-1 overflow-y-auto mt-0 px-4 py-4">
          {taskActivity.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              No activity recorded yet for this task.
            </div>
          ) : (
            <div className="space-y-4">
              {taskActivity.map((a) => (
                <div key={a.id} className="flex gap-3">
                  <PersonAvatar person={a.actor} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium">{a.actor.name}</span>{' '}
                      <span className="text-muted-foreground">{a.summary}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(parseISO(a.createdAt), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  );
}

// ---------- sub-components ----------

function FilesTabContent({ updates }: { updates: TaskUpdate[] }) {
  const files = updates.flatMap((u) => u.attachments ?? []);
  if (files.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        No files attached yet. Drop files into an update to add them.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {files.map((att) => {
        const isImage = att.mimeType.startsWith('image/');
        return (
          <a
            key={att.id}
            href={att.url}
            download={att.name}
            target="_blank"
            rel="noreferrer"
            className="block border border-border rounded-lg overflow-hidden hover:border-primary transition-colors"
          >
            {isImage ? (
              <img src={att.url} alt={att.name} className="w-full h-28 object-cover" />
            ) : (
              <div className="h-28 flex items-center justify-center bg-muted">
                <Paperclip className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <div className="px-2 py-1.5 text-[11px] truncate">{att.name}</div>
          </a>
        );
      })}
    </div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="w-24 pt-1.5 text-xs font-medium text-muted-foreground shrink-0 truncate">
        {label}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function DatePickerField({
  value,
  placeholder,
  onChange,
}: {
  value: string | null;
  placeholder?: string;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs font-normal justify-start gap-1.5 w-[140px]"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          {value ? format(parseISO(value), 'MMM d, yyyy') : placeholder ?? 'Pick a date'}
        </Button>
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
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PersonPicker({
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
        <button className="flex items-center gap-2 hover:bg-muted rounded-md px-1.5 py-1 -ml-1.5 transition-colors">
          <PersonAvatar person={person} />
          <span className="text-sm">
            {person ? person.name : <span className="text-muted-foreground">Unassigned</span>}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <button
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
        >
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <UserPlus className="w-4 h-4 text-muted-foreground" />
          </div>
          Unassigned
        </button>
        <Separator className="my-1" />
        {members.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              onChange(p);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded-sm"
          >
            <PersonAvatar person={p} />
            <span>{p.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
