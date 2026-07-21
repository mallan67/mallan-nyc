# Unified Feed→DB→R2 Media/Property System — Design

**Status:** DESIGN (Phase 0). Base: current main `51b831dd` on branch `agent/unified-feed-media-system`.
**Owner directive:** one organized system, same-clock syncs, not fragmented — all 12 requirements delivered as ONE consolidation, with per-phase tests, per-phase health checks, and a system-wide health layer.

---

## 0. Binding delivery rule (applies to every phase here and every production change after)

> **Fix → targeted tests → full build/check → one system health check → unified PR → production verification.**

Concretely, no change ships unless it has, in order:
1. **Fix** — the change itself, TDD (failing test written first where behavior changes).
2. **Targeted tests** — the phase's own suite red→green.
3. **Full build/check** — `type-check`, FULL jest (all 294+ suites), `rls:validate`, `ucba:audit`, `compliance-check`, `idx:validate`, `crm:test` when CRM touched, production build. The whole, never the increment.
4. **One system health check** — `media:system-health` (Section 12) green, so the change is proven against the *system's* invariants, not just its own.
5. **Unified PR** — lands via the single consolidation PR (or, post-consolidation, one reviewable PR per change), never scattered edits.
6. **Production verification** — deployment identity (alias→deployment→SHA), five-probe smoke, and the runbook's step-specific live proof before the next gated step proceeds.

This rule is also added to `docs/operations/proof-first-guardrails.md` in the PR so it is durable repo policy.

---

## 1. Problem this design ends (findings it must close)

Twelve read-only investigations converged on these proven defects (file:line evidence in the investigation record):

| ID | Defect | Symptom |
|---|---|---|
| F1 | `media_url_original` compared by exact string while Cotality rotates the URL each fetch → 0% write suppression (0/2,012; 0/751 with `mismatch_media_url_identity=751/751`); 17,545/17,545 rows rewritten in 24h (~19.3 GB WAL) | CPU + storage churn |
| F2 | `listings`/projection/media-JSON/summary rewritten unguarded every 30 min; scorers rewrite unconditionally; seller signals delete-and-recreate | CPU + storage churn |
| F3 | R2 key `photos/{listingId}/{order}.jpg`; null Order→0; blind `existsInR2` reuse; concurrency-5 overwrite race; no deletion ever | missing / wrong / duplicated photos; 123.71 GB @ ~0.63 GB/day; ~50 GB orphans |
| F4 | Empty-200 Media response mass-tombstones every photo row; no shrink guard | zero-photo listings |
| F5 | Property cursor fetches newest-500 `desc` then advances to max → records 501…N permanently skipped | silent stale listings/media |
| F6 | Media query not `ResourceName='Property'` scoped; Cotality `MediaType` never selected; classifier defaults unknown categories to Photo | scope contamination; misclassification |
| F7 | Backlog eligibility re-scanned (~300K rows) before every 5-row wave; partial index explicitly deferred, never added | ~108M tuples/day read compute |
| F8 | "Concurrency guard" = audit-event lookback, written at END of run → no lock; overlapping runs can interleave upsert/tombstone destructively | corruption risk |
| F9 | Hero divergence: Similar API ignores PreferredPhotoYN; `/api/listings` Phase-1 raw order; CRM JS re-sorts raw | wrong first image |
| F10 | `img.cotality.com` accepted by pipeline but missing from proxy allowlist → 403 broken images on un-mirrored rows | missing photos |
| F11 | Retry-exhausted rows parked forever silently; one persistently-failing listing freezes the media cursor | permanent gaps |
| F12 | Config/legacy: `NEON_PROJECT_ID` stale (branch-prune inert); `vercel.json` 30s glob vs 300s/60s route budgets; second PrismaClient (geocode); `lib/db.ts` dead pool; `listing_views` no real migration; P1 index pack possibly recorded-not-applied; 663 MB legacy JSON with `ARCHIVE_ENABLED` OFF; `audit_events` 2-year-only prune | cost, truncation, drift |

Non-goals (explicitly out): VACUUM FULL; bulk R2 deletion before identity validation; changing scoring/retention cron cadences to 10 minutes; PR #534's third-party hero-only admission (rejected — conflicts with "preserve all seller media").

---

## 2. Architecture: one spine, one coordinator

