/**
 * Auth presence-marker SWEEP (2026-07-23, Maya correction #3).
 *
 * Every session-creation and session-clearing path must go through the ONE
 * centralized pair applySessionCookies / clearSessionCookies so the session
 * cookie and its non-authoritative presence marker can never diverge — on
 * ANY sign-in path (password, MFA, OAuth agent / existing lead / new lead,
 * invitation, reset, impersonation start/stop, dev-login, logout, invalid
 * session) AND for legacy sessions created before the marker existed
 * (mirrored by proxy.ts from cookie PRESENCE only — no validation, no Neon).
 *
 * Discovery is REPOSITORY-WIDE and automatic — no hardcoded file list can
 * rot: any new code that touches the session cookie directly fails here.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ─── 1. Repo-wide automatic discovery ──────────────────────────────────────

describe("repo-wide discovery — no direct session-cookie writes outside the helper", () => {
  const offenders: { rel: string; line: string }[] = [];
  const helperRel = path.join("lib", "auth", "cookie-config.ts");

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "__tests__", ".next"].includes(entry.name)) continue;
        walk(rel);
      } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        if (rel === helperRel) continue; // the ONE legitimate owner
        const src = read(rel);
        for (const m of src.matchAll(/cookies\.(set|delete)\(\s*SESSION_COOKIE/g)) {
          offenders.push({ rel, line: m[0] });
        }
      }
    }
  };

  it("ONLY lib/auth/cookie-config.ts touches the session cookie directly (app/ + lib/ + proxy.ts)", () => {
    walk("app");
    walk("lib");
    const proxySrc = read("proxy.ts");
    for (const m of proxySrc.matchAll(/cookies\.(set|delete)\(\s*SESSION_COOKIE/g)) {
      offenders.push({ rel: "proxy.ts", line: m[0] });
    }
    expect(offenders).toEqual([]);
  });

  it("every file that creates or clears sessions uses the centralized helpers (auto-discovered)", () => {
    // Auto-discover: any non-test file importing createSession from lib/auth
    // and building a response must reference applySessionCookies.
    const missing: string[] = [];
    const scan = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (["node_modules", "__tests__", ".next"].includes(entry.name)) continue;
          scan(rel);
        } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
          const src = read(rel);
          const createsSession = /\bcreateSession\s*\(/.test(src) && /NextResponse/.test(src);
          if (createsSession && !src.includes("applySessionCookies")) missing.push(rel);
        }
      }
    };
    scan("app");
    scan(path.join("lib", "auth"));
    expect(missing).toEqual([]);
  });
});

// ─── 2. Helper behavioral contract ─────────────────────────────────────────

describe("applySessionCookies / clearSessionCookies — both cookies, always, identically", () => {
  const {
    applySessionCookies,
    clearSessionCookies,
    getSessionCookieConfig,
    SESSION_COOKIE,
    AUTH_PRESENCE_COOKIE,
  } = require("@/lib/auth/cookie-config");

  const mkRes = () => {
    const set = jest.fn();
    const del = jest.fn();
    return { res: { cookies: { set, delete: del } }, set, del };
  };

  it.each([
    ["broker", "agent", "BROKER"],
    ["agent", "agent", "AGENT"],
    ["lead", "lead", "buyer"],
  ])("%s: marker mirrors the session cookie's exact lifetime/path/sameSite", (_label, userType, role) => {
    const { res, set } = mkRes();
    applySessionCookies(res, "tok", userType, role);
    expect(set).toHaveBeenCalledTimes(2);
    const [sessName, sessVal, sessOpts] = set.mock.calls[0];
    const [markName, markVal, markOpts] = set.mock.calls[1];
    expect(sessName).toBe(SESSION_COOKIE);
    expect(sessVal).toBe("tok");
    expect(sessOpts).toEqual(getSessionCookieConfig(userType, role));
    expect(markName).toBe(AUTH_PRESENCE_COOKIE);
    expect(markVal).toBe("1"); // constant — never identity/role/session material
    expect(markOpts.httpOnly).toBe(false);
    expect(markOpts.maxAge).toBe(sessOpts.maxAge);
    expect(markOpts.path).toBe(sessOpts.path);
    expect(markOpts.sameSite).toBe(sessOpts.sameSite);
  });

  it("overrides (impersonation 2h, dev-login secure:false) reach BOTH cookies", () => {
    const { res, set } = mkRes();
    applySessionCookies(res, "tok", "agent", "AGENT", { maxAge: 2 * 60 * 60, secure: false });
    const [, , sessOpts] = set.mock.calls[0];
    const [, , markOpts] = set.mock.calls[1];
    expect(sessOpts.maxAge).toBe(7200);
    expect(markOpts.maxAge).toBe(7200);
    expect(sessOpts.secure).toBe(false);
    expect(markOpts.secure).toBe(false);
    expect(sessOpts.httpOnly).toBe(true); // session stays httpOnly regardless
    expect(markOpts.httpOnly).toBe(false); // marker NEVER httpOnly
  });

  it("clearSessionCookies deletes exactly both cookies", () => {
    const { res, del } = mkRes();
    clearSessionCookies(res);
    expect(del.mock.calls.map((c: unknown[]) => c[0]).sort()).toEqual(
      [AUTH_PRESENCE_COOKIE, SESSION_COOKIE].sort(),
    );
  });
});

// ─── 3. Every flow, individually pinned ────────────────────────────────────

describe("per-flow coverage — each sign-in/out path uses the centralized pair", () => {
  const cases: Array<[string, string, RegExp]> = [
    ["password login (agent branch)", "app/api/auth/login/route.ts", /applySessionCookies\(res, token, "agent", agent\.role\)/],
    ["password login (lead branch)", "app/api/auth/login/route.ts", /applySessionCookies\(res, token, "lead", role\)/],
    ["MFA completion", "app/api/auth/mfa/verify/route.ts", /applySessionCookies\(res, sessionToken, "agent", agent\.role\)/],
    ["OAuth agent", "lib/auth/oauth.ts", /applySessionCookies\(res, token, "agent", agent\.role/],
    ["OAuth NEW lead", "lib/auth/oauth.ts", /applySessionCookies\(res, token, "lead", "buyer"/],
    ["OAuth EXISTING lead", "lib/auth/oauth.ts", /applySessionCookies\(res, token, "lead", role/],
    ["invitation", "app/api/auth/invite/[token]/route.ts", /applySessionCookies\(res, sessionToken, "lead", role\)/],
    ["reset password", "app/api/auth/reset-password/route.ts", /applySessionCookies\(res, sessionToken, userType, role\)/],
    ["impersonation START (2h TTL preserved)", "app/api/crm/agents/[id]/impersonate/route.ts", /applySessionCookies\(res, token, "agent", agent\.role, \{ maxAge: 2 \* 60 \* 60 \}\)/],
    ["impersonation STOP", "app/api/auth/impersonation/stop/route.ts", /clearSessionCookies\(res\)/],
    ["dev-login (secure:false preserved)", "app/api/auth/dev-login/route.ts", /applySessionCookies\(res, result\.token, "agent", "AGENT", \{ secure: false, maxAge: 24 \* 60 \* 60 \}\)/],
    ["logout", "app/api/auth/logout/route.ts", /clearSessionCookies\(res\)/],
    ["invalid session (/api/auth/me)", "app/api/auth/me/route.ts", /clearSessionCookies\(res\)/],
    ["invalid session (auth middleware)", "lib/auth/middleware.ts", /clearSessionCookies\(res\)/],
  ];

  it.each(cases)("%s", (_name, rel, re) => {
    expect(read(rel)).toMatch(re);
  });

  it("logout clears at BOTH of its response sites", () => {
    const src = read("app/api/auth/logout/route.ts");
    expect((src.match(/clearSessionCookies\(res\)/g) ?? []).length).toBe(2);
  });

  it("dev-login applies the helper at BOTH of its response sites", () => {
    const src = read("app/api/auth/dev-login/route.ts");
    expect((src.match(/applySessionCookies\(/g) ?? []).length).toBe(2);
  });
});

// ─── 4. Legacy sessions (created before the marker shipped) ────────────────

describe("legacy pre-deployment sessions — proxy mirrors marker from cookie PRESENCE only", () => {
  it("SOURCE: proxy sets the marker when session cookie exists without it — via has(), never get()/value (no validation, no Neon)", () => {
    const src = read("proxy.ts");
    expect(src).toMatch(/req\.cookies\.has\(SESSION_COOKIE\) && !req\.cookies\.has\(AUTH_PRESENCE_COOKIE\)/);
    expect(src).toMatch(/response\.cookies\.set\(AUTH_PRESENCE_COOKIE, "1"/);
    // presence check only — the proxy must never READ the session value
    expect(src).not.toMatch(/cookies\.get\(SESSION_COOKIE\)/);
    expect(src).not.toMatch(/validateSession/);
    expect(src).not.toMatch(/prisma/);
  });

  it("BEHAVIORAL: valid legacy session (cookie present, no marker) gets the marker on any page response", async () => {
    const { NextRequest } = require("next/server");
    const middleware = require("@/proxy").default;
    const req = new NextRequest("https://mallan.nyc/", {
      headers: {
        cookie: "session_token=legacy-session-value",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) legacy-user",
      },
    });
    const res = await middleware(req);
    expect(res.cookies.get("mallan_auth_present")?.value).toBe("1");
  });

  it("BEHAVIORAL: anonymous request (no session cookie) gets NO marker", async () => {
    const { NextRequest } = require("next/server");
    const middleware = require("@/proxy").default;
    const req = new NextRequest("https://mallan.nyc/", {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) anon-user" },
    });
    const res = await middleware(req);
    expect(res.cookies.get("mallan_auth_present")).toBeUndefined();
  });
});
