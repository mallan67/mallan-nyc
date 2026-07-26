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

1. **Safety first** — a two-strike, corroborated empty-gallery guard backed by a per-listing
   media sync-state + stable set-hash, so a *technically-successful-but-transient empty 200* from
   Cotality can never be mistaken for a truly-deleted gallery and mass-tombstone live photos.
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

---

## 3. Scope

**In scope (Phase 2A):**
1. New `listing_media_sync_state` table (per-listing).
2. Stable media-set hash (URL-free).
3. Two-strike corroborated empty-gallery guard wired into the RC1 reconcile loop.
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

  // Successful-reconciliation checkpoint (persisted ONLY after a complete set + all writes succeed)
  last_seen_photos_change_ts   DateTime? @map("last_seen_photos_change_ts")
  last_complete_media_set_hash String?   @map("last_complete_media_set_hash")
  last_reconciled_at           DateTime? @map("last_reconciled_at")
  last_source_modification_ts  DateTime? @map("last_source_modification_ts")

  // Two-strike empty-gallery guard state
  pending_empty_count          Int       @default(0) @map("pending_empty_count")
  pending_empty_first_seen_at  DateTime? @map("pending_empty_first_seen_at")
  pending_empty_first_pct      DateTime? @map("pending_empty_first_pct")
  pending_empty_first_cycle_id String?   @map("pending_empty_first_cycle_id")

  created_at                   DateTime  @default(now()) @map("created_at")
  updated_at                   DateTime  @updatedAt @map("updated_at")

  @@map("listing_media_sync_state")
}
```

Plus a back-relation on `Listing`: `listing_media_sync_state ListingMediaSyncState?`.

Migration is authored as a plain `CREATE TABLE` (new empty table — no contention) and **applied
manually to prod before the code PR merges** per NEON.md §5 (with `npm run ops:health` fresh + the
`[neon-preflight: OK]` commit token on the schema commit). **This is a Maya-gated action; the spec
does not apply it.**

### 4.2 Stable media-set hash (URL-free)

A pure function `stableMediaSetHash(rows)` producing a deterministic string over the **material
identity** of the complete feed set — deliberately the same fields the existing row comparator
`listingMediaRowUnchanged` uses (minus the URL), so "stable set unchanged" ⟺ "same membership AND
every row materially unchanged":

- Per item (feed rows only; `crm:` excluded — they are not in Trestle sets by design):
  `MediaKey`, `media_type`, `media_category`, `media_classification`, `order`,
  `preferred_photo_yn`, `media_modification_ts` (ISO or `∅`), `modification_ts` (ISO or `∅`).
- **Signed delivery URLs are excluded** (they rotate every request — `write-suppression.ts` doctrine).
- Items sorted by `MediaKey` for order-independence; the empty set hashes to a fixed sentinel
  (e.g. `sha256("[]")`) distinct from `null` ("never reconciled").

Pure + unit-tested; no Prisma, no I/O.

### 4.3 Two-strike corroborated empty-gallery guard (Maya's exact rule)

Applies **only** to a *previously-non-empty* gallery becoming a *complete-empty* set.
"Previously non-empty" = there currently exist `active`, non-`crm:` `listing_media` rows for the
listing (DB truth — robust even when the sync-state row is absent, e.g. first run post-migration).

Decision, per listing, in the RC1 reconcile loop (after `fetchMedia` **resolves** = complete set):

- **Complete set is NON-EMPTY** → reconcile normally (existing `upsertListingMedia(...,
  {tombstoneVanished:true})` path); **reset** `pending_empty_count = 0` and clear pending fields;
  persist checkpoint (hash of the non-empty set).
- **Complete set is EMPTY and gallery was previously EMPTY** (no active non-`crm:` rows) →
  ordinary no-op. Refresh `last_reconciled_at`; hash = empty sentinel.
- **Complete set is EMPTY and gallery was previously NON-EMPTY** → **two-strike**:
  - **First complete-empty (strike 1):** record pending state
    (`pending_empty_count=1`, `pending_empty_first_seen_at`, `pending_empty_first_pct` = observed
    PCT, `pending_empty_first_cycle_id` = One-Cycle run id, `last_source_modification_ts` = source
    mod ts). **Do NOT** tombstone, **do NOT** clear hero/photo-count, **do NOT** rewrite the
    listing for PCT, **do NOT** invalidate caches. (Do **not** advance the successful-reconcile
    checkpoint — the set is not confirmed.)
  - **Second complete-empty (strike 2) — must satisfy ALL:**
    1. a **different natural cycle** (`current one_cycle_run_id != pending_empty_first_cycle_id`) —
       never a concurrent duplicate execution;
    2. complete pagination again (fetch resolved);
    3. no fetch / pagination / media-write failure this cycle;
    4. no intervening non-empty result (guaranteed by the reset rule);
    5. PCT **equal to or newer** than `pending_empty_first_pct` (non-regressing);
    6. source modification timestamp **not regressing** vs `last_source_modification_ts`.
    → **Then, atomically:** tombstone **feed-owned** media only (existing empty-set branch,
    preserving `crm:`), update hero/photo-count summary, commit the successful checkpoint
    (`last_complete_media_set_hash` = empty sentinel, `last_seen_photos_change_ts`,
    `last_reconciled_at`), and clear pending state.
  - If any strike-2 condition fails → remain pending (do not tombstone), keep or refresh the
    pending observation as appropriate.
- **Explicit individual `MediaStatus='Deleted'` records** continue to tombstone the named
  `MediaKey` immediately (existing `explicitDeleteKeys` path, `media-sync.ts:1088-1098`) — the
  two-strike rule governs the dangerous *mass* non-empty→zero clear only, not named deletions.

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
  `last_reconciled_at`) are persisted **only after** the complete set was fetched **and** all
  DB writes for that listing succeeded.
- The checkpoint is **never** advanced after partial pagination (`fetchMedia` threw) or any write
  failure. This mirrors the existing cursor discipline (`pickKeysetWatermark` halts at the first
  incomplete/failed listing, `media-sync.ts:435-444`).

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

---

## 5. Data flow (per-listing, RC1 reconcile loop)

```
runMediaSync → fetchProperties(page) → for each property:
  fetchMedia(listingKey)                 # RC1: resolves ⇒ COMPLETE set; throws ⇒ preserve+halt
  ├─ threw?  → preserve media, no tombstone, do NOT advance checkpoint (existing behavior)
  └─ resolved (complete set):
       prevActiveFeedCount = count active non-crm listing_media for listing
       if set NON-EMPTY:
           upsertListingMedia(..., tombstoneVanished:true)   # existing path
           reset pending; persist checkpoint(hash(set))
       elif prevActiveFeedCount == 0:                        # already-empty
           no-op; refresh last_reconciled_at; hash=∅sentinel
       else:                                                 # NON-EMPTY → EMPTY (dangerous)
           two-strike guard (§4.3) under row lock (§4.4):
             strike 1 → record pending; NO tombstone/hero/cache
             strike 2 (all conditions) → atomic: tombstone feed-only, update hero/count,
                                          commit checkpoint, clear pending
