import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { channels, events, trigger } from "@infrachat/realtime";

/** DELETE /api/rooms/:id/members/:userId — kick (room mod+). FIX: evicts via Pusher. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const session = await auth();
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  const username = (session?.user as { username?: string } | undefined)?.username ?? "Someone";
  if (!actorId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id: roomId, userId: targetId } = await params;
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });
  if (room.createdById === targetId) {
    return NextResponse.json({ message: "Cannot remove the room creator." }, { status: 400 });
  }

  const [actorMember, target] = await Promise.all([
    db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId: actorId } } }),
    db.user.findUnique({ where: { id: targetId } }),
  ]);
  const canRemove = role >= 3 || actorMember?.isModerator || role >= 2;
  if (!canRemove) return NextResponse.json({ message: "Only moderators can remove members." }, { status: 403 });
  if (!target) return NextResponse.json({ message: "User not found." }, { status: 404 });
  if (target.role >= role) {
    return NextResponse.json({ message: "Cannot remove a user with equal or higher privileges." }, { status: 403 });
  }

  await db.$transaction([
    db.roomMember.deleteMany({ where: { roomId, userId: targetId } }),
    db.auditLog.create({
      data: {
        action: "USER_KICKED",
        performedById: actorId,
        targetUserId: targetId,
        roomId,
        details: `${username} removed ${target.username} from ${room.name}`,
        metadata: { via: "rest" },
      },
    }),
  ]);

  await Promise.all([
    trigger(channels.user(targetId), events.ROOM_KICKED, { roomId, roomName: room.name }),
    trigger(channels.room(roomId), events.ROOM_MEMBER_REMOVED, { roomId, userId: targetId, username: target.username }),
    trigger(channels.room(roomId), events.ROOM_LIST_UPDATED, { roomId }),
  ]);

  return NextResponse.json({ ok: true });
}
