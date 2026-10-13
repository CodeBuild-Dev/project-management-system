-- Solo-mode client form refinements:
--   * Drop contact_person — the freelance flow rarely needs a separate
--     contact name; `name` already holds whoever you actually deal with.
--   * Add `source` so we can track where each lead came from (Fiverr,
--     Upwork, LinkedIn, direct, referral, other). Plain varchar with an
--     app-side allowlist — easier to extend than a Postgres enum.

ALTER TABLE "clients" DROP COLUMN IF EXISTS "contact_person";
--> statement-breakpoint

ALTER TABLE "clients"
  ADD COLUMN "source" varchar(32) NOT NULL DEFAULT 'direct';
