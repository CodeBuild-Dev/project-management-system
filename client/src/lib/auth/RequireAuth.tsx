import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, AuthRole } from './AuthContext';

interface RequireAuthProps {
  children: ReactNode;
  /**
   * Restrict to users holding one of the listed roles. If omitted, any
   * authenticated user passes the gate.
   */
  roles?: AuthRole[];
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const { user, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
