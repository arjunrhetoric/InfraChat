import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { channels, events, trigger } from "@infrachat/realtime";

const editSchema = z.object({ content: z.string().trim().min(1).max(2000) });

/** PATCH /api/dm-messages/:messageId — sender-only edit. */
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

  const dm = await db.directMessage.findUnique({ where: { id: messageId } });
  if (!dm) return NextResponse.json({ message: "Message not found." }, { status: 404 });
  if (dm.senderId !== userId) {
    return NextResponse.json({ message: "You can only edit your own messages." }, { status: 403 });
  }
  if (dm.deletedForEveryone) return NextResponse.json({ message: "Message was deleted." }, { status: 400 });

  const updated = await db.directMessage.update({
    where: { id: messageId },
    data: { content: parsed.data.content, edited: true, editedAt: new Date() },
    include: { attachments: true },
  });
  await trigger(channels.dm(dm.senderId, dm.recipientId), events.DM_NEW, { message: updated, edited: true });
  return NextResponse.json({ message: updated });
}

/** DELETE /api/dm-messages/:messageId — sender-only soft delete (parity: no mod override). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { messageId } = await params;
  const dm = await db.directMessage.findUnique({ where: { id: messageId } });
  if (!dm) return NextResponse.json({ message: "Message not found." }, { status: 404 });
  if (dm.senderId !== userId) {
    return NextResponse.json({ message: "You can only delete your own messages." }, { status: 403 });
  }

  const updated = await db.directMessage.update({
    where: { id: messageId },
    data: { content: "This message was deleted", deletedForEveryone: true },
    include: { attachments: true },
  });
  await trigger(channels.dm(dm.senderId, dm.recipientId), events.DM_NEW, { message: updated, deleted: true });
  return NextResponse.json({ message: updated });
}
