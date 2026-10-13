import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { TrpcProvider } from '@/lib/trpc/TrpcProvider';
import '@/lib/i18n'; // initialise translations before any component reads them
import { Toaster as Sonner } from '@/components/ui/sonner';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/hooks/useTheme';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { RequireAuth } from '@/lib/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Auth pages
import Login from '@/pages/auth/Login';

// In-app pages
import Home from '@/pages/Home';
import BoardPage from '@/pages/Board';
import Clients from '@/pages/Clients';
import Reports from '@/pages/Reports';
import Profile from '@/pages/Profile';
import NotFound from '@/pages/NotFound';

const App = () => (
  <TrpcProvider>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
          <AuthProvider>
              <Routes>
              {/* Public auth routes */}
              <Route path="/login" element={<Login />} />

              {/* Authenticated app shell */}
              <Route
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<Home />} />
                <Route path="/boards" element={<BoardPage />} />
                {/* Legacy URLs — BoardPage redirects to the canonical workspace-scoped URL. */}
                <Route path="/boards/:boardId" element={<BoardPage />} />
                <Route path="/boards/:boardId/tasks/:taskId" element={<BoardPage />} />
                {/* Canonical: workspace alone, then workspace + board (+ optional task). */}
                <Route path="/workspaces/:workspaceId/boards" element={<BoardPage />} />
                <Route path="/workspaces/:workspaceId/boards/:boardId" element={<BoardPage />} />
                <Route path="/workspaces/:workspaceId/boards/:boardId/tasks/:taskId" element={<BoardPage />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/profile" element={<Profile />} />
              </Route>

              {/* 404 */}
              <Route path="*" element={<NotFound />} />
              </Routes>
          </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </TrpcProvider>
);

export default App;
