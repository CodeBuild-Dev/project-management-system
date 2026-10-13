import { createContext, useContext, useMemo, ReactNode } from 'react';

/**
 * Tiny context for opening app-wide wizards (e.g. Import Tasks, Create Board)
 * from anywhere in the tree. The parent layout owns the open-state and mounts
 * the wizards; this context just exposes imperative openers.
 */
interface WizardLauncherValue {
  openImport: () => void;
  openCreateBoard: (workspaceId?: string) => void;
}

const WizardLauncherContext = createContext<WizardLauncherValue | null>(null);

export function WizardLauncherProvider({
  children,
  onOpenImport,
  onOpenCreateBoard,
}: {
  children: ReactNode;
  onOpenImport: () => void;
  onOpenCreateBoard: (workspaceId?: string) => void;
}) {
  const value = useMemo<WizardLauncherValue>(
    () => ({
      openImport: onOpenImport,
      openCreateBoard: onOpenCreateBoard,
    }),
    [onOpenImport, onOpenCreateBoard]
  );

  return (
    <WizardLauncherContext.Provider value={value}>
      {children}
    </WizardLauncherContext.Provider>
  );
}

export function useWizardLauncher(): WizardLauncherValue {
  const ctx = useContext(WizardLauncherContext);
  if (!ctx) throw new Error('useWizardLauncher must be used inside <WizardLauncherProvider>');
  return ctx;
}
