import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// OAuth users arrive with only name/email — but our User model requires a
// unique username. Generate one deterministically-ish at creation time.
async function uniqueUsername(preferred: string): Promise<string> {
  let base =
    preferred.toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 20) || "user";
  if (base.length < 3) base = `${base}user`.slice(0, 20);
  let candidate = base;
  for (let i = 0; i < 5; i++) {
    const exists = await db.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
    candidate = `${base.slice(0, 24)}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 30);
  }
  return `${base.slice(0, 18)}${Date.now().toString(36)}`.slice(0, 30);
}

const baseAdapter = PrismaAdapter(db);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter: any = {
  ...baseAdapter,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createUser(data: any) {
    const preferred =
      data.name ?? data.email?.split("@")[0] ?? "user";
    const username = await uniqueUsername(String(preferred));
    return (baseAdapter as any).createUser({ ...data, username });
  },
};

// Full Node-runtime config: auth.config (edge-safe base) + Prisma adapter,
// real Credentials authorize, and a DB-backed jwt callback that refreshes
// username/role/isBanned on every session touch (Node only — never Edge).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const { handlers, auth, signIn, signOut }: any = NextAuth({
  ...authConfig,
  adapter,
  providers: [
    // OAuth providers from the edge-safe base (drop the stub Credentials —
    // the real one is defined below; duplicate "credentials" ids break).
    ...(authConfig.providers ?? []).filter((p) => p.id !== "credentials"),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase().trim();
        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        if (user.isBanned) throw new Error("Your account has been banned.");
        // Auto-expire mutes on login (persisted — FIX: old REST auth never saved)
        if (user.isMuted && user.mutedUntil && user.mutedUntil < new Date()) {
          await db.user.update({
            where: { id: user.id },
            data: { isMuted: false, mutedUntil: null },
            select: { id: true },
          });
          user.isMuted = false;
          user.mutedUntil = null;
        }
        const ok = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash
        );
        if (!ok) return null;
        return {
          id: user.id,
          name: user.username,
          email: user.email,
          image: user.avatar,
          // Embedded so the first JWT already carries identity even
          // before the DB refresh below runs.
          username: user.username,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // OAuth sign-ins: deny banned accounts (credentials path checks in authorize).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async signIn({ user, account }: any) {
      if (account?.provider === "credentials" || !user?.email) return true;
      const existing = await db.user.findUnique({
        where: { email: String(user.email).toLowerCase() },
        select: { isBanned: true },
      });
      return !existing?.isBanned;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token, user }: any) {
      if (user) {
        token.username = (user as { username?: string }).username ?? token.username;
        token.role = (user as { role?: number }).role ?? token.role;
      }
      if (token.sub) {
        const fresh = await db.user.findUnique({
          where: { id: token.sub },
          select: { id: true, username: true, role: true, isBanned: true },
        });
        if (fresh) {
          token.username = fresh.username;
          token.role = fresh.role;
          token.isBanned = fresh.isBanned;
        }
      }
      return token;
    },
  },
});
