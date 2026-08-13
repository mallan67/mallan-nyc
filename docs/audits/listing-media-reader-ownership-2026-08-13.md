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

---

## 10. LIVE COTALITY KEYSET EXECUTION PROOF (2026-08-13)

Executed against CURRENT live Property **data** (not `$metadata`) via
`npm run trestle:probe-keyset`. Sanitized evidence:
`artifacts/cotality-keyset-probe.json`. **7 checks, 7 PASS, 0 FAIL.**

| check | verdict | evidence |
|---|---|---|
| A — ASC composite `$orderby` | PASS | HTTP 200, 50 rows, captured rows ascending |
| B — bootstrap `ModificationTimestamp ge T` | PASS | HTTP 200; boundary timestamp **present** in the result — inclusivity is what makes the bootstrap replay-safe |
| C — keyed continuation | PASS | the anchored row is **excluded**, proving the tie-breaker advances past exactly one row |
| D/G — `@odata.nextLink` | PASS | page 2 ascending, continues after page 1 with no overlap and no gap |
| E — ListingKey non-null | PASS | 12 captured rows, 0 missing/blank |
| F — deterministic ordering | PASS | two identical requests returned the same rows in the same order |
| **H — same-timestamp continuation across a capped page** | **PASS** | real cluster of **140 rows** at `2024-10-26T17:44:08.180Z`; a **cap=1** keyset walk visited **140**, **lost=0, repeated=0** |

H is the decisive one: it reproduces the production hazard (a 797-row cluster
against a 500-record cap) at small scale and shows the keyset predicate
traverses it exactly. A scalar `MT gt T` cursor cannot — it either re-reads the
same page forever or jumps the cluster.

The 140-row provider cluster independently corroborates the 140-row cluster
measured in Neon (section 6), from the opposite side of the integration.

---

## 11. HISTORICAL PROPERTY GAP CENSUS — ZERO MISSING, 4,536 STALE

### 11.1 A count-based inference was made and is RETRACTED

An intermediate step compared provider-vs-local counts bucketed by
`ModificationTimestamp` day and read the deltas as missing rows. **That
inference was wrong and is retracted.** Bucketing by MT cannot measure absence:
a listing we hold but have not re-synced sits in an OLDER bucket locally, so it
registers as a provider surplus on its new day and a local surplus on its old
day. Count deltas conflate "absent entirely" with "present but stale". Listing
volume also varies by period, which moves both sides together.

### 11.2 The ID-level test

Scoped to the population the sync would actually store — `StandardStatus IN
(Active, ActiveUnderContract, ComingSoon)`:

| | |
|---|---:|
| provider, all statuses (whole MLS history) | 591,077 |
| provider, ACTIVE-ish | 8,381 |
| local, ACTIVE-ish | 8,405 |

The provider total is ~24x local because the feed carries the full MLS history
(Closed/Expired/Withdrawn) while we import a filtered subset. Comparing raw
totals is meaningless; only the ACTIVE-ish population is comparable.

The largest apparent deficit was 2026-08-05 (provider 291 vs local 107). Exact
ID-level check of all 291 provider ListingIds:

| measure | value |
|---|---:|
| provider ids | 291 |
| **present locally** | **291** |
| **absent locally** | **0** |
| present AND still Active locally | 291 |
| present but local MT older than provider | **184** |

**Zero missing.** The entire "deficit" was the 184 rows whose local
`modification_timestamp` trails the provider's.

> Identity note: the join is on **ListingId** (`listings.listing_id`), not
> ListingKey. `raw_data.ListingKey` survives on only 1,010 of 24,970 rows (shed,
> not in the keep-list); joining on it would report ~96% of the catalogue as
> missing — an artifact of shedding.

### 11.3 What IS real: unreachable staleness

Of 8,405 local ACTIVE listings:

| measure | value |
|---|---:|
| never synced | 2 |
| **not synced in >7 days** | **4,536 (54%)** |
| not synced in >2 days | 6,520 (78%) |
| synced in last 24h | 1,287 (15%) |
| oldest sync | 2026-03-28 (~4.5 months) |

And the decisive property:

