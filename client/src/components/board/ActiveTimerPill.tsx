import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pause } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { toast } from '@/hooks/use-toast';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatHms(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Compact timer indicator for the top bar. Polls for the user's active
 * entry every 30s, ticks once per second locally while running. Click
 * navigates to the source task; the inline button stops the timer.
 */
export function ActiveTimerPill() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { workspaces } = useWorkspaces();
  const [now, setNow] = useState(() => Date.now());

  const activeQuery = trpc.timeEntries.active.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!activeQuery.data) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeQuery.data]);

  const stopMut = trpc.timeEntries.stop.useMutation({
    onSuccess: () => {
      utils.timeEntries.active.invalidate();
      utils.timeEntries.listByTask.invalidate();
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const entry = activeQuery.data;
  if (!entry) return null;

  // Resolve the parent board for the running task — gives us a URL to jump to.
  let workspaceId: string | null = null;
  let boardId: string | null = null;
  let taskName: string | null = null;
  for (const ws of workspaces) {
    for (const b of ws.boards) {
      const task = b.groups.flatMap((g) => g.tasks).find((t) => t.id === entry.taskId);
      if (task) {
        workspaceId = ws.id;
        boardId = b.id;
        taskName = task.name;
        break;
      }
    }
    if (taskName) break;
  }

  const elapsed = now - new Date(entry.startedAt).getTime();
  const label = taskName ? taskName : 'Running…';

  const goToTask = () => {
    if (workspaceId && boardId) {
      navigate(`/workspaces/${workspaceId}/boards/${boardId}/tasks/${entry.taskId}`);
    }
  };

  return (
    <div className="hidden sm:flex items-center gap-1.5 h-8 rounded-md bg-status-green/15 text-status-green-fg px-2 mr-1">
      <button
        onClick={goToTask}
        title={label}
        className="flex items-center gap-1.5 max-w-[180px]"
      >
        <span className="relative flex items-center justify-center w-4 h-4">
          <span className="absolute inline-flex h-2 w-2 rounded-full bg-status-green opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-status-green" />
        </span>
        <span className="text-[11px] font-mono tabular-nums">{formatHms(elapsed)}</span>
        <span className="text-[11px] truncate hidden md:inline">{label}</span>
      </button>
      <button
        onClick={() => stopMut.mutate({ id: entry.id })}
        disabled={stopMut.isPending}
        className="w-6 h-6 rounded hover:bg-status-green/20 flex items-center justify-center"
        title="Stop timer"
      >
        <Pause className="w-3 h-3" />
      </button>
    </div>
  );
}
