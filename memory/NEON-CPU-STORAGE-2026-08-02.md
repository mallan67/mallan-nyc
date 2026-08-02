# Neon CPU + storage remediation — PR #593 (2026-08-02)

Canonical record of what was done, how, and what is deliberately NOT done.
Companion measurement artifact:
`docs/operations/neon-cpu-storage-evidence-2026-08-02.md`.

**Status: draft, unmerged. Production CPU and storage are UNCHANGED until
this merges, deploys, the nightly cleanup runs, and post-deployment
measurement proves the effect.**

---

## 1. What the problem actually was

Independently verified, not inherited from a prior report:

- **Compute is pinned at 0.25 CU.** `autoscaling_limit_min_cu` =
  `max_cu` = 0.25, so billing is `active_time x 0.25`. Query *intensity*
  cannot change the CU size — only **wake time** matters. Verified:
  `active_time_seconds 89,572 x 0.25 = 22,393` vs `cpu_used_sec 22,445`
  (consistent to 0.23%, NOT exact).
- **The compute was continuously active 58 minutes** (`started_at`
  unchanged at 02:30:38 while `last_active` advanced to 03:28:29).
  `started_at` advances on restart, so this is one datum, not two samples.
- **One Cycle wrote 5 audit rows per cycle, 710 measured in a day**
  (`one_cycle_started`, `one_cycle_run`, `idx_sync`, `idx_sync_cron`,
  `media_sync_cron` — 142 each). Those are guaranteed Neon writes whether
  or not anything changed.
- **The listing detail route is the largest read path.** Its own comment
  says so: *"That dynamic render… is what kept Neon ~98% active."*
  `generateStaticParams()` returns `[]`.

## 2. What shipped in #593

### CPU — preflight + heartbeat

A 10-minute Cotality preflight replaces `one-cycle` as the scheduled
entry. On a verified no-change poll it exits **without importing Prisma**
— traced the full static import closure: **14 modules, Prisma not
statically reachable**; the only path is the dynamic `import()` on the
non-skip branch.

Seven fail-open branches (`!redis`, redis error, probe error, no prior
state, `forceRun`, source changed, backlog due) and one skip branch.

**The heartbeat (`2f695234`) closes the real defect.** Fail-open covers
*errors*; it did **not** cover a probe that succeeds and is silently
**wrong**. A persistent false "unchanged" would have skipped Neon forever,
against REBNY UCBA Art. I §6.

- `ONE_CYCLE_HEARTBEAT_INTERVAL_SECONDS = 60 * 60` — a **literal**, no env
  override. The compliance guarantee must not depend on an unreviewed
  Vercel setting.
- New state field **`lastSuccessfulFullCycleAt`**, advanced only on
  `success && complete`. The existing `lastCompletedAt` was unusable: it
  is written unconditionally, including on partial and incomplete
  outcomes, so a partial cycle would have bought another hour of silence.
  **Added, not renamed** — no state version bump, no forced cold start;
  absent on old state parses to `null`, which forces one cycle.
- Forces a run on missing / null / malformed / **future** / expired. A
  future timestamp is treated as *defective*, not "very recent" — clock
  skew or a corrupted write must not buy unlimited silence.

**Why one hour — measured over 7 days / 147 natural quiet runs:**
avg 18.7 min · p95 40 min · longest 120 min (once) · **6 of 147 runs
(4%) reached 60 min** · zero reached 240 min. One hour sits above p95, so
~96% of genuine quiet is undisturbed, with 24x margin under the
regulatory bound. 30 min would fire through normal quiet and erode the
saving; 2 h would gain almost nothing while doubling how long a
false-unchanged defect could persist.

### Storage — two bounded cleanups

- **Diagnostics:** exactly two allowlisted actions
  (`idx_sync_listing_upsert_failure`, `idx_sync_syncstate_failure`),
  >30 days, 2,000/transaction. Census: **46,103 rows / 35 MB / 48% of
  `audit_events`**.
- **Media tombstones:** clears `media_url_original`, `media_url_cached`,
  `r2_key`, `width`, `height` on `status='deleted'` rows >30 days. Row
  retained as an audit record. **Deletes no R2 object.** Census:
  **17,112 rows / 4,440 kB**.

Both share the existing nightly retention wake — no new Neon wake.

### First-production canary (2026-08-02)

Bounded is not the same as small. An unconstrained first run would have
deleted up to 10,000 audit rows and cleared up to 10,000 tombstone
payloads before anyone saw a production result.

`lib/retention/retention-canary.ts` makes the cap **canary-by-default**:
unset env => **100 rows**; `RETENTION_DIAGNOSTIC_MAX_ROWS` /
`RETENTION_TOMBSTONE_MAX_ROWS` **widen** it and are **clamped** to the
reviewed 10,000, so a typo cannot escalate past what compliance approved.
Junk/zero/negative falls back to the canary, never the maximum.

