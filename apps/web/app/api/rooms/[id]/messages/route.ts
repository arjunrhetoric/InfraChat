import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { messageSendSchema, paginationSchema } from "@/lib/validators";
import { checkRateLimit } from "@/lib/rate-limit";
import { processCommand } from "@/lib/commands";
import { channels, events, trigger } from "@infrachat/realtime";

async function loadRoomContext(roomId: string, userId: string) {
  const room = await db.room.findUnique({
    where: { id: roomId },
    include: {
      members: { where: { userId }, select: { userId: true } },
      bans: { where: { userId }, select: { userId: true } },
    },
  });
  return room;
}

function isMuted(user: { isMuted: boolean; mutedUntil: Date | null }) {
  if (!user.isMuted) return false;
  if (user.mutedUntil && user.mutedUntil < new Date()) return false;
  return true;
}

/**
 * GET /api/rooms/:id/messages?page&limit — member or SuperAdmin.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id: roomId } = await params;
  const url = new URL(req.url);
  const pag = paginationSchema.safeParse({
    page: url.searchParams.get("page"),
    limit: url.searchParams.get("limit"),
  });
  if (!pag.success) return NextResponse.json({ message: "Invalid pagination." }, { status: 400 });
  const { page, limit } = pag.data;

  const room = await loadRoomContext(roomId, userId);
  if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });
  if (room.bans.length > 0 && role < 3) {
    return NextResponse.json({ message: "You are banned from this room." }, { status: 403 });
  }
  if (room.members.length === 0 && role < 3) {
    return NextResponse.json({ message: "You are not a member of this room." }, { status: 403 });
  }

  const total = await db.message.count({ where: { roomId } });
  const messages = await db.message.findMany({
    where: { roomId },
    include: {
      sender: { select: { id: true, username: true, role: true, avatar: true } },
      attachments: true,
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  return NextResponse.json({
    room: { id: roomId, name: room.name, isPrivate: room.isPrivate, roomType: room.roomType },
    messages: messages.reverse(),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });
}

/**
 * POST /api/rooms/:id/messages — send text/attachments, or run /command.
 * Fixes: attachment-only allowed, broadcast/archived/mute guards, ban eviction via Pusher.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  const username = (session?.user as { username?: string } | undefined)?.username ?? "Someone";
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const rl = await checkRateLimit(`msg:${userId}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ message: "Slow down — too many messages." }, { status: 429 });

  const { id: roomId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = messageSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid message." },
      { status: 400 }
    );
  }

  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });

  const [me, membership, ban] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } }),
    db.roomBan.findUnique({ where: { roomId_userId: { roomId, userId } } }),
  ]);
  if (!me) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  // Persist mute expiry (FIX: legacy never saved).
  if (me.isMuted && me.mutedUntil && me.mutedUntil < new Date()) {
    await db.user.update({ where: { id: userId }, data: { isMuted: false, mutedUntil: null } });
    me.isMuted = false;
    me.mutedUntil = null;
  }
  if (ban && role < 3) return NextResponse.json({ message: "You are banned from this room." }, { status: 403 });
  if (!membership && role < 3) {
    return NextResponse.json({ message: "You are not a member of this room." }, { status: 403 });
  }
  if (room.isArchived) return NextResponse.json({ message: "This room is archived (read-only)." }, { status: 403 });
  if (room.roomType === "broadcast" && role < 2) {
    return NextResponse.json({ message: "Only moderators can send in broadcast rooms." }, { status: 403 });
  }
  if (isMuted(me)) {
    return NextResponse.json(
      { message: `You are muted${me.mutedUntil ? ` until ${me.mutedUntil.toISOString()}` : ""}.` },
      { status: 403 }
    );
  }

  const { content, attachments } = parsed.data;

  // Slash-command intercept (parity with legacy socket pipeline).
  if (content.startsWith("/") && attachments.length === 0) {
    const result = await processCommand(content, {
      userId,
      username,
      role,
      roomId,
      roomName: room.name,
    });
    const saved = await db.message.create({
      data: { content: `${content}\n→ ${result.message}`.slice(0, 2000), senderId: userId, roomId, type: "command" },
      include: { sender: { select: { id: true, username: true, role: true } }, attachments: true },
    });
    if (result.kind === "broadcast") {
      await trigger(channels.room(roomId), events.MESSAGE_NEW, { message: saved });
    }
    return NextResponse.json({ message: saved, command: result });
  }

  const saved = await db.message.create({
    data: {
      content,
      senderId: userId,
      roomId,
      type: "text",
      attachments: {
        create: attachments.map((a) => ({ url: a.url, name: a.name, size: a.size, mime: a.mime })),
      },
    },
    include: { sender: { select: { id: true, username: true, role: true } }, attachments: true },
  });

  await trigger(channels.room(roomId), events.MESSAGE_NEW, { message: saved });
  return NextResponse.json({ message: saved }, { status: 201 });
}
