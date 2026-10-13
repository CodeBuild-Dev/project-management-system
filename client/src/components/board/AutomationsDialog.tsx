import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc/client';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { toast } from '@/hooks/use-toast';
import { resolveColumnOptions } from '@/data/types';
import type { Board, ColumnOption } from '@/data/types';
import {
  Plus,
  Trash2,
  Zap,
  Bell,
  CheckCircle2,
  UserPlus,
  ArrowRight,
  Tag,
  Mail,
  Pencil,
  X,
} from 'lucide-react';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
  TriggerKind,
  ConditionKind,
  ActionKind,
} from '@projectmgmt/shared';

interface AutomationsDialogProps {
  board: Board;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// --------------------------------- Library labels ---------------------------------

const TRIGGER_LABELS: Record<TriggerKind, string> = {
  status_changed_to: 'Status changes to…',
  priority_changed_to: 'Priority changes to…',
  person_assigned: 'Person is assigned',
  task_created: 'Task is created',
  task_moved_to_group: 'Task moves to group…',
  comment_added: 'Comment is added',
  mentioned_in_comment: 'Someone is @mentioned',
  due_today: 'Due date is today',
  overdue: 'Task is overdue',
};

const CONDITION_LABELS: Record<ConditionKind, string> = {
  priority_is: 'Priority is…',
  status_is: 'Status is…',
  assignee_is: 'Assignee is…',
  in_group: 'In group…',
  has_tag: 'Has tag…',
};

const ACTION_LABELS: Record<ActionKind, string> = {
  notify_person: 'Notify person',
  change_status: 'Change status',
  assign_to: 'Assign to person',
  move_to_group: 'Move to group',
  add_tag: 'Add tag',
  send_email: 'Send email',
};

const ACTION_ICONS: Record<ActionKind, typeof Bell> = {
  notify_person: Bell,
  change_status: CheckCircle2,
  assign_to: UserPlus,
  move_to_group: ArrowRight,
  add_tag: Tag,
  send_email: Mail,
};

// --------------------------------- Defaults ---------------------------------

function defaultTriggerForKind(
  kind: TriggerKind,
  statusOptions: ColumnOption[],
  priorityOptions: ColumnOption[],
  groupId: string
): AutomationTrigger {
  switch (kind) {
    case 'status_changed_to':
      return { kind, statusId: statusOptions[0]?.id ?? 'done' };
    case 'priority_changed_to':
      return { kind, priorityId: priorityOptions[0]?.id ?? 'high' };
    case 'person_assigned':
      return { kind, personId: 'anyone' };
    case 'task_moved_to_group':
      return { kind, groupId };
    case 'task_created':
    case 'comment_added':
    case 'mentioned_in_comment':
    case 'due_today':
    case 'overdue':
      return { kind } as AutomationTrigger;
  }
}

function defaultConditionForKind(
  kind: ConditionKind,
  statusOptions: ColumnOption[],
  priorityOptions: ColumnOption[],
  groupId: string,
  personId: string
): AutomationCondition {
  switch (kind) {
    case 'priority_is':
      return { kind, priorityId: priorityOptions[0]?.id ?? 'high' };
    case 'status_is':
      return { kind, statusId: statusOptions[0]?.id ?? 'done' };
    case 'assignee_is':
      return { kind, personId };
    case 'in_group':
      return { kind, groupId };
    case 'has_tag':
      return { kind, tag: '' };
  }
}

function defaultActionForKind(
  kind: ActionKind,
  statusOptions: ColumnOption[],
  groupId: string,
  personId: string
): AutomationAction {
  switch (kind) {
    case 'notify_person':
      return { kind, personId: 'assignee' };
    case 'change_status':
      return { kind, statusId: statusOptions[0]?.id ?? 'done' };
    case 'assign_to':
      return { kind, personId };
    case 'move_to_group':
      return { kind, groupId };
    case 'add_tag':
      return { kind, tag: '' };
    case 'send_email':
      return {
        kind,
        to: 'assignee',
        subject: 'Update on "{{task.name}}"',
        body: 'Task "{{task.name}}" — status: {{task.status}}',
      };
  }
}

// --------------------------------- Top-level dialog ---------------------------------

export function AutomationsDialog({ board, open, onOpenChange }: AutomationsDialogProps) {
  const utils = trpc.useUtils();
  const listQuery = trpc.automation.listByBoard.useQuery(
    { boardId: board.id },
    { enabled: open }
  );
  const toggleMutation = trpc.automation.toggle.useMutation();
  const deleteMutation = trpc.automation.delete.useMutation();

  // null = list view; { id, ... } = editing existing; 'new' = creating.
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const refresh = () => utils.automation.listByBoard.invalidate({ boardId: board.id });

  const onToggle = async (id: string, enabled: boolean) => {
    try {
      await toggleMutation.mutateAsync({ id, enabled });
      await refresh();
    } catch (err) {
      toast({
        title: 'Could not update automation',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'destructive',
      });
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this automation? Tasks already affected by past runs are not reverted.')) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({ id });
      await refresh();
      toast({ title: 'Automation deleted' });
    } catch (err) {
      toast({
        title: 'Could not delete automation',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'destructive',
      });
    }
  };

  const automations = listQuery.data ?? [];
  const editingRecipe =
    editing && editing !== 'new'
      ? automations.find((a) => a.id === editing)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {editing === null ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Automations
              </DialogTitle>
              <DialogDescription>
                When something happens on this board, run actions automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 pt-2">
              {listQuery.isLoading ? (
                <>
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </>
              ) : automations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No automations yet. Create your first recipe — for example,
                  "When status changes to Done, notify the assignee".
                </div>
              ) : (
                automations.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-border p-3 flex items-start gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{a.name}</span>
                        {a.runCount > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            ran {a.runCount}×
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        When {TRIGGER_LABELS[a.trigger.kind]} ·{' '}
                        {a.actions.length === 1
                          ? ACTION_LABELS[a.actions[0].kind]
                          : `${a.actions.length} actions`}
                      </div>
                    </div>
                    <Switch
                      checked={a.enabled}
                      onCheckedChange={(v) => onToggle(a.id, v)}
                      aria-label={a.enabled ? 'Disable' : 'Enable'}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing(a.id)}
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => onDelete(a.id)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <DialogFooter className="pt-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => setEditing('new')} className="gap-1.5">
                <Plus className="w-4 h-4" />
                New automation
              </Button>
            </DialogFooter>
          </>
        ) : (
          <AutomationForm
            board={board}
            existing={editingRecipe ?? null}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              await refresh();
              setEditing(null);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------- Form ---------------------------------

interface AutomationFormProps {
  board: Board;
  existing: {
    id: string;
    name: string;
    enabled: boolean;
    trigger: AutomationTrigger;
    conditions: AutomationCondition[];
    actions: AutomationAction[];
  } | null;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}

function AutomationForm({ board, existing, onCancel, onSaved }: AutomationFormProps) {
  const { members } = useWorkspaces();
  const createMutation = trpc.automation.create.useMutation();
  const updateMutation = trpc.automation.update.useMutation();

  const statusOptions = useMemo(() => {
    const col = board.columns.find((c) => c.type === 'status');
    return col ? resolveColumnOptions(col) : [];
  }, [board.columns]);
  const priorityOptions = useMemo(() => {
    const col = board.columns.find((c) => c.type === 'priority');
    return col ? resolveColumnOptions(col) : [];
  }, [board.columns]);
  const firstGroupId = board.groups[0]?.id ?? '';
  const firstPersonId = members[0]?.id ?? '';

  const [name, setName] = useState(existing?.name ?? '');
  const [trigger, setTrigger] = useState<AutomationTrigger>(
    existing?.trigger ??
      defaultTriggerForKind('status_changed_to', statusOptions, priorityOptions, firstGroupId)
  );
  const [conditions, setConditions] = useState<AutomationCondition[]>(
    existing?.conditions ?? []
  );
  const [actions, setActions] = useState<AutomationAction[]>(
    existing?.actions ?? [
      defaultActionForKind('notify_person', statusOptions, firstGroupId, firstPersonId),
    ]
  );

  const setTriggerKind = (kind: TriggerKind) => {
    setTrigger(defaultTriggerForKind(kind, statusOptions, priorityOptions, firstGroupId));
  };

  const addCondition = (kind: ConditionKind) => {
    setConditions((prev) => [
      ...prev,
      defaultConditionForKind(kind, statusOptions, priorityOptions, firstGroupId, firstPersonId),
    ]);
  };
  const removeCondition = (idx: number) => {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateCondition = (idx: number, next: AutomationCondition) => {
    setConditions((prev) => prev.map((c, i) => (i === idx ? next : c)));
  };

  const addAction = (kind: ActionKind) => {
    setActions((prev) => [
      ...prev,
      defaultActionForKind(kind, statusOptions, firstGroupId, firstPersonId),
    ]);
  };
  const removeAction = (idx: number) => {
    setActions((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateAction = (idx: number, next: AutomationAction) => {
    setActions((prev) => prev.map((a, i) => (i === idx ? next : a)));
  };

  const canSave =
    name.trim().length > 0 && actions.length > 0 && !createMutation.isPending && !updateMutation.isPending;

  const submit = async () => {
    try {
      if (existing) {
        await updateMutation.mutateAsync({
          id: existing.id,
          data: { name: name.trim(), trigger, conditions, actions },
        });
        toast({ title: 'Automation updated' });
      } else {
        await createMutation.mutateAsync({
          boardId: board.id,
          name: name.trim(),
          trigger,
          conditions,
          actions,
        });
        toast({ title: 'Automation created' });
      }
      await onSaved();
    } catch (err) {
      toast({
        title: existing ? 'Could not update automation' : 'Could not create automation',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{existing ? 'Edit automation' : 'New automation'}</DialogTitle>
        <DialogDescription>
          When the trigger fires and every condition is true, run each action in order.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 pt-2">
        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="auto-name">Name</Label>
          <Input
            id="auto-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Notify assignee on done"
          />
        </div>

        {/* Trigger */}
        <RecipePill label="When" tone="primary">
          <Select value={trigger.kind} onValueChange={(v) => setTriggerKind(v as TriggerKind)}>
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(TRIGGER_LABELS) as TriggerKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {TRIGGER_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TriggerParams
            trigger={trigger}
            onChange={setTrigger}
            statusOptions={statusOptions}
            priorityOptions={priorityOptions}
            groups={board.groups}
            members={members}
          />
        </RecipePill>

        {/* Conditions */}
        <div className="space-y-2">
          <Label>Conditions (all must be true)</Label>
          {conditions.map((c, i) => (
            <RecipePill
              key={i}
              label="If"
              tone="muted"
              onRemove={() => removeCondition(i)}
            >
              <Select
                value={c.kind}
                onValueChange={(v) =>
                  updateCondition(
                    i,
                    defaultConditionForKind(
                      v as ConditionKind,
                      statusOptions,
                      priorityOptions,
                      firstGroupId,
                      firstPersonId
                    )
                  )
                }
              >
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CONDITION_LABELS) as ConditionKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {CONDITION_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ConditionParams
                condition={c}
                onChange={(next) => updateCondition(i, next)}
                statusOptions={statusOptions}
                priorityOptions={priorityOptions}
                groups={board.groups}
                members={members}
              />
            </RecipePill>
          ))}
          <ConditionAdder onPick={addCondition} />
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Label>Actions</Label>
          {actions.map((a, i) => {
            const Icon = ACTION_ICONS[a.kind];
            return (
              <RecipePill
                key={i}
                label="Then"
                tone="success"
                icon={<Icon className="w-3.5 h-3.5" />}
                onRemove={actions.length > 1 ? () => removeAction(i) : undefined}
              >
                <Select
                  value={a.kind}
                  onValueChange={(v) =>
                    updateAction(
                      i,
                      defaultActionForKind(
                        v as ActionKind,
                        statusOptions,
                        firstGroupId,
                        firstPersonId
                      )
                    )
                  }
                >
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ACTION_LABELS) as ActionKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {ACTION_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ActionParams
                  action={a}
                  onChange={(next) => updateAction(i, next)}
                  statusOptions={statusOptions}
                  groups={board.groups}
                  members={members}
                />
              </RecipePill>
            );
          })}
          <ActionAdder onPick={addAction} />
        </div>
      </div>

      <DialogFooter className="pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canSave}>
          {existing ? 'Save changes' : 'Create automation'}
        </Button>
      </DialogFooter>
    </>
  );
}

// --------------------------------- Pill wrapper ---------------------------------

function RecipePill({
  label,
  tone,
  children,
  onRemove,
  icon,
}: {
  label: string;
  tone: 'primary' | 'muted' | 'success';
  children: React.ReactNode;
  onRemove?: () => void;
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-primary/10 border-primary/40 text-primary'
      : tone === 'success'
      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
      : 'bg-muted/50 border-border text-muted-foreground';
  return (
    <div className="rounded-lg border border-border p-3 flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${toneClass}`}
      >
        {icon}
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{children}</div>
      {onRemove && (
        <Button
          size="icon"
          variant="ghost"
          onClick={onRemove}
          title="Remove"
          className="shrink-0"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}

// --------------------------------- Param editors ---------------------------------

interface ParamSharedProps {
  statusOptions: ColumnOption[];
  priorityOptions: ColumnOption[];
  groups: Board['groups'];
  members: { id: string; name: string }[];
}

function TriggerParams({
  trigger,
  onChange,
  statusOptions,
  priorityOptions,
  groups,
  members,
}: ParamSharedProps & {
  trigger: AutomationTrigger;
  onChange: (t: AutomationTrigger) => void;
}) {
  switch (trigger.kind) {
    case 'status_changed_to':
      return (
        <Select
          value={trigger.statusId}
          onValueChange={(v) => onChange({ ...trigger, statusId: v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'priority_changed_to':
      return (
        <Select
          value={trigger.priorityId}
          onValueChange={(v) => onChange({ ...trigger, priorityId: v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priorityOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'person_assigned':
      return (
        <Select
          value={trigger.personId}
          onValueChange={(v) =>
            onChange({ ...trigger, personId: v as 'anyone' | string })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="anyone">Anyone</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'task_moved_to_group':
      return (
        <Select
          value={trigger.groupId}
          onValueChange={(v) => onChange({ ...trigger, groupId: v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    default:
      return null;
  }
}

function ConditionParams({
  condition,
  onChange,
  statusOptions,
  priorityOptions,
  groups,
  members,
}: ParamSharedProps & {
  condition: AutomationCondition;
  onChange: (c: AutomationCondition) => void;
}) {
  switch (condition.kind) {
    case 'priority_is':
      return (
        <Select
          value={condition.priorityId}
          onValueChange={(v) => onChange({ ...condition, priorityId: v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priorityOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'status_is':
      return (
        <Select
          value={condition.statusId}
          onValueChange={(v) => onChange({ ...condition, statusId: v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'assignee_is':
      return (
        <Select
          value={condition.personId}
          onValueChange={(v) => onChange({ ...condition, personId: v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'in_group':
      return (
        <Select
          value={condition.groupId}
          onValueChange={(v) => onChange({ ...condition, groupId: v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'has_tag':
      return (
        <Input
          className="w-40"
          value={condition.tag}
          onChange={(e) => onChange({ ...condition, tag: e.target.value })}
          placeholder="tag"
        />
      );
  }
}

function ActionParams({
  action,
  onChange,
  statusOptions,
  groups,
  members,
}: Omit<ParamSharedProps, 'priorityOptions'> & {
  action: AutomationAction;
  onChange: (a: AutomationAction) => void;
}) {
  switch (action.kind) {
    case 'notify_person':
      return (
        <Select
          value={action.personId}
          onValueChange={(v) =>
            onChange({ ...action, personId: v as 'assignee' | string })
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="assignee">Assignee</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'change_status':
      return (
        <Select
          value={action.statusId}
          onValueChange={(v) => onChange({ ...action, statusId: v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'assign_to':
      return (
        <Select
          value={action.personId}
          onValueChange={(v) => onChange({ ...action, personId: v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'move_to_group':
      return (
        <Select
          value={action.groupId}
          onValueChange={(v) => onChange({ ...action, groupId: v })}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'add_tag':
      return (
        <Input
          className="w-40"
          value={action.tag}
          onChange={(e) => onChange({ ...action, tag: e.target.value })}
          placeholder="tag"
        />
      );
    case 'send_email':
      return (
        <div className="flex flex-col gap-2 flex-1 min-w-0 w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">to</span>
            <Select
              value={action.to === 'assignee' ? 'assignee' : '__custom'}
              onValueChange={(v) =>
                onChange({
                  ...action,
                  to: v === 'assignee' ? 'assignee' : action.to === 'assignee' ? '' : action.to,
                })
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assignee">Assignee</SelectItem>
                <SelectItem value="__custom">Specific email…</SelectItem>
              </SelectContent>
            </Select>
            {action.to !== 'assignee' && (
              <Input
                type="email"
                className="flex-1 min-w-[180px]"
                value={action.to}
                onChange={(e) => onChange({ ...action, to: e.target.value })}
                placeholder="recipient@example.com"
              />
            )}
          </div>
          <Input
            value={action.subject}
            onChange={(e) => onChange({ ...action, subject: e.target.value })}
            placeholder='Subject ({{task.name}} supported)'
          />
          <textarea
            value={action.body}
            onChange={(e) => onChange({ ...action, body: e.target.value })}
            placeholder='Body. Use {{task.name}}, {{task.status}}, {{task.dueDate}} as placeholders.'
            rows={3}
            className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      );
  }
}

// --------------------------------- Adders ---------------------------------

function ConditionAdder({ onPick }: { onPick: (kind: ConditionKind) => void }) {
  return (
    <Select
      value=""
      onValueChange={(v) => onPick(v as ConditionKind)}
    >
      <SelectTrigger className="w-fit gap-1.5 text-xs">
        <Plus className="w-3.5 h-3.5" />
        <SelectValue placeholder="Add condition" />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(CONDITION_LABELS) as ConditionKind[]).map((k) => (
          <SelectItem key={k} value={k}>
            {CONDITION_LABELS[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActionAdder({ onPick }: { onPick: (kind: ActionKind) => void }) {
  return (
    <Select value="" onValueChange={(v) => onPick(v as ActionKind)}>
      <SelectTrigger className="w-fit gap-1.5 text-xs">
        <Plus className="w-3.5 h-3.5" />
        <SelectValue placeholder="Add action" />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(ACTION_LABELS) as ActionKind[]).map((k) => (
          <SelectItem key={k} value={k}>
            {ACTION_LABELS[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
