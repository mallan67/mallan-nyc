# Phase 1 Media Loop Closures — Implementation Plan (2026-06-10)

> **Status: PLAN ONLY — Maya approved the plan, NOT the implementation.** No code changed, no
> commits, no DB access. Every citation is a static Class-A code read from the working tree at
> `0fe39174` (main). Implements Phase 1 of
> `docs/audits/media-system-deep-review-code-2026-06-10.md` §5, with data context from
> `docs/audits/media-system-deep-review-data-2026-06-10.md`.
>
> **Governance:** one correction = one PR = one Correction Trace Record, per
> `docs/audits/settlement-ledger-2026-06.md` + the gate plan
> (`docs/superpowers/plans/2026-06-07-settlement-gates-and-oversight-plan.md`). Trace Records
> follow the `docs/audits/corrections/RC3-r2-retry-purgatory.md` pattern: pre-registered blast
> radius (§2), behavioral RED→GREEN (never grep-only), gate results, runtime verification.
> Every correction below touches a §D surface ⇒ `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md`
> §8 (Media) read before implementation (done for this plan; re-read at implementation time),
> §G chain run before every commit, rebny-compliance skill invoked pre-commit.
>
> **Standing holds none of these may touch:** prisma schema/migrations · env vars · Neon settings ·
> cron config (`vercel.json`) · `.github/workflows/**` · `public/crm/**` frontend · agents/
> skills · R2 deletes/cleanup · backfills/reconciliation runs · manual cron triggers · force-push.
> Correction 4 explicitly resolves with **no schema** (stop-bumping variant chosen).

---

## Correction 1 — reset-sync RC2 patch (closes L5-manual; un-RC2's W16)

**Defect (Class A).** `app/api/crm/listings/reset-sync/route.ts` fetches with `expandMedia: false`
(`:97-102`, PR-S.1c comment: Trestle 400s the expand) so `mapped.media = []`, yet the upsert
UPDATE branch writes `media: mapped.media as Prisma.InputJsonValue` unconditionally (`:159`).
This is the only Trestle-shaped JSON writer left outside the RC2 guard (`mediaUpdatePatch`,
`lib/idx/sync.ts:34-42`, wired at `:332` and `:1163`). Manual broker trigger ⇒ mass JSON stomp
across up to 2,000 records (`maxTotal: 2000`, `:99`).

**Honesty note (record in the Trace Record):** the route's STEP 1 deletes ALL listings first
(`:59`), so on a clean run every upsert hits CREATE (which legitimately writes `[]`, same as W1).
The UPDATE branch is the re-entrant/partial-failure/future-edit path — this fix is defense in
depth that makes the route RC2-consistent, not a claim that the UPDATE branch fires on every
invocation. The route's delete-first destructiveness itself is by design ("one-time use",
broker-auth) and is OUT of scope; see Open Question OQ-1.

**Exact change.**
- `app/api/crm/listings/reset-sync/route.ts`
  - Import `mediaUpdatePatch` from `@/lib/idx/sync`.
  - Hoist the literal into `const EXPAND_MEDIA = false;` used both in the `fetchFromTrestle`
    call (`:100`) and the patch, so the two can never silently diverge.
  - In the `update:` block, replace line `:159`
    (`media: mapped.media as Prisma.InputJsonValue,`) with
    `...mediaUpdatePatch(mapped.media, EXPAND_MEDIA),`.
  - CREATE branch (`:131`) unchanged (new row, nothing to preserve — identical to W1 semantics).

**RED test (behavioral).** Mirror `tests/runtime/idx-sync-media-stomp.test.ts` (the RC2 test).
New `tests/runtime/reset-sync-media-stomp.test.ts`:
1. Behavioral: extract nothing new — the behavior IS `mediaUpdatePatch(x, false) === {}`
   (already covered); the *new* behavioral assertion is route-level: with `prisma.listing.upsert`
   mocked, drive the upsert loop (module-import the route handler with mocked
   `fetchFromTrestle` returning 1 record) and assert the captured `update` payload has **no
   `media` key**. RED on main: payload contains `media: []`.
2. Plus the RC2-pattern structural lock (`src` contains `...mediaUpdatePatch(mapped.media,
   EXPAND_MEDIA)` in the update block) as a secondary guard — never the only proof.

**GREEN expectation.** Update payload omits `media`; existing `listings.media` preserved on any
UPDATE-branch hit; CREATE unchanged; idx-sync-media-stomp suite 7/7 still green.

**Blast radius (gate:macro declaration).** WILL touch: the reset-sync route + 1 new test file.
Transitive: none — `mediaUpdatePatch` is already exported and unchanged; `lib/idx/sync.ts` NOT
edited. MUST NOT touch: `lib/idx/sync.ts` batch loops, projection dual-write, the delete-first
STEP 1, auth, any other route.

**Gates.** gate:micro + gate:macro (always) · **tristle** (media display semantics on a §D
surface) · **security-agent NOT required** (no auth/route-surface change — route auth untouched;
state this in the record) · Codex pass · §G chain. B2 proof: the behavioral RED→GREEN (route is
a manual broker tool; no live probe possible without firing a destructive route — document the
§F test-flips-green basis, as RC2 did).

