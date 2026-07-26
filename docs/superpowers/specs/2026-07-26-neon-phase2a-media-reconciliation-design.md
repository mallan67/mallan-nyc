# Neon write-amplification — Phase 2A design: authoritative media reconciliation + PCT-only write suppression

> **Status:** DESIGN / SPEC (awaiting Maya spec-review). Doc-only — no schema, code, or
> migration is applied by this document.
> **Workstream:** continuation of the Neon write-amplification effort (Phase-1 forensic
> `docs/operations/neon-write-amplification-forensic-2026-07-25.md` + capture
> `docs/operations/neon-write-amplification-capture-2026-07-26.md`).
> **Branch:** `fix/neon-write-amp-phase2a-media-reconcile-2026-07-26` (single branch → single PR).
> **Gates honored:** schema-migration hold (CLAUDE.md §C), NEON.md migration discipline (§4/§5),
> compliance-first §D (Media §8, terminal/display gates §5/§7), fail-closed §E, proof-first §F.
> **Phase 2B (just-in-time signed-URL resolution / eliminating `delivery_url_refreshed`) remains HELD** —
> not in scope here and not to be started concurrently.

---

## 1. Goal (Maya, 2026-07-26)

> **Eliminate `PhotosChangeTimestamp`-only full `listings`/`raw_data` rewrites without risking
> stale or incorrectly-retained media** — by completing an *authoritative* media-reconciliation
> safety mechanism first, then suppressing the PCT write churn on top of it.

Two outcomes, in this order:

1. **Safety first** — a two-strike, corroborated guard against **any implicit disappearance** of
   previously-active feed media (shrink, a vanished MediaKey, or empty), plus a **source-set
   validity gate**, backed by a per-listing media sync-state + stable set-hash — so a
   *technically-successful-but-transient/short/invalid 200* from Cotality can never be mistaken for a
   real removal and mass-tombstone live photos.
2. **Then write reduction** — once (1) exists and its tests pass, stop the PCT-only full-row
   rewrite: a PCT-only event whose stable media set is unchanged updates only the lightweight
   sync-state row and does **not** rewrite `listings.raw_data` or invalidate listing/search caches
   or warm manifests.

---

## 2. Verified current state (source-grounded, file:line)

All claims below were verified by direct source read on this branch's base (`main` @ `ccfb4e85`).
This section is the contrarian record: it documents what *already exists* so Phase 2A does not
rebuild it, and it isolates the one real hole.

### 2.1 The PCT-only full-row rewrite is real — exact site

- `PhotosChangeTimestamp` is a **top-level key inside `listings.raw_data`**, retained by the
  keep-set (`lib/compliance/raw-data-keep-fields.ts:175`). It is **not** a listing-sync typed
  column. (The typed `Listing.photos_change_timestamp` column at `prisma/schema.prisma:496` is
  owned by media-sync, not the listing-sync UPDATE payload.)
- `sync.ts:741` always includes `raw_data` in the listing UPDATE payload.
- The write-suppression guard (`sync.ts:759-768`) calls `listingUpdateMateriallyUnchanged`, which
  treats `raw_data` as material via `rawDataMateriallyEqual` (`write-suppression.ts:190-197`).
  `rawDataMateriallyEqual` canonicalizes only rotating `Media[].MediaURL`/`.Thumbnail`
  (`write-suppression.ts:347-383`); `PhotosChangeTimestamp` is a distinct key and is **not**
  stripped → a PCT move reads as material → **full `listings` row rewrite (raw_data included)**.
- Because the change classifies as `raw_data_only` (not `modification_timestamp_only`), the write
  **also invalidates listing/building/search caches and marks manifest shards** for warming
  (`sync.ts:832-850`; `isProvenanceOnlyChange` is true only for `modification_timestamp_only`,
  `write-suppression.ts:691-693`).
- **Phase-1 capture:** 108/108 sampled `raw_data_only` writes across 3 cycles were
  `PhotosChangeTimestamp`-only (`distinct_keys=1`).

### 2.2 The reconciliation "safety mechanism" mostly ALREADY EXISTS (RC1)

The media-sync cron (`runMediaSync`, `lib/idx/media-sync.ts`) already implements most of what the
Phase-2A prompt describes as new:

- **Per-listing COMPLETE fetch**: `fetchMedia` (RC1 `defaultFetchMedia`, `media-sync.ts:2753`) uses
  `paginateMedia` (`media-sync.ts:2709`) which follows `@odata.nextLink` and returns
  `{ rows, complete }`; `defaultFetchMedia` **throws on incomplete** (`media-sync.ts:2764-2766`).
  Contract (`media-sync.ts:2336-2342`): *resolve ⇒ complete set, safe to tombstone; throw ⇒
  preserve, don't tombstone, don't advance cursor.*
- **Tombstone-vanished + CRM preservation**: sole production call site
  `upsertListingMedia(listingId, mediaRows, { tombstoneVanished: true, ... })` at
  `media-sync.ts:3127`. Vanished rows are tombstoned (`status='deleted'`), and **`crm:` media is
  excluded in both branches** (`media-sync.ts:1116,1122`, using `CRM_MEDIA_KEY_PREFIX`).
- **Fail-closed on write failure**: `tombstoningAllowed = writeFailures === 0`
  (`media-sync.ts:1086`) — a partial listing never tombstones.
- **Uses `ResourceRecordKey`** (RESO/REBNY §8 rule) as the media query key, never
  `ResourceRecordID` as primary.
- **Correct query base**: `/odata/Media` with `$filter=ResourceRecordKey eq '...'`.

