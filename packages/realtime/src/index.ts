import Pusher from "pusher";

/**
 * Single source of truth for channel + event names.
 * Replaces the old Socket.io event strings scattered across
 * server/socket/handlers.js and frontend Workspace.jsx.
 *
 * Channel strategy (Pusher Channels):
 * - `presence-infrachat` : global presence (replaces presence.js in-memory map)
 * - `private-room-{roomId}` : room messages, kicks, bans, mutes, announcements
 * - `private-user-{userId}` : personal events (kicked, banned, muted, role_changed)
 * - `private-dm-{a}-{b}` (sorted ids) : DM thread
 */

export const channels = {
  globalPresence: () => "presence-infrachat",
  room: (roomId: string) => `private-room-${roomId}`,
  user: (userId: string) => `private-user-${userId}`,
  dm: (a: string, b: string) =>
    `private-dm-${[a, b].sort().join("-")}`,
} as const;

export const events = {
  MESSAGE_NEW: "message:new",
  DM_NEW: "dm:new",
  ROOM_JOINED: "room:joined",
  ROOM_LEFT: "room:left",
  ROOM_KICKED: "room:kicked", // FIX: also emitted on ban so banned users are evicted (old /ban bug)
  ROOM_BANNED: "room:banned",
  ROOM_MUTED: "room:muted",
  ROOM_UNMUTED: "room:unmuted",
  ROOM_ANNOUNCEMENT: "room:announcement",
  ROOM_LIST_UPDATED: "room:list-updated",
  ROOM_MEMBER_REMOVED: "room:member-removed",
  USER_ROLE_CHANGED: "user:role-changed",
  TYPING_UPDATE: "typing:update",
  ONLINE_USERS: "room:online-users",
} as const;

export type RealtimeEvent = (typeof events)[keyof typeof events];

let serverClient: Pusher | null = null;

export function getPusherServer() {
  if (serverClient) return serverClient;
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } =
    process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) {
    throw new Error(
      "Missing Pusher server env: PUSHER_APP_ID / PUSHER_KEY / PUSHER_SECRET"
    );
  }
  serverClient = new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER ?? "ap2",
    useTLS: true,
  });
  return serverClient;
}

export async function trigger(
  channel: string,
  event: RealtimeEvent | string,
  data: unknown
) {
  await getPusherServer().trigger(channel, event, data);
}
