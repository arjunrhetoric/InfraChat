import { isRedisConfigured } from "./env";

/**
 * Optional Upstash Redis client.
 * Returns null when env is missing (local dev) — callers fall back to memory.
 * This makes rate-limit + command cooldown work across serverless instances
 * in prod, while keeping `npm run dev` zero-config.
 */

type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean }): Promise<unknown>;
};

let client: RedisLike | null | undefined;

export async function getRedis(): Promise<RedisLike | null> {
  if (client !== undefined) return client;
  if (!isRedisConfigured()) {
    client = null;
    return client;
  }
  try {
    const { Redis } = await import("@upstash/redis");
    client = Redis.fromEnv() as unknown as RedisLike;
    return client;
  } catch {
    client = null;
    return client;
  }
}
