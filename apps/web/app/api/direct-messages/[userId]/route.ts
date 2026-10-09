import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { messageSendSchema, paginationSchema } from "@/lib/validators";
import { channels, trigger, events } from "@infrachat/realtime";

/** GET /api/direct-messages/:userId — thread between me and them. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  const meId = (session?.user as { id?: string } | undefined)?.id;
  if (!meId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { userId: otherId } = await params;
  const url = new URL(req.url);
  const pag = paginationSchema.safeParse({
    page: url.searchParams.get("page"),
    limit: url.searchParams.get("limit"),
  });
  if (!pag.success) return NextResponse.json({ message: "Invalid pagination." }, { status: 400 });

  const other = await db.user.findUnique({ where: { id: otherId } });
  if (!other) return NextResponse.json({ message: "User not found." }, { status: 404 });

  const where = {
    OR: [
      { senderId: meId, recipientId: otherId },
      { senderId: otherId, recipientId: meId },
    ],
  };
  const [total, dms] = await Promise.all([
    db.directMessage.count({ where }),
    db.directMessage.findMany({
      where,
      include: {
        sender: { select: { id: true, username: true } },
        recipient: { select: { id: true, username: true } },
        attachments: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (pag.data.page - 1) * pag.data.limit,
      take: pag.data.limit,
    }),
  ]);

  return NextResponse.json({ messages: dms.reverse(), pagination: { ...pag.data, total } });
}

/** POST /api/direct-messages/:userId — send DM. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  const meId = (session?.user as { id?: string } | undefined)?.id;
  if (!meId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });

  const { userId: otherId } = await params;
  if (meId === otherId) {
    return NextResponse.json({ message: "You cannot DM yourself." }, { status: 400 });
  }
  const other = await db.user.findUnique({ where: { id: otherId } });
  if (!other) return NextResponse.json({ message: "User not found." }, { status: 404 });
  if (other.isBanned) return NextResponse.json({ message: "User is banned." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = messageSendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Message content is required (or attach a file)." }, { status: 400 });
  }

  const dm = await db.directMessage.create({
    data: {
      content: parsed.data.content,
      senderId: meId,
      recipientId: otherId,
      attachments: {
        create: parsed.data.attachments.map((a) => ({ url: a.url, name: a.name, size: a.size, mime: a.mime })),
      },
    },
    include: { sender: { select: { id: true, username: true } }, attachments: true },
  });

  await trigger(channels.dm(meId, otherId), events.DM_NEW, { message: dm });
  return NextResponse.json({ message: dm }, { status: 201 });
}
