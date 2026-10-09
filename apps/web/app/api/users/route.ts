import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/** GET /api/users — all non-banned users (parity). */
export async function GET() {
  const session = await auth();
  if (!(session?.user as { id?: string } | undefined)?.id) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }
  const users = await db.user.findMany({
    where: { isBanned: false },
    select: { id: true, username: true, email: true, role: true, avatar: true, createdAt: true },
    orderBy: { username: "asc" },
  });
  return NextResponse.json({ users });
}