| measure | value |
|---|---:|
| bootstrap cursor `MAX(modification_timestamp)` | 2026-08-13T13:29:07.953Z |
| stale-active rows **below** that cursor | **4,536** |
| stale-active rows at or above it | **0** |
| their MT range | 2025-04-02 to 2026-08-06 |
| recovery batches @500/run | **10** |

Every stale row sits BELOW the bootstrap position. This is the DESC+cap+scalar
regime's damage — it did not delete rows, it stranded them: once the cursor
passed their ModificationTimestamp they could never be re-fetched.

**The new ASC keyset cursor does NOT fix this**, and that is not a defect in it —
a forward-only cursor cannot revisit a position it has passed, by construction
(see lib/idx/cursor/keyset-cursor.ts "KNOWN LIMITATION"). Recovery must be a
state-based drain keyed on `last_synced_from_trestle`, NOT a cursor rewind.
Rewinding the cursor to 2025-04 would re-traverse nearly everything and
re-strand the tail on the next capped run.

### 11.4 Bounded recovery procedure — PREPARED, NOT EXECUTED

- **Selection:** `status IN (Active, ActiveUnderContract, ComingSoon) AND
  last_synced_from_trestle < now() - interval '7 days'`, ordered by
  `last_synced_from_trestle ASC`, `LIMIT 500`.
- **Action per row:** fetch that ListingId from Cotality and upsert — the same
  code path a normal sync uses.
- **Batches:** 10 at 500/run.
- **Write estimate:** at most 4,536 Listing upserts total. With the
  provenance-only suppression in this PR, any row whose only change is
  `ModificationTimestamp` costs a comparison rather than a write, so the
  realistic physical-write count is materially lower.
- **Idempotent:** yes — an upsert keyed on `listing_id`; re-running converges,
  and interrupting it loses nothing.
- **Cursor safety:** the drain MUST NOT touch
  `sync_state.Property.{last_watermark,last_listing_key}`. It is a
  state-selected repair, not a traversal, so it has no valid cursor position to
  claim — exactly the rule `advancesGlobalCursor` already enforces for scoped
  runs.
- **Rollback:** none required; it only refreshes rows toward source truth. To
  stop, stop scheduling it.
- **Authorization:** it writes to production, so it is OUT of scope for this PR.
  Listed in the authorization package, not executed.

---

## 12. EXTERNAL STATE / UPSTASH — diagnosis and prepared repair

### 12.1 Current, not historical

| probe (2026-08-13) | result |
|---|---|
| `humble-bobcat-71648.upstash.io` | **NXDOMAIN — "Non-existent domain"** |
| `upstash.io` (apex, control) | resolves |
| `api.cotality.com` (control) | resolves → `45.60.11.52` |

The controls matter: the resolver works and Upstash's DNS zone is healthy, so
the failure is specific to **our database's hostname**. Upstash issues one
hostname per database; a suspended or idle database still resolves. A hostname
absent from DNS entirely means **the database no longer exists** (deleted, or its
endpoint retired).

This is a live reading, not a restatement of the 2026-08-02 handoff.

### 12.2 Which failure class this is

| candidate | verdict | basis |
|---|---|---|
| client/env absent | **NO** | `lib/redis.ts:20` constructs the client only when BOTH vars are set; production emits `external_state_unavailable`, which in `main` is reachable from the `!redis` branch *and* the `get` catch — and the 2026-08-02 audit recorded both vars present and Production-scoped |
| auth / token invalid | **NO** | a bad token yields HTTP 401, not a DNS failure; TLS is never reached |
| wrong Vercel environment | **NO** | the cron runs in Production and the vars are Production-scoped |
| transient network | **NO** | NXDOMAIN is authoritative non-existence, and controls resolve |
| **resource deleted** | **YES** | per-database hostname absent from a healthy zone |

Corroboration: production emitted `run_neon_cycle / reason=external_state_unavailable`
at ~12:20 UTC today with 0 `skip_neon`. A working Redis would have produced a
skip once the state persisted.

### 12.3 Why no code change can fix it

`skip_neon` (`app/api/cron/one-cycle-preflight/route.ts:83`) requires a prior
state blob. With the host unresolvable:

- `redis.get()` rejects → `redis_read_failed` → **fail open**, and
- `redis.set()` in `finalizeOneCyclePreflight` also rejects → `redis_write_failed`
  → the state is **never written**.

