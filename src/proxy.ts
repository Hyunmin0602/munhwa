import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, LOGIN_IP_LIMIT, rateLimitResponse } from "@/lib/rate-limit";

export const proxy = auth(async (req) => {
  if (req.nextUrl.pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    const result = await checkRateLimit(req, "login-ip", getClientIp(req), LOGIN_IP_LIMIT);
    if (!result.allowed) return rateLimitResponse(result);
  }

  if (!req.nextUrl.pathname.startsWith("/dashboard")) return NextResponse.next();

  if (!req.auth?.user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/api/auth/callback/credentials"],
};
