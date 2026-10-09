"use client";

import Pusher from "pusher-js";

let client: Pusher | null = null;

export function getPusherClient(): Pusher {
  if (client) return client;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap2";
  if (!key) throw new Error("Missing NEXT_PUBLIC_PUSHER_KEY");
  client = new Pusher(key, {
    cluster,
    authEndpoint: "/api/pusher/auth",
  });
  return client;
}
