import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { channels, events, trigger } from "@infrachat/realtime";

const schema = z.object({ isTyping: z.boolean().default(true) });

/**
 * POST /api/rooms/:id/typing — authenticated typing signal.
 * Relays to Pusher so clients render typing indicators without client events.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const username =
    (session?.user as { username?: string } | undefined)?.username ?? "Someone";
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { id: roomId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Invalid input." }, { status: 400 });

  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  const membership = await db.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
  if (!membership && role < 3) {
    return NextResponse.json({ message: "Not a member." }, { status: 403 });
  }

  await trigger(channels.room(roomId), events.TYPING_UPDATE, {
    userId,
    username,
    isTyping: parsed.data.isTyping,
  });
  return NextResponse.json({ ok: true });
}
