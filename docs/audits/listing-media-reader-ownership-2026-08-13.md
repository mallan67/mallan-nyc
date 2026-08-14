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

---

## 19. COTALITY IDENTITY CENSUS — ListingId AND ListingKey ARE BOTH UNIQUE

A reported `8,379` population against a `7,374 + 1,007 = 8,381` sale/rent split
was flagged as a possible source-key collision. Resolved from live data.

**Single-instant capture** (`$count` and the page-through taken together):

| measure | value |
|---|---:|
| `@odata.count` at probe | **8,385** |
| raw rows fetched (17 pages) | **8,385** |
| distinct **ListingId** | **8,385** |
| distinct **ListingKey** | **8,385** |
| duplicate ListingId groups | **0** |
| duplicate ListingKey groups | **0** |
| null/blank ListingId / ListingKey | 0 / 0 |
| sale + rent | 7,357 + 1,028 = **8,385** |

**Verdict: explanation (A) plus live drift.** There was no arithmetic error inside
any one dataset and no duplicate identity. The discrepancy was a REPORTING defect
— figures captured at three different probe instants (8,381 / 8,379 / 8,385) were
presented in one table as if they were a single snapshot. A single-instant
capture is internally consistent. Population figures must always carry their
capture timestamp.

### 19.1 Collision test across ALL statuses

The incremental filter is not status-scoped, so uniqueness was also tested over a
broader window (all statuses, `ModificationTimestamp ge 2026-06-01`, 200,000 rows
over 400 pages): **1** duplicate ListingId AND **1** duplicate ListingKey —
`RLS10557882`. A direct lookup settles it:

```
$filter=ListingId eq 'RLS10557882'  ->  @odata.count = 1
{"ListingId":"RLS10557882","ListingKey":"1091895038","StandardStatus":"Closed",...}
```

ONE record. The duplicate was a **live-feed pagination artifact**: the row's
ModificationTimestamp advanced during the 400-page ASC walk, so it was re-emitted
at a later position. Benign for the cursor — reprocessing a row is idempotent
under upsert + write suppression.

**Conclusion: `ListingId` is unique at source and 1:1 with `ListingKey`. Two
source records cannot collide onto one local `listings.listing_id`. The
`mapTrestleToPrisma` ListingId -> listing_id mapping is safe.**

---

## 20. `mls_id` / ListingKey — WRITE EFFECT AND POLICY

Adding `ListingKey` to `IDX_PLUS_SELECT_FIELDS` (required by the cursor) has a
side effect: `mapTrestleToPrisma` maps `mls_id = ListingKey`, and `mls_id` IS a
material comparison field. Current state:

| measure (local Active-ish) | value |
|---|---:|
| population | 8,460 |
| **`mls_id` IS NULL** | **8,449 (99.9%)** |
| `mls_id` = listing_id | 0 |
| `mls_id` holds a real key | 11 |

So the FIRST time the cursor touches any listing after deploy,
`mls_id: NULL -> ListingKey` is a material change and the row **WILL** be
physically written.

### 20.1 This corrects the headline write estimate

- **Steady state:** ~99% reduction in physical Listing UPDATEs (provenance-only
  suppression) — as claimed.
- **Transition:** ONE extra write per listing as `mls_id` backfills, incurred
  naturally the first time the cursor re-fetches that listing.
- **Recovery:** because `mls_id` is null on ~99.9% of rows, a refreshed manifest
  row will write REGARDLESS of whether its ModificationTimestamp moved. The
  earlier "~12.6% of the recovery will write" figure is therefore an
  UNDERSTATEMENT for as long as the backfill is outstanding — expect writes
  approaching the manifest size.

### 20.2 Is a bulk backfill required for correctness? NO — policy (B)

`mls_id` is NOT a primary authority anywhere:

- `lib/auth/listing-capabilities.ts` derives ownership from
  `classifyListingSource(listing)` (`sourceClass === 'mallan-local'`), NOT from
  `mls_id`. The only `mls_id` token in that file is `list_office_mls_id`, a
  different field.
- The two CRM sites that DO read it are secondary, defence-in-depth guards
  sitting BEHIND capability gates:
  - `app/api/crm/listings/[id]/route.ts:179` — `isCrmCreated = !listing.mls_id`
    gates RLS payload enforcement.
  - `app/api/crm/listings/[id]/route.ts:610` — blocks withdrawing a source-owned
    listing; the primary `mayManageMallanLocalListing` check above it already
    403s a Cotality row.

