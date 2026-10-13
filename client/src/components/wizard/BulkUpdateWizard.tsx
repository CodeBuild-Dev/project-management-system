import { useEffect, useState } from 'react';
import { WizardModal, WizardFooter, WizardOption, WizardSuccess } from './WizardModal';
import { useWizard } from './useWizard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Task, ColumnOption, Person, TaskGroup } from '@/data/types';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { toast } from '@/hooks/use-toast';
import { premiumInputClass } from '@/lib/form-styles';
import {
  CircleDot,
  UserCircle,
  Flag,
  Calendar,
  Tag,
  ArrowRightLeft,
  Archive,
  Trash2,
} from 'lucide-react';

type BulkAction =
  | 'status'
  | 'assignee'
  | 'priority'
  | 'due_date'
  | 'tag'
  | 'move'
  | 'archive'
  | 'delete';

interface BulkUpdateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  groups: TaskGroup[];
  /** Per-board status options for the Status sub-step. */
  statusOptions: ColumnOption[];
  /** Per-board priority options for the Priority sub-step. */
  priorityOptions: ColumnOption[];
  /** Apply a patch to every selected task. */
  onApplyPatch: (patch: Partial<Task>) => void;
  /** Move every selected task into a target group. */
  onMoveTo: (targetGroupId: string) => void;
  /** Archive all selected. */
  onArchive: () => void;
  /** Delete all selected. */
  onDelete: () => void;
}

interface BulkData {
  action: BulkAction;
  status?: string;
  assigneePerson?: Person | null;
  priority?: string;
  dueDate?: string | null;
  tagToAdd?: string;
  targetGroupId?: string;
  confirmationTyped?: string;
}

type Step = 'action' | 'value' | 'confirm' | 'success';

const STEP_ORDER: Step[] = ['action', 'value', 'confirm', 'success'];

