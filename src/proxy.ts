import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, LOGIN_IP_LIMIT } from "@/lib/rate-limit";

export const proxy = auth(async (req) => {
  if (req.nextUrl.pathname === "/api/auth/callback/credentials" && req.method === "POST") {
    const result = await checkRateLimit(req, "login-ip", getClientIp(req), LOGIN_IP_LIMIT);
    if (!result.allowed) {
      const loginUrl = new URL("/login", req.nextUrl.origin);
      loginUrl.searchParams.set("error", result.unavailable ? "rate_limit_unavailable" : "rate_limited");
      return NextResponse.json(
        { url: loginUrl.toString() },
        {
          status: result.unavailable ? 503 : 429,
          headers: { "Cache-Control": "no-store", "Retry-After": String(result.retryAfterSeconds) },
        },
      );
    }
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