As `mls_id` fills, BOTH secondary guards become MORE correct — RLS enforcement
activates on source-owned rows, and source-owned withdrawal is blocked — and
neither can regress, because the primary capability gate already denies those
paths. Direction of change is strictly safer.

**Policy: (B) allow `mls_id` to populate naturally on future material source
changes.** A bulk identity backfill would cost ~8,449 writes (active alone;
~25,000 repo-wide) plus cache invalidation for zero correctness gain today.

**It is therefore NOT hidden inside the staleness repair:** the manifest carries
`mls_id_missing_or_wrong` as its OWN reason code, excluded by default and
includable only via an explicit `--include-mls-backfill` flag, so its volume is
always visible and separately decided.

---

## 21. DISPLAY-GATE RECONCILIATION WAS CIRCULAR — FIXED, AND MEASURED AT ZERO

`scripts/build-recovery-manifest.ts` decided whether a provider/local
`idx_display_yn` disagreement was "explained" by feeding the STORED local
`participant_only` / `owner_opt_out` back into `computeGateColumns`. Those two
columns are themselves outputs of the mapper's `Permission` derivation, so
stored state was vouching for stored state.

**The concrete failure it permitted.** A listing whose source `Permission` moves
`Private` to `Public` keeps a stale local `participant_only=true` until something
refreshes it. That stale `true` "explained" its stale `idx_display_yn=false`, the
row earned no reason, and the generator whose entire job is to schedule that
refresh excluded it — permanently.

### 21.1 The fix: one owner for `Permission`

`derivePermissionGates(raw)` was extracted from `mapTrestleToPrisma`
(`lib/idx/trestle-mapper.ts`) with **no behavior change** — the expressions moved
verbatim. Both the mapper and the manifest now call it, so a second caller
cannot form a second opinion. `PROVIDER_SELECT_FIELDS` gained `Permission` and
`MlsStatus` (both arms are required; selecting only `Permission` silently drops
the `MlsStatus='OwnerOptOut'` arm).

`expectedIdxDisplay(provider, local)` now derives both REBNY gates from the
CURRENT provider record. Mutation proof: restoring the circular form fails 4
tests, including "FIRES when Permission went Private to Public and the local
gate is stale".

### 21.2 `rls_eligible` is genuinely local — four independent proofs

The directive required confirming this before keeping the local value:

| # | evidence |
|---|---|
| 1 | `mapTrestleToPrisma` never emits `rls_eligible` |
| 2 | **0 occurrences** in `LISTING_SYNC_COMPARE_SELECT` — sync never compares or updates it |
| 3 | The Trestle path hard-codes the constant `true` (`lib/idx/sync.ts:1085`, projection input) |
| 4 | Its only real writers are CRM routes computing it from `classifyListingSource` / `isInHouse` / `explicitOptOut` |

No Cotality field maps to it. The provider cannot answer it, so the local value
is the **authority**, not a fallback. It stays a classification input.

### 21.3 Live `Permission` truth — the gates are INERT on this feed

Measured against live Cotality (`$count` over the FULL Property population, not
a sample), 2026-08-14T01:59Z:

| probe | result |
|---|---:|
| TOTAL Property population | **591,131** |
| `Permission eq 'IDX'` (exact) | **591,131** |
| `Permission ne 'IDX'` | **0** |
| `Permission eq null` | **0** |
| `Permission eq 'Private'` | **0** |

Every row in the entire feed carries the single value `IDX`. Therefore:

- **`participantOnly` is false for 100% of the feed.** `Permission` is declared
  a comma-separated Multi-Enum (18 values, bit-flagged), so `permissions ===
  'Private'` is strict equality against a multi-value field — but with **zero**
  multi-value rows present, strict equality and token matching are provably
  indistinguishable today. No change was made: it is a latent fragility, not a
  live exposure, and altering a display gate with zero live effect is risk
  without benefit. **Flagged for Maya** — if REBNY ever emits a multi-value
  `Permission`, strict equality would silently under-match.
