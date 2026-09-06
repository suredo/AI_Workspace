import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "@/proxy";

const mockAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
}));

function makeRequest(pathname: string, headers?: Record<string, string>) {
  const url = `http://localhost:3000${pathname}`;
  return new NextRequest(url, { headers });
}

describe("proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(null);
  });

  describe("route protection", () => {
    it("redirects unauthenticated /dashboard to /login", async () => {
      const request = makeRequest("/dashboard");
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain("callbackUrl=%2Fdashboard");
    });

    it("redirects unauthenticated /dashboard/nested to /login", async () => {
      const request = makeRequest("/dashboard/settings");
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain("callbackUrl=%2Fdashboard%2Fsettings");
    });

    it("redirects unauthenticated /workspaces to /login", async () => {
      const request = makeRequest("/workspaces");
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain("callbackUrl=%2Fworkspaces");
    });

    it("redirects unauthenticated /workspaces/:id to /login", async () => {
      const request = makeRequest("/workspaces/ws-123");
      const response = await proxy(request);

      expect(response.status).toBe(307);
      const location = response.headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain("callbackUrl=%2Fworkspaces%2Fws-123");
    });

    it("allows authenticated /dashboard through", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test" },
      });

      const request = makeRequest("/dashboard");
      const response = await proxy(request);

      expect(response.status).toBe(200);
    });

    it("allows authenticated /workspaces through", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123", name: "Test" },
      });

      const request = makeRequest("/workspaces");
      const response = await proxy(request);

      expect(response.status).toBe(200);
    });
  });

  describe("public routes", () => {
    it("allows / through without auth", async () => {
      const request = makeRequest("/");
      const response = await proxy(request);

      expect(response.status).toBe(200);
    });

    it("allows /login through without auth", async () => {
      const request = makeRequest("/login");
      const response = await proxy(request);

      expect(response.status).toBe(200);
    });

    it("allows /register through without auth", async () => {
      const request = makeRequest("/register");
      const response = await proxy(request);

      expect(response.status).toBe(200);
    });

    it("allows /api/auth/* through without auth", async () => {
      const request = makeRequest("/api/auth/session");
      const response = await proxy(request);

      expect(response.status).toBe(200);
    });
  });

  describe("config", () => {
    it("matches protected routes and auth routes", () => {
      expect(config.matcher).toContain("/api/auth/:path*");
      expect(config.matcher).toContain("/dashboard/:path*");
      expect(config.matcher).toContain("/workspaces/:path*");
    });
  });
});
