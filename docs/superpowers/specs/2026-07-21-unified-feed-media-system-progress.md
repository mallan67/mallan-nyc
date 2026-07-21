# Unified Feed / Media System Progress Ledger

**Repository:** `mallan67/mallan-nyc`  
**Branch:** `agent/unified-feed-media-system`  
**Draft PR:** #544  
**Base:** `main` @ `51b831dd621510243da5a4c9c70b6c9962b03d95`  
**Phase 2 accepted head:** `124e617be01b24052a4ac66249b2cafdc5410b04`  
**Production activation:** NONE

## Current status

- Phase 0: COMPLETE — direct authenticated Cotality contract evidence captured and sanitized.
- Phase 1: COMPLETE — media identity spine, strict classifier, hero resolver, prepared migration, and system-health scaffold.
- Phase 2: ACCEPTED — lossless/fail-closed sync primitives and flag-gated unified media pipeline implemented, pushed, tested, and CI-green.
- Phase 3: NEXT — compare-before-write suppression across listing/projection/media-summary/batch-media, then scorer write-on-change and seller-signal reconciliation.

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

**Status:** ACCEPTED at `124e617b`

| Task | Files | Commit(s) |
|---|---|---|
| Task 7 — Property cursor | `lib/sync/property-cursor.ts`, `tests/runtime/property-cursor.test.ts` | `a7c0f1a5`, `96c75d82`, `25bcda35` |
| Task 8 — Fail-closed gallery reconcile | `lib/sync/gallery-reconcile.ts`, `tests/runtime/gallery-reconcile.test.ts` | `1a71f09f` |
| Task 9 — Advisory-lock coordinator | `lib/sync/coordinator.ts`, `tests/runtime/coordinator.test.ts` | `5a5d8a55`, `2cacbac7` |
| Task 10 — Unified media reconcile + live path wiring | `lib/idx/unified-media-reconcile.ts`, `lib/idx/media-sync.ts`, `tests/runtime/media-sync-unified.test.ts` | `55c34396`, `a270a9d0` |
| CI migration-discipline wording correction | migration evidence/comment wording only | `124e617b` |

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

PR #544 at `124e617b`:
- PR checks: SUCCESS
- Target Platform Build: SUCCESS
- Guardrails (Repo + Compliance): SUCCESS
- Release Truth: SUCCESS
- Sentinel-L: SUCCESS
- Claude Code Review: SUCCESS
- Vercel preview: SUCCESS

The pre-existing `ethics_training_gate` gap on main is outside this PR's media/sync scope and was not modified.

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
- **Phase 2 gate re-run on `1dbc74dd`:** 299/299 targeted + all media-sync regression suites · type-check 0 · media:system-health red 0 · rls UNKNOWN 0 · ucba 0 regressions · compliance-check 94/0/0 · idx:validate 1 pre-existing critical (Cron Schedule Completeness, unchanged). CI: `pr-check` ✓ · `target-platform-build` ✓ · `guardrails` ✓ · `release-truth` job ✓ · `scan` ✓ · `claude-review` ✓ · Vercel ✓ — code-level blocking failures 0; only the inherent pre-merge deploy-`UNVERIFIED` remains. (`ops:health` DB-drift check needs `DATABASE_URL`, unavailable in the sandbox; PR is flag-OFF with no DB-behavior change.)
- **Phase 2 ACCEPTED on head `1dbc74dd`.** The Phase-3 precondition (rebased #544 passes the full Phase 2 gate) is met.