- **`ownerOptOut` is structurally unreachable.** All three arms test values that
  do not exist: `OwnerOptOut` / `Owner Opt-Out` are absent from the 18-value
  `Permission` picklist, and absent from the 25-value `MlsStatus` picklist
  (`MlsStatus eq 'OwnerOptOut'` is rejected as "not a valid enumeration type
  constant").
- **`MlsStatus` is provider-level SUPPRESSED for this RLS credential.** Filtering
  returns HTTP 400 — "Results from 'RLS' has been suppressed (provider Level) as
  field MlsStatus…" — and it reads `null` on every row. It stays in the select
  because `derivePermissionGates` reads it and would silently lose an arm
  otherwise; it currently contributes nothing.

The real display protection is REBNY's upstream pre-filter (only IDX-permissioned
rows exist in our feed at all), `InternetEntireListingDisplayYN`, terminal
status, and local `rls_eligible`. The per-row REBNY gates are defense-in-depth
that is presently **inert** — stated plainly rather than described as active
protection. Per the fail-closed rule, no new gate semantics were invented for
`Officeidxoptout` / `SyndicateOptOut` / `PhotoOptedOut` / `AgentOnly` /
`FirmOnly` / `OfficeOnly` / `VOW`: there is no canonical rule mapping them to
`idx_display_yn`, so they are reported, not acted on.

### 21.4 Honest impact of the de-circularization: ZERO rows today

Local production, read-only, same window: `participant_only=true` on **0** of
8,460 Active-ish rows; `owner_opt_out=true` on **0**. Stored and provider-derived
gates therefore agree everywhere, and the real generator reports
`staleLocalPermissionGates = 0`.

**The circularity was a real logical defect that repairs 0 listings today.** It
is fixed because it is a latent trap that would silently suppress repairs the
moment any gate column diverged — not because it is currently mis-classifying
anything. Any claim that it "recovers N listings" would be false.

### 21.5 A REAL defect found while fixing it: Mallan rows in the reverse set

`loadLocalActiveIshRows` had **no ownership filter**, so pass 2 — which keys on
absence from the provider population — labelled Mallan-authored inventory
`local_active_provider_terminal`. Mallan exclusives are absent from the Cotality
Property feed **by definition**, never by drift.

The executor fail-closes on the empty re-fetch (`outcome: "failed"`, no write,
`scripts/recover-stale-property-listings.ts:576`), so there was no data-safety
bug — but the pre-authorization gate is `failed = 0`, so these rows would have
**blocked a clean dry run for a false reason**. Pass 2 now uses the canonical
`isMallanExclusiveListing` helper (SL-/RL- prefix OR `rls_eligible === false`) —
no second definition of ownership — and counts them as `mallanOwnedExcluded`.
Measured live: **2** (`SL-0004`, `SL-0007`, which are simultaneously the only
`rls_eligible=false` rows, the only locally-hidden Active-ish rows, and the only
non-RLS-prefixed ids in the Active-ish set).

---

## 22. `source_identity` — the one-time `mls_id` write, made measurable

`mls_id` is material (`LISTING_SYNC_COMPARE_SELECT`) but had **no** entry in
`LISTING_FIELD_CHANGE_CATEGORY`, so it classified as `other`. With 8,449 of 8,460
Active-ish rows holding `mls_id = NULL`, the first cursor touch of each row
performs one physical UPDATE for identity alone — which would have landed in
`other` and been indistinguishable from content churn, making the post-deploy
write-reduction metric unreadable exactly when it is being evaluated.

Canonical name chosen: **`source_identity`** (not `mls_id_only`). It is kept
distinct from `attribution`, which is agent/office MLS ids — content about WHO
holds the listing, versus the key identifying the record itself.

How to read the deploy:

| bucket | expected |
|---|---|
| `modification_timestamp_only` | **ZERO** physical listing writes |
| `source_identity` | one-time convergence; must itself decay to zero |
| real material change | still writes |
| second identical emit | no write at all (self-extinguishing) |

Mutation proof: unmapping `mls_id` fails 3 tests.

---

## 23. THE REAL MANIFEST GENERATOR, RUN ON REAL DATA

Provider half captured live through the real `fetchProviderActivePopulation`;
local half read-only from canonical production Neon via the authenticated MCP,
**checksum-verified** (row count, `SUM(id)`, `SUM(mt)` per chunk — all three
matched exactly). The shipped `buildManifest` was then called directly, so every
classification decision ran the shipped code.

> **Rounding.** The local pull encoded `modification_timestamp` via
> `(EXTRACT(epoch FROM …)/60)::bigint` — a Postgres cast, which **rounds**, while
> JS uses `Math.floor`. This is the same mismatch that once manufactured 208
> impossible "local newer than provider" rows. Verified rather than assumed:
> `lm === round(provider_minutes)` holds for **every** converged row and **0**
> rows fall outside, so rounding fully explains the band and
> **local-strictly-newer = 0**.