So the state the skip depends on can never come into existence. The loop is
closed regardless of code. What this PR adds is the ability to SEE which of the
four subtypes is occurring, and a structured event for the case where the
finalize path throws entirely.

### 12.4 Prepared repair — smallest safe action (NOT executed)

1. Confirm in the Upstash console whether database `humble-bobcat-71648` exists.
   Expected: absent.
2. Create ONE new Upstash Redis database (Vercel-integrated or standalone).
   Only a REST URL + REST token are needed; no data migration — the preflight
   blob is a disposable cache that rebuilds itself on the first successful cycle.
3. Set in **Vercel Production** (Preview/Development unchanged):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Redeploy (env changes are build-time-bound for server runtime reads).
5. Remove the dead values only after the replacement is proven — keeping them
   until then means the failure mode stays the known one.

**Rotation:** the old token is bound to a database that no longer exists, so it
grants nothing. Rotation is therefore not a security prerequisite; the new
database issues its own token.

### 12.5 Post-change health test

```
# 1. the host resolves at all
nslookup <new-host>.upstash.io

# 2. runtime subtype flips off the failure classes
#    expect: external_state_finalize -> outcome:"ok"
#    (NOT redis_client_missing / redis_read_failed / redis_write_failed)
```

### 12.6 `skip_neon` proof criteria

A skip requires ALL of: prior state present and parseable, both source heads
unchanged (timestamp AND listingKey AND population-at-head), no forced retry, the
freshness heartbeat not expired (hard-coded 1h, deliberately not env-tunable),
and no backlog due.

Therefore the earliest a legitimate skip can appear is the SECOND poll after the
first successful finalize, and only if the feed is genuinely quiet. Success looks
like:

```json
{"tag":"one_cycle_preflight","event":"skip_neon","skipped":true,
 "neon_touched":false,"reason":"source_unchanged_no_backlog_due"}
```

Accept as proven when at least one `skip_neon` appears AND the preceding
`external_state_finalize` reported `outcome:"ok"`. A skip WITHOUT a prior `ok`
finalize would indicate stale state, not a healthy skip.

**Expected rate is not 100%.** With a 10-minute poll and a 1-hour heartbeat, at
most 5 of every 6 polls can skip even on a totally quiet feed.

---

## 13. MIGRATION TRANSITION — exact sequence (READ-ONLY VERIFIED)

### 13.1 Migration history is clean; `migrate deploy` is NOT blocked

| measure | value |
|---|---:|
| `_prisma_migrations` rows | 33 |
| unique migrations | 31 |
| applied, finished, not rolled back | 31 |
| **rows blocking deploy** (`finished_at IS NULL AND rolled_back_at IS NULL`) | **0** |

The two "extra" rows are historical failures of
`20260310120000_add_consent_and_financial_ledger` and
`20260326120000_add_buildings`. Each has a **paired successful row**, and each
failure row carries `rolled_back_at` — the resolved state. Prisma blocks only on
an unresolved failure, so there is none.

