# Post-Reconciliation Tightening Audit — 2026-05-20

> **REPORT ONLY.** This document captures findings from a deep evaluation performed on 2026-05-20 immediately after the PR #148 reconciliation completed. **No implementation is authorized by this document.** Any patch, refactor, schema change, cron change, env change, Neon change, CRM change, Sentinel change, workflow change, or PR-5B start requires a separate explicit approval from Maya Allan and must ship as its own PR with its own tests and proof.

| | |
|---|---|
| **Audit type** | Report-only deep evaluation |
| **Date** | 2026-05-20 |
| **Branch at time of audit** | `main` |
| **Commit at time of audit** | `2a00ccdd` (PR #148 merge) |
| **Soak watch state** | drift=0; daily 03:00/03:30/04:00 UTC critical-cron window cleared clean (data-retention id 22953, feed-reconcile audit_events 271→304, branch-prune ok) |
| **PR #148 outcome** | 1,889 rows reconciled, 0 errors, post-flight drift=0, no residual |
| **Sources** | 3 parallel research agents + `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` + `memory/REFACTOR-2026-04-25.md` + `docs/backend-crm-current-gap-audit-2026-05-18.md` + live `ops:health` + live drift probe |

---

## 1. Top-level verdict

**The reconciliation outcome (PR #148) is durable.** No actively-broken writer was found that would let a terminal row display publicly via the standard read paths. PR #112 (primary writer terminal-status guard) and PR #113 (secondary-writer guard + `normalizeStandardStatus()`) are holding — the writer guards survived ~95 natural idx-sync firings during the post-reconciliation soak watch with zero drift reappearance, including high-volume ticks of 164 and 167 rows in 10–11 seconds each.

**But four defence-in-depth gaps still exist** that should be closed before PR 5B (reader swap from `listings.idx_display_yn` to `listing_search_projection.idx_display_yn`) lands. Once readers stop falling back to the listings table and fully trust the projection, any 24-hour drift window between the two surfaces becomes a public-facing bug.

**One active UCBA Art. III §6 compliance hole** exists (Backend item 6 — mid-session ethics gate) that is unrelated to drift but should ship before the next REBNY quarterly audit cycle.

**Observability is the largest single gap.** Only 2 of 23 crons are currently visible in `ops:health`; 5 cron routes leave zero persistent evidence per firing. Today's three probe-timing jitter incidents (`hours_since_last_run` readings of 0.22 / 0.24 / 0.29) couldn't be definitively classified as artifact vs real skip because no cron-heartbeat ledger exists. This is the H3 problem already documented at `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md:175-179`.

---

## 2. Writer-side gaps (W1 – W4)

Source: writer-guard bypass audit (read-only investigation of every code path that writes the 5 gate columns on `listings` and the projection's `idx_display_yn`).

| ID | Location | Gap | Today's blast radius | After PR 5B blast radius |
|---|---|---|---|---|
| **W1** | `app/api/crm/listings/[id]/status/route.ts:170-181` | CRM status PATCH transitions a listing to a terminal status (`Closed`/`Cancelled`/`Expired`/`Withdrawn`/`Sold`) without flipping `idx_display_yn=false` and without dual-writing the projection. The Listing row keeps `idx_display_yn=true` with a terminal status until the next `data-retention` cron at 03:00 UTC. | Cleaned up by `data-retention` cron within ≤24h | **24h public-facing leakage on terminal listings** once readers trust projection |
| **W2** | `app/api/cron/listing-expiration/route.ts:206-213` | Cron sets `status: "Expired"` and bumps `modification_timestamp` but never sets `idx_display_yn=false` and never dual-writes the projection. The bumped `modification_timestamp` is the exact pattern that caused the original ping-pong incident — cron 03:00 cleans up, next sync re-emits, projection out of sync. | Cleaned up by `data-retention` cron within ≤24h | Same 24h leakage **plus** re-emit ping-pong risk |
| **W3** | `app/api/crm/listings/route.ts:340-345` (CRM POST) + `app/api/crm/listings/[id]/route.ts:143-188` (CRM PATCH) | Both routes have the terminal-status guard on `idx_display_yn` (PR #112/#113 carried into the CRM code path), but **neither dual-writes the projection.** Every CRM-authored listing (Mallan exclusives) is created/updated only on the `listings` table; projection rows are created lazily by the next `lib/idx/sync.ts` run — but `lib/idx/sync.ts` only writes Trestle-sourced rows. Mallan exclusives may never get a projection row from the sync path. | Mallan exclusives may have NO projection row until manual `npm run ops:projection-backfill` | **Mallan exclusives invisible or stale on public surfaces** once readers trust projection |
| **W4** | `scripts/import-closed-from-trestle.ts:316-321` | Closed-listing import script hardcodes `idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: true` for terminal-status rows, relying on the next `data-retention` cron tick to flip the flag. Between the script run and the cron, the projection has `idx_display_yn=true` on a closed row — exactly the drift class PR #148 just cleaned up. | Cleaned up by `data-retention` cron within ≤24h | Same 24h leakage |

**Out of scope (no actively-broken writers found):**

- `lib/idx/trestle-mapper.ts:866-870` — primary writer, PROTECTED (single source of truth)
- `lib/idx/sync.ts` (all upsert sites) — PROTECTED via `mapTrestleToPrisma()`
- `app/api/crm/listings/reset-sync/route.ts` — PROTECTED (uses mapper output + `dualWriteProjectionForListingId`)
- `app/api/crm/convert/route.ts` — PROTECTED (normalizes status, checks terminal, dual-writes)
- `app/api/idx/ensure-listing/route.ts` — PROTECTED (same pattern)
- `app/api/cron/data-retention/route.ts` — SAFE-BY-CONSTRUCTION (only ever sets `idx_display_yn=false`) + dual-writes projection (PR #147)
- `app/api/cron/feed-reconcile/route.ts` — PROTECTED on orphan/ghost branches
- `scripts/backfill-listing-search-projection.ts` — PROTECTED via canonical builder
- `scripts/reconcile-projection-idx-display.ts` — PROTECTED (PR #148 one-shot)

---

## 3. Backend safety gaps (B2 / B6 / B4 / B3)

Source: backend gap-audit follow-up (verification of the 10 Class-A items from `docs/backend-crm-current-gap-audit-2026-05-18.md` lines 449–466). Of the 10 items: 1 SHIPPED (PR #146 deal-form submit wiring), 1 verified already correct (auth invite TTL), 2 PARTIAL, 6 NOT-STARTED. The four below are the highest-ROI of the open items.

| ID | Item | Status | Risk class | Regulatory hook |
|---|---|---|---|---|
| **B2** | Portal-write rate-limits — 11 unrelated POST surfaces (offers, showings, comments, signals, family, feedback, react, request) accept authenticated client traffic without any cap. Helper already exists in `lib/middleware/rate-limiter.ts` but is not wired. | NOT-STARTED | **High** — UCBA duplicate-row penalty; ddos-by-lead; every offer POST triggers an agent email — a single misbehaving client can flood Maya's + every agent's inbox in minutes | UCBA Art. II §3 duplicate-row escalating penalty schedule ($0/$250/$250/termination) |
| **B6** | Mid-session ethics gate — `ethics_training_expires_at` checked only at session creation in `lib/auth/session.ts`. An agent whose training expires at 09:01 can keep posting until 17:00 (8h session TTL). `requireAgentOrBroker` doesn't re-check per request. | NOT-STARTED | **Active UCBA hole** | **UCBA Art. III §6 direct violation** — REBNY quarterly audit hit; one quarterly >5% rejection rate = $10K fine; three in a year = 30-day RLS suspension |
| **B4** | CRM list page-size cap — `app/api/crm/leads/route.ts:13` currently clamps at **500**, not the audit's recommended **200**. `clients`/`listings` GETs not yet re-verified for any cap. | PARTIAL | Medium — NY SHIELD Act exfiltration risk: one compromised agent session can pull the full CRM in a single payload | NY SHIELD Act §899-bb |
| **B3** | Outlook rate-limits — `app/api/crm/outlook/auth/route.ts` + scan endpoints unbounded. Repeated Microsoft Graph calls can get the whole tenant throttled. | NOT-STARTED | Medium — operational. One bad session = full-platform brownout for every Outlook-dependent flow (StreetEasy lead import, folder browser) | None — operational |

**Backend Class-A items NOT in this audit's recommended top 4** (deferred reasons in parentheses):

- B5: Verify-pass on approval queue / commission status / Save Comps / Add Lease (read-then-decide; needs a separate small verify-only doc first)
- B7: Outlook bulk-import endpoint to replace N+1 client.create chain (UX improvement; lower compliance urgency)
- B10: Townhouse seller funnel landing form (revenue opportunity; no compliance/cost risk in delay)
- Honeypot + unsubscribe entropy + open-house consent verifications (open-house RSVP already verified PASS at `app/api/open-houses/rsvp/route.ts:21,85,89`; remaining two need a small follow-up trace)

---

## 4. Observability gaps (O1 – O5)

Source: cron heartbeat observability audit (read of `vercel.json` + every `app/api/cron/**/route.ts` + `scripts/ops-health.js`).

| ID | Gap | Current coverage |
|---|---|---|
| **O1** | Only 2 of 23 crons have a heartbeat marker surfaced in `ops:health` | `idx-sync` (via `SyncState`), `neon-branch-prune` (direct query) |
| **O2** | 5 cron routes leave **zero persistent evidence per firing** — if the cron fires but the route crashes mid-flight or the auth check rejects, there is no record at all | `db-keepalive`, `media-backfill`, `tenant-nurture`, `dom-reset` (when no eligible rows), `feed-reconcile` (clean-run path) |
| **O3** | No expected-vs-actual firing count surfaced anywhere | `audit_events` shows ~71 `idx_sync_cron` rows / 24h against an expected ~144 firings (`*/10` = 6/h × 24h). ~40% of firings produce no audit row — either Vercel-dropped, route-crashed, or audit-write-skipped. |
| **O4** | No deploy/cron race detector. The 2026-04-30 49-row corruption (cron at 21:00 UTC ran on the old code 1m12s after push, before Vercel build completed) is silently repeatable. | None — required hand-correlation of `last_synced_from_trestle` to `git log` commit times |
| **O5** | `ops:health` `hours_since_last_run < 0.2h` ceiling is too tight for `*/10` natural cron phase | Today's soak watch produced 3 false flags (0.22h, 0.24h, 0.29h) — disambiguating "probe-timing artifact" vs "real cron skip" required a 15-min re-probe each time |

**Vercel cron logs ARE accessible** via the existing Vercel MCP tool `mcp__claude_ai_Vercel__get_runtime_logs` (paged 6-hour windows, ≤100 entries per call, `query='/api/cron/idx-sync'`). This gives firing-*attempts* count, distinct from heartbeat (which gives firing-*completions*). The two together fully distinguish: Vercel-dropped firing vs route-crashed firing vs successful firing.

---

## 5. Recommended Phase A – F sequence

> **Recommendation only — not authorization.** Each phase below is a separate PR. None depend on PR 5B. None require a schema migration. Each must ship with its own tests and proof. Estimated LOC and risk class are sketches, not commitments.

| Phase | Item(s) | Rationale | Files touched (sketch) | LOC | Schema? |
|---|---|---|---|---|---|
| **A** | Centralize gate computation in `computeGateColumns()` helper → wire CRM status PATCH (W1) + listing-expiration cron (W2) + CRM POST/PATCH projection dual-write (W3) + CI pin-test that fails if any `app/api/**/route.ts` `prisma.listing.(create\|update\|upsert)` writer lacks `dualWriteProjectionForListingId` | Closes W1/W2/W3 before PR 5B reader swap; removes 6 inline `!TERMINAL_STATUSES.has(...)` repetitions; prevents new writers from forgetting the guard | `lib/idx/trestle-mapper.ts` (new helper) + 4 route files + 1 new test file | ~120 add / ~25 modify | No |
| **B** | Mid-session ethics gate — extend `requireAgentOrBroker` to re-check `ethics_training_expires_at` on every authenticated request, not just at session creation | Active UCBA Art. III §6 hole. Single REBNY quarterly audit could surface it. | `lib/auth/session.ts` + new helper + 1 runtime test | ~30 add | No |
| **C** | Portal-write rate-limits — wire the existing `lib/middleware/rate-limiter.ts` helper into all 11 portal write surfaces | UCBA duplicate-offer penalty protection + email-fanout protection | 11 route files (1-2 lines each) | ~50 add | No |
| **D** | Cron heartbeat AuditEvent + `ops:health` expected-vs-actual count + `hours_since_last_run` ceiling relaxed from `0.2h` → `0.25h` for `*/10` crons | Closes H3 from the 2026-04-30 incident verbatim; resolves probe-timing ambiguity at the source; gives same-day visibility into all 23 crons | 5 silent routes (~3 LOC each) + new `ops:health` section (~60 LOC) | ~150 add | No (reuses `audit_events`) |
| **E** | CRM list page-size cap — tighten `app/api/crm/leads/route.ts` cap from 500 → 200 + verify `clients`/`listings` GET caps + add runtime test pin | NY SHIELD Act exfiltration risk | 3 GETs + 1 test | ~30 add | No |
| **F** | (Optional) Outlook rate-limits — wire `lib/middleware/rate-limiter.ts` into Outlook auth + scan endpoints | Microsoft Graph tenant-throttle protection (operational, not compliance) | 3 route files | ~15 add | No |

**Phase A is the only one that materially de-risks PR 5B itself.** Phases B–F are independent and can be sequenced in any order based on your priorities.

---

## 6. Explicit holds

The following remain held by prior Maya directives and are **not unblocked by this document**:

| Item | Status | Source of hold |
|---|---|---|
| **PR 5B** (refactor/05-listing-search-projection — reader swap from `listings.idx_display_yn` → `listing_search_projection`) | NOT-STARTED, held | `memory/REFACTOR-2026-04-25.md` master plan + recurring Maya instruction across sessions |
| **External-inventory implementation** (parked behind PR 5B closeout + Maya approval) | HELD | `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` |
| **Sentinel changes** (workflow / agent / skill / cron) | UNTOUCHED | Maya recurring directive |
| **Schema migrations** (Prisma) | NONE planned in Phase A-F | `NEON.md` discipline; all 6 phases above are no-migration |
| **Env / Neon / cron config / CRM / agent / skill / workflow changes** | NONE planned by this audit | Maya recurring directive |
| **Large refactors** (Postgres trigger for projection mirroring, repository-pattern wrapper) | DEFERRED | Premature relative to today's stable state |
| **H2 deploy/cron race detector** | DEFERRED | Should layer on top of Phase D heartbeat once verified for a week |
| **Permanent `npm run ops:system-audit` command** | DEFERRED | Spec in `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md:189-208`; should land after Phase D |

---

## 7. Authorization scope of this document

This document authorizes **nothing**. It is a captured snapshot of the audit findings from 2026-05-20 for durable reference.

- ✗ No code patches authorized
- ✗ No PR opened by this document beyond itself
- ✗ No PR 5B start authorized
- ✗ No schema migration authorized
- ✗ No env / Neon / cron / CRM / Sentinel / workflow / agent / skill change authorized
- ✗ No manual cron trigger authorized
- ✗ No threshold change in `scripts/ops-health.js` authorized
- ✗ No external-inventory work authorized

Each of Phase A–F, if pursued, requires a separate Maya approval, opens as its own PR with its own scope statement, ships with its own tests and proof, and uses normal merge (no admin bypass).

---

## 8. Soak-watch tie-back

This audit was performed during an active post-reconciliation soak watch. The watch state at audit time:

- **Drift**: 0 (held across ~95 natural idx-sync firings since PR #148 merge at 2026-05-19T03:03Z)
- **`sync.state`**: `ok`, watermark advancing
- **Errors**: `sync_errors_since_merge.total = 0`; `errors_last_24h = 0`
- **§2.05 violations**: 0
- **Dangerous-direction drift (`l_false_p_true`)**: 0
- **Unauthorized reconcile events since PR #148**: 0 (`projection_reconcile_audit_events_since_merge` still exactly 1,889)
- **Daily critical-cron window (03:00 + 03:30 + 04:00 UTC on 2026-05-20)**: cleared clean
  - `data-retention` id 22953 at `2026-05-20T03:00:18.107Z`: `closed_listings_projection_failures=0`
  - `feed-reconcile` audit event count: 271 → 304 (+33 events processed, no drift introduced)
  - `neon-branch-prune` at `2026-05-20T04:00:38.241Z`: 11 examined, 4 pruned, 0 errors
- **HEAD**: `2a00ccdd` (PR #148 merge) — unchanged

The soak watch continues independently of this document at 1h cadence with 0.25h jitter-tolerance observation rule.

---

## 9. Methodology

This audit was produced by three parallel read-only research agents on 2026-05-20, plus a synthesis pass. Each agent operated under strict report-only constraints (no file edits, no commits, no PRs, no cron triggers).

| Agent | Scope |
|---|---|
| Writer-guard bypass audit | Every code path writing the 5 gate columns + projection's `idx_display_yn`; classified PROTECTED / SAFE-BY-CONSTRUCTION / UNAUDITED RISK / DEAD; identified W1–W4. |
| Cron heartbeat observability gap | 23 cron route files + `scripts/ops-health.js` + Vercel MCP capability survey; identified O1–O5 + Phase D recommendation. |
| Backend gap-audit follow-up | Verified status of all 10 Class-A items from the 2026-05-18 audit against current code; identified B2/B3/B4/B6 as the highest-ROI open items. |

Grounding documents (read but not modified):

- `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` — incident report + architectural debt (H1/H2/H3/M1/M2)
- `memory/REFACTOR-2026-04-25.md` — master plan (PR 5 still NOT_STARTED)
- `docs/backend-crm-current-gap-audit-2026-05-18.md` — original Class-A enumeration

---

## 10. Cross-references

| Topic | File:Line |
|---|---|
| W1 — CRM status PATCH gap | `app/api/crm/listings/[id]/status/route.ts:170-181` |
| W2 — listing-expiration cron gap | `app/api/cron/listing-expiration/route.ts:206-213` |
| W3a — CRM POST projection-dual-write gap | `app/api/crm/listings/route.ts:340-345` |
| W3b — CRM PATCH projection-dual-write gap | `app/api/crm/listings/[id]/route.ts:143-188` |
| W4 — closed-import hardcoded gate | `scripts/import-closed-from-trestle.ts:316-321` |
| Primary writer (source of truth) | `lib/idx/trestle-mapper.ts:610-720, 866-870` |
| Projection dual-write helper | `lib/search/listing-search-projection.ts:491-562` |
| Strict-bool / fail-closed helpers | `lib/compliance/gates.ts:47-73` |
| §2.05 cron + Tier-2 dual-write (PR #147) | `app/api/cron/data-retention/route.ts:78-126` |
| §2.05 reference standard | REBNY RLS §2.05 — `CLAUDE.md` retention table |
| UCBA Art. II §3 duplicate-row penalty schedule | `data/UCBA-2026-Requirements.md` |
| UCBA Art. III §6 ethics enforcement | `data/UCBA-2026-Requirements.md` |
| NY SHIELD Act §899-bb | `CLAUDE.md` Data Retention Policies |
| Master plan status | `memory/REFACTOR-2026-04-25.md` |
| 2026-04-30 incident architectural follow-ups | `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md:155-208` |
| Class-A audit source | `docs/backend-crm-current-gap-audit-2026-05-18.md:449-466` |