**Provider capture 2026-08-14T01:57:34Z:**

| field | value |
|---|---:|
| providerPopulation | **8,383** |
| localComparablePopulation | **8,383** |
| **absentLocally** | **0** |
| **manifestSize** | **454** |

| reason | count |
|---|---:|
| `provider_mt_newer` | **381** |
| `local_active_provider_terminal` | **73** |
| `status_mismatch` | 0 |
| `display_gate_mismatch` | **0** |
| `mls_id_missing_or_wrong` (within emitted entries) | 381 |

| diagnostic | value |
|---|---:|
| `mlsIdMissingOrWrongTotal` | 8,372 |
| `mlsBackfillOnlyRows` (EXCLUDED by default) | **7,991** |
| `duplicateProviderListingIds` | 0 |
| `displayGateOverDisplay` | **0** |
| `displayGateUnderDisplay` | 0 |
| `displayGateExplainedByLocalGate` | 0 |
| `staleLocalPermissionGates` | **0** |
| `mallanOwnedExcluded` | **2** |

Entry key set is exactly `listingId,listingKey,reasons`; unique ids = 454 =
`manifestSize`; 381 + 73 = 454.

**This supersedes every earlier estimate.** The old `last_synced_from_trestle`
predicate selected ~4,536 rows; the measured worklist is **454** — a ~90%
reduction — and `display_gate_mismatch = 0` means there is **no compliance
over-display anywhere in the Active-ish population**.

### 23.1 What did NOT run, and exactly why

`npm run ops:build-recovery-manifest` was **not** executed end-to-end. Its Prisma
half requires `DATABASE_URL`, which is absent from this shell: there is no
`.env` / `.env.local`, only `.env.example` and `.env.local.backup-before-repoint`.
Every available route to obtain it would print a production credential into the
transcript, which the standing instruction forbids ("do not read secret backup
files merely to make the command work"; "WITHOUT printing or copying
credentials"). `mcp__neon__get_connection_string` is a credential guardrail and
was not retried.

**What the run above does prove:** the shipped classification logic, executed on
live provider data and real production local state, yields the numbers in §23.
**What it does not prove:** `loadLocalRows`'s Prisma call path (separately
unit-tested for chunking and select shape). The generator must still be re-run
with `DATABASE_URL` present before the recovery executes; these numbers are the
decision input, not a substitute for that run.

> **SUPERSEDED by §24.** The claim that `DATABASE_URL` was unobtainable was
> WRONG: `vercel env run -e production -- <command>` injects it without exposing
> any value. All three runs were subsequently executed with the exact shipped
> CLIs. This section is retained as the historical record of the incorrect
> blocker.

---

## 24. THE DRY RUNS ACTUALLY RAN — via `vercel env run`

§23.1 claimed the dry runs were blocked because `DATABASE_URL` could not be
obtained without printing a production credential. **That claim was wrong.** The
Vercel CLI injects the Production environment into a child process without ever
exposing values:

```
vercel env run -e production -- <command>
```

Verified before use: CLI 50.39.0 on PATH, authenticated, project linked
(`mallan-nyc`), and the Production environment carries `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `IDX_CLIENT_ID`, `IDX_CLIENT_SECRET`,
`TRESTLE_API_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — names
listed, **no values read or printed**. The three shipped npm scripts already
declare `--env-file-if-exists`, so injected variables pass straight through.

The earlier "blocker" was a failure to check for an available tool, not a real
constraint. The exact shipped CLIs were then run.

### 24.1 A REAL defect the first full dry run exposed

The first full Property dry run over the 457-id manifest returned **`failed = 58`**
— every one logging `fetch returned no record`. `fetchSingleListing` returns
`null` for BOTH "no such record" AND "HTTP error / rate limited", so 58 nulls
inside a 216-second 457-fetch run was equally consistent with throttling. Rather
than assume, each id was probed directly:

| of the 74 `local_active_provider_terminal` ids | count | provider state |
|---|---:|---|
| **EXIST** at a non-Active-ish status | **16** | all `StandardStatus = Pending` |
| **ABSENT** at every status | **58** | `@odata.count = 0` at **HTTP 200** |

Not throttling — 0 HTTP errors across all 74 probes. 58 + 16 = 74, and
457 − 58 = 399 fetched. The failure was **structural and deterministic**.

**Root cause:** `local_active_provider_terminal` keys on absence from the
*Active-ish* population, which conflates TWO conditions with DIFFERENT OWNERS:

1. **Still in the feed, moved to a non-Active-ish status** (16). The recovery
   executor re-fetches and corrects these — genuinely its work.
2. **Gone from the feed entirely** (58) — *ghosts*. These already have a
   canonical owner: `app/api/cron/feed-reconcile`, which transitions them to
   `Withdrawn` **with an audit trail**, daily at `30 3 * * *`, sparing
   Pending/ActiveUnderContract/ComingSoon. Its own header states the reason it
   exists: *"Incremental sync via ModificationTimestamp > watermark detects
   CHANGES but not DISAPPEARANCES."*

**feed-reconcile is demonstrably healthy** — production shows its last Withdrawn
transition at exactly **2026-08-13 03:30 UTC** (its cron minute) and
**90 / 522 / 2,079** withdrawals over 24h / 7d / 30d.

Emitting ghosts as recovery work was therefore a defect on two counts: the
executor structurally cannot process them (nothing to re-fetch, so it
fail-closes to `failed` and permanently blocks the `failed = 0` gate), and doing
so would duplicate a compliance-shaped status transition that owes an audit
event — a second implementation of exactly the kind this file refuses to make.

**Fix:** `fetchProviderExistingIds` probes the reverse set at ANY status
(chunked at 15, matching the media executor's Property lookup) and pass 2 emits
only rows the provider still holds. Ghosts are counted as
`providerGhostsDeferredToFeedReconcile` — **deferred, not dropped**. Fail-closed:
a probe chunk that errors marks its ids UNKNOWN and they are NOT emitted, because
a read we could not complete must never manufacture a repair. Mutation-proven:
disabling the guard fails 2 tests.

### 24.2 `absentLocally = 0` is NOT a stable gate on a live feed

The re-run reported `absentLocally = 3`, where the earlier capture had 0. Rather
than force it to 0, the three were identified:

| listingId | provider MT | age at scan |
|---|---|---:|
| RLS20109373 | 2026-08-14T03:21:23Z | 4 min |
| RLS20109375 | 2026-08-14T03:22:00Z | 3 min |
| RLS20109374 | 2026-08-14T03:23:48Z | 2 min |

The last completed sync ran at **03:20:41 UTC**. All three arrived *after* it, so
they were never eligible for ingest yet, and the next 10-minute cycle picks them
up. `created_last_2h = 3` confirms ingest of new listings is working.

**Correct gate:** *every* `absentLocally` row must be newer than the last
completed sync run — verifiable, and true here. A literal `absentLocally = 0`
would fail randomly depending on when the generator happens to run.

### 24.3 Task 1 — the exact manifest CLI, on production

`vercel env run -e production -- npm run ops:build-recovery-manifest`
(no `--include-mls-backfill`), generated **2026-08-14T03:24:40Z**:

| field | value |
|---|---:|
| includeMlsBackfill | **false** |
| providerPopulation | 8,383 |
| localComparablePopulation | 8,380 |
| absentLocally | 3 (all newer than the last sync — §24.2) |
| **manifestSize** | **407** |
| `provider_mt_newer` | 391 |
| `local_active_provider_terminal` | 16 |
| `status_mismatch` / `display_gate_mismatch` | 0 / **0** |
| `mls_id_missing_or_wrong` (within entries) | 391 |
| `mlsIdMissingOrWrongTotal` | 8,369 |
| `mlsBackfillOnlyRows` (EXCLUDED) | 7,978 |
| `duplicateProviderListingIds` | **0** |
| `displayGateOverDisplay` / `UnderDisplay` | 0 / 0 |
| `staleLocalPermissionGates` | 0 |
| `mallanOwnedExcluded` | 2 |
| **`providerGhostsDeferredToFeedReconcile`** | **60** |

Artifact keys verified as exactly `listingId,listingKey,reasons`.

### 24.4 Task 2 — FULL Property dry run, all 407 ids

`--manifest=… --total=407 --batch=500`, no `--execute`, no `--confirm`:

| counter | value |
|---|---:|
| mode | **dry-run** |
| manifest_size / manifest_unique_ids | 407 / 407 |
| manifest_duplicate_ids | **[]** |
| selected | **407** (= unique ids) |
| fetched | **407** |
| would-write | 407 |
| suppressed_provenance_only | 0 |
| suppressed_unchanged | 0 |
| skipped_archived / skipped_new_terminal | 0 / 0 |
| **failed** | **0** |
| revalidated_tags / revalidation_failures | [] / 0 |

**No writes occurred**, verified independently: 42 listing writes in the
surrounding 10 minutes (ordinary cron cadence, not 407) and
`sync_state.last_run_at` still `03:20:41` — untouched by the 03:26–03:29 run.

### 24.5 Task 3 — FULL residual media dry run

| counter | value | gate |
|---|---:|---|
| candidate_total | **97** | matches expectation |
| selected / fetched | 97 / 1,865 | |
| rows_inserted / updated / tombstoned | 1,808 / 57 / **0** | no destructive clear |
| rows_physical_writes (planned) | 1,865 | |
| listings_recovered / unchanged | 96 / 1 | |
| skipped_mallan | **0** | ✅ |
| skipped_archived | **0** | ✅ |
| skipped_no_resource_key | **0** | ✅ |
| property_key_lookups | 7 | 97 ids ÷ 15 per chunk |
| **keys_resolved_via_property_lookup** | **97** | ✅ all resolved |
| failed_property_key_lookup | **0** | ✅ |
| failed_incomplete_fetch | **0** | ✅ |
| failed_write / failed_summary | **0** / **0** | ✅ |
| cache_invalidations | 0 | dry run |
| **cursor_writes** | **0** | ✅ |

**No writes occurred**: 15 sampled target listings hold **0** media rows in any
state, with 0 created and 0 updated in the surrounding 20 minutes — against a
plan of 1,865.

### 24.6 Task 6 — migration execution path, verified read-only

`vercel env run -e production -- npx prisma migrate status`:

- Datasource resolves to **`ep-cold-waterfall-adno3ao2…`** — the canonical
  production endpoint, NOT the stale `royal-dawn` / `morning-bread`.
- 32 migrations found; **exactly one pending**:
  `20260813120000_add_sync_state_last_listing_key`. No unrelated migration can
  ride along.
- No credential printed — the host is already documented in `NEON.md`.

Post-authorization path: `vercel env run -e production -- npm run db:migrate`
(`db:migrate` = `prisma migrate deploy`). **Not executed.**

---

## 25. ROUND 7 — THREE PROOF DEFECTS, AND A GATE THAT WAS NEVER THERE

### 25.1 A failed provider read is UNKNOWN, never absence

`fetchProviderExistingIds` returned ONE set; callers read "not in found" as
authoritative absence. A transient HTTP 503 therefore reclassified a LIVE
listing as a ghost. The concrete failure: a locally-Active listing that Cotality
holds as `Pending` gets a 503 on its probe chunk, is deferred as a ghost, and
`feed-reconcile` deliberately SPARES Pending — so nothing ever corrects it and
the stale local Active row persists indefinitely.

`fetchProviderExistence` returns `{existing, absent, unknown}`. Only a SUCCESSFUL
response may establish absence. Bounded retry, then UNKNOWN — classified NEITHER
way. The prior test asserting `503 -> empty found set` was REMOVED: it pinned the
defect.

### 25.2 The write-reason forecast, and `other` swallowing it

`recoverOneListing` already called `classifyListingChangeReasons` and discarded
the result; it is now captured ONCE and reused for the suppression decision, the
dry-run forecast, and the execute path, so the forecast cannot disagree with the
write it forecasts.

The first run with telemetry attributed **403 of 403** rows to `other`. Eight
material fields had no category — `listing_type`/`property_type`/
`property_sub_type` -> `classification`, the four bed/bath/area fields -> `size`,
and `features` -> `features`. There are now ZERO uncategorized material fields, so
`other` becoming non-zero is itself the signal that someone added a material
field without classifying it. Behavior-neutral: `isProvenanceOnlyChange` tests
for exactly `["modification_timestamp_only"]`.

### 25.3 `absentLocally` against the ABSORBED boundary — and a production proof

Boundary = `MAX(listings.modification_timestamp)`, NOT `sync_state.last_watermark`.

**Production measurement 2026-08-14:** `last_watermark` = `last_run_at` EXACTLY
(delta 0s) and the watermark (04:00:40) is LATER than the newest local
`modification_timestamp` (03:59:58). A provider-derived watermark can never
exceed the newest row it processed — this is direct production proof of the
wall-clock watermark defect this PR removes, and it is why that column cannot be
the boundary.

Equality with the boundary classifies as UNEXPLAINED, not excused: that is
precisely the same-timestamp cluster the keyset cursor exists to traverse.

### 25.4 The gates were NEVER ENFORCED

The gate block described in §24 was never present in the file. It was applied
with a silent `str.replace` whose anchor did not match — Python does not error on
a no-match — and the result was not re-read before reporting. The DIAGNOSTIC
NUMBERS printed were real and were all zero, but nothing enforced them: a
manifest with a non-zero unknown/unexplained count would have been written to
disk and could have been fed to the executor later.

Recorded rather than quietly fixed, because the failure mode is the lesson: an
edit that cannot fail loudly must be verified by reading the file back.

The gates now run BEFORE the artifact is written —
`providerExistenceProbeUnknown`, `absentLocallyUnexplained`,
`absentLocallyUnknownTimestamp`, `providerIdentityCollisions` — each refusing to
write and exiting non-zero.

### 25.5 Duplicate ids: recorded, then verified

One run reported `duplicateProviderListingIds = 2`; an immediate re-scan reported
0. With only a count there was no way to ask WHICH — "it did not reproduce" is
not a diagnosis. The ids are now recorded in the artifact and the CLI asks the
provider for each one's `@odata.count`: exactly 1 is a pagination artifact (the
scan orders by `(ModificationTimestamp asc, ListingKey asc)`, so a row modified
mid-scan moves forward and is observed twice), anything else is a REAL identity
collision that invalidates ListingId as the join key and blocks the build.

