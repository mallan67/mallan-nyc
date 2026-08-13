# Listing.media reader ownership + IDX cursor stabilization — evidence record

**Date:** 2026-08-13
**Branch:** `fix/idx-cursor-keyset-and-external-state-2026-08-13`
**Code SHA at investigation:** `26fed0c8261f131168c6d4b48797abf2c0084ee8`
**Production DB:** Neon `hidden-mountain-87248164` (canonical), read-only queries only.

> Status: **UNSOLVED → implementation in progress.** Nothing in this document is a
> completion claim. Every live figure below is a read-only production measurement
> taken on 2026-08-13; live values move.

---

## 0. Corrections to the prior project record

Two statements carried forward from earlier sessions are **wrong** and are corrected here.

### 0.1 Property ingestion is NOT bootstrapped from `SyncState.last_watermark`

`getLastSyncTimestamp()` (`lib/idx/sync.ts:1936-1946`) returns
`MAX(listings.modification_timestamp)` restricted to rows with
`last_synced_from_trestle IS NOT NULL`. That — not `SyncState` — is the incremental
cursor.

`SyncState.last_watermark` is consulted at `lib/idx/sync.ts:1963-1971` and ONLY as a
**downward clamp on an error run**:

```ts
if (state && state.last_run_status !== null && state.last_run_status !== "ok"
    && state.last_watermark && state.last_watermark < dbCursor) {
  return state.last_watermark;
}
```

Because a healthy run persists wall-clock (always `> dbCursor`), that clamp is inert
for any watermark written by a successful run.

### 0.2 The wall-clock watermark defect is real, but its impact is a UCBA display defect — not data loss

`lib/idx/sync.ts:1246-1261`:

```ts
const now = new Date();
let batchWatermark = now;          // <-- seed floor, not a fallback
...
for (const cand of [mt, pct]) {
  if (cand && !Number.isNaN(cand.getTime()) && cand > batchWatermark) batchWatermark = cand;
}
```

Provider timestamps are in the past relative to the moment the run reaches this block,
so the loop is a no-op in normal operation and `last_watermark` persists as **local
wall clock**. The in-file comment at `:1238-1240` asserts the opposite of what the code
does.

**Live proof (2026-08-13, read-only):**

| measurement | value |
|---|---|
| `sync_state.Property.last_watermark` | `2026-08-13T09:20:39.721Z` |
| `sync_state.Property.last_run_at` | `2026-08-13T09:20:39.721Z` |
| `last_watermark = last_run_at` | **true** (millisecond-identical) |
| `MAX(listings.modification_timestamp)` | `2026-08-13T09:16:46.900Z` |
| watermark ahead of newest stored provider MT by | **3m 52.821s** |

A provider `ModificationTimestamp` would essentially never equal `last_run_at` to the
millisecond. The consumer is `lib/idx/watermark.ts:22-25` → `/api/idx/watermark` →
`app/components/Footer.tsx` + `app/components/IDXDisclaimer.tsx` ("Data last updated"),
whose own header cites **UCBA 2026 Art. VIII §4**: the displayed timestamp must be the
true data-refresh time, not the render clock. That is the surface this defect breaks.

---

## 1. Cotality field truth (Class B — verified live, not inferred)

Verified against live Trestle `$metadata` via the trestle-fields MCP (cache age 0m).

### 1.1 `Media.MediaCategory` has 18 live values — the in-repo registry is stale

`data/RLS-FIELD-REGISTRY.md:147` claims 6 values
(`FloorPlan, Photo, Video, AgentPhoto, OfficePhoto, GroundPhoto`).

Live Cotality returns **18**, does **not** contain `GroundPhoto`, and adds:
`Addendum, AerialView, BrandedVirtualTour, Disclosure, Document, Map, OfficeLogo,
Other, RentalDocuments, Restriction, Survey, Topography, UnbrandedVirtualTour`.

`Media.MediaClassification` live values: `Document, Photo, Video, PHOTO, DOCUMENT, VIDEO`.

### 1.2 Classifier gap — LATENT, not live

`classifyTrestleMediaCategory` (`lib/media/media-sync-service.ts:142-167`) matches
floorplan / virtualtour / video substrings and **defaults everything else to `Photo`**.
Against the live enum that means `Document`, `Disclosure`, `Survey`, `Addendum`,
`Restriction`, `RentalDocuments`, `Map`, `Topography`, `AgentPhoto`, `OfficePhoto`,
`OfficeLogo`, `Other` would all classify as listing photos. Its comment claiming
"every MediaCategory variant Trestle has emitted (verified live 2026-05-01)" is stale.

