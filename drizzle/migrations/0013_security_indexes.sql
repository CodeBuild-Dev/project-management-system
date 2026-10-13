-- Add the indexes flagged in the post-launch security/perf audit. None of
-- these change query shapes — they exist purely to keep common filter and
-- order-by paths off sequential scans as the row count grows.

CREATE INDEX IF NOT EXISTS "workspace_members_workspace_idx"
  ON "workspace_members" ("workspace_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "task_updates_author_idx"
  ON "task_updates" ("author_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_logs_workspace_idx"
  ON "audit_logs" ("workspace_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "audit_logs_performed_idx"
  ON "audit_logs" ("performed_at" DESC);
