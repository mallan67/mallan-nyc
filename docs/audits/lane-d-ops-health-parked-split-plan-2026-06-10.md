# Lane D — ops-health R2 retry-backlog actionable/parked split — plan (report-only)

> **Date:** 2026-06-10 · **Status:** PLAN ONLY — no code changed, no commits, no schema, no DB writes.
> **Origin:** RC3 Trace Record §10 deferred follow-up (`docs/audits/corrections/RC3-r2-retry-purgatory.md:107-118`).
> **Production truth (operator-verified 2026-06-10, post-RC3 deploy):** `r2_retry_eligible = 44` ·
> `r2_retry_parked = 40` · `r2_cached_active = 81,751`.

---

## 1. Current ops-health R2 logic (cited, verified in source)

All citations are `scripts/ops-health.js` on main (`0fe39174` working tree).

**Thresholds (lines 108-109):**

```js
r2_attempts_backlog_warn: 50,        // > 50 rows with r2_attempts > 0
r2_attempts_backlog_critical: 500,
```

**Query (lines 566-573)** — one raw SQL aggregate over `listing_media`:

```sql
SELECT
  (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts > 0  AND status = 'active'))::int AS rows_with_attempts,
  (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts >= 3 AND status = 'active'))::int AS rows_at_or_above_threshold,
  MIN(r2_last_attempt_at) FILTER (WHERE ... r2_attempts > 0 AND status = 'active') AS oldest_last_attempt,
  MAX(r2_last_attempt_at) FILTER (WHERE ... r2_attempts > 0 AND status = 'active') AS newest_last_attempt
FROM listing_media
```

**Report fields (lines 574-577):** `media_sync.r2_retry_backlog` (= `rows_with_attempts`),
`media_sync.r2_above_tombstone_threshold` (= rows ≥ 3), `r2_retry_backlog_oldest`, `r2_retry_backlog_newest`.

**Alerting (lines 578-590):**
- `rows_with_attempts >= 500` → **critical** issue, category `media-sync`.
- `rows_with_attempts > 50` → **warning** issue. (Note the operator asymmetry: critical uses `>=`, warn uses `>` — preserve in the new code.)

**Human output (line 787, under `── MEDIA SYNC ──`):**

```
R2 retry backlog: <N> rows w/ r2_attempts>0 (<M> ≥ 3-strike threshold) · oldest=<ts> newest=<ts>
```

**Verdict / exit (lines 683-685, 705):** any critical issue → verdict `critical`, exit 2; any warning →
`warning`, exit 1; else `healthy`, exit 0 (3 on unhandled error, line 833). Sentinel file
`.ops-health-last` (lines 691-698) records `{verdict, at}` only.

**Adjacent (separate) R2 check (lines 538-563):** the 24h mirror-progress block — **critical** when
`firings > 0 && mirrored == 0 && failed > 0` ("Phase 3 retry purgatory (RC3)"), **warning** when
`failed > 5 × max(mirrored, 1)`. This is the *fast* systemic-outage detector and is untouched by this plan.

**The over-report, concretely:** the metric has **no knowledge of the RC3 ≥ 8 parking threshold**.
Today's truth is 44 actionable + 40 parked = **84 rows with attempts > 0**, which exceeds the warn
threshold of 50 → ops-health currently raises a `media-sync` **warning** (exit 1) that is ~half driven
by rows RC3 *deliberately* stopped retrying. The metric also ignores whether the row still *needs* an R2
copy (no `r2_key IS NULL OR media_url_cached IS NULL` predicate), unlike the actual backlog SELECT.

---

## 2. Parking predicate (cited, verified in source)

`lib/idx/media-sync.ts`:

- **Line 839:** `export const R2_RETRY_EXHAUSTED_THRESHOLD = 8;` (doc comment lines 824-838: parked ≈
  after `8 × 6h` cooldowns ≈ 2 days; deliberately ABOVE the 404/410 tombstone threshold of 3).
