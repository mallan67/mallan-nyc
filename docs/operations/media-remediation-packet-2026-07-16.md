# Media Remediation Packet — 2026-07-16 (READ-ONLY)

**Status:** READ-ONLY audit + prepared plans. **Nothing has been executed.** No production
SQL, no backfill, no R2 mutation, no Neon/Vercel settings, no cron, no campaign sends.
Scripts + tests + documentation only.

**Base:** post-rollback `main` (#518 reverted #516). The bucket classifier uses the
**corrected** media-ownership signal (canonical `isMallanExclusiveListing`: SL-/RL- id OR
`rls_eligible === false`, **never `agent_id`** — Codex fixes in PR #522).

**Scope reminder:** the shared DB-only render fix (PR #515/#522) is correct and serves every
listing whose media is in Neon/R2 or the legacy `Listing.media` JSON. What remains is a
**media-ingestion/backfill coverage gap** for third-party listings whose media is NOT in the
DB, plus a **card-side live-Cotality fallback** in `/api/listings` that masks it on cards.

---

## 0. Toolchain (executable under Node 20 / tsx)

| Command | Runs |
|---|---|
| `npm run media:audit` | READ-ONLY Neon audit → inventory + buckets (DB-empty → **UNKNOWN**) |
| `npm run media:audit:cotality` | + LIVE read-only Cotality probe → splits **B vs D vs UNKNOWN** |
| `npm run media:backfill:dryrun` | READ-ONLY Bucket-B dry-run planner (no `--apply`) |

Each tool is a testable **logic module** (`*.ts`, injectable deps) plus a thin **`*.cli.ts`**
tsx entry. A smoke test (`tests/runtime/media-remediation-tooling.test.ts`) starts both under
tsx with **mocked** Prisma/Cotality and asserts no Prisma create/update/upsert/delete and no
R2 write is reachable.

## 1. Full per-listing inventory (columns emitted)

`media:audit --json` emits one record per listing (all READ via the repo's CANONICAL helpers):

- `listingId`
- `displayable` (+ derived from the canonical `isListingDisplayable` gate — selects
  `idx_display_yn`, `internet_entire_listing_display_yn`, `status`, `owner_opt_out`,
  `participant_only`; fail-closed + normalized-status semantics)
- `ownership` — `mallan-owned` (SL-/RL- or `rls_eligible===false`) vs `third-party`
- `activeUsablePhotoCount` — ACTIVE relational rows counted with the **production** classifier
  (`resolveListingMediaFromRows` → class `photo`); floorplans/videos are NOT photos
- `allStatusRowCount` + statuses — `_count.listing_media` (existence signal)
- `legacyUsablePhotoCount` — legacy JSON counted with the production classifier (**photos
  only**, not every JSON item)
- `cotality` — tri-state probe: `{confirmed, photoCount}` or `{unknown, reason}`
- `bucket` — `A | B_NEW | B_INACTIVE | C | D | E | F | U`
- (dry-run adds) proposed `inserts` / `restores` / `updates` / `unchanged` + **exact R2 keys**

## 2. Buckets

| Bucket | Meaning | Remediation |
|---|---|---|
| **A** | active relational usable photos | none — correct |
| **B_NEW** | third-party, **no relational rows ever**, Cotality CONFIRMED photos | backfill **inserts** |
| **B_INACTIVE** | third-party, **inactive/deleted rows exist**, Cotality CONFIRMED photos | **restores/updates** (match by media_key + normalized URL) |
| **C** | legacy JSON has usable photos | none — render fix serves it |
| **D** | DB-empty **and Cotality CONFIRMED zero** | none possible |
| **E** | Mallan-owned authoritative deletion | **never backfill** |
| **F** | hidden / withdrawn / non-displayable | excluded |
| **U** | **UNKNOWN** — Cotality probe skipped/errored | cannot classify B vs D yet |

**Tri-state Cotality is mandatory:** a timeout / OAuth error / provider failure / skipped
probe is **UNKNOWN**, never coerced to `count=0`/Bucket D. `media:audit:cotality` **exits
nonzero** if any probe returned UNKNOWN (the audit is incomplete). Only **B_NEW / B_INACTIVE**
are backfill targets.

## 3. Bucket B — scoped dry-run backfill plan

`scripts/backfill/bucket-b-media-dry-run.ts` (READ-ONLY; **no `--apply`**). Re-derives Bucket B
with the SAME classifier guard, so scope cannot drift from the audit. **Guards (by
construction):** third-party only · displayable only · DB-empty only · Cotality **CONFIRMED**
only · per-listing source-URL dedupe (no duplicate media).

**Existing-row split** — the planner reads **all-status rows** (id, status, media_key, source
URL, order) and matches each Cotality photo by `media_key` then normalized source URL:
- **B_NEW** (`allStatusRowCount === 0`): every photo → **INSERT**.
- **B_INACTIVE** (inactive/deleted rows exist): matched inactive row → **RESTORE**; matched
  active row → **UNCHANGED**; unmatched → **INSERT**. It reports exact expected
  inserts / restores / updates / unchanged **per listing** — never duplicate inserts.

**Exact R2 keys:** from the repo's own `buildMediaR2Key(listingId, 'Photo', order)` →
`photos/<listingId>/<order>.jpg` (media-type folder + `.jpg` convention preserved). No guessing.

**Rollback (HONEST):** there is **no `backfill_batch_id` column today**. The plan gives
**per-row reversibility from EXISTING fields**: rollback of INSERTS = soft-delete
(`status='deleted'`) the rows whose recorded `media_key` is in the plan + delete the mirrored
R2 objects by the exact planned key; rollback of RESTORES = revert to the recorded prior
status per `matchedRowId`. A **batch-level** rollback (one id for the whole run) would require
an explicitly reviewed batch-tracking mechanism — **a schema change that is OUT OF SCOPE for
this read-only packet**.

**Projected impact (at execution time — NOT now):** ~1 read-only Cotality GET per Bucket-B
listing; Neon writes = `Σ (inserts + restores)`; R2 PUTs ≈ inserts. Idempotent on `media_key`.
Exact numbers come from the dry-run once the audit is authorized to run.

## 4. `RLS20103891` — UNKNOWN (not Bucket D)

**Do not conclude Bucket D.** `RLS20103891` is **UNKNOWN pending a successful, recorded
Cotality media probe.** The classifier returns `U` for it until a probe succeeds.

- **Contradictory evidence on record:** the original incident reported the **card showing 7
  real photos** for `RLS20103891`; a later production observation found **0 media on both card
  and detail** and the listing **absent from the active card set**. These conflict.
- Because a skipped/errored probe is UNKNOWN (never coerced to 0), the audit will only classify
  it once `media:audit:cotality` returns a **successful** provider response: **confirmed 0 →
  D**, **confirmed > 0 → B_NEW/B_INACTIVE**. Until then it stays **U**.

## 5. `/api/listings` live-Cotality fallback — audit

**Where:** `app/api/listings/route.ts` `photoPromise` **Phase 1** (`fetchListingMedia`,
concurrency 5): for each page listing with 0 media after the DB read, a **live OAuth Cotality
media GET per listing**, proxied via `/api/media/proxy`. Same live-feed pattern PR #511 removed
from the **detail** render but still on the **card** path.

**How often:** on every `/api/listings` request returning any DB-empty listing in the page
window (subject to the route's 5-min response cache). **Affected:** the Bucket B set (and
UNKNOWN/D listings trigger it but return nothing). **Impact:** live Cotality load + proxying
per uncached request — the sole cause of the card/detail divergence.

**Sequenced removal (do NOT remove before coverage is repaired):** (1) run the read-only audit
→ confirm B set; (2) execute the reviewed Bucket-B backfill (separate authorized PR); (3)
re-run audit → B ≈ 0; (4) **then** remove/gate the Phase-1 live-Cotality fetch so the card path
is DB-only. Removing it first would drop card photos.

## 6. Scripts / tests

| Path | Role |
|---|---|
| `lib/media/media-coverage-bucket.ts` | Pure classifier (A/B_NEW/B_INACTIVE/C/D/E/F/U), tri-state |
| `lib/media/__tests__/media-coverage-bucket.test.ts` | Classifier unit tests |
| `scripts/audit/media-coverage-audit.ts` (+`.cli.ts`) | READ-ONLY audit logic + tsx entry |
| `scripts/backfill/bucket-b-media-dry-run.ts` (+`.cli.ts`) | READ-ONLY dry-run planner + tsx entry |
| `tests/runtime/media-remediation-tooling.test.ts` | Smoke + behavioral tests (no writes, tri-state, restores, R2 keys, RLS20103891 UNKNOWN) |

## 7. Approval steps before ANY write

1. **Authorize running the read-only audit** (`media:audit:cotality`) against production Neon
   (`hidden-mountain` / `ep-cold-waterfall` / `main`) — SELECT-only + read-only Cotality GETs —
   for confirmed bucket counts and the Bucket B inventory. An incomplete Cotality run exits
   nonzero and must be re-run to completion.
2. **Review the dry-run plan** (`media:backfill:dryrun`) — exact inserts/restores/updates, R2
   keys, projected volume.
3. **Separate, reviewed backfill PR** implementing the write path (Cotality → R2 →
   `listing_media`), idempotent on `media_key`, with the per-row rollback (and, if batch-level
   rollback is wanted, an explicitly reviewed batch-tracking schema change — separate).
4. **Post-backfill:** re-run the audit; once Bucket B ≈ 0, open the follow-up PR to remove the
   `/api/listings` live-Cotality fallback (§5).

Nothing in steps 1–4 is done here. This packet is read-only preparation.
