import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { useWizardLauncher } from '@/components/wizard/WizardLauncher';
import { trpc } from '@/lib/trpc/client';
import { WorkspaceIcon } from '@/lib/workspaces/workspaceIcons';
import {
  Briefcase,
  Layers,
  ListChecks,
  User as UserIcon,
  FileUp,
  FilePlus2,
} from 'lucide-react';

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Global ⌘K / ctrl+K shortcut to open the search dialog. */
export function useGlobalSearchShortcut(onOpen: () => void) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    },
    [onOpen]
  );
  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const { setActiveWorkspaceId, setActiveBoardId } = useWorkspaces();
  const { openImport, openCreateBoard } = useWizardLauncher();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  // Reset query each time the dialog opens — prevents stale results on reopen.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const searchQuery = trpc.search.global.useQuery(
    { query: debounced },
    { enabled: open && debounced.length >= 1 }
  );

  const results = useMemo(() => {
    return (
      searchQuery.data ?? {
        workspaces: [],
        boards: [],
        tasks: [],
        people: [],
      }
    );
  }, [searchQuery.data]);

  const close = () => onOpenChange(false);

  const goToBoard = (workspaceId: string, boardId: string) => {
    setActiveWorkspaceId(workspaceId);
    setActiveBoardId(boardId);
    navigate(`/workspaces/${workspaceId}/boards/${boardId}`);
    close();
  };

  const goToTask = (workspaceId: string, boardId: string, taskId: string) => {
    setActiveWorkspaceId(workspaceId);
    setActiveBoardId(boardId);
    navigate(`/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}`);
    close();
  };

  const goToWorkspace = (workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    navigate(`/workspaces/${workspaceId}/boards`);
    close();
  };

  const hasResults =
    results.workspaces.length +
      results.boards.length +
      results.tasks.length +
      results.people.length >
    0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search workspaces, boards, tasks, and people…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {debounced.length === 0
            ? 'Type to search'
            : searchQuery.isLoading
            ? 'Searching…'
            : 'No results found.'}
        </CommandEmpty>

        <CommandGroup heading="Commands">
          <CommandItem
            value="command create new board"
            onSelect={() => {
              close();
              openCreateBoard();
            }}
            className="gap-2"
          >
            <FilePlus2 className="w-4 h-4 text-primary shrink-0" />
            <span className="flex-1">Create new board</span>
            <span className="text-[10px] text-muted-foreground">Wizard</span>
          </CommandItem>
          <CommandItem
            value="command import tasks"
            onSelect={() => {
              close();
              openImport();
            }}
            className="gap-2"
          >
            <FileUp className="w-4 h-4 text-primary shrink-0" />
            <span className="flex-1">Import tasks from CSV</span>
            <span className="text-[10px] text-muted-foreground">Wizard</span>
          </CommandItem>
        </CommandGroup>

        {hasResults && <CommandSeparator />}

        {results.workspaces.length > 0 && (
          <CommandGroup heading="Workspaces">
            {results.workspaces.map((w) => (
              <CommandItem
                key={w.id}
                value={`workspace ${w.name}`}
                onSelect={() => goToWorkspace(w.id)}
                className="gap-2"
              >
                <div
                  className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-semibold text-white shrink-0"
                  style={{ backgroundColor: w.color }}
                >
                  <WorkspaceIcon icon={w.icon} className="w-3 h-3 text-white" />
                </div>
                <span className="flex-1">{w.name}</span>
                <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.boards.length > 0 && (
          <CommandGroup heading="Boards">
            {results.boards.map((b) => (
              <CommandItem
                key={b.id}
                value={`board ${b.name} ${b.workspaceName}`}
                onSelect={() => goToBoard(b.workspaceId, b.id)}
                className="gap-2"
              >
                <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{b.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {b.workspaceName}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.tasks.length > 0 && (
          <CommandGroup heading="Tasks">
            {results.tasks.map((t) => (
              <CommandItem
                key={t.id}
                value={`task ${t.name} ${t.boardName}`}
                onSelect={() => goToTask(t.workspaceId, t.boardId, t.id)}
                className="gap-2"
              >
                <ListChecks className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {t.boardName} · {t.status}
                  </div>
                </div>
                <CommandShortcut className="hidden sm:inline">↵</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {results.people.length > 0 && (
          <CommandGroup heading="People">
            {results.people.map((p) => (
              <CommandItem
                key={p.id}
                value={`person ${p.firstName} ${p.lastName} ${p.email}`}
                onSelect={() => {
                  // No profile page yet — just copy the email to clipboard.
                  navigator.clipboard?.writeText(p.email).catch(() => {});
                  close();
                }}
                className="gap-2"
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 overflow-hidden"
                  style={{ backgroundColor: p.color }}
                >
                  {p.avatarUrl ? (
                    <img
                      src={p.avatarUrl}
                      alt={`${p.firstName} ${p.lastName}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    p.initials
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    {`${p.firstName} ${p.lastName}`.trim() || p.email}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {p.email}
                  </div>
                </div>
                <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
