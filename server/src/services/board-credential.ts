import { TRPCError } from '@trpc/server';
import { and, asc, eq } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { boardCredentials, type BoardCredentialRow } from '@projectmgmt/drizzle';
import type {
  BoardCredential,
  BoardCredentialReveal,
  CreateBoardCredentialInput,
  UpdateBoardCredentialInput,
} from '@projectmgmt/shared';
import { sealSecret, openSecret } from '../auth/secret-vault.js';
import { writeAuditLog, type AuditActor } from './audit.js';
import { requirePermission, type PermissionActor } from './permissions.js';

export interface CredentialActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

/** Strip sealed-secret columns; never let them leak out of the service. */
function toPublic(row: BoardCredentialRow): BoardCredential {
  return {
    id: row.id,
    boardId: row.boardId,
    label: row.label,
    username: row.username,
    url: row.url,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

export async function listBoardCredentials(
  db: DbClient,
  actor: CredentialActor,
  boardId: string
): Promise<BoardCredential[]> {
  requirePermission(actor, 'board', 'read');
  const rows = await db
    .select()
    .from(boardCredentials)
    .where(eq(boardCredentials.boardId, boardId))
    .orderBy(asc(boardCredentials.createdAt));
  return rows.map(toPublic);
}

export async function revealBoardCredential(
  db: DbClient,
  actor: CredentialActor,
  id: string
): Promise<BoardCredentialReveal> {
  requirePermission(actor, 'board', 'read');
  const [row] = await db
    .select()
    .from(boardCredentials)
    .where(eq(boardCredentials.id, id))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found.' });

  // Audit every reveal — credential access is a sensitive action.
  await writeAuditLog(db, actor, {
    action: 'credential.reveal',
    entityType: 'board_credential',
    entityId: id,
  });

  const password = openSecret({
    ciphertext: row.secretCiphertext,
    iv: row.secretIv,
    tag: row.secretTag,
  });
  return { ...toPublic(row), password };
}

export async function createBoardCredential(
  db: DbClient,
  actor: CredentialActor,
  input: CreateBoardCredentialInput
): Promise<BoardCredential> {
  requirePermission(actor, 'board', 'update');
  const sealed = sealSecret(input.password);
  const [inserted] = await db
    .insert(boardCredentials)
    .values({
      boardId: input.boardId,
      label: input.label.trim(),
      username: input.username ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretTag: sealed.tag,
      createdBy: actor.id,
    })
    .returning();
  await writeAuditLog(db, actor, {
    action: 'credential.create',
    entityType: 'board_credential',
    entityId: inserted.id,
    newValue: { boardId: inserted.boardId, label: inserted.label },
  });
  return toPublic(inserted);
}

export async function updateBoardCredential(
  db: DbClient,
  actor: CredentialActor,
  id: string,
  input: UpdateBoardCredentialInput
): Promise<BoardCredential> {
  requirePermission(actor, 'board', 'update');
  const patch: Partial<BoardCredentialRow> = { updatedAt: new Date() };
  if (input.label !== undefined) patch.label = input.label.trim();
  if (input.username !== undefined) patch.username = input.username;
  if (input.url !== undefined) patch.url = input.url;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.password !== undefined) {
    const sealed = sealSecret(input.password);
    patch.secretCiphertext = sealed.ciphertext;
    patch.secretIv = sealed.iv;
    patch.secretTag = sealed.tag;
  }
  const [updated] = await db
    .update(boardCredentials)
    .set(patch)
    .where(eq(boardCredentials.id, id))
    .returning();
  if (!updated)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found.' });
  await writeAuditLog(db, actor, {
    action: 'credential.update',
    entityType: 'board_credential',
    entityId: id,
  });
  return toPublic(updated);
}

export async function deleteBoardCredential(
  db: DbClient,
  actor: CredentialActor,
  id: string
): Promise<{ ok: true }> {
  requirePermission(actor, 'board', 'update');
  const [removed] = await db
    .delete(boardCredentials)
    .where(eq(boardCredentials.id, id))
    .returning({ id: boardCredentials.id, boardId: boardCredentials.boardId });
  if (!removed)
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found.' });
  await writeAuditLog(db, actor, {
    action: 'credential.delete',
    entityType: 'board_credential',
    entityId: id,
  });
  return { ok: true };
}
