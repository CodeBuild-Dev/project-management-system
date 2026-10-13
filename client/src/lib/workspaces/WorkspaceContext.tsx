import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
  useCallback,
} from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useBoardRealtime } from '@/lib/realtime/useRealtime';
import type { Person, Workspace, Board, TaskGroup } from '@/data/types';
import { DEFAULT_BOARD_COLUMNS } from '@/data/types';
import {
  apiBoardToUi,
  apiGroupToUi,
  apiTaskToUi,
  apiWorkspaceToUi,
} from './mappers';
import { diffBoard, type BoardMutation } from './boardDiff';
import { toast } from '@/hooks/use-toast';

export interface CreateBoardPayload {
  workspaceId: string;
  /** Optional link to a Client. Null/undefined for internal/non-billable boards. */
  clientId?: string | null;
  name: string;
  description?: string;
  groups?: Board['groups'];
  columns?: Board['columns'];
  duplicateFromBoardId?: string;
  includeTasksOnDuplicate?: boolean;
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeBoardId: string;
  setActiveWorkspaceId: (id: string) => void;
  setActiveBoardId: (id: string) => void;
  getBoard: (id: string) => { board: Board; workspaceId: string } | null;
  updateBoard: (board: Board) => void;
  addWorkspace: () => void;
  updateWorkspace: (ws: Workspace) => void;
  deleteWorkspace: (wsId: string) => void;
  addBoard: (workspaceId: string) => void;
  createBoard: (payload: CreateBoardPayload) => Board;
  renameBoard: (workspaceId: string, boardId: string, name: string) => void;
  deleteBoard: (workspaceId: string, boardId: string) => void;
  reorderBoards: (workspaceId: string, boards: Board[]) => void;
  switchWorkspace: (wsId: string) => void;
  /** Members of the active workspace, in UI Person shape, for pickers. */
  members: Person[];
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const DEFAULT_BOARD_PALETTE = [
  'hsl(210 100% 56%)',
  'hsl(28 100% 58%)',
  'hsl(154 68% 45%)',
  'hsl(0 72% 55%)',
  'hsl(240 100% 69%)',
  'hsl(280 60% 55%)',
];

function personFromMember(m: {
  userId: string;
  user: {
    firstName: string;
    lastName: string;
    initials: string;
    color: string;
    avatarUrl: string | null;
  };
}): Person {
  return {
    id: m.userId,
    name: `${m.user.firstName} ${m.user.lastName}`.trim() || 'Unknown',
    initials: m.user.initials,
    color: m.user.color,
    avatar: m.user.avatarUrl ?? undefined,
  };
}

const ACTIVE_WS_KEY = 'projectmgmt.activeWorkspaceId';
const ACTIVE_BOARD_KEY = 'projectmgmt.activeBoardId';

function readStored(key: string): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) ?? '';
}

