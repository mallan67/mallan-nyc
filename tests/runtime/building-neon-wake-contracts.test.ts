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

  it("warm clustering is wired: sync warms the manifest ONLY on a fully successful run, after the SyncState upsert", () => {
    const sync = read("lib/idx/sync.ts");
    const warmIdx = sync.indexOf("warmBuildingManifestShards()");
    const upsertIdx = sync.indexOf("prisma.syncState.upsert");
    expect(warmIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(-1);
    expect(warmIdx).toBeGreaterThan(upsertIdx); // after feed state is committed
    const guardIdx = sync.lastIndexOf("if (errors === 0)", warmIdx);
    expect(guardIdx).toBeGreaterThan(upsertIdx); // guarded on full success
  });
});

// ─── Writer invalidation contract (Maya directive, PR #556 round 2) ────────
// EVERY writer that can change building-visible inventory must revalidate
// the EXACT building tag(s) — including BOTH buildings on an address change.
// Behavioral A→B + unchanged-zero proofs live in the W1 revalidation suite;
// cache-level eviction semantics in neon-quiet-distinct-buildings.

describe("writer invalidation contract — every building-visible writer names its buildings", () => {
  it("idx-sync + agent-history sync: OLD + NEW building tags at all three mapped sites", () => {
    const sync = read("lib/idx/sync.ts");
    const calls = sync.split("buildingInvalidationTags(existing?.address, mapped.address)").length - 1;
    const clockCalls = sync.split("buildingInvalidationTags(existingForClock?.address, mapped.address)").length - 1;
    expect(calls).toBe(2); // listing upsert + projection (incremental path)
    expect(clockCalls).toBe(1); // full-sync/agent-history path
  });

  it("listing-expiration: expired exclusive drops from its building in the same cycle", () => {
    const src = read("app/api/cron/listing-expiration/route.ts");
    expect(src).toContain("...buildingInvalidationTags(listing.address)");
  });

  it("feed-reconcile: ghost withdrawal AND orphan recovery both invalidate the building", () => {
    const src = read("app/api/cron/feed-reconcile/route.ts");
    expect(src).toContain("...buildingInvalidationTags(g.address)");
    expect(src).toContain("...buildingInvalidationTags(raw)"); // full Trestle record — atoms top-level
    expect(src).toContain("address: true, // Building-Neon-wake"); // ghosts select carries the address
  });

  it("data-retention display removal: every stale-closed listing invalidates its building", () => {
    const src = read("app/api/cron/data-retention/route.ts");
    expect(src).toContain("...buildingInvalidationTags(...staleClosedListings.map((l) => l.address))");
    expect(src).toContain("select: { id: true, listing_id: true, status: true, status_changed_at: true, address: true }");
  });

  it("CRM writers: PATCH (old+new address), soft-withdraw DELETE, and status change all invalidate", () => {
    const patch = read("app/api/crm/listings/[id]/route.ts");
    expect(patch).toContain("...buildingInvalidationTags(existingAddress, updated.address)");
    expect(patch).toContain("...buildingInvalidationTags(listing.address)"); // DELETE soft-withdraw
    const status = read("app/api/crm/listings/[id]/status/route.ts");
    expect(status).toContain("...buildingInvalidationTags(listing.address)");
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
