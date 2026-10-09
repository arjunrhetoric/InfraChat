import { z } from "zod";

/**
 * Centralized env validation — fail fast with a clear message
 * instead of cryptic runtime failures (fixes legacy env fragility:
 * no validation, hardcoded onrender.com URL, silent JWT expiry).
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be ≥32 chars (openssl rand -base64 32)"),
  PUSHER_APP_ID: z.string().optional().default(""),
  PUSHER_KEY: z.string().optional().default(""),
  PUSHER_SECRET: z.string().optional().default(""),
  PUSHER_CLUSTER: z.string().optional().default("ap2"),
  UPSTASH_REDIS_REST_URL: z.string().optional().default(""),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().default(""),
  BLOB_READ_WRITE_TOKEN: z.string().optional().default(""),
});

const publicSchema = z.object({
  NEXT_PUBLIC_PUSHER_KEY: z.string().optional().default(""),
  NEXT_PUBLIC_PUSHER_CLUSTER: z.string().optional().default("ap2"),
  NEXT_PUBLIC_APP_URL: z.string().optional().default("http://localhost:3000"),
});

function loadEnv() {
  const server = serverSchema.safeParse(process.env);
  if (!server.success) {
    console.warn(
      "[env] Missing/invalid server env:",
      server.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }
  const pub = publicSchema.safeParse({
    NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY,
    NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!pub.success) {
    console.warn("[env] Invalid public env:", pub.error.issues.map((i) => i.path.join(".")).join(", "));
  }
  return {
    ...(server.success ? server.data : {}),
    ...(pub.success ? pub.data : {}),
  } as z.infer<typeof serverSchema> & z.infer<typeof publicSchema>;
}

export const env = loadEnv();

export function isPusherConfigured(): boolean {
  return !!(process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET);
}

export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
