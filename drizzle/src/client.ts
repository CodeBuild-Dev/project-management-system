import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

const { Pool } = pg;

/**
 * Returns a live Drizzle client backed by node-postgres. Call once at startup.
 * Accepts an optional override URL for tests / multi-env setups.
 */
export function createDb(urlOverride?: string) {
  const url = urlOverride ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to create the Drizzle client.');
  }
  const pool = new Pool({
    connectionString: url,
    // Railway Postgres defaults to requiring SSL; node-postgres leaves this
    // permissive so the app works in local dev where SSL is off.
    ssl:
      process.env.DATABASE_SSL === 'false'
        ? false
        : url.includes('railway')
          ? { rejectUnauthorized: false }
          : undefined,
  });
  return {
    db: drizzle(pool, { schema }),
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

export type DbClient = ReturnType<typeof createDb>['db'];
