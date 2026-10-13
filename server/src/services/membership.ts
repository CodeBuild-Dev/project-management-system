import { and, eq, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  workspaceMembers,
  users,
} from '@projectmgmt/drizzle';
import type { WorkspaceMember } from '@projectmgmt/shared';
import { type PermissionActor } from './permissions.js';
import type { AuditActor } from './audit.js';

export interface MembershipActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toMember(row: typeof workspaceMembers.$inferSelect): WorkspaceMember {
  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    invitedBy: row.invitedBy,
    invitedAt: row.invitedAt,
    acceptedAt: row.acceptedAt,
  };
}

export interface MemberWithUser extends WorkspaceMember {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    initials: string;
    color: string;
    avatarUrl: string | null;
  };
}

export async function listMembers(
  db: DbClient,
  workspaceId: string
): Promise<MemberWithUser[]> {
  const rows = await db
    .select({
      member: workspaceMembers,
      user: {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        initials: users.initials,
        color: users.color,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        // Skip tombstoned users from deleteUser() — their FK row is kept
        // for audit integrity but they shouldn't surface in pickers.
        sql`${users.email} NOT LIKE 'deleted-%@deleted.local'`
      )
    );

  return rows.map((r) => ({ ...toMember(r.member), user: r.user }));
}
