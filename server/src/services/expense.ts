import { TRPCError } from '@trpc/server';
import { desc, eq } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { expenses, type ExpenseRow } from '@projectmgmt/drizzle';
import type {
  CreateExpenseInput,
  Expense,
} from '@projectmgmt/shared';
import { AUDIT_ACTIONS } from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import { eventBus } from './event-bus.js';
import { requirePermission, type PermissionActor } from './permissions.js';

export interface ExpenseActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    boardId: row.boardId,
    amount: row.amount,
    currency: row.currency,
    category: row.category,
    incurredAt: row.incurredAt,
    note: row.note,
    billable: row.billable,
    receiptUrl: row.receiptUrl,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

export async function listExpensesByBoard(
  db: DbClient,
  actor: ExpenseActor,
  boardId: string
): Promise<Expense[]> {
  requirePermission(actor, 'expense', 'read');
  const rows = await db
    .select()
    .from(expenses)
    .where(eq(expenses.boardId, boardId))
    .orderBy(desc(expenses.incurredAt));
  return rows.map(toExpense);
}

export async function createExpense(
  db: DbClient,
  actor: ExpenseActor,
  input: CreateExpenseInput
): Promise<Expense> {
  requirePermission(actor, 'expense', 'create');
  if (input.amount < 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Expense amount must be non-negative.',
    });
  }

  const [inserted] = await db
    .insert(expenses)
    .values({
      boardId: input.boardId,
      amount: input.amount,
      currency: (input.currency ?? 'USD').toUpperCase(),
      category: input.category ?? 'other',
      incurredAt: toDate(input.incurredAt),
      note: input.note ?? null,
      billable: input.billable ?? true,
      receiptUrl: input.receiptUrl ?? null,
      createdBy: actor.id,
    })
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.EXPENSE_CREATE,
    entityType: 'expense',
    entityId: inserted.id,
    newValue: {
      boardId: inserted.boardId,
      amount: inserted.amount,
      currency: inserted.currency,
    },
  });

  const result = toExpense(inserted);
  eventBus.emit('expense.created', {
    expense: result,
    actor: { id: actor.id, email: actor.email },
  });
  return result;
}

export async function deleteExpense(
  db: DbClient,
  actor: ExpenseActor,
  id: string
): Promise<{ ok: true }> {
  requirePermission(actor, 'expense', 'delete');
  const [previous] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, id))
    .limit(1);
  if (!previous) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Expense not found.' });
  }

  await db.delete(expenses).where(eq(expenses.id, id));

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.EXPENSE_DELETE,
    entityType: 'expense',
    entityId: id,
    previousValue: previous as unknown as Record<string, unknown>,
  });

  eventBus.emit('expense.deleted', {
    expense: toExpense(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return { ok: true };
}

/** Sum totals for the board budget summary. */
export async function summarizeBoardExpenses(
  db: DbClient,
  boardId: string
): Promise<{ totalMinor: number; billableMinor: number }> {
  const rows = await db
    .select({ amount: expenses.amount, billable: expenses.billable })
    .from(expenses)
    .where(eq(expenses.boardId, boardId));
  let total = 0;
  let billable = 0;
  for (const r of rows) {
    total += r.amount;
    if (r.billable) billable += r.amount;
  }
  return { totalMinor: total, billableMinor: billable };
}
