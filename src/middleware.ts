import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const AUTH_RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxRequests: 5,
};

const REGISTER_RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxRequests: 3,
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "anonymous";

  // Rate limit login attempts
  const isLoginAttempt =
    pathname.startsWith("/api/auth/signin") || pathname === "/api/auth/callback/credentials";

  if (isLoginAttempt) {
    const key = `auth:${ip}`;
    const { allowed, retryAfterMs } = checkRateLimit(key, AUTH_RATE_LIMIT);

    if (!allowed) {
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(AUTH_RATE_LIMIT.maxRequests),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    return NextResponse.next();
  }

  // Rate limit registration attempts
  const isRegisterAttempt = pathname === "/api/auth/register";

  if (isRegisterAttempt) {
    const key = `register:${ip}`;
    const { allowed, retryAfterMs } = checkRateLimit(key, REGISTER_RATE_LIMIT);

    if (!allowed) {
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(REGISTER_RATE_LIMIT.maxRequests),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*"],
};
