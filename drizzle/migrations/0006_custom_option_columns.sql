-- Status & Priority become per-board customisable.
--   * tasks.status / tasks.priority drop their pgEnum constraint and become
--     plain text whose values are option ids stored in boards.columns_config.
--   * Existing values ('done', 'working', 'stuck', 'not-started', 'critical',
--     'high', 'medium', 'low') survive verbatim and become the seed option ids
--     so no row needs rewriting.
--   * The two enum types are dropped — they would otherwise linger as orphans.

-- 1. Relax tasks.status from enum to text and re-establish the default.
ALTER TABLE "tasks" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" TYPE text USING "status"::text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'not-started';--> statement-breakpoint

-- 2. Same dance for tasks.priority.
ALTER TABLE "tasks" ALTER COLUMN "priority" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "priority" TYPE text USING "priority"::text;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "priority" SET DEFAULT 'medium';--> statement-breakpoint

-- 3. Drop the now-orphan enum types.
DROP TYPE IF EXISTS "public"."task_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."task_priority";
