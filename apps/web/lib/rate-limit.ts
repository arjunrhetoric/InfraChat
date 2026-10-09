import { getRedis } from "./redis";

// In-memory fallback (single instance / local dev).
const hits = new Map<string, { count: number; resetAt: number }>();

function memoryCheck(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (entry.count >= limit) return { ok: false, remaining: 0 };
  entry.count += 1;
  return { ok: true, remaining: limit - entry.count };
}

/**
 * Fixed-window rate limit. Uses Upstash Redis when configured
 * (multi-instance safe), otherwise in-memory.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; remaining: number }> {
  const redis = await getRedis();
  if (!redis) return memoryCheck(key, limit, windowMs);
  try {
    const windowSec = Math.ceil(windowMs / 1000);
    const count = await redis.incr(`ratelimit:${key}`);
    if (count === 1) await redis.expire(`ratelimit:${key}`, windowSec);
    return { ok: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return memoryCheck(key, limit, windowMs);
  }
}

/** Back-compat sync export for non-critical paths (memory only). */
export function rateLimit(key: string, limit: number, windowMs: number) {
  return memoryCheck(key, limit, windowMs);
}
