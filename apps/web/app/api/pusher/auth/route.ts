import { NextResponse } from "next/server";
import Pusher from "pusher";
import { auth } from "@/auth";
import { db } from "@/lib/db";

function pusherServer() {
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = process.env;
  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET) {
    throw new Error("Pusher not configured.");
  }
  return new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER ?? "ap2",
    useTLS: true,
  });
}

/**
 * POST /api/pusher/auth — authorizes private-* and presence-* channels.
 * Verifies session + room membership so clients can't snoop private rooms.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const username = (session?.user as { username?: string; name?: string } | undefined)?.username
    ?? session?.user?.name ?? "Someone";
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const socketId = form?.get("socket_id") as string | null;
  const channel = form?.get("channel_name") as string | null;
  if (!socketId || !channel) {
    return NextResponse.json({ message: "Invalid pusher auth request." }, { status: 400 });
  }

  // Personal channel: only the owner.
  if (channel === `private-user-${userId}`) {
    return NextResponse.json(pusherServer().authorizeChannel(socketId, channel));
  }

  // Room channel: must be member, non-banned, or SuperAdmin.
  const roomMatch = channel.match(/^private-room-(.+)$/);
  if (roomMatch) {
    const roomId = roomMatch[1];
    const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
    const [membership, ban, room] = await Promise.all([
      db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } }),
      db.roomBan.findUnique({ where: { roomId_userId: { roomId, userId } } }),
      db.room.findUnique({ where: { id: roomId }, select: { id: true, isPrivate: true } }),
    ]);
    if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });
    if (ban && role < 3) return NextResponse.json({ message: "Banned." }, { status: 403 });
    if (!membership && room.isPrivate && role < 3) {
      return NextResponse.json({ message: "Not a member." }, { status: 403 });
    }
    return NextResponse.json(pusherServer().authorizeChannel(socketId, channel));
  }

  // DM channel: must be one of the two participants.
  const dmMatch = channel.match(/^private-dm-(.+)-(.+)$/);
  if (dmMatch) {
    const [, a, b] = dmMatch;
    if (userId !== a && userId !== b) {
      return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    }
    return NextResponse.json(pusherServer().authorizeChannel(socketId, channel));
  }

  // Global presence: any authenticated user.
  if (channel === "presence-infrachat") {
    return NextResponse.json(
      pusherServer().authorizeChannel(socketId, channel, {
        user_id: userId,
        user_info: { username },
      })
    );
  }

  return NextResponse.json({ message: "Unknown channel." }, { status: 403 });
}
