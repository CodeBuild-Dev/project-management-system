import { EventEmitter } from 'node:events';
import type {
  Task,
  TaskUpdate,
  Board,
  Workspace,
  TaskGroup,
  WorkspaceMember,
  Activity,
  Client,
  TimeEntry,
  Expense,
} from '@projectmgmt/shared';

export interface DomainActor {
  id: string;
  email: string;
}

/**
 * Typed event map for all cross-entity notifications. Sprint 1 registers
 * producers; Sprint 3/4 add handlers (notifications, realtime broadcast).
 */
export interface EventMap {
  'workspace.created': { workspace: Workspace; actor: DomainActor };
  'workspace.updated': {
    workspace: Workspace;
    previous: Workspace;
    actor: DomainActor;
  };
  'workspace.deleted': { workspace: Workspace; actor: DomainActor };

  'board.created': { board: Board; actor: DomainActor };
  'board.updated': { board: Board; previous: Board; actor: DomainActor };
  'board.deleted': { board: Board; actor: DomainActor };

  'group.created': { group: TaskGroup; actor: DomainActor };
  'group.updated': {
    group: TaskGroup;
    previous: TaskGroup;
    actor: DomainActor;
  };
  'group.deleted': { group: TaskGroup; actor: DomainActor };

  'task.created': { task: Task; actor: DomainActor };
  'task.updated': { task: Task; previous: Task; actor: DomainActor };
  'task.moved': { task: Task; previous: Task; actor: DomainActor };
  'task.deleted': { task: Task; actor: DomainActor };

  'task_update.created': {
    update: TaskUpdate;
    task: Task;
    actor: DomainActor;
  };
  'task_update.updated': {
    update: TaskUpdate;
    previous: TaskUpdate;
    task: Task;
    actor: DomainActor;
  };
  'task_update.deleted': {
    updateId: string;
    taskId: string;
    task: Task;
    actor: DomainActor;
  };

  'member.added': {
    member: WorkspaceMember;
    workspaceId: string;
    actor: DomainActor;
  };
  'member.removed': {
    userId: string;
    workspaceId: string;
    actor: DomainActor;
  };

  'activity.recorded': { activity: Activity };

  'client.created': { client: Client; actor: DomainActor };
  'client.updated': { client: Client; previous: Client; actor: DomainActor };
  'client.deleted': { client: Client; actor: DomainActor };

  'time_entry.created': { entry: TimeEntry; actor: DomainActor };
  'time_entry.updated': {
    entry: TimeEntry;
    previous: TimeEntry;
    actor: DomainActor;
  };
  'time_entry.deleted': { entry: TimeEntry; actor: DomainActor };

  'expense.created': { expense: Expense; actor: DomainActor };
  'expense.updated': {
    expense: Expense;
    previous: Expense;
    actor: DomainActor;
  };
  'expense.deleted': { expense: Expense; actor: DomainActor };

  /** Internal — fired by handlers / cron after writing a notification row,
   *  so the realtime bridge can poke the recipient's user channel without
   *  every producer also having to know about SSE. */
  'notification.created': { userId: string; entityId: string; type: string };
}

export type EventName = keyof EventMap;

/**
 * Singleton event bus. Services emit; handlers subscribe. Handlers are
 * registered once at server boot from services/handlers.ts.
 */
class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit<E extends EventName>(event: E, payload: EventMap[E]): void {
    this.emitter.emit(event, payload);
  }

  on<E extends EventName>(
    event: E,
    handler: (payload: EventMap[E]) => void | Promise<void>
  ): () => void {
    const wrapped = (payload: EventMap[E]) => {
      void Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => {
          console.error(`[event-bus] handler for "${event}" threw:`, err);
        });
    };
    this.emitter.on(event, wrapped);
    return () => this.emitter.off(event, wrapped);
  }

  removeAll(): void {
    this.emitter.removeAllListeners();
  }
}

export const eventBus = new TypedEventBus();
