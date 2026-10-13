import type { StatusType, PriorityType, TaskSource } from './enums.js';

export interface Task {
  id: string;
  boardId: string;
  groupId: string;
  assigneeId: string | null;
  name: string;
  status: StatusType;
  priority: PriorityType;
  dueDate: Date | null;
  timelineStart: Date | null;
  timelineEnd: Date | null;
  tags: string[];
  progress: number; // 0-100
  /** Optional time estimate in minutes; null = unestimated. */
  estimatedMinutes: number | null;
  position: number;
  source: TaskSource;
  /** Keyed by BoardColumn.id — values for user-defined columns. */
  customCells: Record<string, unknown>;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface CreateTaskInput {
  boardId: string;
  groupId: string;
  name: string;
  assigneeId?: string;
  status?: StatusType;
  priority?: PriorityType;
  dueDate?: Date;
  timelineStart?: Date;
  timelineEnd?: Date;
  tags?: string[];
  progress?: number;
  estimatedMinutes?: number | null;
}

export interface UpdateTaskInput {
  name?: string;
  assigneeId?: string | null;
  status?: StatusType;
  priority?: PriorityType;
  dueDate?: Date | null;
  timelineStart?: Date | null;
  timelineEnd?: Date | null;
  tags?: string[];
  progress?: number;
  estimatedMinutes?: number | null;
  position?: number;
  groupId?: string;
  customCells?: Record<string, unknown>;
}

export interface TaskUpdateAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  /** Currently a base64 data URL; becomes an S3 URL once file storage lands. */
  url: string;
}

export interface TaskUpdate {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  mentions: string[];
  attachments: TaskUpdateAttachment[];
  editedAt: Date | null;
  createdAt: Date;
}

export interface CreateTaskUpdateInput {
  taskId: string;
  content: string;
  mentions?: string[];
  attachments?: TaskUpdateAttachment[];
}
