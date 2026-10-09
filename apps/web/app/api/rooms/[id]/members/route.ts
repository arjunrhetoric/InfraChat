import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

async function isRoomModOrAdmin(roomId: string, userId: string, role: number): Promise<boolean> {
  if (role >= 3) return true;
  const m = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  return !!m?.isModerator || role >= 2 && !!m;
}

/** GET members — must be member of private rooms. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id: roomId } = await params;
  const room = await db.room.findUnique({ where: { id: roomId }, select: { id: true, isPrivate: true } });
  if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });

  const membership = await db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (room.isPrivate && !membership && role < 3) {
    return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }

  const members = await db.roomMember.findMany({
    where: { roomId },
    include: { user: { select: { id: true, username: true, role: true, avatar: true } } },
  });
  return NextResponse.json({ members });
}

/** POST add member — room moderator+. Body: { userId } */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  const username = (session?.user as { username?: string } | undefined)?.username ?? "Someone";
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id: roomId } = await params;
  if (!(await isRoomModOrAdmin(roomId, userId, role))) {
    return NextResponse.json({ message: "Only moderators can add members." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const targetId = body?.userId as string | undefined;
  if (!targetId) return NextResponse.json({ message: "userId is required." }, { status: 400 });

  const [target, ban, existing] = await Promise.all([
    db.user.findUnique({ where: { id: targetId } }),
    db.roomBan.findUnique({ where: { roomId_userId: { roomId, userId: targetId } } }),
    db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId: targetId } } }),
  ]);
  if (!target) return NextResponse.json({ message: "User not found." }, { status: 404 });
  if (target.isBanned) return NextResponse.json({ message: "User account is banned." }, { status: 403 });
  if (ban) return NextResponse.json({ message: "User is banned from this room." }, { status: 403 });
  if (existing) return NextResponse.json({ message: "Already a member." }, { status: 400 });

  await db.$transaction([
    db.roomMember.create({ data: { roomId, userId: targetId } }),
    db.auditLog.create({
      data: {
        action: "ROOM_MEMBER_ADDED",
        performedById: userId,
        targetUserId: targetId,
        roomId,
        details: `${username} added ${target.username}`,
      },
    }),
  ]);
  return NextResponse.json({ ok: true }, { status: 201 });
}