> This CORRECTS the note carried in `20260808020000_add_listing_media_r2_policy_excluded_at`
> (and repeated in this branch's own migration comment) that drift is "a hard
> blocker on any production migration". It conflates two different commands:
> `migrate diff` compares schema and would propose drops; `migrate deploy` only
> applies pending migration FILES and never consults drift. Only `migrate deploy`
> is used here.

### 13.2 The actual drift — 5 empty orphan tables

Present in the DB with no Prisma model: `campaign_recipients`,
`engagement_events`, `experiment_listings`, `financial_ledger`,
`micro_commitments`. **All 0 rows.** Tables in the schema but missing from the
DB: **none**.

`migrate deploy` will not touch any of them. They are NOT dropped by this work —
removing them is a separate decision needing its own authorization.

### 13.3 Order of operations — column BEFORE code

The column must exist before code that references it runs. This is safe in that
order because **current production `main` never selects `last_listing_key`**, so
an extra nullable column is invisible to it.

```
1. (authorized) npx prisma migrate deploy
      → applies ONLY 20260813120000_add_sync_state_last_listing_key
      → verify: exactly one migration applied, name matches

2. verify the column exists and is nullable, and that nothing else changed:
      SELECT column_name, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_name='sync_state' ORDER BY ordinal_position;
      -- expect 10 columns (was 9), last_listing_key TEXT / YES / NULL

3. confirm production is still healthy on the OLD code with the new column
      GET /api/health  → 200

4. merge PR #608 → identify the merge SHA → let Vercel deploy it

5. verify the alias serves that SHA, then watch ONE cron cycle
```

Rollback at any point before step 4 is `ALTER TABLE "sync_state" DROP COLUMN
"last_listing_key";` — safe because nothing reads it yet. After step 4, revert
the code first (the reader tolerates a NULL/absent tie-breaker and falls back to
`MAX(listings.modification_timestamp)`), then drop the column if desired.

---

## 14. COMPLETE ID-LEVEL CENSUS — "ZERO MISSING" NOW PROVEN (supersedes §11)

§11 proved zero-missing for ONE day (291 IDs). That was not a population proof
and the headline overclaimed. This is the complete test.

**Provider population:** every Property row with `StandardStatus IN (Active,
ActiveUnderContract, ComingSoon)`, all `@odata.nextLink` pages followed —
**8,379 rows**, 100% RLS-shaped ListingIds (0 non-conforming).

Compared ID-by-ID against `listings` (ANY local status), in two passes:

| pass | ids | present locally | absent |
|---|---:|---:|---:|
| 1 (explicit list) | 2,100 | 2,100 | **0** |
| 2 (delta-encoded) | 6,279 | 6,279 | **0** |
| **total** | **8,379** | **8,379** | **0** |

| reported field | value |
|---|---|
| provider population | 8,379 |
| local comparable population (Active-ish) | 8,411 |
| provider IDs present locally | **8,379** |
| **provider IDs absent locally** | **0** |
| local-only (locally Active, not provider-Active) | 32 |
| displayable missing | 0 |
| non-displayable missing | 0 |
| sale / rent split (provider) | 7,374 / 1,007 |
| provider MT range | 2025-10 → 2026-08 |

**"ZERO MISSING" IS PROVEN** across the whole current Active-ish population.
The 32 local-only rows are listings we still hold as Active that the provider no
longer reports Active — status drift in the safe direction (we show something as
active slightly too long), not data loss.

> Identity: joined on **ListingId** (`listings.listing_id`), not ListingKey.
> `raw_data.ListingKey` survives on only 1,010 of 24,976 rows (shed, not in the
> keep-list); a ListingKey join would report ~96% of the catalogue as missing.

---

## 15. STALENESS CHARACTERIZED — "4,536 stale" DOES NOT MEAN 4,536 NEED REFRESH

§11.3 reported 4,536 active listings with `last_synced_from_trestle` older than
7 days, all below the bootstrap cursor. That is true, but calling all 4,536
"cursor damage" is NOT supported, and this corrects it.

Measured EXACTLY on the **500 oldest-synced** stale listings — i.e. the actual
first recovery batch, and the cohort most likely to be stale:

| measure | value | share |
|---|---:|---:|
| batch size | 500 | |
| matched to a provider Active-ish row | 494 | |
| no longer provider-Active (status drift) | 6 | 1.2% |
| **provider MT NEWER — genuinely needs refresh** | **62** | **12.6%** |
| MT EQUAL — already materially current | **432** | **87.4%** |
| local MT newer than provider | **0** | — |
| max provider-minus-local | 587,347 min (~408 days) | |

**The key correction:** an old `last_synced_from_trestle` is NOT evidence of
stale data. For 432 of 494 rows the local `modification_timestamp` already equals
the provider's — the listing simply has not changed, so the incremental filter
correctly never returned it. That is the system working, not damage.

> A methodology note: an intermediate run of this comparison reported 208 rows
> with local MT NEWER than provider, which is impossible. The cause was a
> rounding mismatch — JS `Math.floor(ms/60000)` against SQL `::bigint` (which
> ROUNDS). Re-run with `floor()` on both sides: `local_newer = 0`. The figures
> above are the corrected ones.

### 15.1 Revised recovery scope

- Upper bound on rows needing a material write: **4,536** (every stale row).
- Measured rate on the worst cohort: **12.6%** → expected genuinely-stale
  population on the order of **~570**, and 12.6% is likely an OVER-estimate for
  the remaining 4,036 because the oldest-synced cohort is the most divergent.
- The other ~87% cost a fetch plus a comparison, and are suppressed by
  `listingUpdateMateriallyUnchanged` / provenance-only suppression — no write.
- 6 per 500 (~1.2%) are no longer provider-Active and need a status correction.

This materially shrinks the expected write cost of the recovery and is the
number to hold the executor to.

---

## 16. ORPHAN TABLES — FULLY PROVEN ORPHANED, DROP PREPARED (NOT EXECUTED)

| table | rows | inbound FK | outbound FK | views | triggers | indexes | size |
|---|---:|---:|---:|---:|---:|---:|---:|
| campaign_recipients | 0 | 0 | 2 | 0 | 0 | 3 | 24 KB |
| engagement_events | 0 | 0 | 1 | 0 | 0 | 4 | 40 KB |
| experiment_listings | 0 | **1** | 1 | 0 | 0 | 3 | 32 KB |
| financial_ledger | 0 | 0 | 0 | 0 | 0 | 5 | 48 KB |
| micro_commitments | 0 | 0 | 0 | 0 | 0 | 4 | 40 KB |

Two apparent blockers were investigated and both cleared:

1. **`experiment_listings` inbound FK** — it is
   `engagement_events_experiment_listing_id_fkey`, i.e. **internal to the orphan
   set**. Nothing outside the set references any of the five. Drop order must
   therefore put `engagement_events` before `experiment_listings`.
2. **A code hit on `campaign_recipients`** in
   `app/api/crm/listing-campaigns/route.ts` — **false positive**. The matches are
   `MAX_CAMPAIGN_RECIPIENTS` (an env-derived constant) and a TypeScript type
   `CampaignRecipient`. Neither is the table; there is **no Prisma model** for it,
   so no query can reach it.

Also verified: no Prisma model for any of the five; the only SQL references are
their historical CREATE statements in old migrations; no view, trigger, or
function depends on them; total reclaimed space is ~184 KB (negligible — this is
hygiene, not a storage fix).

**Prepared DROP (NOT executed), FK-safe order:**

```sql
BEGIN;
DROP TABLE IF EXISTS "engagement_events";     -- must precede experiment_listings
DROP TABLE IF EXISTS "experiment_listings";
DROP TABLE IF EXISTS "campaign_recipients";
DROP TABLE IF EXISTS "financial_ledger";
DROP TABLE IF EXISTS "micro_commitments";
COMMIT;
```

**Rollback / recreation source:** all five have their original `CREATE TABLE`
DDL in the migration history — `financial_ledger` in
`20260310120000_add_consent_and_financial_ledger`, the rest in
`20260426040000_add_media_metadata`. Recreating them is replaying that DDL. All
are empty, so there is no data to restore.

**Deliberately NOT bundled into the Prisma migration.** The additive
`sync_state` migration must stay exactly one column; mixing unrelated DROPs into
it would violate its own stated scope and make rollback coupled. This is listed
as a SEPARATE authorized mutation.

---

## 17. UPSTASH — EXACT VARIABLE NAMES AND SCOPE

Read-only from code (the values themselves were never read or printed):

| variable | read at | required for |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `lib/redis.ts:20` | client construction |
| `UPSTASH_REDIS_REST_TOKEN` | `lib/redis.ts:20` | client construction |

`lib/redis.ts` constructs the client ONLY when BOTH are present, else exports
`null` (fail-open). Consumers must handle null — `decideOneCyclePreflight`
returns `redis_client_missing` in that case.

Scope: the consumer is the `/api/cron/one-cycle-preflight` cron
(`vercel.json`, `*/10 * * * *`), which runs in **Production only**. Preview and
Development need no change — a null client there is the correct fail-open state
and costs nothing.

**Post-authorization sequence** (env changes bind at deploy time, so the env
update must precede the deployment that should pick it up — no separate
code deploy is needed, it rides with the #608 deploy):

```
1. create ONE replacement Upstash Redis (no data migration — the preflight blob
   is a disposable cache that rebuilds itself on the first successful cycle)
2. nslookup <new-host>.upstash.io           -> must RESOLVE
3. disposable health key round-trip:  SET mallan:health:<ts> -> GET -> DEL
4. set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in Vercel PRODUCTION
5. merge #608 -> that deployment picks up BOTH the new code and the new env
6. verify the deployment carries the new env (not the dead host)
7. observe: {"event":"external_state_finalize","outcome":"ok"}
8. observe the NEXT poll reads that state back (reason is no longer
   redis_read_failed / state_missing_or_invalid)
9. only then look for skip_neon
```

**`skip_neon` proof criteria — do NOT claim success on a working SET/GET.**
A skip additionally requires: unchanged source heads (timestamp AND listingKey
AND population-at-head, on BOTH clocks), no forced retry, the 1-hour freshness
heartbeat not expired, and no backlog due. Accept as proven only when a
`skip_neon` event appears AND the preceding `external_state_finalize` reported
`outcome:"ok"`. Expected steady-state rate is at most 5 skips per 6 polls even
on a totally quiet feed (10-minute poll vs 1-hour heartbeat) — it is NOT 100%.

**Rollback:** restore the previous two env values and redeploy. The system
returns to the current fail-open behaviour, which is the state it is in today —
so rollback is strictly no worse than now.

---

## 18. MEDIA RECOVERY NEEDS A PROPERTY-SIDE KEY LOOKUP (found while building it)

The media lane addresses listings by **ResourceRecordKey**, which is the
Property `ListingKey` — not `ListingId`. Building the recovery executor surfaced
that the residual population has no locally-stored key at all:

| measure (over the exact 97-row selection) | value |
|---|---:|
| residual listings | 97 |
| with `raw_data->>'ListingKey'` | **0** |
| with a usable `mls_id` (present AND `<> listing_id`) | **0** |
| **with NO locally-resolvable ListingKey** | **97 / 97** |

`raw_data.ListingKey` was shed for storage (it survives on 1,010 of 24,976 rows
overall), and `mls_id` is populated on only 1,043 rows. So a Media query keyed
from local data is impossible for this population.

**This is a live hazard, not a nuisance.** `defaultFetchMedia` filters on
`ResourceRecordKey eq '<key>'`. Handing it a ListingId returns an empty set that
is INDISTINGUISHABLE from "this listing genuinely has no media" — and a complete
empty set is allowed to CLEAR. Guessing the key would manufacture a
false-authoritative deletion across the whole residual. The executor therefore
fails closed and skips when no key is provable.

### 18.1 The fix, verified live

A Property lookup by ListingId returns the key, and that key resolves Media
(executed against api.cotality.com, 2026-08-13):

```
GET /odata/Property?$select=ListingId,ListingKey,PhotosChangeTimestamp,StandardStatus
    &$filter=(ListingId eq 'RLS10903071' or ListingId eq 'RLS10941846' or ...)
-> HTTP 200, all 5 sampled resolved:
   RLS10941846 -> ListingKey 1092342380  (PCT 2026-04-07, Active)
   RLS10959460 -> ListingKey 1092341176
   RLS10968192 -> ListingKey 1092326864
   RLS10942326 -> ListingKey 1092323125
   RLS10903071 -> ListingKey 1092246828  (PCT 2026-04-07)

GET /odata/Media?$filter=ResourceRecordKey eq '1092342380'
-> HTTP 200, 5 rows
```

Their PhotosChangeTimestamps (2026-04-07) sit far below the live media cursor
(2026-08-13), independently re-confirming §4.1: the forward-only PCT cursor
cannot reach them, which is why they are residual in the first place.

The lookup MUST be batched with an OR-ed `ListingId eq` filter chunked at **15
IDs**, matching the documented Trestle URL-length limit (`lib/idx/sync.ts:1231`
caps the media batch at 15 for exactly this reason). Resolution order stays
fail-closed: `raw_data.ListingKey` -> `mls_id` (only when `<> listing_id`) ->
Property lookup -> skip untouched.

### 18.2 Consequence for the authorization package

A dry run MUST be executed first and must report `candidate_total ~= 97` and
`skipped_no_resource_key == 0` before any `--execute`. Without the key lookup the
drain is a no-op; with a guessed key it would be destructive. This is why the
media recovery is listed as its own authorized mutation, gated behind its own
dry-run evidence.
