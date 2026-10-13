import './load-env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createDb } from '@projectmgmt/drizzle';
import { appRouter } from './trpc/router.js';
import { createContext } from './trpc/context.js';
import { registerDomainHandlers } from './services/handlers.js';
import { bootstrapOwner, bootstrapDefaultWorkspace } from './services/bootstrap.js';
import { startNotificationCron } from './services/cron.js';
import {
  registerClient as registerSseClient,
  registerRealtimeBridge,
} from './services/realtime.js';
import { verifyAccessToken } from './auth/jwt.js';
import { readAuthCookie } from './auth/cookie.js';
import { authLimiter, writeLimiter } from './middleware/rate-limit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT ?? 3001);
const isProd = process.env.NODE_ENV === 'production';

// --- middleware ---

// Trust the first proxy (Railway) so req.ip reflects the real client IP for
// rate limits + audit logs instead of the load balancer.
app.set('trust proxy', 1);

// Belt-and-suspenders: helmet's hidePoweredBy already removes this, but if
// helmet is ever removed or reordered, Express's default header would leak
// the framework name. Disabling at the app level is idempotent.
app.disable('x-powered-by');

// Security headers. CSP is tuned for same-origin prod: scripts/styles from
// the bundled SPA, API + SSE on same origin. `unsafe-inline` for styles is
// needed because Tailwind/shadcn inject a few runtime style tags.
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
          },
        }
      : false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS is permissive in dev (separate Vite origin) and same-origin in prod,
// so in prod it's effectively a no-op (still harmless).
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:8080',
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// Rate limit the auth endpoints + all writes. SSE streams (GET) are untouched.
app.use('/api/trpc/auth.login', authLimiter);
app.use('/api/trpc', writeLimiter);

// --- API routes ---
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.0.0',
    env: isProd ? 'production' : 'development',
  });
});

// tRPC
app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError: ({ error, path: procPath }) => {
      // Surface internal errors to stdout; client sees a sanitized code/message.
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        console.error(`[trpc] ${procPath} failed:`, error);
      }
    },
  })
);

// --- SSE realtime ---
// EventSource can't send custom headers, but it CAN send cookies when the
// client opens the connection with `withCredentials: true`. We read the
// HttpOnly auth cookie instead of accepting tokens via ?token=… (which used
// to leak into proxy/access logs).
function sseAuth(req: express.Request): { userId: string } | null {
  const token = readAuthCookie(req.headers.cookie);
  if (!token) return null;
  const payload = verifyAccessToken(token);
  return payload ? { userId: payload.userId } : null;
}

function openSseStream(res: express.Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': connected\n\n');
}

app.get('/api/realtime/board/:boardId', (req, res) => {
  const auth = sseAuth(req);
  if (!auth) {
    res.status(401).end();
    return;
  }
  openSseStream(res);
  const id = `board-${auth.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const unregister = registerSseClient({
    id,
    res,
    scope: { kind: 'board', boardId: req.params.boardId },
  });
  req.on('close', unregister);
});

app.get('/api/realtime/user', (req, res) => {
  const auth = sseAuth(req);
  if (!auth) {
    res.status(401).end();
    return;
  }
  openSseStream(res);
  const id = `user-${auth.userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const unregister = registerSseClient({
    id,
    res,
    scope: { kind: 'user', userId: auth.userId },
  });
  req.on('close', unregister);
});

// Export the root router type for the client's type-safe proxy.
export type { AppRouter } from './trpc/router.js';

// Subscribe domain events → activities/notifications. Only wire when DB is
// available; the handlers write rows and would otherwise no-op into thin air.
if (process.env.DATABASE_URL) {
  const { db } = createDb();
  registerDomainHandlers(db);
  // Idempotent: promotes or creates the Owner each boot, so rotating the
  // password via env works without manual SQL. After the Owner is in
  // place, ensure a default workspace exists (solo mode hides the "Create
  // workspace" UI so the system has to seed one).
  void bootstrapOwner(db)
    .then(() => bootstrapDefaultWorkspace(db))
    .catch((err) => console.error('[bootstrap] provision failed:', err));
  // Hourly notification jobs: 'due-soon' (next 24h) + 'overdue' (past).
  startNotificationCron(db);
}
// SSE fan-out is stateless wrt DB — always on.
registerRealtimeBridge();

// --- Static SPA in production ---
// In prod, the Express process also serves the built React client.
// Client dist lives at <repo>/client/dist; this file compiles to <repo>/server/dist/index.js.
if (isProd) {
  const clientDistPath = path.resolve(__dirname, '../../client/dist');
  const indexHtmlPath = path.join(clientDistPath, 'index.html');

  if (fs.existsSync(indexHtmlPath)) {
    app.use(
      express.static(clientDistPath, {
        maxAge: '1y',
        index: false, // we handle index via SPA fallback
      })
    );

    // SPA fallback: every non-API GET returns index.html so client-side
    // routing (react-router) can take over.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(indexHtmlPath);
    });

    console.log(`[server] serving SPA from ${clientDistPath}`);
  } else {
    console.warn(`[server] client build not found at ${indexHtmlPath} — only /api/* is available`);
  }
}

app.listen(port, () => {
  console.log(`[server] listening on :${port} (${isProd ? 'prod' : 'dev'})`);
});
