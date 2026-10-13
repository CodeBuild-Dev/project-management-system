/**
 * Status & priority are now stored as the id of an option from the board's
 * column config. The four/four defaults below are what every new board
 * starts with — boards can rename, recolour, add, or remove options. The
 * type is therefore a plain string; valid values come from `column.options`.
 */
export type StatusType = string;
export type PriorityType = string;

export interface ColumnOption {
  id: string;
  label: string;
  /** Tailwind background class (e.g. "bg-status-green") or raw hex. */
  color: string;
}

export interface Person {
  id: string;
  name: string;
  avatar?: string;
  initials: string;
  color: string;
}

/**
 * Column type enum.
 * Built-in types (value lives on the Task directly for backward compat):
 *   person, status, priority, dueDate, timeline, tags, progress
 * Custom types (value lives in task.customCells[columnId]):
 *   text, number, date, checkbox, rating
 */
export type ColumnType =
  | 'person'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'timeline'
  | 'tags'
  | 'progress'
  | 'text'
  | 'number'
  | 'date'
  | 'checkbox'
  | 'rating';

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  /** Optional fixed width in px; otherwise computed by the browser. */
  width?: number;
  /** Present for status / priority columns. Empty/missing → use default seed. */
  options?: ColumnOption[];
}

export interface Task {
  id: string;
  name: string;
  person: Person | null;
  status: StatusType;
  priority: PriorityType;
  dueDate: string | null;
  timelineStart: string | null;
  timelineEnd: string | null;
  tags: string[];
  progress: number;
  selected: boolean;
  /** Archived tasks are hidden from the default views but not deleted. */
  archived?: boolean;
  /** Values for custom-type columns (keyed by column.id). Built-in types use the fields above. */
  customCells?: Record<string, unknown>;
}

export interface TaskGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  tasks: Task[];
}

export type Visibility = 'public' | 'private';

export interface Board {
  id: string;
  name: string;
  description: string;
  favorite: boolean;
  /** 'public' = everyone in the parent workspace can see it; 'private' = only listed members. Defaults to 'public'. */
  visibility?: Visibility;
  /** Optional link to a Client (freelance project owner). Null/undefined for internal boards. */
  clientId?: string | null;
  groups: TaskGroup[];
  columns: Column[];
}

export interface Workspace {
  id: string;
  name: string;
  color: string;
  icon: string;
  /** 'public' = discoverable across the organization; 'private' = members-only. Defaults to 'public'. */
  visibility?: Visibility;
  boards: Board[];
}

// ---------- UI-only state (will be persisted once backend lands) ----------

/** A single file or image attached to an update. Stored as a data URL locally. */
export interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** data URL (or URL once backend file storage lands). */
  url: string;
}

export interface TaskUpdate {
  id: string;
  taskId: string;
  author: Person;
  content: string;
  /** User IDs referenced via `@` in the content. */
  mentions?: string[];
  /** File attachments (images, documents). */
  attachments?: Attachment[];
  createdAt: string; // ISO
  /** ISO timestamp of last edit; null if never edited. */
  editedAt?: string | null;
  /** Likes — ids of users who liked this update (demo: empty). */
  likedBy?: string[];
}

export type ActivityType =
  | 'task_created'
  | 'task_updated'
  | 'task_moved'
  | 'status_changed'
  | 'assignee_changed'
  | 'priority_changed'
  | 'due_date_changed'
  | 'progress_changed'
  | 'name_changed'
  | 'tags_changed'
  | 'comment_added';

export interface ActivityEntry {
  id: string;
  taskId: string;
  type: ActivityType;
  actor: Person;
  summary: string;
  createdAt: string; // ISO
}

// ---------- Defaults ----------

export const BUILT_IN_COLUMN_TYPES: ColumnType[] = [
  'person',
  'status',
  'priority',
  'dueDate',
  'timeline',
  'tags',
  'progress',
];

export const CUSTOM_COLUMN_TYPES: ColumnType[] = ['text', 'number', 'date', 'checkbox', 'rating'];

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> = {
  person: 'Person',
  status: 'Status',
  priority: 'Priority',
  dueDate: 'Due Date',
  timeline: 'Timeline',
  tags: 'Tags',
  progress: 'Progress',
  text: 'Text',
  number: 'Number',
  date: 'Date',
  checkbox: 'Checkbox',
  rating: 'Rating',
};

/**
 * Default seed for the status column on new boards. The ids match the
 * historical enum values so existing rows keep rendering after the
 * 0006 migration that relaxed the enum to text.
 */
export const DEFAULT_STATUS_OPTIONS: ColumnOption[] = [
  { id: 'not-started', label: 'Not Started', color: 'bg-status-gray' },
  { id: 'working', label: 'Working on it', color: 'bg-status-orange' },
  { id: 'stuck', label: 'Stuck', color: 'bg-status-red' },
  { id: 'done', label: 'Done', color: 'bg-status-green' },
];

export const DEFAULT_PRIORITY_OPTIONS: ColumnOption[] = [
  { id: 'critical', label: 'Critical', color: 'bg-status-red' },
  { id: 'high', label: 'High', color: 'bg-status-orange' },
  { id: 'medium', label: 'Medium', color: 'bg-status-yellow' },
  { id: 'low', label: 'Low', color: 'bg-status-blue' },
];

/** Palette presented in the inline option editor when picking a colour. */
export const OPTION_COLOR_PALETTE: string[] = [
  'bg-status-green',
  'bg-status-orange',
  'bg-status-red',
  'bg-status-blue',
  'bg-status-purple',
  'bg-status-yellow',
  'bg-status-gray',
];

/**
 * Resolve the active options for a column — falls back to the canonical
 * default seed if the column doesn't have a custom list yet (existing
 * boards saved before 0006 land here).
 */
export function resolveColumnOptions(column: Pick<Column, 'type' | 'options'>): ColumnOption[] {
  if (column.options && column.options.length > 0) return column.options;
  if (column.type === 'status') return DEFAULT_STATUS_OPTIONS;
  if (column.type === 'priority') return DEFAULT_PRIORITY_OPTIONS;
  return [];
}

export const DEFAULT_BOARD_COLUMNS: Column[] = [
  { id: 'col-person', name: 'Person', type: 'person' },
  { id: 'col-status', name: 'Status', type: 'status', options: DEFAULT_STATUS_OPTIONS },
  { id: 'col-priority', name: 'Priority', type: 'priority', options: DEFAULT_PRIORITY_OPTIONS },
  { id: 'col-dueDate', name: 'Due Date', type: 'dueDate' },
  { id: 'col-timeline', name: 'Timeline', type: 'timeline' },
  { id: 'col-tags', name: 'Tags', type: 'tags' },
  { id: 'col-progress', name: 'Progress', type: 'progress' },
];

/** Fallback used when an in-flight task references an option id that's been deleted. */
export const FALLBACK_OPTION: ColumnOption = {
  id: '__fallback',
  label: '(removed)',
  color: 'bg-muted',
};
