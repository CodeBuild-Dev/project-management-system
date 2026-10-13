import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { boards, clients, workspaceMembers, type BoardRow } from '@projectmgmt/drizzle';
import type {
  Board,
  BoardBudgetSummary,
  CreateBoardInput,
  UpdateBoardInput,
  UpdateBudgetInput,
} from '@projectmgmt/shared';
import { AUDIT_ACTIONS } from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import { eventBus } from './event-bus.js';
import {
  hasPermission,
  requirePermission,
  type PermissionActor,
} from './permissions.js';
import { summarizeBoardTime } from './time-entry.js';
import { summarizeBoardExpenses } from './expense.js';

export interface BoardServiceActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toBoard(row: BoardRow): Board {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    clientId: row.clientId,
    name: row.name,
    description: row.description,
    favorite: row.favorite,
    position: row.position,
    visibility: row.visibility,
    columnsConfig: (row.columnsConfig as Board['columnsConfig']) ?? [],
    billingType: row.billingType,
    fixedPrice: row.fixedPrice,
    hourlyRateOverride: row.hourlyRateOverride,
    budgetMinutes: row.budgetMinutes,
    budgetAmount: row.budgetAmount,
    projectStatus: row.projectStatus,
    currencyOverride: row.currencyOverride,
    deadline: row.deadline,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

async function assertBoardAccess(
  db: DbClient,
  actor: BoardServiceActor,
  boardId: string
): Promise<BoardRow> {
  const [board] = await db
    .select()
    .from(boards)
    .where(eq(boards.id, boardId))
    .limit(1);
  if (!board) throw new TRPCError({ code: 'NOT_FOUND', message: 'Board not found.' });

  if (actor.userRole !== 'owner' && actor.userRole !== 'super_admin') {
    const [member] = await db
      .select({ id: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, board.workspaceId),
          eq(workspaceMembers.userId, actor.id)
        )
      )
      .limit(1);
    if (!member) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You cannot access this board.',
      });
    }
  }
  return board;
}

export async function listBoards(
  db: DbClient,
  actor: BoardServiceActor,
  workspaceId: string
): Promise<Board[]> {
  // Caller has already been scoped via resolveWorkspace — trust that pass.
  void actor;
  const rows = await db
    .select()
    .from(boards)
    .where(and(eq(boards.workspaceId, workspaceId), isNull(boards.archivedAt)))
    .orderBy(asc(boards.position), asc(boards.createdAt));
  return rows.map(toBoard);
}

export async function getBoard(
  db: DbClient,
  actor: BoardServiceActor,
  id: string
): Promise<Board> {
  const row = await assertBoardAccess(db, actor, id);
  return toBoard(row);
}

export async function createBoard(
  db: DbClient,
  actor: BoardServiceActor,
  input: CreateBoardInput
): Promise<Board> {
  requirePermission(actor, 'board', 'create');

  const [{ maxPos } = { maxPos: null }] = await db
    .select({ maxPos: max(boards.position) })
    .from(boards)
    .where(eq(boards.workspaceId, input.workspaceId));
  const nextPosition = (maxPos ?? -1) + 1;

  const [inserted] = await db
    .insert(boards)
    .values({
      workspaceId: input.workspaceId,
      clientId: input.clientId ?? null,
      name: input.name.trim(),
      description: input.description ?? '',
      visibility: input.visibility ?? 'public',
      position: nextPosition,
      createdBy: actor.id,
      ...(input.columnsConfig !== undefined
        ? { columnsConfig: input.columnsConfig }
        : {}),
      ...(input.deadline !== undefined
        ? { deadline: input.deadline ? new Date(input.deadline) : null }
        : {}),
      ...(input.billingType !== undefined ? { billingType: input.billingType } : {}),
      ...(input.projectStatus !== undefined
        ? { projectStatus: input.projectStatus }
        : {}),
      ...(input.fixedPrice !== undefined ? { fixedPrice: input.fixedPrice } : {}),
      ...(input.hourlyRateOverride !== undefined
        ? { hourlyRateOverride: input.hourlyRateOverride }
        : {}),
      ...(input.budgetAmount !== undefined
        ? { budgetAmount: input.budgetAmount }
        : {}),
      ...(input.budgetMinutes !== undefined
        ? { budgetMinutes: input.budgetMinutes }
        : {}),
      ...(input.currencyOverride !== undefined
        ? { currencyOverride: input.currencyOverride }
        : {}),
    })
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.BOARD_CREATE,
    entityType: 'board',
    entityId: inserted.id,
    workspaceId: inserted.workspaceId,
    newValue: { name: inserted.name },
  });

  const board = toBoard(inserted);
  eventBus.emit('board.created', {
    board,
    actor: { id: actor.id, email: actor.email },
  });
  return board;
}

