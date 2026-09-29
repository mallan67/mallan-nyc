/// <reference types="jest" />
/**
 * H1 Tier-1 dual-write — static source-pattern guards.
 *
 * Closes the projection dual-write contract on 5 non-sync writers.
 * Each writer must (1) import `dualWriteProjectionForListingId` from
 * the canonical projection builder module and (2) call it after its
 * `prisma.listing.create` / `prisma.listing.upsert` site.
 *
 * The helper itself must (1) be exported from
 * `lib/search/listing-search-projection.ts`, (2) call the canonical
 * `buildListingSearchProjectionFromListing` + `buildProjectionUpsertPayload`
 * builders, and (3) carry the H1 attribution comment so future
 * contributors can trace the contract back to this fix.
 *
 * These tests are fast (file reads + regex), run on every push, and
 * would have caught the H1 regression at audit time.
 */

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const HELPER_FILE = path.join(REPO_ROOT, "lib", "search", "listing-search-projection.ts");

const WIRED_WRITERS: { label: string; rel: string }[] = [
  { label: "crm/convert", rel: "app/api/crm/convert/route.ts" },
  { label: "cron/feed-reconcile", rel: "app/api/cron/feed-reconcile/route.ts" },
  { label: "idx/ensure-listing", rel: "app/api/idx/ensure-listing/route.ts" },
  { label: "scripts/import-closed-from-trestle", rel: "scripts/import-closed-from-trestle.ts" },
];

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

describe("H1 Tier-1 — projection helper exists and uses the canonical builder", () => {
  let src: string;
  beforeAll(() => {
    src = fs.readFileSync(HELPER_FILE, "utf8");
  });

  it("exports dualWriteProjectionForListingId", () => {
    expect(src).toMatch(/export\s+async\s+function\s+dualWriteProjectionForListingId/);
  });

  it("calls the canonical projection builder (buildListingSearchProjectionFromListing)", () => {
    // Helper body must invoke the same builder that ops:projection-backfill uses.
    expect(src).toMatch(/buildListingSearchProjectionFromListing\s*\(/);
  });

  it("calls the canonical upsert payload builder (buildProjectionUpsertPayload)", () => {
    expect(src).toMatch(/buildProjectionUpsertPayload\s*\(/);
  });

  it("upserts via prisma.listingSearchProjection.upsert (no INSERT, no manual SQL)", () => {
    expect(src).toMatch(/prisma\.listingSearchProjection\.upsert\s*\(/);
    // Defensive: no raw INSERT SQL
    expect(src).not.toMatch(/INSERT\s+INTO\s+listing_search_projection/i);
  });

  it("reads the listing first via findUnique on listing_id (idempotent / source-of-truth)", () => {
    expect(src).toMatch(/prisma\.listing\.findUnique\s*\(/);
    expect(src).toMatch(/where:\s*\{\s*listing_id:\s*listingId\s*\}/);
  });

  it("silently no-ops if the listing was deleted between the caller's write and this call", () => {
    // The pattern: const listing = ...; if (!listing) return;
    expect(src).toMatch(/if\s*\(\s*!listing\s*\)\s*return\s*;/);
  });

  it("does NOT swallow errors — propagates via await chain (no try/catch wrapping the upsert)", () => {
    // The helper itself must not catch; callers decide whether projection
    // failure should block the parent operation.
    const helperMatch = src.match(/export\s+async\s+function\s+dualWriteProjectionForListingId[\s\S]*?^}/m);
    expect(helperMatch).not.toBeNull();
    const body = helperMatch![0];
    // Guard: no try/catch inside the helper body itself
    expect(body).not.toMatch(/try\s*\{[\s\S]*?catch/);
  });

  it("carries the H1 Tier-1 attribution comment for traceability", () => {
    expect(src).toMatch(/H1 Tier-1/);
    expect(src).toMatch(/non-sync writers/);
  });
});

describe.each(WIRED_WRITERS)("H1 Tier-1 — $label imports + calls the helper", ({ rel }) => {
  let src: string;
  beforeAll(() => {
    src = readFile(rel);
  });

  it("imports dualWriteProjectionForListingId from @/lib/search/listing-search-projection", () => {
    // Two import shapes to tolerate: app/api routes use "@/lib/..."; the
    // standalone script uses a relative path from scripts/.
    expect(src).toMatch(
      /import\s*\{\s*dualWriteProjectionForListingId\s*\}\s*from\s*["'](?:@\/lib\/search\/listing-search-projection|\.\.\/lib\/search\/listing-search-projection)["']/
    );
  });

  it("calls dualWriteProjectionForListingId at least once", () => {
    expect(src).toMatch(/dualWriteProjectionForListingId\s*\(/);
  });

  it("wraps the call in try/catch so projection failure is non-fatal", () => {
    // Each caller wraps with try/catch around the helper. The pattern
    // anchors on dualWriteProjectionForListingId( appearing inside a
    // try block. Use a relaxed multiline match to tolerate whitespace
    // and intervening lines.
    expect(src).toMatch(
      /try\s*\{[\s\S]*?dualWriteProjectionForListingId\s*\([\s\S]*?\}\s*catch/
    );
  });

  it("references H1 Tier-1 attribution comment near the call site", () => {
    expect(src).toMatch(/H1 Tier-1/);
  });

  it("does NOT bypass the helper with a manual prisma.listingSearchProjection write", () => {
    // The original H1 finding was that these files had ZERO references
    // to listingSearchProjection. The fix introduces the helper — direct
    // listingSearchProjection writes outside the helper would defeat
    // the canonical-builder contract.
    expect(src).not.toMatch(/prisma\.listingSearchProjection\.(create|upsert|update|insert)/);
  });
});
