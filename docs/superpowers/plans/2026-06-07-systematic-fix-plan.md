# Systematic Fix Plan — Test-Gated, Checkpoint-Driven (2026-06-07)

**Source of findings:** `docs/audits/repo-wide-audit-verification-2026-06-07.md`
(independent 9-agent sweep) + `docs/incidents/2026-06-06-system-root-cause-registry.md`.

**Maya's directive:** fix systematically; be tested **at every step**; if a fix affects
anything else, that regression must be **caught and fixed before moving on**. Tight plan,
explicit verification checkpoints.

**Governing rules (non-negotiable):** CLAUDE.md §F (proof-first), §G (validation chain),
§A.7 + §C (HELD surfaces need explicit Maya approval), §D (compliance-first reads), §J
(classify Codex/field claims). One step = one PR = one concern. Nothing starts without the
per-step "GO" from Maya.

---

## 0. The regression harness — run identically at EVERY checkpoint

This is the mechanism that "catches anything else affected." It is the same command set
every time, compared against a frozen green baseline.

### 0.1 The full gate (the "HARNESS")
```
npm run type-check          # 0 errors
npm run lint                # 0 errors
npm run test:runtime        # all green (currently 1997/1997)
npm run crm:test            # all green (39/39)
npm run test:scanner        # all green (after Step 0.2)
npm run ucba:audit          # 46/46, REGRESSIONS = 0
npm run compliance-check    # BLOCKER+STRICT = 0 failures
npm run rls:validate        # 0 errors
npm run idx:validate        # 0 critical   (note: writes validator-results.json artifact)
npm run audit:display-compliance
npm run build               # MANDATORY — Next/Vercel: type-check passing is NOT enough.
                            # Required on every step touching frontend/rendering/backend
                            # routes/config. (Note: `next build` rewrites tsconfig
                            # moduleResolution Node→bundler; revert that working-tree
                            # change after each run until Phase 5.3 pins it deliberately.)
```

### 0.2 The regression rule (applied after every single step)
1. Run the **entire HARNESS** — not just the test you added.
2. **Diff against the frozen green baseline** (Step 0.3). The pass-set must equal
   `baseline ∪ {this step's new test}`. **Any** new red = **STOP**, root-cause, fix or
   revert. The step is NOT done until the harness is green again.
3. For any **rendering / compliance / behavior** claim: add a **live preview-URL proof**
   (§F). Source-grep is explicitly insufficient. Capture the rendered evidence.
4. Every fix ships its **own regression test in the same PR** (failing-test-flips-green,
   §F). The baseline then ratchets up — the same break can never silently return.
5. Each step is **small, reviewable, revertible**. Merge only via the documented-waiver
   path (normal squash, no `--admin`, no force) and only when the sole red is the known-
   stuck `release-truth` PARTIAL.

### 0.3 Freeze the baseline (do this once, before any fix that changes behavior)
After Phase 0 greens the two RED gates, run the full HARNESS and commit the exact
pass-counts to `docs/audits/green-baseline-2026-06-07.md`. That file is the reference every
later checkpoint diffs against.

### 0.4 HELD-surface gate
Steps marked **🔒HELD** touch surfaces frozen in CLAUDE.md §A.7/§C
(`.github/workflows/**`, deps/build, `vercel.json` deploy/cron, env, Neon, `public/crm/**`).
They require an explicit, separate Maya approval **before that step starts** — not covered
by a blanket "go." Steps marked **🛡SEC** additionally require a `security-agent` PASS
(release blocker). Steps marked **⚖️COMPLIANCE** require reading the relevant canonical file
per §D **first**.

---

## Phase 0 — Green the baseline (zero behavior change, lowest risk) — DO FIRST

