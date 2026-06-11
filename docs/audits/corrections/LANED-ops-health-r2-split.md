# Correction Trace Record — `Lane-D` ops-health R2 actionable/parked split

> **Status: IN-PR.** RC3 Trace Record §10 deferred follow-up; Maya standing queue item
> (2026-06-11). Plan: `docs/audits/lane-d-ops-health-parked-split-plan-2026-06-10.md`.
> **Observability only — NO schema, NO DB writes (read-only SELECT change), NO media-pipeline
> behavior change, NO cron/env.**

## 0-pre. Mandatory media-PR preamble (incident 2026-05-21 §0.5)
1. **Incident doc read:** 2026-06-11.
2. **Chronic root cause addressed:** **§4 RC6 (observability gap)** — ops-health counted every
   active row with `r2_attempts > 0` as actionable retry backlog; post-RC3 that over-reports
   (44+40=84 tripped the 50-row warn on a healthy system) and, worse, drowns the real signal.
3. **Remaining OPEN:** Corrections 5 (table-aware image metric + ghost logging) and 6 (hard
   ghost-import item) · CI3 · M3 live capture · crm:-upload advisory · fetch.ts classifier
   consolidation · W13 · held migrations · ALL data cleaning · OQ-1.
4. **Cannot reintroduce:** stomping/cursor/purgatory — zero pipeline code touched (`lib/idx/**`
   not in the diff); layer mismatch — read-only metric split, no writes anywhere.
5. **Cleanup gate:** NO JSON/R2/data cleanup until the writer loops are closed.

## 1. Change
- `scripts/r2-retry-health.js` (new, pure CommonJS): `R2_RETRY_EXHAUSTED_THRESHOLD = 8`
  (deliberate duplicate — ops-health.js cannot require the TS module; drift-guarded) +
  `classifyR2RetryBacklog({actionable, parked})`. Actionable keeps the historical 50/500;
  parked gets a FAIL-CLOSED growth guard (warn > 150 / critical ≥ 1000) so mass parking from a
  systemic R2/Trestle failure still surfaces. The untouched 24h mirror-block check remains the
  fast outage signal.
- `scripts/ops-health.js`: query splits actionable (`0 < r2_attempts < 8`) vs parked (`≥ 8`);
  report gains `r2_retry_backlog_actionable` + `r2_retry_parked` (legacy total retained —
  Lane-D report verified zero external consumers parse these fields); issues delegated to the
  pure policy; printer line shows the split; orphaned 50/500 THRESHOLDS keys removed.
- `tests/runtime/r2-retry-health-drift.test.ts` (new): drift guard binding the duplicate to the
  canonical `lib/idx/media-sync` constant + policy boundary cases, incl. the RC3-settlement
  production truth `{44, 40} → zero issues`.

## 2. Pre-registered blast radius
- **WILL touch:** `scripts/ops-health.js` · new `scripts/r2-retry-health.js` · new
  `tests/runtime/r2-retry-health-drift.test.ts` · this Trace Record.
- **MUST NOT touch:** `lib/idx/**` · any writer · schema · cron/env · `public/crm/**`.

## 3. Step log
| # | Step | Result |
|---|---|---|
| 1 | RED | module absent on main → drift test fails to resolve `scripts/r2-retry-health.js` | ✅ RED |
| 2 | fix | pure module + ops-health wiring + printer | ✅ |
| 3 | GREEN | drift+policy **5/5** (incl. `{44,40}→[]` — the false warn provably dies) | ✅ |
| 4 | **B2 LIVE proof (run, not deferred)** | production `ops:health` 2026-06-11T14:22Z renders the split: `actionable=205 · parked=79 · total=284`. The 205-actionable warning is LEGITIMATE (active drain churning retries, newest attempt 14:16Z); parked 79 quiet under the 150 guard. Live behavior exactly per design. | ✅ |
| 5 | harness | (filled at commit) |
| 6 | gates | §4/§5 |

## 4. Gate results
| Gate | Result |
|---|---|
| B2 | RED→GREEN 5/5 + **LIVE proof run** (production split rendered; legitimate-warn semantics confirmed during active drain) |
| C1/C2 micro/macro | PASS (ops/tooling → code-reviewer routed) |
| code-reviewer | **APPROVE, zero findings ≥80** — SQL interpolation safe (module-level integer literal, CLI script, no request surface); actionable/parked partition EXACT (union=total, intersection=∅); boundaries consistent SQL↔policy↔tests↔canonical `buildR2BacklogWhere`; report JSON backward-compatible (additive only); drift guard genuinely binds both sides under the runtime jest config |

## 5. Sign-offs
- **micro/macro PASS · code-reviewer APPROVE** (2026-06-11, `c39973e9`). No §D surface → tristle
  N/A per the macro gate's own routing (internal DB-health telemetry).
- **Codex:** on PR open. · **Maya merge:** standing queue approval; merges on green CI.
- Cosmetic notes from review (sub-80, not blocking): redundant-but-harmless IS NOT NULL guards
  (kept for parity); the type-anchor import in the drift test (conventional underscore).

## 6. Live observations recorded for the program (2026-06-11T14:22Z)
- Cursor `2026-05-27T21:19:53Z` — drain advancing (~12 days of backlog left); coverage 39.7%.
- Parked grew 40 → 79 during the drain (newly-exhausted rows parking as designed) — watch
  against the 150 growth guard as the drain continues.
- Unrelated new warning: neon-branch-prune cron last fired 34.4h ago (daily schedule, expected
  <25h) — transient cron lag to watch; NOT touched here (cron config HELD).
