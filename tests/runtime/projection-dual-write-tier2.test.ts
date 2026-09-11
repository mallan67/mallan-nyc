/// <reference types="jest" />
/**
 * H1 Tier-2 dual-write — cron-writer source guards.
 *
 * The Tier-1 guard at lib/search/__tests__/h1-dual-write-tier1.test.ts
 * closed the non-sync writer surfaces (crm/convert, idx/ensure-listing,
 * crm/listings/reset-sync, AND the
 * orphan-restore branch inside cron/feed-reconcile). It did NOT cover the
 * remaining cron-side writers that flip Listing.idx_display_yn=false
 * without touching ListingSearchProjection. That gap produced the
 * 1,949-row projection drift documented in
 * docs/listing-search-projection-drift-report-2026-05-16.md.
 *
 * This Tier-2 guard pins the dual-write contract on:
 *   1. app/api/cron/data-retention/route.ts          — REBNY §2.05 24h closed-removal
 *   2. app/api/cron/feed-reconcile/route.ts (ghost)  — daily 3:30 UTC ghost transition
 *   3. app/api/crm/convert/route.ts                  — CRM lifecycle conversions
 *
 * Each writer must (a) import `dualWriteProjectionForListingId`, (b) call
 * it after flipping idx_display_yn, and (c) wrap the call in try/catch so
 * a projection-side failure does not abort the parent operation.
 *
 * Pure source-regex test — fast, runs on every push, would have caught
 * the cron drift at write time.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");

interface Writer {
  label: string;
  rel: string;
  /** Minimum number of dualWriteProjectionForListingId( call-sites required. */
  minCalls: number;
}

const TIER2_WRITERS: Writer[] = [
  {
    label: "cron/data-retention (REBNY §2.05 closed-removal)",
    rel: "app/api/cron/data-retention/route.ts",
    minCalls: 1,
  },
  {
    // feed-reconcile has TWO call-sites after this fix:
    //   - orphan-restore (Tier-1, lines ~313–324)
    //   - ghost-transition (Tier-2, this PR)
    // The Tier-1 test only requires "at least one"; this Tier-2 test
    // tightens to ">= 2" so a regression that removes the ghost call
    // (the one that fixes today's drift) trips even if the orphan call
    // remains.
    label: "cron/feed-reconcile (ghost-transition branch)",
    rel: "app/api/cron/feed-reconcile/route.ts",
    minCalls: 2,
  },
  {
    label: "crm/convert (lifecycle conversions)",
    rel: "app/api/crm/convert/route.ts",
    minCalls: 1,
  },
];

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

function countMatches(src: string, re: RegExp): number {
  const m = src.match(re);
  return m ? m.length : 0;
}

describe.each(TIER2_WRITERS)(
  "Tier-2 projection dual-write — $label",
  ({ rel, minCalls }) => {
    let src: string;
    beforeAll(() => {
      src = readFile(rel);
    });

    it("imports dualWriteProjectionForListingId from the canonical module", () => {
      expect(src).toMatch(
        /import\s*\{[^}]*\bdualWriteProjectionForListingId\b[^}]*\}\s*from\s*["']@\/lib\/search\/listing-search-projection["']/
      );
    });

    it("writes idx_display_yn somewhere in the handler", () => {
      // Confirms the file is still a writer (sanity for future refactors that
      // might move the writer elsewhere and forget to update this test).
      expect(src).toMatch(/idx_display_yn\s*:/);
    });

    it(`calls dualWriteProjectionForListingId at least ${minCalls} time(s)`, () => {
      const calls = countMatches(src, /dualWriteProjectionForListingId\s*\(/g);
      expect(calls).toBeGreaterThanOrEqual(minCalls);
    });

    it("wraps each dual-write call in try/catch so projection failure is non-fatal", () => {
      // Pattern: try { ... dualWriteProjectionForListingId( ... } catch
      // Every call site must sit inside a try/catch — sequential dual-writes
      // outside transactions can fail independently and must not abort the
      // parent loop.
      const tryCatchMatches = src.match(
        /try\s*\{[\s\S]*?dualWriteProjectionForListingId\s*\([\s\S]*?\}\s*catch/g
      );
      const totalCalls = countMatches(src, /dualWriteProjectionForListingId\s*\(/g);
      expect(tryCatchMatches?.length ?? 0).toBeGreaterThanOrEqual(totalCalls);
    });

    it("does NOT bypass the helper with a manual prisma.listingSearchProjection write", () => {
      // Same guard as Tier-1: hand-rolled projection upserts would split the
      // payload-builder contract and re-introduce mapping divergence.
      expect(src).not.toMatch(
        /prisma\.listingSearchProjection\.(create|upsert|update|insert)/
      );
    });
  }
);

describe("Tier-2 projection dual-write — cross-file invariants", () => {
  it("data-retention handler imports the helper alongside Prisma + NextResponse", () => {
    const src = readFile("app/api/cron/data-retention/route.ts");
    // Sanity: the import block contains both Prisma and the helper.
    expect(src).toMatch(/from\s*["']@prisma\/client["']/);
    expect(src).toMatch(/dualWriteProjectionForListingId/);
  });

  it("data-retention surfaces projection_failures count in its response", () => {
    // Without this counter, an ops-side regression would be silent.
    const src = readFile("app/api/cron/data-retention/route.ts");
    expect(src).toMatch(/closed_listings_projection_failures/);
  });

  it("feed-reconcile surfaces ghosts_projection_failures count in its response", () => {
    const src = readFile("app/api/cron/feed-reconcile/route.ts");
    expect(src).toMatch(/ghosts_projection_failures/);
  });
});
