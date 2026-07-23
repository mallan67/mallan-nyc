/**
 * Neon-quiet public shell (2026-07-23) — the anonymous public shell must not
 * generate function executions or Neon reads it doesn't need.
 *
 * Covers Maya's Parts 1–3:
 *   1. /api/settings/company — public components use the build-time constant
 *      module; ZERO public GET traffic.
 *   2. /api/idx/watermark — ONE deduped request per full app mount, no
 *      `no-store`, server side tag-cached, invalidated ONLY by a fully
 *      successful idx-sync after its SyncState upsert commits.
 *   3. /api/auth/me — anonymous visitors perform ZERO calls (presence-marker
 *      gate); the marker is presentation-only and never authoritative.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ─── Part 1: settings-company static module ────────────────────────────────

describe("public shell — /api/settings/company is never fetched by public components", () => {
  const componentDir = path.join(ROOT, "app", "components");
  const componentFiles = fs.readdirSync(componentDir).filter((f) => /\.(tsx|ts)$/.test(f));

  it("NO component under app/components fetches /api/settings/company", () => {
    for (const f of componentFiles) {
      const src = read(path.join("app", "components", f));
      // Actual network calls only (mentions in comments are fine).
      const fetches = /fetch\(\s*['"`]\/api\/settings\/company/.test(src);
      expect({ file: f, fetches }).toEqual({ file: f, fetches: false });
    }
  });

  it("Footer and HeroSearch import the canonical static settings module", () => {
    expect(read("app/components/Footer.tsx")).toContain("PUBLIC_COMPANY_SETTINGS");
    expect(read("app/components/HeroSearch.tsx")).toContain("PUBLIC_COMPANY_SETTINGS");
  });

  it("the API route serves the SAME canonical module (no drift)", () => {
    const route = read("app/api/settings/company/route.ts");
    expect(route).toContain("const DEFAULT_SETTINGS = PUBLIC_COMPANY_SETTINGS");
  });

  it("canonical settings carry the NY DOS §175.25 brokerage identification", () => {
    // Import the actual module — values must match CLAUDE.md §B.
    const mod = require("@/lib/config/public-company-settings");
    expect(mod.PUBLIC_COMPANY_SETTINGS.companyName).toBe("Mallan Real Estate Inc.");
    expect(mod.PUBLIC_COMPANY_SETTINGS.license).toBe("10991205323");
    expect(mod.PUBLIC_COMPANY_SETTINGS.phone).toBe("646-258-4460");
    expect(mod.PUBLIC_COMPANY_SETTINGS.legalLinks.map((l: { href: string }) => l.href)).toContain("/fair-housing");
  });
});

// ─── Part 2: watermark — dedupe, no no-store, tag cache, sync-gated ────────

describe("public shell — IDX watermark access", () => {
  it("NO public caller uses cache:'no-store' on /api/idx/watermark", () => {
    for (const rel of ["app/components/Footer.tsx", "app/components/IDXDisclaimer.tsx"]) {
      const src = read(rel);
      expect(src).not.toMatch(/idx\/watermark[^\n]*no-store/);
      expect(src).not.toMatch(/no-store[^\n]*idx\/watermark/);
    }
  });

  it("Footer and IDXDisclaimer share the deduped client module (no independent fetches)", () => {
    for (const rel of ["app/components/Footer.tsx", "app/components/IDXDisclaimer.tsx"]) {
      const src = read(rel);
      expect(src).toContain("fetchIdxWatermarkOnce");
      expect(src).not.toMatch(/fetch\(\s*['"]\/api\/idx\/watermark/);
    }
  });

  it("the watermark route reads through the tagged server cache", () => {
    const route = read("app/api/idx/watermark/route.ts");
    expect(route).toContain("getCachedIdxWatermark");
    expect(route).not.toMatch(/\bgetIdxWatermark\(\)/); // direct read retired
  });

  it("idx-sync revalidates the watermark tag ONLY on a fully successful run, after the SyncState upsert", () => {
    const sync = read("lib/idx/sync.ts");
    const site = sync.indexOf('safeRevalidateTags(["idx-watermark"]');
    expect(site).toBeGreaterThan(-1);
    // Must sit inside the errors === 0 guard AFTER the syncState.upsert call.
    const upsertIdx = sync.indexOf("prisma.syncState.upsert");
    expect(upsertIdx).toBeGreaterThan(-1);
    expect(site).toBeGreaterThan(upsertIdx);
    const guardIdx = sync.lastIndexOf("if (errors === 0)", site);
    expect(guardIdx).toBeGreaterThan(upsertIdx); // guard is between upsert and the call
  });

  it("cache module: tag + 30-minute fallback aligned to the ACTUAL sync cadence", () => {
    const mod = require("@/lib/cache/idx-watermark");
    expect(mod.IDX_WATERMARK_CACHE_TAG).toBe("idx-watermark");
    expect(mod.IDX_WATERMARK_REVALIDATE_SECONDS).toBe(30 * 60);
  });
});

describe("fetchIdxWatermarkOnce — one request per app mount, fail-closed", () => {
  const { fetchIdxWatermarkOnce, __resetIdxWatermarkMemoForTests } =
    require("@/lib/client/idx-watermark-client");

  beforeEach(() => __resetIdxWatermarkMemoForTests());

  it("N concurrent consumers share ONE fetch", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ displayAt: "2026-07-23T00:00:00Z" }),
    })) as unknown as typeof fetch;
    const [a, b, c] = await Promise.all([
      fetchIdxWatermarkOnce(fetchImpl),
      fetchIdxWatermarkOnce(fetchImpl),
      fetchIdxWatermarkOnce(fetchImpl),
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(a?.toISOString()).toBe("2026-07-23T00:00:00.000Z");
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("does NOT pass cache:'no-store' (browser cache allowed to work)", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ displayAt: null }) })) as unknown as typeof fetch;
    await fetchIdxWatermarkOnce(fetchImpl);
    const args = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(args[1]?.cache).toBeUndefined();
  });

  it("fail-closed: network error / non-ok / invalid date all resolve null (no fabricated date)", async () => {
    const err = jest.fn(async () => { throw new Error("net"); }) as unknown as typeof fetch;
    expect(await fetchIdxWatermarkOnce(err)).toBeNull();
    __resetIdxWatermarkMemoForTests();
    const notOk = jest.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    expect(await fetchIdxWatermarkOnce(notOk)).toBeNull();
    __resetIdxWatermarkMemoForTests();
    const badDate = jest.fn(async () => ({ ok: true, json: async () => ({ displayAt: "garbage" }) })) as unknown as typeof fetch;
    expect(await fetchIdxWatermarkOnce(badDate)).toBeNull();
  });
});

// ─── Part 3: anonymous pages make zero /api/auth/me calls ──────────────────

describe("public shell — anonymous auth gate", () => {
  it("AuthProvider gates the /api/auth/me fetch behind the presence marker", () => {
    const src = read("app/components/AuthProvider.tsx");
    const gate = src.indexOf("hasAuthPresenceMarker(document.cookie)");
    const fetchIdx = src.indexOf("fetch('/api/auth/me')");
    expect(gate).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(gate); // gate comes FIRST
  });

  it("hasAuthPresenceMarker: pure and exact", () => {
    const { hasAuthPresenceMarker } = require("@/app/components/AuthProvider");
    expect(hasAuthPresenceMarker("")).toBe(false);
    expect(hasAuthPresenceMarker("foo=1; bar=2")).toBe(false);
    expect(hasAuthPresenceMarker("mallan_auth_present=1")).toBe(true);
    expect(hasAuthPresenceMarker("a=b; mallan_auth_present=1; c=d")).toBe(true);
    expect(hasAuthPresenceMarker("not_mallan_auth_present=1")).toBe(false);
  });

  it("marker parity is owned by the CENTRALIZED helper — no file sets the session cookie directly", () => {
    // Superseded by the repo-wide automatic sweep (Maya correction #3): the
    // original hardcoded three-file parity check missed OAuth, MFA,
    // impersonation and dev-login. Full coverage now lives in
    // tests/runtime/neon-quiet-auth-marker-sweep.test.ts (repo-wide
    // discovery + per-flow pins + legacy-session proxy mirror). Here we keep
    // only the structural invariant that makes divergence impossible:
    const helper = read("lib/auth/cookie-config.ts");
    expect(helper).toContain("export function applySessionCookies");
    expect(helper).toContain("export function clearSessionCookies");
    for (const rel of [
      "app/api/auth/login/route.ts",
      "app/api/auth/invite/[token]/route.ts",
      "app/api/auth/reset-password/route.ts",
    ]) {
      const src = read(rel);
      expect(src).toContain("applySessionCookies");
      expect(src).not.toMatch(/cookies\.set\(\s*SESSION_COOKIE/);
    }
  });

  it("SECURITY: no server-side authorization path ever READS the presence marker", () => {
    // The marker may only appear in cookies.set / cookies.delete calls and the
    // cookie-config definition — never in cookies.get / request-reading code.
    const serverDirs = ["app/api", "lib/auth"];
    const offending: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name)) {
          const src = read(rel);
          if (/cookies\.get\([^)]*AUTH_PRESENCE_COOKIE|AUTH_PRESENCE_COOKIE[^)\n]*\)\s*\.value/.test(src)) {
            offending.push(rel);
          }
        }
      }
    };
    for (const d of serverDirs) walk(d);
    expect(offending).toEqual([]);
  });

  it("presence cookie config: NOT httpOnly (client-readable), same lifetime as the session cookie", () => {
    const { getPresenceCookieConfig, getSessionCookieConfig, AUTH_PRESENCE_COOKIE } =
      require("@/lib/auth/cookie-config");
    expect(AUTH_PRESENCE_COOKIE).toBe("mallan_auth_present");
    const p = getPresenceCookieConfig("agent", "AGENT");
    const s = getSessionCookieConfig("agent", "AGENT");
    expect(p.httpOnly).toBe(false);
    expect(s.httpOnly).toBe(true);
    expect(p.maxAge).toBe(s.maxAge);
    expect(p.path).toBe(s.path);
  });
});