> The stale rationale in `write-suppression.ts:559-568` ("emptied galleries never reconciled →
> PCT must stay material") describes the **old `sync.ts` JSON batch-media loop**
> (`sync.ts:1111-1114`, which writes only the legacy `listings.media` JSON column), **not** the RC1
> media-sync path. Confirming this reconciliation-vs-listing division of labor is central to
> Phase 2A: **all `listing_media` row writes live in `media-sync.ts`; `sync.ts` writes only the
> legacy JSON `media` column.**

### 2.3 The ONE real hole (P0-class) — the transient empty-200

RC1's *only* defense against blanking a live gallery is `fetchMedia` throwing on **incomplete
pagination**. A **valid, complete, but transient empty 200** (zero rows, no error, pagination
"complete") is treated as an authoritative empty set → reaches the empty-set mass-tombstone branch
(`media-sync.ts:1112`) → **tombstones every active feed row** for the listing. Cross-ref:
`docs/operations/detail-media-consistency-p0-2026-07-16.md:35`.

**This is the outcome Phase 2A must make impossible.** The per-listing sync-state + stable-hash +
two-strike guard does double duty: it enables PCT suppression *and* closes this P0 hole.

### 2.4 Schema anchors (for the new table)

- `Listing`: PK `id BigInt`; natural key `listing_id String @unique`; `raw_data Json?`;
  `modification_timestamp DateTime @@index`; media columns `primary_photo_url`,
  `photos_change_timestamp`, `photo_count` (media-sync-owned); relation `listing_media
  ListingMedia[]`.
- `ListingMedia` (`prisma/schema.prisma:2367-2423`): `@unique media_key`; per-row material fields
  `media_type, media_category, media_classification, order, preferred_photo_yn,
  media_modification_ts, modification_ts`; delivery artifacts `r2_key, media_url_cached`;
  `status` (`active`/`deleted`); FK `listing_id → Listing.listing_id onDelete: Cascade`;
  `@@index([listing_id])`, `@@index([status])`.
- `MediaSyncState` (`prisma/schema.prisma:2436-2456`): a **single global cursor** keyed by
  `resource @unique` — **not** per-listing. Phase 2A adds a distinct per-listing table.

### 2.5 R2 drain constants (verified; unchanged by Phase 2A)

`R2_BACKLOG_BATCH_LIMIT=60`, `R2_DRAIN_CATCHUP_INCREMENT=25`, `R2_DRAIN_HARD_CAP=200`,
`R2_BACKLOG_PROBE_CAP=2000`, `R2_RUN_FAILURE_BUDGET=10` (`media-sync.ts:1838-1910`). Phase 2A does
**not** touch the drain (that is Phase 2B territory).

### 2.6 Live Cotality field verification (Class-B proof, §J.4)

Every Media/Building/Property field this design references was verified **live against the Trestle
`$metadata` endpoint** on 2026-07-26 (the `trestle-fields` MCP fetches live, cached ≤10 min; §J.4
live-`$metadata` bar). This is a Class-B check — not asserted from memory or Codex.

**Media resource (56 live fields) — all referenced fields exist:**

| Field | Live type | Used for |
|---|---|---|
| `MediaKey` | String[20] | identity / hash key |
| `ResourceRecordKey` | String[20] | listing FK (query filter, §4.3b consistency) |
| `ResourceRecordKeyNumeric` | Int64 | numeric-key fallback |
| `ResourceRecordID` | String[255] | last-resort key only (never primary) |
| `ResourceName` | Enum | **must be added to `$select`** for §4.3b resource-consistency |
| `MediaURL` | String[8000] | delivery only — **excluded from hash** |
| `MediaCategory` / `MediaClassification` / `MediaType` | Enum | hash material metadata |
| `Order` | Int32 | hash |
| `PreferredPhotoYN` | Boolean | hash / hero selection |
| `MediaModificationTimestamp` / `ModificationTimestamp` | DateTime | hash revision clocks |
| `MediaStatus` | Enum | explicit keyed removal (`Deleted`) |
| `Permission` | **Multi-Enum** | compliance removal signal |

- ⚠️ **`Permission` is Multi-Enum, serialized comma-separated (NOT arrays).** Documented Cotality
  values: `Public, Private, IDX, VOW, Office Only, Firm Only, Agent Only`. **Display/removal
  interpretation is a PROOF GATE (COT-3, §12), not assumed** — the "anything not exactly `Public`"
  rule is **rejected** (`IDX` may be legitimately displayable on this feed). Phase 2A introduces NO
  new Permission-based deletion; `MediaStatus='Deleted'` stays the only new immediate-removal signal.
  The existing `String(raw.Permission) !== "Public"` skip is retained (defensive, non-destructive)
  and its correctness is re-evaluated under COT-3.
- Also live (not required by the hash, noted for completeness): `RecordSignature`(Int32),
  `HumanModifiedYN`(Boolean), `MediaAlteration`(Multi-Enum), `ListingPermission`(Multi-Enum),
  `ImageHeight`/`ImageWidth`(Int32), `InternetEntireListingDisplayYN`(Boolean).

**Building resource (live) = `BuildingKey`[String,255] only**, plus `$expand` → Media / Property.
Cotality "Building" is a grouping key, not a rich resource. Phase 2A reconciles **per-listing Media**
via `ResourceRecordKey eq '<ListingKey>'` and does **not** touch the Building resource; because Media
carries `ResourceName`, §4.3b's consistency check confirms each row belongs to the listing's resource
(not a building-level asset).

**Property:** `PhotosChangeTimestamp` = DateTime, nullable (the carve-out targets a real field);
`PhotosCount` also present.

Backup live-verification paths if a re-check is needed: `npm run trestle:diff` (live-vs-CSV),
`npm run trestle:probe`, `npm run trestle:audit-resources`, or the snapshot `artifacts/metadata.xml`.
Per §J.8: this verifies field **existence, name, and type** on the live model — it does **not** by
itself prove any given field is populated for a specific listing.

---

## 3. Scope

**In scope (Phase 2A):**
1. New `listing_media_sync_state` table (per-listing).
2. Stable media-set hash (URL-free).
3. Two-strike corroborated guard against ANY implicit disappearance of active feed media (shrink,
   vanished MediaKey, or empty) + a source-set validity gate, wired into the RC1 reconcile loop.
4. Concurrency protection so overlapping executions can't count as two strikes.
5. State/hash checkpoint discipline (persist only after complete + successful reconciliation).
6. PCT-only write suppression in `sync.ts` (gated behind the guard existing + tested).
7. Tests for every branch (Maya's 10 cases + the two-strike transitions).

**Out of scope (explicitly):**
- Phase 2B: just-in-time signed-URL resolution, MediaKey proxy, eliminating
  `delivery_url_refreshed` DB writes. **HELD.**
- Any change to the R2 adaptive drain, retention, cadence, cron config, or Neon settings.
- Any manual cron trigger or production activation without separate Maya authorization.

---

## 4. Architecture

### 4.1 New table: `listing_media_sync_state` (per-listing)

Prisma model (draft — one new empty table, NEON.md §4 "safe migration" class; nullable columns; no
`NOT NULL DEFAULT` on populated tables; `Int @default(0)` counters are fine on an empty table):

```prisma
model ListingMediaSyncState {
  id                           BigInt    @id @default(autoincrement())
  listing_id                   String    @unique @map("listing_id")
  listing                      Listing   @relation(fields: [listing_id], references: [listing_id], onDelete: Cascade)

  // SUCCESSFULLY-RECONCILED checkpoint (persisted ONLY after a complete + valid set
  // + all writes succeed). Kept SEPARATE from the observed/pending fields below.
  last_seen_photos_change_ts    DateTime? @map("last_seen_photos_change_ts")
  last_complete_media_set_hash  String?   @map("last_complete_media_set_hash") // versioned hash, e.g. "v1:<digest>"
  last_reconciled_at            DateTime? @map("last_reconciled_at")
  last_source_modification_ts   DateTime? @map("last_source_modification_ts")

  // GENERALIZED pending-candidate guard state (any implicit disappearance — shrinkage,
  // a vanished MediaKey, or empty — NOT only empty). These are OBSERVED values, distinct
  // from the reconciled checkpoint above.
  pending_candidate_set_hash        String?   @map("pending_candidate_set_hash")
  pending_candidate_media_count     Int?      @map("pending_candidate_media_count")
  pending_missing_media_count       Int?      @map("pending_missing_media_count")
  pending_photos_change_timestamp   DateTime? @map("pending_photos_change_timestamp")
  pending_source_modification_ts    DateTime? @map("pending_source_modification_ts")
  pending_first_observed_at         DateTime? @map("pending_first_observed_at")
  pending_last_observation_run_id   String?   @map("pending_last_observation_run_id")
  pending_confirmation_count        Int       @default(0) @map("pending_confirmation_count")
  pending_next_check_at             DateTime? @map("pending_next_check_at") // bounded pending-lane scheduler (§4.7)

  created_at                    DateTime  @default(now()) @map("created_at")
  updated_at                    DateTime  @updatedAt @map("updated_at")

  @@index([pending_next_check_at])
  @@map("listing_media_sync_state")
}
```

Plus a back-relation on `Listing`: `listing_media_sync_state ListingMediaSyncState?`.

Migration is authored as a plain `CREATE TABLE` (new empty table — no contention) and **applied
manually to prod before the code PR merges** per NEON.md §5 (with `npm run ops:health` fresh + the
`[neon-preflight: OK]` commit token on the schema commit). **This is a Maya-gated action; the spec
does not apply it.**

### 4.2 Stable media-set hash (URL-free)

A pure function `stableMediaSetHash(rows)` producing a deterministic **versioned** digest over the
**material identity** of the complete feed set — deliberately the same fields the existing row
comparator `listingMediaRowUnchanged` uses (minus the URL), so "stable set unchanged" ⟺ "same
membership AND every row materially unchanged". Requirements (Maya, 2026-07-26):

- **MediaKey-based**, **canonical sort** (items sorted by `MediaKey`) for order-independence.
- Per item (feed rows only; `crm:` excluded — they are not in Trestle sets by design):
  `MediaKey`, `media_type`, `media_category`, `media_classification`, `order`,
  `preferred_photo_yn`, and both revision timestamps — `media_modification_ts`
  (`MediaModificationTimestamp`) and `modification_ts` (`Media.ModificationTimestamp`), ISO or `∅`.
  (All live-verified on the Media resource — see §2.6.)
- **No URL contribution whatsoever** — host, path, query, and fragment are ALL excluded (signed
  URLs rotate every request — `write-suppression.ts` doctrine).
- **Versioned:** the digest is prefixed with a scheme version (e.g. `"v1:<sha256>"`) so a future
  field-set change is distinguishable and cannot silently collide with a v1 digest.
- **Duplicate `MediaKey` ⇒ fail closed:** a set containing a duplicate key is UNSAFE — the hash
  function signals invalidity (see §4.3b); it never silently dedupes and hashes anyway.
- The empty set hashes to a fixed versioned sentinel (e.g. `"v1:∅"`) distinct from `null`
  ("never reconciled").

Pure + unit-tested; no Prisma, no I/O.

### 4.3 Two-strike guard — generalized to ANY implicit disappearance (Maya's exact rule, corrected 2026-07-26)

The guard protects **any implicit disappearance of previously-active feed media**, NOT only a
non-empty gallery becoming completely empty. An "implicit disappearance" is any previously-`active`,
non-`crm:` `listing_media` `MediaKey` that is **absent from the new complete candidate set** without
an explicit removal signal for that key. Examples all requiring **two consecutive identical
complete-set observations in different natural cycles** before any tombstone:

- 10 active feed rows → 8, with no explicit delete signals (partial shrink);
- any single previously-active `MediaKey` absent from the new candidate set;
- a complete set becoming empty (the original case, now a subset of this rule).

**Immediate (not two-strike) removal signal** — explicit and keyed, so no corroboration is needed:
- an explicit keyed `MediaStatus='Deleted'` record (existing `explicitDeleteKeys` path,
  `media-sync.ts:1088-1098`) → tombstone that named `MediaKey` immediately. **This is the ONLY
  newly-relied-upon immediate removal signal in Phase 2A.**

**Permission is a PROOF GATE, not an invented removal rule (Maya 2026-07-26).** Phase 2A must NOT
implement any new Permission-based deletion (the "anything not exactly `Public` is deleted" rule is
explicitly rejected). Until the COT-3 permission contract (§12) proves the live values,
serialization, and REBNY/IDX display interpretation, a non-`Public` `Permission` row is handled
**conservatively and fail-closed**: not ingested as public media (existing defensive skip) AND
**not** counted as an implicit disappearance that could trigger tombstoning — no destructive action
either way. `IDX` in particular may be legitimately displayable. See §2.6 + COT-3.

Decision, per listing, in the RC1 reconcile loop, **after `fetchMedia` resolves (complete set) AND
the set passes the §4.3b validity gate**:

- **No implicit disappearance** (every previously-active feed `MediaKey` is still present; only
  additions/material updates/explicit removals) → reconcile normally (existing `upsertListingMedia(...,
  {tombstoneVanished:true})` path is safe here because nothing is *implicitly* vanishing);
  **reset** all `pending_*` fields; persist the successful checkpoint (hash of the new set).
- **Implicit disappearance detected** → **two-strike** on the *candidate set*:
  - **First observation (strike 1 — see §5):** upsert safe additions/updates; **retain** the
    still-missing existing media (no tombstone); **retain** existing hero/photo-count for the
    unconfirmed removals; record generalized pending-candidate state
    (`pending_candidate_set_hash`, `pending_candidate_media_count`, `pending_missing_media_count`,
    `pending_photos_change_timestamp`, `pending_source_modification_ts`,
    `pending_first_observed_at`, `pending_last_observation_run_id`,
    `pending_confirmation_count = 1`). **No** destructive cache revalidation. Do **not** advance the
    successful-reconcile checkpoint (the reduced set is unconfirmed).
  - **Second observation (strike 2) — must satisfy ALL:**
    1. a **different natural cycle** (`current one_cycle_run_id != pending_last_observation_run_id`) —
       never a concurrent duplicate execution;
    2. the **same candidate** — `pending_candidate_set_hash` recomputed this cycle is identical;
    3. complete pagination again (fetch resolved) AND the set passes §4.3b validity again;
    4. no fetch / pagination / media-write failure this cycle;
    5. no intervening non-empty/larger result (guaranteed by the reset rule below);
    6. PCT **equal to or newer** than `pending_photos_change_timestamp` (non-regressing);
    7. source modification timestamp **not regressing** vs `pending_source_modification_ts`.
    → **Then, in ONE DB transaction (§5):** tombstone the still-missing **feed-owned** rows only
    (preserving `crm:`), update the hero/photo-count summary, commit the successful checkpoint
    (`last_complete_media_set_hash` = candidate hash, `last_seen_photos_change_ts`,
    `last_source_modification_ts`, `last_reconciled_at`), and clear pending state. **Revalidate
    caches only AFTER the transaction commits.**
  - If any strike-2 condition fails → remain pending (do not tombstone); refresh the pending
    observation as appropriate.
- **Any non-empty / non-shrinking result** (candidate ⊇ previously-active feed set) → **reset**
  `pending_*` to zero and reconcile normally. A single transient empty/short 200 therefore never
  blanks anything.
- **A listing whose reduced set is already the confirmed checkpoint** (candidate hash ==
  `last_complete_media_set_hash`) → ordinary no-op; repeated identical reductions are not re-torn-down.

### 4.3b Source-set validity gate (fail-closed — new, Maya 2026-07-26)

A complete `fetchMedia` response is **NOT safe for implicit tombstoning** when any active/public row
in the candidate set has:
- a **missing `MediaKey`**;
- a **missing `MediaURL`**;
- a **duplicate `MediaKey`** within the set;
- a **`ResourceRecordKey` inconsistent with the listing being reconciled** (must equal the
  listing's `ListingKey`; the `$select` must add **`ResourceName`** — live-confirmed on Media, §2.6 —
  and the row must belong to the listing's resource, not a Building-level asset);
- any **malformed identity/material field** that prevents deterministic hashing.

On an **unsafe** set:
- safe additions/updates **may** proceed (a valid new/changed row is still upserted);
- **no implicitly-vanished row is tombstoned** (this closes the current gap: today `skippedInvalid`
  from a missing `MediaKey`/`MediaURL` does **not** block `tombstoneVanished` — only `writeFailures`
  does, at `media-sync.ts:1086`; §4.3b makes the validity result also block destructive
  reconciliation);
- **no successful hash/checkpoint is written**;
- **no summary reduction is committed** (hero/photo-count retained);
- the **cursor does not advance past the listing** (it retries next cycle, idempotently);
- the listing **retries**.

A non-`Public` `Permission` row is **not** generic malformed input and is **not** (in Phase 2A) a
new removal signal — Permission removal semantics are **frozen pending COT-3** (§4.3/§12). It is
handled conservatively: skipped from ingestion and excluded from implicit-disappearance tombstoning
(no destructive action).

### 4.4 Concurrency protection

The read-modify-write of the pending-empty state must be atomic against overlapping executions
(the `*/10` cron can overlap a slow prior cycle). Approach: wrap the per-listing guard state
transition in a DB transaction that takes a **row lock** on the `listing_media_sync_state` row
(`SELECT ... FOR UPDATE`, or a Postgres transaction-scoped advisory lock keyed on the listing), and
enforce the **different-cycle** condition via `one_cycle_run_id`. Two overlapping requests from the
*same* cycle share the cycle id → can never satisfy strike-2 condition (1). Final choice of
row-lock vs advisory-lock is an implementation detail for the plan; the invariant is: *no two
observations from one natural cycle count as two strikes.*

### 4.5 State/hash checkpoint discipline

- `last_complete_media_set_hash` and the successful-reconcile checkpoint (`last_seen_photos_change_ts`,
  `last_source_modification_ts`, `last_reconciled_at`) are persisted **only after** the complete set
  was fetched, **passed the §4.3b validity gate**, **and** all DB writes for that listing succeeded.
- The checkpoint is **never** advanced after partial pagination (`fetchMedia` threw), a §4.3b
  validity failure, or any write failure. This mirrors the existing cursor discipline
  (`pickKeysetWatermark` halts at the first incomplete/failed listing, `media-sync.ts:435-444`).
- Observed (`pending_*`) and successfully-reconciled (`last_*`) timestamps are kept strictly
  separate — a pending observation NEVER writes a `last_*` value.

### 4.6 PCT-only write suppression in `sync.ts` (gated on §4.3 existing + tested)

Mechanism (Q2): introduce a **new, explicitly-named** exclusion set distinct from the provenance
clocks —

```ts
// Keys whose truth is reconciled by the media-sync path (§4.3), so a change in
// them alone must NOT force a listings/raw_data rewrite. Distinct from
// RAW_DATA_PROVENANCE_CLOCK_KEYS so the semantics stay legible.
export const RAW_DATA_RECONCILED_ELSEWHERE_KEYS: ReadonlySet<string> = new Set([
  "PhotosChangeTimestamp",
]);
```

`rawDataMateriallyEqual` / `changedRawDataMaterialKeys` exclude these keys (in addition to the
existing rotating-URL canonicalization and provenance-clock stripping). Effect on a PCT-only event:

- If nothing else changed → `listingUpdateMateriallyUnchanged` returns true → **the listing write
  is fully suppressed** (no `raw_data` rewrite, no cache invalidation, no manifest warm).
- If `modification_timestamp` also moved → classifies `modification_timestamp_only` → the row is
  written to persist the provenance clock but **cache is not invalidated** (existing
  `isProvenanceOnlyChange` path) — still a large reduction vs today's full rewrite + invalidation.

**Only `PhotosChangeTimestamp`** is in `RAW_DATA_RECONCILED_ELSEWHERE_KEYS` — no other key is
reclassified.

**Table-capability fail-closed check (new, Maya 2026-07-26):** the PCT carve-out is only sound while
the reconciliation safety table (`listing_media_sync_state`) is actually present and usable. A
**once-per-IDX-run capability check** verifies the table is available; **if it is unavailable, the
carve-out is disabled fail-closed** for that run — i.e. PCT reverts to material and the pre-existing
full-write behavior resumes, so PCT churn is never suppressed without the safety mechanism backing
it. The check runs once per IDX run (not per row) to avoid per-record overhead.

**Ships ENABLED (Q3 resolved):** the PCT suppression ships **enabled** in this PR **after** the
migration is applied and the guard's tests pass (§10) — not behind a runtime flag. The table-
capability check (above) is the runtime safety net; §11's flag option is withdrawn.

**Cooperation, not inline reconciliation (design decision for review):** requirement #4 says a
PCT-only event should "invoke/check media reconciliation." In the real architecture the RC1
reconciliation already runs every cycle in the media-sync half of One Cycle, selecting exactly the
listings whose PCT advanced. So `sync.ts` does **not** call reconciliation inline (that would
duplicate RC1 and double the per-listing complete fetch). Instead: media-sync owns reconcile +
sync-state + hero/count + the two-strike guard; listing-sync merely stops full-rewriting on
PCT-only. The two halves cooperate within one cycle.

**Pre-flip verification (blocking the PCT exclusion, not the guard):** confirm **nothing reads
`raw_data.PhotosChangeTimestamp`** (media-sync reads PCT from the live Property record and owns the
typed `photos_change_timestamp` column), so letting stored `raw_data.PCT` go stale is harmless. If
any reader is found, revisit before enabling §4.6.

### 4.7 Bounded pending-verification lane (CODE-3 — guarantees strike two returns)

A two-strike guard is incomplete unless strike-1 listings are guaranteed to be re-checked
**independently of the global PCT/media cursor**. Phase 2A adds a bounded pending lane:

- **Independent scheduling:** pending rows are selected by `pending_confirmation_count > 0` ordered
  by `pending_next_check_at` (new column + `@@index([pending_next_check_at])`), NOT by the global
  cursor. A pending listing whose PCT no longer advances is still re-verified.
- **Bounded budget:** runs before/alongside normal ingestion each natural cycle with a **fixed batch
  + time budget** (like the R2 drain) so it can never monopolize the cycle.
- **Cannot freeze the global cursor:** the media cursor advances on normal ingestion regardless of
  pending backlog; a stuck pending listing is retried, never blocking.
- **Same-cycle safety:** a pending re-check in the SAME `one_cycle_run_id` as the strike-1
  observation can never become strike two (§4.3 condition 1).
- **Durable retry:** a failed/inconclusive pending verification stays pending (bounded backoff via
  `pending_next_check_at`) — never silently dropped.
- **Telemetry:** pending queue **count** and **oldest age** emitted every cycle (additive audit
  fields) so starvation/backlog is observable.

Proof (CODE-3, §12): a test with one pending listing + later normal listings shows the pending
listing is re-checked the next natural cycle, later listings keep processing, no starvation, no
cursor freeze, no premature tombstone.

---

## 5. Data flow (per-listing, RC1 reconcile loop)

```
runMediaSync → fetchProperties(page) → for each property:
  fetchMedia(listingKey)                 # RC1: resolves ⇒ COMPLETE set; throws ⇒ preserve+halt
  ├─ threw?  → preserve media, no tombstone, do NOT advance checkpoint (existing behavior)
  └─ resolved (complete candidate set):
       validity = validateSourceSet(candidate, listingKey)   # §4.3b
       upsert SAFE additions/updates (always allowed)        # existing upsert, tombstoneVanished:FALSE here
       apply explicit keyed removals immediately             # MediaStatus=Deleted ONLY (Permission frozen, COT-3)
       if NOT validity.safe:
           NO implicit tombstone; NO checkpoint; NO summary reduction;
           cursor does NOT advance past listing; retry next cycle
       else:
           missing = previously-active non-crm feed keys ABSENT from candidate
           if missing is EMPTY:                              # no implicit disappearance
               reset pending; persist checkpoint(hash(candidate)); reconcile normally
           else:                                             # implicit disappearance → two-strike
             under row/advisory lock (§4.4):
               if candidate confirms a prior strike (§4.3 conditions 1-7):
                   ONE TXN: tombstone still-missing feed-only rows (crm preserved),
                            update hero/count, commit checkpoint, clear pending
                   revalidate caches AFTER commit
               else:                                          # strike 1 (or non-confirming)
                   record pending-candidate state; retain missing media + hero/count;
                   NO tombstone; NO destructive revalidation; checkpoint NOT advanced
```

Listing-sync half (`sync.ts`): with §4.6 enabled (and the table-capability check passing), a
PCT-only `raw_data` delta no longer forces a write; the media truth is reconciled by the media-sync
half above.

---

## 6. Compliance & fail-closed (§D / §E)

- **REBNY Media §8:** query stays `/odata/Media` + `ResourceRecordKey`; never `ResourceRecordID`
  primary; two-tier `PhotosChangeTimestamp → Media.ModificationTimestamp` model preserved.
- **CRM media preservation:** every tombstone branch continues to exclude `CRM_MEDIA_KEY_PREFIX`.
- **Display/terminal gates §5/§7:** unchanged — Phase 2A does not touch `idx_display_yn`, the gate
  columns, or `TERMINAL_STATUSES`; hero/count summary writes only occur on a *confirmed* set.
- **Fail-closed §E:** every uncertain path preserves media (no destructive action) — incomplete
  fetch, any write failure, first-strike empty, regressing PCT/source ts, or same-cycle repeat.
- **Audit §15:** the `media_sync_cron` audit payload gains counters for the new outcomes
  (`empty_pending_recorded`, `empty_confirmed_tombstoned`, `empty_pending_reset`) — additive, no
  PII, no URLs.

---

## 7. Error handling

- `fetchMedia` throw (incomplete/timeout/abort) → listing preserved, checkpoint not advanced, cursor
  halts at this listing (existing RC1 behavior) — unchanged.
- Per-row write failure → `tombstoningAllowed=false` → no tombstone; checkpoint not advanced.
- Guard state transition failure (lock contention / transaction error) → treat as "not confirmed":
  do not tombstone; leave pending state as-is; retry next cycle. Never throw out of the loop for one
  listing (isolate + count).

---

## 8. Testing (proof-first §F)

Maya's 10 required cases + the two-strike transitions, each a failing-test-first unit/integration
test in the same PR:

1. Complete unchanged set → suppressed (no writes), checkpoint hash stable.
2. Complete changed set → upsert/tombstone as today, checkpoint updated.
3. Authoritative empty gallery (previously empty) → no-op.
4. Multi-page set → complete pagination, correct hash.
5. Partial pagination (throws) → preserve, no tombstone, checkpoint not advanced.
6. Provider failure → preserve, no tombstone.
7. Per-row write failure → no tombstone (fail-closed), checkpoint not advanced.
8. CRM-media preservation across every tombstone branch (incl. empty-set).
9. Repeated PCT with already-processed state → no redundant work; already-confirmed-empty no-op.
10. Cache/projection suppression on unchanged stable set (PCT-only → no invalidation/warm).

Two-strike (generalized to ANY implicit disappearance):
11. Previously-active → **first** reduced/empty candidate → pending recorded, **nothing**
    tombstoned/cleared/invalidated; safe additions/updates still upserted.
12. First-reduced then **non-shrinking** result → pending reset, normal reconcile (single transient
    empty/short 200 never blanks).
13. First-reduced then identical-reduced **same cycle id** → NOT confirmed (no tombstone).
14. First-reduced then identical-reduced **different cycle**, all conditions → tombstone still-missing
    feed-only rows, crm preserved, hero/count updated, checkpoint committed, caches revalidated only
    after commit.
15. Second observation with **regressing PCT** or **regressing source ts** → NOT confirmed.
16. Second observation with a **different candidate hash** (set changed again) → NOT confirmed; new
    pending recorded.
17. **Partial shrink** (10→8, no explicit deletes) exercises the same two-strike path as complete-empty.
18. Concurrency: two overlapping same-cycle observations → at most one pending, never a confirm
    (row/advisory lock, §4.4).

Source-set validity gate (§4.3b):
19. Candidate with a **missing MediaKey** → additions/updates proceed; **no implicit tombstone**;
    no checkpoint; cursor does not advance; retries.
20. Candidate with a **missing MediaURL** on an active/public row → same as 19 (fail-closed).
21. Candidate with a **duplicate MediaKey** → hash signals invalid; no implicit tombstone; no checkpoint.
22. Candidate row with **ResourceRecordKey ≠ listing** (or wrong ResourceName) → no implicit tombstone.
23. Explicit keyed **MediaStatus=Deleted** → immediate tombstone of that key (not two-strike).
24. Non-`Public` (multi-enum) `Permission` row → **skipped from ingestion + excluded from
    implicit-disappearance tombstoning** (no destructive action); NO new Permission-based deletion
    (frozen pending COT-3).
25. **Table-capability off** (`listing_media_sync_state` unavailable) → PCT carve-out disabled
    fail-closed for the run (PCT stays material; pre-existing full-write behavior).

Plus: `sync.ts` PCT-only suppression tests (write suppressed / provenance-only when mod-ts moved /
no cache invalidation), and the full validation chain in CLAUDE.md §G before commit.

---

## 9. Migration & deployment discipline (NEON.md)

- One new empty table only (`listing_media_sync_state`) — one change per PR (NEON.md §4).
- Manual prod apply **before** the code PR merges: `npm run ops:health` (fresh) →
  `DATABASE_URL=<prod> npx prisma migrate deploy` → `npx prisma migrate status` → validators →
  commit with `[neon-preflight: OK]`. **Maya-gated** (schema-migration hold).
- No migrations in the Vercel build command (NEON.md §1). No cron/cadence/retention change.

---

## 10. Sequencing within the single PR

1. Migration + `ListingMediaSyncState` model + back-relation (applied to prod by Maya).
2. Pure `stableMediaSetHash` + tests.
3. Sync-state read/write helpers + tests.
4. Two-strike guard wired into the RC1 loop + concurrency protection + tests (cases 3,5–16).
5. Audit counters (additive).
6. **Then** (guard green): §4.6 PCT exclusion in `sync.ts` + tests (cases 1,2,9,10) + pre-flip
   reader verification.
7. Full CLAUDE.md §G validation chain; PR opened HELD for Maya review.

Post-merge (Maya-authorized, no manual cron): observe natural cycles — `raw_data_only` writes fall
sharply, removed galleries still clear (one cycle later), crm media intact, no incorrect blanking.

---

## 11. Open items for Maya's spec-review

- **RESOLVED (Q3):** PCT suppression ships **enabled** after migration + tests, guarded at runtime by
  the once-per-IDX-run table-capability check (§4.6). The default-OFF flag option is withdrawn.
- **§4.6 cooperation model** (media-sync reconciles; listing-sync merely stops rewriting) — confirm
  you're good with this vs. literally invoking reconciliation from `sync.ts`.
- **§4.4 lock choice** (row lock vs advisory lock) — any preference, or leave to the plan.
- **§4.3b `$select` addition** — Phase 2A adds `ResourceName` to the reconcile `$select` (live-
  confirmed on Media, §2.6) to support the resource-consistency validity check; flagging since it
  changes the Media OData query (compliance index §4/§8 surface).

---

## 12. Acceptance-evidence contract (FIXED — Maya 2026-07-26)

Phase 2A is judged against **one fixed acceptance package with explicit PASS/FAIL results**. No
claim ("aligned", "safe", "complete", "fixed") counts without the corresponding artifact. **A gate
line cannot be PASS without: the command/query used · a timestamp · the exact SHA/deployment ·
the artifact path · the actual result · the expected result.**

### 12.0 Evidence folder + redaction

All artifacts live under **`docs/superpowers/specs/evidence/2026-07-26-neon-phase2a/`**:

| File | Gate | Content |
|---|---|---|
| `00-acceptance-matrix.md` | all | live tracker of every gate + its evidence pointers (starts all PENDING) |
| `01-cotality-contract.json` | COT-1 | live `$metadata` field/type contract + `metadata_sha256` |
| `02-cotality-live-probes.jsonl` | COT-2 | redacted read-only Property→Media probe cohort |
| `03-permission-contract.md` | COT-3 | proven Permission values/serialization/display+removal rules |
| `04-replay-fixtures/` | REPLAY-1 | redacted **real-shape** Cotality payloads per scenario |
| `05-replay-results.json` | CODE-1/REPLAY-1 | hash-determinism + replay actual-vs-expected |
| `06-test-results.txt` | CODE-2/3 | full test run output (truth table + pending lane) |
| `07-migration-proof.md` | DB-1 | preflight→apply→verify→rollback migration evidence |
| `08-production-natural-cycles.jsonl` | PROD-1 | 3 natural One-Cycle telemetry records |
| `09-production-db-invariants.txt` | PROD-1/2 | post-cycle DB invariant queries + results |
| `10-final-verdict.md` | final | the binary matrix (§12.6) |

**Redaction rule (hard):** NO secrets, bearer tokens, complete signed URLs, personal data,
addresses, or unredacted listing identifiers may be committed. Listing/Media keys are hashed;
URLs are dropped or reduced to host-class.

### 12.1 COT-1 — Live metadata contract
`01-cotality-contract.json`: `captured_at_utc`, `base_url="https://api.cotality.com/trestle"`,
`metadata_endpoint="/odata/$metadata"`, `http_status=200`, `metadata_sha256`, and the verified types
of Property{`ListingKey`,`PhotosChangeTimestamp`,`ModificationTimestamp`,`PhotosCount`} +
Media{`MediaKey`,`ResourceRecordKey`,`ResourceName`,`MediaURL`,`MediaStatus`,`Permission`,`Order`,
`PreferredPhotoYN`,`MediaModificationTimestamp`,`ModificationTimestamp`}.
**PASS:** HTTP 200 · every field exists with its actual type · contract agrees with the code's query
+ parser · hash recorded for drift detection. *(Proves existence/type only — not population.)*

### 12.2 COT-2 — Live read-only Property→Media probes
`02-cotality-live-probes.jsonl`: redacted cohort — one-page media · multi-page · photos+floorplan/
video/virtual · Permission populated · null/absent optional fields · R2-mirrored · not-yet-mirrored.
Per probe: `property_query_http`, `photos_change_timestamp_present`, `photos_count`,
`media_query_http`, `media_pages_followed`, `next_link_exhausted`, `odata_count`, `rows_received`,
`unique_media_keys`, `duplicate_media_keys`, `resource_record_key_mismatches`,
`resource_name_values`, `permission_shapes`, `invalid_active_rows`.
**PASS:** every `@odata.nextLink` followed · when `@odata.count` present, rows == count · every
`ResourceRecordKey` == queried `ListingKey` · MediaKeys unique · ResourceName + Permission
serialization recorded · **GET only, no destructive action.**

### 12.3 COT-3 — Permission contract (proof gate)
`03-permission-contract.md`: every live metadata Permission value · every observed payload
representation · comma-separated multi-enum parsing rule · which values are displayable under the
Mallan IDX Plus agreement · which require immediate public deactivation · null/empty/unknown/
malformed/multi behavior · the Cotality/REBNY source per rule. Table completed with evidence for at
least: `Public`, `IDX`, `Public,IDX`, `Private`, `null`, `unknown`(→fail-closed, no destructive
action). **Until this table is proven, Phase 2A invents NO Permission deletion semantics;
`MediaStatus='Deleted'` remains the only newly-relied-upon immediate deletion signal.**

### 12.4 CODE-1 — Stable hash proof (→ `05-replay-results.json`)
Real production hash must satisfy: same rows/different API order → **same**; only signed query
changes → **same**; hostname/path changes → **same** (Phase-2A set identity); MediaKey / Order /
preferred-photo / category / type / media-revision-timestamp change → **different**; duplicate
MediaKey → **invalid, no checkpoint**; missing required identity → **invalid, no checkpoint**.

### 12.5 CODE-2 — Fixed reconciliation truth table (→ `06-test-results.txt`)
Each row needs an input fixture, starting DB state, expected DB delta, **actual** DB delta, PASS/FAIL:

| Scenario | Tombstone | Summary | Checkpoint | Pending | Cursor |
|---|---|---|---|---|---|
| Complete unchanged set | No | No | Successful | Cleared | Advance |
| Additions only | No removal | Yes if material | Successful | Cleared | Advance |
| Explicit keyed Deleted | Named key only | Yes | Successful | Cleared | Advance |
| First 10→8 implicit shrink | No | No destructive reduction | No reduced-set checkpoint | Create strike 1 | Advance after pending record commits |
| Same 10→8, next natural cycle | Missing two only | Yes | Successful | Clear | Independent pending lane |
| Same candidate, same cycle ID | No | No | No | Remain strike 1 | No confirmation |
| Second candidate differs | No | No destructive reduction | No | Replace strike 1 | Retry |
| Restored/non-shrinking set | No | Normal | Successful | Clear | Advance |
| Complete empty, first strike | No | Preserve hero/count | No | Create strike 1 | Advance after pending record |
| Complete empty, confirmed next cycle | Feed rows only | Clear feed summary | Successful | Clear | Independent pending lane |
| Missing MediaKey/URL | No implicit tombstone | No reduction | No | Retry state | Do not mark reconciled |
| Duplicate MediaKey | No | No reduction | No | Retry state | Do not mark reconciled |
| Wrong ResourceRecordKey | No | No reduction | No | Retry state | Do not mark reconciled |
| CRM media absent from feed | Never tombstone CRM | Preserve CRM contribution | Normal feed checkpoint | Normal | Advance |
| Manual/standalone run | Never confirms strike 2 | No destructive confirmation | No confirm | Remain pending | Natural cycle must confirm |
| State table unavailable | Existing behavior retained | Existing behavior | None | None | PCT full-write remains enabled |

### 12.6 CODE-3 — Pending verification lane (→ `06-test-results.txt`)
Prove: pending rows queried independently of the global PCT cursor (index
`listing_media_sync_state(pending_next_check_at)`) · bounded batch/time budget · a pending listing
cannot freeze the cursor · normal ingestion continues while pending waits · same-cycle duplicate work
never becomes strike two · failed pending verification stays durable for retry · pending age+count in
telemetry. **PASS:** one pending listing is re-checked next natural cycle, later listings keep
processing, no starvation, no cursor freeze, no premature tombstone.

### 12.7 DB-1 — Migration proof (→ `07-migration-proof.md`)
Preflight health · prod project/endpoint identity · migration filename+SHA · exact SQL ·
`prisma migrate diff` · `migrate status` before · **Maya authorization timestamp** · apply
timestamp · duration · `migrate status` after · table/column/type/FK/unique/index queries · existing
`listings`+`listing_media` row-count deltas (must be 0 rewrites) · rollback procedure.
**PASS:** only the new state table + relation + constraints + `pending_next_check_at` index added ·
no existing rows rewritten · **migration applied to prod BEFORE schema-dependent code deploys** ·
capability check returns true after · **missing-table simulation proves PCT suppression disables
itself** (§4.6).

### 12.8 REPLAY-1 — Deterministic replay (→ `04-replay-fixtures/` + `05-replay-results.json`)
Fixtures use **redacted real Cotality response shapes** (not invented objects), replayed against an
isolated DB / rollback transaction through the **real** parser/hash/guard/transaction/summary
functions. **PASS:** actual == expected exactly · reordering pages/rows doesn't change result ·
replaying identical input is idempotent · a different natural-cycle ID confirms only the intended
second strike · no test bypasses real code paths.

### 12.9 PROD-1 — Three natural cycles (→ `08-...jsonl` + `09-...txt`)
Per cycle capture: Git SHA · deployment ID+state · capability result · natural One-Cycle run ID ·
`manual_triggers=0` · cursor start/end · pending queue start/end · pending checked · strike-1s ·
confirmed strike-2s · source-set invalids · PCT-only listing writes · PCT-only suppressed · feed
tombstones · CRM tombstones · summary writes · cache revalidations · media failures.
**PASS (all true across 3 cycles):** `manual_triggers=0` · `pct_only_full_listing_writes=0 when
capability=true` · `unconfirmed_implicit_tombstones=0` · `crm_media_tombstones=0` ·
`same_cycle_confirmations=0` · `confirmed_removals_without_matching_prior_hash=0` ·
`confirmed_removals_without_distinct_natural_run_ids=0` · `cursor_freezes_caused_by_pending_queue=0`
· `source_set_invalid_destructive_actions=0`. Every confirmed removal traceable to: listing hash ·
candidate hash · strike-1 run ID · strike-2 run ID · same candidate hash both · non-regressing
timestamps · transaction committed · post-commit revalidation result.

### 12.10 PROD-2 — 24-hour normalized write trend (→ `09-...txt`)
Normalized rates (not raw totals): PCT-only full writes / PCT events · listing updates / properties ·
`listing_media` writes / media rows · WAL bytes / properties · pending queue oldest age · pending
processed / admitted. **PASS:** PCT-only full-write rate → ~0 when capability available · no increase
in incorrect gallery clears · pending queue bounded + draining · media cursor still advancing · no
new error class / connection regression · WAL/write rate lower after normalization. *(A 7-day trend
is ongoing measurement, NOT a hold once the 3-cycle + 24h correctness gates pass.)*

### 12.11 Final verdict (→ `10-final-verdict.md`)
```
COT-1  Live metadata contract          PASS / FAIL
COT-2  Live Property→Media probes       PASS / FAIL
COT-3  Permission semantics             PASS / FAIL
CODE-1 Stable hash                      PASS / FAIL
CODE-2 Reconciliation truth table       PASS / FAIL
CODE-3 Pending verification lane        PASS / FAIL
DB-1   Migration                        PASS / FAIL
REPLAY-1 Deterministic replay           PASS / FAIL
PROD-1 Three natural cycles             PASS / FAIL
PROD-2 24-hour normalized write trend   PASS / FAIL

Final verdict: ACCEPTED / NOT ACCEPTED
Unproven claims: [...]
Known residual work: Phase 2B only
```
No line is PASS without: command/query · timestamp · exact SHA/deployment · artifact path · actual
result · expected result.