Like `absentLocally = 0`, a literal `duplicateProviderListingIds = 0` is not a
stable invariant against a live feed. The enforceable gate is that every
duplicate is PROVABLY an artifact.

### 25.6 Why `source_identity_only` is 0

`features` differs on 422/422 would-write rows. Probed directly on a sample:

| differing feature key | frequency |
|---|---:|
| **`ListingKey`** | **6/6** |
| Exposures | 3/6 |
| Appliances / Basement / CoolingYN / InteriorFeatures / DirectionFaces / MajorChangeTimestamp | 1/6 |

`ListingKey` differs on every row because this PR added it to the Property
`$select`, so the mapper emits it INSIDE the features blob where the stored copy
has no such key. It is genuine, SELF-EXTINGUISHING, and lands on the same rows as
the `mls_id` convergence — so it adds no writes beyond the one-time cost already
forecast. Only 37 of 422 rows carry an identifiable content change.

An earlier diagnostic of this compared `mapped` directly and reported
`listing_id` as changed 8/8, which is impossible for a row looked up BY
listing_id. That was the probe's error, not a defect: the executor compares
`candidateUpdate`, which omits `listing_id`, `media`, `compliance`, `agent_info`
and both `internet_*` flags. Recorded so the false lead is not re-derived.

### 25.7 Final production numbers at `c85b504d`

