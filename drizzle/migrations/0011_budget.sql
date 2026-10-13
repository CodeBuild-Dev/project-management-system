-- Phase D: time tracking + expenses + per-board budget settings.
--   * time_entries.ended_at is nullable — NULL means "currently running",
--     and only one such row per user is allowed (enforced in service code).
--     Duration is always computed from started_at/ended_at, never stored.
--   * Snapshot the hourly rate + currency at log time so historical revenue
--     reports don't shift when the user later raises a client's rate.
--   * expenses store amounts in minor units (cents) in their own currency —
--     no auto-conversion. Reports show currency totals separately.
--   * Boards gain billing_type / fixed_price / hourly_rate_override /
--     budget_minutes / budget_amount / project_status / currency_override
--     so each board can be a billable project unit. Defaults match a fresh
--     non-billable board so existing rows behave identically.

CREATE TYPE "billing_type" AS ENUM ('non_billable', 'hourly', 'fixed');
--> statement-breakpoint
CREATE TYPE "project_status" AS ENUM ('proposal', 'active', 'invoiced', 'paid');
--> statement-breakpoint

ALTER TABLE "boards"
  ADD COLUMN "billing_type" billing_type NOT NULL DEFAULT 'non_billable',
  ADD COLUMN "fixed_price" integer NOT NULL DEFAULT 0,
  ADD COLUMN "hourly_rate_override" integer,
  ADD COLUMN "budget_minutes" integer,
  ADD COLUMN "budget_amount" integer,
  ADD COLUMN "project_status" project_status NOT NULL DEFAULT 'active',
  ADD COLUMN "currency_override" varchar(3);
--> statement-breakpoint

ALTER TABLE "tasks"
  ADD COLUMN "estimated_minutes" integer;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "time_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "started_at" timestamptz NOT NULL,
  "ended_at" timestamptz,
  "note" text,
  "billable" boolean NOT NULL DEFAULT true,
  "hourly_rate_snapshot" integer NOT NULL DEFAULT 0,
  "currency_snapshot" varchar(3) NOT NULL DEFAULT 'USD',
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- Active-timer lookup: WHERE user_id = ? AND ended_at IS NULL.
-- Composite covers both columns; partial would be nicer (WHERE ended_at IS NULL)
-- but Drizzle doesn't model partial indexes cleanly yet.
CREATE INDEX IF NOT EXISTS "time_entries_user_active_idx"
  ON "time_entries" ("user_id", "ended_at");
--> statement-breakpoint

-- Task time tab: list entries by task, newest first.
CREATE INDEX IF NOT EXISTS "time_entries_task_idx"
  ON "time_entries" ("task_id", "started_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "board_id" uuid NOT NULL REFERENCES "boards"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "category" varchar(64) NOT NULL DEFAULT 'other',
  "incurred_at" timestamptz NOT NULL,
  "note" text,
  "billable" boolean NOT NULL DEFAULT true,
  "receipt_url" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- Board budget tab: list expenses by board, most recent first.
CREATE INDEX IF NOT EXISTS "expenses_board_idx"
  ON "expenses" ("board_id", "incurred_at");