**Live production `listing_media` contains only 4 categories**, so this is a latent
robustness gap, NOT a live display violation:

| media_category | media_type | rows | active |
|---|---|---:|---:|
| `Photo` | Photo | 323,697 | 290,029 |
| `FloorPlan` | FloorPlan | 21,722 | 20,324 |
| `BrandedVirtualTour` | VirtualTour | 2 | 0 |
| `Video` | Video | 1 | 0 |

`BrandedVirtualTour` → `VirtualTour` is correct (substring match). Logged as hardening;
NOT remediated in this change.

**Consequence for design:** canonical `listing_media.media_type` already carries
`FloorPlan` / `Video` / `VirtualTour`, so search feature flags CAN derive from canonical
rows. Duplicating media back into JSON is not required to serve them.

---

## 2. `Listing.media` reader ownership (executed call paths, adversarially verified)

48 reader/writer sites traced; 21 live+JSON-only claims put through a dedicated
refutation pass. Classification below reflects the post-refutation verdicts.

### 2.1 Already canonical-first — LEAVE AS IS

| site | entrypoint |
|---|---|
| `lib/idx/db-to-public-dto.ts:341` | `/api/listings`, `/api/agents/[slug]/listings`, CRM grid |
| `app/listing/[...slug]/page.tsx:495` | public listing detail |
| `app/api/listings/route.ts:369, 1052, 1308` | public search/list |
| `app/api/agents/[slug]/listings/route.ts:272` | public agent page |
| `app/api/crm/listing-campaigns/route.ts:80` | **REFUTED** as JSON-only — is canonical-first |
| `app/api/crm/listings/[id]/media/route.ts:141` | **REFUTED** as JSON-only — canonical-first w/ fallback |

> **Answer to the ownership question:** NO currently-executed public listing / card /
> detail reader still needs the legacy JSON when canonical `listing_media` rows exist.

### 2.2 Live + JSON-only — MIGRATE to the canonical composer

| site | class | note |
|---|---|---|
| `app/api/open-houses/route.ts:427` + `:508` | public | hero derived from JSON only |
| `app/api/listings/similar/route.ts:202` + `:240` | public | JSON only |
| `app/api/crm/listing-sends/route.ts:254-257` | crm | takes `media[0]` raw — can hero a floor plan |
| `app/api/crm/listings/route.ts:83` | crm | CRM grid |
| `lib/search/core.ts:24` / `:156` / `:250` | crm/search | saved-search execute + alerts cron |
| `lib/search/listing-search-projection.ts:263` + `:646` | writer | feature flags derived from JSON |

### 2.3 Dead / unreachable — DELETE

`lib/search/core.ts:82` (`runListingSearch`, zero call sites repo-wide),
`app/api/portal/buyer/saved/route.ts:49`, `lib/idx/sync.ts:1699` (`backfillEmptyMedia`),
`lib/idx/sync.ts:1853` (`migrateMediaToR2` URL rewrite).

### 2.4 Genuinely requires the JSON

`lib/media/crm-media.ts:155-252` (`importJsonMediaToRows`) — the JSON→rows recovery
path itself. This is a migration reader, not a display reader.

---

## 3. Live media-state census (read-only, 2026-08-13)

Total listings: **24,968**.

| legacy JSON | canonical active rows | listings |
|---|---|---:|
| no | no | 3,423 |
| no | yes | 15,885 |
| yes | no | 557 |
| yes | yes | 5,103 |

Restricted to **publicly displayable** (`status IN (Active, ActiveUnderContract,
ComingSoon)` AND `idx_display_yn IS NOT DISTINCT FROM true`) — 8,410 listings:

| legacy JSON | canonical | listings |
|---|---|---:|
| no | yes | 6,978 |
| yes | yes | 1,154 |
| yes | no | **97**  ← the residual |
| no | no | 180 |

**Design consequence:** seeding `listings.media` from canonical rows would create
~6,978–15,885 new JSON blobs purely to duplicate data that already exists relationally.
Rejected — it grows Neon storage against the stated goal and re-entrenches a column
that is scheduled for retirement.

A "maintain only where already non-empty" rule was ALSO rejected: it is not a durable
enrollment predicate, because it breaks on the sequence
`legacy photos exist → authoritative empty clears to [] → later PCT-only photo addition`,
where the rule would then refuse to repopulate.

---

## 4. The residual population — characterized

97 displayable listings depend on legacy JSON with no active canonical rows.

