import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BoardView } from '@/components/board/BoardView';
import { BoardSkeleton } from '@/components/board/BoardSkeleton';
import {
  ProjectSelectorBar,
  LAST_PROJECT_LS_KEY,
} from '@/components/board/ProjectSelectorBar';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { EmptyState } from '@/components/EmptyState';
import { QuickCreateTaskDialog } from '@/components/QuickCreateTaskDialog';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { Briefcase, LayoutGrid } from 'lucide-react';

export default function BoardPage() {
  const { t } = useTranslation();
  const { workspaceId, boardId, taskId } = useParams<{
    workspaceId?: string;
    boardId?: string;
    taskId?: string;
  }>();
  const navigate = useNavigate();
  const {
    workspaces,
    activeBoardId,
    setActiveBoardId,
    setActiveWorkspaceId,
    getBoard,
    updateBoard,
    addWorkspace,
    isLoading,
  } = useWorkspaces();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  // Sync URL → context, or upgrade legacy URLs to the canonical workspace-scoped form.
  // /boards with no id auto-resolves to the most recently opened project
  // (via localStorage), falling back to the alphabetically-first project.
  useEffect(() => {
    if (boardId) {
      const match = getBoard(boardId);
      if (match) {
        const taskSegment = taskId ? `/tasks/${taskId}` : '';
        if (!workspaceId) {
          navigate(`/workspaces/${match.workspaceId}/boards/${boardId}${taskSegment}`, {
            replace: true,
          });
          return;
        }
        if (workspaceId !== match.workspaceId) {
          navigate(`/workspaces/${match.workspaceId}/boards/${boardId}${taskSegment}`, {
            replace: true,
          });
          return;
        }
        setActiveBoardId(boardId);
        setActiveWorkspaceId(match.workspaceId);
        // Remember last-opened so cold loads of /boards land here next time.
        try {
          localStorage.setItem(LAST_PROJECT_LS_KEY, boardId);
        } catch {
          /* localStorage can fail in private windows — ignore. */
        }
        return;
      }
      // Unknown board id → fall through to default
    }

    if (workspaceId) {
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (ws) {
        setActiveWorkspaceId(workspaceId);
        const firstBoard = ws.boards[0];
        if (firstBoard) {
          navigate(`/workspaces/${workspaceId}/boards/${firstBoard.id}`, {
            replace: true,
          });
        }
        return;
      }
    }

    // No id in URL: try the localStorage hint, then fall back to the
    // alphabetically-first project across every workspace.
    if (!boardId && !workspaceId) {
      const allBoards = workspaces.flatMap((w) =>
        w.boards.map((b) => ({ board: b, workspaceId: w.id }))
      );
      if (allBoards.length === 0) return; // Empty workspace — let the page render the EmptyState.
      let target: { board: { id: string }; workspaceId: string } | null = null;
      try {
        const last = localStorage.getItem(LAST_PROJECT_LS_KEY);
        if (last) {
          target = allBoards.find((b) => b.board.id === last) ?? null;
        }
      } catch {
        /* ignore */
      }
      if (!target) {
        target = [...allBoards].sort((a, b) =>
          a.board.name.localeCompare(b.board.name)
        )[0];
      }
      if (target) {
        navigate(`/workspaces/${target.workspaceId}/boards/${target.board.id}`, {
          replace: true,
        });
      }
    }
  }, [
    boardId,
    workspaceId,
    taskId,
    workspaces,
    getBoard,
    navigate,
    setActiveBoardId,
    setActiveWorkspaceId,
  ]);

  const currentId = boardId ?? activeBoardId;
  const entry = getBoard(currentId);

  const urlOutOfSyncWithState = !!boardId && !!activeBoardId && boardId !== activeBoardId;
  if (isLoading || urlOutOfSyncWithState) {
    return <BoardSkeleton />;
  }

  // Page chrome — the selector bar lives on every state below, so we
  // render the shell once and switch the body.
  const body = (() => {
    if (!entry) {
      // No workspace → walk the user through creating one first.
      if (workspaces.length === 0) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={Briefcase}
              title={t('board.page.noWorkspaceTitle')}
              description={t('board.page.noWorkspaceDesc')}
              actionLabel={t('board.page.createWorkspace')}
              onAction={() => addWorkspace()}
            />
          </div>
        );
      }

      const anyBoard = workspaces.some((w) => w.boards.length > 0);
      // Either no projects at all (genuine empty state) or we're waiting
      // for the localStorage effect above to redirect us to one.
      return (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={LayoutGrid}
            title={
              anyBoard
                ? t('board.page.pickBoardTitle')
                : t('board.page.noBoardsTitle')
            }
            description={
              anyBoard
                ? t('board.page.pickBoardDesc')
                : t('board.page.noBoardsDesc')
            }
            actionLabel={
              anyBoard ? undefined : t('board.page.createBoard')
            }
            onAction={anyBoard ? undefined : () => setProjectDialogOpen(true)}
          />
        </div>
      );
    }
    return (
      <BoardView
        board={entry.board}
        workspaceId={entry.workspaceId}
        taskIdFromUrl={taskId ?? null}
        onBoardChange={updateBoard}
      />
    );
  })();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-indigo-50/40 via-background to-violet-50/30 dark:from-indigo-950/15 dark:via-background dark:to-violet-950/15">
      <ProjectSelectorBar
        selectedBoardId={entry?.board.id ?? null}
        onCreateTask={() => setTaskDialogOpen(true)}
        onCreateProject={() => setProjectDialogOpen(true)}
      />
      {body}
      <QuickCreateTaskDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        initialBoardId={entry?.board.id ?? null}
      />
      <CreateProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
      />
    </div>
  );
}
