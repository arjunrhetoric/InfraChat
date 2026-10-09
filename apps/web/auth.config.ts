import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";

/**
 * Edge-safe auth config — imported by middleware.ts (Edge runtime).
 * Must NEVER import Prisma / bcrypt / server-only modules: Prisma Client
 * cannot execute queries on Edge (no Accelerate / driver adapter here).
 * DB-backed logic lives in auth.ts (Node runtime only).
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" }, // httpOnly cookies — no localStorage token
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Links to an existing credentials account with the same verified email.
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // Never called in middleware; real logic is in auth.ts (Node).
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async authorize(_raw) {
        return null;
      },
    }),
  ],
  callbacks: {
    // Edge-safe: no DB. Just passes the token through.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async jwt({ token }: any) {
      return token;
    },
    // Edge-safe: copies already-embedded token fields onto the session.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async session({ session, token }: any) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
        (session.user as { username?: string }).username =
          (token.username as string) ?? session.user.name ?? "";
        (session.user as { role?: number }).role =
          (token.role as number) ?? 1;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