| property | value |
|---|---|
| never imported (zero `listing_media` rows) | 93 |
| only tombstoned rows | 4 |
| Mallan-owned (`rls_eligible=false`) | **0** |
| archived (`sync_status='archived'`) | **0** |
| `listings.photos_change_timestamp IS NULL` | 94 |
| `raw_data->>'PhotosChangeTimestamp'` present + non-null | **97 / 97** |
| source PCT range | `2025-01-29` → `2026-08-09` |
| total legacy photo items | 1,163 |

### 4.1 Root cause — forward-only cursor cannot see late-arriving old rows

Cotality supplies `PhotosChangeTimestamp` for all 97. Our
`listings.photos_change_timestamp` is NULL for 94 only because that column is written by
`updateListingMediaSummary`, which never ran for them.

The live media cursor is `media_sync_state.Media.last_photos_change =
2026-08-13T09:16:51.843Z` (`last_listing_key = 1179924995`). **Every one of the 97 source
PCT values is below that cursor.** media-sync's query is a comparison predicate on
`PhotosChangeTimestamp` in all three branches (`lib/idx/media-sync.ts:3272-3278`), and a
forward-only keyset cursor can never revisit a position it has already passed. A listing
that enters `listings` today carrying a 2025 PCT is therefore permanently invisible to
the incremental media lane.

> **This generalizes.** The Property `(ModificationTimestamp, ListingKey)` ASC keyset
> cursor planned in this workstream inherits the SAME structural gap. A keyset cursor
> alone is not sufficient; it must ship together with a bounded backlog-drain that
> selects work by *state* (missing canonical media) rather than by *cursor position*.

### 4.2 Verdict

Residual is small (97 displayable), contains **no** Mallan-owned and **no** archived
listings, and every member is recoverable by `ResourceRecordKey` without any cursor
change. Per the CANONICAL-READER / BOUNDED-COMPATIBILITY direction: **eliminate via
bounded canonical-media recovery, then retire the display dependency** — do not preserve
a compatibility writer.

---

## 5. Neon CPU — where the win actually is

### 5.1 `skip_neon` is structurally unreachable and no code change fixes it

Emitted from exactly one place, `app/api/cron/one-cycle-preflight/route.ts:83`, and only
after `decideOneCyclePreflight` returns `shouldRun:false` — which requires prior external
state. The Upstash host does not resolve (ENOTFOUND), so `redis.get()` rejects
(→ fail-open) **and** `redis.set()` rejects (→ state never persists). The state the skip
depends on can never be written, so the next poll can never find it.

Root cause is an infrastructure/credential gate, **outside this repo**.

### 5.2 The in-code lever is MT-only write amplification — and it is blocked by the cursor

`lib/idx/sync.ts:842-846` states it plainly: a provenance-only write *"keeps the row
write (a source revision must persist) but SKIPS all cache invalidation"*.
`isProvenanceOnlyChange` therefore gates only `recordPublicListingChange` (`:876-884`),
never the `prisma.listing.upsert` at `:813`. `LISTING_NON_MATERIAL_UPDATE_FIELDS`
(`lib/idx/write-suppression.ts:70-74`) excludes only `last_synced_from_trestle`,
`updated_at`, `created_at` — so a moved `modification_timestamp` always writes.

**Hard ordering constraint:** the MT-only write CANNOT be suppressed while the cursor is
`MAX(listings.modification_timestamp)`. Suppressing it would freeze
`getLastSyncTimestamp()` and the same rows would re-fetch forever. The cursor must move
into `sync_state` (keyset) FIRST. The cursor work and the write-suppression work are a
single indivisible change.

---

## 6. Property cursor — confirmed defect inputs

- `buildIncrementalFilter` (`lib/idx/fetch.ts:389-405`) ORs two independent clocks
  against ONE scalar: `(ModificationTimestamp gt T or PhotosChangeTimestamp gt T)`.
- Scheduled Property sync passes no `orderby`, inheriting `ModificationTimestamp desc`
  (`lib/idx/fetch.ts:144`). `SyncOptions` has no `orderby` field at all.
- Scheduled cap is 500 (`SCHEDULED_MAX_RECORDS`, `lib/idx/idx-sync-member.ts:43`), and
  `$top` is also 500, so a capped run is exactly one page.
- **Same-timestamp clustering is real and exceeds the cap.** Live
  `GROUP BY modification_timestamp HAVING COUNT(*)>1`, top rows:

  | modification_timestamp | listings |
  |---|---:|
  | 2026-04-24T03:30:26.372Z | **797** |
  | 2026-07-05T23:31:59.713Z | 357 |
  | 2026-08-10T06:09:27.830Z | 302 |
  | 2026-06-03T03:30:29.931Z | 162 |
  | 2026-05-15T11:32:49.493Z | **140** |

  A 797-row cluster cannot be traversed by a scalar `MT gt T` cursor under a 500 cap —
  it either loops on the same page or skips 297 rows. The `ListingKey` tie-breaker is
  mandatory, not an optimization. (The 140-row cluster independently corroborates the
  same figure observed in the live Cotality keyset probe.)

