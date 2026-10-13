-- Phase C: freelance Clients entity.
--   * Lives globally (no workspace_id) — a single client may span multiple
--     workspaces, and the app is solo-use anyway.
--   * `status` enum doubles as the soft-delete flag: 'archived' rows stay
--     joinable for historical board references but are hidden from default
--     listings. We deliberately DON'T add a separate archived_at column —
--     keeping a single source of truth for "is this client visible?".
--   * `boards.client_id` is the optional link. Internal/non-billable boards
--     leave it null. Hard-delete cascades to set the column null rather than
--     dropping boards.

CREATE TYPE "client_status" AS ENUM ('prospect', 'active', 'archived');
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(120) NOT NULL,
  "company" varchar(120),
  "email" varchar(255),
  "phone" varchar(32),
  "contact_person" varchar(120),
  "address" text,
  "notes" text,
  "status" client_status NOT NULL DEFAULT 'active',
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "default_hourly_rate" integer NOT NULL DEFAULT 0,
  "color" varchar(32) NOT NULL DEFAULT 'bg-blue-500',
  "avatar_url" text,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW(),
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT
);
--> statement-breakpoint

-- Default Clients page filters out archived rows, so status is in WHERE.
CREATE INDEX IF NOT EXISTS "clients_status_idx" ON "clients" ("status");
--> statement-breakpoint

-- Clients page lists newest first by default.
CREATE INDEX IF NOT EXISTS "clients_created_at_idx" ON "clients" ("created_at");
--> statement-breakpoint

ALTER TABLE "boards"
  ADD COLUMN "client_id" uuid REFERENCES "clients"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Client detail page lists boards via `WHERE client_id = ?`.
CREATE INDEX IF NOT EXISTS "boards_client_idx" ON "boards" ("client_id");
