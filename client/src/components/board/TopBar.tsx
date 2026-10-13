import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, LogOut, Moon, Sun, ChevronDown, Menu } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/lib/auth/AuthContext';
import { NotificationsDropdown } from '@/components/notifications/NotificationsDropdown';
import { ActiveTimerPill } from './ActiveTimerPill';

interface TopBarProps {
  /** Opens the mobile sidebar Sheet. Provided by AppLayout on <lg screens. */
  onOpenMobileSidebar?: () => void;
}

export function TopBar({ onOpenMobileSidebar }: TopBarProps = {}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const goTo = (path: string) => {
    setProfileOpen(false);
    navigate(path);
  };

  const onLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const displayName = user ? `${user.firstName} ${user.lastName}`.trim() : t('common.guest');

  return (
    <header className="h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-2">
        {onOpenMobileSidebar && (
          <button
            onClick={onOpenMobileSidebar}
            aria-label={t('nav.openNav')}
            className="lg:hidden w-8 h-8 rounded-md hover:bg-sidebar-accent flex items-center justify-center text-sidebar-foreground/80"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 hover:opacity-90 transition-opacity"
        >
          <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold text-sm shadow-sm shadow-primary/30">
            P
          </span>
          <span className="text-sidebar-foreground font-bold text-sm hidden sm:inline tracking-tight">
            Project Mgmt
          </span>
        </button>
      </div>

      <div className="flex items-center gap-1">
        <ActiveTimerPill />
        <NotificationsDropdown />

        {/* User profile */}
        <div className="relative ml-1" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-1.5 hover:bg-sidebar-accent rounded-lg px-1.5 py-1 transition-colors"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white overflow-hidden"
              style={{ backgroundColor: user?.color ?? 'hsl(240 100% 69%)' }}
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-semibold">{user?.initials ?? '??'}</span>
              )}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-sidebar-foreground text-xs font-medium">{displayName}</span>
              <span className="text-sidebar-foreground/50 text-[10px] capitalize">
                {user?.role.replace('_', ' ') ?? t('common.guest')}
              </span>
            </div>
            <ChevronDown className="w-3 h-3 text-sidebar-foreground/50 hidden sm:block" />
          </button>

          {profileOpen && user && (
            <div className="absolute right-0 top-full mt-1 w-60 bg-popover border border-border rounded-lg shadow-xl z-50 py-1">
              {/* Profile header */}
              <div className="px-3 py-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 overflow-hidden"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold">{user.initials}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <MenuItem icon={User} label={t('nav.profile')} onClick={() => goTo('/profile')} />
                <MenuItem
                  icon={theme === 'dark' ? Sun : Moon}
                  label={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
                  onClick={toggleTheme}
                />
              </div>

              <div className="border-t border-border py-1">
                <MenuItem icon={LogOut} label={t('nav.signOut')} onClick={onLogout} danger />
              </div>
            </div>
          )}
        </div>
      </div>

    </header>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof User;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center gap-2.5 transition-colors ${
        danger ? 'text-status-red' : ''
      }`}
    >
      <Icon className={`w-4 h-4 ${danger ? 'text-status-red' : 'text-muted-foreground'}`} />
      {label}
    </button>
  );
}
