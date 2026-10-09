import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { channels, events, trigger } from "@infrachat/realtime";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id: roomId } = await params;
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });

  const [membership, ban] = await Promise.all([
    db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } }),
    db.roomBan.findUnique({ where: { roomId_userId: { roomId, userId } } }),
  ]);
  if (ban && role < 3) return NextResponse.json({ message: "You are banned from this room." }, { status: 403 });
  if (membership) return NextResponse.json({ message: "Already a member." }, { status: 400 });
  if (room.isPrivate && role < 3) {
    return NextResponse.json({ message: "This room is private. Ask a moderator to add you." }, { status: 403 });
  }

  await db.roomMember.create({ data: { roomId, userId } });
  await trigger(channels.room(roomId), events.ROOM_LIST_UPDATED, { roomId });
  return NextResponse.json({ ok: true });
}