```
                    ┌────────────────────────────────────────────┐
                    │            MEDIA IDENTITY SPINE            │
                    │  identity = (Property, ListingKey,         │
                    │              MediaKey, sourceRevision)     │
                    │  → versioned R2 key                        │
                    │  → identity comparator (write suppression) │
                    │  → strict classifier                       │
                    │  → single hero resolver                    │
                    └───────┬──────────────┬─────────────┬───────┘
        ┌───────────────────┴───┐   ┌──────┴──────┐   ┌──┴───────────────┐
        │  SYNC COORDINATOR     │   │ R2 LIFECYCLE│   │ RENDER SURFACES  │
        │  advisory locks       │   │ admission=  │   │ detail / cards / │
        │  Property :00 cadence │   │ ALL media   │   │ similar / CRM /  │
        │  Media    :05 cadence │   │ versioned   │   │ reports — ONE    │
        │  lossless asc cursors │   │ delete-after│   │ resolver         │
        │  fail-closed reconcile│   │ -confirm    │   └──────────────────┘
        └───────────────────────┘   └─────────────┘
                    └────────── media:system-health (invariants) ─────────┘
```

New modules (each small, one purpose, independently testable):
- `lib/media/media-identity.ts` — identity, sourceRevision, versioned R2 key, identity comparator.
- `lib/media/media-classifier.ts` — THE strict classifier (single source; the #525 audit classifier retired into it).
- `lib/media/hero-resolver.ts` — THE hero rule; `listing-media-resolver.ts` delegates to it; all APIs consume it.
- `lib/sync/coordinator.ts` — advisory locks, run lease, shared run context for Property+Media.
- `lib/sync/gallery-reconcile.ts` — the fail-closed reconciliation state machine.
- `lib/ops/media-system-health.ts` + `scripts/media-system-health.ts` — the system invariant monitor.
- `lib/ops/r2-lifecycle.ts` — inventories, manifests, ledger (dry-run only until gated).

Existing `lib/idx/sync.ts` / `lib/idx/media-sync.ts` are refactored to consume the spine — not forked.

---

## 3. Canonical media identity (Req 2)

**Identity** = `(resourceName='Property', resourceRecordKey=ListingKey, mediaKey=MediaKey, sourceRevision)`.

- `sourceRevision` = epoch-millis of `max(MediaModificationTimestamp, ModificationTimestamp)`; if both null → `0` (identity then rests on MediaKey alone; health check counts these).
- A **changed MediaKey** or a **higher sourceRevision** = a genuine source revision → new R2 object version; the previous R2 association is invalidated (row repoints; old object enters the replaced-versions inventory for later confirmed deletion).
- **URL is FULLY EXCLUDED from comparison — live-proven.** The 2026-07-21 authenticated probe showed the live endpoint mints a **new MediaURL on every request, different at origin+pathname level** (7/7 rows on immediate re-fetch AND after 60 s; the signature is embedded in the *path* — there is no query string at all). Therefore ANY URL comparison (exact or normalized) would rewrite every row every fetch. The comparator uses ONLY: identity fields (MediaKey, ResourceName, ResourceRecordKey, sourceRevision), classification fields (`media_category`, `media_classification`, canonical type), `order`, `preferred_photo_yn`, `status`, and listing linkage. `media_url_original` is provenance: refreshed only alongside a write that happens for a genuine reason, never a write trigger. Aged stored URLs may not remain fetchable (path-embedded token — Appendix A.3), so any download always uses the CURRENT run's freshly fetched URL.
- Schema (prepared migration, **applied per NEON.md manual-first procedure at activation, not at merge**): `listing_media` gains `source_revision BIGINT`, `r2_object_key TEXT` (the versioned key actually uploaded), backfilled lazily by the pipeline; plus the Phase-4 partial index (Section 9).

## 4. Collision-proof versioned R2 keys (Req 3)

**Key** = `{folder}/{listingId}/{mediaKeySafe}/{sourceRevision}.{ext}`
- `folder` from the canonical type (`photos|floorplans|videos|virtualtours`; a `documents` namespace is reserved but unused — `Document`/`Unknown` rows are stored-not-mirrored per §7).
- `mediaKeySafe` = MediaKey if `/^[A-Za-z0-9_-]{1,64}$/`, else `sha1(mediaKey).slice(0,20)` — deterministic.
- `ext` from Cotality `MediaType` when present, else URL extension, else `jpg` for photos.

Properties: MediaKey is the Media resource primary key → **no two distinct media share a key**; a revision change mints a **new** key → no overwrite of a still-referenced object; reordering changes nothing (order is not in the key); null Order is irrelevant.

**Identity-verified reuse:** every upload sets R2 object metadata `{mediaKey, sourceRevision, listingId}`. Reuse requires HeadObject metadata match; mismatch → treat as absent and upload the correct object under its own key (impossible to collide by construction, but verified anyway). `existsInR2` errors are **surfaced as retryable failures**, never swallowed as "absent" (closes F3's churn edge).

**Downloads always use the CURRENT run's freshly fetched `MediaURL`** — never the stored `media_url_original` (live-proven per-request signed paths; an aged stored URL's fetchability is unverified — Appendix A.3). The proxy fallback for un-mirrored rows therefore remains best-effort until a row is mirrored, which is a further reason the mirror backlog must drain (Phase 4) and parked rows must recover.

**Read compatibility:** readers consume `media_url_cached` per row, so the key-scheme change is transparent. Existing legacy-keyed objects keep serving until the lifecycle (Section 11) migrates/deletes them after validation — no bulk deletion at merge.

## 5. Lossless Property+Media pipeline (Req 1)

- **Property cursor** becomes a keyset ascending cursor — `(ModificationTimestamp asc, ListingKey asc)`, `filter (MT gt cursorTs) OR (MT eq cursorTs AND ListingKey gt cursorKey)`, dual-timestamp OR with `PhotosChangeTimestamp` preserved. Batch cap stays, but the cursor advances only to the **last contiguously processed** record — the newest-500-skip is structurally impossible. (This mirrors the media cursor's proven RC1 keyset design.)
- **Media queries**: `ResourceName eq 'Property' and ResourceRecordKey eq '<ListingKey>'` (`ResourceName` is a real contract enum — `Building|Contacts|Member|Office|Property`); `$select` adds `ResourceName` + `MediaType`; `$orderby Order asc, MediaKey asc` (deterministic); complete `@odata.nextLink` pagination, fail-closed on any incomplete page (existing behavior retained). Note: `Permission` is typed **`Multi.Permission` (flags)** in the contract — the eligibility gate must parse multi-values defensively; whether IDX Plus should accept only `Public` or also `IDX` remains a Class-C contract question resolved only by the REBNY/Cotality agreement or vendor answer (Appendix A), and the gate stays fail-closed (`Public`-only) until then.
- **One coordinator** (`lib/sync/coordinator.ts`) owns both cursors, the locks, and the shared run ledger, so Property and Media reconcile under one roof instead of two disconnected crons.

## 6. Safe gallery reconciliation (Req 4)

State machine per listing, replacing unconditional `tombstoneVanished`:

1. **Explicit delete** (`MediaStatus='Deleted'` — a real contract enum: `Active|Deleted|Other`, Appendix A) → tombstone that row. Always allowed.
2. **Vanished rows** (absent from a COMPLETE, NON-EMPTY snapshot) → marked `pending_removal` with the run id — **not tombstoned yet**.
3. **Confirmation**: a row is tombstoned only when a **second, later, complete fetch** also lacks it (`pending_removal` seen twice across distinct successful runs).
4. **Fail closed, no destructive action**, on: empty result set, incomplete pagination, timeout, 5xx, malformed payload, or **abrupt shrink** (new set < 50% of current active count). These finalize the listing as unresolved; existing media untouched. Where populated, `Property.PhotosCount` (real contract field, `Edm.Int32`) corroborates: a claimed-empty Media set while `PhotosCount > 0` always fails closed (**live-verified populated** on all sampled Active listings: 7/22/18/7/15 — Appendix A).
5. **Cursor advances only when the listing finishes successfully** (retained `ok:true` contiguity rule).
6. A **mass-tombstone circuit breaker**: any run that would tombstone more than **25 rows** or touch more than **10 listings** destructively (defaults, env-tunable) aborts all destructive actions for the run and alerts (health metric `mass_tombstone_events` must equal 0).

`pending_removal` lives in a `listing_media.pending_removal_run` nullable column (same prepared migration).

## 7. One classifier, one resolver (Req 6)

- **Classifier** (`media-classifier.ts`): explicit enums from the committed `artifacts/metadata.xml` — `Photo | FloorPlan | Video | VirtualTour | Document | Unknown`. Nothing defaults to Photo. Ingest policy: `Document` and `Unknown` rows are **stored** (`media_type` accordingly), **excluded** from photo counts, hero eligibility, and the `photos/` namespace, and **not mirrored** to R2 (served via proxy); health check reports their counts. URL-shape detection (the read-path's document/floorplan patterns) is folded in so a null-category floor plan is caught at ingest, not just at render.
- **Hero resolver** (`hero-resolver.ts`): `active Photo → PreferredPhotoYN → lowest valid Order → stable MediaKey` (MediaKey is the final deterministic tiebreak; a floor plan/video/document/tour can never be hero). **Live note:** on the sampled live feed `PreferredPhotoYN` was `null` on every row (never `true`/`false`), so the resolver must treat null as not-preferred and fall to lowest valid `Order` — live-proven as the primary ordering signal (Appendix A). Consumed by: listing detail, search cards, featured, agent listings, **Similar API** (finishing the #500 follow-up), `/api/listings` Phase-1 (replacing the `fetch.ts` reimplementation), the CRM media-batch feed (emits `isPrimary`; CRM JS ordering fix is prepared but **CRM-frontend-gated**), and report/seller outputs.
- All legacy hero/classification implementations are deleted or reduced to delegations — enforced by a source-scan test that fails if a second implementation reappears.

## 8. Write suppression everywhere (Req 7)

Compare-before-write contracts (each a pure, unit-tested predicate; a skipped write costs zero DB statements):
- `listing` upsert update-arm: full mapped-field compare incl. JSON by stable stringify; bookkeeping fields (`last_synced_from_trestle`, `sync_status`) excluded from compare AND not written on skip; timestamp-only/receipt-time changes do not write.
- `listing_search_projection`: point-read + full compare.
- media summary (4 columns): compare-before-write.
- batch-media refill: candidates only when stored media missing/invalid OR the listing genuinely changed this run; content-compare before `updateMany`.
- `listing_media`: the **identity comparator** (Section 3) — URL rotation never writes.
- Scorers (lead/seller/conviction/momentum/social-proof/demand/intent/agent/market): compute → compare content hash/fields → write only on change; seller `readiness_signals` reconciled by diff (insert/update/remove) — never delete-and-recreate.
- Ledger: every path keeps `checked = changed + skipped_unchanged` counters flowing to its audit payload (the #541 pattern extended), so suppression is *measurable* in production forever.

## 9. Bounded backlog + partial index (Req 8)

- ONE bounded candidate query per run: partial-index-aligned predicate, `ORDER BY created_at asc, id asc`, `take = MAX_R2_CANDIDATES_PER_RUN (250)`; processed in memory in concurrency-5 waves; per-invocation attempted-set; **zero requeries**; bounded retry queue and failure queue with counters; parked-row recovery = bounded re-admission lane (up to 10 parked rows re-attempted per run, env-tunable, with alerting) so exhaustion is never permanent-silent (closes F11).
- **Prepared migration**: `CREATE INDEX CONCURRENTLY listing_media_r2_backlog_idx ON listing_media (created_at, id) WHERE status='active' AND media_url_original IS NOT NULL AND (r2_key IS NULL OR media_url_cached IS NULL);` — applied manually at activation per NEON.md, then the code path assumes it (health check verifies `pg_index.indisvalid`).

## 10. Locking + cadence (Req 9)

- **Locks**: Postgres advisory locks via the coordinator — `pg_try_advisory_lock(key)` at run start (`property-sync`, `media-sync` distinct keys), released in `finally`; lock-not-acquired → clean skip with audit note. The audit-event lookback pseudo-guard is deleted. Session-scoped locks on the UNPOOLED connection so a killed function's lock releases with its session.
- **Cadence (activation-gated)**: Property `0,10,20,30,40,50 * * * *`; Media `5,15,25,35,45,55 * * * *` — one coordinated 10-minute system, offset so they never hit Neon simultaneously. Retention/scoring/alerts/prune/archive/report jobs keep their existing appropriate schedules. Cadence flips ONLY after Phases 1–4 are active and the suppression ledger proves near-zero-write idle runs (otherwise 144 wakes/day re-burns what #481 saved). `db-keepalive` stays unscheduled.

## 11. R2 lifecycle (Req 5 + 10)

- **Admission preserves ALL seller media**: photos, hero, floor plans, file-backed videos/virtual tours — for ALL listings. #534's third-party hero-only policy is **rejected**. Iframe/URL-style 3D tours are stored + rendered by reference (never forced through the image uploader). `Document`/`Unknown` are stored-not-mirrored (Section 7).
- **Deletion, strictly ordered and gated**: (a) replaced-version objects are deleted only after the new version is uploaded, verified (Head + metadata), AND the row's `media_url_cached` repointed — then only via the bounded cleanup lane; (b) orphan inventory (R2 LIST diff vs DB) and duplicate-identity inventory ship as dry-run manifests; (c) every deletion writes to an append-only deleted-object ledger (`docs/operations/r2-deleted-objects.ledger.jsonl` + audit event); (d) repeated R2 failure alerts via the health layer; (e) **no bulk deletion of existing objects until the new identities are validated in production** — that execution is a separate Maya-approved runbook step.

## 12. System health layer (the owner's rule, made permanent)

`npm run media:system-health` (read-only) validates LIVE invariants across the whole pipeline — wired into `ops:health` and a scheduled read-only report; every red is loud (audit event + log line), never silent:

| Invariant | Red condition |
|---|---|
| Cursor health | property/media cursor older than 3 intervals, or frozen at same key >N runs |
| Mass-tombstone | `mass_tombstone_events > 0` or tombstones/run above breaker |
| Suppression | `skipped_unchanged = 0` while `checked > 0` on any suppressed path (churn returned) |
| Ledgers | any path where `checked ≠ changed + skipped_unchanged` (rows_failed=0 runs) |
| Identity | duplicate `(mediaKey)` active rows; identity-less rows (revision 0) above threshold |
| R2 keys | any two active rows sharing `r2_object_key`; legacy-key population trend |
| Backlog | `backlog_query_count ≠ 1`; backlog size trend; parked-row count above bound |
| Locks | lock acquired without matching release in run ledger |
| Media integrity | sampled listing: hero is a Photo, photo_count matches active rows, no broken proxy host |
| R2 growth | daily growth vs admission policy expectation |
| audit_events | daily growth above budget |
| Config | (activation) partial index `indisvalid`, migrations in sync |

Per-phase health checks are this same monitor's sections — each phase turns its section from `not-applicable` to enforced, so by Phase 8 the monitor covers the entire system.

## 13. Old-Neon / config cleanup (Req 11)

In-PR (code): remove `lib/geo/geocode.ts` second PrismaClient (use the singleton); delete dead `lib/db.ts` pool; align `vercel.json` function `maxDuration` blocks with route budgets (feed-reconcile 300s etc.) — cron/config edits prepared in the PR, **applied at activation approval**; author the missing real migration for `listing_views` (recorded per NEON.md reconcile procedure); fix stale schedule comments; remove stale worktree configs from any deploy path.
Activation-gated (runbook): retarget `NEON_PROJECT_ID` → `hidden-mountain-87248164`; run `prisma migrate status` + `migrate diff` against cold-waterfall; verify P1 index pack `indisvalid`; validate `READONLY_MODE`, `IDX_ENABLED`, `ARCHIVE_ENABLED`, `DATABASE_URL(_UNPOOLED)` values; keep `db-keepalive` unscheduled; keep `rotate-db-keys` disabled.

## 14. Storage cleanup — only after churn is proven stopped (Req 12)

Sequence (each step gated, each with remeasure): prove suppression in production (ledger: near-zero writes on unchanged runs over ≥24h) → bounded batch archive/strip of terminal-listing legacy JSON (compliance/provenance fields retained; `ARCHIVE_ENABLED` flip is the switch) → intentional `audit_events` pruning policy (replace blanket 2-year with per-action retention, compliance actions retained) → remeasure table sizes, dead tuples, WAL, seq scans, CU. **No VACUUM FULL.**

## 15. Testing strategy (TDD, whole-system retesting)

- **Per phase**: failing test first for every behavior change; the phase suite red→green; then the FULL chain (Section 0 step 3) — never only the increment.
- **Integration**: coordinator-level tests driving Property+Media through mock Cotality across multi-run scenarios (backlog >500, rotation-only runs, shrink/confirm, lock contention, kill-mid-run resume).
- **Playwright** (Phase 6, kept as a permanent suite): against the running app — photos present on detail page; hero renders FIRST on detail, search card, featured, similar, agent listings; floor-plan and 3D tabs present and populated where the listing has them; zero broken images on sampled pages.
- **Source-scan guards**: no second classifier/hero implementation; no unconditional write in guarded paths; forbidden-token scans for the read-only tools.
- **Regression**: all existing suites (5,157+ tests) stay green at every phase.

## 16. Delivery: one PR + gated activation runbook

Everything lands as **one consolidation PR** from `agent/unified-feed-media-system` (draft until review). Merge activates only dormant-safe code paths (new modules + refactors that behave identically until migrations/flags/cadence apply). Then the **activation runbook** executes in order, each step Maya-approved with verify-then-proceed:

0. **Live Cotality contract verification** (read-only, Maya-approved). The initial probe ran **2026-07-21T06:01Z** and verified the items in Appendix A.1/A.2 (filter syntax, orderby, ResourceName population, PhotosCount, per-request path-signed URL rotation). Step 0 at activation re-runs it at scale and settles the **A.4 remainder**: null/dup `Order` frequency at scale, `Permission` serialization when non-null, **aged stored-URL fetchability**, longer-horizon rotation, large-gallery pagination — via the gated PR #543 diagnostic + `trestle:probe`. Any divergence loops back into the design BEFORE activation.
1. Apply identity + partial-index migrations to prod manually (NEON.md §5), verify `indisvalid` + `migrate status` clean → merge/deploy already-compatible code.
2. Observe: suppression ledger + system health green for ≥3 natural runs.
3. Flip cadence to :00/:05 ten-minute pairing (`vercel.json` cron change).
4. Retarget `NEON_PROJECT_ID`; validate env flags; confirm effective `maxDuration`.
5. Run R2 inventories (dry-run manifests) → validate new identities in production.
6. Approve bounded replaced-version/orphan deletion lanes (ledgered).
7. After churn proven: JSON strip batches → audit-prune policy → full remeasure (Neon CU, WAL, dead tuples, seq scans, R2 growth).

Each runbook step ends with its own production verification (deployment identity, smoke, step-specific probe) per the binding rule. Nothing is reported "done" before its verification passes.

## 17. Risks & rollback

- **Dual-key transition** (legacy + versioned R2 keys coexist): readers use `media_url_cached`, so no render risk; health tracks legacy population shrinking.
- **Suppression false-negative** (a genuine change wrongly skipped): every comparator fails open to WRITE on any uncertainty/malformed input; per-field regression tests for every compared field.
- **Reconciliation too conservative** (slower removals): acceptable by design — a stale extra photo for one cycle beats a wiped gallery; explicit deletes remain immediate.
- **Cadence cost regression**: gated behind proven suppression; rollback = revert the cron block.
- **Migration risk**: prepared SQL reviewed, applied manually with NEON.md checklist, `CONCURRENTLY` for the index; rollback = drop index / columns are additive-nullable.
- **Anything wrong post-activation**: each runbook step is individually revertible; the PR itself changes no behavior until activation steps run.

---

## Appendix A — Cotality contract grounding (LIVE-verified; no assumptions)

**Authority: the live authenticated Cotality API — not metadata artifacts, code, comments, or docs.** A read-only authenticated probe was executed against `https://api.cotality.com/trestle` on **2026-07-21T06:01Z** (10 GET requests, token acquired once, zero writes): live `$metadata` + 5 live Property rows + scoped/unscoped Media for 3 live listings (`1177660623/RLS20104692`, `1177659553/RLS20104691`, `1177659552/RLS20104690`) + a 3-fetch URL-rotation test. Raw output: `docs/superpowers/specs/evidence/2026-07-21-live-cotality-contract-probe.json` (URL path token segments masked). The committed `artifacts/metadata.xml` matched the live `$metadata` on every checked field and is hereby demoted to corroboration only.

### A.1 LIVE-verified in the running API (probe of 2026-07-21)

Live `$metadata` fetched over the authenticated session (HTTP 200):

| Design element | LIVE evidence (probe 2026-07-21T06:01Z) |
|---|---|
| `MediaKey` is the Media **primary key** → collision-proof key basis | live `$metadata`: `<Key><PropertyRef Name="MediaKey"/></Key>`; `MediaKey Edm.String Nullable="false" MaxLength="20"` |
| `ResourceName` exists on Media, enum = `Building, Contacts, Member, Office, Property` | live `$metadata` EnumType + **populated `"Property"` on every returned data row** |
| `ResourceRecordKey` (String 20) / `ResourceRecordID` (String 255) on Media | live `$metadata` + populated on every returned row (`ResourceRecordID` = the RLS ListingId) |
| `MediaStatus` enum = `Active, Deleted, Other` → explicit-delete signal is real | live `$metadata`; sampled rows all `Active` |
| `Permission` typed **`Multi.Permission`** (19 members incl. `Public, IDX/Idx, Private, VOW/Vow, OfficeOnly, FirmOnly, AgentOnly, PhotoOptedOut, SyndicateOptOut`) | live `$metadata`; **`Permission: null` on every sampled data row** (edge pre-filtering consistent) |
| `Order` is `Edm.Int32` **nullable by contract** → null handling mandatory; position-based keys unsound | live `$metadata`; sampled rows were clean 1..N (0 nulls / 0 dupes in-sample — contract still permits null) |
| `PreferredPhotoYN Edm.Boolean`; `MediaURL String(8000)`; category/classification/type enums; both timestamps `DateTimeOffset(27)` | live `$metadata`; `MediaModificationTimestamp` populated on rows → `sourceRevision` derives from live-real fields |
| `MediaCategory` = exactly 18 members → strict classifier allowlists | live `$metadata`; sampled rows `Photo`/`Jpeg` |
| Property **key = `ListingKey`**; `ListingId`; both cursor timestamps; `PhotosCount`; `VirtualTourURLBranded/Unbranded` | live `$metadata` + live rows: `PhotosCount` populated (7, 22, 18, 7, 15); `PhotosChangeTimestamp` populated |

### A.2 LIVE behavior findings (data-plane, same probe)

1. **Query syntax accepted:** `$filter=ResourceName eq 'Property' and ResourceRecordKey eq '<LK>'` → HTTP 200 with the **plain** enum literal (no qualified-name fallback needed). Multi-key `$orderby Order asc, MediaKey asc` → accepted.
2. **Scope:** scoped vs unscoped keysets were **equal** on all 3 sampled listings; no non-Property rows observed. Scoping stays (defense per the data model), but no live contamination was observed in-sample.
3. **URL rotation — the decisive finding:** the same listing's Media, re-fetched **immediately** and again **after 60 s**, returned **7/7 URLs different at origin+pathname level each time**. `MediaURL` carries **no query string**; the rotating signature is embedded in the **path** (includes an epoch-like token segment). ⇒ Any URL-based change detection (exact OR normalized) is structurally unusable; identity must be MediaKey+revision (§3); downloads must use the current run's fresh URL (§4).
4. **`PreferredPhotoYN` = `null` on every sampled row** → lowest valid `Order` is the live primary hero signal; the resolver treats null as not-preferred (§7).
5. Pagination: sampled sets fit one page (`@odata.nextLink` absent); complete-pagination handling remains mandatory for larger galleries.

### A.3 Repo-documented (not yet live-verified; confirm at activation)

- Rate limits: 7,200/hr · 180/min OData queries; 18,000/hr · **480/min Media URL** requests (`docs/architecture/COTALITY-COMPLETE-REFERENCE.md`). The probe used 10 requests total.
- Dual-cursor incremental semantics: photo-only edits bump `PhotosChangeTimestamp` without `ModificationTimestamp`.
- No 10-minute vendor cadence recommendation exists in-repo; the 10-minute clock is the owner's chosen freshness target within the documented rate limits.

### A.4 Still needs-live verification (Runbook Step 0; the code fails closed on all of these meanwhile)

1. Real-world null/duplicate `Order` frequency at scale (sample of 3 listings was clean; the contract permits null — handling stays mandatory).
2. `Permission` multi-value JSON serialization **when non-null** (all sampled rows were null), and the **policy** question (accept `Public` only vs also `IDX`) — resolvable only by the REBNY/Cotality distribution agreement or a vendor answer; the gate stays `Public`-only fail-closed until answered.
3. **Aged stored-URL fetchability**: whether a previously stored signed-path `media_url_original` still returns the binary later (path token suggests expiry) — determines how unreliable the un-mirrored proxy fallback is; test read-only with an old stored URL at Step 0.
4. Whether Cotality ever emits transient empty-200 Media sets for populated listings (cannot be provoked safely; the reconciliation state machine fails closed regardless, corroborated by live-populated `PhotosCount`).
5. Longer-horizon rotation behavior (probe window was 60 s) and behavior across `$expand`/larger galleries with `@odata.nextLink`.
