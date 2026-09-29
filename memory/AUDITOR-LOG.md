# Frontend Flow Verifier - Auditor Log

> 🛑 **BEFORE acting on any entry in this log that touches Prisma, `schema.prisma`,
> a migration, `vercel.json`, `lib/prisma*`, or `lib/idx/sync.ts`:**
>
> **READ `NEON.md` AT THE REPO ROOT FIRST.** It documents the tier caps, the
> required pre-flight, and the specific traps that caused the 2026-04-19
> silent-drift incident. Skipping it is how that incident happened.


## SECURITY DELTA — owner-view DTO (sanitizeOwnedListingForOwner) — 2026-06-29

**Branch:** `fix/portal-owner-listing-authorization` HEAD `200b0781` · **Scope:** `git diff 23c59f24..HEAD` (delta on the IDOR-fix commit I PASSED). Files: `lib/compliance/dto.ts` (+44, new `sanitizeOwnedListingForOwner`), `app/api/portal/listings/route.ts` (owner branch swap), 2 tests.

**VERDICT: PASS.** No CRITICAL/HIGH/MEDIUM. Resolves the prior LOW (owned withdrawn/opted-out/CRM-exclusive listings were being fail-closed-dropped from their owner's own portal).

- **Over-exposure: NONE.** The new owner DTO's `flat` allow-list is byte-identical to `sanitizeListingForPortal`'s (same 19 fields) and both call the same `sanitizeForPortal(flat, role)` masking. Curated object, not a raw-row spread → no password_hash/token/raw_data/agent-PII/owner_client_id/lead-PII. agent_info still masked to `{company}`. Address suppression still applied. Only the 3 listing-level visibility gates (owner_opt_out / participant_only / internet_entire_listing_display_yn) are lifted.
- **Reachability: owner-only.** Sole non-test caller is the `/api/portal/listings` owner branch (`isOwnerRole`, after `userType!=="lead"`→403), querying `where:{owner_client_id: auth.userId}`. GET-only, owner_client_id not request-settable → no IDOR, no non-owner path.
- **Compliance: COMPLIANT.** UCBA Art. I §4(A)/§5(A) opt-out, participant_only (Def. W), RLS Gate 3 all govern PUBLIC dissemination/IDX/syndication to third parties. An owner viewing their OWN listing in their OWN authenticated portal is not dissemination. No $40k MLS risk (no agent PII, no other-broker data, no IDX redistribution).
- **No public/buyer regression:** `sanitizeListingForPortal` + buyer branch (both gates + `.filter(Boolean)`) unchanged.

## ROUND 5 — NEON STORAGE + OPS HARDENING — 2026-04-28

**Verdict:** PASS — 11 PRs shipped (#71–#81); gates clean (type-check 0 errors, lint 0 warnings, 194/194 compliance tests, UCBA 46 PASS / 0 regressions, ops:health HEALTHY at 43% of 500 MB cap).

**Context:** Master plan PR 10 (`memory/REFACTOR-2026-04-25.md`) called for Neon storage shedding. The rollout produced six follow-on bugs in ops tooling, three CI infrastructure gaps, two open feature PRs (Workstream C C3c + C4c), and a Codex review on the cron that demanded one more pass — all addressed in a single overnight session and recorded in `memory/SESSION-2026-04-28-allnighter.md`. Storage went from 58.6 % of free-tier cap → 39.2 % at backfill close (43 % current with normal day's growth).

**11 items shipped:**

**Storage architecture (master plan PR 10 + harden):**
- `lib/compliance/raw-data-keep-fields.ts` — 110-field keep set + `slimRawData()` slimmer + `projectShedSavings()` audit helper (now byte-exact match with full-scan dry-run; previously summed only per-value JSON length and undercounted by 50–65 % on real Trestle rows). Regression test pins `keptBytes + droppedBytes === JSON.stringify(input).length`.
- `lib/idx/trestle-mapper.ts` — slim writer wraps `stripPrivateFields()` so all programmatic Trestle write paths (`lib/idx/sync.ts` main loop + `syncAgentHistory`, `app/api/cron/feed-reconcile`, `app/api/crm/listings/reset-sync`) inherit the slim from the single mapper function. Mallan-CRM-created listings (POST `/api/crm/listings`) preserved unchanged.
- `scripts/neon-shed-raw-data.ts` — one-shot backfill. Final form uses single bulk `UPDATE listings AS l SET raw_data = v.new_data FROM (VALUES ...) AS v(id, new_data) WHERE l.id = v.id` per 500-row batch (~50× faster than the original sequential per-row updates). `withRetry` wrapper around every Prisma call so Neon serverless cold-start doesn't abort the run.
- `scripts/neon-storage-audit.ts` — read-only audit. Same retry helper. Fixed under-projection bug.
- Production backfill executed live during the session: 19,371 rows slimmed, 103 MB raw_data dropped; `VACUUM (FULL, ANALYZE) listings` reclaimed dead-tuple space in 5.7 s; listings table 270 → 173 MB; total DB 293 → 196 MB.

**Operational tooling reliability:**
- `scripts/neon-precommit-guard.js` — token check now gated on `GIT_COMMIT_MSG_FILE` env var (set only by commit-msg hook). Pre-commit phase no longer reads `.git/COMMIT_EDITMSG` (which holds the *previous* commit's message and was falsely rejecting legitimate commits that followed one whose message lacked the token).
- `package.json` — `tsx@^4.21.0` pinned in devDependencies (the merged PR #75 wired `node --import tsx` but never installed tsx); ops scripts switched to `--env-file-if-exists=.env.local --env-file-if-exists=.env` so missing files don't hard-fail; new `ops:neon-prune` / `:execute` npm scripts.
- `scripts/ops-health.js` — explicit preflight check exits 2 with a clear `DATABASE_URL not set` message instead of crashing inside Prisma.

**CI infrastructure hardening:**
- `.github/workflows/auto-retry-runner-flake.yml` (new) — `workflow_run` listener for `Live Site Smoke (cron)`. Detects "no runner acquired" failures via the zero-failed-steps signature and reruns once. Real test failures are left to notify a human. Bounded to one auto-retry per run via `run_attempt < 2`. Classifier fails closed on API errors (post-Codex review) so a transient `gh api` outage cannot be misread as a flake.
- `.github/workflows/trestle-live-audit.yml` — pre-flight "Verify Trestle secrets are configured" step + idempotent `gh label create` for `trestle-drift` and `compliance` labels. Fixes the cascade where the daily audit failed (because `IDX_CLIENT_ID`/`IDX_CLIENT_SECRET` were never set on GitHub Actions secrets) → tried to open a tracking issue → failed because the `compliance` label didn't exist → workflow exited 1 → daily false-alarm email.

**Neon-Vercel preview branching (root cause of "Branch limit exceeded"):**
- `lib/neon/branches.ts` (new) — pure helpers: `listBranches`, `deleteBranch`, `isPrunable`, `pruneBranches`. Talks to `console.neon.tech/api/v2`. Never touches `primary` or `protected` branches.
- `scripts/neon-prune-branches.ts` (new) — `npm run ops:neon-prune` (dry-run default) / `:execute`. `--hours=N` validated as positive finite number (Codex follow-up — pre-fix, `Number("24h") === NaN` would have made every branch look prunable on `--execute`).
- `app/api/cron/neon-branch-prune/route.ts` (new) — daily 04:00 UTC. Returns HTTP 500 on partial-failure (per-branch DELETE errors) so Vercel cron logs flag the run as failed instead of letting stale branches accumulate (Codex follow-up).
- `vercel.json` — new cron schedule.
- `NEON.md` §11 — new architecture section: what the integration does, why the free-tier collision happens, why we keep the integration with automated cleanup rather than removing it, required Vercel env vars, future-operator guard against re-enabling preview branching without retention.
- Manual one-time cleanup: 14+ accumulated stale preview branches swept down to just `main` (1 of 10 cap).

**Workstream C closeout (UCBA 2026 compliance gaps):**
- PR #74 — C3c auction form sub-section + listing banner UI (UCBA Art. I auction-listing display).
- PR #73 — C4c broker ethics admin panel + dev-login catch (UCBA Art. III §6 ethics-training renewal). Codex review on `app/api/crm/agents/[id]/ethics-training/route.ts` flagged 4 real bugs (null/non-object body TypeError, partial-PATCH ordering bypass against persisted state, missing 404 handling, body-type guard) — all fixed at root with 3 new regression tests. Workstream C now 4/4 complete.

**Documentation + handoff artifacts:**
- `memory/SESSION-2026-04-28-allnighter.md` (new) — full session log: outcome metrics, every PR with merge SHA, the live operational backfill sequence step-by-step (incl. why we killed the first execute), required pending operator actions, file-level deltas worth knowing for future sessions.
- `README.md` §Recent Work — one-paragraph 2026-04-28 entry summarizing all 10 PRs with one-sentence rationale each.
- `NEON.md` §10 Change log — PR #75 (slim writer + backfill) and PR #80 (branch-prune cron) entries with merged SHAs; Codex-review-hardening entry covers the post-#80 pass.
- `compliance/UPDATES.md` — April 2026 row capturing today's session as a compliance-affecting change to data lifecycle, ops tooling, and CI infrastructure.

**Required pending operator actions (credential operations the agent permission system blocks):**
- Set `NEON_API_KEY` + `NEON_PROJECT_ID` on Vercel **Production** environment (cron exits 200 with `skipped: true` until set).
- Add `IDX_CLIENT_ID` + `IDX_CLIENT_SECRET` to **GitHub Actions secrets** (separate from Vercel env — these power the `Trestle live audit` cron at 13:30 UTC daily). Until added, the audit logs the new graceful-skip warning instead of running for real.

**Storage runway forecast (post-session):**
- Current: 216 MB / 500 MB (43.3 %)
- Slim-writer steady-state: ~0.5–1 MB/day net growth (was ~3 MB/day pre-shed)
- Time to 80 % cap warning line (400 MB): ~6 months
- Time to 100 % cap (500 MB hard): ~9 months
- Earliest other phase-6 trigger: `audit_events` partition at 10 M rows (currently 13 K). Months away.

---

## ROUND 4 — WAVE 1 COMPLIANCE RELEASE — 2026-04-19
**Verdict:** PASS — 13 items shipped; gates clean (type-check 0 errors, ci-compliance-check 58/58 PASS, UCBA 42/46 PASS 0 regressions, RLS validator 0 errors).

**Context:** After 4 specialist agents produced ~92 findings, live-Trestle verification (`scripts/trestle-live-metadata.xml` snapshot + 20-listing sample) corrected several over-claims. This round executed the verified-safe subset.

**13 items shipped (file-batched):**

**Security (Security-agent CRITICALs 1–3, HIGH 1–2):**
- `vercel.json` — reverted the CSP + HSTS + X-XSS-Protection additions from Round 3 (caused split-brain with `lib/middleware/security-headers.ts`). Single source of truth restored. Kept baseline edge defaults (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) for static asset routes not covered by the proxy matcher.
- `app/api/auth/reset-password/route.ts` — (a) broker role now routed through MFA (email OTP) before `createSession()`, mirroring `login/route.ts:64-93`. (b) Pre-session invalidation: `session.deleteMany` + `mfaSession.deleteMany` on the user's existing sessions.
- `app/api/auth/change-password/route.ts` — `session.deleteMany` on user's sessions before successful response; user must re-login.
- `lib/middleware/rate-limiter.ts` — added `signUpRl` (10/hr) + `marketRl` (30/min) Upstash-backed limiters + `checkRouteRateLimit()` helper.
- `app/api/sign-up/route.ts` — replaced in-module Map with `checkRouteRateLimit(ip, 'signup', ...)`.
- `app/api/market/route.ts` — same migration + borough allowlist (5 NYC values) + `sanitizeOData()` on neighborhood param (Security HIGH-1 OData injection).

**Trestle field compliance (empirically verified against live `$metadata`):**
- 6 sites: replaced `MlsStatus eq 'X'` with `StandardStatus eq 'X'` in `$filter` — REBNY blocks MlsStatus at the provider level (HTTP 400).
  - `app/api/listings/similar/route.ts:183, 212`
  - `app/api/listings/building/route.ts:186, 196`
  - `app/api/market/route.ts:158, 177`
- `app/api/market/route.ts:156` + `app/api/listings/building/route.ts:189, 199` — removed dead fields from `$select` (`IDXEntireListingDisplayYN`, `ParticipantOnlyYN`, `OwnerOptOut` — verified don't exist on Property). Added `Permission` + `InternetEntireListingDisplayYN` + `InternetAddressDisplayYN` (verified exist).
- `lib/idx/trestle-mapper.ts:620-640` + `:741-793` — rewrote distribution-gate logic. Deleted 3 dead-field branches. Gate 2 (Participant Only) now checks `Permission === 'Private'` per `compliance/IDX-VOW-DISPLAY-RULES.md:41`. Inline documentation cites the authoritative source.
- `app/api/open-houses/route.ts:121, 207` — attribution fallback no longer defaults to "Mallan Real Estate Inc." for Trestle listings (misattributed third-party listings as ours under UCBA Art. III §2(C)). Now uses neutral "Listing broker (REBNY RLS)".
- `app/api/open-houses/route.ts:291-292` — local DB path no longer exposes `s.agent.full_name` + `s.agent.phone` in the public response (REBNY IDX/VOW checklist Dec 2021 prohibits direct agent contact info). Shows office attribution only.

**Fair Housing (Agent CRITICALs 1, 2, 3, 6, HIGH 8):**
- Neighborhood JSON text purge across 4 files:
  - "good schools" / "strong schools" / "top-rated schools" → "local public schools" (Fair Housing Act §3604(c) familial status)
  - "most prestigious residential enclave" / "most prestigious residential neighborhoods" → "established..." (NY Exec. Law age steering)
  - "diverse, creative community" → "arts and cultural community" (HUD coded-language steering)
  - "performing arts professionals and young urbanites" → "Manhattan's theater and cultural districts" (NYC §8-107(2) income-source)
  - "young creatives, students, and professionals" → "the arts, academia, and cultural life" (age)
- `app/sell/townhouses/upper-west-side/page.tsx:142` — removed "excellent schools" + "Still within prime school districts" + "young families" appeal.

**Anti-discrimination notice (Agent CRITICAL 5 — NY DOS §175.28):**
- New: `app/components/AntiDiscriminationNotice.tsx` — shared component with link to DOS-1736 form.
- Added `<AntiDiscriminationNotice />` to 5 substantive lead-capture forms: `InquiryForm.tsx`, `InquiryModal.tsx`, `HomeValueWidget.tsx`, `CalculatorLeadCapture.tsx`, `app/contact/page.tsx`.

**Exclusives branding (Agent HIGH 7 — UCBA Art. I §5(D) pocket-listing risk):**
- `FeaturedListings.tsx:207-211` — badge text "Exclusive" → "Featured".
- `ExclusivesVault.tsx:47-53` — added explicit REBNY RLS syndication disclosure: "All Mallan Real Estate listings are submitted to REBNY RLS and syndicated to participating platforms per UCBA 2026."

**Attribution font + REBNY-RLS-false-fallback (Agent REBNY H1 + Search M5/M6):**
- 6 components: `SearchListingCard.tsx` (3 sites), `FeaturedListings.tsx`, `OpenHousesList.tsx`, `SimilarListings.tsx`, `LiveListingsWidget.tsx`, `BuildingUnits.tsx`, `app/building/page.tsx` (2 sites) — `text-[11px] text-brand-dark/45 font-light` → `text-xs text-brand-dark/70`. WCAG 2.1 AA + UCBA Art. III §2(C) median-prominence satisfied.
- All 6 sites' `|| 'REBNY RLS'` attribution fallback → `|| 'listing broker'` (REBNY is not a broker — the old fallback was false attribution per audit findings).

**Validator updates (`scripts/ci-compliance-check.js`):**
- Check §11 rewritten — CSP/HSTS now checked in `lib/middleware/security-headers.ts` (not vercel.json). Added regression guard for vercel.json duplication.
- Check §17 — no MlsStatus in Trestle `$filter` strings.
- Check §18 — checkDistributionGates uses live Trestle field names + Gate 2 via `Permission === 'Private'`.
- Check §19 — Anti-discrimination notice on 5 lead-capture forms.
- Check §20 — Open-houses attribution + PII guards.
- Check §21 — Fair Housing scan on neighborhood JSON data files.
- Total: 58 checks passing, 0 failing.

**Final gate results:**
- `npm run type-check` → 0 errors
- `node scripts/ci-compliance-check.js` → **58/58 PASS, 0 FAIL**
- `npm run ucba:audit` → 42/46 PASS, 0 regressions (1 pre-existing known: C15 auction listings low-severity)
- `npm run rls:validate` → 0 errors, 1 pre-existing warning

**Errors acknowledged in this session (6):**
1. CSP split-brain — added CSP/HSTS to vercel.json in Round 3 without reading existing `security-headers.ts`. Reverted in this round.
2. M-4 initial dismissal — didn't read `lib/lifecycle/engine.ts` before classifying; corrected same-session.
3. "232 field drift" — miscounted IDX Plus subset (527) vs full metadata (745); actual drift is ~3 new CustomProperty fields.
4. Gate-bug severity CRITICAL claim — asserted from static analysis without live-data check.
5. Gate-bug downgrade to LOW — amplified empirical observation (Trestle pre-filters) without reading `compliance/IDX-VOW-DISPLAY-RULES.md` which requires independent enforcement. User pushed back and told me to read the RLS files.
6. REBNY/Trestle agent C3 JSON-LD "leak" — amplified without verifying; actually wrong (code at lines 367, 387-397 does check `internet_address_display_yn`).

**Pattern:** All errors had same root cause — asserting from static/single-source analysis without cross-checking against (a) repo's own authoritative docs and (b) live runtime behavior. Corrected process now: before claiming any REBNY/Trestle finding, read both `compliance/IDX-VOW-DISPLAY-RULES.md` AND run a live Trestle query.

**Dependencies for next audit prep cycle:** none — all 13 items verified end-to-end against live system + repo RLS docs before implementation. No Cotality-side blockers remaining.

---

## ROUND 3 — SCANNER FALSE POSITIVES + REAL GAPS — 2026-04-19
**Verdict:** PASS (4 real fixes, 4 scanner-logic updates, 3 HTML-injection fixes found during validator expansion)
**Trigger:** External scanner reported "1/9 passing" against 2026-04-14 findings. Re-verified each.
**Auditor:** Claude Opus 4.7 — source-verified each finding against current codebase

**REAL FIXES (4):**
- [M-5] REBNY §2.05: `app/api/cron/search-alerts/route.ts` filtered `idx_display_yn` + `owner_opt_out` but NOT `internet_address_display_yn`. Could email precise street address of listings with address suppression (address display ≠ entire display cascade under REBNY gate 4). Fixed — now selects `internet_address_display_yn` and suppresses address → "[Neighborhood], New York (Address Available on Request)" when false.
- [H-1] IDXDisclaimer: changed from unconditionally using `new Date()` to respecting the `lastUpdated` prop when provided. Eliminates SSR hydration mismatch + makes timestamp honest if sync fails. Fallback to today preserved for backward compat (12-min sync cadence makes today's date a safe upper bound). Same fix applied to `IDXSearchDisclaimer` helper.
- [H-5] NY SHIELD Act §899-aa: added `Content-Security-Policy` and `Strict-Transport-Security` headers to `vercel.json`. CSP: `default-src 'self'` with explicit allowlists for PostHog (us.i.posthog.com), GTM, Vercel scripts, Google Fonts; `frame-ancestors 'none'`; `object-src 'none'`; `upgrade-insecure-requests`. HSTS: 2-year max-age + includeSubDomains + preload.
- [H-3] Fair Housing: added external authoritative links in `Footer.tsx` — HUD Fair Housing, NY State Division of Human Rights, NYC Commission on Human Rights. Defense-in-depth for NY DOS §175.28 + NYC §8-107 (not legally required but prevents scanner false positive and improves transparency).

**HTML-INJECTION FIXES found during validator expansion (3):**
- `app/api/auth/verify-email/route.ts`: `${name}` from `lead.first_name` interpolated into email HTML without escaping → now wrapped in `escapeHtml()`.
- `app/api/sign-up/route.ts`: `${firstName.trim()}` from POST body interpolated into email HTML without escaping → now wrapped in `escapeHtml()`.
- `app/api/cron/prospect-triggers/route.ts`: partial inline `.replace(/</g,'&lt;')` covered `<>` but missed `&`, `"`, `'` → replaced with canonical `escapeHtml(body)`.

**SCANNER-LOGIC UPDATES (3 false positives corrected in `scripts/ci-compliance-check.js`):**
- [C-2] "Agency disclosure missing in InquiryForm.tsx" — FALSE POSITIVE. `InquiryForm.tsx:5` imports `AgencyDisclosure`, `:219` renders `<AgencyDisclosure />`, which contains the DOS-1736-f text. Scanner was looking for literal string in the form file. Added validator check §9 that accepts either literal text OR a rendered `AgencyDisclosure` import.
- [H-2] "IDX sync */12 violates some 15-min rule" — FALSE POSITIVE. */12 satisfies REBNY UCBA Art. I §6 (24-hour freshness). No "15-minute rule" exists in REBNY. Added validator check §12 that flags only cadences exceeding 24h.
- [H-6] "genericCrmEmail missing unsubscribe" — FALSE POSITIVE. Function calls `wrapEmail()` which inlines shared `FOOTER` containing `/unsubscribe` link (templates.ts:13-33). Every email produced by any template inherits the footer. Added validator check §13 that inspects the shared FOOTER constant.

**M-4 RE-INVESTIGATED ON 2026-04-19 — SCANNER WAS RIGHT, MY EARLIER DISMISSAL WAS WRONG:**
- Initial Round 3 assessment said M-4 was a name-mismatch false positive ("equivalent covered by prospect-triggers"). That was incorrect — `prospect-triggers` only handles cadence outreach + stale follow-ups + building activity, NOT the lifecycle trigger engine.
- **Actual state found on 2026-04-19:** `lib/lifecycle/engine.ts` (533 lines) fully built with 8 trigger types (conviction_threshold, ghost_detected, momentum_drop, inquiry_stale, lease_expiring_{180d,90d,30d}, quarterly_nurture). `LifecycleTrigger` + `TriggerExecution` DB tables exist. `DEFAULT_TRIGGERS` array defines 9 pre-configured triggers. BUT: grep shows **zero callers** of `evaluateAllTriggers()`. `lifecycle_triggers` table has 0 rows. `trigger_executions` table has 0 rows. The entire engine was unreachable — dead code.
- **Business impact of the gap:** high-conviction buyers never flagged to agents → lost deals; ghost buyers never re-engaged → lead leakage; 48h inquiry-follow-up SLA never flagged; listings with momentum drops missed price-adjustment signals; tenant-to-buyer conversion windows (180d/90d/30d) missed; quarterly nurture never fired.
- **Fix applied (2026-04-19):**
  - Created `app/api/cron/lifecycle-triggers/route.ts` — calls `evaluateAllTriggers()`, auto-seeds `DEFAULT_TRIGGERS` on first run if table is empty (idempotent), logs `cron_lifecycle_triggers` audit events.
  - Added to `vercel.json` crons at `0 17 * * *` (17:00 UTC = 1 PM ET) — runs AFTER lead-scoring (13:00), conviction-scores (14:00), and listing-momentum (15:00) so the engine operates on fresh scoring data.
  - Added validator checks §16 for route presence + `evaluateAllTriggers()` invocation + vercel.json wiring.
- **Compliance posture preserved:** engine already has TCPA gating (quarterly_nurture requires `consent_captured_at: { not: null }`) and Fair Housing safety (engine.ts header: "no demographic-based triggers"). Activation does not introduce new compliance surface area.

**NEW VALIDATOR CHECKS ADDED (`scripts/ci-compliance-check.js`, checks §9-§15):**
- §9 Agency disclosure on all 5 substantive lead-capture forms (regex OR component-import)
- §10 REBNY §2.05 address-display gate in search-alerts cron
- §11 CSP + HSTS headers in vercel.json
- §12 idx-sync cadence satisfies 24h REBNY freshness rule
- §13 CAN-SPAM unsubscribe in shared email FOOTER constant
- §14 REBNY DOM tracker present
- §15 Data-retention cron actively purges audit events + flips idx_display_yn on terminals

**Current state:** `node scripts/ci-compliance-check.js` → 44/44 PASS, 0 FAIL. `npm run ucba:audit` → 42/46 PASS (1 known FAIL: C15 auction listing, pre-existing low-severity). `npm run rls:validate` → 0 errors, 1 pre-existing warning. `npm run type-check` → 0 errors.

**Net outcome:** All 8 "OPEN" items from the external 1/9 scan report either FIXED (7) or CLARIFIED (1 false expectation). Validator now produces accurate results without the previous false positives.

---

## COMPLIANCE FINDINGS AUDIT — 2026-04-14
**Verdict:** PASS (5 fixed, 4 inaccurate, 13 accepted/informational)
**Scope:** 22 findings across CAN-SPAM, NYS RPL, REBNY IDX, NY SHIELD, UCBA, DOS advertising, Fair Housing
**Auditor:** Claude Opus 4.6 — source-verified each finding against live codebase before action

**FIXED (5):**
- [HIGH-7] CAN-SPAM: CRM emails via `genericCrmEmail()` lacked unsubscribe link — shared FOOTER in `lib/email/templates.ts` now includes `/unsubscribe` link. Duplicate in `searchAlertEmail` removed.
- [HIGH-1] NYS RPL: `InquiryForm.tsx` (and 4 other lead capture forms) had no agency disclosure at first substantive contact — created `AgencyDisclosure` component (`app/components/AgencyDisclosure.tsx`), added to InquiryForm, InquiryModal, Contact page, HomeValueWidget, CalculatorLeadCapture.
- [HIGH-3] NY SHIELD/TCPA: `BehavioralTracker.tsx` and `IntentTracker.tsx` fired tracking events unconditionally without checking cookie consent — now import `useConsentStatus()` and gate all event sending behind `analyticsAllowed`. Consistent with existing Analytics/PostHogProvider pattern.
- [MED-2] REBNY IDX: Search page (`app/search/page.tsx`) had hardcoded REBNY disclaimer instead of `IDXSearchDisclaimer` component — replaced with component for consistency with 11 other IDX-displaying pages.
- [MED-6] REBNY UCBA D3: Portal listings endpoint (`app/api/portal/listings/route.ts`) checked 4 distribution gates but didn't flag Coming Soon status — now adds `comingSoon: true` + required notice text.

**VERIFIED INACCURATE (4):**
- [CRIT-1] "Bulk email endpoint missing" — WRONG: `app/api/crm/email/route.ts` handles eblast type with 200 recipient cap and `consent_captured_at` checking. No separate route needed.
- [CRIT-4] "12-min sync + 10-min skip guard = >15min refresh possible" — WRONG: At T=12, last run was T=0 (12 min > 10 min guard), so it always runs. Effective interval is 12 min. "REBNY IDX 15-min rule" does not exist as a specific requirement.
- [HIGH-5] "Unsplash/Picsum in remotePatterns = false listing imagery" — OVERSTATED: Images used on 10+ pages (sell, buy/townhouses, neighborhoods, contact) as decorative marketing backgrounds (skylines, generic exteriors). None appear on listing detail or search result pages.
- [MED-4] "Sell page commission language" — ALREADY RESOLVED: Page correctly states "Commission rates are not set by law and are fully negotiable" with NAR settlement reference.

**ACCEPTED RISK / NO CODE FIX (8):**
- [CRIT-2] No root `middleware.ts` — defense-in-depth gap, not a direct vulnerability. Each route validates auth individually.
- [CRIT-3] `generateAttributionText()` is a data-source disclaimer, not per-listing broker credit. Distinct REBNY requirements; broker name shown separately on listing pages.
- [HIGH-4] Fair Housing link → internal `/fair-housing` page with comprehensive policy content. Not the official NYS form but content may satisfy requirement.
- [HIGH-6] Showing gate backend correctly enforces UCBA E7 (`buyer_rep_agreement` check). UX flow to present/sign agreement in-portal is a feature enhancement.
- [MED-1] `revalidate=300` (5 min) on listing pages — well within 24-hour REBNY removal SLA.
- [MED-3] Listing data sent to Claude API for compliance validation — operational use, not redistribution/training/embedding.
- [MED-5] Financial PII fields in Lead model stored as plain Decimal — Neon encryption at rest provides baseline protection.
- [MED-7] Listing expiry → removal chain exists (status API + daily cron + 5-min ISR + DB-first fetch), meets 24-hour SLA.

**INFORMATIONAL (5):**
- [HIGH-2] RegistrationGate is newsletter signup (not substantive contact); SoftIdentityCapture covered by agency disclosure on substantive forms.
- [LOW-1] Footer settings API `/api/settings/company` doesn't exist; always falls back to correct hardcoded defaults.
- [LOW-2] JSON-LD license number — required by NY DOS, correct behavior.
- [LOW-3] Google Translate could alter Fair Housing notice — theoretical risk, low priority.
- [LOW-4] ExclusivesVault on homepage — legitimate feature, no violation identified.

**TypeScript:** 0 errors after all changes.

### ROUND 2 — DEEPER FINDINGS VERIFICATION (2026-04-14, same session)
**Scope:** 15 additional findings from second-pass audit, verified against current codebase (post-Round 1 fixes)

**FIXED (3):**
- [N-3] Fair Housing: API compliance audit route (`app/api/crm/compliance/audit/route.ts`) had only 6 patterns vs 29 in CRM frontend scanner (`public/crm/js/compliance/fair-housing.js`). Expanded to 21 categorized patterns across 10 categories: Race, Religion, Familial Status, Sex, Disability, Source of Income (NYC), Fair Chance Housing Act (NYC LL 24/2023), Citizenship, NY DOS Ad Rules. 8 remaining CRM-only patterns are low-severity ad-style rules (high-pressure language, "master bedroom") kept frontend-only.
- [C-4] TCPA: `RegistrationGate.tsx` consent checkbox was HTML-required but `consent_captured_at` timestamp was never transmitted in POST body to `/api/search-alerts`. Fixed — now sends `consent_captured_at: new Date().toISOString()`.
- [M-7] Stale log: `compliance/UPDATES.md` line 40 still showed "ACTION REQUIRED" for Trestle URL migration (deadline March 31, 2026 — already passed). Updated to "Complete". Added April 2026 audit section with Trestle patch tracking.

**VERIFIED INACCURATE (5):**
- [N-4] "Coming Soon badge missing REBNY text in CRM" — WRONG: `compliance-gates-and-output.js` line 62 correctly uses "Coming Soon — No showings or open house permitted until [date] (UCBA Art. I Sec. 5(C))".
- [H-7] "dev-login guard bypassable" — WRONG: Two independent guards: `NODE_ENV === "production"` returns 404, AND `ALLOW_DEV_LOGIN !== "true"` required. Not bypassable via URL manipulation.
- [M-1] "Search results missing per-listing Listing Courtesy of" — WRONG: `SearchListingCard.tsx` line 117 displays "RLS · Listing Courtesy of {listing.listOfficeName}".
- [M-5] "Search-alerts cron sends suppressed addresses" — WRONG: Cron applies `idx_display_yn = true` and `owner_opt_out = false` filters before DB query.
- [H-2] "IDX sync 24-min gap" — WRONG: Same incorrect math as CRIT-4. Effective sync interval is always 12 min. No "15-min rule" exists.

**RESOLVED BY INVESTIGATION (1):**
- [N-1] "PrivateOutdoorSpace required field missing from trestle-mapper" — NOT A GAP: Private outdoor space is captured via `ExteriorFeatures` enum values (`PrivateOutdoorSpaceOver60Sqft` value 108, `PrivateOutdoorSpaceUnder60Sqft` value 109) on Trestle. `ExteriorFeatures` IS in mapper B20 (line 247) and mapped to `exteriorFeatures` in `mapping.ts` (line 360). The standalone fields `PrivateOutdoorSpaceSize`/`PrivateOutdoorSpaceRemarks` are LMP submission fields only — NOT on Trestle's IDX feed.

**ACCURATE — NEEDS EXTERNAL ACTION (1):**
- [N-2] Trestle Content Patches #188 (Jan 27, 2026 — 98 new lookup values) and #189 (Mar 4, 2026 — 3 new fields, 30 field changes, 37 lookup values) not documented or verified against trestle-mapper.ts. Logged in `compliance/UPDATES.md` as ACTION REQUIRED. Contact: `trestlesupport@cotality.com`.

**ACCURATE — ACCEPTED RISK (3):**
- [H-1] IDXDisclaimer `lastUpdated` prop is intentionally ignored — code comment says "Always show today's date — data is refreshed every 12 minutes via sync cron." By design, not a bug.
- [H-8] `/api/settings/company` GET is unauthenticated — returns only public company info (name, license, phone, address). Same data visible in footer. POST requires broker auth.
- [C-4 related] RegistrationGate PostHog `trackMicroCommitment` call — PostHog itself is consent-gated in PostHogProvider; if PostHog didn't initialize, this is a no-op.

**REBNY/TRESTLE EXTERNAL STATUS (verified 2026-04-14):**
- REBNY: No new policy changes since January 2026 UCBA. Verified rebny.com/rls-updates/ and /compliance/.
- Trestle: API stable at `api.cotality.com/trestle`. URL migration complete. Rate limits: 7,200/hr, 180/min. Token TTL: 8 hours.
- Private Outdoor Space: Already captured via ExteriorFeatures enum (not a standalone IDX field).

---

## COMPREHENSIVE SECURITY AUDIT — 2026-03-21
**Verdict:** FAIL (3 CRITICAL, 6 HIGH, 5 MEDIUM, 3 LOW)
**Scope:** Full codebase -- all 175+ API routes, middleware, auth, secrets, headers, dependencies, PII, MLS/IDX, file uploads
**Auditor:** Security Agent

**CRITICALs:**
- [C1] Hardcoded Trestle API credentials (client_id + client_secret) in `scripts/test-trestle-geo.js` -- committed to git (commit 18e25077). MUST ROTATE IMMEDIATELY.
- [C2] `/api/health/geoclient` -- NO AUTH, returns masked API keys (first4+last4 chars) for 6 credential variants
- [C3] `/api/health/socrata` -- NO AUTH, returns masked Socrata token + raw error messages

**HIGHs:**
- [H1] `/crm/dev.html` explicitly exempt from auth in route-guards.ts:39 -- serves full CRM shell to unauthenticated users
- [H2] `/api/auth/dev-login` uses Host header check (spoofable) instead of NODE_ENV/VERCEL_ENV
- [H3] Document upload (`/api/crm/documents/upload`) -- no file type allowlist, accepts any extension
- [H4] `/api/contact` GET returns full Lead model including `password_hash` (no select clause)
- [H5] Uncaught BigInt() in 20+ routes crashes on non-numeric input (conviction, lead-scoring, agents, etc.)
- [H6] Next.js 16.1.6 has 2 CVEs (HTTP request smuggling in rewrites + disk cache exhaustion) -- fix: 16.1.7+

**MEDIUMs:**
- [M1] CRM CSP uses unsafe-inline + unsafe-eval (nonce-based CSP on public pages is fine)
- [M2] CSRF middleware passes requests with no Origin/Referer header
- [M3] ADMIN_KEY not documented in .env.example (configuration drift)
- [M4] Dependency CVEs: fast-xml-parser (entity expansion), effect (context contamination), flatted (prototype pollution)
- [M5] escapeOData() in idx/search only escapes single quotes (auth-gated, limited risk)

**LOWs:**
- [L1] Missing X-XSS-Protection: 0 header
- [L2] Login error logging may expose stack traces with DB connection info
- [L3] test-email-templates.js uses ciphers: "SSLv3" (deprecated, non-functional)

**Confirmed Clean:**
- test-email-templates.js SMTP credentials -- now from env vars
- seed.ts -- requires SEED_BROKER_PASSWORD env var (no hardcoded passwords)
- NEXT_PUBLIC_ vars -- all safe (URLs, analytics keys, Sentry DSN)
- .gitignore properly excludes .env files
- CORS: production is same-origin only
- Session cookies: httpOnly, Secure (prod), SameSite=Lax, UUID tokens, 24hr TTL
- All /api/crm/* and /api/portal/* routes -- gated by middleware + route-level auth
- All /api/cron/* routes -- gated by CRON_SECRET Bearer token
- Public lead capture (contact, inquiries, sign-up, CMA, guides, RSVP) -- TCPA consent validated
- Distribution gates enforced on all public listing endpoints

---

## FULL API ROUTE AUDIT — 2026-03-09
**Scope:** ALL 103 API route files across app/api/ — end-to-end trace of request params, query logic, distribution gates, response shapes, auth, security
**Actions:** Read all priority endpoints (listings, similar, market, buildings, cma, inquiries, open-houses, open-houses/rsvp, idx/search, media/proxy, media/batch, contact, login, auth/login, sign-up, admin/reset-lead, cron/idx-sync, analytics/event, listings/[id], listings/suggest, listings/building, health/*, ai/env-check, guides/download, favorites/sync). Read middleware.ts, lib/auth/middleware.ts, lib/auth/session.ts, lib/idx/trestle-mapper.ts (checkDistributionGates), lib/idx/db-to-public-dto.ts, lib/sanitize.ts, prisma/schema.prisma (Listing+Lead+Session models).
**Findings:** 6 CRITICALs, 12 WARNINGs, 9 INFOs

**CRITICALs:**
- [C1] pc_auth cookie mismatch: /api/login sets random hex, middleware expects PRIVATE_COLLECTION_PASS — middleware.ts:285, app/api/login/route.ts:23-27
- [C2] /api/market Trestle fallback skips distribution gates on stats data — app/api/market/route.ts:163-188
- [C3] HTML injection in 5 email templates: user input not escaped via escapeHtml() — /api/cma, /api/inquiries, /api/open-houses/rsvp, /api/guides/download, /api/contact
- [C4] /api/contact writes to filesystem (ephemeral on Vercel) — app/api/contact/route.ts:66-69
- [C5] Two separate login endpoints (/api/login legacy + /api/auth/login) — legacy produces unusable cookie
- [C6] /api/listings/building no distribution gates on Trestle results — app/api/listings/building/route.ts:218-246

**WARNINGs:**
- [W1] Silent empty responses on Trestle failure in /api/listings
- [W4] /api/listings/similar DB media JSON key mismatch (mediaType vs MediaType)
- [W6] /api/buildings incomplete distribution gate (missing ParticipantOnlyYN/OwnerOptOut)
- [W7] /api/buildings case-sensitive string_contains for StreetName
- [W8] /api/open-houses Trestle path no distribution gates
- [W9] /api/open-houses local path uses camelCase address keys, DB stores PascalCase
- [W11] /api/listings/building no distribution gates (dup of C6)
- [W12] /api/listings/building returns success:true on error (line 300)

**New Contract Registry entries:**
- POST /api/cma: public, {name,email,phone,address} required, upserts Lead, 2 emails
- POST /api/inquiries: public, {email,agreeToTerms} required + name/phone for non-calculator, upserts Lead, 2 emails
- POST /api/open-houses/rsvp: public, {name,email,phone,listingAddress,openHouseDate,openHouseTime,agreeToTerms} required
- GET /api/media/proxy: public, URL whitelist (3 Trestle domains), Bearer auth server-side, 7d CDN cache, concurrency semaphore (15)
- GET /api/media/batch: agent/broker auth, batch up to 50 IDs, 30min cache, detail mode (5 IDs, all media types)
- POST /api/sign-up: public, honeypot + disposable email + MX validation + rate limit 10/hr
- POST /api/auth/login: public, tries Agent then Lead table, session_token httpOnly cookie, 5/min rate limit
- POST /api/contact: public, consent timestamp validation (5min), JSON file + DB, admin GET requires x-admin-key
- GET /api/listings/suggest: public, 60/min rate limit, 8 suggestions max, distribution gates on Trestle results
- GET /api/listings/building: public, Trestle + ACRIS sale history, BBL lookup via Geoclient/PlanningLabs
- POST /api/guides/download: public, guideType whitelist (buyer/seller), Lead upsert

**Auth coverage verified:** All /api/crm/* and /api/portal/* require session_token. /api/idx/search and /api/media/batch require agent/broker. All cron routes require CRON_SECRET. Public endpoints appropriately unprotected with rate limiting.

**Status:** Open — 6 CRITICALs unresolved

---

## Recently Fixed Features Audit — 2026-03-09
**Scope:** Market Report, Building Pages, Similar Listings, Open Houses — full end-to-end chain verification
**Actions:**
- Read: app/api/market/route.ts, app/market/MarketReportContent.tsx
- Read: app/api/buildings/route.ts, app/building/page.tsx, lib/sanitize.ts
- Read: app/api/listings/similar/route.ts, app/components/SimilarListings.tsx
- Read: app/api/open-houses/route.ts, app/api/open-houses/rsvp/route.ts, app/components/ListingOpenHouseRSVP.tsx
- Cross-referenced: app/listing/[id]/page.tsx (prop passing), lib/idx/public-dto.ts (listing.id = MLS listingId)
**Findings:** 0 blockers, 7 majors, 9 minors
**Key Issues:**
- [M1] Market API $select missing ModificationTimestamp/OnMarketTimestamp — Trestle newListings always 0 (route.ts:153,362)
- [M3] Market DB vs Trestle closed filter mismatch (modification_timestamp vs CloseDate) (route.ts:240,176)
- [M5] Similar listings DB media JSON key risk (mediaType vs MediaCategory) (route.ts:85)
- [M7] Open house API dedup drops same-day different-time events (route.ts:38-39)
- [m3] Building API Trestle results missing OwnerOptOut/ParticipantOnly check — compliance gap (route.ts:209-217)
**Contract Registry:**
- GET /api/market: public, rate-limited, 5min cache, aggregates (active/closed/neighborhoodBreakdown)
- GET /api/buildings: public, rate-limited, building profile (activeUnits/saleHistory/stats/amenities)
- GET /api/listings/similar: public, DB-first (>=3 skip Trestle), up to 6 listings with photos
- GET /api/open-houses: public, 5min CDN cache, merges Trestle OpenHouse + local prisma.showing
- POST /api/open-houses/rsvp: public, Lead upsert + AuditEvent + 2 emails
**Status:** Open — 7 majors unresolved

---

## Homepage Audit: Full Data Chain Trace — 2026-03-09
**Scope:** All 10 homepage sections (HeroSearch, FeaturedListings, ExploreNeighborhoods, ExclusivesVault, ZillowTestimonials, AboutSection, ValueProposition, NewsletterSignup, CTASection, TrustMarkers). Traced every data-dependent section end-to-end.
**Actions:** Read app/page.tsx, all 10 section components, 3 API routes (settings/company, listings/suggest, search-alerts), data/listings.json, lib/compliance/idx-display-gate.ts, lib/types/listing.ts. Verified existence of all linked pages (/buy, /rent, /sell, /contact, /sign-in, /unsubscribe) and static assets (hero.jpg, about-penthouse.png, equal-housing-logo.svg). Checked calculator component imports (AffordabilityCalculator, RentVsBuyStandalone, SellerClosingCostCalculator).
**Findings:** 2 blockers, 5 majors, 5 minors

**Details:**
- [B1] FeaturedListings INVISIBLE: data/listings.json has "listings": [] (empty). Component statically imports this at build time, gets 0 results, returns null. Entire "Featured Properties" section absent from homepage. No API fallback.
- [B2] TCPA consent not recorded: NewsletterSignup has required checkbox but consent state never sent in POST body to /api/search-alerts. No consent proof stored in DB.
- [M1] heroTagline fetched but never rendered: HeroSearch fetches heroTagline from API but h1 is hardcoded "New York Real Estate, Reimagined." (app/components/HeroSearch.tsx:53,263)
- [M2] ExclusivesVault unlocked state has no data source: shows "No exclusive listings" with zero API calls. Feature is permanently empty.
- [M3] IDXDisclaimer lastUpdated is always new Date() — not actual MLS data refresh time (app/components/FeaturedListings.tsx:395)
- [M4] HeroSearch settings fetch silently swallows errors with .catch(() => {}) (app/components/HeroSearch.tsx:58)
- [M5] Company settings POST uses filesystem writeFile — changes lost on Vercel cold start (app/api/settings/company/route.ts:53-58)
- [m1] HeroSearch stats hardcoded (5 Boroughs, 59 Neighborhoods, 5.0 Zillow Rating)
- [m2] FeaturedListings "View All" links to /buy but section could include rentals
- [m3] ExclusivesVault checks mallan_logged_in cookie but auth system uses session_token
- [m4] NewsletterSignup headline says "Market Insights" but consent text says "listing alerts"
- [m5] No error boundaries on homepage — any section crash = full white screen

**Contract Registry:**
- GET /api/settings/company: public, no auth. Returns full settings JSON (heroImage, heroTagline, legalLinks, quickLinks, etc.). Falls back to DEFAULT_SETTINGS if file missing. POST requires broker auth.
- GET /api/listings/suggest?q=...: public, rate-limited 60/min/IP. Returns { success: boolean, suggestions: Suggestion[] }. Searches neighborhoods (local), agents (DB), listings/addresses (Trestle when IDX_ENABLED). Max 8 results.
- POST /api/search-alerts: public, no auth (rate-limited by middleware). Accepts { email, name?, frequency, criteria: { type|listing_type, ... } }. Upserts Lead + creates SavedSearch in Prisma. Returns { success: true, message, searchId }.

**Status:** Open — B1 is the most impactful issue (zero listings on homepage). B2 is a legal compliance gap.

---

## Sell Page Audit: HomeValueWidget Integration — 2026-03-09
**Scope:** /sell page after CMARequestForm → HomeValueWidget swap. Traced form flow, API contract, navigation, component integrity.
**Actions:** Read app/sell/page.tsx, app/components/HomeValueWidget.tsx, app/components/SellerClosingCostCalculator.tsx, app/components/CMARequestForm.tsx, app/api/cma/route.ts, Header.tsx (grep). Checked middleware rate limiting, lib/email/templates.ts.
**Findings:** 0 blockers, 3 majors, 4 minors

**Details:**
- [M1] TCPA regression: HomeValueWidget has passive consent text only (line 137-141), removed explicit checkbox that CMARequestForm had (line 297-314). Legally weaker under TCPA.
- [M2] HTML injection in broker email: /api/cma route.ts:96-110 interpolates user input into HTML without escaping.
- [M3] Lost form fields: 4 fields now vs 11 previously. Backend still accepts all 11. Broker gets less info per CMA request.
- [m1] Dead code: CMARequestForm.tsx (330 lines) not imported anywhere.
- [m2] Stale comment: /api/cma route.ts:12 says "form includes explicit consent checkbox" — no longer true.
- [m3] No phone length validation: HomeValueWidget accepts any string as phone; server strips non-digits but doesn't reject too-short.
- [m4] Header nav sends ?type=residential/commercial to /sell but page ignores query param.

**Contract Registry:**
- POST /api/cma: public, no auth (rate-limited 30/window via middleware). Accepts {name, email, phone, address} required + 7 optional. Returns {success:true, message} on 200 or {error} on 400/500. Upserts Lead in Prisma, logs AuditEvent, sends broker email + auto-response via SendGrid.
- HomeValueWidget sends only the 4 required fields. Contract matches.

**Status:** Open — M1 (TCPA checkbox) is highest priority. M2 (HTML injection) should be fixed before heavy traffic.

---

## Security Audit: Address Slug Full Codebase Sweep - 2026-03-05 (Rev 2)
**Verdict:** FAIL (0 CRITICAL, 2 HIGH, 3 MEDIUM, 1 LOW)
**Scope:** Full codebase sweep across app/, lib/, public/crm/js/, scripts/, .github/ for address leakage vectors
**Trigger:** Comprehensive address slug compliance review -- all URL generation, meta tags, share components, CRM emails, sitemap, JSON-LD
**Fixes confirmed from previous audit:**
- OData injection in fetchListingByAddress() -- FIXED (sanitizeOData allowlist at lib/idx/fetch.ts:207)
- fetchListing() Strategy 3 InternetAddressDisplayYN gate -- FIXED (line 121)
- Agent page ActiveListingCard -- explicitly sets internetAddressDisplayYN: true (local exclusives only)
**New findings:**
- [HIGH-001] CRM sendAgentInquiry() builds URL from raw listing.address without checking addressDisplayYN -- leaks suppressed address in email URL (public/crm/js/search/pagination.js:1076-1088)
- [HIGH-002] CRM email report URL builds slug from displayAddr which is "Address Available Upon Request" for suppressed listings, producing broken URLs; does not use MLS-ID fallback (public/crm/js/output/reports.js:2045-2046)
- [MEDIUM-001] CRM URLs use /buy/ and /rent/ route pattern but Next.js uses /listing/ -- all CRM-generated links 404
- [MEDIUM-002] mallannyhomes.com email in GitHub workflow (.github/workflows/rotate-db-keys.yml:91) -- stale domain
- [MEDIUM-003] LiveListingsWidget showAddress hardcoded to true -- must check InternetAddressDisplayYN before IDX data migration (app/components/neighborhoods/LiveListingsWidget.tsx:127)
- [LOW-001] extract-rental-standalone.js auto-populates listing URL from address without gate (acceptable -- listing agent's own form)
**Safe vectors verified:** generateListingSlug(), toPublicDTO(), listingHref(), canonical URL, OG/Twitter tags, ShareButton, SocialShareBar, sitemap, JSON-LD, console.log/error, /api/listings, /api/listings/suggest, /api/idx/search (auth-gated), fetchListingByAddress() (OData sanitized), ?key= override (goes through distribution gates)
**Blocking:** HIGH-001 and HIGH-002 must be fixed before deploy.

---

## Security Audit: Address-Based URL Slugs - 2026-03-05
**Verdict:** FAIL (0 CRITICAL, 2 HIGH, 1 MEDIUM, 1 LOW)
**Scope:** 8 files: lib/listing-slug.ts, lib/idx/public-dto.ts, lib/idx/display-adapter.ts, lib/idx/fetch.ts, app/listing/[id]/page.tsx, app/components/PropertySearch.tsx, app/components/SearchMap.tsx, app/agents/[name]/page.tsx
**Trigger:** New feature -- address-based listing URL slugs with redirect logic
**Findings:**
- [HIGH-001] OData injection in fetchListingByAddress() -- slug-derived street name interpolated into contains() with only single-quote escaping (lib/idx/fetch.ts:212)
- [HIGH-002] Missing InternetAddressDisplayYN gate in ActiveListingCard on agent page -- address leaks in slug for suppressed listings (app/agents/[name]/page.tsx:112)
- [MEDIUM-001] fetchListing() Strategy 3 resolves address-suppressed listings via address slug -- should return null when InternetAddressDisplayYN=false (app/listing/[id]/page.tsx:113-121)
- [LOW-001] toDisplayListing() local fallback hardcodes internetAddressDisplayYN=true (lib/idx/display-adapter.ts:160)
**InternetAddressDisplayYN gate status:** Enforced in generateListingSlug(), toPublicDTO(), fromPublicDTO(). NOT enforced in agent page ActiveListingCard or fetchListing() Strategy 3.
**Blocking:** HIGH-001 and HIGH-002 must be fixed before deploy.

---

## Security Audit: Comprehensive Pipeline Audit - 2026-03-04
**Verdict:** FAIL (0 CRITICAL, 1 HIGH, 4 MEDIUM, 2 LOW)
**Scope:** 16 files: /api/listings, /api/idx/search, /api/idx/status, lib/idx/* (7 files), lib/compliance/* (3 files), lib/hooks/useListings, app/search/page, app/listing/[id]/page, .env.example, vercel.json
**29/29 REBNY/RLS compliance checks PASS**
**Findings:**
- [HIGH-001] /api/idx/search:416 leaks `details: message` in 502 error response -- internal Trestle errors exposed to authenticated agents
- [MEDIUM-001] /api/idx/status:36 exposes TRESTLE_API_URL in response body (broker-only but unnecessary)
- [MEDIUM-002] /api/listings:282 outer catch logs full error object (may contain Trestle URLs/token fragments)
- [MEDIUM-003] lib/idx/types.ts:147 declares `privateRemarks` on IDXListing (never populated but risk vector)
- [MEDIUM-004] lib/idx/types.ts:131 declares `listAgentEmail` on IDXListing (same risk pattern)
- [LOW-001] In-memory rate limiter resets on cold start (mitigated by middleware edge limiting)
- [LOW-002] Missing X-XSS-Protection: 0 header in vercel.json (CSP present as mitigation)
**Blocking:** HIGH-001 must be fixed before deploying changes to /api/idx/search
**CORS improvement noted:** mallan67.github.io origin removed from middleware.ts ALLOWED_ORIGINS

---

## Frontend Flow Verification - 2026-03-04
**Scope:** Full data flow trace from /search frontend through API routes to Trestle backend
**Actions:**
- Read: app/search/page.tsx, lib/hooks/useListings.ts, app/api/listings/route.ts
- Read: app/api/idx/search/route.ts, lib/idx/fetch.ts, lib/idx/auth.ts, lib/idx/client.ts
- Read: lib/idx/display-adapter.ts, lib/idx/public-dto.ts, lib/idx/mapping.ts, lib/idx/trestle-mapper.ts
- Read: data/listings.json, vercel.json, .env.local, .env.example
- Read: public/crm/js/core/mock-data.js, public/crm/js/core/api-client.js, public/crm/js/search/search-engine.js
- Read: app/api/listings/[id]/route.ts
- Searched: all /api/crm/ routes, all /api/idx/ routes, all hooks
- Grep: IDX_ENABLED across env files, mockListings references in CRM, API endpoint references

**Findings:** 2 blockers, 4 majors, 2 minors

**Details:**
- [B1] data/listings.json:5 - Empty fallback ("listings": []) means any Trestle failure = zero results with no error
- [B2] app/api/listings/route.ts:227-231 - Silent IDX failure: catches error, falls to empty fallback, returns success:true
- [M1] app/search/page.tsx - Never displays _compliance.source, can't distinguish IDX from fallback
- [M2] .env.local vs Vercel - IDX_ENABLED must be verified in Vercel dashboard, .env.example defaults to false
- [M3] Two separate data paths: /api/listings (public) vs /api/idx/search (CRM) - fixes to one don't affect other
- [M4] CRM Prisma fallback: /api/crm/listings reads from DB which may be empty if sync never ran
- [m1] app/agents/[name]/page.tsx:7 - Imports from empty listings.json
- [m2] public/crm/js/core/mock-data.js:21 - mockListings=[] on production, no data until API resolves

**Contract Registry:**
- GET /api/listings: public, no auth, returns PublicListingDTO[], IDX_ENABLED gate, empty fallback
- GET /api/idx/search: auth-gated (agent/broker), returns CRM flat shape, IDX_ENABLED + hasCredentials gate
- GET /api/listings/[id]: public, no auth, returns single PublicListingDTO, IDX_ENABLED gate, empty fallback
- GET /api/crm/listings: auth-gated, reads from Prisma DB (local sync data)

**Status:** Open - all items unresolved. Recommended: verify Vercel env vars, test Trestle credentials, add source indicator to frontend.

---

## IDX PLUS VALIDATOR SESSION — 2026-03-24/25
**Verdict:** ALL PASS (817 pass, 0 critical, 0 warning, 37 info)
**Scope:** Full-stack — 32 validation sections covering IDX pipeline, CRM→API alignment, cron, auth, security, compliance, search, data integrity, bloat
**Tool:** `npm run idx:validate` (scripts/idx-validate.js)

**Built:** 32-section validator covering:
- IDX pipeline: $select completeness, distribution gates, field counts, picklist, Prisma↔mapper
- CRM & API: fetch→route cross-ref, body field alignment, response consistency, req.json() safety
- Cron: schedule completeness, timing-safe secret validation
- Auth: RBAC on mutations, secrets scan, rate limiting, PII redaction
- Compliance: Coming Soon badge, Fair Housing, REBNY attribution, audit+retention
- Data integrity: contract testing, idempotent sync, query sanity, API resilience
- Search: filter integrity, checkbox wiring, OData compatibility
- Frontend: interactive element wiring, data chain tracing, portal auth
- Bloat: dead components, unused deps, cache hygiene
- Platform: run history with trend detection

**Fixed (104 criticals):**
- [S1] Permissions field added to $select (owner opt-out gate was broken)
- [S2] 2 missing distribution gate DB columns (InternetAutomatedValuation, ConsumerComment)
- [S4] 3 REQUIRED/EXCLUDED field conflicts removed
- [S7] 12 missing CRM API routes (9 stubs + 3 path fixes)
- [S9] 31 unprotected req.json() calls wrapped in safeJson()
- [S10] 10 cron jobs scheduled in vercel.json (was 6)
- [S11] 16 cron routes: timing-safe CRON_SECRET comparison
- [S12] 15 mutation routes: auth checks added (7 exclusions for public auth routes)
- [S27] 7 CRM→API field name mismatches fixed (agent_id, split_percent, etc.)
- [S28] Search checkbox threshold adjusted, comps marked as planned

**Fixed (75 warnings):**
- [S8] 72 API routes: removed { ok: true/false } response format
- [S15] 12 routes: PII redacted from log statements
- [S5] list_price/living_area: string for Prisma Decimal precision
- [S14] Rate limiting: recognized proxy-level coverage
- [S21] IDX sync: added concurrency guard (10-min dedup)
- [S28] 7 fields added to odataSafe set

**Fixed (JS runtime errors):**
- 12 unquoted listing ID injections in onclick handlers (RLS20069227 ReferenceError)
- Added validator section 29 check to catch this pattern

**CRM Updates:**
- System Health section added to Compliance & IDX page (validator results + regenerate button)
- Test suite badge moved to footer center, runs silently for all users
- 18 duplicate test files deleted (bundled in compliance-gates-and-output.js)
- Compliance audit scorecard updated: 115 PASS / 3 FAIL (was 109/9)

**Docs Updated:**
- CLAUDE.md: verified counts (6 crons, 61 models, 235 routes) + CI validation section
- tests/00-README.md: rewritten for current 11 files
- compliance/archive/FULL-AUDIT-2026-03-13.md: 5 FAILs marked FIXED
- 22 stale memory files removed

## AUTH SECURITY AUDIT — 2026-03-25 (OPEN)
**Verdict:** FAIL (4 P1, 3 P2)
**Source:** External code audit of auth endpoints
**Detail:** [SECURITY-BLOCKERS-2026-03-25.md](../../../.claude/projects/C--Users-MayaAllan-Desktop-mallan-nyc/memory/SECURITY-BLOCKERS-2026-03-25.md)

**P1 (Blockers):**
- P1-1: Per-role session TTL not implemented (all users get 24h)
- P1-2: Broker MFA missing entirely (no TOTP/OTP flow)
- P1-3: No server-side impersonation endpoint (client-side only)
- P1-4: Client portal 30-day TTL not implemented (gets 24h)

**P2 (Medium):**
- P2-5: Dev-login needs additional env flag guard
- P2-6: Audit logging coverage needs verification for overrides
- P2-7: Portal DTO needs unit tests for gate flag combinations

**Fixed (2026-03-25):**
- P1-1: Per-role session TTL — DONE (lib/auth/cookie-config.ts → 3 auth routes)
- P1-3: Server-side impersonation — DONE (POST /api/crm/agents/[id]/impersonate + /api/auth/impersonation/stop, audit logged)
- P1-4: Client 30d TTL — DONE (covered by P1-1)
- P2-5: Dev-login hardened — DONE (ALLOW_DEV_LOGIN env flag + IP logging)
- Validator sections 33-35 added (session policy, MFA enforcement, impersonation audit trail)

**Still Open:**
- P1-2: Broker MFA — NOT IMPLEMENTED (needs plan, 2-3 day feature)
- P2-6: Audit logging verification — NOT DONE (20 min manual check)
- P2-7: Portal DTO unit tests — NOT DONE (1-2 hours Jest tests)

## SECURITY GATE — U4 offer-transmit ownership — 2026-06-07

**Scope:** branch `fix/u4-offer-transmit-ownership` (diff vs main):
`app/api/crm/offers/[id]/transmit/route.ts` (+17) + `tests/runtime/offer-transmit.test.ts` (+48).
**Trigger:** Authorization fix (U4 correction) — release gate.
**Verdict:** PASS. Zero CRITICAL, zero HIGH.

**What it fixes:** IDOR / broken-object-level-authorization. POST transmit previously stamped
`transmitted_to_seller_at` + wrote the UCBA Art. II `offer_transmitted_to_seller` AuditEvent with
NO ownership check — any authenticated agent could transmit another agent's offer and forge the
audit under their own identity. Fix adds owner/broker guard after the 404 check and BEFORE the
idempotency 200, the `offer.update`, and the audit write.

**Verification (Class-A static + proof-first):**
- bigint===bigint comparison is type-correct (SessionUser.userId: bigint; Offer.list_agent_id /
  buyer_agent_id: BigInt? in schema:2435/2437). Null-guarded on both sides. No number coercion.
- Placement proven: non-owner returns 403 BEFORE serializeOffer/update/audit → no data leak,
  no mutation, no forged AuditEvent. Already-transmitted leak case also 403.
- No over-block on legit paths (list agent / buyer agent / broker all 200).
- `auth.role === "BROKER"` matches the dominant CRM convention (agents/me, alerts, events,
  growth-tools, past-deals, lib/crm/access.ts).
- 9/9 runtime tests pass (`npx jest tests/runtime/offer-transmit.test.ts`).
- Touches no secrets/env/headers/new routes.

**LOW (non-blocking, pre-existing, repo-wide):** role-casing — `scripts/reset-password.js:58`
writes lowercase `role:"broker"`. Against this route that is FAIL-CLOSED (denies, never
over-permits). Recommend normalizing reset-password.js to "BROKER" as data hygiene; not a
blocker for this PR.

---

## 2026-06-08 — RC1 media-pagination keyset cursor — VERDICT: PASS

**Branch:** fix/rc1-media-pagination-cursor (HEAD de7986ae) · **Trigger:** macro-gate schema-domain change (security sign-off required) · **Mode:** READ-ONLY, no deploy.

**Scope:** Additive nullable column `MediaSyncState.last_listing_key` (TEXT) + migration `20260608120000_add_media_sync_state_last_listing_key`; `lib/idx/media-sync.ts` incremental-cron internals (keyset cursor + @odata.nextLink pagination); tests + 1 doc. Cron route `app/api/cron/media-sync/route.ts` UNCHANGED (verified empty diff). No route/auth/env/header/middleware/PII changes (verified `--name-only`).

**Findings:**
- OData injection — NONE. Both interpolations (`buildPropertyQuery` `ListingKey gt '${key}'`; `defaultFetchMedia` `ResourceRecordKey eq '${escaped}'`) sit inside single-quoted OData literals and use `replace(/'/g,"''")`. Quote-doubling is the complete escape for OData v4 string literals. Value is server-only MLS feed data, not attacker-reachable; also URL-encoded via URLSearchParams. SUFFICIENT.
- Secrets — NONE. No console/logger in file; errors carry only HTTP status / ListingKey, never token or URL. Token stays in Authorization header.
- SSRF (following server-returned `@odata.nextLink` with bearer) — LOW / defense-in-depth only, NON-BLOCKING. nextLink originates from api.cotality.com responses; `paginateMedia` has maxPages=50 fail-closed runaway guard. Recommended (not required): assert nextLink origin === api.cotality.com before fetch.
- Migration safety — PASS. Single `ALTER TABLE ADD COLUMN` nullable TEXT, no NOT NULL/DEFAULT, single-row table → metadata-only microsecond lock. NEON.md §4 conformant. Human-applied pre-merge.
- Tenant scope — PASS. Both tombstone `updateMany` (media-sync.ts:583, 608) scoped by `listing_id: listingId`; no cross-listing write. `tombstoneVanished` false→true is safe (fetchMedia THROWS on incomplete pagination → complete set guaranteed before any destructive tombstone).

**Critical: 0 · High: 0 · Medium: 0 · Low: 1 (SSRF hardening, non-blocking). Blocking deployment: No.**

---

## 2026-06-10 — P1C2 CRM media guards (release gate)
- **Branch:** `fix/p1c2-crm-media-guards` (HEAD 7d9b9992), diff `main...HEAD`
- **Scope:** PATCH `app/api/crm/listings/[id]/media-order/route.ts` (crm:-namespace partition + `skipped_trestle_keys` echo + audit count) · `lib/idx/media-sync.ts` (cron-internal static where-clause `NOT startsWith crm:`) · 3 test files · 1 doc trace.
- **Verdict: PASS ✅ — non-blocking.**
- AuthN/AuthZ — PASS. `assertWriteAllowed` → `requireAgentOrBroker` → 404 → ownership (`auth.role!=="BROKER" && listing.agent_id!==auth.userId` → 403) all run BEFORE any write; diff only touches code after line 65 (post-ownership). No reorder/bypass.
- Injection — PASS. `updateMany` equals-match on `media_key` (parameterized) STILL scoped by `listing_id: listing.listing_id` + `status:"active"` on every update (route.ts:74). Crafted `crm:OTHER-LISTING:x` cannot escape the listing_id scope → no cross-listing write. No raw SQL, no broadened where.
- Info disclosure — PASS. `skipped_trestle_keys` echoes the client's own submitted keys (partition of `ordered_media_ids`), not server enumeration; audit adds only a count. Zero new exposure.
- DoS — LOW (PRE-EXISTING, not introduced). `ordered_media_ids` has no length cap on main or this branch; auth-gated to agent/broker (not public). New `updates.length>0 ? $transaction : []` guard is a minor improvement. Non-blocking.
- media-sync.ts — PASS. Cron-only (CRON_SECRET route unchanged); added filter is a static const `crm:` prefix; no new input flow; tenant `listing_id` scope preserved on both branches.
- Secrets/env/headers/cookies/middleware/deps — none changed (verified by diff scan).
- ROLE-CASING — pre-existing repo-wide LOW; this route's exact-case `=== "BROKER"` is fail-closed (denies, never over-permits). Not introduced here.

**Critical: 0 · High: 0 · Medium: 0 · Low: 2 (DoS array-cap + role-casing — both pre-existing, non-blocking). Blocking deployment: No.**

---

## 2026-06-11 — P1C1 reset-sync RC2 media-stomp guard (release gate)
- **Branch:** `fix/p1c1-reset-sync-rc2` (HEAD 5be65199), diff `main...HEAD`
- **Scope:** POST `app/api/crm/listings/reset-sync/route.ts` (+9/-3: import `mediaUpdatePatch`; hoisted `const EXPAND_MEDIA=false`; UPDATE-branch `media: mapped.media` replaced by `...mediaUpdatePatch(mapped.media, EXPAND_MEDIA)`) · 1 new test `tests/runtime/reset-sync-media-stomp.test.ts` · 1 doc trace.
- **Verdict: PASS ✅ — non-blocking.**
- AuthN/AuthZ — PASS. `assertWriteAllowed`(19) → `requireBroker`(21) → `IDX_ENABLED`/`hasCredentials`(24) ordering UNCHANGED; both diff hunks (l.94, l.160) land entirely AFTER auth + OData-filter construction. No reorder/bypass.
- No new input flow — PASS. `EXPAND_MEDIA` is a literal `false`; `mediaUpdatePatch(x,false)` returns `{}` (lib/idx/sync.ts:34 — 2nd arg is the gate, not data), so the UPDATE spread injects nothing. No request-derived value enters the payload. OData filter quote-escaping (`replace(/'/g,"''"'")`, l.72/77) untouched; values are server-side agent MLS-id/license (not request body).
- Secrets/env/headers/cookies/middleware/deps — none changed. Sole `process.env` hit in diff is a test-local mock (`IDX_ENABLED` in `beforeEach`), not shipped code, not a secret.
- PRE-EXISTING (OUT of scope) — STEP 1 `deleteMany` of ALL listings + dependents (clean-slate, broker-auth, "one-time use"). Destructive-by-design; removal tracked as Maya decision OQ-1. Not introduced or worsened by this diff. Severity: pre-existing HIGH-by-design, not a finding against this PR.
- Tests — route-level mocked Trestle+Prisma: asserts UPDATE payload OMITS `media` key (RC2 contract) and CREATE still writes `media`. RED→GREEN behavioral.

**Critical: 0 · High: 0 · Medium: 0 · Low: 0 (1 pre-existing destructive-design item out of scope, OQ-1). Blocking deployment: No.**

---

## SECURITY GATE — 2026-06-11 — P1C4 CRM media MT-bump scope (branch `fix/p1c4-crm-media-mt-bump`, HEAD 559e2acb)

**Scope:** Committed diff vs main, 6 files. Additive pure helper `crmListingTouchData` (`lib/media/crm-media.ts`) + 3 CRM media routes swapping an unconditional `prisma.listing.update({data:{modification_timestamp:new Date()}})` for a guarded `const touch = crmListingTouchData(listing.last_synced_from_trestle); if (touch) await prisma.listing.update(...)`; each route's `select` widened by `last_synced_from_trestle`. + 1 test + 1 doc.
**Trigger:** Pre-merge release gate.
**Verdict: PASS ✅ — Critical 0 · High 0 · Medium 0 · Low 0. Non-blocking.**

- **AuthN/AuthZ unchanged, correct order (all 4 verbs):** every diff hunk lands AFTER `assertWriteAllowed` → `requireAgentOrBroker` → 404 → ownership 403. media-order touch@99 (auth 12-16, 404@41, own@46); [mediaId] DELETE touch@76 / PATCH touch@162 (both gate `isCrmMediaKey` then `resolveOwnedListing` 404+own@34-37, `.toUpperCase()`); upload touch@278 (auth 49-52, 404@69, own@74). No reorder/bypass.
- **No new input flow:** helper arg is DB-read column `last_synced_from_trestle` (DateTime?), never request-derived. Widened selects are server-side only; grep confirms the column appears ONLY in `select`/helper-arg, NEVER in any `NextResponse.json` body. Not PII. No leak.
- **Secrets/env/header/cookie/middleware/dependency:** none changed.
- **Skip-write abuse (Q4):** the touch is display/sync bookkeeping (sitemap `lastModified`, IDX disclaimer `lastUpdated`, portal ordering, ISR), NOT authz/session/audit-retention. `modification_timestamp` absent from `lib/auth` entirely. `logAuditEvent` still fires unconditionally per action, independent of the touch. Nothing security-relevant depended on the unconditional bump. The change is a *correctness* fix — closes a cursor-poison vector where bumping MT to local NOW on a Trestle-synced row advanced the idx-sync incremental cursor (`MAX(modification_timestamp) WHERE last_synced_from_trestle IS NOT NULL`, `getLastSyncTimestamp` sync.ts:1033) and skipped unprocessed feed records.
- **Note (pre-existing, not introduced):** `media-order` ownership uses exact-case `=== "BROKER"` (FAIL-CLOSED; lowercase-broker denied, never over-permitted). `[mediaId]` + `upload` use `.toUpperCase()`. Repo-wide casing LOW tracked separately.

**Critical: 0 · High: 0 · Medium: 0 · Low: 0. Blocking deployment: No.**

---

## 2026-06-11 — P1C3 media classifiers (branch fix/p1c3-media-classifiers, HEAD 8abc9597)
- **Scope:** lib/idx/mapping.ts (classifier swap), new pure lib/idx/agent-card-media.ts, route swap in PUBLIC GET app/api/agents/[slug]/listings/route.ts (inline loop → mapAgentCardMedia), 1 test (7/7 green), 1 doc. No secrets/env/header/cookie/middleware/dependency/config diff.
- **Verdict: PASS.** Pure-function extraction + canonical classifier reuse. Canonical classifyTrestleMediaCategory unchanged + pure. Public route public-by-design, no auth/token/$filter/$select/fetch change (those lines are context above the swap). records arg = already-fetched feed data; no new input flow. Output strictly narrowed (non-Photo excluded). No PII/secret/MLS-exposure delta; floorplan leak was display-correctness, not breach.

**Critical: 0 · High: 0 · Medium: 0 · Low: 0. Blocking deployment: No.**

## 2026-06-11 — P1C5 table-aware image metric + ghost-log line (branch fix/p1c5-table-aware-image-metric, HEAD 7f479dbf)
- **Scope:** app/api/cron/media-sync/route.ts (ONLY runtime route: one guarded console.log before success return), scripts/ops-health.js (CLI-only; 2 additive static SQL FILTER arms + 2 console.log int renders + local require), new pure scripts/media-image-health.js, 1 test, 1 docs trace. No env/header/cookie/dependency/package.json diff.
- **Verdict: PASS.** (1) Log line emits int count + result.ghost_listing_ids.join() — ListingId[] confirmed IDX Plus PUBLIC display field (rebny-rls-property-fields.csv), capped GHOST_ID_LOG_CAP=20 (media-sync.ts:1323) so length-bounded; no secret/PII/MLS-licensed-data leak, no log-flood. (2) CRON_SECRET timing-safe Bearer gate (route.ts L20-31) + 503 cred check + concurrency guard + catch-redaction all byte-identical to main; insertion is purely L99-106 between audit-write and return. (3) ops-health new FILTER arms 100% static SQL — zero ${} on any added SQL line; only added interpolations are 2 console.log human-renderer INTS; pre-existing R2_RETRY_EXHAUSTED_THRESHOLD interp untouched; 2 old alarm interps REMOVED. No new value reaches $queryRawUnsafe. (4) No process.env/NEXT_PUBLIC/cookie/header/dep added; only new module refs are first-party local require + node builtins in test. media-image-health.js is pure (no I/O/net/secrets).

**Critical: 0 · High: 0 · Medium: 0 · Low: 0. Blocking deployment: No.**

## 2026-06-11 — P1C6 feed-reconcile eligible orphans (branch fix/p1c6-feed-reconcile-eligible-orphans, HEAD 6bef6087)
- **Scope:** app/api/cron/feed-reconcile/route.ts (+88: new fetchTrestleEligibleNonActiveIds static-filter Pending/AUC fetch, orphan diff → union, media population on orphan-create via upsertListingMedia(tombstoneVanished:false)+updateListingMediaSummary, 4 counters, per-orphan audit standard_status), lib/idx/fetch.ts (comment-only jsdoc scope correction, NO code change), new tests/runtime/feed-reconcile-c6.test.ts (4/4 GREEN, ran 2026-06-11), 1 doc trace. media-sync.ts EMPTY diff (import-only). No package.json/lock/vercel.json/next.config/proxy.ts diff.
- **Verdict: PASS.** (1) CRON_SECRET timingSafeEqual gate (length-check + Buffer compare) UNCHANGED byte-identical, IDX_ENABLED!=="true" skip FOLLOWS, BOTH precede the try{}; new fetch runs post-auth inside try only. (2) New filter is a STATIC OData string literal — no request-derived input; orphan batch ids still flow through the UNCHANGED quote-doubled `ListingId eq '${id.replace(/'/g,"''")}'` (server-internal RLS ids, not attacker-reachable). (3) Media population reachability-verified: upsertListingMedia's vanished-tombstone block is gated entirely behind tombstoneVanished===true → UNREACHABLE with the PR's `false`; explicit MediaStatus='Deleted' tombstone can't fire (inline $expand pre-filters `MediaStatus ne 'Deleted'`) AND the target is a brand-new prisma.listing.create orphan with ZERO pre-existing media rows → no destructive surface regardless. rawMedia = feed payload (raw.Media), never request-derived. Media catch logs ListingId+message only, non-fatal+counted. (4) GHOST_ABORT_CAP(2000)/ORPHAN_ABORT_CAP(500)/ORPHAN_FETCH_BATCH(20) UNTOUCHED; broadened union computed BEFORE the 500-cap check → bounded by existing abort+broker-alert path. Ghost diff still Active-only (semantics byte-identical, test-locked). (5) No secrets/env/header/dependency change; TRESTLE_API_URL non-secret w/ public default, CRON_SECRET only in timing-safe compare, never logged/returned. Counters = ints; audit standard_status = public RLS status enum; ListingId = public IDX field. No PII/secret/MLS-licensed leak. fetch.ts = pure jsdoc scope-correction, zero behavior change.

**Critical: 0 · High: 0 · Medium: 0 · Low: 0. Blocking deployment: No.**


## SECURITY GATE — P1C6b chunked orphan catch-up — 2026-06-12

**Branch:** fix/p1c6b-chunked-orphan-catchup (HEAD e9b41b58) · **Verdict:** PASS ✅ (0 CRITICAL / 0 HIGH / 0 MED / 1 LOW)

**Scope:** `git diff main...HEAD` — 5 files: `app/api/cron/feed-reconcile/route.ts` (+70/-17), new pure `lib/idx/orphan-chunk.ts`, 2 tests (`lib/idx/__tests__/orphan-chunk.test.ts` new, `tests/runtime/feed-reconcile-c6.test.ts` amended), 1 doc. NO package.json/lock/vercel.json/next.config/proxy.ts/middleware diff (name-only confirmed).

**Trigger:** Pre-merge security gate on a cron-route change that removes an abort cap and raises maxDuration.

**Findings:**
- CRON_SECRET timingSafeEqual gate + IDX_ENABLED skip UNCHANGED, byte-identical canonical pattern, both precede try{} (route.ts:144-163). All new work post-auth.
- Write count HARD-BOUNDED at 300 creates/run by `chunkResult.chunk = eligible.slice(0,300)` — the removed ORPHAN_ABORT_CAP(500) is replaced by the slice itself; unbounded `orphanIds` feeds selectOrphanChunk ONLY, never drives writes. Plus 240s wall-clock loop budget. No runaway-cost vector.
- maxDuration 120→300 within Pro-plan ceiling (300s; project already ships 120s crons). Route-segment export wins over vercel.json glob(30); no per-path override → no conflict. (Class-D: plan inferred, not live-verified.)
- SANITY abort at totalEligible>5000 prevents feed-reset mass-import; 503 body carries ints only.
- No new request-derived input: chunk = pure set math; archive read = static `startsWith:"RLS"` parameterized Prisma filter (listing_id String? → route post-filters typeof==="string"). Orphan OData $filter unchanged (quote-doubled, server-internal RLS ids).
- Counters all ints/bools; no PII/secret in response or console.error (ListingId/HTTP-status only). Media path unchanged from P1C6 (tombstoneVanished:false, gated-skip, brand-new-create so no delete reachable).

**LOW (pre-existing, repo-wide, NOT introduced):** orphan OData `$filter` uses inline `replace(/'/g,"''")` quote-doubling vs canonical `sanitizeOData` — correct here (server-internal RLS ids, allowlist would corrupt legit keys), tracked since RC1.

**Blocking deployment:** No.

---

## 2026-07-01 — Full-repo pre-launch security audit (Security Agent)
**Scope:** All 284 `app/api/**` routes, auth system (`lib/auth/**`), edge pipeline (`proxy.ts` + `lib/middleware/**`), `lib/compliance/dto.ts` + `lib/idx/*-dto`, media proxy, 23 crons, secrets/PII repo scan, public/crm client JS, security headers. Method: 5 parallel subagent sweeps + core-module read + live read-only production probes.
**Verdict: FAIL for launch** — 1 CRITICAL + 3 HIGH open.

**CRITICAL**
- Trestle OAuth `client_id`/`client_secret` in git history commit `18e25077` (`scripts/test-trestle-geo.js`; deleted from tree, recoverable from history). Same as prior C1. Rotation at Cotality NOT verifiable from repo — confirm rotated + consider history purge (needs Maya approval; force-push hold).

**HIGH**
- Login brute-force: `lib/middleware/rate-limiter.ts:191` bypasses all rate limiting on presence of any `session_token` cookie; login route has no in-route limiter and no lockout. forgot/reset-password unthrottled (email bombing).
- `/admin` guard fail-open: `lib/middleware/route-guards.ts:74` `undefined===undefined` when `PRIVATE_COLLECTION_PASS` unset. LIVE: `GET /admin` + `/admin/login` = HTTP 200 unauth (no redirect). Latent full admin bypass; small blast radius today (only login page).
- `app/api/crm/commissions/route.ts:45-108` POST: `requireAgentOrBroker` (should be broker-only) + unscoped `deal_id` → cross-agent commission/1099 tampering.

**MEDIUM:** 12 crons fail-open if CRON_SECRET unset (incl. tenant-nurture email); login user-enumeration via distinct errors + bcrypt timing; portal PII leaks (agent/lead email to buyer/family via external-listing comments; family/invite existing-Lead disclosure + non-consensual link; buyer requester_lead_id to seller via showings metadata); media proxy unauthenticated w/ server Trestle token (content-type-gated).
**LOW:** 4 portal address returns skip `internet_address_display_yn` gate (REBNY §2.05); debug/media-health leaks 8-char token prefix (auth-gated); CSP `unsafe-inline`+CRM `unsafe-eval`; sessions not invalidated on password reset; `.env.local.backup-before-repoint` plaintext secrets on disk (gitignored).

**Live HTTP evidence:** `/crm/index-built.html` + `/crm/data/*.json` → 307 to login (gated, NOT world-readable). `/api/crm/leads` 401 (also 401 with forged cookie). `/api/health/env` 401. cron GET 401. `/api/auth/dev-login` 404. `/admin` 200 unauth (fail-open). `/api/listings` returns clean public-DTO JSON. Root headers: CSP+nonce, HSTS preload, COOP, X-Frame DENY, Permissions-Policy — all present.

**PASS areas:** No raw-MLS/PII leak on any listing route (DTO tiers + fail-closed gates verified). Auth primitives solid. CRM route auth/IDOR/mass-assignment model consistent and correct (one exception = commissions). Secrets: no NEXT_PUBLIC leaks, Trestle creds env-only in code, CRM client JS clean.

**Blocking deployment:** Yes — resolve CRITICAL + 3 HIGH first.
