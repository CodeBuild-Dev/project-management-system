import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Clock, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { TimeEntry } from '@projectmgmt/shared';
import { trpc } from '@/lib/trpc/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

/**
 * Time tab for the task detail panel. Shows the current running timer
 * (if any), a start/stop button, manual entry form, and the entry history.
 */
interface TimeTabProps {
  taskId: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatHms(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatHm(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function entryDurationSeconds(entry: TimeEntry, now: number): number {
  const start = new Date(entry.startedAt).getTime();
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now;
  return Math.max(0, Math.floor((end - start) / 1000));
}

function formatRate(minor: number, currency: string): string {
  if (minor === 0) return '—';
  return `${(minor / 100).toFixed(2)} ${currency}/h`;
}

function toLocalDateInput(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function TimeTab({ taskId }: TimeTabProps) {
  const utils = trpc.useUtils();
  const entriesQuery = trpc.timeEntries.listByTask.useQuery(
    { taskId },
    { enabled: !!taskId }
  );
  const activeTimerQuery = trpc.timeEntries.active.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  // Tick state for the running timer's HH:MM:SS display.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeTimerQuery.data) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeTimerQuery.data]);

  const startMut = trpc.timeEntries.start.useMutation({
    onSuccess: () => {
      utils.timeEntries.listByTask.invalidate({ taskId });
      utils.timeEntries.active.invalidate();
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const stopMut = trpc.timeEntries.stop.useMutation({
    onSuccess: () => {
      utils.timeEntries.listByTask.invalidate({ taskId });
      utils.timeEntries.active.invalidate();
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const createMut = trpc.timeEntries.create.useMutation({
    onSuccess: () => {
      utils.timeEntries.listByTask.invalidate({ taskId });
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const updateMut = trpc.timeEntries.update.useMutation({
    onSuccess: () => {
      utils.timeEntries.listByTask.invalidate({ taskId });
      utils.timeEntries.active.invalidate();
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const deleteMut = trpc.timeEntries.delete.useMutation({
    onSuccess: () => {
      utils.timeEntries.listByTask.invalidate({ taskId });
      utils.timeEntries.active.invalidate();
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  // Manual-entry form state.
  const [startedAt, setStartedAt] = useState(() => toLocalDateInput(new Date()));
  const [durationMinutes, setDurationMinutes] = useState('');
  const [note, setNote] = useState('');
  const [billable, setBillable] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const entries = entriesQuery.data ?? [];
  const activeOnThisTask =
    activeTimerQuery.data && activeTimerQuery.data.taskId === taskId
      ? activeTimerQuery.data
      : null;
  const activeOnOtherTask =
    activeTimerQuery.data && activeTimerQuery.data.taskId !== taskId
      ? activeTimerQuery.data
      : null;

  const totals = useMemo(() => {
    let total = 0;
    let billableMins = 0;
    for (const e of entries) {
      const sec = entryDurationSeconds(e, now);
      const m = Math.floor(sec / 60);
      total += m;
      if (e.billable) billableMins += m;
    }
    return { total, billable: billableMins };
  }, [entries, now]);

  const submitManual = () => {
    const minutes = Number.parseInt(durationMinutes, 10);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      toast({ title: 'Enter a duration in minutes', variant: 'destructive' });
      return;
    }
    const start = new Date(startedAt);
    if (Number.isNaN(start.getTime())) {
      toast({ title: 'Invalid start time', variant: 'destructive' });
      return;
    }
    const end = new Date(start.getTime() + minutes * 60_000);
    if (editingId) {
      updateMut.mutate({
        id: editingId,
        data: {
          startedAt: start.toISOString(),
          endedAt: end.toISOString(),
          note: note.trim() || null,
          billable,
        },
      });
    } else {
      createMut.mutate({
        taskId,
        startedAt: start.toISOString(),
        endedAt: end.toISOString(),
        note: note.trim() || null,
        billable,
      });
    }
    setStartedAt(toLocalDateInput(new Date()));
    setDurationMinutes('');
    setNote('');
    setBillable(true);
    setEditingId(null);
  };

  const startEdit = (entry: TimeEntry) => {
    if (!entry.endedAt) return;
    const start = new Date(entry.startedAt);
    const end = new Date(entry.endedAt);
    const mins = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
    setStartedAt(toLocalDateInput(start));
    setDurationMinutes(String(mins));
    setNote(entry.note ?? '');
    setBillable(entry.billable);
    setEditingId(entry.id);
  };

  const cancelEdit = () => {
    setStartedAt(toLocalDateInput(new Date()));
    setDurationMinutes('');
    setNote('');
    setBillable(true);
    setEditingId(null);
  };

  return (
    <div className="space-y-5">
      {/* Active timer banner */}
      {activeOnThisTask ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary" />
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Running on this task</div>
            <div className="text-lg font-semibold tabular-nums text-foreground">
              {formatHms(entryDurationSeconds(activeOnThisTask, now))}
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => stopMut.mutate({ id: activeOnThisTask.id })}
            disabled={stopMut.isPending}
          >
            <Pause className="w-3.5 h-3.5 mr-1" /> Stop
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            onClick={() => startMut.mutate({ taskId })}
            disabled={startMut.isPending}
            size="sm"
          >
            <Play className="w-3.5 h-3.5 mr-1" /> Start timer
          </Button>
          {activeOnOtherTask && (
            <span className="text-xs text-muted-foreground">
              Active timer running on a different task — starting here will stop it.
            </span>
          )}
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border border-border p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Total</div>
          <div className="text-base font-semibold tabular-nums">{formatHm(totals.total)}</div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Billable</div>
          <div className="text-base font-semibold tabular-nums">{formatHm(totals.billable)}</div>
        </div>
      </div>

      {/* Manual entry form */}
      <div className="rounded-md border border-border p-3 space-y-2.5 bg-muted/20">
        <div className="text-xs font-medium text-foreground/80">
          {editingId ? 'Edit entry' : 'Log time manually'}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="te-start" className="text-[11px]">
              Started at
            </Label>
            <Input
              id="te-start"
              type="datetime-local"
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="te-duration" className="text-[11px]">
              Duration (minutes)
            </Label>
            <Input
              id="te-duration"
              inputMode="numeric"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="e.g. 90"
              className="h-8 text-sm"
            />
          </div>
        </div>
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (what did you work on?)"
          className="text-sm"
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Switch checked={billable} onCheckedChange={setBillable} /> Billable
          </label>
          <div className="flex items-center gap-2">
            {editingId && (
              <Button variant="ghost" size="sm" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              onClick={submitManual}
              disabled={createMut.isPending || updateMut.isPending}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> {editingId ? 'Save' : 'Add entry'}
            </Button>
          </div>
        </div>
      </div>

      {/* Entry list */}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No time logged yet.
        </p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const seconds = entryDurationSeconds(entry, now);
            const minutes = Math.floor(seconds / 60);
            const isOpen = entry.endedAt === null;
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 px-2 py-2 rounded-md hover:bg-accent/40 transition-colors"
              >
                <div className="text-xs tabular-nums text-foreground/80 w-20 shrink-0 mt-0.5">
                  {isOpen ? formatHms(seconds) : formatHm(minutes)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(entry.startedAt), 'MMM d, HH:mm')}
                    {!entry.billable && ' · non-billable'}
                    {entry.hourlyRateSnapshot > 0 &&
                      ` · ${formatRate(entry.hourlyRateSnapshot, entry.currencySnapshot)}`}
                  </div>
                  {entry.note && (
                    <div className="text-sm text-foreground/90 mt-0.5">{entry.note}</div>
                  )}
                </div>
                {!isOpen && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(entry)}
                      className="w-6 h-6 rounded hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => deleteMut.mutate({ id: entry.id })}
                      className="w-6 h-6 rounded hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
