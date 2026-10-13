ALTER TABLE "boards" ADD COLUMN "columns_config" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "custom_cells" jsonb DEFAULT '{}'::jsonb NOT NULL;