import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { channels, events, trigger } from "@infrachat/realtime";

const schema = z.object({ role: z.union([z.literal(1), z.literal(2), z.literal(3)]) });

/** PATCH /api/users/:id/role — SuperAdmin only. Blocks self-demotion. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  const actorRole = (session?.user as { role?: number } | undefined)?.role ?? 0;
  if (!actorId) return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  if (actorRole < 3) return NextResponse.json({ message: "SuperAdmin only." }, { status: 403 });

  const { id: targetId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ message: "Role must be 1, 2, or 3." }, { status: 400 });
  if (actorId === targetId && parsed.data.role !== 3) {
    return NextResponse.json({ message: "You cannot demote yourself." }, { status: 400 });
  }

  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) return NextResponse.json({ message: "User not found." }, { status: 404 });

  const oldRole = target.role;
  await db.$transaction([
    db.user.update({ where: { id: targetId }, data: { role: parsed.data.role } }),
    db.auditLog.create({
      data: {
        action: parsed.data.role > oldRole ? "USER_PROMOTED" : "USER_DEMOTED",
        performedById: actorId,
        targetUserId: targetId,
        details: `Role ${oldRole} → ${parsed.data.role}`,
      },
    }),
  ]);

  await trigger(channels.user(targetId), events.USER_ROLE_CHANGED, {
    userId: targetId,
    newRole: parsed.data.role,
  });

  return NextResponse.json({ ok: true });
}
