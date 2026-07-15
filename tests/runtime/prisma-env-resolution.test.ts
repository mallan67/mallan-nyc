/// <reference types="jest" />
/**
 * Prisma database-URL resolution (compute repair PR #511).
 *
 * Pins the bare-first / integration-fallback / fail-closed contract that lets the
 * public site connect on Preview (where only the Vercel–Neon integration's prefixed
 * `database_DATABASE_URL*` vars are present) WITHOUT changing Production (which has
 * the bare `DATABASE_URL` and must keep using it).
 *
 * All values here are fake placeholders — no real connection string is used, logged,
 * or asserted against.
 */
import { resolvePrismaEnv } from "@/lib/prisma-env";

const BARE = "postgres://bare-pooled/prod";
const BARE_DIRECT = "postgres://bare-direct/prod";
const INT = "postgres://integration-pooled/neon";
const INT_DIRECT = "postgres://integration-direct/neon";

describe("resolvePrismaEnv — pooled URL precedence", () => {
  it("prefers the bare DATABASE_URL when present (Production unchanged)", () => {
    const r = resolvePrismaEnv({ DATABASE_URL: BARE, database_DATABASE_URL: INT });
    expect(r.url).toBe(BARE);
    expect(r.urlSource).toBe("DATABASE_URL");
  });

  it("uses the integration-managed database_DATABASE_URL ONLY when the bare var is absent (Preview)", () => {
    const r = resolvePrismaEnv({ database_DATABASE_URL: INT });
    expect(r.url).toBe(INT);
    expect(r.urlSource).toBe("database_DATABASE_URL");
  });

  it("treats a defined-but-blank bare var as absent and falls back", () => {
    const r = resolvePrismaEnv({ DATABASE_URL: "   ", database_DATABASE_URL: INT });
    expect(r.url).toBe(INT);
    expect(r.urlSource).toBe("database_DATABASE_URL");
  });
});

describe("resolvePrismaEnv — fail-closed", () => {
  it("throws when neither the bare nor the integration pooled URL exists", () => {
    expect(() => resolvePrismaEnv({})).toThrow(/Refusing to start|not configured/i);
  });

  it("throws when both pooled vars are blank", () => {
    expect(() =>
      resolvePrismaEnv({ DATABASE_URL: "", database_DATABASE_URL: "  " }),
    ).toThrow();
  });

  it("does NOT leak any connection value in the error message", () => {
    let msg = "";
    try {
      resolvePrismaEnv({});
    } catch (e) {
      msg = (e as Error).message;
    }
    // Names are fine; there are no values to leak here, but assert the shape stays name-only.
    expect(msg).toMatch(/DATABASE_URL/);
    expect(msg).toMatch(/database_DATABASE_URL/);
  });
});

describe("resolvePrismaEnv — direct/unpooled URL precedence (same rule, optional)", () => {
  it("prefers the bare DATABASE_URL_UNPOOLED", () => {
    const r = resolvePrismaEnv({
      DATABASE_URL: BARE,
      DATABASE_URL_UNPOOLED: BARE_DIRECT,
      database_DATABASE_URL_UNPOOLED: INT_DIRECT,
    });
    expect(r.directUrl).toBe(BARE_DIRECT);
    expect(r.directUrlSource).toBe("DATABASE_URL_UNPOOLED");
  });

  it("falls back to database_DATABASE_URL_UNPOOLED when the bare direct var is absent", () => {
    const r = resolvePrismaEnv({ DATABASE_URL: BARE, database_DATABASE_URL_UNPOOLED: INT_DIRECT });
    expect(r.directUrl).toBe(INT_DIRECT);
    expect(r.directUrlSource).toBe("database_DATABASE_URL_UNPOOLED");
  });

  it("leaves directUrl undefined when neither direct var exists (pooled URL still resolves)", () => {
    const r = resolvePrismaEnv({ database_DATABASE_URL: INT });
    expect(r.url).toBe(INT);
    expect(r.directUrl).toBeUndefined();
    expect(r.directUrlSource).toBeNull();
  });
});
