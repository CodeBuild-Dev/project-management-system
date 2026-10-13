import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { WizardModal, WizardFooter, WizardOption, WizardSuccess } from './WizardModal';
import { useWizard } from './useWizard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { WorkspaceIcon } from '@/lib/workspaces/workspaceIcons';
import { trpc } from '@/lib/trpc/client';
import { toast } from '@/hooks/use-toast';
import { premiumInputClass } from '@/lib/form-styles';
import { BOARD_TEMPLATES } from './boardTemplates';
import { Button } from '@/components/ui/button';
import { FilePlus2, LayoutTemplate, Copy, Briefcase } from 'lucide-react';

/** Sentinel used as the SelectItem value for "no client linked" since Radix
 *  Select doesn't allow empty-string values. */
const NO_CLIENT_VALUE = '__none__';

interface CreateBoardWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-selected workspace id; defaults to the active one if omitted. */
  initialWorkspaceId?: string;
}

interface CreateBoardData {
  source: 'blank' | 'template' | 'duplicate';
  templateId?: string;
  sourceBoardId?: string;
  includeTasks?: boolean;
  name: string;
  description: string;
  workspaceId: string;
  /** Null = explicitly internal/no client. Undefined = not yet chosen (treated as null on submit). */
  clientId?: string | null;
}

type Step = 'source' | 'template' | 'duplicate' | 'details' | 'success';

const STEP_ORDER: Step[] = ['source', 'template', 'duplicate', 'details', 'success'];

