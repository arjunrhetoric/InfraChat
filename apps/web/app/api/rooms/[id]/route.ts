import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { channels, events, trigger } from "@infrachat/realtime";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  description: z.string().trim().max(200).optional(),
  isPrivate: z.boolean().optional(),
});

/** GET /api/rooms/:id — single room (member of private, or SuperAdmin). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id: roomId } = await params;
  const room = await db.room.findUnique({
    where: { id: roomId },
    include: {
      createdBy: { select: { username: true } },
      announcementBy: { select: { username: true } },
      _count: { select: { members: true } },
    },
  });
  if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });

  if (room.isPrivate && role < 3) {
    const m = await db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (!m) return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  }
  return NextResponse.json({ room });
}

/** PATCH /api/rooms/:id — room moderator+ (rename/desc/privacy). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id: roomId } = await params;
  const membership = await db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!(membership?.isModerator || role >= 3 || (role >= 2 && membership))) {
    return NextResponse.json({ message: "Only moderators can edit rooms." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Invalid input." }, { status: 400 });

  if (parsed.data.name) {
    const clash = await db.room.findFirst({
      where: { name: parsed.data.name, NOT: { id: roomId } },
      select: { id: true },
    });
    if (clash) return NextResponse.json({ message: "Room name already taken." }, { status: 409 });
  }

  const updated = await db.room.update({
    where: { id: roomId },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.isPrivate !== undefined
        ? { isPrivate: parsed.data.isPrivate, roomType: parsed.data.isPrivate ? "private" : "public" }
        : {}),
    },
  });

  await trigger(channels.room(roomId), events.ROOM_LIST_UPDATED, { roomId });
  await trigger("presence-infrachat", events.ROOM_LIST_UPDATED, { roomId });
  return NextResponse.json({ room: updated });
}

/** DELETE /api/rooms/:id — SuperAdmin only. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  if (role < 3) return NextResponse.json({ message: "SuperAdmin only." }, { status: 403 });

  const { id: roomId } = await params;
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) return NextResponse.json({ message: "Room not found." }, { status: 404 });

  await db.$transaction([
    db.auditLog.create({
      data: { action: "ROOM_DELETED", performedById: userId, roomId, details: `Room ${room.name} deleted` },
    }),
    db.room.delete({ where: { id: roomId } }),
  ]);

  await trigger("presence-infrachat", events.ROOM_LIST_UPDATED, { roomId });
  return NextResponse.json({ ok: true });
}
