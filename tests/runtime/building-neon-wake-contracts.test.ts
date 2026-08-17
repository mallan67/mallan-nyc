/**
 * Building-Neon-wake source contracts (building-only PR, 2026-07-23).
 *
 *   1. /api/buildings is a THIN pure-read shell — no prisma, no Trestle, no
 *      writes; ALL assembly lives in the shared cached module.
 *   2. The building page + generateMetadata consume the SAME accessor
 *      directly — the page→internal-HTTP hop is gone.
 *   3. The shared module performs ZERO Prisma writes; the dormant
 *      fire-and-forget building upsert is gone from every app path.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("thin pure-read building route + direct page accessor", () => {
  it("the API route contains no prisma, no Trestle, no upsert — only the shared accessor", () => {
    const route = read("app/api/buildings/route.ts");
    expect(route).toContain("getBuildingDataCached");
    expect(route).not.toMatch(/\bprisma\b/);
    expect(route).not.toContain("upsertBuildingFromRecords(");
    expect(route).not.toMatch(/from '@\/lib\/buildings\/upsert'/);
    expect(route).not.toContain("TRESTLE_URL");
  });

  it("the building page uses the accessor directly — no internal /api/buildings fetch", () => {
    const page = read("app/buildings/[slug]/page.tsx");
    expect(page).toContain("getBuildingDataCached");
    expect(page).not.toMatch(/fetch\(\s*[`'"][^`'"]*\/api\/buildings/);
  });

  it("the shared module performs ZERO Prisma writes and no fire-and-forget prisma promises", () => {
    const lib = read("lib/buildings/public-building-data.ts");
    expect(lib).not.toMatch(/prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\b/);
    expect(lib).not.toContain("upsertBuildingFromRecords(");
    expect(lib).not.toMatch(/prisma\.[^\n]*\.catch\(\(\)\s*=>/);
  });

  it("upsertBuildingFromRecords is not called from ANY app route or page (sync-workflow ownership only)", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && read(rel).includes("upsertBuildingFromRecords(")) {
          offenders.push(rel);
        }
      }
    };
    walk("app");
    expect(offenders).toEqual([]);
  });

  it("the scheduled sync performs NO manifest warm and NO persistence probe", () => {
    // TASK 2 (2026-08-16) — CONTRACT REVERSED. This assertion used to require
    // the warm and the canary to be wired INTO the scheduled sync. Both are now
    // removed: they were Neon reads taken on the cron's behalf, and the warm
    // re-read exactly the shard pages the same request had just invalidated.
    //
    // Kept as a source-level guard, deliberately, because this is an
    // ABSENCE contract. The behavioural proof that the scheduled path no longer
    // warms or probes lives in sync-change-attribution-behavior.test.ts, which
    // mocks both functions and asserts they are never invoked. This test exists
    // to stop the call sites being reintroduced textually — including via the
    // all-shard default form, which was the original regression risk.
    const sync = read("lib/idx/sync.ts");
    expect(sync).not.toContain("await warmBuildingManifestShards(");
    expect(sync).not.toContain("warmBuildingManifestShards()");
    expect(sync).not.toContain("await probeManifestPersistence(");
    expect(sync).not.toContain("probeManifestPersistence()");
  });

  it("keeps the affected-shard attribution that drives invalidation", () => {
    // Removing the warm must NOT remove the shard attribution: it is what
    // decides which manifest tags get invalidated, and therefore what the next
    // real reader refills. Losing this would leave stale building pages.
    const sync = read("lib/idx/sync.ts");
    expect(sync).toContain("affectedManifestShards");
    expect(sync).toContain("sortedAffectedShards");
  });
});

// ─── Writer invalidation contract (Maya directive, PR #556 round 2) ────────
// EVERY writer that can change building-visible inventory must revalidate
// the EXACT building tag(s) — including BOTH buildings on an address change.
// Behavioral A→B + unchanged-zero proofs live in the W1 revalidation suite;
// cache-level eviction semantics in neon-quiet-distinct-buildings.

describe("writer invalidation contract — every building-visible writer names its buildings", () => {
  /**
   * UPDATED 2026-08-07 (commit 7B-2A). This previously counted literal
   * `buildingInvalidationTags(existing?.address, mapped.address)` occurrences
   * inside sync.ts — i.e. it pinned the IMPLEMENTATION SHAPE, three inlined
   * copies of the same logic.
   *
   * Those three copies had already drifted: the full-sync/agent-history copy
   * expired shard tags but never recorded them in `affectedManifestShards`, so
   * shards were invalidated and then never warmed. Counting copies could not
   * detect that; only reading all three could.
   *
   * The computation now lives in ONE owner
   * (lib/cache/public-listing-change-tags.ts) and every site delegates via
   * `recordPublicListingChange`. The INVARIANT is unchanged and now stronger:
   * every building-visible writer names BOTH buildings on an address change.
   */
  it("idx-sync + agent-history sync: OLD + NEW building tags at all mapped sites", () => {
    const sync = read("lib/idx/sync.ts");
    // Every delegating site passes an OLD address and a NEW address.
    const listingUpsert = (sync.match(/existing\?\.address,[\s\S]{0,40}?mapped\.address,/g) || []).length;
    const clockPath = (sync.match(/existingForClock\?\.address,[\s\S]{0,40}?mapped\.address,/g) || []).length;
    expect(listingUpsert).toBe(2); // listing upsert + projection (incremental path)
    expect(clockPath).toBe(1); // full-sync/agent-history path
    // ...and no site re-inlines the computation.
    expect(sync).not.toMatch(/buildingInvalidationTags\(/);
  });

  it("the shared owner expires BOTH buildings on an address transition", () => {
    const owner = read("lib/cache/public-listing-change-tags.ts");
    expect(owner).toMatch(/buildingInvalidationTags\(previousAddress, nextAddress\)/);
    expect(owner).toMatch(/for \(const addr of \[previousAddress, nextAddress\]\)/);
  });

  it("listing-expiration: expired exclusive drops from its building in the same cycle", () => {
    const src = read("app/api/cron/listing-expiration/route.ts");
    expect(src).toContain("...buildingAndManifestInvalidationTags(listing.address)");
  });

  it("feed-reconcile: ghost withdrawal AND orphan recovery both invalidate the building", () => {
    const src = read("app/api/cron/feed-reconcile/route.ts");
    expect(src).toContain("...buildingAndManifestInvalidationTags(g.address)");
    expect(src).toContain("...buildingAndManifestInvalidationTags(raw)"); // full Trestle record — atoms top-level
    expect(src).toContain("address: true, // Building-Neon-wake"); // ghosts select carries the address
  });

  it("data-retention display removal: every stale-closed listing invalidates its building", () => {
    const src = read("app/api/cron/data-retention/route.ts");
    expect(src).toContain("...buildingAndManifestInvalidationTags(...staleClosedListings.map((l) => l.address))");
    expect(src).toContain("select: { id: true, listing_id: true, status: true, status_changed_at: true, address: true }");
  });

  it("CRM writers: PATCH (old+new address), soft-withdraw DELETE, and status change all invalidate", () => {
    const patch = read("app/api/crm/listings/[id]/route.ts");
    expect(patch).toContain("...buildingAndManifestInvalidationTags(existingAddress, updated.address)");
    expect(patch).toContain("...buildingAndManifestInvalidationTags(listing.address)"); // DELETE soft-withdraw
    const status = read("app/api/crm/listings/[id]/status/route.ts");
    expect(status).toContain("...buildingAndManifestInvalidationTags(listing.address)");
  });

  it("PROVEN N/A: dom-reset writes only building-invisible fields (days_on_market, first_active_date)", () => {
    const src = read("app/api/cron/dom-reset/route.ts");
    // its ONLY listing write is the DOM/clock reset — building-invisible fields
    const dataBlocks = [...src.matchAll(/data:\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
    const listingWrite = dataBlocks.find((d) => d.includes("days_on_market"));
    expect(listingWrite).toBeDefined();
    expect(listingWrite).toContain("first_active_date: null");
    expect(listingWrite).not.toContain("list_price");
    expect(listingWrite).not.toContain("status");
    expect(listingWrite).not.toContain("idx_display_yn");
  });

  it("helper semantics: dedupe, null-safe insert, masked addresses contribute nothing", () => {
    const { buildingInvalidationTags, buildingCacheTag } = require("@/lib/cache/public-cache");
    const a = { StreetNumber: "400", StreetName: "East 90th Street", PostalCode: "10128" };
    const b = { StreetNumber: "155", StreetName: "West 68th Street", PostalCode: "10023" };
    // A → B: both tags, exactly once each
    expect(buildingInvalidationTags(a, b).sort()).toEqual(
      [buildingCacheTag("400", "East 90th Street", "10128"), buildingCacheTag("155", "West 68th Street", "10023")].sort(),
    );
    // unchanged address collapses to ONE tag
    expect(buildingInvalidationTags(a, { ...a })).toHaveLength(1);
    // insert (no previous row) is null-safe
    expect(buildingInvalidationTags(undefined, b)).toHaveLength(1);
    // masked address contributes nothing
    expect(buildingInvalidationTags({ StreetNumber: "", StreetName: "Address Undisclosed" }, undefined)).toHaveLength(0);
  });
});

// ─── Writers found MISSING invalidation (review finding, 2026-08-16) ───────
// A cache-invalidation census turned these up: each mutates publicly-visible
// listing state and emitted NO cache tag at all. Every one was confirmed by
// reading the route, not by trusting the census — the census itself was
// refuted on completeness, so nothing in it was taken on faith.
//
// These are DEFECTS in their own right: they leave the public surface stale
// for up to the 600s cachedPublicRead TTL today. They are also the reason no
// cache could be converted to revalidate:false — a tag that is never emitted
// can never expire an entry that has no TTL.
describe("writer invalidation contract — the gaps found by the census", () => {
  it("NEGATIVE — crm/convert creates a Draft, so it must NOT invalidate", () => {
    // CORRECTED (review round 3). This assertion previously REQUIRED an
    // invalidation, reasoning that `!TERMINAL_STATUSES.has(status)` meant the
    // row was publicly displayable. That is not public RESULT MEMBERSHIP: the
    // route hardcodes `Draft`, which the canonical active-display set excludes,
    // so the row cannot appear in any cached public collection and expiring
    // them would be pure churn. Full reasoning + the escalated detail-page gap
    // live in draft-publication-boundary.test.ts.
    const src = read("app/api/crm/convert/route.ts");
    expect(src).toContain('normalizeStandardStatus("Draft")');
    expect(src).not.toContain("safeRevalidateTags");
  });

  it("idx/ensure-listing invalidates ONLY when the created row is publicly a member", () => {
    const src = read("app/api/idx/ensure-listing/route.ts");
    // Gated on the canonical helper rather than on non-terminality, so it
    // cannot drift from the predicates the public readers use.
    expect(src).toContain("isActiveDisplayStatus(canonicalStatus)");
    expect(src).toContain("safeRevalidateTags");
    expect(src).toContain("buildingAndManifestInvalidationTags");
    expect(src).toContain("SEARCH_CACHE_TAG");
  });

  it("NEGATIVE — cron/dom-reset must NOT invalidate: its rows cannot be in the cached result", () => {
    // REVIEW FINDING (round 3), and a correction to this file's own previous
    // assertion, which REQUIRED an invalidation here.
    //
    // The earlier reasoning was that `days_on_market` and `first_active_date`
    // appear in the cached api-market-active SELECT. That is the wrong test:
    // membership in the SELECT list does not make a row part of the RESULT.
    // What matters is the WHERE predicate.
    //
    // dom-reset mutates only Withdrawn/Cancelled rows; the cached active read
    // admits only Active/ComingSoon/ActiveUnderContract. The sets are DISJOINT,
    // so no row dom-reset touches can appear in that cached result, and
    // invalidating it would evict a still-correct entry and force an avoidable
    // Neon refill — the exact opposite of this branch's purpose.
    const domReset = read("app/api/cron/dom-reset/route.ts");
    const market = read("app/api/market/route.ts");

    // Pin the disjointness the argument rests on, so this test fails if either
    // predicate ever widens and the conclusion stops holding.
    expect(domReset).toContain('status: { in: ["Withdrawn", "Cancelled"] }');
    expect(market).toContain("status: { in: ['Active', 'ComingSoon', 'ActiveUnderContract'] }");

    // Therefore: no public cache invalidation from this cron.
    expect(domReset).not.toContain("safeRevalidateTags");
    expect(domReset).not.toContain("SEARCH_CACHE_TAG");
  });
});
