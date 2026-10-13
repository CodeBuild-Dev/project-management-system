import { eq } from 'drizzle-orm';
import type { DbClient } from '@projectmgmt/drizzle';
import { systemSettings } from '@projectmgmt/drizzle';

/**
 * Tiny key/value bag backed by the `system_settings` table for org-wide
 * preferences (currently just the brand palette). Values are stored as
 * plain text — JSON-encode on the caller side if you need structure.
 */

/** Known keys. Extending the union here forces every reader/writer to use it. */
export type SystemSettingKey = 'brand_palette';

export async function getSystemSetting(
  db: DbClient,
  key: SystemSettingKey
): Promise<string | null> {
  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return row?.value ?? null;
}

export async function setSystemSetting(
  db: DbClient,
  key: SystemSettingKey,
  value: string,
  updatedBy: string
): Promise<void> {
  // ON CONFLICT upsert keyed by the unique index on `key`. If the row
  // exists we update value + updatedBy + updatedAt; otherwise insert.
  await db
    .insert(systemSettings)
    .values({ key, value, updatedBy })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: {
        value,
        updatedBy,
        updatedAt: new Date(),
      },
    });
}
