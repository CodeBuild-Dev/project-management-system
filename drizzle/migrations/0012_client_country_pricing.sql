-- Phase F (solo-mode UI): replace the free-form client address with a
-- single country field, and add the client's default pricing model so we
-- can seed new work sessions with hourly vs. fixed billing.

ALTER TABLE "clients" DROP COLUMN IF EXISTS "address";
--> statement-breakpoint

ALTER TABLE "clients"
  ADD COLUMN "country" varchar(64);
--> statement-breakpoint

ALTER TABLE "clients"
  ADD COLUMN "default_pricing_model" varchar(16) NOT NULL DEFAULT 'hourly';
