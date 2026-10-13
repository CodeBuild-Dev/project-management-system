import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import {
  Task,
  ColumnOption,
  Person,
  DEFAULT_STATUS_OPTIONS,
  DEFAULT_PRIORITY_OPTIONS,
  resolveColumnOptions,
} from '@/data/types';
import { toast } from '@/hooks/use-toast';
import { premiumInputClass } from '@/lib/form-styles';
import { FileUp, ClipboardPaste, Globe, FileText } from 'lucide-react';

interface ImportTasksWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional pre-selected destination. */
  initialBoardId?: string;
}

type ImportField =
  | 'skip'
  | 'name'
  | 'person'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'tags'
  | 'progress';

interface ImportData {
  source: 'csv_upload' | 'paste' | 'url';
  rawContent: string;
  fileName?: string;
  sourceHeaders: string[];
  sampleRows: string[][];
  columnMap: Record<string, ImportField>;
  boardId: string;
  groupId: string;
  skipInvalidRows: boolean;
}

type Step = 'source' | 'input' | 'map' | 'destination' | 'summary' | 'success';

const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  skip: 'Skip this column',
  name: 'Task name',
  person: 'Assignee (name)',
  status: 'Status',
  priority: 'Priority',
  dueDate: 'Due date',
  tags: 'Tags (comma-separated)',
  progress: 'Progress (0–100)',
};

/**
 * Resolve a free-text CSV cell to an option id from the destination board.
 * Matches by option id first, then case-insensitive label, then falls back to
 * the supplied default id (which the caller picks per column).
 */
function matchOption(
  raw: string,
  options: ColumnOption[],
  fallbackId: string
): string {
  if (!raw) return fallbackId;
  const lower = raw.toLowerCase();
  const byId = options.find((o) => o.id === raw);
  if (byId) return byId.id;
  const byLabel = options.find((o) => o.label.toLowerCase() === lower);
  if (byLabel) return byLabel.id;
  return fallbackId;
}