export function BulkUpdateWizard({
  open,
  onOpenChange,
  selectedCount,
  groups,
  statusOptions,
  priorityOptions,
  onApplyPatch,
  onMoveTo,
  onArchive,
  onDelete,
}: BulkUpdateWizardProps) {
  const labelForStatus = (id: string | undefined) =>
    statusOptions.find((o) => o.id === id)?.label ?? id ?? '';
  const labelForPriority = (id: string | undefined) =>
    priorityOptions.find((o) => o.id === id)?.label ?? id ?? '';
  const [confirmWord, setConfirmWord] = useState('');
  const { members } = useWorkspaces();

  const { state, setData, goTo, goBack, reset, canGoBack } = useWizard<BulkData>(
    'action',
    {}
  );

  useEffect(() => {
    if (open) {
      reset('action', {});
      setConfirmWord('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isSuccess = state.currentStep === 'success';
  const isDestructive = state.data.action === 'delete';
  const stepIndex = Math.max(0, STEP_ORDER.indexOf(state.currentStep as Step));

  const chooseAction = (action: BulkAction) => {
    // Archive + delete skip a "value" step and go straight to confirm
    if (action === 'archive' || action === 'delete') {
      goTo('confirm', { action });
    } else {
      goTo('value', { action });
    }
  };

  const apply = () => {
    const data = state.data;
    switch (data.action) {
      case 'status':
        if (data.status) onApplyPatch({ status: data.status });
        break;
      case 'assignee':
        onApplyPatch({ person: data.assigneePerson ?? null });
        break;
      case 'priority':
        if (data.priority) onApplyPatch({ priority: data.priority });
        break;
      case 'due_date':
        onApplyPatch({ dueDate: data.dueDate ?? null });
        break;
      case 'tag':
        if (data.tagToAdd) {
          // Special case — additive, handled by onApplyPatch caller merging
          onApplyPatch({ tags: [data.tagToAdd] });
        }
        break;
      case 'move':
        if (data.targetGroupId) onMoveTo(data.targetGroupId);
        break;
      case 'archive':
        onArchive();
        break;
      case 'delete':
        onDelete();
        break;
    }
    toast({
      title: `${selectedCount} task${selectedCount === 1 ? '' : 's'} updated`,
      description: summarizeAction(data, labelForStatus, labelForPriority),
    });
    goTo('success');
    setTimeout(() => onOpenChange(false), 1100);
  };

  // ---------- Render ----------
  const renderActionStep = () => (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        What do you want to do with these{' '}
        <span className="font-medium text-foreground">{selectedCount}</span> tasks?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <WizardOption
          icon={<CircleDot className="w-4 h-4" />}
          title="Change status"
          description="Move tasks to a new status."
          onClick={() => chooseAction('status')}
        />
        <WizardOption
          icon={<UserCircle className="w-4 h-4" />}
          title="Assign to"
          description="Set or clear the assignee."
          onClick={() => chooseAction('assignee')}
        />
        <WizardOption
          icon={<Flag className="w-4 h-4" />}
          title="Set priority"
          description="Critical, high, medium, low."
          onClick={() => chooseAction('priority')}
        />
        <WizardOption
          icon={<Calendar className="w-4 h-4" />}
          title="Set due date"
          description="Apply one date to all selected."
          onClick={() => chooseAction('due_date')}
        />
        <WizardOption
          icon={<Tag className="w-4 h-4" />}
          title="Add tag"
          description="Add a tag to every selected task."
          onClick={() => chooseAction('tag')}
        />
        <WizardOption
          icon={<ArrowRightLeft className="w-4 h-4" />}
          title="Move to group"
          description="Move all selected into one group."
          onClick={() => chooseAction('move')}
        />
        <WizardOption
          icon={<Archive className="w-4 h-4" />}
          title="Archive"
          description="Hide from views; reversible."
          onClick={() => chooseAction('archive')}
        />
        <WizardOption
          icon={<Trash2 className="w-4 h-4" />}
          title="Delete"
          description="Permanent. Requires confirmation."
          onClick={() => chooseAction('delete')}
        />
      </div>
    </div>
  );

  const renderValueStep = () => {
    switch (state.data.action) {
      case 'status':
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">Pick a status.</p>
            {statusOptions.map((opt) => (
              <WizardOption
                key={opt.id}
                icon={<CircleDot className="w-4 h-4" />}
                title={opt.label}
                description={`Set status to "${opt.label}" on ${selectedCount} tasks.`}
                selected={state.data.status === opt.id}
                onClick={() => setData({ status: opt.id })}
              />
            ))}
          </div>
        );
      case 'priority':
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">Pick a priority.</p>
            {priorityOptions.map((opt) => (
              <WizardOption
                key={opt.id}
                icon={<Flag className="w-4 h-4" />}
                title={opt.label}
                description={`Set priority to "${opt.label}".`}
                selected={state.data.priority === opt.id}
                onClick={() => setData({ priority: opt.id })}
              />
            ))}
          </div>
        );
      case 'assignee':
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-2">Pick an assignee.</p>
            <WizardOption
              icon={<UserCircle className="w-4 h-4" />}
              title="Unassigned"
              description="Clear the assignee on every selected task."
              selected={state.data.assigneePerson === null}
              onClick={() => setData({ assigneePerson: null })}
            />
            {members.map((p) => (
              <WizardOption
                key={p.id}
                icon={
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-semibold overflow-hidden shrink-0"
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
                  </span>
                }
                title={p.name}
                description={`Assign ${selectedCount} task${selectedCount === 1 ? '' : 's'} to ${p.name}.`}
                selected={state.data.assigneePerson?.id === p.id}
                onClick={() => setData({ assigneePerson: p })}
              />
            ))}
          </div>
        );
      case 'due_date':
        return (
          <div className="space-y-2">
            <Label htmlFor="wz-bulk-date">Due date</Label>
            <Input
              id="wz-bulk-date"
              type="date"
              value={state.data.dueDate ?? ''}
              onChange={(e) => setData({ dueDate: e.target.value || null })}
              className={premiumInputClass}
            />
            <p className="text-[11px] text-muted-foreground">
              Leave empty to clear the due date on every selected task.
            </p>
          </div>
        );
      case 'tag':
        return (
          <div className="space-y-2">
            <Label htmlFor="wz-bulk-tag">Tag to add</Label>
            <Input
              id="wz-bulk-tag"
              value={state.data.tagToAdd ?? ''}
              onChange={(e) => setData({ tagToAdd: e.target.value })}
              placeholder="e.g. urgent"
              className={premiumInputClass}
            />
            <p className="text-[11px] text-muted-foreground">
              This tag will be appended to every selected task's existing tags.
            </p>
          </div>
        );
      case 'move':
        return (
          <div className="space-y-2">
            <Label htmlFor="wz-bulk-group">Target group</Label>
            <Select
              value={state.data.targetGroupId ?? ''}
              onValueChange={(v) => setData({ targetGroupId: v })}
            >
              <SelectTrigger
                id="wz-bulk-group"
                className="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-[15px] shadow-sm"
              >
                <SelectValue placeholder="Pick a group" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: g.color }}
                      />
                      {g.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      default:
        return null;
    }
  };

  const renderConfirmStep = () => {
    const needsTyped = isDestructive;
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
            Review
          </div>
          <p className="text-sm">
            <span className="font-medium">{selectedCount}</span>{' '}
            task{selectedCount === 1 ? '' : 's'} —{' '}
            <span className="font-medium">{summarizeAction(state.data, labelForStatus, labelForPriority)}</span>
          </p>
        </div>

        {needsTyped && (
          <div className="space-y-1.5">
            <Label htmlFor="wz-bulk-confirm">
              Type <span className="font-mono">DELETE</span> to confirm
            </Label>
            <Input
              id="wz-bulk-confirm"
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value)}
              placeholder="DELETE"
              className={premiumInputClass}
            />
          </div>
        )}
      </div>
    );
  };

  const renderStep = () => {
    switch (state.currentStep as Step) {
      case 'action':
        return renderActionStep();
      case 'value':
        return renderValueStep();
      case 'confirm':
        return renderConfirmStep();
      case 'success':
        return (
          <WizardSuccess
            title="Done"
            description={`${selectedCount} task${selectedCount === 1 ? '' : 's'} updated.`}
          />
        );
    }
  };

  const canAdvanceValue = (() => {
    switch (state.data.action) {
      case 'status':
        return !!state.data.status;
      case 'priority':
        return !!state.data.priority;
      case 'assignee':
        return state.data.assigneePerson !== undefined;
      case 'due_date':
        return state.data.dueDate !== undefined;
      case 'tag':
        return (state.data.tagToAdd ?? '').trim().length > 0;
      case 'move':
        return !!state.data.targetGroupId;
      default:
        return false;
    }
  })();

  const footer = () => {
    if (isSuccess) return null;
    switch (state.currentStep as Step) {
      case 'action':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onNext={() => {}}
            nextDisabled
            nextLabel="Pick an action"
          />
        );
      case 'value':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={() => goTo('confirm')}
            nextLabel="Continue"
            nextDisabled={!canAdvanceValue}
          />
        );
      case 'confirm':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={apply}
            nextLabel={isDestructive ? 'Delete' : 'Apply update'}
            nextVariant={isDestructive ? 'destructive' : 'primary'}
            nextDisabled={isDestructive && confirmWord !== 'DELETE'}
          />
        );
      default:
        return null;
    }
  };

  return (
    <WizardModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Update ${selectedCount} task${selectedCount === 1 ? '' : 's'}`}
      subtitle="Apply the same change to every selected task"
      totalSteps={3}
      currentStepIndex={Math.min(2, stepIndex)}
      canGoBack={canGoBack && !isSuccess}
      onBack={goBack}
      size="lg"
    >
      {renderStep()}
      {footer() && <div className="-mx-6 -mb-5 mt-6">{footer()}</div>}
    </WizardModal>
  );
}

function summarizeAction(
  data: Partial<BulkData>,
  labelForStatus: (id: string | undefined) => string,
  labelForPriority: (id: string | undefined) => string,
): string {
  switch (data.action) {
    case 'status':
      return `status → ${labelForStatus(data.status)}`;
    case 'priority':
      return `priority → ${labelForPriority(data.priority)}`;
    case 'assignee':
      return `assignee → ${data.assigneePerson?.name ?? 'Unassigned'}`;
    case 'due_date':
      return data.dueDate ? `due date → ${data.dueDate}` : 'clear due date';
    case 'tag':
      return `add tag "${data.tagToAdd}"`;
    case 'move':
      return `move to another group`;
    case 'archive':
      return `archive`;
    case 'delete':
      return `delete permanently`;
    default:
      return '';
  }
}