- **Lines 851-880:** `export function buildR2BacklogWhere(cooldownThreshold, attemptedIds)` —
  a Phase-3 row is **eligible** iff ALL of:
  1. `status = 'active'`
  2. `media_url_original IS NOT NULL`
  3. `r2_key IS NULL OR media_url_cached IS NULL` (still missing its R2 copy)
  4. not attempted this invocation (`id NOT IN attemptedIds`, invocation-local)
  5. past the 6h cooldown (`r2_last_attempt_at IS NULL OR < cooldownThreshold`, time-local)
  6. **not retry-exhausted:** `r2_attempts IS NULL OR r2_attempts < R2_RETRY_EXHAUSTED_THRESHOLD` (lines 872-877)

So the **parking predicate** = clauses 1-3 true AND `r2_attempts >= 8`. Clauses 4-5 are
invocation/time-local scheduling details, NOT part of "is this row backlog" — a row inside its 6h
cooldown is still actionable backlog for accounting purposes. The ops-health split must mirror
clauses 1-3 + 6 exactly and ignore 4-5. (Per the lib comment, any active row at ≥ 8 is non-permanent
by construction — permanent 404/410 rows were tombstoned at 3 and are no longer `active`.)

Wired at the Phase-3 `listingMedia.findMany` (`lib/idx/media-sync.ts:1748-1755`). Permanent-4xx
tombstone logic (`emitFailure`) unchanged by RC3 and unchanged here.

### 2a. Single source of truth — can ops-health import the constant?

**No, not directly.** `scripts/ops-health.js` is plain CommonJS run via bare `node`
(`package.json:72-73` — `node --env-file-if-exists=... scripts/ops-health.js`). `lib/idx/media-sync.ts`
is TypeScript with ESM imports and a heavy module graph (Prisma types, R2 client surface) — `require()`
from a plain Node script would fail without a TS loader, and adding `tsx`/`ts-node` to the ops-health
invocation is scope creep with runtime-dependency risk in a health probe.

**Resolution — duplicate + drift-guard test (the repo already has the exact precedent):**
`scripts/branch-prune-health.js` is a pure CommonJS module required by ops-health
(`scripts/ops-health.js:69`) and unit-tested from Jest via `require('@/scripts/branch-prune-health')`
(`tests/runtime/branch-prune-health.test.ts:12`). Jest *can* import the TS lib — proven at
`lib/idx/__tests__/media-sync-rc3.test.ts:15`
(`import { buildR2BacklogWhere, R2_RETRY_EXHAUSTED_THRESHOLD } from '@/lib/idx/media-sync'`).
Therefore a single Jest test can load **both** the lib constant and the scripts-side constant and
assert strict equality — a red test the moment they ever diverge.

Alternative considered and rejected: hoist the constant into a shared plain-JS module imported by
`media-sync.ts`. Rejected — it edits `lib/idx/media-sync.ts` (re-opens the 181-test media suite +
tristle radius) for zero behavioral gain; the drift-guard test gives equivalent protection with the
lib untouched.

---

## 3. Consumers of the metric (enumerated)

Repo-wide grep for `r2_retry_backlog` / `r2_above_tombstone_threshold` / `r2_attempts_backlog`:
matches ONLY `scripts/ops-health.js` itself and the RC3 trace record prose. **No automated consumer
parses these fields.** Full consumer map of ops-health output:

| Consumer | What it reads | Split/rename risk |
|---|---|---|
| Human operator (Maya) — `npm run ops:health` | the `── MEDIA SYNC ──` printed lines + verdict | None — printed line gets clearer |
| `npm run ops:health:json` | full JSON | No in-repo parser of `media_sync.r2_*` found; the script's own back-compat policy (lines 79-85) says keep field names stable for "any downstream parser" — so **keep `r2_retry_backlog` as the total**, add new fields, remove nothing |
| Exit code / verdict | 0/1/2 | Behavior change is the POINT: current false warning (84 > 50) becomes healthy. Documented in trace record, not silent |
| `.ops-health-last` sentinel → `scripts/neon-precommit-guard.js:31` | `{verdict, at}` only | None |
| `.github/workflows/repo-audit-bot.yml:406` | allowed to run `npm run ops:health`; AI auditor reads textual output | None — improved text helps it |
| `scripts/ci/gate-lib.js:14` | names `ops-health` as a cron-domain gate (string only) | None |
| CLAUDE.md §B baseline / NEON.md / `docs/operations/proof-first-guardrails.md` | "run ops:health" instructions | None |
| Sentinel (the monitoring agent) | no Sentinel artifact greps ops-health JSON fields (Sentinel work is itself Maya-HELD) | None today; the trace-record note future-proofs |

