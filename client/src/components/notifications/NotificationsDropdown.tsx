import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  useNotifications,
  AppNotification,
  NotificationType,
} from '@/lib/notifications/NotificationsContext';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import {
  Bell,
  AtSign,
  Clock,
  UserPlus,
  CheckCircle2,
  MessageSquare,
  Users,
  BellOff,
  LucideIcon,
} from 'lucide-react';

const typeIcon: Record<NotificationType, LucideIcon> = {
  task_assigned: UserPlus,
  mention: AtSign,
  due_soon: Clock,
  overdue: Clock,
  status_changed: CheckCircle2,
  comment_added: MessageSquare,
  invited: Users,
  board_shared: Users,
  system: BellOff,
};

const typeTint: Record<NotificationType, string> = {
  task_assigned: 'bg-rose-100 text-rose-600',
  mention: 'bg-blue-100 text-blue-600',
  due_soon: 'bg-amber-100 text-amber-600',
  overdue: 'bg-red-100 text-red-600',
  status_changed: 'bg-emerald-100 text-emerald-600',
  comment_added: 'bg-violet-100 text-violet-600',
  invited: 'bg-cyan-100 text-cyan-600',
  board_shared: 'bg-cyan-100 text-cyan-600',
  system: 'bg-slate-100 text-slate-600',
};

export function NotificationsDropdown() {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } =
    useNotifications();
  const { setActiveBoardId, setActiveWorkspaceId, getBoard } = useWorkspaces();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const onClickNotification = (n: AppNotification) => {
    markRead(n.id);
    if (n.boardId) {
      const match = getBoard(n.boardId);
      if (match) {
        setActiveWorkspaceId(match.workspaceId);
        setActiveBoardId(n.boardId);
        const taskSegment =
          n.entityType === 'task' && n.entityId ? `/tasks/${n.entityId}` : '';
        navigate(`/workspaces/${match.workspaceId}/boards/${n.boardId}${taskSegment}`);
      } else {
        // Board not in current workspace cache — fall back to legacy URL,
        // BoardPage will redirect to the canonical workspace path.
        setActiveBoardId(n.boardId);
        navigate(`/boards/${n.boardId}`);
      }
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          className="w-8 h-8 rounded-md hover:bg-sidebar-accent flex items-center justify-center transition-colors relative"
        >
          <Bell className="w-4 h-4 text-sidebar-foreground/70" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 bg-status-red rounded-full text-[9px] font-semibold text-white flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <div className="text-sm font-semibold">Notifications</div>
            <div className="text-[11px] text-muted-foreground">
              {unreadCount === 0
                ? 'All caught up'
                : `${unreadCount} unread`}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <BellOff className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">You're all caught up</p>
              <p className="text-[11px]">New updates will show up here.</p>
            </div>
          ) : (
            notifications.map((n) => {
              const Icon = typeIcon[n.type] ?? Bell;
              const tint = typeTint[n.type] ?? 'bg-muted text-muted-foreground';
              return (
                <button
                  key={n.id}
                  onClick={() => onClickNotification(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border last:border-b-0 transition-colors ${
                    n.read ? 'hover:bg-muted/40' : 'bg-primary/[0.03] hover:bg-primary/[0.07]'
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tint}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <p
                        className={`text-sm leading-tight truncate ${
                          n.read ? 'text-foreground' : 'font-medium'
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.read && (
                        <span
                          aria-hidden="true"
                          className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 shrink-0"
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {n.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
