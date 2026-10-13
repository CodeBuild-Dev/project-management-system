import type {
  Board as UiBoard,
  Workspace as UiWorkspace,
  TaskGroup as UiTaskGroup,
  Task as UiTask,
  Person,
} from '@/data/types';
import { DEFAULT_BOARD_COLUMNS } from '@/data/types';
import type {
  Board as ApiBoard,
  BoardColumn as ApiBoardColumn,
  Task as ApiTask,
  TaskGroup as ApiTaskGroup,
  Workspace as ApiWorkspace,
} from '@projectmgmt/shared';
import type { Column as UiColumn } from '@/data/types';

/**
 * Map backend -> UI shapes. The UI still expects nested Workspace → Board →
 * Group → Task; assembly happens in WorkspaceContext from flat query results.
 *
 * Assignee (backend: UUID string) is mapped to UI's Person via a lookup table
 * the caller injects (built from the member directory).
 */

export function apiWorkspaceToUi(w: ApiWorkspace, boards: UiBoard[]): UiWorkspace {
  return {
    id: w.id,
    name: w.name,
    color: w.color,
    icon: w.icon,
    visibility: w.visibility,
    boards,
  };
}

function apiColumnToUi(c: ApiBoardColumn): UiColumn {
  return { id: c.id, name: c.name, type: c.type, width: c.width, options: c.options };
}

export function apiBoardToUi(
  b: ApiBoard,
  groups: UiTaskGroup[]
): UiBoard {
  const stored = b.columnsConfig ?? [];
  return {
    id: b.id,
    name: b.name,
    description: b.description,
    favorite: b.favorite,
    visibility: b.visibility,
    clientId: b.clientId,
    groups,
    // Fall back to the built-in defaults on boards that have never been
    // customised. Once the user adds / renames / reorders a column the whole
    // array is persisted to columnsConfig and that's the source of truth.
    columns:
      stored.length > 0 ? stored.map(apiColumnToUi) : [...DEFAULT_BOARD_COLUMNS],
  };
}

export function apiGroupToUi(
  g: ApiTaskGroup,
  tasks: UiTask[]
): UiTaskGroup {
  return {
    id: g.id,
    name: g.name,
    color: g.color,
    collapsed: g.collapsed,
    tasks,
  };
}

export function apiTaskToUi(
  t: ApiTask,
  personLookup: (id: string) => Person | null
): UiTask {
  return {
    id: t.id,
    name: t.name,
    person: t.assigneeId ? personLookup(t.assigneeId) : null,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? toDateOnly(t.dueDate) : null,
    timelineStart: t.timelineStart ? toDateOnly(t.timelineStart) : null,
    timelineEnd: t.timelineEnd ? toDateOnly(t.timelineEnd) : null,
    tags: t.tags,
    progress: t.progress,
    selected: false,
    archived: !!t.archivedAt,
    customCells: t.customCells ?? {},
  };
}

function toDateOnly(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  // The UI stores ISO dates as YYYY-MM-DD strings.
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