Conclusion: renaming is *safe* today, but the conservative move (aligned with the file's own stated
policy) is **additive fields, no removals, no redefinitions** — `r2_retry_backlog` keeps meaning
"total active rows with attempts > 0".

---

## 4. Proposed split design (no-schema interim)

### 4.1 Metric names

Align with the names already canonicalized in the RC3 trace record / operator SQL
(`r2_retry_eligible` / `r2_retry_parked`):

| JSON field (`media_sync.*`) | Meaning | New? |
|---|---|---|
| `r2_retry_backlog` | total active rows `r2_attempts > 0` (legacy semantics, unchanged) | existing |
| `r2_retry_backlog_actionable` | active + missing-R2-copy + `0 < r2_attempts < 8` — what Phase 3 will actually retry | **new** |
| `r2_retry_parked` | active + missing-R2-copy + `r2_attempts >= 8` — intentionally not retried, still displayable via proxy | **new** |
| `r2_retry_parked_newest` | `MAX(r2_last_attempt_at)` among parked — "is parking recent?" | **new** |
| `r2_above_tombstone_threshold`, `r2_retry_backlog_oldest/newest` | unchanged | existing |

### 4.2 Exact SQL (extends the existing single aggregate, lines 566-573)

`EXH` below is the scripts-side constant `R2_RETRY_EXHAUSTED_THRESHOLD` (= 8), interpolated as a
number from the new `scripts/r2-retry-health.js` module — never a hard-coded literal at the call site.

```sql
SELECT
  -- legacy total (semantics unchanged)
  (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts > 0 AND status = 'active'))::int AS rows_with_attempts,
  -- NEW: actionable — mirrors buildR2BacklogWhere static clauses 1-3 + 6 (cooldown ignored: in-cooldown rows are still backlog)
  (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts > 0 AND r2_attempts < ${EXH}
                      AND status = 'active'
                      AND media_url_original IS NOT NULL
                      AND (r2_key IS NULL OR media_url_cached IS NULL)))::int AS rows_actionable,
  -- NEW: parked — the exact RC3 parking predicate
  (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts >= ${EXH}
                      AND status = 'active'
                      AND media_url_original IS NOT NULL
                      AND (r2_key IS NULL OR media_url_cached IS NULL)))::int AS rows_parked,
  (COUNT(*) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts >= 3 AND status = 'active'))::int AS rows_at_or_above_threshold,
  MIN(r2_last_attempt_at) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts > 0 AND status = 'active') AS oldest_last_attempt,
  MAX(r2_last_attempt_at) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts > 0 AND status = 'active') AS newest_last_attempt,
  MAX(r2_last_attempt_at) FILTER (WHERE r2_attempts IS NOT NULL AND r2_attempts >= ${EXH}
                      AND status = 'active'
                      AND media_url_original IS NOT NULL
                      AND (r2_key IS NULL OR media_url_cached IS NULL)) AS parked_newest_attempt
FROM listing_media
```

Read-only, single table scan, same shape as today — no new query round-trip, no DB writes.

Note: `rows_actionable + rows_parked` may be `< rows_with_attempts` — the residue is active rows with
attempt residue that have since been mirrored or lack `media_url_original`. Keeping the legacy total
visible makes that residue observable instead of silently dropped (silent-failure-hunter point).

### 4.3 Thresholds and alert semantics

