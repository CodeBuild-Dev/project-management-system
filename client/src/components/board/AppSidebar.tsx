import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Home,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Optional click handler — used by the mobile sheet to close itself when a nav item is tapped. */
  onNavigate?: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  /** Exact match required (so `/` doesn't highlight for every authed route). */
  exact?: boolean;
}

export function AppSidebar({ collapsed, onToggleCollapse, onNavigate }: AppSidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const profileRef = useRef<HTMLDivElement>(null);

  const items: NavItem[] = [
    { to: '/', label: t('nav.home'), icon: Home, exact: true },
    { to: '/boards', label: t('nav.boards'), icon: FolderKanban },
    { to: '/clients', label: t('nav.clients'), icon: Users },
    { to: '/reports', label: t('nav.reports'), icon: TrendingUp },
  ];

  const isActive = (item: NavItem): boolean => {
    if (item.exact) return location.pathname === item.to;
    if (item.to === '/boards') {
      return (
        location.pathname.startsWith('/boards') ||
        location.pathname.startsWith('/workspaces')
      );
    }
    return location.pathname.startsWith(item.to);
  };

  // Close the (no-longer-rendered) workspace dropdown if anyone still clicks outside
  useEffect(() => {
    return () => {};
  }, []);

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const initials = user?.initials || '??';

  return (
    <aside
      ref={profileRef}
      className={`relative bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col shrink-0 transition-all duration-200 ease-in-out ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Nav (brand lives in the top bar — sidebar starts straight at the nav) */}
      <nav className={`flex-1 overflow-y-auto py-4 ${collapsed ? 'px-2' : 'px-3'} flex flex-col gap-1`}>
        {items.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`group relative flex items-center ${
                collapsed ? 'justify-center px-0' : 'justify-between px-3'
              } py-2.5 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-primary/15 text-primary font-semibold'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
              }`}
              title={collapsed ? item.label : undefined}
            >
              {/* Left accent bar for active item */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-primary" />
              )}
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="w-4.5 h-4.5 shrink-0" strokeWidth={active ? 2.4 : 2} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </span>
              {active && !collapsed && (
                <ChevronRight className="w-4 h-4 shrink-0 text-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="mx-auto mb-2 w-7 h-7 rounded-full bg-sidebar-accent/40 hover:bg-sidebar-accent text-sidebar-foreground/60 hover:text-sidebar-foreground flex items-center justify-center transition-colors"
      >
        <ChevronLeft
          className={`w-3.5 h-3.5 transition-transform duration-200 ${
            collapsed ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* User card */}
      {user && (
        <div
          className={`border-t border-sidebar-border/60 ${
            collapsed ? 'px-2 py-3' : 'px-3 py-3'
          } flex items-center gap-3`}
        >
          <Link
            to="/profile"
            onClick={onNavigate}
            className="shrink-0"
            title={collapsed ? displayName : undefined}
          >
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white overflow-hidden ring-2 ring-sidebar-border"
              style={{ backgroundColor: user.color }}
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-semibold">{initials}</span>
              )}
            </div>
          </Link>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{displayName}</p>
              <p className="text-[11px] text-sidebar-foreground/50 truncate capitalize">
                {user.role.replace('_', ' ')}
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
