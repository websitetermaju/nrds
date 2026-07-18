/**
 * Pilah MVP — Simple in-memory rate limiter
 * Sliding window counter per IP.
 *
 * NOTE: In Vercel serverless, this resets on cold start.
 * Acceptable for MVP; replace with Redis/Upstash for production.
 */
const windows = new Map(); // ip -> { count, resetAt }
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10; // per minute per IP for order creation

function cleanup() {
  const now = Date.now();
  for (const [ip, data] of windows) {
    if (data.resetAt < now) windows.delete(ip);
  }
}

/**
 * Check rate limit for an IP.
 * @returns {{ allowed: boolean, remaining: number, resetInMs: number }}
 */
function checkRateLimit(ip, limit = MAX_REQUESTS, windowMs = WINDOW_MS) {
  cleanup();
  const now = Date.now();
  const entry = windows.get(ip);

  if (!entry || entry.resetAt < now) {
    windows.set(ip, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  const resetInMs = entry.resetAt - now;

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetInMs };
  }

  return { allowed: true, remaining, resetInMs };
}

/**
 * Reset rate limit for testing.
 */
function _resetForTesting() {
  windows.clear();
}

const exported = { checkRateLimit };
if (process.env.NODE_ENV === 'test') exported._resetForTesting = _resetForTesting;
module.exports = exported;