/**
 * Lightweight CSV parser — handles quoted values, commas, and newlines.
 * Not RFC-complete but good enough for typical spreadsheet exports.
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      current.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (cell !== '' || current.length) {
        current.push(cell);
        rows.push(current);
        current = [];
        cell = '';
      }
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || current.length) {
    current.push(cell);
    rows.push(current);
  }
  return rows;
}

function guessField(header: string): ImportField {
  const h = header.toLowerCase().trim();
  if (!h) return 'skip';
  if (h === 'name' || h === 'title' || h === 'task') return 'name';
  if (h === 'person' || h === 'assignee' || h === 'owner') return 'person';
  if (h === 'status' || h === 'state') return 'status';
  if (h === 'priority') return 'priority';
  if (h === 'due' || h === 'due date' || h === 'duedate') return 'dueDate';
  if (h === 'tag' || h === 'tags' || h === 'labels') return 'tags';
  if (h === 'progress' || h === 'percent' || h === '%') return 'progress';
  return 'skip';
}

export function ImportTasksWizard({
  open,
  onOpenChange,
  initialBoardId,
}: ImportTasksWizardProps) {
  const { workspaces, getBoard, updateBoard, activeBoardId, members } = useWorkspaces();
  const navigate = useNavigate();

  const { state, setData, goTo, goBack, reset, canGoBack } = useWizard<ImportData>(
    'source',
    {
      source: 'csv_upload',
      rawContent: '',
      sourceHeaders: [],
      sampleRows: [],
      columnMap: {},
      boardId: initialBoardId ?? activeBoardId,
      groupId: '',
      skipInvalidRows: true,
    }
  );

  useEffect(() => {
    if (open) {
      reset('source', {
        source: 'csv_upload',
        rawContent: '',
        sourceHeaders: [],
        sampleRows: [],
        columnMap: {},
        boardId: initialBoardId ?? activeBoardId,
        groupId: '',
        skipInvalidRows: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBoardId, activeBoardId]);

  const isSuccess = state.currentStep === 'success';

  const allBoards = workspaces.flatMap((ws) =>
    ws.boards.map((b) => ({
      id: b.id,
      name: b.name,
      workspaceName: ws.name,
      groups: b.groups,
    }))
  );
  const selectedBoard = allBoards.find((b) => b.id === state.data.boardId);
  const selectedGroups = selectedBoard?.groups ?? [];

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      ingest(text, file.name);
    };
    reader.readAsText(file);
  };

  const ingest = (text: string, fileName?: string) => {
    const rows = parseCSV(text).filter((r) => r.some((c) => c.trim() !== ''));
    if (rows.length === 0) {
      toast({
        title: 'No rows found',
        description: 'The input appears to be empty.',
        variant: 'destructive',
      });
      return;
    }
    const [headerRow, ...dataRows] = rows;
    const sample = dataRows.slice(0, 5);
    const map: Record<string, ImportField> = {};
    headerRow.forEach((h) => {
      map[h] = guessField(h);
    });
    goTo('map', {
      rawContent: text,
      fileName,
      sourceHeaders: headerRow,
      sampleRows: sample,
      columnMap: map,
    });
  };

  // Validation per row
  const rowStats = useMemo(() => {
    const map = state.data.columnMap ?? {};
    const headers = state.data.sourceHeaders ?? [];
    const content = state.data.rawContent ?? '';
    if (!content) return { valid: 0, invalid: 0, total: 0, issues: [] as string[] };
    const allRows = parseCSV(content).filter((r) => r.some((c) => c.trim() !== ''));
    const [, ...dataRows] = allRows;
    const nameKey = headers.find((h) => map[h] === 'name');
    if (!nameKey) {
      return { valid: 0, invalid: dataRows.length, total: dataRows.length, issues: ['Missing "Task name" mapping'] };
    }
    let valid = 0;
    let invalid = 0;
    const issues: string[] = [];
    dataRows.forEach((row, i) => {
      const obj = Object.fromEntries(headers.map((h, idx) => [h, row[idx] ?? '']));
      if (!(obj[nameKey] ?? '').trim()) {
        invalid++;
        if (issues.length < 5) issues.push(`Row ${i + 2}: missing task name`);
        return;
      }
      valid++;
    });
    return { valid, invalid, total: dataRows.length, issues };
  }, [state.data.columnMap, state.data.sourceHeaders, state.data.rawContent]);

  const runImport = () => {
    const map = state.data.columnMap ?? {};
    const headers = state.data.sourceHeaders ?? [];
    const content = state.data.rawContent ?? '';
    const boardId = state.data.boardId!;
    const groupId = state.data.groupId!;
    const skipInvalid = state.data.skipInvalidRows ?? true;

    const resolved = getBoard(boardId);
    if (!resolved) return;

    const destBoard = resolved.board;
    const destStatusCol = destBoard.columns.find((c) => c.type === 'status');
    const destPriorityCol = destBoard.columns.find((c) => c.type === 'priority');
    const destStatusOptions = destStatusCol
      ? resolveColumnOptions(destStatusCol)
      : DEFAULT_STATUS_OPTIONS;
    const destPriorityOptions = destPriorityCol
      ? resolveColumnOptions(destPriorityCol)
      : DEFAULT_PRIORITY_OPTIONS;

    const rows = parseCSV(content).filter((r) => r.some((c) => c.trim() !== ''));
    const [, ...dataRows] = rows;
    const nameKey = headers.find((h) => map[h] === 'name');
    if (!nameKey) return;

    const mkTask = (row: string[]): Task | null => {
      const obj = Object.fromEntries(headers.map((h, idx) => [h, row[idx] ?? '']));
      const name = (obj[nameKey] ?? '').trim();
      if (!name) return null;

      const findMapped = (field: ImportField): string => {
        const h = headers.find((hdr) => map[hdr] === field);
        return h ? (obj[h] ?? '').trim() : '';
      };

      const personRaw = findMapped('person');
      const statusRaw = findMapped('status').toLowerCase();
      const priorityRaw = findMapped('priority').toLowerCase();
      const dueRaw = findMapped('dueDate');
      const tagsRaw = findMapped('tags');
      const progressRaw = findMapped('progress');

      const matchedPerson: Person | null =
        personRaw
          ? members.find(
              (p) =>
                p.name.toLowerCase() === personRaw.toLowerCase() ||
                p.initials.toLowerCase() === personRaw.toLowerCase()
            ) ?? null
          : null;

      const status = matchOption(statusRaw, destStatusOptions, 'not-started');
      const priority = matchOption(priorityRaw, destPriorityOptions, 'medium');

      const progress = Math.max(0, Math.min(100, Number(progressRaw) || 0));

      return {
        id: `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        person: matchedPerson,
        status,
        priority,
        dueDate: dueRaw || null,
        timelineStart: null,
        timelineEnd: null,
        tags: tagsRaw
          ? tagsRaw
              .split(/[,;]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        progress,
        selected: false,
      };
    };

    const newTasks: Task[] = [];
    let skipped = 0;
    for (const row of dataRows) {
      const t = mkTask(row);
      if (t) newTasks.push(t);
      else if (skipInvalid) skipped++;
    }

    if (newTasks.length === 0) {
      toast({
        title: 'Nothing to import',
        description: 'All rows were invalid — check the name column.',
        variant: 'destructive',
      });
      return;
    }

    const { board } = resolved;
    const updated = {
      ...board,
      groups: board.groups.map((g) =>
        g.id === groupId ? { ...g, tasks: [...g.tasks, ...newTasks] } : g
      ),
    };
    updateBoard(updated);
    toast({
      title: `Imported ${newTasks.length} task${newTasks.length === 1 ? '' : 's'}`,
      description:
        skipped > 0
          ? `${skipped} row${skipped === 1 ? '' : 's'} skipped due to issues.`
          : 'All rows imported successfully.',
    });
    goTo('success');
    setTimeout(() => {
      onOpenChange(false);
      navigate(`/workspaces/${resolved.workspaceId}/boards/${boardId}`);
    }, 1200);
  };

  const renderStep = () => {
    switch (state.currentStep as Step) {
      case 'source':
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Where are your tasks coming from?
            </p>
            <WizardOption
              icon={<FileUp className="w-4 h-4" />}
              title="Upload a CSV file"
              description="Standard .csv export from a spreadsheet."
              selected={state.data.source === 'csv_upload'}
              onClick={() => goTo('input', { source: 'csv_upload' })}
            />
            <WizardOption
              icon={<ClipboardPaste className="w-4 h-4" />}
              title="Paste a table"
              description="Copy-paste directly from Google Sheets or Excel."
              selected={state.data.source === 'paste'}
              onClick={() => goTo('input', { source: 'paste' })}
            />
            <WizardOption
              icon={<Globe className="w-4 h-4" />}
              title="From a URL"
              description="Paste a raw .csv URL. We'll fetch it for you."
              selected={state.data.source === 'url'}
              onClick={() => goTo('input', { source: 'url' })}
            />
          </div>
        );

      case 'input':
        if (state.data.source === 'csv_upload') {
          return (
            <div className="space-y-3">
              <Label htmlFor="wz-import-file">CSV file</Label>
              <Input
                id="wz-import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                className="cursor-pointer h-12 rounded-xl"
              />
              <p className="text-[11px] text-muted-foreground">
                First row should be column headers. We'll try to auto-map them.
              </p>
            </div>
          );
        }
        if (state.data.source === 'url') {
          return (
            <div className="space-y-3">
              <Label htmlFor="wz-import-url">CSV URL</Label>
              <Input
                id="wz-import-url"
                type="url"
                placeholder="https://…/export.csv"
                value={state.data.fileName ?? ''}
                onChange={(e) => setData({ fileName: e.target.value })}
                className={premiumInputClass}
              />
              <p className="text-[11px] text-muted-foreground">
                Fetch happens client-side — the server must allow CORS.
              </p>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <Label htmlFor="wz-import-paste">Paste your table</Label>
            <Textarea
              id="wz-import-paste"
              placeholder={'name,status,priority,dueDate\nDesign launch page,working,high,2026-05-01'}
              value={state.data.rawContent ?? ''}
              onChange={(e) => setData({ rawContent: e.target.value })}
              className="min-h-[180px] rounded-xl border-slate-200 bg-slate-50/50 px-4 py-3 text-[13px] font-mono"
            />
          </div>
        );

      case 'map': {
        const headers = state.data.sourceHeaders ?? [];
        const map = state.data.columnMap ?? {};
        const samples = state.data.sampleRows ?? [];
        if (headers.length === 0) {
          return (
            <p className="text-sm text-muted-foreground">
              No headers detected — go back and check the input.
            </p>
          );
        }
        return (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Match each column to a task field. We've auto-guessed most of them.
            </p>
            <div className="space-y-2">
              {headers.map((h, i) => (
                <div
                  key={h + i}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{h}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {samples[0]?.[i] ?? '—'}
                      {samples[1] ? ` · ${samples[1][i] ?? ''}` : ''}
                    </div>
                  </div>
                  <span className="text-muted-foreground text-xs">→</span>
                  <Select
                    value={map[h] ?? 'skip'}
                    onValueChange={(v) =>
                      setData({
                        columnMap: { ...map, [h]: v as ImportField },
                      })
                    }
                  >
                    <SelectTrigger className="h-9 rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(IMPORT_FIELD_LABELS) as ImportField[]).map((f) => (
                        <SelectItem key={f} value={f}>
                          {IMPORT_FIELD_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'destination':
        return (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Destination board</Label>
              <Select
                value={state.data.boardId ?? ''}
                onValueChange={(v) =>
                  setData({ boardId: v, groupId: '' })
                }
              >
                <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-[15px] shadow-sm">
                  <SelectValue placeholder="Pick a board" />
                </SelectTrigger>
                <SelectContent>
                  {allBoards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="truncate">
                        {b.workspaceName} · {b.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Destination group</Label>
              <Select
                value={state.data.groupId ?? ''}
                onValueChange={(v) => setData({ groupId: v })}
                disabled={!selectedBoard}
              >
                <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-slate-50/50 px-4 text-[15px] shadow-sm">
                  <SelectValue placeholder="Pick a group" />
                </SelectTrigger>
                <SelectContent>
                  {selectedGroups.map((g) => (
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
          </div>
        );

      case 'summary':
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {state.data.fileName ?? 'Pasted data'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {rowStats.total} row{rowStats.total === 1 ? '' : 's'} detected
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-emerald-600 font-medium">
                  {rowStats.valid} valid
                </span>
                {rowStats.invalid > 0 && (
                  <span className="text-destructive font-medium">
                    {rowStats.invalid} with issues
                  </span>
                )}
              </div>
              {rowStats.issues.length > 0 && (
                <ul className="text-[11px] text-destructive space-y-0.5 pt-1">
                  {rowStats.issues.map((i, idx) => (
                    <li key={idx}>• {i}</li>
                  ))}
                </ul>
              )}
            </div>
            {rowStats.invalid > 0 && (
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={state.data.skipInvalidRows !== false}
                  onCheckedChange={(v) =>
                    setData({ skipInvalidRows: v === true })
                  }
                />
                Skip invalid rows and import the rest
              </label>
            )}
          </div>
        );

      case 'success':
        return (
          <WizardSuccess
            title="Tasks imported"
            description={`${rowStats.valid} task${rowStats.valid === 1 ? '' : 's'} added to the board.`}
          />
        );
    }
  };

  const hasValidInput = (state.data.sourceHeaders ?? []).length > 0;
  const hasNameMapping = Object.values(state.data.columnMap ?? {}).includes('name');

  const footer = () => {
    if (isSuccess) return null;
    switch (state.currentStep as Step) {
      case 'source':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onNext={() => {}}
            nextDisabled
            nextLabel="Pick a source"
          />
        );
      case 'input':
        if (state.data.source === 'paste') {
          return (
            <WizardFooter
              onCancel={() => onOpenChange(false)}
              onBack={goBack}
              showBack
              onNext={() => ingest(state.data.rawContent ?? '')}
              nextLabel="Parse"
              nextDisabled={!(state.data.rawContent ?? '').includes(',')}
            />
          );
        }
        if (state.data.source === 'url') {
          return (
            <WizardFooter
              onCancel={() => onOpenChange(false)}
              onBack={goBack}
              showBack
              onNext={async () => {
                const url = state.data.fileName ?? '';
                if (!/^https?:\/\//i.test(url)) {
                  toast({
                    title: 'Enter a valid URL',
                    variant: 'destructive',
                  });
                  return;
                }
                try {
                  const res = await fetch(url);
                  const text = await res.text();
                  ingest(text, url);
                } catch {
                  toast({
                    title: 'Could not fetch the file',
                    description: 'Check the URL and CORS settings.',
                    variant: 'destructive',
                  });
                }
              }}
              nextLabel="Fetch & parse"
            />
          );
        }
        // CSV upload advances via the file input's onChange
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={() => {}}
            nextLabel="Pick a file above"
            nextDisabled
          />
        );
      case 'map':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={() => goTo('destination')}
            nextLabel="Continue"
            nextDisabled={!hasValidInput || !hasNameMapping}
          />
        );
      case 'destination':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={() => goTo('summary')}
            nextLabel="Continue"
            nextDisabled={!state.data.boardId || !state.data.groupId}
          />
        );
      case 'summary':
        return (
          <WizardFooter
            onCancel={() => onOpenChange(false)}
            onBack={goBack}
            showBack
            onNext={runImport}
            nextLabel={`Import ${rowStats.valid} task${rowStats.valid === 1 ? '' : 's'}`}
            nextDisabled={rowStats.valid === 0}
          />
        );
      default:
        return null;
    }
  };

  const stepIndex = {
    source: 0,
    input: 1,
    map: 2,
    destination: 3,
    summary: 4,
    success: 5,
  }[state.currentStep as Step] ?? 0;

  return (
    <WizardModal
      open={open}
      onOpenChange={onOpenChange}
      title="Import tasks"
      subtitle="From CSV, pasted data, or a URL"
      totalSteps={5}
      currentStepIndex={Math.min(4, stepIndex)}
      canGoBack={canGoBack && !isSuccess}
      onBack={goBack}
      size="xl"
    >
      {renderStep()}
      {footer() && <div className="-mx-6 -mb-5 mt-6">{footer()}</div>}
    </WizardModal>
  );
}
