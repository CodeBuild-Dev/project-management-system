import type { DbClient } from '@projectmgmt/drizzle';
import { auditLogs } from '@projectmgmt/drizzle';
import type { AuditAction } from '@projectmgmt/shared';

export interface AuditActor {
  id: string;
  role: string;
  ipAddress: string;
  userAgent: string;
}

export interface AuditWrite {
  action: AuditAction | string;
  entityType: string;
  entityId: string;
  workspaceId?: string | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}

/**
 * Insert one audit row. Every write service calls this after a successful mutation.
 * Never throws — audit failures are logged and swallowed so they can't mask a
 * successful business write, but they are still surfaced to stdout for monitoring.
 */
export async function writeAuditLog(
  db: DbClient,
  actor: AuditActor,
  entry: AuditWrite
): Promise<void> {
  return writeAuditLogs(db, actor, [entry]);
}

/**
 * Batch variant. Writes all entries in a single multi-row INSERT instead of
 * one round-trip per entry — used by bulk operations (bulkUpdate of N tasks
 * was N separate INSERTs against audit_logs). Same swallow-on-error
 * semantics as the singular version.
 */
export async function writeAuditLogs(
  db: DbClient,
  actor: AuditActor,
  entries: AuditWrite[]
): Promise<void> {
  if (entries.length === 0) return;
  try {
    await db.insert(auditLogs).values(
      entries.map((entry) => ({
        userId: actor.id,
        userRole: actor.role,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        workspaceId: entry.workspaceId ?? null,
        previousValue: entry.previousValue ?? null,
        newValue: entry.newValue ?? null,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      }))
    );
  } catch (err) {
    console.error('[audit] failed to write audit rows', {
      count: entries.length,
      err,
    });
  }
}
