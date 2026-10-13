/**
 * Re-exports ONLY the AppRouter TYPE so the client can import it without
 * pulling in the Express server's runtime side-effects (like `app.listen`).
 *
 * Client usage:
 *   import type { AppRouter } from '@projectmgmt/server';
 */

export type { AppRouter } from './trpc/router.js';
