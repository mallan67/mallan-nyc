# Unified Feed→DB→R2 Media/Property System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the feed→DB→R2 media/Property pipeline as ONE coherent system that stops write-churn, ends R2 collisions/missing photos, never mass-deletes on empty responses, never skips feed records, preserves all seller media, and continuously proves itself — delivered on one branch → one PR + a gated activation runbook.

**Architecture:** A shared **media-identity spine** (`MediaKey + ResourceName + ResourceRecordKey + sourceRevision`) drives a collision-proof versioned R2 key, an identity comparator (URL excluded), one strict classifier, and one hero resolver. A **sync coordinator** owns advisory locks, oldest-first lossless cursors, and a fail-closed reconciliation state machine. A permanent **`media:system-health`** monitor validates the whole pipeline's invariants in production.

**Tech Stack:** Next.js 16 / TypeScript, Prisma + Neon Postgres (pooled `DATABASE_URL`, unpooled `DATABASE_URL_UNPOOLED`), Cloudflare R2, Cotality/Trestle OData (`https://api.cotality.com/trestle`), Jest (projects: `runtime` in `tests/runtime`, `scripts`, plus `lib`/`app` default), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-21-unified-feed-media-system-design.md` (Phase 0, live-verified @ `f239b9dd`). **Base:** branch `agent/unified-feed-media-system` @ `f239b9dd` (= main `51b831dd` + Phase 0 docs).

## Global Constraints (every task's requirements implicitly include these)

- **Cotality truth = the LIVE authenticated API only.** Never conclude Cotality behavior from `artifacts/metadata.xml`, code, comments, or docs. Any new Cotality-dependent assumption requires a live read-only probe (the untracked `scripts/__live-cotality-contract-probe.mts` pattern) before it is relied on. Unresolved live items (A.4: `Order` null/dup at scale, `Permission` non-null shape + Public-vs-IDX policy, aged-URL fetchability, empty-200-for-populated, long-horizon rotation, large-gallery pagination) stay **fail-closed** and never block safe work.
- **Live-proven facts to honor (probe 2026-07-21T06:22Z):** `MediaURL` rotates at origin+pathname on EVERY request → exclude it from all change comparison; `MediaKey` is the Media PK; `ListingKey` is the Property PK; `Order` is nullable; `PreferredPhotoYN` was null on every sampled row (treat null = not-preferred); plain enum-literal `$filter ResourceName eq 'Property'` and multi-key `$orderby Order asc,MediaKey asc` both return 200; `PhotosCount` is populated.
- **Binding delivery rule (spec §0), per task:** Fix → targeted tests → full build/check → one system health check → unified PR → production verification.
- **Full build/check** = `npm run type-check` (0) · FULL `npx jest` (all projects green; pre-existing `signup-coldstart` timing flake tolerated only if it passes in isolation) · `npm run rls:validate` (UNKNOWN 0) · `npm run ucba:audit` (REGRESSIONS 0) · `npm run compliance-check` (93/0 BLOCKER+STRICT) · `npm run idx:validate` (no NEW critical) · `npm run crm:test` when CRM touched · production build via CI pr-check.
- **TDD:** failing test first for every behavior change; then minimal code; then green; then commit.
- **Worktree:** `p-unified-wt` on `agent/unified-feed-media-system`, `node_modules` intended to be symlinked to the primary checkout. Production build runs in the primary checkout at the branch HEAD (Turbopack rejects the symlinked worktree).
- **Environment-only note (2026-07-21, not an app defect):** the worktree's `node_modules` is currently a real directory (not the symlink), and a stray nested `node_modules/node_modules/` duplicate was removed. Version parity with the primary is verified IDENTICAL (byte-identical `package-lock.json`, matching typescript/jest/next/prisma/react), so tests are trustworthy — left as-is per "no unnecessary reinstall." Windows MAX_PATH `--ignored` warnings are resolved by `git config core.longpaths true`; they stem from the long temp-worktree path over legitimately-nested transitive deps, NOT from dependency corruption. Never treat these paths as application defects; do not flatten valid nested deps or change versions.
- **Non-negotiable acceptance invariants (each MUST have a failing-first test; carry through Phase 2 Task 10 + Phase 6):** (1) **Feed-provenance carve-out** — the reconciler's authority is the live Cotality feed; it governs ONLY media it sourced from that feed. Media NOT sourced from the Cotality feed (locally-uploaded / non-feed rows, currently marked by a non-feed key prefix) is out of scope and is NEVER tombstoned by feed absence; (2) **all-status detail distinction** — the reconciler/readers preserve the "never-imported vs all-deleted" signal (detail reads ALL statuses; `_count` existence retained); (3) **floor-plan hero protection** — a FloorPlan/Document is never selected as hero on any surface (strict classifier + `selectHero` Photo-only).
- **HOLDS — STOP for explicit Maya approval (never auto-run):** applying any migration to prod, cron cadence change, `NEON_PROJECT_ID`/env change, R2 object deletion, JSON strip, CRM-frontend (`public/crm/**`) deploy, `.github/workflows/**`. Prepared code for these lands in the PR; execution is the gated activation runbook.
- **No behavior change on merge:** new modules + refactors behave identically until migrations/flags/cadence activate. Legacy R2 keys keep serving until the gated lifecycle migrates them.
- **Commits:** end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` + `Claude-Session: …`. Never `--no-verify`.

---

## File Structure

**New (each one focused, independently testable):**
- `lib/media/media-classifier.ts` — THE strict classifier + canonical type enum.
- `lib/media/media-identity.ts` — identity, `sourceRevision`, versioned R2 key, identity comparator.
- `lib/media/hero-resolver.ts` — THE hero rule (consumed everywhere).
- `lib/sync/coordinator.ts` — advisory locks + run lease + shared run context.
- `lib/sync/property-cursor.ts` — oldest-first keyset Property cursor.
- `lib/sync/gallery-reconcile.ts` — fail-closed reconciliation state machine.
- `lib/ops/media-system-health.ts` + `scripts/media-system-health.ts` — invariant monitor.
- `lib/ops/r2-lifecycle.ts` — inventories, manifests, ledger (dry-run).
- `prisma/migrations/<ts>_unified_media_identity/migration.sql` — PREPARED, unapplied.
- Tests under `tests/runtime/` (Jest `runtime` project) and Playwright under `tests/e2e/`.

**Modified (consume the spine, not fork it):** `lib/idx/media-sync.ts`, `lib/idx/sync.ts`, `lib/media/media-sync-service.ts` (classifier/key delegate to new modules), `lib/media/listing-media-resolver.ts` (hero delegates), `app/api/listings/route.ts`, `app/api/listings/similar/route.ts`, `app/api/media/proxy/route.ts` (allowlist), `app/api/media/batch/route.ts`, `app/api/cron/media-sync/route.ts` + `idx-sync/route.ts`, `lib/geo/geocode.ts` (drop 2nd client), delete `lib/db.ts`, `vercel.json` (maxDuration; cadence prepared-gated), `package.json` (scripts).

---

## PHASE 1 — Media-identity spine

### Task 1: Strict media classifier

**Files:**
- Create: `lib/media/media-classifier.ts`
- Test: `tests/runtime/media-classifier.test.ts`

**Interfaces:**
- Produces: `type CanonicalMediaType = "Photo"|"FloorPlan"|"Video"|"VirtualTour"|"Document"|"Unknown"`; `classifyMedia(input: { mediaCategory?: string|null; mediaType?: string|null; mediaUrl?: string|null }): CanonicalMediaType`.

- [ ] **Step 1: Write the failing test** — cover the live-verified 18 `MediaCategory` members + URL-shape fallback + never-default-to-Photo.

```typescript
import { classifyMedia } from "@/lib/media/media-classifier";
describe("classifyMedia — strict, never defaults to Photo", () => {
  it("maps each Cotality MediaCategory to a canonical type", () => {
    expect(classifyMedia({ mediaCategory: "Photo" })).toBe("Photo");
    expect(classifyMedia({ mediaCategory: "FloorPlan" })).toBe("FloorPlan");
    expect(classifyMedia({ mediaCategory: "Video" })).toBe("Video");
    expect(classifyMedia({ mediaCategory: "AerialView" })).toBe("Video");
    expect(classifyMedia({ mediaCategory: "BrandedVirtualTour" })).toBe("VirtualTour");
    expect(classifyMedia({ mediaCategory: "UnbrandedVirtualTour" })).toBe("VirtualTour");
    for (const doc of ["Document","Disclosure","Map","Survey","Addendum","RentalDocuments","Restriction","Topography"])
      expect(classifyMedia({ mediaCategory: doc })).toBe("Document");
    for (const other of ["AgentPhoto","OfficePhoto","OfficeLogo","Other"])
      expect(classifyMedia({ mediaCategory: other })).toBe("Unknown");
  });
  it("NEVER defaults an unrecognized/absent category to Photo", () => {
    expect(classifyMedia({ mediaCategory: "SomethingNew" })).toBe("Unknown");
    expect(classifyMedia({ mediaCategory: null })).toBe("Unknown");
    expect(classifyMedia({})).toBe("Unknown");
  });
  it("uses MediaType only when category absent (raster image → Photo)", () => {
    expect(classifyMedia({ mediaCategory: null, mediaType: "Jpeg" })).toBe("Photo");
    expect(classifyMedia({ mediaCategory: null, mediaType: "Png" })).toBe("Photo");
    expect(classifyMedia({ mediaCategory: null, mediaType: "Pdf" })).toBe("Document");
    expect(classifyMedia({ mediaCategory: null, mediaType: "weird" })).toBe("Unknown");
  });
  it("URL-shape fallback catches a null-category floor plan/document", () => {
    expect(classifyMedia({ mediaCategory: null, mediaType: null, mediaUrl: "https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/1/1/x" })).toBe("Document");
    expect(classifyMedia({ mediaCategory: null, mediaUrl: "https://x/floorplan/a.pdf" })).toBe("Document");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx jest tests/runtime/media-classifier.test.ts` → FAIL (module not found).
- [ ] **Step 3: Write minimal implementation** — explicit allowlists (categories from the live-verified 18-member enum; `AerialView`→Video; branded/unbranded tours→VirtualTour; the 8 document-ish categories→Document; `AgentPhoto/OfficePhoto/OfficeLogo/Other`→Unknown; raster `MediaType`→Photo when category absent; URL-shape `DOCUMENT-`/`FLOORPLAN`/`.pdf`→Document). No branch returns Photo by default.
- [ ] **Step 4: Run test to verify it passes.**
- [ ] **Step 5: Commit** — `feat(media): strict media classifier (never defaults to Photo) [unified P1]`.

### Task 2: Media identity + sourceRevision + versioned R2 key

**Files:**
- Create: `lib/media/media-identity.ts`
- Test: `tests/runtime/media-identity.test.ts`

**Interfaces:**
- Consumes: `CanonicalMediaType`, `classifyMedia`.
- Produces: `interface MediaIdentity { resourceName: string; resourceRecordKey: string; mediaKey: string; sourceRevision: number }`; `deriveSourceRevision(row): number` (epoch-ms of max(MediaModificationTimestamp, ModificationTimestamp); 0 if both null); `buildVersionedR2Key(listingId, canonicalType, mediaKey, sourceRevision, ext?): string`; `mediaRowUnchanged(existing, incoming): boolean` (identity comparator — **URL fully excluded**).

- [ ] **Step 1: Write the failing test** — collision-proofing under null/dup order, reorder, concurrency; URL-rotation-stable; revision bump = new key.

```typescript
import { buildVersionedR2Key, deriveSourceRevision, mediaRowUnchanged } from "@/lib/media/media-identity";
describe("versioned R2 key — collision-proof", () => {
  it("two distinct MediaKeys never collide even at same order", () => {
    const a = buildVersionedR2Key("RLS1","Photo","MK-A",111,"jpg");
    const b = buildVersionedR2Key("RLS1","Photo","MK-B",111,"jpg");
    expect(a).not.toBe(b);
  });
  it("null/duplicate Order is irrelevant (order not in key)", () => {
    // same media, no order concept in the key at all
    expect(buildVersionedR2Key("RLS1","Photo","MK-A",111,"jpg")).toBe("photos/RLS1/MK-A/111.jpg");
  });
  it("a revision bump mints a NEW key (no overwrite of a referenced object)", () => {
    expect(buildVersionedR2Key("RLS1","Photo","MK-A",111)).not.toBe(buildVersionedR2Key("RLS1","Photo","MK-A",222));
  });
  it("unsafe MediaKey is deterministically hashed, safe passes through", () => {
    expect(buildVersionedR2Key("RLS1","Photo","MK_ok-1",5,"jpg")).toBe("photos/RLS1/MK_ok-1/5.jpg");
    const weird = buildVersionedR2Key("RLS1","Photo","a/b c?d",5,"jpg");
    expect(weird).toMatch(/^photos\/RLS1\/[a-f0-9]{20}\/5\.jpg$/);
  });
});
describe("deriveSourceRevision", () => {
  it("uses max of the two source timestamps, 0 when both null", () => {
    expect(deriveSourceRevision({ MediaModificationTimestamp: "2026-07-21T03:21:29.523-00:00", ModificationTimestamp: null })).toBe(Date.parse("2026-07-21T03:21:29.523Z"));
    expect(deriveSourceRevision({ MediaModificationTimestamp: null, ModificationTimestamp: null })).toBe(0);
  });
});
describe("mediaRowUnchanged — URL excluded (live: URL rotates every fetch)", () => {
  const base = { listing_id:"RLS1", resource_record_key:"LK1", resource_record_id:"RLS1", media_key:"MK-A", source_revision:111, media_category:"Photo", media_classification:null, media_type:"Photo", order:1, preferred_photo_yn:false, status:"active" };
  it("identical except a rotated URL → UNCHANGED (no write)", () => {
    expect(mediaRowUnchanged(base, { ...base, media_url_original:"https://x/rotated" })).toBe(true);
  });
  it("a real change (revision, order, category, status, listing) → changed", () => {
    for (const patch of [{source_revision:222},{order:2},{media_category:"FloorPlan"},{media_type:"FloorPlan"},{status:"deleted"},{listing_id:"RLS2"},{preferred_photo_yn:true}])
      expect(mediaRowUnchanged(base, { ...base, ...patch })).toBe(false);
  });
  it("a deleted/replaced row reappearing identically is NOT unchanged (must restore active)", () => {
    expect(mediaRowUnchanged({ ...base, status:"deleted" }, base)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Write minimal implementation** — key = `${folder}/${listingId}/${mediaKeySafe}/${sourceRevision}.${ext}`; `mediaKeySafe` = passes `^[A-Za-z0-9_-]{1,64}$` else `sha1(mediaKey).slice(0,20)`; folder from `classifyMedia`; comparator compares only identity/classification/order/preferred/status/listing linkage, **never any URL field**; unchanged requires `status==='active'` on the existing row.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `feat(media): identity + versioned R2 key + URL-excluded comparator [unified P1]`.

### Task 3: Single hero resolver

**Files:**
- Create: `lib/media/hero-resolver.ts`
- Test: `tests/runtime/hero-resolver.test.ts`

**Interfaces:**
- Consumes: `CanonicalMediaType`, `classifyMedia`.
- Produces: `interface HeroCandidate { mediaKey:string; canonicalType:CanonicalMediaType; order:number|null; preferredPhotoYN:boolean|null }`; `selectHero(candidates): HeroCandidate|null`; `sortGallery(candidates): HeroCandidate[]`.

- [ ] **Step 1: Write the failing test** — `active Photo → PreferredPhotoYN → lowest valid Order → stable MediaKey`; null-preferred handled; non-photo never hero.

```typescript
import { selectHero } from "@/lib/media/hero-resolver";
const c = (o: Partial<any>) => ({ mediaKey:"MK", canonicalType:"Photo", order:1, preferredPhotoYN:null, ...o });
describe("selectHero", () => {
  it("PreferredPhotoYN=true wins over lower order", () => {
    expect(selectHero([c({mediaKey:"A",order:1,preferredPhotoYN:false}),c({mediaKey:"B",order:9,preferredPhotoYN:true})])!.mediaKey).toBe("B");
  });
  it("null preferred = not-preferred → lowest valid Order wins (live: all null)", () => {
    expect(selectHero([c({mediaKey:"A",order:5,preferredPhotoYN:null}),c({mediaKey:"B",order:2,preferredPhotoYN:null})])!.mediaKey).toBe("B");
  });
  it("ties on order break on stable MediaKey; null order sorts last", () => {
    expect(selectHero([c({mediaKey:"Z",order:1}),c({mediaKey:"A",order:1})])!.mediaKey).toBe("A");
    expect(selectHero([c({mediaKey:"A",order:null}),c({mediaKey:"B",order:3})])!.mediaKey).toBe("B");
  });
  it("a FloorPlan/Video/Document/VirtualTour is NEVER hero", () => {
    expect(selectHero([c({mediaKey:"F",canonicalType:"FloorPlan",order:0}),c({mediaKey:"P",canonicalType:"Photo",order:5})])!.mediaKey).toBe("P");
    expect(selectHero([c({canonicalType:"FloorPlan"})])).toBeNull();
  });
});
```

- [ ] **Step 2–4:** fail → implement (`Photo`-only pool; sort preferred(true>false/null) then `order ?? Infinity` then `mediaKey`) → pass.
- [ ] **Step 5: Commit** — `feat(media): single hero resolver [unified P1]`.

### Task 4: Delegate legacy classifier/key to the spine (no behavior change)

**Files:**
- Modify: `lib/media/media-sync-service.ts:112` (classifyTrestleMediaCategory delegates), `:139` (buildMediaR2Key — keep legacy signature but route through spine only where a caller opts in; default path UNCHANGED to preserve merge-safety)
- Test: `tests/runtime/classifier-delegation.test.ts` + existing `media-sync-service.test.ts` stays green.

- [ ] **Step 1: Write the failing test** — a source-scan test asserting there is exactly ONE classifier implementation (legacy delegates), and that `classifyTrestleMediaCategory` now returns `Document`/`Unknown` for the non-photo categories (behavior change is additive: these previously returned Photo, but they were never mirrored as hero — verify no hero/photo-count regression via the resolver).
- [ ] **Step 2–4:** fail → make `classifyTrestleMediaCategory` map `Document`/`Unknown` explicitly (delegating to `classifyMedia`, collapsing `Document`+`Unknown`→a non-photo type the existing `CanonicalMediaType` can represent — extend that union) → keep `buildMediaR2Key` legacy default unchanged; add `buildVersionedR2Key` as the opt-in used by Phase 2+ → run FULL media-sync suites green.
- [ ] **Step 5: Commit** — `refactor(media): legacy classifier delegates to the single strict classifier [unified P1]`.

### Task 5: PREPARED migration (unapplied) — identity columns + partial index

**Files:**
- Create: `prisma/migrations/<ts>_unified_media_identity/migration.sql`
- Modify: `prisma/schema.prisma` (ListingMedia: `source_revision BigInt?`, `r2_object_key String?`, `pending_removal_run String?`)
- Test: `tests/runtime/migration-prepared.test.ts` (source-scan: migration is additive-nullable + `CREATE INDEX CONCURRENTLY`, NOT applied by build).

- [ ] **Step 1: Write the failing test** — assert `schema.prisma` has the 3 new nullable columns; assert the migration SQL is additive (`ADD COLUMN … NULL`) and contains `CREATE INDEX CONCURRENTLY listing_media_r2_backlog_idx … WHERE status='active' …`; assert `package.json` build command does NOT run `migrate deploy`.
- [ ] **Step 2–4:** fail → add columns + write migration SQL (additive; `CONCURRENTLY` index) → `npx prisma validate` + `npx prisma generate` succeed; test green. **DO NOT APPLY** (activation-gated).
- [ ] **Step 5: Commit** — `feat(db): PREPARED unified media-identity migration (additive, unapplied) [unified P1]`.

### Task 6: Phase-1 health section + system-health scaffold

**Files:**
- Create: `lib/ops/media-system-health.ts`, `scripts/media-system-health.ts`; Modify: `package.json` (`"media:system-health": "tsx scripts/media-system-health.ts"`)
- Test: `tests/runtime/media-system-health.test.ts`

**Interfaces:**
- Produces: `runSystemHealth(deps): { checks: Array<{ id:string; status:"green"|"red"|"n/a"; detail:string }>; red: number }` with injected read-only readers (no prod I/O in tests).

- [ ] **Step 1: Write the failing test** — health check with a mock inventory: duplicate active `media_key` → red; two active rows same `r2_object_key` → red; hero-eligibility only Photos → green; clean → 0 red.
- [ ] **Step 2–4:** fail → implement the identity/key invariant sections (others `n/a` until later phases) + a `--json` CLI that never mutates → pass.
- [ ] **Step 5: Commit** — `feat(ops): media:system-health monitor scaffold + identity invariants [unified P1]`.

### Phase 1 gate
- [ ] Full build/check (all green). `npm run media:system-health` runs (against a stub) and prints identity invariants green. Update Task #2 → completed.

---

## PHASE 2 — Lossless pipeline + coordinator

### Task 7: Oldest-first keyset Property cursor (kills newest-500 skip)

**Files:** Create `lib/sync/property-cursor.ts`; Test `tests/runtime/property-cursor.test.ts`.
**Interfaces:** Produces `buildPropertyQuery(cursor: {ts:string|null; key:string|null}, top:number): URLSearchParams` (asc `ModificationTimestamp,ListingKey`; keyset `(MT gt ts) or (MT eq ts and ListingKey gt key)`); `advancePropertyCursor(processed): {ts:string; key:string}|null` (last contiguously-processed only).

- [ ] **Step 1: Failing test** — a >500 backlog processed oldest-first advances only to the last processed record; records 501…N are re-fetched next run (NOT skipped); a mid-batch failure freezes the cursor at its predecessor.
- [ ] **Step 2–4:** fail → implement asc keyset (mirrors the proven media keyset) → pass.
- [ ] **Step 5: Commit** — `feat(sync): oldest-first lossless keyset Property cursor [unified P2]`.

### Task 8: Fail-closed gallery reconciliation state machine

**Files:** Create `lib/sync/gallery-reconcile.ts`; Test `tests/runtime/gallery-reconcile.test.ts`.
**Interfaces:** Produces `reconcileGallery(input: { existing: Row[]; incoming: RawMedia[]|null; fetchComplete: boolean; photosCount: number|null; runId: string }): { insert; updateChanged; skipUnchanged; explicitTombstone; pendingRemoval; confirmedTombstone; failClosed: boolean; reason?: string }` — uses the identity comparator; second-fetch confirmation via `pending_removal_run`; `PhotosCount>0` while empty → fail closed; abrupt shrink (<50%) → fail closed; circuit breaker (>25 rows / >10 listings destructive) → abort+flag.

- [ ] **Step 1: Failing test** — empty-200 with existing photos → `failClosed`, zero tombstones; incomplete pagination → failClosed; explicit `MediaStatus='Deleted'` → tombstone that row always; vanished row seen once → `pendingRemoval` (not tombstoned); seen twice across runs → `confirmedTombstone`; `PhotosCount>0` + empty → failClosed; shrink 20/3 → failClosed; >25 vanished → breaker abort.
- [ ] **Step 2–4:** fail → implement the state machine → pass.
- [ ] **Step 5: Commit** — `feat(sync): fail-closed gallery reconciliation (no empty-response wipes) [unified P2]`.

### Task 9: Advisory locks + coordinator

**Files:** Create `lib/sync/coordinator.ts`; Test `tests/runtime/coordinator.test.ts`.
**Interfaces:** Produces `withSyncLock(name:"property-sync"|"media-sync", fn): Promise<{ ran:boolean; result?:T }>` — `pg_try_advisory_lock` on the UNPOOLED session at start, released in `finally`; not-acquired → clean skip (audit note). Removes the audit-event pseudo-guard.

- [ ] **Step 1: Failing test (mocked pg session):** second concurrent `withSyncLock` gets `ran:false`; the lock is released even when `fn` throws; distinct names don't block each other.
- [ ] **Step 2–4:** fail → implement (injected session for tests) → pass.
- [ ] **Step 5: Commit** — `feat(sync): pg advisory-lock coordinator (replaces audit-event pseudo-guard) [unified P2]`.

### Task 10: Wire Property-scoped Media fetch into media-sync (behavior-preserving until activation)

**Files:** Modify `lib/idx/media-sync.ts` (Media query adds `ResourceName eq 'Property'` + `ResourceName`/`MediaType` in `$select`; upsert uses identity comparator + reconcile state machine + versioned key path behind a default-off flag `UNIFIED_MEDIA_PIPELINE` so merge = no behavior change); Test: existing `media-sync-*` suites stay green + new `tests/runtime/media-sync-unified.test.ts`.

- [ ] **Step 1: Failing test** — with the flag ON (test-injected), a rotated-URL-only re-run performs ZERO writes; an empty-200 performs ZERO tombstones; the Media query string is Property-scoped and selects `MediaType`. **Acceptance invariants: (a) a non-feed-sourced (locally-uploaded) media row is NEVER tombstoned by feed reconciliation even when absent from the Cotality feed — the reconciler governs only feed-sourced rows; (b) the all-status "never-imported vs all-deleted" distinction is preserved (readers still see tombstoned rows' existence via `_count`).**
- [ ] **Step 2–4:** fail → wire the spine behind the flag; **flag default OFF** → all existing suites green (no behavior change on merge).
- [ ] **Step 5: Commit** — `feat(media-sync): unified Property-scoped, identity-suppressed, fail-closed pipeline (flag-gated) [unified P2]`.

### Task 11: LIVE probe checkpoint — scoped query + reconcile assumptions
- [ ] Run the untracked live probe (read-only) to re-confirm at slightly larger sample: Property-scoped `$filter`/`$orderby` 200; scoped==unscoped keysets; `MediaType` populated; capture `@odata.nextLink` on a large gallery if found. Record sanitized evidence addendum. Any divergence → adjust Task 10 before proceeding. **Unresolved A.4 items remain fail-closed.**

### Phase 2 gate
- [ ] Full build/check green · `media:system-health` adds cursor + mass-tombstone (=0) + lock sections green · live probe checkpoint recorded. Update Task #3 → completed.

---

## PHASE 3 — Write-suppression everywhere

### Task 12: listing + projection + summary + batch-media compare-before-write
**Files:** Modify `lib/idx/sync.ts` (listing upsert arm, projection dual-write, batch-media refill), `lib/idx/media-sync.ts` (`updateListingMediaSummary`); Test `tests/runtime/write-suppression.test.ts` + existing suites green.
- [ ] **Step 1: Failing test** — identical second run issues ZERO `update`/`updateMany` on each path (listing, projection, summary, batch-media); every genuine field change writes; JSON compared by stable stringify; bookkeeping fields excluded from compare and not written on skip; `checked = changed + skipped_unchanged` per path.
- [ ] **Step 2–4:** fail → add pure compare predicates per path → pass; FULL suite green.
- [ ] **Step 5: Commit** — `perf(sync): compare-before-write for listing/projection/summary/batch-media [unified P3]`.

### Task 13: Scorers write on content change; seller signals reconciled
**Files:** Modify the scorer libs (`lib/lead-scoring`, `lib/seller-readiness`, `lib/conviction`, `lib/listing-momentum`, `lib/social-proof`, `lib/demand-index`, `lib/buyer-intent`, `lib/agent-performance`, `lib/market-pulse`); Test `tests/runtime/scorer-suppression.test.ts`.
- [ ] **Step 1: Failing test** — a scorer whose computed content is unchanged issues ZERO upsert; a changed score writes; seller `readiness_signals` are diffed (insert/update/remove), never delete-and-recreate.
- [ ] **Step 2–4:** fail → add a shared `writeIfChanged` helper + content-hash compare; replace delete-recreate with reconcile → pass.
- [ ] **Step 5: Commit** — `perf(scoring): write-on-change + seller-signal reconciliation [unified P3]`.

### Phase 3 gate
- [ ] Full build/check green · `media:system-health` suppression section green (ledger `skipped_unchanged>0` on a no-op run) · Update Task #4 → completed.

---

## PHASE 4 — Bounded R2 backlog + retry recovery

### Task 14: One bounded backlog query/run + waves + retry/failure queues + parked-row recovery
**Files:** Modify `lib/idx/media-sync.ts` (Phase-3 loop); Test `tests/runtime/bounded-backlog.test.ts`.
- [ ] **Step 1: Failing test** — `backlog_query_count === 1` per run (mock-count `findMany`); concurrency-5 waves drain the single candidate set; budget exit leaves candidates; up to 10 parked rows re-admitted per run; stable `created_at asc, id asc` order.
- [ ] **Step 2–4:** fail → single fetch of `take=250`, in-memory waves, per-invocation attempted-set, bounded retry + failure + parked-recovery lanes → pass. (Index is the PREPARED migration from Task 5; code assumes it — health check verifies at activation.)
- [ ] **Step 5: Commit** — `perf(media-sync): bounded backlog (1 query/run) + parked-row recovery [unified P4]`.

### Phase 4 gate
- [ ] Full build/check green · health `backlog_query_count=1` + parked-count-bounded sections green · Update Task #5 → completed.

---

## PHASE 5 — R2 lifecycle (dry-run only)

### Task 15: Admission preserves ALL seller media (reject #534 hero-only)
**Files:** Modify `lib/idx/media-sync.ts` (`buildR2BacklogWhere` / admission); Test `tests/runtime/r2-admission.test.ts`.
- [ ] **Step 1: Failing test** — admission matrix: for ALL listings mirror active photos + floor plans + file-backed videos/tours; `Document`/`Unknown` stored-not-mirrored; iframe/URL tours never sent to the uploader; hero-only third-party policy is NOT applied (source-scan asserts no `MAX_FEED_MIRROR_PHOTOS_PER_LISTING=1` gate).
- [ ] **Step 2–4:** fail → implement type-aware admission preserving all seller media → pass.
- [ ] **Step 5: Commit** — `feat(media-sync): R2 admission preserves all seller media (rejects hero-only) [unified P5]`.

### Task 16: Lifecycle inventories + manifests + ledger (dry-run; NO deletion)
**Files:** Create `lib/ops/r2-lifecycle.ts`, `scripts/r2-lifecycle.ts` (dry-run default), `docs/operations/r2-deleted-objects.ledger.jsonl` (empty); Test `tests/runtime/r2-lifecycle.test.ts`.
- [ ] **Step 1: Failing test** — orphan inventory (R2 LIST diff vs DB) + duplicate-identity inventory produce deterministic manifests; deletion is behind a two-key gate + append-only ledger; the module contains NO reachable delete call without the gate (source-scan for `DeleteObject`/`.delete(`).
- [ ] **Step 2–4:** fail → implement dry-run inventories + manifest + ledger writer + gated (unreachable-by-default) deletion planner → pass.
- [ ] **Step 5: Commit** — `feat(ops): R2 lifecycle inventories + dry-run manifests + deleted-object ledger [unified P5]`.

### Phase 5 gate
- [ ] Full build/check green · health R2 growth/orphan/dup sections green (dry-run) · Update Task #6 → completed. **No R2 deletion (activation-gated).**

---

## PHASE 6 — One resolver everywhere + Playwright

### Task 17: Route every surface through the hero resolver + proxy allowlist fix
**Files:** Modify `lib/media/listing-media-resolver.ts` (hero delegates to `hero-resolver.ts`), `app/api/listings/similar/route.ts`, `app/api/listings/route.ts` (Phase-1 override), `app/api/media/batch/route.ts` (emit `isPrimary`), `app/api/media/proxy/route.ts` (add `img.cotality.com` to `ALLOWED_HOSTS`); `public/crm/**` JS change PREPARED (CRM-frontend-gated). Test `tests/runtime/resolver-unification.test.ts`.
- [ ] **Step 1: Failing test** — source-scan: no second hero implementation remains (Similar/`/api/listings` Phase-1 call `selectHero`); `img.cotality.com` is in the proxy allowlist; batch emits `isPrimary`. **Acceptance invariant (behavioral test, not source-scan): a gallery containing a FloorPlan with a lower/absent Order than the photos still resolves a Photo as hero on every surface (floor-plan-never-hero).**
- [ ] **Step 2–4:** fail → delegate + fix allowlist → pass; FULL suite + `crm:test` green.
- [ ] **Step 5: Commit** — `fix(media): single hero resolver on every surface + img.cotality.com proxy allowlist [unified P6]`.

### Task 18: Playwright render proofs (permanent suite)
**Files:** Create `tests/e2e/media-render.spec.ts`, `playwright.config.ts` (if absent); Test via `npx playwright test`.
- [ ] **Step 1: Write the spec** — against the running app (local `next build && next start` or a preview URL): on a real listing detail page the first gallery image is a Photo and renders (no broken image); hero matches `selectHero`; floor-plan and 3D tabs present + populated where the listing has them; on a search card + featured + similar + agent card the primary image is the hero and loads (HTTP 200, non-zero dimensions).
- [ ] **Step 2: Run** — `npx playwright test` → capture screenshots/traces as artifacts.
- [ ] **Step 3: Commit** — `test(e2e): Playwright hero-first + media-present render proofs [unified P6]`.

### Phase 6 gate
- [ ] Full build/check + `crm:test` + Playwright green · health media-integrity (sampled hero is Photo) section green · Update Task #7 → completed. CRM-frontend deploy is gated.

---

## PHASE 7 — System health layer complete

### Task 19: Finalize media:system-health + wire into ops:health + scheduled read-only report
**Files:** Modify `lib/ops/media-system-health.ts` (all §12 invariants enforced), `scripts/ops-health.js` (include it), add a read-only report path; Test `tests/runtime/media-system-health.test.ts` (each red condition fires; clean = 0 red; monitor performs no writes — source-scan).
- [ ] **Step 1–4:** failing tests per red condition → implement all sections (cursor, mass-tombstone, suppression, ledgers, identity, R2 keys, backlog, locks, media integrity, R2 growth, audit growth, config/index-valid) → green.
- [ ] **Step 5: Commit** — `feat(ops): complete media:system-health invariant monitor + ops:health wiring [unified P7]`.

### Phase 7 gate
- [ ] Full build/check green · `media:system-health --json` exercises every section · Update Task #8 → completed.

---

## PHASE 8 — Config cleanup, PR, runbook, proof

### Task 20: In-PR config cleanup
**Files:** Modify `lib/geo/geocode.ts` (use `@/lib/prisma` singleton), delete `lib/db.ts`, `vercel.json` (per-function `maxDuration` blocks matching route budgets: feed-reconcile 300, others 60; **cadence block PREPARED but not changed**), author `prisma/migrations/<ts>_listing_views_formalize/migration.sql` (records the db-push table per NEON.md reconcile). Test `tests/runtime/config-cleanup.test.ts` (no second PrismaClient; `lib/db.ts` gone; maxDuration aligned).
- [ ] **Step 1–5:** failing test → implement → green → commit `chore(config): remove 2nd Prisma client, dead pool, align maxDuration, formalize listing_views [unified P8]`.

### Task 21: Full verification + one PR + runbook + proof package
- [ ] Run the ENTIRE full build/check chain at branch HEAD; run `media:system-health`; run Playwright; capture all outputs.
- [ ] Write `docs/operations/unified-activation-runbook-2026-07-21.md`: ordered, each step Maya-gated + verify-then-proceed — (0) live-Cotality Step-0 probes settle A.4; (1) apply the 2 prepared migrations per NEON.md; (2) observe suppression + health ≥3 natural runs; (3) enable `UNIFIED_MEDIA_PIPELINE`; (4) flip cadence :00/:05; (5) retarget `NEON_PROJECT_ID` + validate env/maxDuration; (6) R2 dry-run inventories → validate identities; (7) gated replaced-version/orphan deletion (ledgered); (8) after churn proven: JSON strip + audit-prune policy + full remeasure. NO VACUUM FULL.
- [ ] Add the binding rule to `docs/operations/proof-first-guardrails.md`.
- [ ] Open ONE draft consolidation PR from `agent/unified-feed-media-system` → `main`; body = the proof package (per-phase test outputs, CI, Playwright artifacts, health output, honest gated-items + unresolved-A.4-fail-closed list). Update Task #9 → completed. **STOP for review before merge.**

### Phase 8 gate
- [ ] All checks green in CI; PR open (draft); runbook committed; nothing activated. **STOP — merge + activation are Maya-approved.**

---

## Self-Review

- **Spec coverage:** §3 identity→T2; §4 keys→T2; §5 pipeline→T7,T10; §6 reconcile→T8; §7 classifier/resolver→T1,T3,T4,T17; §8 suppression→T12,T13; §9 backlog→T14; §10 locks/cadence→T9,T20(prepared); §11 lifecycle→T15,T16; §12 health→T6,T19; §13 config→T20; §14 storage-reclaim→runbook step 8 (gated); §0 rule→every gate + T21. All 12 requirements mapped.
- **Placeholders:** none — each code step shows the test/assertions; enums/types are the live-verified set.
- **Type consistency:** `CanonicalMediaType` (T1) reused T2/T3/T4; `MediaIdentity`/`buildVersionedR2Key`/`mediaRowUnchanged` (T2) used T8/T10/T15; `selectHero` (T3) used T17/T18; `runSystemHealth` (T6) extended T19; `withSyncLock` (T9) used T10; `UNIFIED_MEDIA_PIPELINE` flag (T10) toggled at runbook step 3.
- **Fail-closed:** every unresolved A.4 Cotality item is handled by fail-closed code (reconcile empty/shrink; Public-only permission; current-URL downloads) and never gates a build task.
