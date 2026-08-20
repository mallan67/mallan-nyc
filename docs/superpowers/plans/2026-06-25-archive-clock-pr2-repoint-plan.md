# Archive Clock PR-2 — repoint archive eligibility to `terminal_since` (GATED PLAN ONLY)

**Date:** 2026-06-25
**Author:** Claude (for Maya approval)
**Status:** PLAN ONLY — no code, no `--execute`, no archive drain, no flag flip. Each downstream step is separately gated below.
**Predecessor:** Archive Clock PR-1 (#446, merged `dbc13c3b`) — added the stable `listings.terminal_since` clock + wired every terminal writer + a dry-run backfill. Production column/index applied + migration resolved.
**Compliance surface:** data-retention / §2.05 terminal removal / NY SHIELD §899-bb / NY DOS recordkeeping (CORRECTED 2026-08-20: this line read “NY DOS 6-year recordkeeping”; 19 NYCRR 175.23 is three years, and it enumerates Article 12-A transaction records — it does not reach a mirrored third-party MLS row, or any photo bytes. Evidence: `.cache/closure3/r2-final/legal/19-NYCRR-175.23-VERBATIM.md`. Operative schedule: `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` §14 Fail-closed row.). Per `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` §5 (status/§2.05) + §14 (SHIELD retention) + §15 (audit retention). This PR does **not** change any §2.05 24-hour removal, SHIELD encryption, or archive-table behavior (previously written “DOS 6-year archive-table behavior”) — it only changes *which age clock* decides T+180 archive eligibility.

---

## 1. Objective

Replace the **contaminated** archive-eligibility clock with the stable `terminal_since` clock in the T+180d archive stage of `app/api/cron/data-retention/route.ts`, so the future archive drain ages rows from the *real* terminal date — never re-stamped by idx-sync.

**Why the current clock is wrong** (`app/api/cron/data-retention/route.ts:163-191`):
- Default predicate: `status_changed_at < cutoff`. NULL `status_changed_at` makes `NULL < ts → NULL` (not true), so bulk-synced terminal rows are invisible forever (only ~34 of ~91k ever archived — `scope-archive-eligibility-bug-2026-06-15.md`).
- The 2026-06-16 mitigation (`ARCHIVE_T180_BACKLOG_ENABLED`) broadens to `COALESCE(status_changed_at, modification_timestamp) < cutoff` **only when the flag is on**. But **both** `status_changed_at` and `modification_timestamp` are re-stamped by idx-sync (PR-1 diagnosis: 99.1% within 1 day of each other), so even the broadened predicate ages from a moving clock — a terminal row re-touched by a price/photo re-emit looks "recent" and never ages.
- `terminal_since` (PR-1) is set **once** on the non-terminal→terminal transition from the stable sale/off-market date and is **never** re-stamped. It is the correct archive clock.

## 2. Non-goals (explicitly OUT of PR-2)

- **No backfill `--execute`** — populating `terminal_since` on the existing backlog is a **separate gate** (§5 Gate 3).
- **No archive drain / no flag flip** — enabling the drain is a **separate gate** (§5 Gate 5).
- **No change to the T+24h §2.05 IDX-removal stage (step 3)** or the **T+30d media-null stage (step 3b)** — they use `status_changed_at` too, but the user scoped PR-2 to *archive eligibility*. Their clock accuracy is noted as a follow-up decision in §4, not changed here.
- No `raw_data` strip beyond what the existing archive UPDATE already does, no reclaim, no downgrade, no Vercel/env change, no S1 rollback-branch action.

---

## 3. The PR-2 code change (for a LATER gated build — not now)

### 3.1 Repoint the eligibility predicate (the one substantive change)
In `app/api/cron/data-retention/route.ts`, the T+180 `eligibilityWhere` (lines 177-185) becomes, **keeping the flag as the gate so merge drains nothing**:

```
// flag OFF (default): UNCHANGED narrow legacy predicate → merging PR-2 archives nothing new
//   { status_changed_at: { lt: cutoff } }
// flag ON: stable clock
//   { terminal_since: { lt: cutoff } }
```

- Default-off branch stays byte-for-byte the legacy `status_changed_at < cutoff`, so **merging PR-2 changes nightly behavior by zero rows** (same guarantee the 2026-06-16 change made).
- The flag-on branch switches from the `COALESCE(status_changed_at, modification_timestamp)` OR-clause to the single `terminal_since < cutoff`.
- The `status IN (TERMINAL_STATUSES)` + `sync_status != 'archived'` filters and the `T180_BATCH_CAP = 500/run` are **unchanged**.

**Merge-safety property (corrected per Gate-14 decision, 2026-06-25):** merge safety comes from the flag being **OFF by default** — flag-OFF uses the legacy `status_changed_at < cutoff` predicate whose current eligible count is **0**, so merging PR-2 drains nothing. This does **not** rely on the flag-ON count being zero: PR-1's live writers organically seed `terminal_since` on new terminal transitions, so the flag-ON `terminal_since < cutoff` count can be a **small nonzero** before the historical Gate-3 backfill (do not assume zero — measure it). The always-true fail-safe: rows with `terminal_since IS NULL` never auto-archive. The Gate-3 backfill is what makes the *historical* backlog eligible.

### 3.2 Align the `ops:health` backlog metric to the same clock
`ops:health:json` asserts `archive_backlog = 0` and `listings_missing_status_changed = 0` (COMPLIANCE-CANONICAL-INDEX §14; `tests/runtime/ops-health-archive-backlog.test.ts`). If PR-2 repoints the cron clock but `ops:health` keeps measuring backlog off `status_changed_at`, the two disagree. **PR-2 must move the `archive_backlog` computation to `terminal_since < cutoff AND terminal AND not archived`** (mirroring the new cron predicate) so health and cron stay coherent. Decision needed (§4-Q3) on whether to keep the legacy `listings_missing_status_changed` gauge or replace it with `listings_terminal_missing_terminal_since`.

### 3.3 Tests to update / add (same PR)
- `tests/runtime/archive-terminal-since-clock.test.ts` — PR-1's scope-guard currently asserts `data-retention/route.ts` does **NOT** contain `terminal_since` (lines ~106-112). PR-2 **flips** that to assert the flag-on predicate uses `terminal_since`, and that the flag-**off** default is still the legacy predicate (drains-nothing guard).
- `tests/runtime/data-retention-archive-eligibility.test.ts` — update the flag-on expectation to `terminal_since < cutoff`; keep a test proving flag-off = legacy.
- `tests/runtime/ops-health-archive-backlog.test.ts` — update to the `terminal_since`-based backlog metric.
- New: a test proving flag-on with all-NULL `terminal_since` yields **0** eligible (the fail-safe in §3.1).

### 3.4 Runbook
Update `docs/operations/archive-flag-runbook-2026-06-17.md` to document the new clock + the staged sequence in §5.

---

## 4. Decision points for Maya (resolve before the build gate)

- **Q1 — Flag semantics.** Keep the existing `ARCHIVE_T180_BACKLOG_ENABLED` flag as the on/off gate for the new predicate (recommended — preserves the "merge drains nothing" property and the existing runbook), or introduce a new flag name? *Recommendation: reuse the existing flag.*
- **Q2 — No-stable-date residual.** Terminal rows for which `deriveTerminalSince` returns null (no CloseDate/OffMarketDate/ExpirationDate) stay `terminal_since = NULL` after backfill → **never** auto-archive under the new predicate. This is conservative/fail-safe for recordkeeping (we keep the full row) — CORRECTED 2026-08-20: this read “conservative/fail-safe for DOS 6-year recordkeeping”; 19 NYCRR 175.23 is three years, and it enumerates Article 12-A transaction records — it does not reach a mirrored third-party MLS row. Keeping the row is still the right default, on FK-integrity and comps grounds rather than a DOS floor. Evidence: `.cache/closure3/r2-final/legal/19-NYCRR-175.23-VERBATIM.md`. Accept as-is, or schedule a later, separately-gated second pass with a conservative floor (e.g. `created_at` or a wall-clock)? *Recommendation: accept as-is for PR-2; decide the residual later with its own dry-run.*
- **Q3 — ops:health gauges.** Replace `listings_missing_status_changed` with `listings_terminal_missing_terminal_since`, or keep both during a transition window? *Recommendation: add the new gauge, keep the old one one release for comparison, then drop.*
- **Q4 — Steps 3 / 3b clock.** Leave the T+24h §2.05 and T+30d media-null stages on `status_changed_at` (out of scope), or file a follow-up to evaluate them? *Recommendation: follow-up only; §2.05 is also enforced in real time by the mapper + read-path filter, so its clock contamination is lower-risk.*

---

## 5. Staged gate sequence (each step needs its own explicit approval)

| Gate | Action | Type | Drains anything? | Approval |
|---|---|---|---|---|
| **0** | **This plan** | report-only | no | ← you are here |
| **1** | Build PR-2 (predicate repoint + ops:health align + tests + runbook). Open PR, watch, merge. | code | **No** — flag default-off keeps legacy behavior | separate "build PR-2" + "merge PR-2" |
| **2** | Backfill **dry-run** proof (read-only; the PR-1 script's default mode) + the §6 read-only predicate counts | read-only | no | can run under this plan's proof step (no writes) |
| **3** | Backfill **`--execute`** — populate `terminal_since` on the backlog | write (clock column only; **no archive**) | no archive; only sets the clock | separate explicit approval |
| **4** | Archive **dry-run** proof — count rows the flag-on predicate *would* archive after backfill | read-only | no | runs before Gate 5 |
| **5** | Flip `ARCHIVE_T180_BACKLOG_ENABLED=true` → nightly cron drains in 500/run batches | env + drain | **YES** — the actual archive | separate explicit approval, monitored |

**The user's directive is encoded here:** repoint + dry-run proof come first (Gates 1-2/4); **backfill execution (Gate 3) and archive execution (Gate 5) are each separately approved** and cannot be reached by this plan alone.

---

## 6. Dry-run proof design (read-only — no writes)

Run host-guarded to cold-waterfall (`ep-cold-waterfall-adno3ao2`). Three read-only measurements, reported before any write gate:

1. **Backlog the new predicate would reach once backfilled** (the PR-1 backfill dry-run already computes this as `over180`): terminal + not archived + (derivable stable date) `< 180d cutoff`.
2. **Direct predicate count (post-backfill simulation):** because live `terminal_since` is still NULL, simulate with the same derivation SQL the backfill uses, e.g. count rows where `status ∈ TERMINAL`, `sync_status != 'archived'`, and the derived stable date `< now-180d`.
3. **Residual (no-stable-date) count** (`noDate`): terminal + not archived with no derivable date → will stay NULL → never auto-archive (Q2).

Report all three + the current `status_changed_at`-based count, so the delta (how many *more* rows the stable clock exposes, and how many are *correctly excluded* because their `status_changed_at` was re-stamped recently) is explicit before Gate 3/5.

---

## 7. Compliance & safety

- **§2.05 (24h terminal removal):** unaffected — that's step 3, not repointed; also enforced in real time by the mapper terminal guard + `filterDisplayableDbListings`.
- **NY SHIELD §899-bb / NY DOS recordkeeping** (CORRECTED 2026-08-20: this bullet read “NY DOS 6-year”; 19 NYCRR 175.23 is three years, and it enumerates Article 12-A transaction records — it does not reach a mirrored third-party MLS row, or any photo bytes. Evidence: `.cache/closure3/r2-final/legal/19-NYCRR-175.23-VERBATIM.md`. Operative schedule: `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` §14 Fail-closed row.)**:** the archive *target* (`listings_archive` summary + strip + `sync_status='archived'`, keeps the row for FK integrity) is unchanged; PR-2 only makes aging *more accurate*. Conservative residual handling (Q2) means we never archive a row whose terminal age is unknown.
- **Fail-safe:** flag default-off (no drain on merge) + all-NULL `terminal_since` ⇒ 0 eligible until an explicit backfill (Gate 3) AND an explicit flag flip (Gate 5).
- **Validation before each merge:** `npm run type-check`, `npm run rls:validate`, `npm run compliance-check`, `npm run ucba:audit` (REGRESSIONS=0), `npm run idx:validate`, `npm run ops:health` (after the metric move), full jest. CI parity via `pr-check.yml`.

## 8. Hard limits (carried through every gate)
No archive predicate repoint executed by this plan (PR-2 build is a separate gate) · no `ARCHIVE_T180_BACKLOG_ENABLED` flip · no backfill `--execute` · no archive drain · no `raw_data` strip · no reclaim · no downgrade · no Vercel/env change · S1 rollback branches (`br-holy-forest-adxoogq9`, `br-mute-flower-adurq0o7`) untouched · never `prisma migrate deploy` on production · no force-push / no published-commit amend / no `--no-verify`.

---

## 9. Recommended next action
Approve this plan (and answer Q1-Q4), then authorize **Gate 1 — build PR-2** (code + dry-run proof + tests, open PR, stop for review). Backfill execution (Gate 3) and archive drain (Gate 5) remain separately gated and will each get their own dry-run proof + explicit approval request.