**Regression guards.** The new test stays as permanent guard; `idx-sync-media-stomp.test.ts`
unchanged-green proves RC2 proper untouched.

**Size.** 2 files · route diff ~6 LOC · test ~70 LOC.

**Dependencies.** Independent of all other five. No ordering constraint.

---

## Correction 2 — `crm:` guards on tombstoneVanished + media-order (closes L6 + L7)

**Defect (Class A), two coupled halves of one namespace boundary:**
- (a) `lib/idx/media-sync.ts:595-614` — `tombstoneVanished` tombstones every active row not in
  the feed set. **Both** where-branches lack a `crm:` exclusion: the notIn branch (`:604-608`)
  AND the empty-input branch (`:601-603`, which tombstones *every* active row). Agents'
  supplemental CRM photos (`crm:`-keyed, `lib/media/crm-media.ts:16,34-35,45-47`) on
  Trestle-synced listings are deleted whenever the listing's PCT re-enters the sync window —
  contradicting the `crm-media.ts:2-7` design header ("the Trestle sync never collides with or
  prunes them").
- (b) `app/api/crm/listings/[id]/media-order/route.ts:61-67` — the reorder `updateMany` is
  scoped by `media_key + listing_id + status:'active'` only; it renumbers **Trestle** rows,
  which the next media-sync pass rewrites from Trestle `Order` (`media-sync.ts:549`) →
  ping-pong (L7). The sibling `[mediaId]` route got the guard right (`isCrmMediaKey` at
  `[mediaId]/route.ts:52,102`); the operator script got it right
  (`scripts/ops/set-listing-primary-photo.mjs:90-106`); this route didn't.

**Why one PR:** L6/L7 are the same defect (the `crm:` namespace contract enforced on one side
of the boundary but not the other), same blast-radius story, same tristle question, fire on the
same trigger condition. Splitting them would leave the boundary half-guarded twice.

**URGENCY NOTE for sequencing:** the RC1 catch-up is actively draining the frozen cursor right
now, running `tombstoneVanished` across thousands of listings as the cursor reaches them
(orchestrator sets it at `media-sync.ts:1677`, safe-on-completeness per RC1). Every drained
listing with CRM supplemental rows loses them. This correction should land **first**.

**Exact change.**
- `lib/idx/media-sync.ts:595-614`: import `CRM_MEDIA_KEY_PREFIX` from `@/lib/media/crm-media`
  (pure module — no import cycle: crm-media imports only crypto + Prisma types). Add to BOTH
  where shapes: `NOT: { media_key: { startsWith: CRM_MEDIA_KEY_PREFIX } }`. Explicit-delete
  tombstones (`:583-593`) unchanged — those are keyed by Trestle MediaKeys from the feed and
  cannot match `crm:` keys, but state that reasoning in the record rather than touching it.
- `app/api/crm/listings/[id]/media-order/route.ts`: partition `ordered_media_ids` with
  `isCrmMediaKey`; build `updates` only from `crm:` keys (preserving each key's index in the
  ORIGINAL array so relative order vs untouched Trestle rows is explicit); return
  `skipped_trestle_keys: n` in the response so the behavior is not a silent no-op
  (silent-failure-hunter). Trestle rows' `order` stays media-sync-owned.

**RED tests (behavioral).**
- Extend `lib/idx/__tests__/media-sync-upsert.test.ts` (existing `upsertListingMedia` suite):
  1. "feed set absent a `crm:` row ⇒ crm: row survives" — mocked prisma captures the
     `updateMany` where; assert the `crm:` exclusion present in the notIn branch. RED on main.
  2. Same for the **empty-input** branch (the more dangerous one). RED on main.
- New `tests/runtime/crm-media-order-guard.test.ts`: extract a pure
  `partitionMediaOrderKeys(orderedIds)` helper (exported from `lib/media/crm-media.ts`) →
  RED: function absent; GREEN: Trestle-shaped keys land in `skipped`, `crm:` keys get indexes.
  Route-level mock asserts no `listingMedia.updateMany` is issued for a Trestle key.

**GREEN expectation.** crm: rows survive tombstoneVanished in both branches; reorder writes
touch only crm: rows; response reports skipped Trestle keys; existing media-sync suite
(181 tests incl. rc1/rc3/watermark/orchestration) all green unchanged.

**Blast radius.** WILL touch: `lib/idx/media-sync.ts` (the two where-clauses ONLY — reopens the
media-sync test suite + tristle radius), the media-order route, `lib/media/crm-media.ts`
(additive pure helper), 2 test files. Transitive: every `runMediaSync` caller (cron) — behavior
delta is strictly "fewer rows tombstoned" (fail-safe direction: never deletes more). MUST NOT
touch: `emitFailure`/RC3 parking, RC1 pagination/keyset, `upsertListingMedia` mapping (`:489-526`),
explicit-delete branch, summary/denorms, `public/crm/**` frontend (the route response field is
additive; no frontend change needed or allowed).

**Compliance framing for tristle:** REBNY tombstones for **Trestle-keyed** rows are unchanged —
deleted-at-source feed photos still tombstone exactly as before (explicit `:583-593` + vanished
for feed keys). The exclusion protects only the `crm:` namespace, which never originates from
the IDX feed. Fail-closed posture preserved.

**Gates.** gate:micro/macro · **tristle** (tombstone semantics = media display) ·
**security-agent** for the route half (auth surface untouched but it IS a mutation route —
cheap, run it) · Codex · §G chain. B2: behavioral RED→GREEN + post-merge runtime check
(ops:health media-sync section + one read-only SQL: count of active `crm:` rows before/after a
sync window passes — non-decreasing).

**Regression guards.** The two new tombstone tests + partition test are permanent. RC1 tests
green prove pagination/watermark untouched.

**Size.** 4 files · lib diff ~14 LOC · route ~18 LOC · helper ~12 LOC · tests ~130 LOC.

**Dependencies.** Independent; must merge BEFORE any targeted re-sync/backfill (Phase 3 data
work) and ideally before the RC1 drain progresses further. No dependency on 1/3/4/5/6.

---

## Correction 3 — M3 floor-plan classifier fixes (ledger row **M3**; closes I4's two broken classifiers)

**Defect (Class A; picklist verified).** Canonical MediaCategory truth, verified for this plan
against the live-captured Trestle `$metadata` (`artifacts/metadata.xml:11545-11605`,
`EnumType Name="MediaCategory"`): the enum **member name is `FloorPlan`** (Value 6; Cotality
StandardName "Floor Plan" is annotation-only — OData JSON serializes the member name, so the
feed emits `"FloorPlan"`). Note: the `trestle-fields` MCP does not index Media-resource enums
(lookup returned "not found" 2026-06-10) and `data/rebny-rls-property-lookup.csv` is
Property-only — `artifacts/metadata.xml` + `classifyTrestleMediaCategory`'s live-verified
doc-comment (`lib/media/media-sync-service.ts:85-137`, verified live 2026-05-01) are the
canonical sources here. **Re-verify at implementation time per §J.4 if `metadata.xml` is
refreshed before then.**

Two sites still carry the with-space bug the 2026-05-01 fix removed from sync.ts:
- `lib/idx/mapping.ts:331-337`: `cat.includes('floor plan')` never matches lowercased
  `"floorplan"` ⇒ FloorPlan classified Photo. **Same bug class on line 337:**
  `cat.includes('virtual tour')` never matches `"unbrandedvirtualtour"`/`"brandedvirtualtour"`
  ⇒ VirtualTours also classified Photo. (`includes('video')` happens to work.) The
  `ShortDescription` fallback (`:335`) does work and must be retained.
- `app/api/agents/[slug]/listings/route.ts:336` same with-space filter (floorplans NOT skipped
  for cards) + `:341` hard-codes `mediaType: 'Photo'` for every record.

**Exact change.**
- `lib/idx/mapping.ts:327-349`: replace the inline `cat`-based branching with
  `classifyTrestleMediaCategory(item.MediaCategory)` (import from
  `@/lib/media/media-sync-service`); keep the existing `desc`-based floor-plan override
  (ShortDescription heuristic — canonical classifier doesn't take desc); keep the
  preferred/-1 order sentinel and the existing photos-first sort (`:344-349`) byte-identical.
- `app/api/agents/[slug]/listings/route.ts`: in `batchFetchPhotos`, extract the
  records→media mapping into an exported pure helper (e.g. `mapAgentCardMedia(records)` in the
  route file or `lib/idx/agent-card-media.ts`); classify via `classifyTrestleMediaCategory`;
  **include only canonical `Photo`** rows for cards (drops floorplans as intended — note this
  also stops Videos/VirtualTours masquerading as card photos, a deliberate behavior change to
  declare in the record); set `mediaType` from the classifier, not the literal.

**RED tests (behavioral).**
- `lib/idx/__tests__/c1-classification.test.ts` (or new `mapping-media-category.test.ts`):
  `mapCOTALITYToInternal` on a record with `Media: [{MediaCategory:'FloorPlan',...}]` → item
  `mediaType === 'FloorPlan'` and sorted last. RED on main (returns 'Photo', sorted first).
  Same for `'UnbrandedVirtualTour'` → `'VirtualTour'`.
- New test for `mapAgentCardMedia`: FloorPlan record excluded; Photo kept with
  `mediaType:'Photo'`; preferred → order -1. RED: helper absent.

**GREEN expectation.** Floor plans can no longer be the hero on the `/api/listings/[id]`
expanded path or on agent cards; canonical resolver (`listing-media-resolver.ts:137-148`) and
the two fixed sites now agree (divergence mechanism #4 of the code review closed).

**Blast radius.** WILL touch: `lib/idx/mapping.ts` (media block only), the agents listings
route (batchFetchPhotos only), tests. Transitive: every `mapCOTALITYToInternal` caller — detail API
Trestle-direct path (`app/api/listings/[id]/route.ts:90-153`), search Trestle-merge branch.
Since `useExpandMedia=false` everywhere in cron paths, `normalized.Media` is usually absent ⇒
mapped media `[]` ⇒ the change is inert on cron writes; it bites only where Media is actually
present inline (rare) and on the agent live-batch path. Declare exactly this. MUST NOT touch:
`classifyTrestleMediaCategory` itself, `buildMediaR2Key`, the resolver, TABLE writers, JSON
writers, gates/status logic.

**Gates.** gate:micro/macro · **tristle** (media display semantics, §D media area read — done
above, re-read at impl) · Codex · §G chain. **B2 live proof (ledger M3 requires it):** preview
or production probe of `/api/agents/[slug]/listings` for an agent whose listing has floorplans,
captured before/after — floorplan URL absent from `media[0]`. (Read-only GET probe; allowed.)

**Regression guards.** New classification tests permanent; `media-fields-live-parity.test.ts` +
`c1-mapping-idx-plus.test.ts` unchanged-green prove field mapping untouched.

**Size.** 3-4 files · mapping.ts ~12 LOC · route ~20 LOC · tests ~110 LOC.

**Dependencies.** Independent of 1/2/4/5/6. Settles ledger row **M3** (update ledger + Trace
Record on merge).

---

## Correction 4 — stop CRM media routes bumping `modification_timestamp` on Trestle-synced rows (closes L8)

**Defect (Class A).** Four bump sites: `app/api/crm/listings/[id]/media/upload/route.ts:274-277`
("Touch the listing so ISR/edit-load see the change"), `…/media/[mediaId]/route.ts:74-77` and
`:158-161`, `…/media-order/route.ts:70-73`. The idx-sync cursor is
`MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL`
(`lib/idx/sync.ts:1033-1043`; design contract `:963-1031` — MT must be the **Trestle row
clock**, never the local clock). A CRM media action on a Trestle-synced listing (IDX rows AND
agent-history rows both set `last_synced_from_trestle`) writes local NOW into MT ⇒ the next
incremental filter `MT gt SINCE` skips every unprocessed feed record older than the bump —
the exact PR-S.6/S.7 hazard reintroduced through a side door.

**Decision (per Maya's "prefer stop-bumping" / NO schema):** **scoped stop-bump.** Bump MT only
when `last_synced_from_trestle IS NULL` (CRM-only exclusives: SL-/RL-); **skip the listing
touch entirely** for Trestle-synced rows. Rationale: the cursor query reads exactly the
NOT-NULL cohort, so the skip removes the hazard completely; CRM-only listings keep current
behavior (their MT feeds sitemap `lastModified` `app/sitemap.ts:128`, IDXDisclaimer
`lastUpdated`, portal-comparables ordering — all unaffected for the null cohort). For
Trestle-synced listings, media truth lives in `listing_media` rows (which carry their own
`updated_at`); the listing row genuinely did not change. The "ISR" rationale in the comment is
inert — detail pages are time-based ISR (`revalidate=300`), not MT-triggered. Declared
behavior delta: a Trestle listing with a CRM media edit no longer floats in MT-ordered lists
(portal comparables) — correct, since MT should be feed truth. **No schema, no new column.**

**Exact change.**
- `lib/media/crm-media.ts`: add pure exported
  `crmListingTouchData(lastSyncedFromTrestle: Date | null): { modification_timestamp: Date } | null`
  — returns `null` (no touch) when synced, the bump object when not.
- Each of the 3 route files: include `last_synced_from_trestle` in the listing `select`
  (upload route's lookup; `resolveOwnedListing` in `[mediaId]`; the media-order `findUnique`
  `:36-39`), then `const touch = crmListingTouchData(...); if (touch) await prisma.listing.update(...)`.

**RED tests (behavioral).** New `tests/runtime/crm-media-mt-bump.test.ts`:
1. `crmListingTouchData(new Date())` → `null`; `crmListingTouchData(null)` → bump object.
   RED: function absent.
2. Route-level with mocked prisma: upload/delete/reorder on a listing fixture with
   `last_synced_from_trestle` set → **no** `listing.update` carrying `modification_timestamp`;
   with it null → bump still issued. RED on main: bump always issued.
3. Cursor-protection assertion (the actual loop): given a mocked listings table where the only
   row newer than the feed watermark is a CRM-bumped one, `getLastSyncTimestamp()` semantics —
   covered indirectly; cite `lib/idx/__tests__/sync-watermark.test.ts` /
   `tests/runtime/idx-sync-cursor-modification-timestamp.test.ts` unchanged-green as the
   companion guard (do not edit them).

**GREEN expectation.** CRM media actions on IDX/agent-history listings leave MT = Trestle row
clock; cursor can never jump past unprocessed feed records via CRM media writes; CRM-only
exclusives behave exactly as today.

**Blast radius.** WILL touch: 3 CRM media routes + `lib/media/crm-media.ts` (additive helper) +
1 test file. Transitive: cursor correctness (positive), sitemap/disclaimer/ordering for the
synced cohort (MT now stays feed-true — declare). MUST NOT touch: `lib/idx/sync.ts`,
`getLastSyncTimestamp`, schema, `photos/route.ts` legacy appender (its `:85` bump is part of
the W13 retirement item — Phase 1 item 4 of the audit, NOT in this six-pack; do not creep),
`public/crm/**` frontend.

**Gates.** gate:micro/macro · tristle **light** (no display-gate/status/DTO change; media
display semantics unaffected — argue N/A-with-rationale as RC3 did, but run it since routes
are §D CRM surfaces) · **security-agent** (mutation routes touched — auth logic unchanged,
cheap confirmation) · Codex · §G chain. B2: behavioral RED→GREEN; post-merge runtime check =
one read-only SQL after an agent media edit on a synced listing showing MT unchanged (or
ops:health cursor watermark steady across the edit).

**Regression guards.** New test permanent; existing cursor tests unchanged-green.

**Size.** 5 files · helper ~15 LOC · routes ~10 LOC each · test ~90 LOC.

**Dependencies.** Independent. Best merged before agents resume heavy CRM media work and
before correction 2 makes CRM supplemental uploads safe (order with #2 either way; see
sequencing).

---

## Correction 5 — table-aware ops:health first-image metric (closes L11)

**Defect (Class A, observability).** `scripts/ops-health.js:476-525` classifies the
"first image" of every IDX-displayable listing from `listings.media` JSON ONLY
(`media->0->>'url'/'MediaURL'`), and `idx_displayable_no_usable_image_lower_bound` = the
JSON-empty count (`:517`). Production truth (data audit §2.3): **1,696 IDX-displayable listings
are JSON-empty but TABLE-served** — the metric calls them "EMPTY media (placeholder rendered)"
while the PR-4 reader renders fine from `listing_media`. The false alarm drove corrective work
at the wrong layer (code audit L11) and the same metric is the coverage trend that must time
Phase 3/M4.

**Exact change.**
- New `scripts/media-image-health.js` (CommonJS, pure — the `scripts/branch-prune-health.js`
  precedent, same as lane-D's `r2-retry-health.js`): exports the classification SQL string +
  `deriveImageIssues({thresholds, counts})`.
- `scripts/ops-health.js:476-525`: extend the single aggregate with a LATERAL/EXISTS arm —
  per the diagnosis doc's already-written SQL — classifying each IDX-displayable listing into:
  `json_first_image_{r2|trestle_proxy|other}` (legacy buckets, kept), `json_empty_table_served`
  (JSON empty/invalid AND ≥1 active `listing_media` row), and `no_image_any_layer` (JSON empty
  AND no active row — the REAL render-path placeholder count). **Additive fields only**
  (script's own back-compat policy, `ops-health.js:79-85`): keep
  `first_image_empty` meaning JSON-empty (legacy), add
  `media_sync.first_image_table_served` + `media_sync.no_image_any_layer`. Rewire the
  warn/critical issue (`no_usable_image_*` thresholds) to key off `no_image_any_layer`;
  keep the legacy count printed so the reclassified residue stays observable
  (silent-failure-hunter: nothing disappears, it is re-labeled).
- Human output line updated to show all three numbers.

**Coordination with Lane D (`docs/audits/lane-d-ops-health-parked-split-plan-2026-06-10.md`) —
ONE PR or two?** **Two PRs, sequenced back-to-back; do NOT duplicate.** Reasons: (a) different
defects with different Trace Records (Lane D settles RC3 §10; this settles L11) — the
one-correction-per-PR rule; (b) the edits are line-disjoint (`:566-590` R2-retry block vs
`:476-525` image block) so the rebase is trivial; (c) each has an independent runtime
verification (Lane D: actionable≈44/parked≈40; this: no_image_any_layer ≈ the diagnosis's
~8,977 pre-drain, shrinking as the cursor drains). Shared pattern to keep aligned, not shared
code: both add a pure `scripts/*-health.js` module + THRESHOLDS entries + additive JSON fields.
**Sequence Lane D first** (already fully planned, awaiting GO), this one immediately after.
Single-PR fallback if Maya prefers one merge cycle: acceptable mechanically (same file, same
gates, observability-only), but the blast-radius records and trace records would have to be
merged — not recommended.

**RED tests (behavioral).** New `tests/runtime/media-image-health.test.ts`:
1. `deriveImageIssues` absent → RED. Cases: `no_image_any_layer` over/under warn+critical
   boundaries (both `>=`-vs-`>` semantics pinned, mirroring Lane D §6); a fixture
   `{json_empty: 1696, table_served: 1696, any_layer: 0}` → **zero issues** (the false-alarm
   fix, conceptually red against the old logic which alarms on 1,696).
2. SQL-shape test: classification buckets mutually exclusive + exhaustive on fixture rows.

**GREEN expectation.** ops:health stops alarming on TABLE-served listings; the alarm now tracks
the real render path; the Phase-3/M4 sizing number (`no_image_any_layer`) is first-class and
trendable.

**Blast radius.** WILL touch: `scripts/ops-health.js` (image block only), new
`scripts/media-image-health.js`, 1 test. Transitive: ops:health verdict/exit code can change
(false warnings clear) — declare, as Lane D does; `.ops-health-last` consumers unaffected
(verdict shape unchanged). MUST NOT touch: `lib/**`, prisma, cron config, `.github`,
Lane D's `:566-590` block, R2 logic.

**Gates.** gate:micro/macro · tristle **N/A-with-rationale** (read-only observability; zero
display/distribution surface — same rationale as Lane D §6, rebny-compliance skill still runs) ·
Codex · §G chain. B2: RED→GREEN + one post-merge read-only `npm run ops:health` capture showing
the three-way split against production.

**Regression guards.** Boundary tests permanent; legacy fields asserted still present.

**Size.** 3 files · ops-health.js ~45 LOC · new module ~60 LOC · test ~110 LOC.

**Dependencies.** Rebases on Lane D (sequence after it). Most valuable AFTER the RC1 cursor
drain completes (baseline meaningful), but safe any time. Independent of 1-4 and 6.

---

## Correction 6 — feed-reconcile `$expand=Media` live verification, THEN conditional fix (L13; Class B per §J)

**Hypothesis (NOT yet a defect — J.3: do not act before proof).**
`app/api/cron/feed-reconcile/route.ts:261-262` builds the orphan-create fetch as
`…/odata/Property?$filter=…&$expand=Media($filter=MediaStatus ne 'Deleted';$orderby=Order)…`,
while `lib/idx/fetch.ts:32-43` documents Trestle consistently 400-ing `$expand=Media`
(production-verified for the `$select`-form, PR-S.1c 2026-05-15). **The inner-`$filter` form
may behave differently** — that is exactly why this is Class B. If it 400s, every orphan batch
errors out (`:265-268` `continue`), ghosts are never imported, and the FK refusal
(`listing_media.listing_id` FK, code audit I7) keeps feeding the RC1 ghost-freeze. The 3 known
ghosts (diagnosis §1.3) recur daily at the 03:30 cron (`vercel.json:11`).

**AMENDMENT (Codex #382, 2026-06-10 — REQUIRED scope addition to the conditional fix):** RC5
advances the cursor PAST ghosts, so an ex-ghost imported later by this route lands with its
PhotosChangeTimestamp already BEHIND the cursor — media-sync will never revisit it unless Trestle
bumps PCT. The naive fix (drop `$expand`, create without media) would therefore produce listings
photoless in BOTH layers (empty JSON + empty listing_media). **The #6 fix MUST also arrange media
for every orphan-created listing** — either (a) fetch the complete media set post-create inside
the reconcile route via the RC1-hardened `fetchMedia` + `upsertListingMedia` + summary path, or
(b) anchor the created listing for media-sync pickup. Option (a) preferred: reuses the proven
complete-set machinery, no cursor surgery. RED test must cover: orphan-created listing ends with
populated `listing_media` (or an explicitly recorded media-pending state), never silently
photoless-in-both-layers.

**HARD CHECKLIST ITEM (Maya, 2026-06-10, pre-condition for #382 merge — verbatim):**
> "Any orphan listing created by feed-reconcile must immediately populate media or enqueue
> targeted media re-sync, with a RED test proving it cannot remain photoless in both
> `listing_media` and legacy `media`."

This item is REQUIRED (not optional) scope of Correction 6. Correction 6 cannot be marked SETTLED
in the ledger without it. Tracked from: Codex finding on PR #382 (accepted as real by Maya);
RC5 Trace Record §4 cross-references this item.

**Step 1 — verification FIRST (read-only, no gate beyond probe discipline; runnable today).**
Two independent probes; either one settles it, run both if cheap:
1. **Runtime log read (preferred — zero feed traffic):**
   `mcp__claude_ai_Vercel__get_runtime_logs` for `/api/cron/feed-reconcile` covering a
   03:30-03:40 UTC window. The route logs `[feed-reconcile] orphan fetch ${i}: HTTP ${status}`
   (`:267`) whenever an orphan batch fails — with 3 standing ghosts, a 400 (if real) appears
   every day. `HTTP 400` present ⇒ CONFIRMED. Orphans-created>0 in the cron summary ⇒ REFUTED.
2. **Direct live OData probe (untracked throwaway, `scripts/__` pattern — DO NOT COMMIT):**
   `scripts/__probe-feed-reconcile-expand-2026-06-10.mjs` — token via `lib/idx/auth`
   `getAccessToken()`, then a single GET of the EXACT route-built URL shape with one known-good
   ListingId:
   `{TRESTLE_API_URL}/odata/Property?$filter=ListingId eq 'RLSXXXXXXX'&$expand=Media($filter=MediaStatus ne 'Deleted';$orderby=Order)&$top=1`
   (URL-encoded identically to `:262`). Capture HTTP status + body excerpt into the Trace
   Record. Read-only GET; no DB.

**Step 2a — if REFUTED (expand works live):** no code change. Record L13 as REFUTED in the
ledger with the probe capture; the ghost story remains fully owned by the P0 ghost-skip fix.

**Step 2b — if CONFIRMED (400): the fix.**
- `app/api/cron/feed-reconcile/route.ts`: extract pure exported
  `buildOrphanFetchUrl(base, batchIds)`; **drop the `$expand`** — orphan creates proceed with
  `mapped.media = []`, byte-identical to W1 CREATE semantics (`lib/idx/sync.ts:290-309`); the
  media TABLE arrives via the media-sync cron once the listing row exists (which is the entire
  point — the listing's existence is what stops manufacturing RC1 ghosts). Do NOT add a
  per-orphan `fetchListingMedia` call (keeps blast radius minimal and avoids a second live
  dependency in a cron loop; JSON media starvation on creates is the L1/M1 program, not this
  correction). Alternative (separate-media-fetch) documented and rejected in the record.

**RED test (behavioral, for 2b).** New `tests/runtime/feed-reconcile-orphan-fetch.test.ts`:
1. `buildOrphanFetchUrl` absent → RED; GREEN: no `$expand` param, `$filter` ListingId-escaped
   (quote-doubling preserved), `$top` = batch size.
2. Orphan-create loop with mocked fetch returning records WITHOUT `Media` → listing created,
   `media: []`, audit event written. RED on main only via the URL builder (the loop already
   tolerates missing Media — state that honestly; the behavioral RED lives in the builder).

**GREEN expectation.** Orphan batches return 200; ghost listings get imported at the next
03:30 firing; `feed_reconcile_orphan_created` audit events appear; the RC1 ghost population
stops being manufactured (P0 makes ghosts non-fatal; this stops creating them — the durable
companion, code audit Phase 2).

**Blast radius (2b).** WILL touch: feed-reconcile route (URL construction only) + 1 test.
Transitive: orphan creates gain `media: []` instead of erroring — strictly additive listing
rows; projection dual-write path already in the route. MUST NOT touch: cron schedule
(`vercel.json` HELD), orphan ABORT cap / archive logic elsewhere in the route, `lib/idx/fetch.ts`
defaults, manual cron triggers (verification uses logs/a read-only OData GET, never a route fire).

**Gates.** gate:micro/macro · **tristle** (cron route writing listings + media JSON — §D) ·
Codex · §G chain · **J.4 proof attached** (the probe capture is mandatory in the Trace Record —
no field/feed-behavior claim without it). B2: behavioral RED→GREEN + post-merge runtime proof =
next cron firing's summary showing `orphansCreated > 0` / ghosts imported (Vercel runtime log
read; no manual trigger).

**Regression guards.** URL-builder test permanent; existing feed-reconcile tests (if any)
unchanged.

**Size.** Probe: 0 committed files (throwaway script + log read). Fix: 2 files · route ~15 LOC ·
test ~80 LOC.

**Dependencies.** Probe: independent, run immediately (it also informs P0's runtime
verification). Fix: logically paired with the **P0 ghost-skip cursor fix (already
Maya-approved/queued, NOT part of this plan)** — P0 should merge first (it un-freezes the
cursor regardless of ghost supply); this fix then dries up the supply. No dependency on 1-5.

---

## PR sequencing (one write/merge at a time — Maya's rule)

**Already queued ahead of this plan (not part of it):** P0 ghost-skip cursor fix (RC1
follow-up, Maya-approved queue) · CI3 media-backfill route delete (Maya gate on the PR) ·
Lane D ops-health parked split (planned, awaiting GO). The P0 merge slot stays #1 overall —
nothing here preempts it.

**Grouping verdicts:**
- Correction 2's two guards = ONE PR (one namespace-boundary defect, one blast radius, L6+L7).
- Everything else = separate PRs. 1 and 2 both touch "RC2-family" semantics but different
  files/radii (route vs lib) — keep separate. 5 must not merge into Lane D's PR (separate
  trace records); sequence adjacently instead.
- Correction 6 splits into a read-only probe (no PR, no merge slot — can run in parallel with
  anything) and a conditional fix PR.

**Proposed merge order (after P0):**

| Slot | PR | Why this position |
|---|---|---|
| 0 (parallel, no slot) | **#6 probe** — log read + read-only OData GET | Zero-risk, settles whether a 6th fix PR exists at all; informs P0 runtime verification |
| 1 | **#2 crm: guards** (tombstoneVanished + media-order) | The RC1 catch-up is running tombstoneVanished across the draining backlog NOW — every day of delay risks deleting agents' CRM supplemental photos. Highest live-harm rate of the six |
| 2 | **#1 reset-sync RC2 patch** | Tiny, independent, removes the last un-RC2'd manual mass-stomp before any operator touches the broker tool again |
| 3 | **#4 MT-bump scope** | Closes the cursor-jump hazard before agents resume CRM media work (which #2 just made safe to do) |
| 4 | **#3 M3 classifiers** | Settles ledger row M3; needs a live B2 probe, so schedule when a preview/prod probe window is convenient |
| 5 | **Lane D ops-health split** (separate, already-planned PR) | Land before #5 below so both ops-health edits rebase cleanly in one direction |
| 6 | **#5 table-aware image metric** | Last code PR: purely observability, and its post-merge baseline is most meaningful once the cursor drain (P0) has progressed |
| 7 (conditional) | **#6 fix** (drop `$expand` from orphan fetch) | Only if the probe CONFIRMS the 400; after P0 so the runtime proof (ghosts imported, cursor stays unfrozen) is clean |

Risk note on ordering: #2 before #4 also means that if an agent re-uploads photos L6 deleted,
the re-upload no longer poisons the cursor once #4 lands — the pair closes a two-step
interaction (L6 re-upload → L8 bump).

**Interaction with the RC1 P0 (queued, out of scope):** P0 unfreezes the cursor; the drain then
(a) makes #2 urgent (tombstoneVanished volume), (b) sets the post-drain baseline #5 should
measure, (c) provides the clean runtime context for #6's fix proof. None of the six blocks P0;
P0 blocks none of the six except #6's fix-half (soft ordering, for proof cleanliness).

---

## Explicit final gate — NO data cleanup until all six are merged AND runtime-verified

Restating Maya's rule, which this plan adopts as a hard stop (it is also the code review's §5
sequencing principle: **close writer loops before reconciling data**):

> **No data cleanup of any kind** — NOT the 121-item deleted-photo compliance strike (data audit
> §6 row 1), NOT the targeted re-sync of the 162 cap-truncated / 205 hero-divergent listings,
> NOT the M4 backfill (HELD), NOT any R2 delete/lifecycle operation (HELD), NOT
> `audit-media-mediatype-corruption --execute`, NOT any reconciliation run — **until all six
> corrections above are merged to main and each is runtime-verified** (its Trace Record green,
> per the RC3 pattern: deploy READY + a read-only production proof). Reconciling or cleaning
> while reset-sync can stomp JSON, media-sync can tombstone CRM rows, classifiers disagree, the
> cursor can be jumped by CRM writes, the monitor reads the wrong layer, and ghosts are still
> being manufactured would produce cleanup that is wrong again the next time any of those fire.
> Each data-cleanup item afterwards remains separately Maya-gated per the existing holds.

### Amendment 2026-06-12 — cleanup re-scoped on dry-run evidence (Maya directive)

The pre-cleanup dry-runs (operator-held, untracked: `docs/audits/strike-121-dryrun-2026-06-12.md`,
`docs/audits/resync-360-dryrun-2026-06-12.md`, `docs/audits/inventory-reconciliation-2026-06-12.md`)
invalidated the original strike scope. Maya's directive, 2026-06-12:

- **The original 121-photo compliance strike is INVALID AS SCOPED and MUST NOT be executed.**
  Live-Trestle cross-check (complete paginated Media per listing, MediaKey-matched) proved
  **142 of 160** detected items are **still live at source** — wrong tombstones from the legacy
  Cp4 3×-404 strike on rotated URLs (149 carry the `r2_attempts>=3` signature), not REBNY
  removals. Executing the original scope would have deleted photos REBNY still serves.
- **Real strike-eligible set: 10 items / 2 listings** — `RLS11030439` (Active, IDX-displayable,
  3 items; the only live compliance exposure) + `RLS20082431` (Withdrawn, 7 of 8 items).
- **8 `SL-0004` items (Mallan exclusive, non-Trestle) are excluded** from any Trestle-driven
  cleanup.
- **The 142 wrong tombstones need resurrection/re-sync, not deletion** — likely folded into the
  366-key targeted re-sync mechanism (complete per-listing re-fetch re-activates rows whose
  MediaKeys are live at source).
- **The three potential card-blanking listings** (`RLS20003771`, `RLS20052270`, `RLS20077743`)
  **move to resurrection, not deletion** — they are still-live cases; no card-blanking decision
  remains.

**Post-C6-settlement cleanup order (supersedes the prior strike→re-sync→M4→R2 order; every step
stays BLOCKED until C6 settles on the ghost proof, and each remains separately Maya-gated):**

1. Resurrect/re-sync the **142 wrong tombstones** — likely through the 366-key targeted
   re-sync plan.
2. Strike the **10 genuinely deleted-at-source items** (2 listings).
3. Complete the **366-key targeted re-sync**.
4. **Re-evaluate M4** (the dry-run evidence changes its sizing inputs).
5. **R2 orphan cleanup last.**

---

## Open questions for Maya

- **OQ-1 (correction 1):** `reset-sync` STEP 1 deletes ALL listings + dependents on every
  invocation (`route.ts:49-60`) — far more destructive than the media stomp being patched. The
  header says "ONE-TIME USE … can be removed." Should a follow-up (separate, NOT in this
  six-pack) remove or hard-disable the route entirely? Patch-only is what this plan ships.
- **OQ-2 (correction 4):** confirm the scoped stop-bump (skip MT touch when
  `last_synced_from_trestle IS NOT NULL`, keep it for CRM-only exclusives) over a total
  stop-bump. The scoped form preserves sitemap/ordering freshness for SL-/RL- exclusives.
- **OQ-3 (correction 5 vs Lane D):** confirm two sequenced PRs (recommended) vs one combined
  ops-health PR.
- **OQ-4 (correction 6):** confirm Claude may run the read-only probes (Vercel log read +
  single live OData GET via a throwaway untracked script) — both read-only, no cron trigger, no
  DB write; they precede any fix PR.

*Plan authored read-only by Claude (Fable 5), 2026-06-10. Do not commit without Maya's instruction.*
