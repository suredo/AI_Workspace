import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const AUTH_RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxRequests: 3,
};

const REGISTER_RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxRequests: 3,
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // NOTE: x-forwarded-for / x-real-ip are client-controlled headers.
  // In production behind a trusted proxy (Vercel, Cloudflare), these are
  // set reliably. On self-hosted deployments, rate limiting based on these
  // headers can be bypassed by spoofing. Consider using a trusted proxy
  // header or accept this limitation for MVP.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "anonymous";

  // Rate limit login attempts (POST to credentials callback only)
  if (pathname === "/api/auth/callback/credentials") {
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
  if (pathname === "/api/auth/register") {
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
