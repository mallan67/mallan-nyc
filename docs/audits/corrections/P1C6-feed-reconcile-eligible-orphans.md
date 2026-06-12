# Correction Trace Record — `P1C6` feed-reconcile eligible-orphan import + media population

> **Status: IN-PR.** Phase-1 Correction 6 — the FINAL loop closure before the data-cleanup phase
> unlocks. Designed from Maya's directive (2026-06-11) + the live probe she ran. Carries the
> **HARD checklist item** (Phase-1 plan, Maya verbatim): "Any orphan listing created by
> feed-reconcile must immediately populate media or enqueue targeted media re-sync, with a RED
> test proving it cannot remain photoless in both `listing_media` and legacy `media`."
> **Code fix only — NO cleanup, NO R2 deletion, NO backfill, NO targeted re-sync in this PR
> (Maya's explicit bounds). NO schema, NO cron config.**

## 0-pre. Mandatory media-PR preamble (incident 2026-05-21 §0.5)
1. **Incident doc read:** 2026-06-11.
2. **Chronic root cause addressed:** the ghost-IMPORT side of the RC5 cursor story — **L13
   investigated and REFUTED** by live probe (operator-run 2026-06-11): the route's exact
   `$expand=Media` form returned **HTTP 200 with media** (18/11/0 items). The REAL defect
   (Class A, code-proven): orphan detection compares the Trestle **Active set only**
   (`route.ts` `StandardStatus eq 'Active'`), so the 3 ghosts — live-proven
   **StandardStatus=Pending** — were invisible BY DESIGN. Not called a generic $expand bug
   anywhere (Maya's bound; the only proven 400 is THIS-function's form in `fetch.ts`, PR-S.1c —
   comment scope-corrected in this PR).
3. **Remaining OPEN after this PR:** the data-cleanup phase (unlocks on this settling) ·
   C6c enum-filter adoption (Q3 proved `MediaCategory eq 'Photo'` 200 — **page-cap behavior
   still unproven**, so the Class-B lock STAYS until that is explicitly probed; Maya's bound) ·
   M3 live capture · CI3 · crm:-upload advisory · fetch.ts third-classifier consolidation ·
   W13 · held migrations · OQ-1 · adjacent observation below.
4. **Cannot reintroduce the four canonical regressions:**
   - **`Listing.media` stomping:** orphan-create's JSON write is CREATE-only (new row, W1
     semantics); no UPDATE-branch media writes added anywhere.
   - **cursor deadlock:** no cursor/watermark code touched; the created listings make future
     media-sync passes CHEAPER (no more ghost skips for these).
   - **retry purgatory:** no retry logic; media population is one non-fatal attempt per created
     orphan, with failures COUNTED (`orphan_media_errors`), never looped.
   - **JSON/table/R2 mismatch:** the hard item CLOSES the create-path divergence — JSON and
     table are populated together from the same payload, with `tombstoneVanished: false`
     because the inline expand payload is NOT pagination-proven complete (fail-closed: missing
     rows get filled by media-sync's complete-set path later; nothing can be wrongly deleted).
5. **Cleanup gate:** NO JSON/R2/data cleanup until the writer loops are closed — this PR closes
   the last one.

## 1. Defect — the BEFORE (per Maya's required-fix list)
- **Why the Pending listings were never imported:** `fetchTrestleActiveIds` filters
  `StandardStatus eq 'Active'`; the orphan diff (`route.ts` step 3b) therefore never contained
  the 3 Pending ghosts. Code-proven; probe-confirmed (Q1: all three Pending; Q2: expand works).
- Orphan-create wrote media **JSON only** — `listing_media` stayed empty for created orphans
  (table-lag of the Codex #382 scenario), and there was no clean record of a no-media outcome.

## 1b. The fix (exact)
- **`fetchTrestleEligibleNonActiveIds`** (new, route-local): Pending + ActiveUnderContract ids —
  a SEPARATE query so `fetchTrestleActiveIds` stays byte-identical (ghost semantics + paging
  headroom under the 25K skip cap untouched). Orphans = (Active ∪ Pending ∪ AUC) \ local.
  Ghosts = Active-only diff, unchanged — regression-pinned by test.
- **Media population on create (the HARD item):** payload media present → `upsertListingMedia`
  (RC1-hardened) with `tombstoneVanished:false` + `updateListingMediaSummary`; failure non-fatal
  and counted. `mediaCount=0` → **clean no-media outcome**: no upsert, NO faked photos, counted
  in `orphans_no_media` (P1C5's `no_image_any_layer` then reports it truthfully).
- New response/audit fields: `trestle_eligible_nonactive`, `orphans_with_media`,
  `orphans_no_media`, `orphans_media_gated`, `orphan_media_errors`; per-orphan audit gains
  `standard_status`.
- **Tristle blocking correction (applied):** the media write is conditioned on
  `gates.displayable` — a gate-blocked orphan (Owner Opt-Out / Participant-Only /
  display-blocked / terminal) gets its listing row created `gated:` but **ZERO media rows**
  (the Phase-3 R2 mirror has no compliance join; writing them would mirror a blocked listing's
  photos to the public bucket — the 2026-04-30 incident class). Counted separately as
  `orphans_media_gated` (a compliance skip, not a clean no-media outcome). Test-pinned.
- `lib/idx/fetch.ts` comment scope-corrected (the 400 is THIS-function's form; the
  inner-$filter form live-proven 200; **L13 REFUTED** recorded).

## 2. Pre-registered blast radius
- **WILL touch:** `app/api/cron/feed-reconcile/route.ts` · `lib/idx/fetch.ts` (comment only) ·
  new `tests/runtime/feed-reconcile-c6.test.ts` · this Trace Record.
- **MUST NOT touch:** `lib/idx/media-sync.ts` (consumed as-is) · ghost-transition logic ·
  abort caps (the designed guardrails — if the first broadened run exceeds ORPHAN_ABORT_CAP=500,
  the route aborts with a 503 + console.error; **tristle correction: only the GHOST-cap abort
  sends broker alerts + an audit row — the orphan-cap abort does not**; alerting parity is a
  candidate follow-up, NOT this PR) · schema · cron config · cleanup/R2/backfill.

## 4. Compliance pre-read (§D)
Created orphans flow through the same `validateRequiredFields` + `checkDistributionGates` +
`mapTrestleToPrisma` chain as every sync write — gates enforced identically; non-displayable
orphans land `gated:` exactly as before. Pending is an ACTIVE_SEED_STATUSES member (the route's
own eligibility set).

## 5. Step log
| # | Step | Result |
|---|---|---|
| 1 | Class-B probe FIRST (§J) | operator-run 2026-06-11: Q1 ghosts=Pending · Q2 expand=200 (L13 REFUTED) · Q3 enum filter=200 (page-cap unproven → lock stays) | ✅ |
| 2 | RED (route+fetch.ts stashed) | 3 failed: Pending orphans invisible · no media population · no counters / 1 passed (ghost regression, correct on both) | ✅ RED |
| 3 | fix | eligible-set diff + media population + counters + comment scope-fix | ✅ |
| 4 | GREEN | **4/4** | ✅ GREEN |
| 5 | harness | (filled at commit) |
| 6 | gates | §6/§7 |
| 7 | post-merge runtime proof | next 03:30Z firing: `orphans_created>=3` expected (the 3 ghosts) with `orphans_with_media=2` + `orphans_no_media>=1` (RLS20014678 has zero media at source — clean outcome, not faked); then the stranding check re-run | (pending) |

## 6. Gate results
| Gate | Result |
|---|---|
| B2 (fix claim) | Class-B probe FIRST (operator-run) → RED via stash (3 failed/1 regression-pin green) → GREEN **5/5** incl. the tristle-blocker pin; runtime proof = next 03:30Z firing (§5.7) |
| C1/C2 micro/macro | PASS (first run correctly rejected blast radius in the wrong section — §2 required) |
| security-agent | **PASS 0/0/0/0** — no deletion path reachable by construction (tombstoneVanished:false + expand pre-filters Deleted + fresh-create target); broadened orphan set bounded by the 500-cap abort BEFORE any create loop |
| rebny-search auditor | **PASS 3/3** — Pending cannot surface publicly (ALLOWED_PUBLIC_STATUSES excludes it); statuses canonical per live $metadata; INFO: lookup-CSV StandardStatus block incomplete (Class-E refresh candidate) + ComingSoon scoping asymmetry (deliberate, flagged for Maya) |
| tristle | **FAIL → corrections applied → re-audit PASS** — blocking finding: the media write ran for gated: orphans (first listing_media writer bypassing the listing-level compliance skip; R2 mirror has no compliance join → public-bucket exposure, the 2026-04-30 class). Now gated on `gates.displayable`, counted as `orphans_media_gated`, test-pinned. Doc correction: orphan-cap abort = 503+console.error only (alerting parity = follow-up candidate) |

## 7. Sign-offs
- **micro/macro PASS · security PASS · rebny-search PASS · tristle PASS-on-re-audit**
  (2026-06-11, `ba0d2b7d`).
- **Codex:** on PR open. · **Maya merge:** her C6 directive (2026-06-11) = the build approval;
  merges on green CI. **C6 SETTLES only after the §5.7 runtime proof** (next 03:30Z firing:
  the 3 ghosts imported, 2 with media, ≥1 clean no-media) — the hard checklist item then closes
  and the data-cleanup phase unlocks.
- **Follow-up candidates surfaced by the gates:** orphan-cap alerting parity · lookup-CSV
  StandardStatus refresh (Class E) · ComingSoon orphan-scope symmetry (Maya intent check).

## 9. P1C6b amendment — chunked catch-up (Maya directive 2026-06-12, probe-driven)
**Why:** the first post-merge firing ABORTED on the orphan cap — the probe (operator-run) sized
the backlog at **1,361 Pending orphans** (zero AUC; zero archive overlap): a pre-seed cohort
(2025-10..12) + the **May-2026 incident-era leak** (406 in 2026-05 vs 1 in healthy April — the
closed writer loops fixed the go-forward path; this is residue). First chunk media sample:
97/100 with media, avg 13.1 items.
**Change (Maya's spec, verbatim honored):**
- Pure `lib/idx/orphan-chunk.ts` — `selectOrphanChunk`: **deterministic documented order =
  ListingId ascending** (stable/replayable); archive-excluded (counted, even at 0 today);
  bounded chunk; `ORPHAN_CHUNK_SIZE=300`; `ORPHAN_TOTAL_SANITY_CAP=5000` (abort-all retained
  ONLY as a feed-reset sanity signal; the DESTRUCTIVE ghost direction keeps its abort-all
  untouched — byte-equivalent, guard-suite-proven).
- `maxDuration` 120→300 **with evidence** (chunk-300 estimate ≈160s; in-route
  `ORPHAN_TIME_BUDGET_MS=240s` hard wall additionally stops the loop early and reports the
  remainder, so the estimate can be wrong without consequence).
- Counters (Maya's required set): `total_eligible, chunk_size, imported_this_run,
  remaining_after_run, with_media, no_media, gated_skipped, archive_overlap` (+
  `orphan_budget_stopped`); legacy counters retained.
- Archive read + chunk selection moved AFTER the ghost-cap check (an aborting run does no
  extra DB work — also keeps the ghost-abort path byte-equivalent for its pre-existing
  lifecycle guard suite, which caught the first ordering).
- Gate-blocked exclusion from media/R2 writes unchanged (tristle-pinned).
**Settlement (Maya, binding):** ghosts at probe positions 514/550/649 land on **nightly runs
2-3** under the shrinking-set order (test-pinned simulation) — C6 settles ONLY when the runtime
counters show the 3 ghosts imported with `gated_skipped` violations = 0 and the stranding check
clean. NO cleanup/backfill/R2 deletion in this amendment.
**Proof:** chunk suite 5/5 (incl. the 1,361-row landing-forecast simulation) · route suite 7/7
(archive exclusion + counter coherence added) · lifecycle ghost-cap guards 8/8 restored ·
test:runtime **2129/2129** · type-check 0 · ucba 0 regr · compliance 92/0.

## 8. Adjacent observation (recorded, NOT in scope)
The ghost path withdraws local-Active listings absent from Trestle-ACTIVE; one whose live status
merely moved to Pending could be over-withdrawn if the MT-driven incremental missed the bump.
Pre-existing, rare (incremental normally catches the MT bump within 15 min), regression-pinned
unchanged by this PR's test #4. Candidate for a future refinement (status-correct instead of
withdraw when the id is in the eligible-non-active set).