**Rollout:** merge → deploy → one nightly run at 100 → review the
response counters and log line → only then set the env to `10000`.

## 3. Compliance enforcement

The REBNY check was failing because the known freshness driver
(`/api/cron/one-cycle`) disappeared from `vercel.json`. **Simply adding
the preflight to the accepted list would have created exactly the
loophole the check exists to prevent.**

`scripts/ci-compliance-check.js` now accepts the preflight **only when the
whole heartbeat contract is present in source**: static literal bound
<= 3600s, no env override, the decision READS
`lastSuccessfulFullCycleAt`, missing/invalid and future both force a run,
the reason exists, the route dynamically invokes One Cycle, and runtime
tests exercise the bound.

**Adversarially verified — each tamper was BLOCKED:**

| Tamper | Result |
|---|---|
| bound widened to 6 h | FAIL "exceeds the approved 3600s maximum" |
| stop reading the timestamp | FAIL "the decision never READS lastSuccessfulFullCycleAt" |
| drop the future guard | FAIL "a FUTURE heartbeat does not force a cycle" |

## 4. Corrections made along the way

- **My "6.0 audit rows per cycle" was wrong.** It divided *all* audit rows
  by 144. Correct: **5 per fully-represented One Cycle**, 710 measured.
- **My "84,258 diagnostic purge candidates" was wrong** — apples to
  oranges. The allowlist population is **46,103 exactly**.
- **My index classification double-counted** (242 vs 203). Disjoint:
  67 PK + 4 unique constraint + 11 unique index + **121 plain** = 203.
  Only the 121 (32 MB) are candidates, and each still needs individual
  review.
- **My R2 "434 GB" was withdrawn** — a row count multiplied by one sample.
- **My "retention flags absent from production" came from a FAILED
  command** (worktree not Vercel-linked). Re-run from the linked repo the
  conclusion held, but it had been asserted unfoundedly.
- **The repo's own comments misstate the #523 outage.**
  `page.tsx:617` and `public-cache.ts:242` blame "Decimal/Date/BigInt
  serialization". PR #528's body says the cause was an **Upstash
  `no-store` fetch inside an ISR render** flipping the page static→dynamic
  at runtime, and explicitly said the route-handler cache and alias index
  **could be retried separately**. Those comments have been blocking the
  largest CPU fix on a mechanism that never happened.

## 5. Explicitly NOT fixed by #593

This is a partial repair. It does **not** touch:

- **listing-detail first-render reads** — `generateStaticParams()` returns
  `[]`; every distinct URL variant can query Neon on first render
- **the alias long tail** — legacy/ID-only/malformed slugs query Neon just
  to discover they must redirect
- **`/api/listings` live `findMany`** — only the `count()` is wrapped in
  `cachedPublicRead`; the paged query, `raw_data`, legacy media and
  relational media all run live behind a process-local `Map`
- **geocode cadence** — the manifest inherits `SYNC_CADENCE_SECONDS`
  (600s) as its TTL for permanent reference data
- **building-manifest breadth** — shards on the leading street-number
  digit; measured skew **10.4x** (4,286 vs 413), and the predicate is an
  unindexable JSONB path
- **remaining write amplification** — `listings` 1,449,752 updates on
  24,191 rows (~60x each, only 37% HOT), `listing_media` 3,577,137
- **physical storage reclamation** — no vacuum/repack; 121 unused-index
  candidates untouched
- **`media_url_original` freshness (#586)** — the root cause of the
  20,123-row unmirrored backlog and dead photos

## 6. Storage caveat that must not be dropped

**Payload removed is NOT bill reduced.** The diagnostic purge is a DELETE
and the tombstone compaction is an UPDATE; both initially *increase* WAL,
dead tuples, index churn and Neon retained history. ~39 MB of logical
payload becomes reclaimable against a 555 MB database. Physical and
billed storage fall only after autovacuum, page reuse and history aging.
Report logical payload, physical relation size, retained history and
billed storage as **four separate numbers**, measured after the cleanup
settles.

## 7. Post-deployment proof still required

None of this is proven in production yet:

- no-change polls reporting `neon_touched:false`
- `freshness_heartbeat_due` appearing at the expected rate
- fewer Neon active seconds and real suspension intervals
- reduced hourly `compute_unit_seconds`
- diagnostic and tombstone cleanup counts at the 100-row canary
- logical storage stabilisation, then physical/history reduction

## 8. Commit trail

| SHA | What |
|---|---|
| `5da1a705` | re-pointed 4 cron guardrails at the preflight + fixed a suite that required a module it mocks |
| `96536f11` | evidence artifact (reproducible SQL, timestamps, environment) |
| `2f695234` | **heartbeat** + compliance contract enforcement + 12 deterministic tests |
| `fe716f95` | heartbeat calibration (Census D) + exact-head CI record |
| this commit | first-production canary, stale evidence row corrected, rollout documented |
