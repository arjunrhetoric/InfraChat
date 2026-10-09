import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { channels, events, trigger } from "@infrachat/realtime";

/** POST /api/rooms/:id/archive — SuperAdmin toggles read-only. Body: { archived: boolean } */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  if (role < 3) return NextResponse.json({ message: "SuperAdmin only." }, { status: 403 });

  const { id: roomId } = await params;
  const body = await req.json().catch(() => null);
  const archived = body?.archived === true;

  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });

  await db.$transaction([
    db.room.update({ where: { id: roomId }, data: { isArchived: archived } }),
    db.auditLog.create({
      data: {
        action: archived ? "ROOM_ARCHIVED" : "ROOM_UNARCHIVED",
        performedById: userId,
        roomId,
        details: `Room ${room.name} ${archived ? "archived" : "unarchived"}`,
      },
    }),
  ]);

  await trigger(channels.room(roomId), events.ROOM_LIST_UPDATED, { roomId });
  await trigger("presence-infrachat", events.ROOM_LIST_UPDATED, { roomId });
  return NextResponse.json({ ok: true, archived });
}
