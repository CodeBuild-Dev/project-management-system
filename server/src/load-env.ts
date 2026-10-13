/**
 * Loads the repo-root `.env` for local development. Must be the first import
 * in the entry file. Existing environment variables (e.g. Railway's) always win.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
