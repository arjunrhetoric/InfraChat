import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

// Edge-safe: authConfig never touches Prisma (see auth.config.ts).
// Using "@/auth" here would pull Prisma Client into the Edge runtime
// and crash every request with JWTSessionError.
const { auth } = NextAuth(authConfig);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler: any = auth((req: any) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;

  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/register");
  const isApiAuth =
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/pusher/auth");

  if (isApiAuth) return NextResponse.next();

  if (!isLoggedIn && !isAuthPage && !pathname.startsWith("/api/") && pathname !== "/") {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.nextUrl));
  }
  return NextResponse.next();
});

export default handler;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads).*)"],
};