- `media_sync_state` ALREADY owns the PCT keyset cursor including `last_listing_key`
  (live value `1179924995`). `SyncState` has no `last_listing_key` column
  (`prisma/schema.prisma:651-663`). Do NOT create `SyncState("PropertyPhotos")`.

---

## 7. What is NOT yet done

- No production mutation of any kind has been performed. All DB access was read-only
  `SELECT`.
- No migration has been applied.
- No Upstash / env / R2 action taken.
- Implementation, behavioral tests, and validation are pending; results will be reported
  against the exact final SHA, per the proof-first rule.

---

## 8. Review round 2 — blockers found at pushed head `6b1686c3`

Independent review rejected `6b1686c3`. Five defects, all real, all closed on the
same branch. Recorded here because three of them are the kind that produce a
green deployment with broken ingestion.

### 8.1 A scoped run could overwrite the global cursor — SILENT LOSS (introduced by 6b1686c3)

`sync_state.Property.{last_watermark,last_listing_key}` is ONE position over ONE
ordered universe. `6b1686c3` advanced it from ANY non-empty run.

`app/api/idx/sync/route.ts` accepts `{"type":"sale"}`, which filters
`PropertyType ne 'ResidentialLease'`. Such a run never fetches a single rental,
so its "last contiguous success" is meaningless globally. Writing it to the
shared cursor declares every rental in that timestamp range processed; the next
unscoped run resumes past them and they are never seen again.

`fullSync` is the same class: it uses `buildActiveFilter` (actives only, no MT
bound), a different universe entirely.

**Fix:** `advancesGlobalCursor = incremental && !options.type`, DERIVED not
caller-supplied — the property that matters is the shape of the traversal, not
the caller's intent. Run telemetry still writes from every run; only the two
cursor columns are gated. Proven by `tests/runtime/idx-property-cursor-contract.test.ts`
(sale / rent / fullSync / capped-fullSync all assert the columns are absent),
mutation-verified: removing the gate fails exactly those 4 tests.

### 8.2 Bootstrap used a strict boundary and could skip an unprocessed key

Bootstrap resumes from `MAX(listings.modification_timestamp)` with a NULL
tie-breaker, and `6b1686c3` emitted `MT gt T`.

We are only ever guaranteed to have consumed T PARTIALLY — production carries
797 rows at one MT and the scheduled run caps at 500. `gt` therefore drops the
unprocessed remainder of the boundary timestamp permanently. Assuming
completeness is exactly the failure mode.

**Fix:** a tie-breaker-less resume uses `ge` and REPLAYS the boundary. Replay is
cheap — an unchanged row is suppressed by `listingUpdateMateriallyUnchanged`, so
it costs a comparison, not a write. `media_sync_state`'s reader already used this
rule, so both lanes now agree. Once a real keyset position exists the predicate
becomes strict again, so there is no perpetual replay.

Chosen over "verify completeness against live Cotality at the DB max": a
replay-safe boundary is correct WITHOUT that verification, and this environment
cannot run a live Cotality data query anyway (see
`docs/audits/cotality-live-metadata-evidence-2026-08-13.md` §4).

### 8.3 The manual route dropped the ListingKey

`app/api/idx/sync/route.ts` still called the scalar `getLastSyncTimestamp()`,
so a manual run resumed with no tie-breaker and could not express "at T, after
key K" — re-reading or skipping inside a same-timestamp cluster. Now uses
`getPropertyKeysetCursor()`, the same accessor the scheduled member uses. ONE
cursor contract, two callers.

### 8.4 Empty `listing_media` was treated as authoritative for projection flags

`6b1686c3` cleared `has_floorplan`/`has_video`/`has_virtual_tour` whenever the
active canonical set was empty. But empty-active is AMBIGUOUS, and the
never-imported residual is known to exist (§4): 97 displayable listings with
legacy media JSON, zero `listing_media` rows, and source PCT below the live media
cursor. Their flags would have been silently cleared.

**Fix — three-way rule, using the ALL-STATUS signal:**

| active rows | all-status rows | outcome |
|---|---|---|
| > 0 | any | canonical wins |
| 0 | > 0 | authoritative deletion -> flags false |
| 0 | 0 | never imported -> legacy JSON still governs |
| 0 | unknown | `shouldFallbackToLegacyMedia` — Mallan-owned fails closed |

