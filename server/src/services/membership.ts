import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import {
  workspaceMembers,
  workspaces,
  users,
  type NewUserRow,
} from '@projectmgmt/drizzle';
import type { WorkspaceMember } from '@projectmgmt/shared';
import { AUDIT_ACTIONS } from '@projectmgmt/shared';
import { writeAuditLog } from './audit.js';
import { eventBus } from './event-bus.js';
import { requirePermission, type PermissionActor } from './permissions.js';
import type { AuditActor } from './audit.js';
import { memberInviteMail, sendMail } from './mailer.js';

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

/**
 * Add an existing user (or create a shell user) to a workspace. Membership
 * carries no role — what they can do inside the workspace is determined by
 * their app-level role + permission overrides on their User record.
 */
export async function inviteMember(
  db: DbClient,
  actor: MembershipActor,
  input: { workspaceId: string; email: string }
): Promise<WorkspaceMember> {
  requirePermission(actor, 'member', 'invite');

  const normalizedEmail = input.email.trim().toLowerCase();
  const [workspace] = await db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  if (!workspace) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Workspace not found.' });
  }

  // Find or create the user.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  let userId = existing?.id;
  if (!userId) {
    const initials = normalizedEmail.slice(0, 2).toUpperCase();
    const shell: NewUserRow = {
      email: normalizedEmail,
      passwordHash: 'invited', // marker; real password set on first login via reset link
      firstName: normalizedEmail.split('@')[0],
      lastName: '',
      initials,
      color: 'hsl(210 100% 56%)',
      role: 'staff',
      isActive: false, // flipped to true when they complete password reset
    };
    const [created] = await db.insert(users).values(shell).returning({ id: users.id });
    userId = created.id;
  }

  // Prevent duplicate membership rows.
  const [already] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, input.workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);
  if (already) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'User is already a member of this workspace.',
    });
  }

  const [inserted] = await db
    .insert(workspaceMembers)
    .values({
      workspaceId: input.workspaceId,
      userId,
      invitedBy: actor.id,
    })
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.MEMBER_INVITE,
    entityType: 'member',
    entityId: `${input.workspaceId}:${userId}`,
    workspaceId: input.workspaceId,
    newValue: { email: normalizedEmail },
  });

  const member = toMember(inserted);
  eventBus.emit('member.added', {
    member,
    workspaceId: input.workspaceId,
    actor: { id: actor.id, email: actor.email },
  });

  // Fire-and-forget invite email — never blocks the invite on SMTP hiccups.
  void sendMail(memberInviteMail(normalizedEmail, workspace.name, actor.email));

  return member;
}

export async function removeMember(
  db: DbClient,
  actor: MembershipActor,
  input: { workspaceId: string; userId: string }
): Promise<{ ok: true }> {
  requirePermission(actor, 'member', 'remove');

  const [previous] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, input.workspaceId),
        eq(workspaceMembers.userId, input.userId)
      )
    )
    .limit(1);
  if (!previous) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found.' });
  }

  // The workspace creator (workspace.ownerId) can be removed; that's a
  // bookkeeping decision for the caller, not a permission boundary —
  // membership is now just an access list.

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, input.workspaceId),
        eq(workspaceMembers.userId, input.userId)
      )
    );

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.MEMBER_REMOVE,
    entityType: 'member',
    entityId: `${input.workspaceId}:${input.userId}`,
    workspaceId: input.workspaceId,
    previousValue: { userId: previous.userId },
  });

  eventBus.emit('member.removed', {
    userId: input.userId,
    workspaceId: input.workspaceId,
    actor: { id: actor.id, email: actor.email },
  });
  return { ok: true };
}
