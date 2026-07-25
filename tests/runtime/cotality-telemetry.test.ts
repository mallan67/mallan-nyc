/// <reference types="jest" />
/**
 * Cotality telemetry — RUN-SCOPED (AsyncLocalStorage) collector semantics, and
 * that the fetch/auth layer + cron members are wired to it (source contract).
 *
 * Key isolation proof: two collectors run concurrently and a record* call in
 * one context NEVER alters the other's counters; a call outside any context is
 * a no-op.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  createCotalityCollector,
  runWithCotalityTelemetry,
  snapshotCollector,
  recordCotalityHttp,
  recordPropertyRequest,
  recordMediaRequest,
  recordTokenRequest,
  recordTokenRefresh,
  recordRetry,
  parseRetryAfterSeconds,
} from "@/lib/idx/cotality-telemetry";

const read = (rel: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("run-scoped collector counters", () => {
  it("a fresh collector starts at zero and carries member + run_id", () => {
    const c = createCotalityCollector("idx-sync", "run-1");
    expect(c.member).toBe("idx-sync");
    expect(c.one_cycle_run_id).toBe("run-1");
    for (const k of [
      "property_requests", "property_pages", "media_requests", "media_pages",
      "token_requests", "token_refreshes", "retries", "http_429_count",
      "retry_after_seconds", "cotality_duration_ms", "total_cotality_requests",
    ]) {
      expect(snapshotCollector(c)).toHaveProperty(k, 0);
    }
  });

  it("records property vs media pages by URL, duration, total, 429 + max Retry-After", async () => {
    const c = createCotalityCollector("idx-sync", null);
    await runWithCotalityTelemetry(c, async () => {
      recordCotalityHttp({ url: "https://api.cotality.com/trestle/odata/Property?x=1", durationMs: 30, status: 200 });
      recordCotalityHttp({ url: "https://api.cotality.com/trestle/odata/Media?y=2", durationMs: 20, status: 429, retryAfterSeconds: 4 });
      recordCotalityHttp({ url: "/odata/Media", durationMs: 10, status: 429, retryAfterSeconds: 9 });
    });
    const s = snapshotCollector(c);
    expect(s.property_pages).toBe(1);
    expect(s.media_pages).toBe(2);
    expect(s.total_cotality_requests).toBe(3);
    expect(s.cotality_duration_ms).toBe(60);
    expect(s.http_429_count).toBe(2);
    expect(s.retry_after_seconds).toBe(9);
  });

  it("counts a THROWN HTTP attempt (status 0) toward total + duration + pages", async () => {
    const c = createCotalityCollector("media-sync", null);
    await runWithCotalityTelemetry(c, async () => {
      recordCotalityHttp({ url: "/odata/Media?z=1", durationMs: 8, status: 0 }); // threw before Response
    });
    const s = snapshotCollector(c);
    expect(s.total_cotality_requests).toBe(1);
    expect(s.media_pages).toBe(1);
    expect(s.cotality_duration_ms).toBe(8);
    expect(s.http_429_count).toBe(0);
  });

  it("records logical requests, token calls, refreshes and retries", async () => {
    const c = createCotalityCollector("idx-sync", "r");
    await runWithCotalityTelemetry(c, async () => {
      recordPropertyRequest();
      recordMediaRequest();
      recordTokenRequest(12);
      recordTokenRefresh();
      recordRetry();
    });
    const s = snapshotCollector(c);
    expect(s.property_requests).toBe(1);
    expect(s.media_requests).toBe(1);
    expect(s.token_requests).toBe(1);
    expect(s.total_cotality_requests).toBe(1); // token counts toward total
    expect(s.cotality_duration_ms).toBe(12);
    expect(s.token_refreshes).toBe(1);
    expect(s.retries).toBe(1);
  });

  it("ISOLATION: a record in one context never alters another concurrent collector", async () => {
    const a = createCotalityCollector("idx-sync", "A");
    const b = createCotalityCollector("media-sync", "B");
    // Interleave two concurrent contexts.
    await Promise.all([
      runWithCotalityTelemetry(a, async () => {
        recordPropertyRequest();
        await new Promise((r) => setTimeout(r, 5));
        recordPropertyRequest();
      }),
      runWithCotalityTelemetry(b, async () => {
        recordMediaRequest();
        await new Promise((r) => setTimeout(r, 5));
        recordMediaRequest();
      }),
    ]);
    expect(snapshotCollector(a).property_requests).toBe(2);
    expect(snapshotCollector(a).media_requests).toBe(0); // b's media never leaked into a
    expect(snapshotCollector(b).media_requests).toBe(2);
    expect(snapshotCollector(b).property_requests).toBe(0);
  });

  it("a record OUTSIDE any context is a no-op (never contaminates)", () => {
    // No runWithCotalityTelemetry wrapper — must not throw, must not record.
    expect(() => {
      recordPropertyRequest();
      recordCotalityHttp({ url: "/odata/Property", durationMs: 5, status: 200 });
    }).not.toThrow();
    // And a fresh collector remains zero afterwards.
    expect(snapshotCollector(createCotalityCollector("idx-sync", null)).property_requests).toBe(0);
  });

  it("parseRetryAfterSeconds handles seconds form and rejects garbage", () => {
    expect(parseRetryAfterSeconds("5")).toBe(5);
    expect(parseRetryAfterSeconds("0")).toBe(0);
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds("soon")).toBeNull();
  });
});

describe("fetch/auth layer + cron members are wired to run-scoped telemetry (source contract)", () => {
  it("fetch.ts records HTTP calls (incl. thrown), retries, property/media requests", () => {
    const src = read("lib/idx/fetch.ts");
    expect(src).toMatch(/from "\.\/cotality-telemetry"/);
    expect(src).toMatch(/recordCotalityHttp\(/);
    expect(src).toMatch(/status: 0/); // thrown-attempt path
    expect(src).toMatch(/recordRetry\(\)/);
    expect(src).toMatch(/recordPropertyRequest\(\)/);
    expect(src).toMatch(/recordMediaRequest\(\)/);
  });

  it("auth.ts records token requests (even on throw, via finally) and refreshes", () => {
    const src = read("lib/idx/auth.ts");
    expect(src).toMatch(/recordTokenRequest\(/);
    expect(src).toMatch(/recordTokenRefresh\(\)/);
  });

  it("both cron members run inside a collector and persist telemetry on success AND error", () => {
    for (const rel of ["app/api/cron/idx-sync/route.ts", "app/api/cron/media-sync/route.ts"]) {
      const src = read(rel);
      expect(src).toMatch(/createCotalityCollector\(/);
      expect(src).toMatch(/runWithCotalityTelemetry\(/);
      expect(src).toMatch(/x-one-cycle-run-id/);
      // telemetry appears in BOTH the success and the *_error audit payloads.
      expect((src.match(/snapshotCollector\(cotalityCollector\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
      // standalone admission is the shared ATOMIC claim (not a check-then-start).
      expect(src).toMatch(/claimMachine\(/);
      expect(src).toMatch(/completeMachine\(/);
    }
  });
});