function writeStored(key: string, value: string) {
  if (typeof window === 'undefined') return;
  if (value) window.localStorage.setItem(key, value);
  else window.localStorage.removeItem(key);
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isReady } = useAuth();
  const utils = trpc.useUtils();

  // --- Active selection (persisted so reloads don't have to wait for the
  // workspaces/boards round-trip before the dependent queries can fire). ---
  const [activeWorkspaceId, setActiveWorkspaceIdRaw] = useState(() =>
    readStored(ACTIVE_WS_KEY)
  );
  const [activeBoardId, setActiveBoardIdRaw] = useState(() =>
    readStored(ACTIVE_BOARD_KEY)
  );

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdRaw(id);
    writeStored(ACTIVE_WS_KEY, id);
  }, []);
  const setActiveBoardId = useCallback((id: string) => {
    setActiveBoardIdRaw(id);
    writeStored(ACTIVE_BOARD_KEY, id);
  }, []);
  // Last-known full board snapshot so updateBoard() can diff reliably.
  const [lastBoard, setLastBoard] = useState<Board | null>(null);

  // --- Queries ---
  const workspacesQuery = trpc.workspace.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const boardsQuery = trpc.board.listByWorkspace.useQuery(
    { workspaceId: activeWorkspaceId },
    { enabled: !!activeWorkspaceId && isAuthenticated }
  );
  const membersQuery = trpc.member.listForWorkspace.useQuery(
    { workspaceId: activeWorkspaceId },
    { enabled: !!activeWorkspaceId && isAuthenticated }
  );
  const groupsQuery = trpc.group.listByBoard.useQuery(
    { boardId: activeBoardId },
    { enabled: !!activeBoardId && isAuthenticated }
  );
  const tasksQuery = trpc.task.listByBoard.useQuery(
    { boardId: activeBoardId },
    { enabled: !!activeBoardId && isAuthenticated }
  );

  // Subscribe to SSE for the active board — pushes task/group/board changes
  // from other clients into this cache.
  useBoardRealtime(isAuthenticated && activeBoardId ? activeBoardId : null);

  // --- Mutations ---
  const workspaceCreate = trpc.workspace.create.useMutation();
  const workspaceUpdate = trpc.workspace.update.useMutation();
  const workspaceDelete = trpc.workspace.delete.useMutation();

  const boardCreate = trpc.board.create.useMutation();
  const boardUpdate = trpc.board.update.useMutation();
  const boardDelete = trpc.board.delete.useMutation();
  const boardReorder = trpc.board.reorder.useMutation();

  const groupCreate = trpc.group.create.useMutation();
  const groupUpdate = trpc.group.update.useMutation();
  const groupDelete = trpc.group.delete.useMutation();
  const groupReorder = trpc.group.reorder.useMutation();

  const taskCreate = trpc.task.create.useMutation();
  const taskUpdate = trpc.task.update.useMutation();
  const taskDelete = trpc.task.delete.useMutation();
  const taskReorder = trpc.task.reorderInGroup.useMutation();

  // --- Default active selection ---
  // If the persisted IDs reference workspaces/boards the user no longer has
  // access to, fall back to the first available one.
  useEffect(() => {
    if (!workspacesQuery.data) return;
    const list = workspacesQuery.data;
    if (list.length === 0) {
      if (activeWorkspaceId) setActiveWorkspaceId('');
      return;
    }
    const stillExists = list.some((w) => w.id === activeWorkspaceId);
    if (!activeWorkspaceId || !stillExists) {
      setActiveWorkspaceId(list[0].id);
    }
  }, [workspacesQuery.data, activeWorkspaceId, setActiveWorkspaceId]);

  useEffect(() => {
    if (!boardsQuery.data) return;
    const list = boardsQuery.data;
    if (list.length === 0) {
      if (activeBoardId) setActiveBoardId('');
      return;
    }
    const stillExists = list.some((b) => b.id === activeBoardId);
    if (!activeBoardId || !stillExists) {
      setActiveBoardId(list[0].id);
    }
  }, [boardsQuery.data, activeBoardId, setActiveBoardId]);

  // Clear persisted selection on sign-out.
  useEffect(() => {
    if (isReady && !isAuthenticated) {
      setActiveWorkspaceId('');
      setActiveBoardId('');
    }
  }, [isReady, isAuthenticated, setActiveWorkspaceId, setActiveBoardId]);

  // --- Assemble nested Workspace[] for UI ---
  const memberDirectory = useMemo(() => {
    const byId = new Map<string, Person>();
    for (const m of membersQuery.data ?? []) {
      byId.set(m.userId, personFromMember(m));
    }
    return byId;
  }, [membersQuery.data]);

  const activeBoardUi: Board | null = useMemo(() => {
    if (!activeBoardId || !groupsQuery.data || !tasksQuery.data) return null;
    const tasksByGroup = new Map<string, typeof tasksQuery.data>();
    for (const t of tasksQuery.data) {
      const arr = tasksByGroup.get(t.groupId) ?? [];
      arr.push(t);
      tasksByGroup.set(t.groupId, arr);
    }
    const lookup = (id: string) => memberDirectory.get(id) ?? null;
    const groups: TaskGroup[] = groupsQuery.data.map((g) =>
      apiGroupToUi(
        g,
        (tasksByGroup.get(g.id) ?? [])
          .filter((t) => !t.archivedAt)
          .map((t) => apiTaskToUi(t, lookup))
      )
    );
    const activeBoardMeta = (boardsQuery.data ?? []).find(
      (b) => b.id === activeBoardId
    );
    if (!activeBoardMeta) return null;
    return apiBoardToUi(activeBoardMeta, groups);
  }, [activeBoardId, groupsQuery.data, tasksQuery.data, boardsQuery.data, memberDirectory]);

  // Keep lastBoard in sync with server hydration. Preserves UI-only `selected`
  // flags across refetches — the server doesn't know about row selection, so a
  // raw overwrite would clear checkboxes mid-edit.
  useEffect(() => {
    if (!activeBoardUi) return;
    setLastBoard((prev) => {
      if (!prev || prev.id !== activeBoardUi.id) return activeBoardUi;
      const selectedIds = new Set<string>();
      for (const g of prev.groups) for (const t of g.tasks) if (t.selected) selectedIds.add(t.id);
      if (selectedIds.size === 0) return activeBoardUi;
      return {
        ...activeBoardUi,
        groups: activeBoardUi.groups.map((g) => ({
          ...g,
          tasks: g.tasks.map((t) =>
            selectedIds.has(t.id) ? { ...t, selected: true } : t
          ),
        })),
      };
    });
  }, [activeBoardUi]);

  const workspaces: Workspace[] = useMemo(() => {
    const list = workspacesQuery.data ?? [];
    return list.map((ws) => {
      // For non-active workspaces, boards array is empty (we only fetch boards for the active one).
      // Sidebar only needs workspace metadata; deep nesting is only used for the active view.
      if (ws.id !== activeWorkspaceId) {
        return apiWorkspaceToUi(ws, []);
      }
      const boardsForWs = (boardsQuery.data ?? []).map((b) => {
        if (b.id === activeBoardId) {
          // Prefer lastBoard for the active board — it's updated synchronously on
          // user edits (status / date / selected / etc.), so the UI reflects the
          // change immediately instead of waiting for the server round-trip.
          // Server refetches still re-sync lastBoard via the effect below.
          if (lastBoard && lastBoard.id === activeBoardId) return lastBoard;
          if (activeBoardUi) return activeBoardUi;
        }
        return apiBoardToUi(b, []);
      });
      return apiWorkspaceToUi(ws, boardsForWs);
    });
  }, [workspacesQuery.data, boardsQuery.data, activeWorkspaceId, activeBoardId, activeBoardUi, lastBoard]);

  // --- Helpers ---
  const getBoard = useCallback(
    (id: string) => {
      for (const ws of workspaces) {
        const b = ws.boards.find((bd) => bd.id === id);
        if (b) return { board: b, workspaceId: ws.id };
      }
      return null;
    },
    [workspaces]
  );

  // --- Mutations orchestrator for updateBoard(whole board) ---
  const dispatchMutation = useCallback(
    async (m: BoardMutation) => {
      switch (m.kind) {
        case 'board.update':
          await boardUpdate.mutateAsync({ id: m.id, data: m.data });
          return;
        case 'group.create':
          await groupCreate.mutateAsync({
            boardId: m.boardId,
            name: m.name,
            color: m.color,
          });
          return;
        case 'group.update':
          await groupUpdate.mutateAsync({ id: m.id, data: m.data });
          return;
        case 'group.delete':
          await groupDelete.mutateAsync({ id: m.id });
          return;
        case 'group.reorder':
          await groupReorder.mutateAsync({
            boardId: m.boardId,
            orderedIds: m.orderedIds,
          });
          return;
        case 'task.create':
          await taskCreate.mutateAsync({
            boardId: m.boardId,
            groupId: m.groupId,
            name: m.name,
            assigneeId: m.personId ?? undefined,
            status: m.status,
            priority: m.priority,
            dueDate: m.dueDate ?? undefined,
            timelineStart: m.timelineStart ?? undefined,
            timelineEnd: m.timelineEnd ?? undefined,
            tags: m.tags,
            progress: m.progress,
          });
          return;
        case 'task.update':
          await taskUpdate.mutateAsync({
            id: m.id,
            data: {
              name: m.data.name,
              status: m.data.status,
              priority: m.data.priority,
              assigneeId: m.data.personId,
              dueDate: m.data.dueDate,
              timelineStart: m.data.timelineStart,
              timelineEnd: m.data.timelineEnd,
              tags: m.data.tags,
              progress: m.data.progress,
              groupId: m.data.groupId,
              customCells: m.data.customCells,
            },
          });
          return;
        case 'task.delete':
          await taskDelete.mutateAsync({ id: m.id });
          return;
        case 'task.reorderInGroup':
          await taskReorder.mutateAsync({
            groupId: m.groupId,
            orderedIds: m.orderedIds,
          });
          return;
      }
    },
    [
      boardUpdate,
      groupCreate,
      groupUpdate,
      groupDelete,
      groupReorder,
      taskCreate,
      taskUpdate,
      taskDelete,
      taskReorder,
    ]
  );

  const updateBoard = useCallback(
    async (next: Board) => {
      const prev = lastBoard;
      setLastBoard(next);
      if (!prev) return;
      const mutations = diffBoard(prev, next);
      if (mutations.length === 0) return;

      // --- Optimistic cache update ---
      // Project the new UI board back onto the React Query caches so the
      // table reorders / edits feel instant. If a mutation fails we
      // invalidate in the catch block so the server state wins.
      const newTaskPositions = new Map<
        string,
        { groupId: string; position: number }
      >();
      next.groups.forEach((g) =>
        g.tasks.forEach((t, i) =>
          newTaskPositions.set(t.id, { groupId: g.id, position: i })
        )
      );
      const newGroupOrder = new Map<string, number>(
        next.groups.map((g, i) => [g.id, i])
      );
      const deletedTaskIds = new Set(
        prev.groups
          .flatMap((g) => g.tasks.map((t) => t.id))
          .filter((id) => !newTaskPositions.has(id))
      );

      utils.task.listByBoard.setData({ boardId: next.id }, (prev) => {
        if (!prev) return prev;
        return prev
          .filter((t) => !deletedTaskIds.has(t.id))
          .map((t) => {
            const pos = newTaskPositions.get(t.id);
            // Find the UI task to pull any field edits.
            const uiTask = next.groups
              .flatMap((g) => g.tasks)
              .find((x) => x.id === t.id);
            return {
              ...t,
              groupId: pos?.groupId ?? t.groupId,
              position: pos?.position ?? t.position,
              ...(uiTask
                ? {
                    name: uiTask.name,
                    status: uiTask.status,
                    priority: uiTask.priority,
                    assigneeId: uiTask.person?.id ?? null,
                    tags: uiTask.tags,
                    progress: uiTask.progress,
                    customCells: uiTask.customCells ?? {},
                  }
                : {}),
            };
          })
          .sort((a, b) => {
            if (a.groupId !== b.groupId) {
              return (
                (newGroupOrder.get(a.groupId) ?? 0) -
                (newGroupOrder.get(b.groupId) ?? 0)
              );
            }
            return a.position - b.position;
          });
      });

      utils.group.listByBoard.setData({ boardId: next.id }, (prev) => {
        if (!prev) return prev;
        const byId = new Map(prev.map((g) => [g.id, g]));
        return next.groups
          .filter((g) => byId.has(g.id))
          .map((g, i) => {
            const existing = byId.get(g.id);
            if (!existing) return existing;
            return {
              ...existing,
              name: g.name,
              color: g.color,
              collapsed: g.collapsed,
              position: i,
            };
          })
          .filter((g): g is NonNullable<typeof g> => !!g);
      });

      try {
        for (const m of mutations) await dispatchMutation(m);
        // Quiet background refresh for any server-side computed fields we
        // might have missed (timestamps, server-assigned ids for creates).
        void utils.task.listByBoard.invalidate({ boardId: next.id });
        void utils.group.listByBoard.invalidate({ boardId: next.id });
        void utils.board.listByWorkspace.invalidate({
          workspaceId: activeWorkspaceId,
        });
      } catch (err) {
        toast({
          title: 'Changes could not be saved',
          description: (err as Error).message,
          variant: 'destructive',
        });
        // Revert the optimistic update by re-fetching canonical state.
        await Promise.all([
          utils.board.listByWorkspace.invalidate({ workspaceId: activeWorkspaceId }),
          utils.group.listByBoard.invalidate({ boardId: next.id }),
          utils.task.listByBoard.invalidate({ boardId: next.id }),
        ]);
      }
    },
    [lastBoard, dispatchMutation, utils, activeWorkspaceId]
  );

  const addWorkspace = useCallback(async () => {
    const n = (workspacesQuery.data ?? []).length + 1;
    const color = DEFAULT_BOARD_PALETTE[n % DEFAULT_BOARD_PALETTE.length];
    const created = await workspaceCreate.mutateAsync({
      name: `Workspace ${n}`,
      color,
      icon: 'building',
    });
    // Inject the new workspace into the cache *before* flipping the active id
    // so the snap-back guard (line ~180) sees the id as valid. Otherwise a
    // refetch race can reset us to the previous workspace.
    utils.workspace.list.setData(undefined, (prev) =>
      prev ? [...prev, created] : [created]
    );
    setActiveWorkspaceId(created.id);
    void utils.workspace.list.invalidate();
  }, [workspacesQuery.data, workspaceCreate, utils, setActiveWorkspaceId]);

  const updateWorkspace = useCallback(
    async (w: Workspace) => {
      await workspaceUpdate.mutateAsync({
        id: w.id,
        data: {
          name: w.name,
          color: w.color,
          icon: w.icon,
          visibility: w.visibility,
        },
      });
      await utils.workspace.list.invalidate();
    },
    [workspaceUpdate, utils]
  );

  const deleteWorkspace = useCallback(
    async (wsId: string) => {
      await workspaceDelete.mutateAsync({ id: wsId });
      await utils.workspace.list.invalidate();
      if (activeWorkspaceId === wsId) {
        setActiveWorkspaceId('');
        setActiveBoardId('');
      }
    },
    [workspaceDelete, utils, activeWorkspaceId]
  );

  const addBoard = useCallback(
    async (workspaceId: string) => {
      const created = await boardCreate.mutateAsync({
        workspaceId,
        name: 'New Board',
      });
      // Seed three default groups.
      await Promise.all([
        groupCreate.mutateAsync({ boardId: created.id, name: 'To Do', color: DEFAULT_BOARD_PALETTE[0] }),
        groupCreate.mutateAsync({ boardId: created.id, name: 'In Progress', color: DEFAULT_BOARD_PALETTE[1] }),
        groupCreate.mutateAsync({ boardId: created.id, name: 'Done', color: DEFAULT_BOARD_PALETTE[2] }),
      ]);
      await utils.board.listByWorkspace.invalidate({ workspaceId });
      setActiveWorkspaceId(workspaceId);
      setActiveBoardId(created.id);
    },
    [boardCreate, groupCreate, utils]
  );

  const createBoard = useCallback(
    (payload: CreateBoardPayload): Board => {
      // Fire-and-forget mutation; returns an optimistic placeholder the UI can
      // link to immediately. The real server-assigned id will take over after
      // the invalidation completes.
      const placeholder: Board = {
        id: `pending-${Date.now()}`,
        name: payload.name,
        description: payload.description ?? '',
        favorite: false,
        clientId: payload.clientId ?? null,
        columns: payload.columns ?? [...DEFAULT_BOARD_COLUMNS],
        groups: payload.groups ?? [],
      };
      (async () => {
        try {
          const created = await boardCreate.mutateAsync({
            workspaceId: payload.workspaceId,
            ...(payload.clientId !== undefined ? { clientId: payload.clientId } : {}),
            name: payload.name,
            description: payload.description,
            ...(payload.columns && payload.columns.length > 0
              ? {
                  columnsConfig: payload.columns.map((c) => ({
                    id: c.id,
                    name: c.name,
                    type: c.type,
                    ...(c.width !== undefined ? { width: c.width } : {}),
                  })),
                }
              : {}),
          });
          const seedGroups =
            payload.groups && payload.groups.length > 0
              ? payload.groups
              : [
                  { name: 'To Do', color: DEFAULT_BOARD_PALETTE[0] },
                  { name: 'In Progress', color: DEFAULT_BOARD_PALETTE[1] },
                  { name: 'Done', color: DEFAULT_BOARD_PALETTE[2] },
                ];
          for (const g of seedGroups) {
            await groupCreate.mutateAsync({
              boardId: created.id,
              name: g.name,
              color: g.color,
            });
          }
          await utils.board.listByWorkspace.invalidate({
            workspaceId: payload.workspaceId,
          });
          setActiveWorkspaceId(payload.workspaceId);
          setActiveBoardId(created.id);
        } catch (err) {
          toast({
            title: 'Could not create board',
            description: (err as Error).message,
            variant: 'destructive',
          });
        }
      })();
      return placeholder;
    },
    [boardCreate, groupCreate, utils]
  );

  const renameBoard = useCallback(
    async (workspaceId: string, boardId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await boardUpdate.mutateAsync({ id: boardId, data: { name: trimmed } });
      await utils.board.listByWorkspace.invalidate({ workspaceId });
    },
    [boardUpdate, utils]
  );

  const deleteBoard = useCallback(
    async (workspaceId: string, boardId: string) => {
      await boardDelete.mutateAsync({ id: boardId });
      await utils.board.listByWorkspace.invalidate({ workspaceId });
      if (activeBoardId === boardId) setActiveBoardId('');
    },
    [boardDelete, utils, activeBoardId]
  );

  const reorderBoards = useCallback(
    async (workspaceId: string, boards: Board[]) => {
      await boardReorder.mutateAsync({
        workspaceId,
        orderedIds: boards.map((b) => b.id),
      });
      await utils.board.listByWorkspace.invalidate({ workspaceId });
    },
    [boardReorder, utils]
  );

  const switchWorkspace = useCallback(
    (wsId: string) => {
      setActiveWorkspaceId(wsId);
      setActiveBoardId('');
    },
    []
  );

  // We treat the in-between renders as "still loading" so the page doesn't
  // flash an empty state while the next-level query is about to enable:
  //   workspaces resolved → activeWorkspaceId effect → boards query enables
  //   boards resolved     → activeBoardId effect     → groups/tasks enable
  const hasWorkspaces = (workspacesQuery.data?.length ?? 0) > 0;
  const hasBoards = (boardsQuery.data?.length ?? 0) > 0;
  const isLoading =
    !isReady ||
    (isAuthenticated &&
      (workspacesQuery.isLoading ||
        (hasWorkspaces && !activeWorkspaceId) ||
        (!!activeWorkspaceId && (boardsQuery.isLoading || !boardsQuery.data)) ||
        (hasBoards && !activeBoardId) ||
        (!!activeBoardId &&
          (groupsQuery.isLoading ||
            tasksQuery.isLoading ||
            !groupsQuery.data ||
            !tasksQuery.data))));

  const members: Person[] = useMemo(
    () => (membersQuery.data ?? []).map(personFromMember),
    [membersQuery.data]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspaceId,
      activeBoardId,
      setActiveWorkspaceId,
      setActiveBoardId,
      getBoard,
      updateBoard,
      addWorkspace,
      updateWorkspace,
      deleteWorkspace,
      addBoard,
      createBoard,
      renameBoard,
      deleteBoard,
      reorderBoards,
      switchWorkspace,
      members,
      isLoading,
    }),
    [
      workspaces,
      activeWorkspaceId,
      activeBoardId,
      getBoard,
      updateBoard,
      addWorkspace,
      updateWorkspace,
      deleteWorkspace,
      addBoard,
      createBoard,
      renameBoard,
      deleteBoard,
      reorderBoards,
      switchWorkspace,
      members,
      isLoading,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaces(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspaces must be used inside <WorkspaceProvider>');
  return ctx;
}
