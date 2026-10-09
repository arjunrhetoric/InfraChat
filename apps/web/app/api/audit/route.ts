import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().optional(),
  roomId: z.string().optional(),
});

/** GET /api/audit — Moderator+. Append-only read. */
export async function GET(req: Request) {
  const session = await auth();
  const role = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }
  if (role < 2) return NextResponse.json({ message: "Moderator+ only." }, { status: 403 });

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    page: url.searchParams.get("page"),
    limit: url.searchParams.get("limit"),
    action: url.searchParams.get("action") ?? undefined,
    roomId: url.searchParams.get("roomId") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ message: "Invalid query." }, { status: 400 });
  const { page, limit, action, roomId } = parsed.data;

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (roomId) where.roomId = roomId;

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      include: {
        performedBy: { select: { id: true, username: true, role: true } },
        targetUser: { select: { id: true, username: true } },
        room: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
