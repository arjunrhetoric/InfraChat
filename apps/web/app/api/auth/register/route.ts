import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validators";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
    const rl = await checkRateLimit(`register:${ip}`, 10, 60_000);
    if (!rl.ok) {
      return NextResponse.json({ message: "Too many attempts. Try again later." }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }
    const { username, email, password } = parsed.data;

    const existing = await db.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { message: "Email or username already in use." },
        { status: 409 }
      );
    }

    const count = await db.user.count();
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.user.create({
      data: {
        username,
        email,
        passwordHash,
        // First registered user becomes SuperAdmin (parity with legacy).
        role: count === 0 ? 3 : 1,
      },
      select: { id: true, username: true, email: true, role: true, avatar: true, createdAt: true },
    });

    return NextResponse.json(
      { message: "Registered. Please sign in.", user },
      { status: 201 }
    );
  } catch (e) {
    console.error("POST /api/auth/register failed:", e);
    return NextResponse.json(
      { message: "Registration failed. Check server logs / DATABASE_URL." },
      { status: 500 }
    );
  }
}
