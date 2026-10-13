import rateLimit from 'express-rate-limit';

/**
 * Per-IP rate limits. Auth endpoints get a tighter ceiling so brute-force
 * against login/register/password-reset is mitigated.
 *
 * In production you'd swap the in-memory store for Redis once horizontally
 * scaled — in-memory means each replica counts separately.
 */

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 min
  limit: 30, // 30 auth attempts per IP per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

export const writeLimiter = rateLimit({
  windowMs: 60_000, // 1 min
  limit: 240, // 240 writes/min/IP — generous for normal use
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' || req.method === 'OPTIONS',
  message: { error: 'You are submitting changes too fast. Slow down.' },
});
