-- Per-board automation recipes ("When X, do Y").
--   * Trigger / conditions / actions are jsonb because the recipe DSL evolves
--     faster than a normalized schema would tolerate. Application-side
--     types gate the shape.
--   * Cascade deletes with the board — orphaned automations make no sense.
--   * lastRunAt + runCount let the UI show "ran N times" / "last ran 5m ago".

CREATE TABLE IF NOT EXISTS "automations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "board_id" uuid NOT NULL REFERENCES "boards"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "trigger" jsonb NOT NULL,
  "conditions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "position" integer NOT NULL DEFAULT 0,
  "last_run_at" timestamptz,
  "run_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- Hot read path: AutomationService loads `WHERE board_id = ? AND enabled`
-- on every domain event for the board. Composite covers both columns.
CREATE INDEX IF NOT EXISTS "automations_board_idx"
  ON "automations" ("board_id", "enabled");
