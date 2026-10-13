import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { trpc } from '@/lib/trpc/client';
import { useQueryClient } from '@tanstack/react-query';
import type {
  NotificationPreferences,
  PermissionOverrides,
  PublicUser,
  UserRole,
  WorkMode,
} from '@projectmgmt/shared';
import { EMPTY_PERMISSION_OVERRIDES } from '@projectmgmt/shared';

/**
 * Real auth backed by tRPC. The access token lives in an HttpOnly cookie
 * set by the server — JS never sees it. On mount we just hit `auth.me`
 * blind: if the cookie is valid we get a user back; if not we treat it
 * as logged-out.
 */

export type AuthRole = UserRole;

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  initials: string;
  color: string;
  role: AuthRole;
  permissionOverrides: PermissionOverrides;
  avatarUrl: string | null;
  jobTitle: string | null;
  workMode: WorkMode | null;
  totpEnabled: boolean;
  notificationPreferences: NotificationPreferences | null;
  createdAt: string; // ISO
}

export interface LoginInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isReady: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => void;
  updateProfile: (
    patch: Partial<
      Pick<
        AuthUser,
        | 'firstName'
        | 'lastName'
        | 'email'
        | 'color'
        | 'avatarUrl'
        | 'jobTitle'
        | 'workMode'
        | 'notificationPreferences'
      >
    >
  ) => Promise<void>;
  setRole: (role: AuthRole) => void;
}

const AVATAR_COLORS = [
  'hsl(240 100% 69%)',
  'hsl(154 68% 45%)',
  'hsl(28 100% 58%)',
  'hsl(0 72% 55%)',
  'hsl(210 100% 56%)',
  'hsl(280 60% 55%)',
  'hsl(340 75% 55%)',
];

function toAuthUser(u: PublicUser): AuthUser {
  const overrides = u.permissionOverrides ?? EMPTY_PERMISSION_OVERRIDES;
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    initials: u.initials,
    color: u.color,
    role: u.role,
    permissionOverrides: {
      grants: Array.isArray(overrides.grants) ? [...overrides.grants] : [],
      denies: Array.isArray(overrides.denies) ? [...overrides.denies] : [],
    },
    avatarUrl: u.avatarUrl,
    jobTitle: u.jobTitle,
    workMode: u.workMode,
    totpEnabled: u.totpEnabled,
    notificationPreferences: u.notificationPreferences ?? null,
    createdAt:
      u.createdAt instanceof Date
        ? u.createdAt.toISOString()
        : new Date(u.createdAt as unknown as string).toISOString(),
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * localStorage keys we no longer write but used to. Cleaned up once on
 * AuthProvider mount so old installs don't keep leaking PII (full user
 * profile + email) into devtools, and don't keep a stale access token
 * around now that auth is cookie-based.
 */
const STALE_LOCAL_STORAGE_KEYS = [
  'projectmgmt.auth.user', // pre-Sprint-2 mock auth persisted the full PublicUser here
  'projectmgmt.auth.accessToken', // pre-cookie auth wrote the JWT to localStorage
];

function cleanupStaleStorage() {
  if (typeof window === 'undefined') return;
  for (const key of STALE_LOCAL_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore quota / privacy mode failures */
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const updateProfileMutation = trpc.user.updateProfile.useMutation();

  // Hydrate on mount. We can't peek at the auth cookie (it's HttpOnly), so
  // we just call `auth.me` and treat success as logged-in, failure as
  // anonymous. The browser attaches the cookie automatically thanks to
  // `credentials: 'include'` in the tRPC fetch.
  useEffect(() => {
    cleanupStaleStorage();
    let cancelled = false;
    (async () => {
      try {
        const me = await utils.auth.me.fetch();
        if (!cancelled) setUser(toAuthUser(me));
      } catch {
        // No valid cookie or token expired — stays anonymous.
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only run once on mount; trpc utils is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const login: AuthContextValue['login'] = async ({ email, password }) => {
      if (!email.includes('@')) throw new Error('Invalid email');
      if (password.length < 1) throw new Error('Password required');
      // Server sets the HttpOnly auth cookie in the response; the JSON
      // body just carries the user record so we can warm local state.
      const result = await loginMutation.mutateAsync({ email, password });
      setUser(toAuthUser(result.user));
      queryClient.setQueryData([['auth', 'me']], result.user);
    };

    const logout: AuthContextValue['logout'] = () => {
      // Server clears the auth cookie + writes the audit row. We don't
      // wait — the local state flip is what unblocks redirects.
      logoutMutation.mutate(undefined, {});
      setUser(null);
      queryClient.clear();
    };

    const updateProfile: AuthContextValue['updateProfile'] = async (patch) => {
      const { email: _skip, ...safePatch } = patch;
      void _skip; // user.updateProfile doesn't allow email changes (admin-only).
      const updated = await updateProfileMutation.mutateAsync(safePatch);
      setUser(toAuthUser(updated));
    };

    const setRole: AuthContextValue['setRole'] = (role) => {
      // Kept for interface compatibility. Changing your own role requires
      // a super_admin running user.adminUpdate — wire that up from the Admin
      // panel when Sprint 6 ships the real flow.
      console.warn(
        `[auth] setRole('${role}') is a no-op against the live backend; use the admin panel.`
      );
    };

    return {
      user,
      isAuthenticated: !!user,
      isReady,
      login,
      logout,
      updateProfile,
      setRole,
    };
  }, [
    user,
    isReady,
    loginMutation,
    logoutMutation,
    updateProfileMutation,
    queryClient,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export { AVATAR_COLORS };
