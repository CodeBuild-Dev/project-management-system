import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, FolderKanban, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { trpc } from '@/lib/trpc/client';

/** localStorage key for the most recently opened project id. */
export const LAST_PROJECT_LS_KEY = 'pm:lastProjectId';

interface ProjectSelectorBarProps {
  selectedBoardId: string | null;
  onCreateTask: () => void;
  onCreateProject: () => void;
}

interface Entry {
  boardId: string;
  workspaceId: string;
  name: string;
  clientId: string | null;
}

/**
 * The selector bar that sits above BoardView on every /boards* route.
 * Lets the user jump between projects without leaving the page; projects
 * are grouped by their linked client. Picking an entry navigates to the
 * canonical workspace-scoped URL and persists the id to localStorage so
 * the next cold load lands on the same project.
 */
export function ProjectSelectorBar({
  selectedBoardId,
  onCreateTask,
  onCreateProject,
}: ProjectSelectorBarProps) {
  const navigate = useNavigate();
  const { workspaces } = useWorkspaces();
  const { data: clients = [] } = trpc.clients.list.useQuery({ status: 'active' });
  const [open, setOpen] = useState(false);

  // Flatten every (non-archived) project across every workspace once.
  const entries = useMemo<Entry[]>(() => {
    return workspaces.flatMap((ws) =>
      ws.boards.map((b) => ({
        boardId: b.id,
        workspaceId: ws.id,
        name: b.name,
        clientId: b.clientId ?? null,
      }))
    );
  }, [workspaces]);

  // Group by client; alphabetize inside each group; clients with at
  // least one project show up, plus a final "Internal" group for the
  // null-client boards.
  const groups = useMemo(() => {
    const byClient = new Map<string, Entry[]>();
    const internal: Entry[] = [];
    for (const e of entries) {
      if (!e.clientId) {
        internal.push(e);
        continue;
      }
      const bucket = byClient.get(e.clientId) ?? [];
      bucket.push(e);
      byClient.set(e.clientId, bucket);
    }
    const clientGroups = clients
      .filter((c) => byClient.has(c.id))
      .map((c) => ({
        id: c.id,
        label: c.name,
        color: c.color,
        entries: (byClient.get(c.id) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name)
        ),
      }));
    // Catch any orphan clientId (archived client still referenced) so
    // those boards aren't lost from the picker.
    const knownClientIds = new Set(clientGroups.map((g) => g.id));
    const orphanByClient = new Map<string, Entry[]>();
    for (const [cid, list] of byClient) {
      if (!knownClientIds.has(cid)) orphanByClient.set(cid, list);
    }
    const orphanGroup = orphanByClient.size > 0
      ? {
          id: '__orphans',
          label: 'Archived clients',
          color: 'bg-muted',
          entries: [...orphanByClient.values()]
            .flat()
            .sort((a, b) => a.name.localeCompare(b.name)),
        }
      : null;
    return {
      clientGroups,
      orphanGroup,
      internal: internal.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [entries, clients]);

  const selected = useMemo(
    () => entries.find((e) => e.boardId === selectedBoardId) ?? null,
    [entries, selectedBoardId]
  );

  const isEmpty = entries.length === 0;

  const pick = (entry: Entry) => {
    try {
      localStorage.setItem(LAST_PROJECT_LS_KEY, entry.boardId);
    } catch {
      /* localStorage can fail in private windows — ignore. */
    }
    navigate(`/workspaces/${entry.workspaceId}/boards/${entry.boardId}`);
    setOpen(false);
  };

  return (
    <div className="border-b border-border bg-card/60 backdrop-blur-sm px-3 sm:px-6 lg:px-10 py-2.5 flex items-center gap-1.5 sm:gap-2 shrink-0">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={isEmpty}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-3 sm:px-3.5 rounded-full border border-border bg-card shadow-sm text-sm font-medium transition-colors flex-1 sm:flex-initial sm:min-w-[200px] max-w-[55vw] sm:max-w-none',
              isEmpty
                ? 'text-muted-foreground cursor-not-allowed opacity-60'
                : 'hover:bg-muted'
            )}
            aria-expanded={open}
          >
            <FolderKanban className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate flex-1 text-left">
              {selected
                ? selected.name
                : isEmpty
                  ? 'No projects yet'
                  : 'Pick a project'}
            </span>
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width] min-w-[320px]" align="start">
          <Command
            // Override the default substring match so client names in
            // group headers don't accidentally swallow the search.
            filter={(value, search) =>
              value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Search projects..." />
            <CommandList>
              <CommandEmpty>No project matches.</CommandEmpty>
              {groups.clientGroups.map((g) => (
                <CommandGroup
                  key={g.id}
                  heading={
                    <span className="flex items-center gap-1.5">
                      <span className={cn('w-2 h-2 rounded-sm', g.color)} />
                      {g.label}
                    </span>
                  }
                >
                  {g.entries.map((e) => (
                    <CommandItem
                      key={e.boardId}
                      value={`${g.label} ${e.name}`}
                      onSelect={() => pick(e)}
                    >
                      <FolderKanban
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          e.boardId === selectedBoardId
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        )}
                      />
                      <span className="truncate">{e.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {groups.internal.length > 0 && (
                <CommandGroup heading="Internal">
                  {groups.internal.map((e) => (
                    <CommandItem
                      key={e.boardId}
                      value={`Internal ${e.name}`}
                      onSelect={() => pick(e)}
                    >
                      <FolderKanban
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          e.boardId === selectedBoardId
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        )}
                      />
                      <span className="truncate">{e.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {groups.orphanGroup && (
                <CommandGroup heading={groups.orphanGroup.label}>
                  {groups.orphanGroup.entries.map((e) => (
                    <CommandItem
                      key={e.boardId}
                      value={`Archived ${e.name}`}
                      onSelect={() => pick(e)}
                    >
                      <FolderKanban
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          e.boardId === selectedBoardId
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        )}
                      />
                      <span className="truncate">{e.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <div className="hidden sm:block flex-1" />

      <button
        onClick={onCreateTask}
        disabled={isEmpty}
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-medium h-9 px-2.5 sm:px-3.5 rounded-lg bg-card border border-border shadow-sm transition-colors shrink-0',
          isEmpty
            ? 'text-muted-foreground cursor-not-allowed opacity-60'
            : 'hover:bg-accent'
        )}
        title={isEmpty ? 'Create a project first' : 'New task'}
        aria-label="New task"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">New task</span>
      </button>
      <button
        onClick={onCreateProject}
        className="inline-flex items-center gap-1.5 text-xs font-medium h-9 px-2.5 sm:px-3.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity shadow-sm shadow-primary/20 shrink-0"
        aria-label="New project"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">New project</span>
      </button>
    </div>
  );
}
