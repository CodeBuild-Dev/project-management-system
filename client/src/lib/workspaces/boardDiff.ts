import type { Board, Column, Task, TaskGroup } from '@/data/types';

/**
 * Diff two Board snapshots and emit a list of atomic mutations. The UI uses
 * wholesale onBoardChange(newBoard); this diff converts that back into the
 * granular tRPC mutations the server expects.
 *
 * The caller maps task.person (UI Person) back to assigneeId via a lookup.
 */

export type BoardMutation =
  | { kind: 'board.update'; id: string; data: BoardPatch }
  | { kind: 'group.create'; boardId: string; name: string; color: string }
  | { kind: 'group.update'; id: string; data: GroupPatch }
  | { kind: 'group.delete'; id: string }
  | { kind: 'group.reorder'; boardId: string; orderedIds: string[] }
  | {
      kind: 'task.create';
      boardId: string;
      groupId: string;
      name: string;
      personId: string | null;
      status?: Task['status'];
      priority?: Task['priority'];
      dueDate?: Date | null;
      timelineStart?: Date | null;
      timelineEnd?: Date | null;
      tags?: string[];
      progress?: number;
    }
  | { kind: 'task.update'; id: string; data: TaskPatch }
  | { kind: 'task.delete'; id: string }
  | { kind: 'task.reorderInGroup'; groupId: string; orderedIds: string[] };

export interface BoardPatch {
  name?: string;
  description?: string;
  favorite?: boolean;
  visibility?: 'public' | 'private';
  columnsConfig?: Column[];
}

export interface GroupPatch {
  name?: string;
  color?: string;
  collapsed?: boolean;
}

export interface TaskPatch {
  name?: string;
  status?: Task['status'];
  priority?: Task['priority'];
  personId?: string | null;
  dueDate?: Date | null;
  timelineStart?: Date | null;
  timelineEnd?: Date | null;
  tags?: string[];
  progress?: number;
  groupId?: string;
  customCells?: Record<string, unknown>;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function dateEq(a: string | null, b: string | null) {
  return (a ?? '') === (b ?? '');
}

function arrEq(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function columnsEqual(a: Column[], b: Column[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const l = a[i];
    const r = b[i];
    if (l.id !== r.id || l.name !== r.name || l.type !== r.type || l.width !== r.width) {
      return false;
    }
    // Option arrays differ by reference often; compare deeply.
    if (JSON.stringify(l.options ?? null) !== JSON.stringify(r.options ?? null)) {
      return false;
    }
  }
  return true;
}

function cellsEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined
): boolean {
  const ka = Object.keys(a ?? {});
  const kb = Object.keys(b ?? {});
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b ?? {}, k)) return false;
    if (JSON.stringify((a as Record<string, unknown>)[k]) !== JSON.stringify((b as Record<string, unknown>)[k])) {
      return false;
    }
  }
  return true;
}

