/// <reference types="jest" />
/**
 * Scope B + warning consolidation (Maya directive 2026-07-24) —
 * failing-first TDD.
 *
 * 1. `manifestShardForAddress` — the writer-side twin of the reader's shard
 *    derivation (`cleanStreetNumber.charAt(0)` in buildBuildingPayload):
 *    RAW first character of the trimmed StreetNumber, no case folding, null
 *    for masked/absent numbers. Sync uses it to warm ONLY the shards whose
 *    listings physically changed (old + new address on a move).
 *
 * 2. `safeRevalidateTags` — the profile-less `revalidateTag(tag)` call is
 *    DELIBERATE (dist-verified immediate expiration; Next 16.2.4
 *    revalidate.js:41-43 emits a deprecation console.warn per call). Instead
 *    of 77–156 identical warning lines per sync cycle, the accepted
 *    deprecation is documented centrally: per-call warnings matching the
 *    exact Next message are absorbed and ONE summary line is emitted.
 *    Non-matching warnings must pass through untouched, and the console is
 *    restored even when revalidateTag throws.
 */

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

import { revalidateTag } from "next/cache";
import {
  manifestShardForAddress,
  safeRevalidateTags,
  newRevalidationCounters,
} from "@/lib/cache/public-cache";

const NEXT_DEPRECATION_WARNING =
  '"revalidateTag" without the second argument is now deprecated, add second argument of "max" or use "updateTag". See more info here: https://nextjs.org/docs/messages/revalidate-tag-single-arg';

describe("manifestShardForAddress — writer-side shard derivation", () => {
  it("returns the RAW first character of the trimmed StreetNumber", () => {
    expect(manifestShardForAddress({ StreetNumber: "400", StreetName: "EAST 90 STREET" })).toBe("4");
    expect(manifestShardForAddress({ StreetNumber: " 1201 " })).toBe("1");
  });

  it("matches the reader for non-digit street numbers (no case folding)", () => {
    expect(manifestShardForAddress({ StreetNumber: "One57" })).toBe("O");
  });

  it("returns null for masked/absent street numbers (nothing to warm)", () => {
    expect(manifestShardForAddress({ StreetName: "EAST 90 STREET" })).toBeNull();
    expect(manifestShardForAddress({ StreetNumber: "  " })).toBeNull();
    expect(manifestShardForAddress(null)).toBeNull();
    expect(manifestShardForAddress(undefined)).toBeNull();
    expect(manifestShardForAddress("not-an-object")).toBeNull();
  });
});

describe("safeRevalidateTags — consolidated deprecation warning", () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    (revalidateTag as unknown as jest.Mock).mockReset();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  function emitDeprecationPerCall() {
    (revalidateTag as unknown as jest.Mock).mockImplementation(() => {
      // exactly what Next 16.2.4 dist revalidate.js:42 does per call
      console.warn(NEXT_DEPRECATION_WARNING);
    });
  }

  it("absorbs every per-tag Next deprecation warning and emits ONE summary line", () => {
    emitDeprecationPerCall();
    const counters = newRevalidationCounters();
    safeRevalidateTags(["a", "b", "c", "d", "e"], counters);
    expect(counters.pages_revalidated).toBe(5);
    // no raw deprecation line reached the console
    const rawDeprecations = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes("revalidate-tag-single-arg"),
    );
    expect(rawDeprecations).toHaveLength(0);
    // exactly one consolidated summary, carrying the count
    const summaries = logSpy.mock.calls.filter((c) =>
      String(c[0]).includes("deprecation warning suppressed"),
    );
    expect(summaries).toHaveLength(1);
    expect(String(summaries[0][0])).toContain("5");
  });

  it("lets non-deprecation warnings pass through untouched", () => {
    (revalidateTag as unknown as jest.Mock).mockImplementation((tag: string) => {
      console.warn(NEXT_DEPRECATION_WARNING);
      console.warn(`unrelated warning for ${tag}`);
    });
    safeRevalidateTags(["x", "y"]);
    const unrelated = warnSpy.mock.calls.filter((c) => String(c[0]).startsWith("unrelated warning"));
    expect(unrelated).toHaveLength(2);
    const rawDeprecations = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes("revalidate-tag-single-arg"),
    );
    expect(rawDeprecations).toHaveLength(0);
  });

  it("restores console.warn even when revalidateTag throws (and counts the failure)", () => {
    (revalidateTag as unknown as jest.Mock).mockImplementation(() => {
      throw new Error("boom");
    });
    const counters = newRevalidationCounters();
    const originalWarn = console.warn;
    safeRevalidateTags(["t1"], counters);
    expect(console.warn).toBe(originalWarn);
    expect(counters.revalidation_failures).toBe(1);
  });

  it("emits NO summary line when no tag was revalidated or no warning fired", () => {
    (revalidateTag as unknown as jest.Mock).mockImplementation(() => {});
    safeRevalidateTags([]);
    safeRevalidateTags(["quiet-tag"]);
    const summaries = logSpy.mock.calls.filter((c) =>
      String(c[0]).includes("deprecation warning suppressed"),
    );
    expect(summaries).toHaveLength(0);
  });
});
