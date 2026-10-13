import { useEffect } from 'react';
import { WizardModal, WizardFooter, WizardOption, WizardSuccess } from './WizardModal';
import { useWizard } from './useWizard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Task, TaskGroup, Person } from '@/data/types';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { toast } from '@/hooks/use-toast';
import { premiumInputClass } from '@/lib/form-styles';
import { CheckCheck, Eye, ArrowRight } from 'lucide-react';

type OutcomeType = 'closed' | 'needs_review' | 'creates_followup';
type Step = 'outcome' | 'details' | 'note' | 'success';

interface OutcomeWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  groups: TaskGroup[];
  /** Create a follow-up task; wizard passes the data back to the board. */
  onCreateFollowup: (input: {
    parentTaskId: string;
    name: string;
    groupId: string;
    assigneeId?: string;
    dueDate?: string;
  }) => void;
  /** Record a review assignment (reviewer + due date). */
  onAssignReview: (input: {
    taskId: string;
    reviewerId: string;
    dueDate?: string;
  }) => void;
  /** Attach a note as a TaskUpdate (comment). */
  onAddNote: (taskId: string, note: string) => void;
}

interface OutcomeData {
  outcome: OutcomeType;
  reviewerId?: string;
  reviewDueDate?: string;
  followupName?: string;
  followupGroupId?: string;
  followupAssigneeId?: string;
  followupDueDate?: string;
  note?: string;
}