export function diffBoard(prev: Board, next: Board): BoardMutation[] {
  const out: BoardMutation[] = [];

  // --- Board metadata ---
  const boardPatch: BoardPatch = {};
  if (prev.name !== next.name) boardPatch.name = next.name;
  if (prev.description !== next.description) boardPatch.description = next.description;
  if (prev.favorite !== next.favorite) boardPatch.favorite = next.favorite;
  if ((prev.visibility ?? 'public') !== (next.visibility ?? 'public')) {
    boardPatch.visibility = next.visibility ?? 'public';
  }
  if (!columnsEqual(prev.columns, next.columns)) {
    boardPatch.columnsConfig = next.columns;
  }
  if (Object.keys(boardPatch).length) {
    out.push({ kind: 'board.update', id: prev.id, data: boardPatch });
  }

  // --- Groups ---
  const prevGroups = new Map<string, TaskGroup>(prev.groups.map((g) => [g.id, g]));
  const nextGroups = new Map<string, TaskGroup>(next.groups.map((g) => [g.id, g]));

  // Deletes
  for (const id of prevGroups.keys()) {
    if (!nextGroups.has(id)) out.push({ kind: 'group.delete', id });
  }

  // Creates
  const createdGroupLocalIds: string[] = [];
  for (const g of next.groups) {
    if (!prevGroups.has(g.id)) {
      out.push({ kind: 'group.create', boardId: prev.id, name: g.name, color: g.color });
      createdGroupLocalIds.push(g.id);
    }
  }

  // Updates (metadata only — position handled via reorder)
  for (const g of next.groups) {
    const before = prevGroups.get(g.id);
    if (!before) continue;
    const patch: GroupPatch = {};
    if (before.name !== g.name) patch.name = g.name;
    if (before.color !== g.color) patch.color = g.color;
    if (before.collapsed !== g.collapsed) patch.collapsed = g.collapsed;
    if (Object.keys(patch).length) out.push({ kind: 'group.update', id: g.id, data: patch });
  }

  // Reorder if positions differ
  const prevOrder = prev.groups.map((g) => g.id);
  const nextOrder = next.groups.map((g) => g.id);
  const bothExist = nextOrder.filter((id) => prevGroups.has(id));
  const prevBothOrder = prevOrder.filter((id) => nextGroups.has(id));
  if (!arrEq(bothExist, prevBothOrder)) {
    out.push({
      kind: 'group.reorder',
      boardId: prev.id,
      orderedIds: nextOrder.filter((id) => !createdGroupLocalIds.includes(id)),
    });
  }

  // --- Tasks ---
  // Flatten to (taskId → {groupId, task})
  const prevTasks = new Map<string, { groupId: string; t: Task }>();
  for (const g of prev.groups) for (const t of g.tasks) prevTasks.set(t.id, { groupId: g.id, t });
  const nextTasks = new Map<string, { groupId: string; t: Task }>();
  for (const g of next.groups) for (const t of g.tasks) nextTasks.set(t.id, { groupId: g.id, t });

  // Deletes
  for (const id of prevTasks.keys()) {
    if (!nextTasks.has(id)) out.push({ kind: 'task.delete', id });
  }

  // Creates
  const createdTaskLocalIds = new Set<string>();
  for (const [id, info] of nextTasks) {
    if (!prevTasks.has(id)) {
      out.push({
        kind: 'task.create',
        boardId: prev.id,
        groupId: info.groupId,
        name: info.t.name,
        personId: info.t.person?.id ?? null,
        status: info.t.status,
        priority: info.t.priority,
        dueDate: parseDate(info.t.dueDate),
        timelineStart: parseDate(info.t.timelineStart),
        timelineEnd: parseDate(info.t.timelineEnd),
        tags: info.t.tags,
        progress: info.t.progress,
      });
      createdTaskLocalIds.add(id);
    }
  }

  // Updates + moves
  for (const [id, info] of nextTasks) {
    if (createdTaskLocalIds.has(id)) continue;
    const before = prevTasks.get(id);
    if (!before) continue;
    const a = before.t;
    const b = info.t;
    const patch: TaskPatch = {};
    if (a.name !== b.name) patch.name = b.name;
    if (a.status !== b.status) patch.status = b.status;
    if (a.priority !== b.priority) patch.priority = b.priority;
    if (a.person?.id !== b.person?.id) patch.personId = b.person?.id ?? null;
    if (!dateEq(a.dueDate, b.dueDate)) patch.dueDate = parseDate(b.dueDate);
    if (!dateEq(a.timelineStart, b.timelineStart)) patch.timelineStart = parseDate(b.timelineStart);
    if (!dateEq(a.timelineEnd, b.timelineEnd)) patch.timelineEnd = parseDate(b.timelineEnd);
    if (!arrEq(a.tags, b.tags)) patch.tags = b.tags;
    if (a.progress !== b.progress) patch.progress = b.progress;
    if (!cellsEqual(a.customCells, b.customCells)) patch.customCells = b.customCells ?? {};
    if (before.groupId !== info.groupId) patch.groupId = info.groupId;
    if (Object.keys(patch).length) {
      out.push({ kind: 'task.update', id, data: patch });
    }
  }

  // Per-group task reorder — emit only when order among existing tasks changed.
  for (const g of next.groups) {
    const beforeGroup = prevGroups.get(g.id);
    if (!beforeGroup) continue;
    const beforeIds = beforeGroup.tasks.map((t) => t.id);
    const nextIds = g.tasks.map((t) => t.id);
    // Exclude newly-created tasks from the reorder list — their position is set on create.
    const nextExisting = nextIds.filter(
      (id) => !createdTaskLocalIds.has(id) && beforeIds.includes(id)
    );
    const beforeExisting = beforeIds.filter((id) => nextIds.includes(id));
    if (!arrEq(nextExisting, beforeExisting) && nextExisting.length > 1) {
      out.push({
        kind: 'task.reorderInGroup',
        groupId: g.id,
        orderedIds: nextExisting,
      });
    }
  }

  return out;
}