export async function updateBoard(
  db: DbClient,
  actor: BoardServiceActor,
  id: string,
  input: UpdateBoardInput
): Promise<Board> {
  const previous = await assertBoardAccess(db, actor, id);
  requirePermission(actor, 'board', 'update');

  const patch: Partial<BoardRow> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.favorite !== undefined) patch.favorite = input.favorite;
  if (input.position !== undefined) patch.position = input.position;
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.columnsConfig !== undefined) patch.columnsConfig = input.columnsConfig;
  if (input.clientId !== undefined) patch.clientId = input.clientId;
  if (input.deadline !== undefined)
    patch.deadline = input.deadline ? new Date(input.deadline) : null;

  const [updated] = await db
    .update(boards)
    .set(patch)
    .where(eq(boards.id, id))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.BOARD_UPDATE,
    entityType: 'board',
    entityId: id,
    workspaceId: updated.workspaceId,
    previousValue: previous as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
  });

  const board = toBoard(updated);
  eventBus.emit('board.updated', {
    board,
    previous: toBoard(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return board;
}

export async function deleteBoard(
  db: DbClient,
  actor: BoardServiceActor,
  id: string
): Promise<{ ok: true }> {
  const previous = await assertBoardAccess(db, actor, id);
  requirePermission(actor, 'board', 'delete');

  const now = new Date();
  const [archived] = await db
    .update(boards)
    .set({ archivedAt: now, updatedAt: now })
    .where(eq(boards.id, id))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.BOARD_DELETE,
    entityType: 'board',
    entityId: id,
    workspaceId: previous.workspaceId,
    previousValue: previous as unknown as Record<string, unknown>,
  });

  eventBus.emit('board.deleted', {
    board: toBoard(archived),
    actor: { id: actor.id, email: actor.email },
  });
  return { ok: true };
}

/**
 * Targeted budget update — narrower than `updateBoard`, audited as a
 * separate `budget.update` action so a financial-only timeline is filterable.
 */
export async function updateBudget(
  db: DbClient,
  actor: BoardServiceActor,
  boardId: string,
  input: UpdateBudgetInput
): Promise<Board> {
  const previous = await assertBoardAccess(db, actor, boardId);
  requirePermission(actor, 'budget', 'update');

  const patch: Partial<BoardRow> = { updatedAt: new Date() };
  if (input.billingType !== undefined) patch.billingType = input.billingType;
  if (input.fixedPrice !== undefined) patch.fixedPrice = input.fixedPrice;
  if (input.hourlyRateOverride !== undefined)
    patch.hourlyRateOverride = input.hourlyRateOverride;
  if (input.budgetMinutes !== undefined) patch.budgetMinutes = input.budgetMinutes;
  if (input.budgetAmount !== undefined) patch.budgetAmount = input.budgetAmount;
  if (input.projectStatus !== undefined) patch.projectStatus = input.projectStatus;
  if (input.currencyOverride !== undefined)
    patch.currencyOverride = input.currencyOverride
      ? input.currencyOverride.toUpperCase()
      : null;

  const [updated] = await db
    .update(boards)
    .set(patch)
    .where(eq(boards.id, boardId))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.BUDGET_UPDATE,
    entityType: 'board',
    entityId: boardId,
    workspaceId: updated.workspaceId,
    previousValue: previous as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
  });

  const board = toBoard(updated);
  eventBus.emit('board.updated', {
    board,
    previous: toBoard(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return board;
}

/**
 * Compute the budget summary on read — never persisted (SSOT). Resolves the
 * effective rate/currency by walking board override → client default → 'USD'.
 */
export async function getBoardBudgetSummary(
  db: DbClient,
  actor: BoardServiceActor,
  boardId: string
): Promise<BoardBudgetSummary> {
  const board = await assertBoardAccess(db, actor, boardId);
  requirePermission(actor, 'budget', 'read');

  let clientRate = 0;
  let clientCurrency = 'USD';
  if (board.clientId) {
    const [client] = await db
      .select({ rate: clients.defaultHourlyRate, currency: clients.currency })
      .from(clients)
      .where(eq(clients.id, board.clientId))
      .limit(1);
    if (client) {
      clientRate = client.rate;
      clientCurrency = client.currency;
    }
  }

  const effectiveCurrency =
    board.currencyOverride ?? clientCurrency ?? 'USD';
  const effectiveHourlyRate = board.hourlyRateOverride ?? clientRate ?? 0;

  const time = await summarizeBoardTime(db, boardId);
  const expense = await summarizeBoardExpenses(db, boardId);

  return {
    boardId,
    billingType: board.billingType,
    projectStatus: board.projectStatus,
    effectiveCurrency,
    effectiveHourlyRate,
    fixedPrice: board.fixedPrice,
    budgetMinutes: board.budgetMinutes,
    budgetAmount: board.budgetAmount,
    loggedMinutes: time.loggedMinutes,
    billableMinutes: time.billableMinutes,
    earnedAmount: time.earnedAmountMinor,
    expensesAmount: expense.totalMinor,
    expensesBillableAmount: expense.billableMinor,
  };
}

export async function reorderBoards(
  db: DbClient,
  actor: BoardServiceActor,
  workspaceId: string,
  orderedIds: string[]
): Promise<{ ok: true }> {
  requirePermission(actor, 'board', 'update');
  if (orderedIds.length === 0) {
    void hasPermission;
    return { ok: true };
  }
  // Single UPDATE with a CASE expression replaces N round-trips inside a
  // transaction with one statement. The workspace_id filter scopes the
  // update so a payload can't reorder boards across workspaces.
  const cases = orderedIds.map(
    (id, i) => sql`WHEN ${boards.id} = ${id} THEN ${i}`
  );
  await db
    .update(boards)
    .set({
      position: sql`CASE ${sql.join(cases, sql` `)} ELSE ${boards.position} END`,
      updatedAt: new Date(),
    })
    .where(and(inArray(boards.id, orderedIds), eq(boards.workspaceId, workspaceId)));
  void hasPermission;
  return { ok: true };
}
