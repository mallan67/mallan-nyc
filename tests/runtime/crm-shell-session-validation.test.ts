/// <reference types="jest" />
/**
 * CRM page shell requires a LIVE session, not just a cookie.
 *
 * Executes the real checkRouteGuards() with real NextRequest objects and a
 * stubbed session endpoint, so the redirect/clear-cookie behaviour is tested,
 * not the source text.
 */
import { NextRequest } from "next/server";
import { checkRouteGuards } from "@/lib/middleware/route-guards";

const ORIGIN = "https://mallan.nyc";

function req(pathname: string, cookie?: string) {
  return new NextRequest(`${ORIGIN}${pathname}`, {
    headers: cookie ? { cookie } : {},
  });
}

function stubSessionEndpoint(impl: () => Promise<Response>) {
  const fn = jest.fn(impl);
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
}

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("CRM shell session validation", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("serves the shell when the session endpoint confirms the cookie", async () => {
    const f = stubSessionEndpoint(() => json({ authenticated: true }));
    const res = await checkRouteGuards(req("/crm/dashboard.html", "session_token=good"), "/crm/dashboard.html");
    expect(res).toBeNull();
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe(`${ORIGIN}/api/auth/me`);
    expect((init.headers as Record<string, string>).cookie).toContain("session_token=good");
  });

  it("redirects a forged cookie to login and clears it", async () => {
    stubSessionEndpoint(() => json({ authenticated: false }));
    const res = await checkRouteGuards(req("/crm/dashboard.html", "session_token=forged"), "/crm/dashboard.html");
    expect(res?.status).toBe(307);
    expect(new URL(res!.headers.get("location")!).pathname).toBe("/crm/login.html");
    expect(res!.headers.get("set-cookie")).toMatch(/session_token=;/);
  });

  it("fails closed when the session endpoint errors or is unreachable", async () => {
    stubSessionEndpoint(() => json({}, 500));
    let res = await checkRouteGuards(req("/crm/x.html", "session_token=a"), "/crm/x.html");
    expect(res?.status).toBe(307);
    stubSessionEndpoint(() => Promise.reject(new Error("down")));
    res = await checkRouteGuards(req("/crm/x.html", "session_token=a"), "/crm/x.html");
    expect(res?.status).toBe(307);
  });

  it("redirects with no cookie, without calling the session endpoint", async () => {
    const f = stubSessionEndpoint(() => json({ authenticated: true }));
    const res = await checkRouteGuards(req("/crm/dashboard.html"), "/crm/dashboard.html");
    expect(res?.status).toBe(307);
    expect(f).not.toHaveBeenCalled();
  });

  it("leaves the login page and static assets open without a session lookup", async () => {
    const f = stubSessionEndpoint(() => json({ authenticated: false }));
    for (const p of ["/crm/login.html", "/crm/js/app.js", "/crm/css/a.css"]) {
      expect(await checkRouteGuards(req(p, "session_token=forged"), p)).toBeNull();
    }
    expect(f).not.toHaveBeenCalled();
  });
});
