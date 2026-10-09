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
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id: roomId } = await params;
  const room = await db.room.findUnique({
    where: { id: roomId },
    include: { members: { select: { userId: true, isModerator: true } } },
  });
  if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });

  // Parity: creator + sole moderator cannot abandon the room.
  const mods = room.members.filter((m) => m.isModerator);
  if (room.createdById === userId && mods.length === 1 && mods[0]?.userId === userId) {
    return NextResponse.json(
      { message: "Creator cannot leave while sole moderator. Promote someone first." },
      { status: 400 }
    );
  }

  await db.roomMember.deleteMany({ where: { roomId, userId } });
  await trigger(channels.room(roomId), events.ROOM_LIST_UPDATED, { roomId });
  return NextResponse.json({ ok: true });
}
