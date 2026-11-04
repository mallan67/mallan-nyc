/// <reference types="jest" />
/**
 * CRM document authorization exercises the real proxy, request guards and
 * canonical session validation (mocked DB boundary; no copied auth logic).
 */
import { NextRequest } from "next/server";

const mockValidateSession = jest.fn();
jest.mock("@/lib/auth/session", () => ({
  validateSession: (token: string) => mockValidateSession(token),
}));
jest.mock("@/lib/middleware/bot-blocker", () => ({ checkBot: () => null }));
jest.mock("@/lib/middleware/rate-limiter", () => ({ checkRateLimits: async () => null }));
jest.mock("@/lib/middleware/csrf", () => ({ checkCsrf: () => null }));
jest.mock("@/lib/middleware/security-headers", () => ({ applySecurityHeaders: () => undefined }));

import proxy from "@/proxy";
import { checkRouteGuards } from "@/lib/middleware/route-guards";

const ORIGIN = "https://mallan.nyc";
const request = (path: string, cookie?: string) => new NextRequest(ORIGIN + path, {
  headers: cookie ? { cookie } : {},
});

const broker = { userId: 7n, userType: "agent", role: "BROKER", sessionId: "s1" };
const agent = { userId: 8n, userType: "agent", role: "AGENT", sessionId: "s2" };
const buyer = { userId: 9n, userType: "lead", role: "buyer", sessionId: "s3" };
beforeEach(() => mockValidateSession.mockReset());

describe("CRM document shell — canonical-session gate", () => {
  it.each(["/crm", "/crm/dashboard", "/crm/dashboard.html", "/crm/search", "/crm/sale-view", "/crm/rental-view"])(
    "admits broker navigation at %s with a valid session",
    async (path) => {
      mockValidateSession.mockResolvedValue(broker);
      const res = await proxy(request(path, "session_token=valid"));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(mockValidateSession).toHaveBeenCalledWith("valid");
    },
  );

  it("admits active agent principal types", async () => {
    mockValidateSession.mockResolvedValue(agent);
    expect((await proxy(request("/crm/sale-listing", "session_token=agent"))).status).toBe(200);
  });

  it("rejects forged session cookie before any protected HTML is served", async () => {
    mockValidateSession.mockResolvedValue(null);
    const res = await proxy(request("/crm/dashboard.html", "session_token=forged"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location") as string).pathname).toBe("/crm/login.html");
    expect(res.headers.get("set-cookie") || "").toMatch(/session_token=;/);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("redirects missing cookies without a database lookup", async () => {
    const res = await proxy(request("/crm/dashboard.html"));
    expect(res.status).toBe(307);
    expect(mockValidateSession).not.toHaveBeenCalled();
  });

  it("refuses a valid buyer session without invalidating the portal cookie", async () => {
    mockValidateSession.mockResolvedValue(buyer);
    const res = await proxy(request("/crm/dashboard.html", "session_token=real-buyer"));
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a client principal even if a role field appears privileged", async () => {
    mockValidateSession.mockResolvedValue({ ...buyer, role: "BROKER" });
    expect((await proxy(request("/crm/dashboard.html", "session_token=lead"))).status).toBe(403);
  });

  it("refuses an agent principal without an authorized CRM role", async () => {
    mockValidateSession.mockResolvedValue({ ...agent, role: "OTHER" });
    expect((await proxy(request("/crm/dashboard.html", "session_token=other"))).status).toBe(403);
  });

  it("fails closed on database outage, preserving the user's session cookie", async () => {
    mockValidateSession.mockRejectedValue(new Error("database unavailable"));
    const res = await proxy(request("/crm/dashboard.html", "session_token=possibly-real"));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does not query the database on login, assets, or public pages", async () => {
    for (const path of ["/crm/login.html", "/crm/js/app.js", "/crm/css/style.css", "/crm/images/logo.png", "/"]) {
      const res = await proxy(request(path, "session_token=forged"));
      expect(res.status).toBe(200);
    }
    expect(mockValidateSession).not.toHaveBeenCalled();
  });

  it("keeps the old synchronous route-guard contract for other auth tests", () => {
    const result = checkRouteGuards(request("/crm/dashboard.html"), "/crm/dashboard.html");
    expect(result).not.toBeNull();
    expect(result?.status).toBe(307);
  });
});
