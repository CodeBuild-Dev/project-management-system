import type { Config } from 'drizzle-kit';

/**
 * drizzle-kit config.
 *
 * Migration policy: every generated SQL file MUST be registered
 * in `migrations/meta/_journal.json`. Files without a journal entry are ignored
 * by src/migrate.ts. Do not edit generated files by hand — rerun `db:generate`.
 */
export default {
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/projectmgmt',
  },
  strict: true,
  verbose: true,
} satisfies Config;
