-- Persist attachments inline on task_updates.
--   * Stored as a jsonb array of objects: { id, name, mimeType, size, url }.
--   * `url` is currently a base64 data URL (S3-backed URLs land with file
--     storage). This lets the comment composer round-trip files end-to-end
--     without a separate uploads table.

ALTER TABLE "task_updates"
  ADD COLUMN "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb;
