-- Plug the index gaps surfaced by the security/perf audit (Task 3).
-- Every index here covers a query pattern that's actively run against the
-- DB; nothing speculative, nothing on low-cardinality booleans alone.
--
-- All `CREATE INDEX IF NOT EXISTS` so the migration is idempotent and
-- safe to re-run on environments that may already have any of these
-- (manual ops, pg_dump restores, etc.).

-- 1. Password reset redemption looks up by tokenHash on every reset
--    attempt. Without an index this was a sequential scan over every
--    historical reset token — slow as the table grows, and a soft DoS
--    vector since unauthenticated callers can trigger it.
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_token_idx"
  ON "password_reset_tokens" ("token_hash");
--> statement-breakpoint

-- 2. The notifications cron runs hourly and uses NOT EXISTS to dedupe
--    by (userId, entityId, type). The existing
--    notifications_user_unread_idx is on (userId, isRead, createdAt) and
--    can't satisfy the dedup join. Composite (entityId, type, userId)
--    matches the lookup shape exactly.
CREATE INDEX IF NOT EXISTS "notifications_dedup_idx"
  ON "notifications" ("entity_id", "type", "user_id");
--> statement-breakpoint

-- 3. Activity feed for a single board: WHERE board_id = ? ORDER BY
--    performed_at DESC. There's already a (workspaceId, performedAt) and
--    (taskId, performedAt) — neither helps a board-level query.
CREATE INDEX IF NOT EXISTS "activities_board_idx"
  ON "activities" ("board_id", "performed_at" DESC);
--> statement-breakpoint

-- 4. Admin user list paginates by `createdAt < cursor ORDER BY
--    createdAt DESC`. No supporting index → sort + filter scan.
CREATE INDEX IF NOT EXISTS "users_created_at_idx"
  ON "users" ("created_at" DESC);
