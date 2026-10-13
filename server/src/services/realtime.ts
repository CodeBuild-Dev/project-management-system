import type { Response } from 'express';
import { eventBus } from './event-bus.js';

/**
 * Simple in-memory SSE hub. Clients subscribe by opening a long-lived HTTP
 * response, the server writes event payloads as they occur. In prod you'd
 * front this with Redis pub/sub once you need multi-process scale.
 */

interface Client {
  id: string;
  res: Response;
  scope: Scope;
}

type Scope =
  | { kind: 'board'; boardId: string }
  | { kind: 'user'; userId: string };

const clients = new Map<string, Client>();

export function registerClient(client: Client): () => void {
  clients.set(client.id, client);
  // SSE boilerplate — heartbeat every 25s keeps CloudFront / Railway proxies
  // from closing the connection.
  const heartbeat = setInterval(() => {
    try {
      client.res.write(': ping\n\n');
    } catch {
      /* closed */
    }
  }, 25_000);
  return () => {
    clearInterval(heartbeat);
    clients.delete(client.id);
  };
}

function send(clientId: string, event: string, data: unknown) {
  const c = clients.get(clientId);
  if (!c) return;
  try {
    c.res.write(`event: ${event}\n`);
    c.res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(clientId);
  }
}

function broadcast(filter: (c: Client) => boolean, event: string, data: unknown) {
  for (const c of clients.values()) {
    if (filter(c)) send(c.id, event, data);
  }
}

/** Wire event-bus → SSE broadcasts. Call once at boot. */
export function registerRealtimeBridge(): void {
  eventBus.on('task.created', ({ task }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === task.boardId,
      'task.created',
      { task }
    )
  );
  eventBus.on('task.updated', ({ task }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === task.boardId,
      'task.updated',
      { task }
    )
  );
  eventBus.on('task.moved', ({ task }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === task.boardId,
      'task.moved',
      { task }
    )
  );
  eventBus.on('task.deleted', ({ task }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === task.boardId,
      'task.deleted',
      { taskId: task.id }
    )
  );
  eventBus.on('task_update.created', ({ update, task }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === task.boardId,
      'task_update.created',
      { update, taskId: task.id }
    )
  );
  eventBus.on('task_update.updated', ({ update, task }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === task.boardId,
      'task_update.updated',
      { update, taskId: task.id }
    )
  );
  eventBus.on('task_update.deleted', ({ updateId, task }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === task.boardId,
      'task_update.deleted',
      { updateId, taskId: task.id }
    )
  );
  eventBus.on('group.created', ({ group }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === group.boardId,
      'group.created',
      { group }
    )
  );
  eventBus.on('group.updated', ({ group }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === group.boardId,
      'group.updated',
      { group }
    )
  );
  eventBus.on('group.deleted', ({ group }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === group.boardId,
      'group.deleted',
      { groupId: group.id }
    )
  );
  eventBus.on('board.updated', ({ board }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === board.id,
      'board.updated',
      { board }
    )
  );
  eventBus.on('board.deleted', ({ board }) =>
    broadcast(
      (c) => c.scope.kind === 'board' && c.scope.boardId === board.id,
      'board.deleted',
      { boardId: board.id }
    )
  );

  // User-scoped notifications: any time an event fires that results in a
  // notification, we poke the user channel so the client re-fetches the list.
  // Notifications are written in handlers.ts; here we just nudge the users
  // who would receive them. Simplest: fan-out per event with known recipients.
  eventBus.on('task.created', ({ task, actor }) => {
    if (!task.assigneeId || task.assigneeId === actor.id) return;
    broadcast(
      (c) => c.scope.kind === 'user' && c.scope.userId === task.assigneeId,
      'notification.new',
      { taskId: task.id }
    );
  });
  eventBus.on('task.updated', ({ task, previous, actor }) => {
    if (task.assigneeId && task.assigneeId !== actor.id) {
      if (task.assigneeId !== previous.assigneeId || task.status !== previous.status) {
        broadcast(
          (c) => c.scope.kind === 'user' && c.scope.userId === task.assigneeId,
          'notification.new',
          { taskId: task.id }
        );
      }
    }
  });
  eventBus.on('task_update.created', ({ update, task, actor }) => {
    const recipients = new Set<string>();
    if (task.assigneeId && task.assigneeId !== actor.id) recipients.add(task.assigneeId);
    for (const m of update.mentions ?? []) if (m !== actor.id) recipients.add(m);
    for (const userId of recipients) {
      broadcast(
        (c) => c.scope.kind === 'user' && c.scope.userId === userId,
        'notification.new',
        { taskId: task.id, updateId: update.id }
      );
    }
  });
  eventBus.on('member.added', ({ member, workspaceId, actor }) => {
    if (member.userId === actor.id) return;
    broadcast(
      (c) => c.scope.kind === 'user' && c.scope.userId === member.userId,
      'notification.new',
      { workspaceId }
    );
  });
  // Generic poke from anywhere a notification row is inserted (cron, future
  // services). Producers emit `notification.created` after the insert and
  // realtime fans it out without needing per-producer wiring here.
  eventBus.on('notification.created', ({ userId, entityId, type }) => {
    broadcast(
      (c) => c.scope.kind === 'user' && c.scope.userId === userId,
      'notification.new',
      { entityId, type }
    );
  });
}
