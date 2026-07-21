# Unified Feed / Media System Progress Ledger

**Repository:** `mallan67/mallan-nyc`  
**Branch:** `agent/unified-feed-media-system`  
**Draft PR:** #544  
**Base:** `main` — forked at `51b831dd`, updated onto corrected `main` `7b3dbe1d` (includes PR #545).  
**Phase 2 accepted code head:** `1dbc74dd` (validated merge).  
**Proof head:** `c237ec94` (docs-only ledger on top of `1dbc74dd`).  
**Production activation:** NONE

## Current status

- Phase 0: COMPLETE — direct authenticated Cotality contract evidence captured and sanitized.
- Phase 1: COMPLETE — media identity spine, strict classifier, hero resolver, prepared migration, and system-health scaffold.
- Phase 2: ACCEPTED — lossless/fail-closed sync primitives and flag-gated unified media pipeline implemented, pushed, tested, and CI-green.
- Phase 3: IN PROGRESS — media-row URL-rotation suppression implemented locally (+ missing-R2 recovery contract + fail-closed hardening). Remaining Phase-3 surfaces (listing/projection/summary/batch-media compare-before-write, scorer write-on-change, seller-signal reconciliation) still open.

## Phase 0 — Live Cotality contract evidence

**Status:** COMPLETE

Primary evidence:
- `docs/superpowers/specs/evidence/2026-07-21-live-cotality-contract-probe.json`
- `docs/superpowers/specs/evidence/2026-07-21-live-cotality-pagination-probe.json`
- `docs/superpowers/specs/evidence/2026-07-21-live-cotality-pagination-findings.md`

Runtime-confirmed facts used by the implementation:
- `MediaKey` is the media identity key.
- Property media can be scoped with `ResourceName eq 'Property'`.
- `MediaURL` rotates and is excluded from change comparison.
- `MediaCategory` is the semantic classifier; observed `MediaType` values are file formats.
- `Photo` and `FloorPlan` were observed at runtime.
- `@odata.nextLink` was returned and followable in the bounded sample; no duplicate `MediaKey` was observed across sampled pages.

Accuracy limits preserved:
- The bounded pagination probe did not prove full-feed completeness or global no-skip.
- Tied-timestamp secondary ordering failure was observed on Media only.
- Property endpoint tie ordering remains unverified; Property back-off is defensive fail-closed behavior, not a provider claim.

## Phase 1 — Media identity spine

**Status:** COMPLETE

| Task | Files | Commit(s) |
|---|---|---|
| Strict classifier | `lib/media/media-classifier.ts`, `tests/runtime/media-classifier.test.ts` | `257f0c63` |
| Media identity, source revision, versioned R2 key | `lib/media/media-identity.ts`, `tests/runtime/media-identity.test.ts` | `f3921be9` |
| Single hero resolver | `lib/media/hero-resolver.ts`, `tests/runtime/hero-resolver.test.ts` | `1f877107` |
| Legacy classifier delegation | `lib/media/media-sync-service.ts`, `tests/runtime/classifier-single-authority.test.ts` | `659d3567` |
| Prepared additive migration | `prisma/migrations/20260721180000_unified_media_identity/migration.sql`, `prisma/schema.prisma`, `tests/runtime/migration-prepared.test.ts` | `cc53cfcc`, `6c5e34f5` |
| System-health scaffold | `lib/ops/media-system-health.ts`, `scripts/media-system-health.ts`, `tests/runtime/media-system-health.test.ts` | `7e3a9faf` |

Migration proof:
- Executed against a disposable real Neon Postgres project.
- Additive nullable columns landed.
- Partial index built with `CREATE INDEX CONCURRENTLY` outside a transaction.
- `indisready=true`, `indisvalid=true`.
- `EXPLAIN` showed the backlog query using `listing_media_r2_backlog_idx`.
- Disposable project deleted afterward.
- Evidence: `docs/superpowers/specs/evidence/2026-07-21-migration-live-neon-execution.md`.

## Phase 2 — Lossless pipeline and coordinator

**Status:** ACCEPTED at `1dbc74dd`

| Task | Files | Commit(s) |
|---|---|---|
| Task 7 — Property cursor | `lib/sync/property-cursor.ts`, `tests/runtime/property-cursor.test.ts` | `a7c0f1a5`, `96c75d82`, `25bcda35` |
| Task 8 — Fail-closed gallery reconcile | `lib/sync/gallery-reconcile.ts`, `tests/runtime/gallery-reconcile.test.ts` | `1a71f09f` |
| Task 9 — Advisory-lock coordinator | `lib/sync/coordinator.ts`, `tests/runtime/coordinator.test.ts` | `5a5d8a55`, `2cacbac7` |
| Task 10 — Unified media reconcile + live path wiring | `lib/idx/unified-media-reconcile.ts`, `lib/idx/media-sync.ts`, `tests/runtime/media-sync-unified.test.ts` | `55c34396`, `a270a9d0` |

Implemented protections:
- Explicit `pageChainComplete` gate; incomplete pagination preserves the prior cursor.
- No cursor advancement into an incomplete or split tied-timestamp block.
- Property-scoped Media query selects `ResourceName` and `MediaType`.
- Identity comparator excludes rotating URLs.
- Empty, incomplete, contradicted, or abrupt-shrink responses fail closed with zero destructive tombstones.
- Second-fetch confirmation before vanished feed rows can be tombstoned.
- Feed reconciliation governs only Cotality-sourced rows; non-feed/local media is protected.
- All-status distinction is preserved for never-imported vs all-deleted state.
- FloorPlan and Document media are never hero candidates.
- Advisory locking uses the unpooled Postgres session and releases in `finally`.
- `UNIFIED_MEDIA_PIPELINE` remains default OFF; merge alone changes no production behavior.

### Phase 2 test and validation proof

- Targeted Phase 1/2 plus all existing media-sync regressions: **299 / 299 passed**.
- `npm run type-check`: **exit 0**.
- `npm run rls:validate`: **0 errors, UNKNOWN 0**.
- `npm run ucba:audit`: **46 / 46 pass, 0 regressions**.
- `npm run compliance-check`: **93 passed, 0 failed, BLOCKER+STRICT clear**.
- `npm run idx:validate`: one pre-existing `Cron Schedule Completeness` critical, unchanged and not caused by this branch.
- `npm run media:system-health`: **red 0**.
- Working tree at gate: clean.

### PR and CI proof

PR #544 at `1dbc74dd` (rebased onto corrected `main` `7b3dbe1d`; docs-only ledger `c237ec94` on top):
- pr-check: SUCCESS
- Target Platform Build: SUCCESS
- Guardrails (Repo + Compliance): SUCCESS
- Release Truth (job): SUCCESS
- Claude Code Review: SUCCESS
- Vercel preview: SUCCESS
- (`scan` and the retired Sentinel-L are NOT cited as proof — `scan` is not a required check, and Sentinel-L was retired/removed by PR #546.)

The pre-existing `ethics_training_gate` gap on main was corrected by PR #545 (merged into `main`); this PR merged that corrected main.

## Unresolved fail-closed items

These remain unresolved by direct live evidence and must not drive destructive behavior:
- Non-null `Permission` serialization and final Public-vs-IDX policy.
- Aged signed-URL fetchability/expiry semantics.
- Empty 200 behavior for a listing known to have populated media.
- Long-horizon URL rotation behavior.
- Full-feed pagination completeness/no-skip proof.
- Property endpoint tie ordering.
- Runtime population of all metadata-declared media categories beyond observed `Photo` and `FloorPlan`.

## Production holds

Explicit Maya approval is still required before any of the following:
- Apply the prepared production migration.
- Enable `UNIFIED_MEDIA_PIPELINE`.
- Change Property/Media cron cadence.
- Retarget `NEON_PROJECT_ID` or other environment variables.
- Delete or lifecycle R2 objects.
- Strip legacy JSON.
- Merge or deploy production changes.
- Modify or deploy held CRM frontend or workflow files.

## Phase 3 — IN PROGRESS: media-row URL-rotation suppression implemented locally; remaining write-suppression surfaces open

**Status:** media-row suppression slice IMPLEMENTED (code-only; NOT merged/deployed/flag-activated — awaiting Maya review). Phase 3 is NOT complete.

**Open Phase-3 surfaces (still churning):** `updateListingMediaSummary` still issues one `Listing.update()` per processed listing (proven in the 50-listing fixture: 750 media writes suppressed, but 50 summary writes still occur). Also open: listing compare-before-write, projection compare-before-write, media-summary compare-before-write, batch-media suppression, scorer write-on-change, seller-signal reconciliation.

**Missing-R2 recovery contract (added this round):** the suppression stops refreshing the stored signed URL once a row looks delivered (`r2_key`+`media_url_cached`), but those columns do not prove the R2 object exists. `mirrorMediaToR2` now prefers a freshly-reacquired feed URL (`current_feed_url`, by MediaKey this run) over the stored URL for the fetch, and `recoverMissingR2Object` re-mirrors a missing object from that fresh URL (never the stale stored one), writing only the R2 delivery columns. A BOUNDED per-run recovery pass (`MEDIA_RECOVERY_PROBES_PER_RUN=25`, `MEDIA_RECOVERY_CANDIDATES_PER_LISTING=4`) probes suppressed-delivered rows so drift repair can never reintroduce the compute it removes; coverage rotates as the oldest-first cursor advances.

**Fail-closed hardening (added this round):** a per-row create/update failure is counted (`writeFailures`) and isolated, but the listing is then failed closed — the tombstone block inside `upsertListingMedia` is skipped entirely (`writeFailures>0`), the run throws before `updateListingMediaSummary`, the listing is not counted processed, and the keyset cursor does not advance past it. Proven at unit + orchestration level.

**Root cause (live-proven 2026-07-21):** `listingMediaRowUnchanged` compared the
exact `media_url_original`. The Trestle signed `MediaURL` rotates on EVERY
request, so that term was always unequal → the `#530` no-op guard never fired →
`media_sync_state.rows_updated == rows_checked` (measured 752/752 per run, 100%
write rate). Sampled rows were rewritten ~45 min ago though their
`MediaModificationTimestamp`/`ModificationTimestamp` were ~112h old and every
stable identity field was unchanged.

**Fix (`lib/idx/media-sync.ts`):**
- `listingMediaRowUnchanged` is now a PURE material-identity predicate — the URL
  is fully EXCLUDED (it is never identity or a material change). Compared fields:
  status=active, listing_id, resource_record_key/id, media type + category +
  classification, order, preferred/hero flag, and BOTH source-modification
  timestamps (their max = sourceRevision).
- Delivery guard (req 4): a material-unchanged row is SUPPRESSED only when it is
  already delivered to R2 (`r2_key` AND `media_url_cached` present). An
  un-mirrored row still WRITES to refresh its signed URL, because the R2 backlog
  path reuses the STORED `media_url_original` to fetch (proven at
  `media-sync.ts` backlog select → `mirrorMediaToR2`). New counter
  `deliveryUrlRefreshed` attributes these.
- `#541` attribution keeps counting URL differences as OBSERVABILITY only; the
  URL no longer contributes to `baseMismatchCount` (invariant preserved:
  `baseMismatchCount === 0` iff material-unchanged). New PROOF counter
  `suppressedUrlRotationOnly` = rows suppressed whose only diff was a rotated URL.
- Bounded counters (req 5): `rowsChecked`, `rowsWritten`, `deliveryUrlRefreshed`,
  `suppressedUrlRotationOnly`, `writeFailures`. No URL/token/id/email is logged.
- Per-row failure isolation (req 5): a failing create/update is counted
  (`writeFailures`) and the batch continues; the run then fails the listing
  closed so the keyset cursor does NOT advance past incomplete media (req 6 —
  cursor/pagination semantics unchanged).

**Scope:** `lib/idx/media-sync.ts` + tests only. `UNIFIED_MEDIA_PIPELINE`, cron
cadence, Neon settings, schema, migrations, auth/ethics — all UNTOUCHED. The fix
lives in the always-on `#530` suppression path (not flag-gated, same as the
guard it corrects), and takes effect only on a Maya-approved deploy.

**Proof:**
- New failing-first suite `lib/idx/__tests__/media-sync-url-rotation-suppression.test.ts`
  (16 tests): URL-only rotation suppressed on delivered rows; un-mirrored rows
  still refresh; material changes (order/hero/classification/source-ts) still
  write; deleted media fail-closed; 15-row batch → 0 writes / 15 suppressed; one
  true change → exactly 1 write; per-row failure isolated.
- Existing suites updated to the new contract; **628/628** in `lib/idx/__tests__/`
  + media run-level, **131/131** media runtime suites.
- `type-check` exit 0 · `rls:validate` UNKNOWN 0 · `ucba:audit` 0 regressions ·
  `compliance-check` 94/0/0 · `media:system-health` red 0 · `idx:validate` 1
  pre-existing `Cron Schedule Completeness` critical (unchanged, not this branch).

**Write-reduction proof (how to verify in production after a gated deploy):**
`media_sync_state.rows_updated / rows_checked` drops from ~1.0 (752/752 pre-fix)
toward the genuine-change + un-mirrored fraction; `suppressedUrlRotationOnly`
surfaces the eliminated no-op writes. No production run performed here.

**Expected CPU impact:** eliminates the dominant per-run write churn (all
already-delivered rows that differ only by a rotated URL — the 752/752 measured).
Residual writes = genuine material changes + not-yet-mirrored rows (small) +
retry-exhausted parked rows (addressed by Phase 4's bounded backlog query +
parked-row exclusion). This does NOT by itself resolve the read-heavy/low-cache
CPU component identified in the read-only investigation; it removes the
write-churn contributor.

## Phase 3 — Next action

Proceed automatically with failing-first tests and compare-before-write suppression for:
1. Listing upserts.
2. Listing projection writes.
3. Listing media summary writes.
4. Batch-media refill writes.
5. Scorer write-on-content-change behavior.
6. Seller signal reconciliation without delete-and-recreate churn.

Phase 3 gate:
- Targeted suppression tests green.
- Full test/build/compliance validation green.
- Phase health and system health green.
- Progress ledger updated with commits and proof.
- PR #544 proof table updated.
- No production activation.

---

## 2026-07-21 — Phase 2 re-validated on corrected `main` + main protection

- **Ethics-contract PR #545 merged to `main`** (merge commit `7b3dbe1d`): the mislabeled `ethics_training_gate` corrected to an administrative RECORD; obsolete auth-gate operational action, write-capable backfill, throwing primitives, and stale docs removed. Post-merge `main` CI green (Release Truth success, Guardrails success); **production deploy `7b3dbe1d` = success**.
- **`main` now protected** by the `Protect main` ruleset (id 19435006, active): require PR + `pr-check` status + up-to-date branch + conversation resolution; block direct push / force-push / branch deletion; no bypass. Verified — a direct push to `main` was rejected (GH013). `release-truth` intentionally NOT required yet (its preview commit-status is ambiguous/pending); an approving review NOT required yet (sole reviewer).
- **PR #544 updated onto corrected `main`** by merging `origin/main` (`7b3dbe1d`) into the media branch — all legitimate remote commits preserved (no force-push, no rebase rewrite). New head **`1dbc74dd`**. Conflict-free (media and ethics files disjoint).
- **Phase 2 gate re-run on `1dbc74dd`:** 299/299 targeted + all media-sync regression suites · type-check 0 · media:system-health red 0 · rls UNKNOWN 0 · ucba 0 regressions · compliance-check 94/0/0 · idx:validate 1 pre-existing critical (Cron Schedule Completeness, unchanged). CI: `pr-check` ✓ · `target-platform-build` ✓ · `guardrails` ✓ · `release-truth` job ✓ · `claude-review` ✓ · Vercel ✓ — code-level blocking failures 0; only the inherent pre-merge deploy-`UNVERIFIED` remains. (`scan` is not cited as proof — not a required check; retired Sentinel-L is not cited.)
- **Real credentialed `ops:health` (production, via `vercel env run`/`env pull`, 2026-07-21):** verdict **critical** (exit 2). Evidence `docs/superpowers/specs/evidence/2026-07-21-ops-health-production.json` (redacted; DATABASE_URL host confirmed canonical `ep-cold-waterfall-adno3ao2` before any query; no secret displayed). Issues: (1) 🔴 media-sync cursor `last_photos_change` **44.6h stale** (>24h) — the chronic boundary-cluster deadlock (incident 2026-05-21 RC1) that the unified pipeline is built to fix, currently flag-OFF/activation-gated, and **not introduced by this PR**; (2) ⚠️ 1 listing NULL `status_changed_at`; (3) ⚠️ 433 PARKED retry-exhausted media rows. §2.05 RLS violations = **0**; listing sync `ok`; storage 520 MB / 5.1% of cap. (The earlier "ops:health unavailable in the sandbox" note is superseded by this credentialed result.)
- **Phase 2 ACCEPTED on head `1dbc74dd`.** The Phase-3 precondition (rebased #544 passes the full Phase 2 gate) is met.
