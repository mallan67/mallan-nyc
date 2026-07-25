/// <reference types="jest" />
/**
 * Cotality telemetry counter module — reset / record / snapshot semantics, and
 * that the fetch/auth layer is actually wired to it (source contract).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import {
  resetCotalityTelemetry,
  snapshotCotalityTelemetry,
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

beforeEach(() => resetCotalityTelemetry());

describe("cotality telemetry counters", () => {
  it("starts at zero after reset and exposes every required counter", () => {
    const s = snapshotCotalityTelemetry();
    for (const k of [
      "property_requests", "property_pages", "media_requests", "media_pages",
      "token_requests", "token_refreshes", "retries", "http_429_count",
      "retry_after_seconds", "cotality_duration_ms", "total_cotality_requests",
    ]) {
      expect(s).toHaveProperty(k, 0);
    }
  });

  it("classifies property vs media pages by URL and accumulates duration + total", () => {
    recordCotalityHttp({ url: "https://api.cotality.com/trestle/odata/Property?x=1", durationMs: 30, status: 200 });
    recordCotalityHttp({ url: "https://api.cotality.com/trestle/odata/Media?y=2", durationMs: 20, status: 200 });
    const s = snapshotCotalityTelemetry();
    expect(s.property_pages).toBe(1);
    expect(s.media_pages).toBe(1);
    expect(s.total_cotality_requests).toBe(2);
    expect(s.cotality_duration_ms).toBe(50);
  });

  it("counts 429s and captures the max Retry-After", () => {
    recordCotalityHttp({ url: "/odata/Property", durationMs: 5, status: 429, retryAfterSeconds: 3 });
    recordCotalityHttp({ url: "/odata/Media", durationMs: 5, status: 429, retryAfterSeconds: 7 });
    recordCotalityHttp({ url: "/odata/Media", durationMs: 5, status: 429, retryAfterSeconds: 2 });
    const s = snapshotCotalityTelemetry();
    expect(s.http_429_count).toBe(3);
    expect(s.retry_after_seconds).toBe(7); // max
  });

  it("records logical requests, token calls, refreshes and retries independently", () => {
    recordPropertyRequest();
    recordMediaRequest();
    recordTokenRequest(12);
    recordTokenRefresh();
    recordRetry();
    const s = snapshotCotalityTelemetry();
    expect(s.property_requests).toBe(1);
    expect(s.media_requests).toBe(1);
    expect(s.token_requests).toBe(1);
    expect(s.total_cotality_requests).toBe(1); // token counts toward total
    expect(s.cotality_duration_ms).toBe(12);
    expect(s.token_refreshes).toBe(1);
    expect(s.retries).toBe(1);
  });

  it("snapshot is an immutable copy (later records do not mutate an old snapshot)", () => {
    const before = snapshotCotalityTelemetry();
    recordPropertyRequest();
    expect(before.property_requests).toBe(0);
    expect(snapshotCotalityTelemetry().property_requests).toBe(1);
  });

  it("parseRetryAfterSeconds handles seconds form and rejects garbage", () => {
    expect(parseRetryAfterSeconds("5")).toBe(5);
    expect(parseRetryAfterSeconds("0")).toBe(0);
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds("soon")).toBeNull();
  });
});

describe("fetch/auth layer is wired to the telemetry module (source contract)", () => {
  it("fetch.ts records HTTP calls, retries, and property/media requests", () => {
    const src = read("lib/idx/fetch.ts");
    expect(src).toMatch(/from "\.\/cotality-telemetry"/);
    expect(src).toMatch(/recordCotalityHttp\(/);
    expect(src).toMatch(/recordRetry\(\)/);
    expect(src).toMatch(/recordPropertyRequest\(\)/);
    expect(src).toMatch(/recordMediaRequest\(\)/);
  });

  it("auth.ts records token requests and refreshes", () => {
    const src = read("lib/idx/auth.ts");
    expect(src).toMatch(/recordTokenRequest\(/);
    expect(src).toMatch(/recordTokenRefresh\(\)/);
  });

  it("both cron members reset + snapshot telemetry and stamp the one_cycle_run_id", () => {
    for (const rel of ["app/api/cron/idx-sync/route.ts", "app/api/cron/media-sync/route.ts"]) {
      const src = read(rel);
      expect(src).toMatch(/resetCotalityTelemetry\(\)/);
      expect(src).toMatch(/snapshotCotalityTelemetry\(\)/);
      expect(src).toMatch(/x-one-cycle-run-id/);
      expect(src).toMatch(/one_cycle_run_id/);
    }
  });
});