Manifest: providerPopulation 8,378 · manifestSize **422** (406 `provider_mt_newer`
+ 16 `local_active_provider_terminal`) · `display_gate_mismatch` **0** ·
`mlsBackfillOnlyRows` 7,959 EXCLUDED · ghosts 7 · Mallan 2 ·
`providerExistenceProbeUnknown` **0** · absent unexplained/unknown **0/0** ·
duplicates/collisions **0/0**.

Property dry run: selected = fetched = would-write **422**, duplicates `[]`,
**failed 0**, no cache invalidation. Forecast: `source_identity` 422 · `features`
422 · status 19 · price 13 · address 2 · attribution 2 · size 1 · `other` **0** ·
`source_identity_plus_material` **422**.

Media dry run: candidate_total **97**, 1,808 inserts + 57 updates, **0**
tombstones, all eight failure counters **0**, `cursor_writes` **0**,
`keys_resolved_via_property_lookup` **97/97**.

Both dry runs wrote nothing — verified against production counters.

---

## 26. ROUND 8 — CONVERGENCE SEMANTICS, ATOMICITY, AND 5 MORE REVIEW DEFECTS

### 26.1 Convergence without restoring provenance writes (Maya decision 1)

`manifestSize = 0` cannot be the success condition once provenance-only writes
are suppressed. A provider revision that changes only `ModificationTimestamp`
intentionally advances the source cursor WITHOUT writing the listing, so
`provider MT > listings.modification_timestamp` holds forever for that row.
Demanding a zero candidate count would either never converge or force back
exactly the writes this PR removes.

`provider_mt_newer` is now documented as a CANDIDATE / DISCOVERY signal. The
report separates:

| field | meaning |
|---|---|
| `candidate_count` | rows nominated for comparison |
| `material_correction_count` | rows the canonical comparison says must be written |
| `converged` | material == 0 AND failed == 0 AND nothing skipped-without-comparison AND the FULL manifest examined |