| Step | Fix | Risk | Checkpoint |
|---|---|---|---|
| **0.1** | **`type-check` RED.** Quarantine the orphaned test `lib/idx/__tests__/coverage-backfill-preview.test.ts`. **APPROVAL CONDITION (must prove orphaned before patching):** (a) show the failing type-check output; (b) show the missing import; (c) grep production (non-test) code for `coverage-backfill-preview`. **If no production reference → quarantine/delete with a TODO pointing at the HELD coverage-backfill PR. If a production reference exists → STOP and fix the implementation instead.** Note: `describe.skip` does NOT clear the TS2307 (the import still type-checks); must rename the file out of the `.ts` set (→ `.ts.disabled`) or delete it. | Test-only, none. | type-check exit 0. **VERIFIED 2026-06-07:** impl absent, 0 production refs, file UNTRACKED → quarantined to `.ts.disabled`. |
| **0.2** | **`test:scanner` RED.** Fixture rot — `suppression.test.ts` mock `ms-002` `expires_at:"2026-06-01"` is past `new Date()`. **DECIDED:** pass an **explicit deterministic `now`** (`new Date("2026-04-30")`, the fixture's canonical `captured_at`) into the two failing cases (lines 131-133, 166-169). **Do NOT bump the fixture date** — that re-creates the same rot later. Do NOT touch `suppression.ts` (proven sound). | Test-only, none. | `npm run test:scanner` green. |
| **0.3** | **Freeze baseline.** Run full HARNESS; commit exact counts to `green-baseline-2026-06-07.md`. | None. | **Entire HARNESS green.** This is now the invariant. |

**Gate to leave Phase 0:** every command in 0.1 is exit-0 / 0-regression. From here, any red is a regression *we* caused.

---

## Phase 0.5 — Production-cut guardrails (MOVED EARLIER per Maya) — 🔒HELD + 🛡SEC

**Rationale:** these are NOT routine infra cleanup — they are **production-rebreak
prevention**. They belong immediately after Phase 0 and **before** any feature/compliance
work, as a separate HELD-approval safety PR. Safe because it is **pure guard code + tests,
with ZERO live mutation**: no dispatch, no env write, no secret write, no cron schedule
change, no Neon/Vercel API call.

| Step | Fix | Checkpoint |
|---|---|---|
| **0.5.1** | **Hard-guard `rotate-db-keys.yml`.** Add a fail-closed host assertion that refuses unless the resolved target is `hidden-mountain-87248164` / `ep-cold-waterfall-adno3ao2` (currently `PROJECT_ID` comes from `NEON_PROJECT_ID` → dead `morning-bread`, with NO host check before it writes `DATABASE_URL`/`ASSISTANT_DATABASE_URL`/`DATABASE_URL_UNPOOLED` to GitHub secrets + Vercel prod). **Template already in-repo:** `cleanup-neon-preview-branch.yml:126` does exactly this refuse-unless-hidden-mountain check. Schedule stays commented; `workflow_dispatch` stays the only trigger but now aborts on wrong host. | Guard unit-tested (wrong host → non-zero exit, no write reached) on a dry-run. **No live dispatch.** security-agent PASS. |
| **0.5.2** | **Hard-guard `neon-branch-prune`** (the `vercel.json` cron, distinct from the GH cleanup workflow which is already guarded). Assert the prune target project id == `hidden-mountain-87248164` before any prune; refuse on ambiguous/`morning-bread` `NEON_PROJECT_ID`. | Guard unit-tested (wrong/ambiguous id → refuse) + dry-run review. **No live prune, no schedule change.** security-agent PASS. |

**Hard restrictions for 0.5 (verbatim Maya):** no dispatch, no env write, no cron schedule
change. Pure guard code + tests only. **`rotate-db-keys` must not be dispatched.**

---

## Phase 1 — Compliance P0 (test-first, code-path) — ⚖️COMPLIANCE

| Step | Fix | Checkpoint |
|---|---|---|
| **1.1** | **Coming Soon badge missing on detail DB path.** Read REBNY UCBA Art. I §16(C) canonical first. Write a failing test asserting the DB-path DTO sets `_displayCompliance.comingSoon` + `comingSoonDate` for a ComingSoon listing. Fix: make `fetchFromDB` (`app/listing/[...slug]/page.tsx:653-657`) adopt the `isComingSoonStatus`-derived block already in `dbListingToPublicDTO` / `public-dto.ts:507-511` (ideally call the canonical builder rather than the inline DTO). | New test green + **full HARNESS green** + **live preview probe**: a ComingSoon listing detail page renders the "No Showings/Open House" badge. |
| **1.2** | **FARE Act single-point-of-failure.** Read FARE Act canonical first. Failing tests for `listingType` derivation: a rental whose DB `listing_type`≠`'rent'` / Trestle `PropertyType` lacks `lease` must NOT silently drop the FARE block. Harden the derivation (defensive rental detection) and add `FareActFeeBadge` to `SplitCard` (`SearchListingCard.tsx:449-504`). | Tests green + HARNESS green + **live preview probe on a real rental** showing the FARE disclosure paragraph (the §F gap the 2026-05-20 A4 audit flagged — grep is not proof here). |

**Gate:** both P0 disclosures proven rendering on a live preview URL, HARNESS green, new tests permanent.

---

## Phase 2 — Silent data-loss / lead-capture (P1) — ⚖️COMPLIANCE

| Step | Fix | Decision/checkpoint |
|---|---|---|
| **2.1** | **Missing routes `/api/favorites/sync` + `/api/analytics/event`.** **DECIDED (Maya): BUILD the routes, do NOT remove the callers** (they are real lead/behavioral capture paths). §D compliance read first. **Required on each route:** (1) rate limit; (2) consent where lead data is stored; (3) no PII leak; (4) schema contract test (frontend POST body == backend schema); (5) audit event if it mutates lead/client/business data. | Routes exist + all 5 requirements met + contract test + HARNESS green. |
| **2.2** | **Fair-Housing render-time scan gap.** Third-party IDX `publicRemarks` rendered verbatim (`page.tsx:1550-1563`); scanner is write-path only. Wrap the render in the read-path scanner (mask/flag prohibited terms). | Failing test (remark w/ prohibited term → masked) green + HARNESS green. |
| **2.3** | **Footer §175.25 wholesale-replace.** `Footer.tsx:61` replaces all settings on any payload with `companyName`. Add per-field fallback so `license`/`address`/`phone` never blank. | Test (settings payload missing license → footer still shows canonical `10991205323`) green + HARNESS green. |

---

## Phase 3 — Auth / security hardening (P1) — 🛡SEC

| Step | Fix | Checkpoint |
|---|---|---|
| **3.1** | **`auth/login` brute-force.** Add `checkRouteRateLimit` + failed-attempt lockout to login (and forgot/reset/change-password, agent/register). Reuse the existing limiter. | Test (N+1 attempts → 429) green + HARNESS green + **security-agent PASS**. |
| **3.2** | **Ethics gate.** **DECIDED (Maya): do NOT enforce globally on every `requireAgentOrBroker` request.** Enforce ONLY on compliance-affecting surfaces: (a) listing create/update affecting RLS/public display; (b) listing submission/publish/syndication; (c) IDX/RLS-affecting mutations; (d) broker approval of listing compliance where agent eligibility matters. **Elsewhere show warning/dashboard state, never block** — an expired agent must still view compliance status and fix profile/admin issues. | Tests: expired-training agent BLOCKED on (a)-(d), but NOT blocked from read/profile/admin-fix surfaces (sees warning) + HARNESS green + security-agent PASS. |

---

## Phase 4 — Correctness / data-fidelity (P1/P2, code-path)

| Step | Fix | Checkpoint |
|---|---|---|
| **4.1** | **Media classifier divergence.** `lib/idx/mapping.ts:335` `mapRESOToInternal` must call the canonical `classifyTrestleMediaCategory` (handles `"FloorPlan"` no-space) instead of inlining `includes('floor plan')` — stops floorplan-as-photo/hero on the live Trestle-direct path. | Failing test (Trestle `MediaCategory:"FloorPlan"` → classified floorplan, not hero) green + HARNESS green + live probe on an affected listing. |
| **4.2** | **Move-in fee DTO asymmetry.** `toPublicDTO` omits `moveInCostsAmount/Comments` that `dbListingToPublicDTO` sets — same listing discloses FARE fee on one path, not the other. Reconcile the two builders. | Test (both builders emit identical move-in fee fields) green + HARNESS green. |
| **4.3** | **Unbounded public `findMany`.** Add explicit `take` to `app/sitemap.ts:80` and `app/api/open-houses/route.ts:270`. | Test/assert bounded + HARNESS green. |
| **4.4** | **CRM cap outliers.** Normalize 500/1000 caps (communications, ce-courses, referrals, growth-tools, listing-engagement, idx/search) to the 200 standard + NaN guards. | Test (oversized `?limit=` clamps; `?limit=abc`→default) green + HARNESS green. |
| **4.5** | **Orphaned `media-backfill` cron route.** **DECIDED (Maya): do NOT delete or reschedule blindly.** (1) **Correct the false "runs every 8 min" comments FIRST** (`listings/route.ts:499`, `sync.ts:817`). (2) Keep the route **unscheduled** unless a separate media-backfill recovery plan proves it safe. (3) Delete only after proving **no cron, no frontend, no ops docs, and no runbook** still reference it. | Stale comments corrected + reference-sweep evidence (cron/frontend/docs/runbook all clear) before any delete + HARNESS green. 🔒 if re-scheduling. |

---

## Phase 5 — Accessibility + frontend hygiene (P2)

| Step | Fix | Checkpoint |
|---|---|---|
| **5.1** | **Nested `<main>` ×50.** Strip page-level `<main>` tags; keep only the layout `<main id="main-content">`; remove redundant `role="main"` (`app/page.tsx:38`). Do in **batched, surface-grouped PRs** (e.g. portal, search, listing, marketing) — not one mega-diff — each behind the HARNESS. | Per batch: `frontend-auditor` pass (single landmark, skip-link target unambiguous) + HARNESS green + spot live probe. |
| **5.2** | **Contact form a11y.** Add native `required`/`aria-required`/`aria-invalid` to `app/contact/page.tsx` required fields (324/350/394). | Test/axe assert + HARNESS green. |
| **5.3** | **Stock image hosts.** Remove `picsum.photos`/`images.unsplash.com` from `next.config.js` allowlist + CSP mirror; replace any public-page usage. | Build green + grep clean on public pages + HARNESS green. 🔒 (build/CSP). |

---

## Phase 6 — HELD infra: deps, CI, headers, Neon landmines — 🔒HELD + 🛡SEC

**None of these start without explicit, separate Maya approval per item.** Sequenced last
because they're highest-blast-radius and frozen by §A.7/§C.

| Step | Fix | Checkpoint |
|---|---|---|
| **6.1** | **`next` ≥16.2.6** (auth-bypass + SSRF) + axios/protobufjs/tmp/fast-xml-builder remediation. | `npm audit --omit=dev` high=0 (or documented) + **full HARNESS** + `next build` green + preview smoke + security-agent PASS. |
| **6.2** | **Security-header conflict.** Delete the stale `vercel.json` headers block (94-114) so `lib/middleware/security-headers.ts` is the genuine single source (fixes the divergent Permissions-Policy). | security-agent header probe on preview: exactly one `Permissions-Policy`, correct value + HARNESS green. |
| **6.3** | **CI migration discipline.** Replace `prisma db push --accept-data-loss` (`pr-check.yml:94`) with `migrate deploy`; wire `validator:migration`; make non-blocking SQL/seed steps blocking where correct; reconcile seed `ts`/`js`; make `release-truth` blocking once unstuck. Read NEON.md first. | A test PR's CI actually runs the 23 migrations + goes green; validator wired + failing on synthetic drift. |
| **6.4** | **Production-cut landmines.** Re-target or hard-guard `rotate-db-keys` (still points at dead `morning-bread`); add a `NEON_PROJECT_ID`/host guard (must contain `ep-cold-waterfall-adno3ao2`) to `neon-branch-prune`; **do NOT dispatch `rotate-db-keys`.** Read NEON.md + ownership map first. | Guard unit-tested (wrong host → refuse) + dry-run review. **No live cron dispatch.** |
| **6.5** | **Observability.** Re-enable Sentry source maps once `SENTRY_AUTH_TOKEN` provisioned; decide on client-Sentry (React-18 pin makes the original crash rationale worth re-checking). | Sentry receives a mapped test error on preview. 🔒 env. |

---

## Phase 7 — Verify the UNVERIFIED before touching them (read-only first)

The pasted "brutal" audit's CRM/portal claims are **plausible but unproven**. Do a read-only
code trace for each, write findings, THEN plan fixes — never fix blind.

- Portal offers: `ClientListingAction` blob vs relational `Offer` model.
- Broker impersonation: do downstream writes carry `impersonated_by_broker_id`?
- `requireWorkspace()` uniformity on portal writes; portal write rate-limits.
- Outlook import scaling / rate limits.
- CRM panels (seller prospects persistence, pitch-packet Save Comps, lease Add-Lease,
  approval queue, commission mutations) — durable backend writes vs local-only.
- Rental `applications_count` real model.
- Agent row-isolation: introduce `requireOwnedByOrBroker` if traces confirm fragility.

Each → its own findings doc → its own test-first mini-plan under this same harness.

---

## Sequencing summary & dependencies

```
Phase 0 (green baseline)  ──►  everything else (hard prerequisite)
Phase 1 (P0 compliance)   ──►  independent, do first after 0
Phase 2 (lead-loss)       ──►  2.1 needs a build/remove decision
Phase 3 (auth)            ──►  3.2 needs an enforcement-policy decision
Phase 4 (correctness)     ──►  independent
Phase 5 (a11y/hygiene)    ──►  5.1 batched, not one diff
Phase 6 (HELD infra)      ──►  each item separately Maya-approved; 6.1 first (security)
Phase 7 (verify unknowns) ──►  read-only, can run in parallel anytime
```

**Decision gates that block their step until Maya answers:** 2.1 (build vs remove routes),
3.2 (where ethics enforces), 4.5 (media-backfill route fate), plus every 🔒HELD item.

## Holds / scope
Report-and-plan only. No code, DB, migration, cron, env, R2, or workflow change made.
`rotate-db-keys` will not be dispatched. Each step above begins only on an explicit per-step
Maya "GO." The harness + frozen baseline is what guarantees "anything else affected is caught
and fixed before moving on."
