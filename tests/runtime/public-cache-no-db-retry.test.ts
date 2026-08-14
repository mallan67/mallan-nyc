/// <reference types="jest" />
/**
 * `cachedPublicRead` MUST NOT AMPLIFY A DATABASE FAILURE.
 *
 * PRODUCTION INCIDENT (2026-08-14 10:14:25Z, `/buy`, merge SHA 03778544):
 *
 *     [public-cache] cache layer error — degrading to live read
 *     Prisma listing.findMany: Timed out fetching a new connection from the
 *     connection pool  (pool timeout 10s, connection limit 5)
 *
 * The request still returned HTTP 200, which is exactly why this was easy to
 * miss. The original fallback treated "the fn never resolved" as one case and
 * re-ran the live read for BOTH "cache machinery failed before the fn" and
 * "the fn itself threw". So a Prisma pool exhaustion issued a SECOND identical
 * query against a pool that had just been exhausted — the failure mode
 * amplifies precisely when the database is least able to absorb it.
 *
 * The three cases need distinct handling, and this file pins all three:
 *
 *   1. underlying read THROWS            -> propagate; fn called EXACTLY ONCE
 *   2. cache STORE fails after a read    -> captured value; NO second read
 *   3. cache machinery fails before fn   -> one live attempt (unchanged)
 *
 * Case 3 is deliberately preserved: a genuine cache-wrapper fault must still
 * degrade to a live read, because correctness beats CU savings.
 */

const mockUnstableCache = jest.fn();
jest.mock("next/cache", () => ({
  unstable_cache: (fn: unknown, keyParts: unknown, opts: unknown) =>
    mockUnstableCache(fn, keyParts, opts),
  revalidateTag: jest.fn(),
}));

import { cachedPublicRead } from "@/lib/cache/public-cache";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

/** A Prisma pool-exhaustion error with the production message shape. */
function poolTimeout(): Error {
  return new Error(
    "Timed out fetching a new connection from the connection pool. " +
      "(Current connection pool timeout: 10, connection limit: 5)",
  );
}

describe("cachedPublicRead — a database failure must never retry the read", () => {
  it("case 1: underlying read throws -> fn called EXACTLY ONCE, error propagates", async () => {
    const fn = jest.fn(async () => {
      throw poolTimeout();
    });
    // Real unstable_cache semantics: it invokes the wrapped fn and lets the
    // rejection surface to the caller.
    mockUnstableCache.mockImplementation(
      (wrapped: (...a: unknown[]) => Promise<unknown>) =>
        async (...a: unknown[]) => wrapped(...a),
    );

    const read = cachedPublicRead(fn, ["k"], { tags: ["t"] });

    await expect(read()).rejects.toThrow(/Timed out fetching a new connection/);
    // THE ASSERTION THIS FILE EXISTS FOR.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("case 1b: the propagated error is the ORIGINAL error object", async () => {
    const original = poolTimeout();
    const fn = jest.fn(async () => {
      throw original;
    });
    mockUnstableCache.mockImplementation(
      (wrapped: (...a: unknown[]) => Promise<unknown>) =>
        async (...a: unknown[]) => wrapped(...a),
    );

    await expect(cachedPublicRead(fn, ["k"], { tags: ["t"] })()).rejects.toBe(original);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("case 2: cache STORE fails after a successful read -> captured value, NO second read", async () => {
    const fn = jest.fn(async () => ({ rows: [1, 2, 3] }));
    // The 2 MB oversized-entry shape: the fn resolves, then the cache backend
    // throws while persisting.
    mockUnstableCache.mockImplementation(
      (wrapped: (...a: unknown[]) => Promise<unknown>) =>
        async (...a: unknown[]) => {
          await wrapped(...a);
          throw new Error("cache entry exceeds 2MB limit");
        },
    );

    const out = await cachedPublicRead(fn, ["k"], { tags: ["t"] })();

    expect(out).toEqual({ rows: [1, 2, 3] });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("case 3: cache machinery fails BEFORE the fn runs -> exactly one live attempt", async () => {
    const fn = jest.fn(async () => ({ ok: true }));
    // Wrapper construction itself explodes; the fn is never entered.
    mockUnstableCache.mockImplementation(() => {
      throw new Error("unstable_cache construction failed");
    });

    const out = await cachedPublicRead(fn, ["k"], { tags: ["t"] })();

    expect(out).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a DB failure during a cache-machinery fallback is not retried either", async () => {
    // Wrapper construction fails (case 3) AND the live attempt then fails.
    // The read must still execute exactly once and the error must surface.
    const fn = jest.fn(async () => {
      throw poolTimeout();
    });
    mockUnstableCache.mockImplementation(() => {
      throw new Error("unstable_cache construction failed");
    });

    await expect(cachedPublicRead(fn, ["k"], { tags: ["t"] })()).rejects.toThrow(
      /Timed out fetching a new connection/,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("the happy path is untouched: one read, cached value returned", async () => {
    const fn = jest.fn(async () => ({ v: 42 }));
    mockUnstableCache.mockImplementation(
      (wrapped: (...a: unknown[]) => Promise<unknown>) =>
        async (...a: unknown[]) => wrapped(...a),
    );

    const out = await cachedPublicRead(fn, ["k"], { tags: ["t"] })();

    expect(out).toEqual({ v: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("arguments are forwarded unchanged on every path", async () => {
    const fn = jest.fn(async (a: number, b: string) => `${a}:${b}`);
    mockUnstableCache.mockImplementation(
      (wrapped: (...a: unknown[]) => Promise<unknown>) =>
        async (...a: unknown[]) => wrapped(...a),
    );

    await expect(cachedPublicRead(fn, ["k"], { tags: ["t"] })(7, "x")).resolves.toBe("7:x");
    expect(fn).toHaveBeenCalledWith(7, "x");
  });
});
