import { useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';

type EventHandler = (name: string, payload: unknown) => void;

function openStream(path: string, onEvent: EventHandler): () => void {
  // Auth rides on the HttpOnly cookie. `withCredentials: true` is what
  // makes the browser attach it to the SSE request — same-site only
  // because the cookie is SameSite=Strict.
  const src = new EventSource(path, { withCredentials: true });
  // Register listeners for every event type we care about. `message` is the
  // catchall for un-named events.
  const events = [
    'task.created',
    'task.updated',
    'task.moved',
    'task.deleted',
    'task_update.created',
    'task_update.updated',
    'task_update.deleted',
    'group.created',
    'group.updated',
    'group.deleted',
    'board.updated',
    'board.deleted',
    'notification.new',
  ];
  const handlers: Record<string, (e: MessageEvent) => void> = {};
  for (const ev of events) {
    const h = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(ev, data);
      } catch {
        /* ignore */
      }
    };
    handlers[ev] = h;
    src.addEventListener(ev, h as EventListener);
  }
  // onerror: EventSource auto-reconnects with ~3s backoff by default; we let
  // it manage retries. When the backend finally accepts, tRPC queries refetch.
  return () => {
    for (const [ev, h] of Object.entries(handlers)) src.removeEventListener(ev, h as EventListener);
    src.close();
  };
}

/** Subscribe to a board's live event stream; invalidate queries on each event. */
export function useBoardRealtime(boardId: string | null | undefined) {
  const utils = trpc.useUtils();
  useEffect(() => {
    if (!boardId) return;
    const close = openStream(`/api/realtime/board/${boardId}`, (name) => {
      switch (name) {
        case 'task.created':
        case 'task.updated':
        case 'task.moved':
        case 'task.deleted':
          void utils.task.listByBoard.invalidate({ boardId });
          break;
        case 'task_update.created':
        case 'task_update.updated':
        case 'task_update.deleted':
          // TaskDetailPanel owns the per-task list query; it invalidates from
          // its own mutation onSuccess hooks. SSE events from other clients
          // are best-effort — re-fetch the open task's list if we can.
          void utils.taskUpdate.listForTask.invalidate();
          break;
        case 'group.created':
        case 'group.updated':
        case 'group.deleted':
          void utils.group.listByBoard.invalidate({ boardId });
          break;
        case 'board.updated':
        case 'board.deleted':
          void utils.board.listByWorkspace.invalidate();
          break;
      }
    });
    return close;
  }, [boardId, utils]);
}

/** Subscribe to the current user's event stream — drives notification refresh. */
export function useUserRealtime(enabled: boolean) {
  const utils = trpc.useUtils();
  useEffect(() => {
    if (!enabled) return;
    const close = openStream('/api/realtime/user', (name) => {
      if (name === 'notification.new') {
        void utils.notification.list.invalidate();
        void utils.notification.unreadCount.invalidate();
      }
    });
    return close;
  }, [enabled, utils]);
}