export function OutcomeWizard({
  open,
  onOpenChange,
  task,
  groups,
  onCreateFollowup,
  onAssignReview,
  onAddNote,
}: OutcomeWizardProps) {
  const { members } = useWorkspaces();
  const { state, setData, goTo, goBack, reset, canGoBack } = useWizard<OutcomeData>(
    'outcome',
    { outcome: 'closed' }
  );

  useEffect(() => {
    if (open && task) {
      reset('outcome', {
        outcome: 'closed',
        followupGroupId: groups[0]?.id,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  if (!task) return null;

  const isSuccess = state.currentStep === 'success';

  const submit = () => {
    const note = (state.data.note ?? '').trim();
    if (note) onAddNote(task.id, note);

    if (state.data.outcome === 'needs_review' && state.data.reviewerId) {
      onAssignReview({
        taskId: task.id,
        reviewerId: state.data.reviewerId,
        dueDate: state.data.reviewDueDate,
      });
    }

    if (state.data.outcome === 'creates_followup' && state.data.followupName && state.data.followupGroupId) {
      onCreateFollowup({
        parentTaskId: task.id,
        name: state.data.followupName,
        groupId: state.data.followupGroupId,
        assigneeId: state.data.followupAssigneeId,
        dueDate: state.data.followupDueDate,
      });
    }

    toast({
      title: 'Outcome recorded',
      description: describeOutcome(state.data, members),
    });
    goTo('success');
    setTimeout(() => onOpenChange(false), 1100);
  };

  const canAdvanceFromDetails = (() => {
    if (state.data.outcome === 'closed') return true;
    if (state.data.outcome === 'needs_review') return !!state.data.reviewerId;
    if (state.data.outcome === 'creates_followup')
      return (
        (state.data.followupName ?? '').trim().length > 0 &&
        !!state.data.followupGroupId
      );
    return false;
  })();

  const renderStep = () => {
    switch (state.currentStep as Step) {
      case 'outcome':
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nice — <span className="font-medium text-foreground">{task.name}</span> is done. What's the outcome?
            </p>
            <WizardOption
              icon={<CheckCheck className="w-4 h-4" />}
              title="Done & closed"
              description="Nothing else needed — the task is complete."
              selected={state.data.outcome === 'closed'}
              onClick={() => setData({ outcome: 'closed' })}
            />
            <WizardOption
              icon={<Eye className="w-4 h-4" />}
              title="Done, needs review"
              description="Assign a reviewer before it's fully closed."
              selected={state.data.outcome === 'needs_review'}
              onClick={() => setData({ outcome: 'needs_review' })}
            />
            <WizardOption
              icon={<ArrowRight className="w-4 h-4" />}
              title="Done, creates a follow-up"
              description="Close this task and open the next one."
              selected={state.data.outcome === 'creates_followup'}
              onClick={() => setData({ outcome: 'creates_followup' })}
            />
          </div>
        );

      case 'details':
        if (state.data.outcome === 'closed') {
          return (
            <p className="text-sm text-muted-foreground">
              Nothing else to set up — you can add an optional note on the next step.
            </p>
          );
        }
        if (state.data.outcome === 'needs_review') {
          return (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Reviewer</Label>
                <Select
                  value={state.data.reviewerId ?? ''}
                  onValueChange={(v) => setData({ reviewerId: v })}
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-[15px] shadow-sm">
                    <SelectValue placeholder="Pick a reviewer" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
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
                          {p.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wz-review-due">Review by (optional)</Label>
                <Input
                  id="wz-review-due"
                  type="date"
                  value={state.data.reviewDueDate ?? ''}
                  onChange={(e) => setData({ reviewDueDate: e.target.value || undefined })}
                  className={premiumInputClass}
                />
              </div>
            </div>
          );
        }
        // creates_followup
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wz-followup-name">Follow-up task name</Label>
              <Input
                id="wz-followup-name"
                autoFocus
                value={state.data.followupName ?? ''}
                onChange={(e) => setData({ followupName: e.target.value })}
                placeholder="e.g. Schedule launch retrospective"
                className={premiumInputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select
                value={state.data.followupGroupId ?? ''}
                onValueChange={(v) => setData({ followupGroupId: v })}
              >
                <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-[15px] shadow-sm">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Assignee (optional)</Label>
                <Select
                  value={state.data.followupAssigneeId ?? ''}
                  onValueChange={(v) => setData({ followupAssigneeId: v || undefined })}
                >
                  <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-[15px] shadow-sm">
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wz-followup-due">Due date</Label>
                <Input
                  id="wz-followup-due"
                  type="date"
                  value={state.data.followupDueDate ?? ''}
                  onChange={(e) => setData({ followupDueDate: e.target.value || undefined })}
                  className={premiumInputClass}
                />
              </div>
            </div>
          </div>
        );

      case 'note':
        return (
          <div className="space-y-2">
            <Label htmlFor="wz-note">Closing note (optional)</Label>
            <Textarea
              id="wz-note"
              value={state.data.note ?? ''}
              onChange={(e) => setData({ note: e.target.value })}
              placeholder="What was delivered, what changed, caveats…"
              className="min-h-[120px] rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-[15px]"
            />
            <p className="text-[11px] text-muted-foreground">
              Attached as a comment on this task. Skip if nothing to add.
            </p>
          </div>
        );

      case 'success':
        return (
          <WizardSuccess
            title="Task closed"
            description={describeOutcome(state.data, members)}
          />
        );
    }
  };

  const footer = () => {
    if (isSuccess) return null;
    switch (state.currentStep as Step) {
      case 'outcome':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onNext={() => goTo('details')}
            nextLabel="Continue"
          />
        );
      case 'details':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={() => goTo('note')}
            nextLabel="Continue"
            nextDisabled={!canAdvanceFromDetails}
          />
        );
      case 'note':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={submit}
            nextLabel="Record outcome"
          />
        );
      default:
        return null;
    }
  };

  const stepIndex = { outcome: 0, details: 1, note: 2, success: 3 }[state.currentStep as Step] ?? 0;

  return (
    <WizardModal
      open={open}
      onOpenChange={onOpenChange}
      title="Record outcome"
      subtitle={task.name}
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

function describeOutcome(data: Partial<OutcomeData>, roster: Person[]): string {
  if (data.outcome === 'needs_review') {
    const who = roster.find((p) => p.id === data.reviewerId)?.name ?? 'a reviewer';
    return `Sent to ${who} for review.`;
  }
  if (data.outcome === 'creates_followup') {
    return `Follow-up created: "${data.followupName ?? ''}".`;
  }
  return 'Task closed.';
}
