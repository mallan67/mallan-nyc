/// <reference types="jest" />
/**
 * Sensitive endpoint limits must never be waived based on raw cookie presence.
 * Tests the real rate limiter with an isolated in-memory Redis fallback.
 */
jest.mock("@/lib/redis", () => ({ __esModule: true, default: null }));
import { NextRequest } from "next/server";
import { checkRateLimits } from "@/lib/middleware/rate-limiter";

const request = (path: string, ip: string) =>
  new NextRequest("https://mallan.nyc" + path, {
    method: "POST",
    headers: {
      cookie: "session_token=unverified",
      "x-forwarded-for": ip,
    },
  });

describe("auth-cookie rate limiting", () => {
  it("enforces the login limit even when a session_token cookie is supplied", async () => {
    const path = "/api/auth/login";
    for (let i = 0; i < 10; i++) {
      expect(await checkRateLimits(request(path, "192.0.2.221"), path)).toBeNull();
    }
    const res = await checkRateLimits(request(path, "192.0.2.221"), path);
    expect(res?.status).toBe(429);
  });

  it("enforces the existing IDX sync limit regardless of raw cookies", async () => {
    const path = "/api/idx/sync";
    expect(await checkRateLimits(request(path, "192.0.2.222"), path)).toBeNull();
    const res = await checkRateLimits(request(path, "192.0.2.222"), path);
    expect(res?.status).toBe(429);
  });

  it("does not introduce new limits on ordinary public pages", async () => {
    expect(await checkRateLimits(request("/", "192.0.2.223"), "/")).toBeNull();
  });
});