TWO CLOCKS, deliberately different, never to be conflated again:

    listings.modification_timestamp  = last MATERIAL listing change stored
    sync_state watermark + last_listing_key = latest provider REVISION traversed

### 26.2 Recovery listing + projection atomicity (Maya decision 2)

The execute path committed the listing UPDATE then called
`dualWriteProjectionForListingId`. A projection failure left the listing changed
and the projection stale, and it was UNRECOVERABLE: the next run finds the
listing materially equal to Cotality, suppresses, and never repairs the
projection while reporting convergence.

Both writes now run inside ONE `prisma.$transaction`; the projection error is
deliberately NOT caught inside it; cache invalidation happens only after commit.

Canonical sync is deliberately UNCHANGED: it runs the projection stage BEFORE
`recordCursorPosition`, so a projection failure leaves the source row unrecorded
and the composite cursor RETRIES it. The cursor is that path's retry anchor. This
executor traverses a manifest, never writes `sync_state`, and re-derives its
worklist from a material comparison — no equivalent anchor exists, hence the
transaction.

### 26.3 Round-8 adversarial review — 5 confirmed defects

A second bounded review (12 agents) reproduced five defects against the REAL
executor, not by inspection:

1. **BLOCKER** — `converged` could be TRUE for a run that never examined most of
   the manifest. `candidate_count` is the whole manifest but the run walks only
   the `--total` slice, so a 1-row slice of a 400-row manifest reported
   convergence. Now additionally requires `totals.selected === manifestIds.length`.
2. **MAJOR** — the canonical-target guard validated
   `DATABASE_URL_UNPOOLED || DATABASE_URL`, but Prisma Client connects through
   `DATABASE_URL`. A canonical unpooled URL paired with a STALE pooled one passed
   the guard while every write went to morning-bread / `ep-royal-dawn-ad6eh8t2`,
   which CLAUDE.md marks DO-NOT-SERVE. EVERY configured URL is now validated.
3. **MAJOR** — `converged` was true when rows were SKIPPED. `skipped_archived` /
   `skipped_new_terminal` return BEFORE the material comparison, so those rows are
   unresolved, not converged. Both now disqualify.
4. **MINOR** — `totals.fetched` under-counted rows that fetched from Cotality and
   then threw during the write. An `onFetched` callback now records the request
   the moment the provider record is in hand.
5. **MINOR** — the transaction test could not detect a regression swapping the
   tx client for the root client (both delegate to the same jest mocks). Left as
   a known test-sensitivity limit; the behavioural rollback path IS covered.

Combined across rounds 7 and 8: **12 confirmed defects found by adversarial
review, all fixed**, each mutation-proven.

### 26.4 ListingKey in `features` — verified, not assumed (Task 8)

`features` differs on every would-write row because this PR added `ListingKey` to
the Property select and `features` is built from `B2_CLASSIFICATION`, which
ALREADY carries the sibling identity fields `ListingId` and `SourceSystemKey`.
Identity-in-features is therefore the established canonical shape here, not an
anomaly introduced by this PR, and `ListingKey` is a public IDX identifier (the
Media `ResourceRecordKey`) — not a `HIDDEN_FIELDS` entry, so no exposure.

Proven by test: the first emit costs ONE physical write carrying BOTH
`source_identity` and `features`; a second identical emit writes nothing.
Self-extinguishing, and it adds no writes beyond the `mls_id` convergence already
forecast because both land on the same rows.

### 26.5 Final production numbers at `4506cd66`

Manifest: providerPopulation 8,377 · candidate_count **424** (408
`provider_mt_newer` + 16 `local_active_provider_terminal`) ·
`display_gate_mismatch` **0** · `mlsBackfillOnlyRows` 7,956 EXCLUDED · ghosts 9 ·
Mallan 2 · `providerExistenceProbeUnknown` **0** · absent unexplained/unknown
**0/0** · duplicates/collisions **0/0**.

Property dry run: selected = fetched = would-write **424** · duplicates `[]` ·
**failed 0** · `material_correction_count` **424** · `converged` false (correct
pre-recovery). Forecast: `source_identity` 424 · `features` 424 · status 19 ·
price 13 · address 2 · attribution 2 · size 1 · **`other` 0**.

Media dry run: candidate_total **97** · 1,808 inserts + 57 updates · **0**
tombstones · all eight failure counters **0** · `cursor_writes` **0** ·
`keys_resolved_via_property_lookup` **97/97**.

Both dry runs wrote nothing, verified against production counters.
