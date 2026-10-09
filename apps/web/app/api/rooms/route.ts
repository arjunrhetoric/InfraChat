import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { roomCreateSchema } from "@/lib/validators";
import { channels, events, trigger } from "@infrachat/realtime";

/**
 * GET /api/rooms — public rooms + rooms I belong to (parity with legacy).
 */
export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const rooms = await db.room.findMany({
    where: { OR: [{ isPrivate: false }, { members: { some: { userId } } }] },
    include: {
      createdBy: { select: { username: true } },
      _count: { select: { members: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ rooms });
}

/**
 * POST /api/rooms — Moderator+ (parity: requireRole(2)).
 * Only SuperAdmin may create broadcast rooms.
 */
export async function POST(req: Request) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  if (role < 2) {
    return NextResponse.json({ message: "This action requires Moderator privileges." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = roomCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (parsed.data.roomType === "broadcast" && role < 3) {
    return NextResponse.json({ message: "Only SuperAdmin can create broadcast rooms." }, { status: 403 });
  }

  const existing = await db.room.findUnique({ where: { name: parsed.data.name } });
  if (existing) return NextResponse.json({ message: "Room name already taken." }, { status: 409 });

  const room = await db.$transaction(async (tx) => {
    const created = await tx.room.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        createdById: userId,
        isPrivate: parsed.data.roomType === "private",
        roomType: parsed.data.roomType,
      },
    });
    await tx.roomMember.create({
      data: { roomId: created.id, userId, isModerator: true },
    });
    await tx.auditLog.create({
      data: {
        action: "ROOM_CREATED",
        performedById: userId,
        roomId: created.id,
        details: `Room ${created.name} created`,
      },
    });
    return created;
  });

  await trigger(channels.room(room.id), events.ROOM_LIST_UPDATED, { roomId: room.id }).catch(() => {});
  // Global refresh for sidebar lists:
  await trigger("presence-infrachat", events.ROOM_LIST_UPDATED, { roomId: room.id }).catch(() => {});

  return NextResponse.json({ room }, { status: 201 });
}
