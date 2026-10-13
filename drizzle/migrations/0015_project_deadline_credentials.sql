-- Project page upgrades:
--   * deadline on the board itself — distinct from per-task due dates;
--     this is the overall delivery date for the project as a whole.
--   * board_credentials: encrypted vault for CRM / tool access creds
--     scoped to each project. AES-256-GCM, key from RESOURCE_VAULT_KEY
--     env var; we store ciphertext + iv + auth tag separately. The
--     plaintext password never lands in Postgres.

ALTER TABLE "boards"
  ADD COLUMN IF NOT EXISTS "deadline" timestamp with time zone;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "board_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "board_id" uuid NOT NULL REFERENCES "boards"("id") ON DELETE CASCADE,
  "label" varchar(120) NOT NULL,
  "username" varchar(255),
  "url" varchar(2000),
  "notes" text,
  "secret_ciphertext" text NOT NULL,
  "secret_iv" varchar(64) NOT NULL,
  "secret_tag" varchar(64) NOT NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "board_credentials_board_idx"
  ON "board_credentials" ("board_id");
