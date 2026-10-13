/**
 * Migration runner.
 *
 * Uses drizzle-orm's node-postgres migrator under the hood, which reads
 * `migrations/meta/_journal.json` and applies only the SQL files listed there.
 * This enforces our policy: SQL files without a journal entry are NEVER run.
 *
 * Usage:
 *   npm run db:migrate -w @projectmgmt/drizzle   (reads DATABASE_URL from the root .env)
 *
 * This runs on every deploy via `start` on the server, so forgetting to run
 * migrations manually can never put staging/prod out of sync.
 */

import './load-env.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const { Pool } = pg;

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required to run migrations.');
    process.exit(1);
  }

  // Resolve the migrations folder relative to THIS file (works from dist + src).
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(here, '..', 'migrations');

  const pool = new Pool({
    connectionString: url,
    ssl:
      process.env.DATABASE_SSL === 'false'
        ? false
        : url.includes('railway')
          ? { rejectUnauthorized: false }
          : undefined,
  });

  const db = drizzle(pool);
  try {
    console.log(`[migrate] Running registered migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log('[migrate] Done.');
  } catch (err) {
    console.error('[migrate] Failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
