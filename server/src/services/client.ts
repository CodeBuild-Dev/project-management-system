import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { clients, type ClientRow } from '@projectmgmt/drizzle';
import type {
  Client,
  ClientStatus,
  CreateClientInput,
  UpdateClientInput,
} from '@projectmgmt/shared';
import { AUDIT_ACTIONS } from '@projectmgmt/shared';
import { writeAuditLog, type AuditActor } from './audit.js';
import { eventBus } from './event-bus.js';
import { requirePermission, type PermissionActor } from './permissions.js';

export interface ClientServiceActor extends AuditActor, PermissionActor {
  id: string;
  email: string;
}

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    country: row.country,
    notes: row.notes,
    status: row.status,
    currency: row.currency,
    defaultHourlyRate: row.defaultHourlyRate,
    defaultPricingModel: row.defaultPricingModel,
    source: row.source,
    color: row.color,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

/**
 * List clients. By default the archived ones are filtered out — pass
 * `includeArchived=true` (or filter to specific statuses) to see them.
 */
export async function listClients(
  db: DbClient,
  actor: ClientServiceActor,
  opts: { includeArchived?: boolean; status?: ClientStatus } = {}
): Promise<Client[]> {
  requirePermission(actor, 'client', 'read');

  const where = opts.status
    ? eq(clients.status, opts.status)
    : opts.includeArchived
      ? undefined
      : ne(clients.status, 'archived');

  const rows = await db
    .select()
    .from(clients)
    .where(where)
    .orderBy(asc(clients.name), desc(clients.createdAt));
  return rows.map(toClient);
}

export async function getClient(
  db: DbClient,
  actor: ClientServiceActor,
  id: string
): Promise<Client> {
  requirePermission(actor, 'client', 'read');
  const [row] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found.' });
  return toClient(row);
}

export async function createClient(
  db: DbClient,
  actor: ClientServiceActor,
  input: CreateClientInput
): Promise<Client> {
  requirePermission(actor, 'client', 'create');

  const [inserted] = await db
    .insert(clients)
    .values({
      name: input.name.trim(),
      company: input.company ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      country: input.country ?? null,
      notes: input.notes ?? null,
      status: input.status ?? 'active',
      currency: (input.currency ?? 'USD').toUpperCase(),
      defaultHourlyRate: input.defaultHourlyRate ?? 0,
      defaultPricingModel: input.defaultPricingModel ?? 'hourly',
      source: input.source ?? 'direct',
      color: input.color ?? 'bg-blue-500',
      avatarUrl: input.avatarUrl ?? null,
      createdBy: actor.id,
    })
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.CLIENT_CREATE,
    entityType: 'client',
    entityId: inserted.id,
    newValue: { name: inserted.name, status: inserted.status },
  });

  const result = toClient(inserted);
  eventBus.emit('client.created', {
    client: result,
    actor: { id: actor.id, email: actor.email },
  });
  return result;
}

export async function updateClient(
  db: DbClient,
  actor: ClientServiceActor,
  id: string,
  input: UpdateClientInput
): Promise<Client> {
  requirePermission(actor, 'client', 'update');

  const [previous] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found.' });

  const patch: Partial<ClientRow> = { updatedAt: new Date() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.company !== undefined) patch.company = input.company;
  if (input.email !== undefined) patch.email = input.email;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.country !== undefined) patch.country = input.country;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.status !== undefined) patch.status = input.status;
  if (input.currency !== undefined) patch.currency = input.currency.toUpperCase();
  if (input.defaultHourlyRate !== undefined)
    patch.defaultHourlyRate = input.defaultHourlyRate;
  if (input.defaultPricingModel !== undefined)
    patch.defaultPricingModel = input.defaultPricingModel;
  if (input.source !== undefined) patch.source = input.source;
  if (input.color !== undefined) patch.color = input.color;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;

  const [updated] = await db
    .update(clients)
    .set(patch)
    .where(eq(clients.id, id))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.CLIENT_UPDATE,
    entityType: 'client',
    entityId: id,
    previousValue: previous as unknown as Record<string, unknown>,
    newValue: updated as unknown as Record<string, unknown>,
  });

  const result = toClient(updated);
  eventBus.emit('client.updated', {
    client: result,
    previous: toClient(previous),
    actor: { id: actor.id, email: actor.email },
  });
  return result;
}

/**
 * Soft-delete = flip status to 'archived'. Linked boards keep their
 * client_id (so the historical link survives), but the client falls out of
 * the default Clients listing. Hard-delete (DELETE FROM clients) is reserved
 * for owner cleanup and isn't exposed via the router.
 */
export async function deleteClient(
  db: DbClient,
  actor: ClientServiceActor,
  id: string
): Promise<{ ok: true }> {
  requirePermission(actor, 'client', 'delete');

  const [previous] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, id))
    .limit(1);
  if (!previous) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found.' });

  const now = new Date();
  const [archived] = await db
    .update(clients)
    .set({ status: 'archived', updatedAt: now })
    .where(and(eq(clients.id, id), ne(clients.status, 'archived')))
    .returning();

  await writeAuditLog(db, actor, {
    action: AUDIT_ACTIONS.CLIENT_DELETE,
    entityType: 'client',
    entityId: id,
    previousValue: previous as unknown as Record<string, unknown>,
  });

  if (archived) {
    eventBus.emit('client.deleted', {
      client: toClient(archived),
      actor: { id: actor.id, email: actor.email },
    });
  }
  return { ok: true };
}
