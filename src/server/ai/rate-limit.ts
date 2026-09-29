/**
 * Fixed-window in-memory rate limiter (per route + IP).
 * Single-user app — this is a guardrail against runaway loops/abuse,
 * not a security boundary. Bolstered easily later with Redis.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) buckets.clear(); // simple leak guard
    return { allowed: true, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { allowed: true, retryAfterSec: 0 };
}

export function clientKey(req: Request, route: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  return `${route}:${fwd ? fwd.split(",")[0].trim() : "local"}`;
}
