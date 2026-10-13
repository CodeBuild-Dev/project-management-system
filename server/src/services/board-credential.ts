import type { DbClient } from '@projectmgmt/drizzle';
import { boardCredentials, type BoardCredentialRow } from '@projectmgmt/drizzle';
import type {
  BoardCredential,
  CreateBoardCredentialInput,
} from '@projectmgmt/shared';
import { sealSecret } from '../auth/secret-vault.js';
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
