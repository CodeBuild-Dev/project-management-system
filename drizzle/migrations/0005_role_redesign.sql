-- Role system redesign:
--   * user_role enum widens from ('super_admin','user') to
--     ('owner','super_admin','admin','staff').
--   * workspace_role enum is removed entirely; workspace_members and
--     workspace_invites lose their role columns. Membership becomes a
--     pure access list and permissions live on the user record.
--   * users gains permission_overrides JSONB for per-user grants/denies.
--
-- Existing rows are mapped:
--   role='super_admin' -> 'super_admin'   (bootstrap promotes the env-configured email to 'owner' on next start)
--   role='user'        -> 'staff'

-- 1. Drop the index that depends on the column type we're about to recreate.
DROP INDEX IF EXISTS "users_role_idx";--> statement-breakpoint

-- 2. Recreate user_role enum with the four-tier hierarchy.
CREATE TYPE "public"."user_role_v2" AS ENUM ('owner', 'super_admin', 'admin', 'staff');--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "public"."user_role_v2"
    USING (
      CASE "role"::text
        WHEN 'super_admin' THEN 'super_admin'
        WHEN 'user' THEN 'staff'
        ELSE 'staff'
      END::"public"."user_role_v2"
    );--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'staff';--> statement-breakpoint

DROP TYPE "public"."user_role";--> statement-breakpoint
ALTER TYPE "public"."user_role_v2" RENAME TO "user_role";--> statement-breakpoint

-- 3. Recreate the role index against the new column type.
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint

-- 4. Add per-user permission overrides.
ALTER TABLE "users"
  ADD COLUMN "permission_overrides" jsonb NOT NULL
    DEFAULT '{"grants":[],"denies":[]}'::jsonb;--> statement-breakpoint

-- 5. Drop role columns from membership and invite tables (they referenced workspace_role).
ALTER TABLE "workspace_members" DROP COLUMN IF EXISTS "role";--> statement-breakpoint
ALTER TABLE "workspace_invites" DROP COLUMN IF EXISTS "role";--> statement-breakpoint

-- 6. Drop the now-orphan workspace_role enum.
DROP TYPE IF EXISTS "public"."workspace_role";