Deliberately STRICTER than `shouldFallbackToLegacyMedia` in one place: that
helper governs which photos to SHOW (falling back to Cotality-sourced JSON is
harmless there), whereas these are SEARCH FACETS — an all-deleted listing must
not surface under a `has_floorplan` filter it no longer satisfies.

### 8.5 The hot sync path computed flags from an empty array

`syncListings` built its projection input from `mapped.media`, which is `[]` on
the incremental path because `$expand=Media` is disabled (`useExpandMedia === false`).
Every feature flag on the hot path was therefore derived from nothing.

**Fix:** the canonical rows + all-status `_count` are widened onto the EXISTING
per-record `findUnique` (`select: { ...LISTING_SYNC_COMPARE_SELECT, ... }`) — no
second round trip, no N+1, `distinct` caps it at <=4 rows per listing. Extra keys
on `existing` are harmless to the suppression comparators, which iterate the
UPDATE payload's keys.

### 8.6 Also closed

- The outer `parse/finalize` catch in the preflight route was an unstructured
  `console.warn`, so the one outcome that matters most — completion state failed
  to persist, so every poll fails open — was the ONLY outcome not queryable by
  `tag`/`event`. Now a structured `external_state_finalize` event with
  `outcome: 'parse_or_finalize_threw'` and an error CLASS (never the message,
  which can carry the Upstash URL/token).
- The 13 source-TEXT preflight assertions were replaced with behavioral tests
  that import and call the functions (23 + 9 route-level), mutation-verified.
- Raw Cotality `$metadata` captures preserved verbatim in
  `docs/audits/cotality-live-metadata-evidence-2026-08-13.md` so the
  18-value `MediaCategory` claim is auditable rather than prose.

---

## 9. LIVE PRODUCTION CAPTURE — the wall-clock defect on the public surface

Captured 2026-08-13T12:10Z. This is the §F "live URL probe with rendered
evidence" form, not a source-grep.

`GET https://mallan.nyc/api/idx/watermark` (production, running `main` =
`dc2e2e59`, i.e. WITHOUT this branch's fix):

```json
{"lastWatermark":"2026-08-13T12:10:46.476Z",
 "lastRunAt":"2026-08-13T12:10:46.476Z",
 "displayAt":"2026-08-13T12:10:46.476Z"}
```

All three fields are IDENTICAL to the millisecond. `displayAt` is what the
Footer and `IDXDisclaimer` render as "Data last updated".

Same instant, read-only from Neon `hidden-mountain-87248164`:

| field | value |
|---|---|
| `sync_state.Property.last_watermark` | `2026-08-13T12:10:46.476Z` |
| `sync_state.Property.last_run_at` | `2026-08-13T12:10:46.476Z` |
| `last_watermark = last_run_at` | **true** |
| `MAX(listings.modification_timestamp)` | `2026-08-13T12:10:06.280Z` |
| watermark ahead of real data by | **40.196s** |

The public IDX disclosure is therefore serving the SYNC RUN CLOCK, not the feed
refresh time — the exact condition UCBA 2026 Art. VIII §4 forbids and which
`lib/idx/watermark.ts`'s own header says must not happen. The lead varies run to
run (3m52.821s at 09:20Z, 40.196s at 12:10Z) because it is the run duration, not
a fixed offset — further confirmation it is a clock, not a data timestamp.

### 9.1 Preview deployments cannot prove this surface

`GET /api/idx/watermark` on the PR preview returns
`{"lastWatermark":null,"lastRunAt":null,"displayAt":null}`.

That is NOT a regression from this branch. Controlled comparison across three
preview deployments of the same branch:

| deployment | contains the watermark fix? | response |
|---|---|---|
| `26fed0c8` (branch base) | **no** | all null |
| `6b1686c3` | yes | all null |
| `ed9264c4` (head) | yes | all null |

The pre-change base returns the identical all-null response, so previews simply
have no binding to the production database. `/api/health` returns 200 on the head
preview, so the deployment itself is live.

**Consequence for the merge gate:** this surface CANNOT be proven on a preview.
The fix's effect (`displayAt` moving from the run clock back to the newest
genuinely-processed provider ModificationTimestamp) is only observable after
deploy to an environment with the production DB bound — i.e. it is a PROD_PROVEN
step, not a CODE_READY one. Re-run the exact probe above after deploy; the
success criterion is `lastWatermark != lastRunAt` and
`lastWatermark <= MAX(listings.modification_timestamp)`.