export function CreateBoardWizard({
  open,
  onOpenChange,
  initialWorkspaceId,
}: CreateBoardWizardProps) {
  const { workspaces, activeWorkspaceId, createBoard, addWorkspace } = useWorkspaces();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const hasWorkspace = workspaces.length > 0;
  // Active clients only — archived ones shouldn't pollute the picker.
  const { data: clients = [] } = trpc.clients.list.useQuery({ status: 'active' });

  const {
    state,
    setData,
    goTo,
    goBack,
    reset,
    canGoBack,
  } = useWizard<CreateBoardData>('source', {
    workspaceId: initialWorkspaceId ?? activeWorkspaceId,
    name: '',
    description: '',
    includeTasks: false,
  });

  // Reset state whenever the modal opens so a stale session doesn't leak in
  useEffect(() => {
    if (open) {
      reset('source', {
        workspaceId: initialWorkspaceId ?? activeWorkspaceId,
        name: '',
        description: '',
        includeTasks: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialWorkspaceId, activeWorkspaceId]);

  const stepIndex = Math.max(
    0,
    STEP_ORDER.indexOf(state.currentStep as Step)
  );
  const isSuccess = state.currentStep === 'success';

  const allBoards = workspaces.flatMap((ws) =>
    ws.boards.map((b) => ({ ...b, workspaceName: ws.name, workspaceId: ws.id }))
  );

  const submit = () => {
    const data = state.data;
    if (!data.name || !data.workspaceId) return;

    const clientId = data.clientId ?? null;

    if (data.source === 'template' && data.templateId) {
      const tpl = BOARD_TEMPLATES.find((t) => t.id === data.templateId);
      if (tpl) {
        const idStamp = Date.now().toString();
        const { groups, columns } = tpl.build(idStamp);
        const created = createBoard({
          workspaceId: data.workspaceId,
          clientId,
          name: data.name,
          description: data.description ?? '',
          groups,
          columns,
        });
        onDone(data.workspaceId, created.id);
        return;
      }
    }

    if (data.source === 'duplicate' && data.sourceBoardId) {
      const created = createBoard({
        workspaceId: data.workspaceId,
        clientId,
        name: data.name,
        description: data.description ?? '',
        duplicateFromBoardId: data.sourceBoardId,
        includeTasksOnDuplicate: data.includeTasks ?? false,
      });
      onDone(data.workspaceId, created.id);
      return;
    }

    // Blank
    const created = createBoard({
      workspaceId: data.workspaceId,
      clientId,
      name: data.name,
      description: data.description ?? '',
    });
    onDone(data.workspaceId, created.id);
  };

  const onDone = (workspaceId: string, boardId: string) => {
    goTo('success', { /* no-op */ } as Partial<CreateBoardData>);
    // The in-modal WizardSuccess panel is the only confirmation —
    // a parallel toast would just duplicate the same message.
    setTimeout(() => {
      onOpenChange(false);
      navigate(`/workspaces/${workspaceId}/boards/${boardId}`);
    }, 1200);
  };

  const renderStep = () => {
    // Hard guard: no workspace → can't create a board. Swap the whole body
    // for a single "Create a workspace first" prompt.
    if (!hasWorkspace) {
      return (
        <div className="flex flex-col items-center text-center py-6 gap-3">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-muted-foreground" />
          </div>
          <h3 className="text-base font-semibold">{t('wizard.createBoard.needWorkspaceTitle')}</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            {t('wizard.createBoard.needWorkspaceBody')}
          </p>
          <Button
            onClick={async () => {
              await addWorkspace();
              onOpenChange(false);
              toast({
                title: t('wizard.createBoard.workspaceCreatedTitle'),
                description: t('wizard.createBoard.workspaceCreatedDesc'),
              });
            }}
          >
            {t('wizard.createBoard.createWorkspace')}
          </Button>
        </div>
      );
    }

    switch (state.currentStep as Step) {
      case 'source':
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('wizard.createBoard.sourceQuestion')}
            </p>
            <WizardOption
              icon={<FilePlus2 className="w-4 h-4" />}
              title={t('wizard.createBoard.blankTitle')}
              description={t('wizard.createBoard.blankDesc')}
              selected={state.data.source === 'blank'}
              onClick={() => goTo('details', { source: 'blank' })}
            />
            <WizardOption
              icon={<LayoutTemplate className="w-4 h-4" />}
              title={t('wizard.createBoard.templateTitle')}
              description={t('wizard.createBoard.templateDesc')}
              selected={state.data.source === 'template'}
              onClick={() => goTo('template', { source: 'template' })}
            />
            <WizardOption
              icon={<Copy className="w-4 h-4" />}
              title={t('wizard.createBoard.duplicateTitle')}
              description={t('wizard.createBoard.duplicateDesc')}
              selected={state.data.source === 'duplicate'}
              onClick={() => goTo('duplicate', { source: 'duplicate' })}
            />
          </div>
        );

      case 'template':
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">Pick a template.</p>
            {BOARD_TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <WizardOption
                  key={tpl.id}
                  icon={<Icon className="w-4 h-4" />}
                  title={tpl.name}
                  description={tpl.description}
                  tone={tpl.tone}
                  selected={state.data.templateId === tpl.id}
                  onClick={() => goTo('details', { templateId: tpl.id })}
                />
              );
            })}
          </div>
        );

      case 'duplicate':
        return (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              {t('wizard.createBoard.duplicateQuestion')}
            </p>
            {allBoards.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('wizard.createBoard.noBoardsToDuplicate')}</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2">
                {allBoards.map((b) => (
                  <WizardOption
                    key={b.id}
                    icon={<Copy className="w-4 h-4" />}
                    title={b.name}
                    description={`${b.workspaceName} · ${b.groups.length} group${
                      b.groups.length === 1 ? '' : 's'
                    }`}
                    selected={state.data.sourceBoardId === b.id}
                    onClick={() => setData({ sourceBoardId: b.id })}
                  />
                ))}
              </div>
            )}
            <label className="flex items-center gap-2 mt-4 text-sm cursor-pointer select-none">
              <Checkbox
                checked={state.data.includeTasks === true}
                onCheckedChange={(v) => setData({ includeTasks: v === true })}
              />
              Also copy tasks from that board
            </label>
          </div>
        );

      case 'details': {
        const nameTrim = (state.data.name ?? '').trim();
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wz-board-name">{t('wizard.createBoard.boardName')}</Label>
              <Input
                id="wz-board-name"
                autoFocus
                value={state.data.name ?? ''}
                onChange={(e) => setData({ name: e.target.value })}
                placeholder={t('wizard.createBoard.boardNamePlaceholder')}
                className={premiumInputClass}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wz-board-desc">{t('wizard.createBoard.description')}</Label>
              <Textarea
                id="wz-board-desc"
                value={state.data.description ?? ''}
                onChange={(e) => setData({ description: e.target.value })}
                placeholder={t('wizard.createBoard.descriptionPlaceholder')}
                className="min-h-[80px] rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-[15px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wz-board-ws">{t('wizard.createBoard.workspace')}</Label>
              <Select
                value={state.data.workspaceId ?? ''}
                onValueChange={(v) => setData({ workspaceId: v })}
              >
                <SelectTrigger
                  id="wz-board-ws"
                  className="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-[15px] shadow-sm"
                >
                  <SelectValue placeholder={t('wizard.createBoard.pickWorkspace')} />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={ws.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded flex items-center justify-center text-white text-[9px] font-bold"
                          style={{ backgroundColor: ws.color }}
                        >
                          <WorkspaceIcon icon={ws.icon} className="w-2.5 h-2.5 text-white" />
                        </span>
                        {ws.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wz-board-client">{t('clients.linkLabel')}</Label>
              <Select
                value={state.data.clientId ?? NO_CLIENT_VALUE}
                onValueChange={(v) =>
                  setData({ clientId: v === NO_CLIENT_VALUE ? null : v })
                }
              >
                <SelectTrigger
                  id="wz-board-client"
                  className="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-[15px] shadow-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT_VALUE}>
                    <span className="text-muted-foreground">{t('clients.noLinkedClient')}</span>
                  </SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span className={`w-4 h-4 rounded ${c.color}`} />
                        {c.name}
                        {c.company ? (
                          <span className="text-xs text-muted-foreground">· {c.company}</span>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {nameTrim.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                {t('wizard.createBoard.needName')}
              </p>
            )}
          </div>
        );
      }

      case 'success':
        return (
          <WizardSuccess
            title={t('wizard.createBoard.successTitle')}
            description={t('wizard.createBoard.successDesc', { name: state.data.name })}
          />
        );
    }
  };

  // Footer config per step
  const nameValid = (state.data.name ?? '').trim().length > 0;
  const canProceedDetails = nameValid && !!state.data.workspaceId;
  const canProceedDuplicate = !!state.data.sourceBoardId;

  const footer = () => {
    if (isSuccess) return null;
    // No-workspace guard replaces the whole body; no footer needed either.
    if (!hasWorkspace) return null;
    switch (state.currentStep as Step) {
      case 'source':
        // source step uses option clicks to advance
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onNext={() => {}}
            nextDisabled
            nextLabel="Continue"
          />
        );
      case 'template':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={() => {}}
            nextLabel="Pick a template"
            nextDisabled
          />
        );
      case 'duplicate':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={() => goTo('details')}
            nextLabel="Continue"
            nextDisabled={!canProceedDuplicate}
          />
        );
      case 'details':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={submit}
            nextLabel={t('wizard.createBoard.submit')}
            nextDisabled={!canProceedDetails}
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
      title={t('wizard.createBoard.title')}
      subtitle={t('wizard.createBoard.subtitle')}
      totalSteps={4}
      currentStepIndex={isSuccess ? 3 : Math.min(3, stepIndex)}
      canGoBack={canGoBack && !isSuccess}
      onBack={goBack}
      size="lg"
    >
      {renderStep()}
      {footer() && <div className="-mx-6 -mb-5 mt-6">{footer()}</div>}
    </WizardModal>
  );
}
