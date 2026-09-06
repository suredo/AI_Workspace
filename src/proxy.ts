import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const AUTH_RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxRequests: 3,
};

const REGISTER_RATE_LIMIT = {
  windowMs: 60 * 1000,
  maxRequests: 3,
};

const PROTECTED_ROUTES = ["/dashboard", "/workspaces"];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limit login attempts (POST to credentials callback only)
  if (pathname === "/api/auth/callback/credentials") {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous";
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
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous";
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

  // Check session for protected routes
  if (isProtectedRoute(pathname)) {
    const session = await auth();

    if (!session?.user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/auth/:path*", "/dashboard/:path*"],
};
