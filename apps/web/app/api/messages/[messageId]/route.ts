import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { channels, events, trigger } from "@infrachat/realtime";

const editSchema = z.object({ content: z.string().trim().min(1).max(2000) });

/** PATCH /api/messages/:messageId — owner-only edit. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { messageId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Content is required." }, { status: 400 });

  const msg = await db.message.findUnique({ where: { id: messageId } });
  if (!msg) return NextResponse.json({ message: "Message not found." }, { status: 404 });
  if (msg.senderId !== userId) return NextResponse.json({ message: "You can only edit your own messages." }, { status: 403 });
  if (msg.deletedForEveryone) return NextResponse.json({ message: "Message was deleted." }, { status: 400 });

  const updated = await db.message.update({
    where: { id: messageId },
    data: { content: parsed.data.content, edited: true, editedAt: new Date() },
    include: { sender: { select: { id: true, username: true } }, attachments: true },
  });
  await trigger(channels.room(msg.roomId), events.MESSAGE_NEW, { message: updated, edited: true });
  return NextResponse.json({ message: updated });
}

/** DELETE /api/messages/:messageId — owner, room mod, or SuperAdmin. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { messageId } = await params;
  const msg = await db.message.findUnique({ where: { id: messageId } });
  if (!msg) return NextResponse.json({ message: "Message not found." }, { status: 404 });

  const membership = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: msg.roomId, userId } },
  });
  const canDelete = msg.senderId === userId || membership?.isModerator || role >= 3;
  if (!canDelete) return NextResponse.json({ message: "Not allowed to delete this message." }, { status: 403 });

  const updated = await db.$transaction(async (tx) => {
    const m = await tx.message.update({
      where: { id: messageId },
      data: { content: "This message was deleted", deletedForEveryone: true, type: "system" },
      include: { sender: { select: { id: true, username: true } }, attachments: true },
    });
    await tx.auditLog.create({
      data: {
        action: "MESSAGE_DELETED",
        performedById: userId,
        roomId: msg.roomId,
        details: `Message ${messageId} deleted`,
        metadata: { messageId },
      },
    });
    return m;
  });

  await trigger(channels.room(msg.roomId), events.MESSAGE_NEW, { message: updated, deleted: true });
  return NextResponse.json({ message: updated });
}