```

Listing-sync half (`sync.ts`): with §4.6 enabled, a PCT-only `raw_data` delta no longer forces a
write; the media truth is reconciled by the media-sync half above.

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

Two-strike-specific:
11. Non-empty → **first** complete-empty → pending recorded, **nothing** tombstoned/cleared/invalidated.
12. First-empty then **non-empty** → pending reset, normal reconcile (single transient empty-200 never blanks).
13. First-empty then second-empty **same cycle id** → NOT confirmed (no tombstone).
14. First-empty then second-empty **different cycle**, all conditions → tombstone feed-only, crm preserved, hero/count updated, checkpoint committed.
15. Second-empty with **regressing PCT** or **regressing source ts** → NOT confirmed.
16. Concurrency: two overlapping same-cycle observations → at most one pending, never a confirm.

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

- **Q3 confirmation:** guard-first-then-PCT within one PR (§10) as written — or do you still want
  the PCT exclusion behind a default-OFF runtime flag so it's flipped only after observing natural
  cycles post-merge? (Spec currently ships it enabled as the final, isolated commit.)
- **§4.6 cooperation model** (media-sync reconciles; listing-sync merely stops rewriting) — confirm
  you're good with this vs. literally invoking reconciliation from `sync.ts`.
- **§4.4 lock choice** (row lock vs advisory lock) — any preference, or leave to the plan.