| Check | Level | Proposed value | Rationale vs production truth (44 / 40) |
|---|---|---|---|
| `rows_actionable >= r2_actionable_backlog_critical` | **critical** | 500 (carry over) | unchanged severity ceiling; queue of 500 genuinely-retryable rows = mirror pipeline is drowning |
| `rows_actionable > r2_actionable_backlog_warn` | warning | 50 (carry over) | current 44 sits just under → post-fix verdict on today's data = **healthy** (correct post-RC3 reading); a regression to RC1-era backlog re-trips it quickly |
| `rows_parked >= r2_parked_critical` | **critical** | 1000 | mass parking at this scale = systemic, sustained R2/Trestle failure being silently absorbed — must page |
| `rows_parked > r2_parked_warn` | warning (**parked-growth guard**) | 150 (~4× today's 40) | parking is *expected* in small numbers; ~4× baseline means a new poison cohort is forming |
| parked info line | info (always printed, never alarms below warn) | — | keeps the 40 visible without exit-code noise |

Operator note for the warn/critical values: they are proposals calibrated to the 2026-06-10 baseline;
Maya confirms or adjusts at PR review (threshold numbers are an operator decision, like all
`THRESHOLDS` entries).

**Fail-closed analysis of the parked-growth guard:** rows reach parked only after 8 failures × 6h
cooldowns ≈ 2 days, so parked-count growth is an inherently **lagged** signal. The *fast* detector for
a live systemic R2 outage remains the untouched 24h block at lines 551-563 (`0 mirrored + N failed →
critical "retry purgatory"`, failure-ratio > 5 → warning). The parked guard is the slow-burn backstop
that catches "the outage ended but it stranded a cohort" — which is exactly the case the fast detector
goes quiet on. Both must exist; neither replaces the other.

### 4.4 Human output (replaces line 787)

```
R2 retry backlog: actionable=<A> (drives warn>50/crit>=500) · parked=<P> (retry-exhausted >= 8 attempts; still displayable via proxy; warn><Pwarn>) · total w/ attempts=<T> (<M> >= 3-strike) · oldest=<ts> newest=<ts> · parked_newest=<ts>
```

### 4.5 Issue derivation extracted to a pure module (testability)

New `scripts/r2-retry-health.js` (CommonJS, pure, no Prisma), mirroring the
`scripts/branch-prune-health.js` precedent:

```js
const R2_RETRY_EXHAUSTED_THRESHOLD = 8; // MUST equal lib/idx/media-sync.ts — drift-guard test enforces
function deriveR2RetryIssues({ thresholds, actionable, parked }) { /* returns issues[] per §4.3 */ }
module.exports = { R2_RETRY_EXHAUSTED_THRESHOLD, deriveR2RetryIssues };
```

`ops-health.js` requires it, interpolates the constant into the SQL, and replaces the inline
issue block (current lines 578-590) with `report.issues.push(...deriveR2RetryIssues(...))`.

---

## 5. Schema option assessment — `r2_exhausted_at` (DEFERRED, Maya-gated)

**What it adds beyond the derived split:**
1. **Why/when audit trail** — `emitFailure` would stamp the timestamp (and implicitly the cause: the
   error class of the 8th failure) at the moment of parking. The derived split can only say "currently
   ≥ 8", not "parked on <date> after <error>".
2. **Correctness across threshold changes** — the derived split retroactively reclassifies history: if
   `R2_RETRY_EXHAUSTED_THRESHOLD` ever moved (8 → 5 or 8 → 12), rows parked under the old rule would be
   miscounted by the new predicate. A stamped column is invariant to that.
3. **Enables the re-arm tier cleanly** — re-arm = "clear/age-out `r2_exhausted_at` after a long
   cooldown", trivially expressible; without the column, re-arm needs an `r2_last_attempt_at`-based
   long-tier hack (RC3 §10 second bullet).

**Migration shape:** additive nullable `TIMESTAMPTZ` column on `listing_media`, no default, no
backfill, no index initially (40 rows; a partial index `WHERE r2_exhausted_at IS NOT NULL` can come
later if needed) — the NEON.md-conformant additive shape. Plus an `emitFailure` write-path change
(one `UPDATE` field) and a `buildR2BacklogWhere` clause swap (`r2_exhausted_at IS NULL` replacing the
attempts comparison). That is a **schema migration + DB write-path change → Maya-gated twice over**
(CLAUDE.md §A.7 schema hold; NEON.md pre-read mandatory).

**Why it can wait:** the parked population is 40 rows; the threshold is a stable exported constant
with a drift-guard binding; the parking predicate is purely attempts-based today, so the derived
split is *exact*, not approximate. The column buys auditability and future-proofing, not correctness,
under current conditions.

---

## 6. Recommended correction scope + test strategy

**Scope (one contained PR, ops-observability only):**
1. New `scripts/r2-retry-health.js` — constant + pure `deriveR2RetryIssues` (§4.5).
2. `scripts/ops-health.js` — extend the SQL aggregate (§4.2), add 4 THRESHOLDS entries
   (`r2_actionable_backlog_warn/critical`, `r2_parked_warn/critical`; retire none — keep the legacy
   names commented as superseded or alias them), swap the inline issue block for the derive call,
   update the print line (§4.4), update the header comment (line 11).
3. New `tests/runtime/r2-retry-health.test.ts` — RED→GREEN + drift guard.
4. Trace-record update (RC3 §10 → settled-by pointer) — documentation, with the explicit note that the
   total-count alert was *replaced* by the actionable/parked pair (not silently dropped).

**Touches NOTHING in:** `lib/idx/**`, prisma, cron config, `.github/workflows`, CRM/frontend.
Read-only DB access only.

**Test strategy (RED→GREEN, §F proof-first):**
- **RED first** — `tests/runtime/r2-retry-health.test.ts` written before the module exists
  (mirrors RC3's own "function absent" RED). Cases:
  1. Production truth pinned: `{actionable: 44, parked: 40}` → **zero issues** (the over-report fix,
     red today by construction since the module is absent; conceptually red against old logic since
     84 > 50 warned).
  2. `actionable = 51` → exactly one warning, message names *actionable*.
  3. `actionable = 500` → critical (`>=` operator preserved).
  4. `parked = 151` → parked-growth warning; `parked = 1000` → critical (the fail-closed guard can
     actually fire — no dead branch).
  5. Boundary cases: `actionable = 50` → no warn (`>` semantics); `parked = 150` → no warn.
  6. **Drift guard:** `import { R2_RETRY_EXHAUSTED_THRESHOLD } from '@/lib/idx/media-sync'` strict-equals
     `require('@/scripts/r2-retry-health').R2_RETRY_EXHAUSTED_THRESHOLD`. Goes red the instant either
     side changes alone.
- **GREEN** — implement module + wiring; full harness (`type-check`, `test:runtime`, the §G chain as
  applicable).
- **Runtime proof (§F)** — one read-only `npm run ops:health` against production after merge,
  capturing the new MEDIA SYNC line showing `actionable≈44 · parked≈40` and verdict no longer warned
  by parked rows. (Matches RC3's own post-deploy SQL-split verification style.)

**Gates:** gate:micro (declared radius = the 4 files above, committed-diff match) · gate:macro
(domain = scripts/ops — `gate-lib.js` cron-domain rules don't trigger since no `app/api/cron/**`
touched; tristle N/A on the same rationale as RC3 §7 but narrower: zero display/distribution/status
surface — observability only; rebny-compliance skill still runs pre-commit per project rule) ·
**silent-failure-hunter angle:** (a) every new warn/critical branch proven fireable by a test, (b)
legacy total kept visible so reclassification can't hide rows, (c) the actionable+parked-vs-total
residue is observable, (d) note (pre-existing, unchanged): a probe SQL error lands in the catch at
line 591-603 as only a *warning* — flagged for awareness, not changed in this PR.

**Stays deferred:** `r2_exhausted_at` column (§5) · re-arm long-cooldown tier (RC3 §10) · any
`THRESHOLDS` JSON-field renames (back-compat policy, lines 79-85).

## 7. Maya-gated items

| Item | Gate |
|---|---|
| Proceeding with the interim PR at all (touches nothing HELD, but per standing practice corrections get explicit GO) | Maya GO |
| Threshold values (actionable 50/500 carry-over; parked 150/1000 proposals) | Maya confirms at review |
| `r2_exhausted_at` schema migration (+ `emitFailure` write path) | Maya-gated schema hold (CLAUDE.md §A.7, NEON.md pre-read) — DEFERRED |
| Re-arm tier (needs column or last-attempt long tier) | DEFERRED, separate design |
