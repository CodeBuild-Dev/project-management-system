import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  ReactNode,
} from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useUserRealtime } from '@/lib/realtime/useRealtime';

/**
 * Live notifications — backed by trpc.notification.*.
 * Poll-refreshes every 60s; Sprint 4 swaps this for SSE.
 */

export type NotificationType =
  | 'task_assigned'
  | 'mention'
  | 'due_soon'
  | 'overdue'
  | 'status_changed'
  | 'comment_added'
  | 'invited'
  | 'board_shared'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  createdAt: string;
  read: boolean;
  boardId?: string;
  entityType?: 'task' | 'board' | 'workspace' | 'task_update';
  entityId?: string;
}

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function mapType(
  t:
    | 'assignment'
    | 'mention'
    | 'comment_added'
    | 'due_soon'
    | 'overdue'
    | 'status_changed'
    | 'invited'
    | 'board_shared'
    | 'system'
): NotificationType {
  switch (t) {
    case 'assignment':
      return 'task_assigned';
    default:
      return t;
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();

  const listQuery = trpc.notification.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // SSE pushes notification.new → instant cache invalidation instead of
  // waiting for the 60s polling interval.
  useUserRealtime(isAuthenticated);

  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => void utils.notification.list.invalidate(),
  });
  const markAllReadMutation = trpc.notification.markAllRead.useMutation({
    onSuccess: () => void utils.notification.list.invalidate(),
  });

  const notifications: AppNotification[] = useMemo(() => {
    return (listQuery.data ?? []).map((n) => ({
      id: n.id,
      type: mapType(n.type),
      title: n.title,
      description: n.message,
      createdAt:
        n.createdAt instanceof Date
          ? n.createdAt.toISOString()
          : new Date(n.createdAt as unknown as string).toISOString(),
      read: n.isRead,
      entityType: n.entityType,
      entityId: n.entityId,
    }));
  }, [listQuery.data]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markRead = useCallback(
    (id: string) => {
      markReadMutation.mutate({ ids: [id] });
    },
    [markReadMutation]
  );

  const markAllRead = useCallback(() => {
    markAllReadMutation.mutate();
  }, [markAllReadMutation]);

  // Kept for interface compatibility — server has no "clear" semantics; this just marks all read.
  const clearAll = useCallback(() => {
    markAllReadMutation.mutate();
  }, [markAllReadMutation]);

  const value = useMemo<NotificationsContextValue>(
    () => ({ notifications, unreadCount, markRead, markAllRead, clearAll }),
    [notifications, unreadCount, markRead, markAllRead, clearAll]
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationsProvider>');
  return ctx;
}
