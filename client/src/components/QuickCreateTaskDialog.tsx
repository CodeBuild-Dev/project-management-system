import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspaces } from '@/lib/workspaces/WorkspaceContext';
import { trpc } from '@/lib/trpc/client';

interface QuickCreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select this project when the dialog opens (e.g. the one the user is currently viewing). */
  initialBoardId?: string | null;
}

interface BoardOption {
  id: string;
  name: string;
  groups: { id: string; name: string }[];
}

/**
 * "New task" dialog with a Project picker + Group picker. Defaults to the
 * project passed via `initialBoardId` (the one the user is currently
 * viewing) and to that project's first group, so a user inside a project
 * can hit New task → Enter without touching anything else.
 */
export function QuickCreateTaskDialog({
  open,
  onOpenChange,
  initialBoardId,
}: QuickCreateTaskDialogProps) {
  const { workspaces } = useWorkspaces();
  const utils = trpc.useUtils();
  const [name, setName] = useState('');

  // Flatten projects with their groups (only those that have at least one
  // group — there's nowhere to drop a new task otherwise).
  const boards = useMemo<BoardOption[]>(
    () =>
      workspaces.flatMap((ws) =>
        ws.boards
          .filter((b) => b.groups.length > 0)
          .map((b) => ({
            id: b.id,
            name: b.name,
            groups: b.groups.map((g) => ({ id: g.id, name: g.name })),
          }))
      ),
    [workspaces]
  );

  // Resolve the initial selection: prefer the explicit `initialBoardId`, then
  // fall back to the first available project.
  const resolveInitialBoardId = (): string =>
    boards.find((b) => b.id === initialBoardId)?.id ??
    boards[0]?.id ??
    '';

  const [boardId, setBoardId] = useState<string>(resolveInitialBoardId);
  const [groupId, setGroupId] = useState<string>(() => {
    const b = boards.find((x) => x.id === resolveInitialBoardId());
    return b?.groups[0]?.id ?? '';
  });

  // When the dialog opens (or the initial project changes), re-sync to the
  // caller's preferred selection. Closing without saving doesn't reset —
  // we wait for the next open to recompute.
  useEffect(() => {
    if (!open) return;
    const next = resolveInitialBoardId();
    setBoardId(next);
    const b = boards.find((x) => x.id === next);
    setGroupId(b?.groups[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialBoardId]);

  // If the user manually switches project, reset the group to that project's first one.
  const onPickBoard = (nextBoardId: string) => {
    setBoardId(nextBoardId);
    const b = boards.find((x) => x.id === nextBoardId);
    setGroupId(b?.groups[0]?.id ?? '');
  };

  const activeBoard = boards.find((b) => b.id === boardId);

  const createMut = trpc.task.create.useMutation({
    onSuccess: () => {
      utils.task.listByBoard.invalidate();
      toast.success('Task created');
      onOpenChange(false);
      setName('');
    },
    onError: (err) => toast.error(err.message),
  });

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (!boardId || !groupId) return;
    createMut.mutate({
      boardId,
      groupId,
      name: trimmed,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>
            Add a task to a project group. Auto-fills to the project you're on.
          </DialogDescription>
        </DialogHeader>

        {boards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            You don't have a project yet — create one first, then come back.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label htmlFor="qct-board">Project</Label>
              <Select value={boardId} onValueChange={onPickBoard}>
                <SelectTrigger id="qct-board">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="qct-group">Group</Label>
              <Select
                value={groupId}
                onValueChange={setGroupId}
                disabled={!activeBoard || activeBoard.groups.length === 0}
              >
                <SelectTrigger id="qct-group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activeBoard?.groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="qct-name">Task name</Label>
              <Input
                id="qct-name"
                autoFocus
                value={name}
                placeholder="e.g. Send invoice for May"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              !name.trim() ||
              boards.length === 0 ||
              !boardId ||
              !groupId ||
              createMut.isPending
            }
          >
            {createMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
