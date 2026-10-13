import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { TopBar } from '@/components/board/TopBar';
import { AppSidebar } from '@/components/board/AppSidebar';
import { WorkspaceProvider } from '@/lib/workspaces/WorkspaceContext';
import { NotificationsProvider } from '@/lib/notifications/NotificationsContext';
import { CreateBoardWizard } from '@/components/wizard/CreateBoardWizard';
import { ImportTasksWizard } from '@/components/wizard/ImportTasksWizard';
import { WizardLauncherProvider } from '@/components/wizard/WizardLauncher';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * AppLayout: shared chrome (TopBar + Sidebar) for every authenticated in-app route.
 * Wraps <Outlet /> so nested routes (board, profile, settings) render in the content area.
 */
export function AppLayout() {
  return (
    <WorkspaceProvider>
      <NotificationsProvider>
        <LayoutShell />
      </NotificationsProvider>
    </WorkspaceProvider>
  );
}

function LayoutShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [createBoardWorkspaceId, setCreateBoardWorkspaceId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const ws = useWorkspaces();

  return (
    <WizardLauncherProvider
      onOpenImport={() => setImportOpen(true)}
      onOpenCreateBoard={(wsId) => setCreateBoardWorkspaceId(wsId ?? ws.activeWorkspaceId)}
    >
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <TopBar onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
        <div className="flex flex-1 overflow-hidden">
          {/* Desktop sidebar — hidden on mobile */}
          <div className="hidden lg:flex">
            <AppSidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
          </div>
          <main className="flex-1 flex flex-col overflow-hidden">
            <Outlet />
          </main>
        </div>

        {/* Mobile sidebar — sheet */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="p-0 w-[280px] sm:w-[320px] border-r-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <AppSidebar
              collapsed={false}
              onToggleCollapse={() => setMobileSidebarOpen(false)}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <CreateBoardWizard
          open={createBoardWorkspaceId !== null}
          onOpenChange={(o) => !o && setCreateBoardWorkspaceId(null)}
          initialWorkspaceId={createBoardWorkspaceId ?? undefined}
        />

        <ImportTasksWizard open={importOpen} onOpenChange={setImportOpen} />
      </div>
    </WizardLauncherProvider>
  );
}
