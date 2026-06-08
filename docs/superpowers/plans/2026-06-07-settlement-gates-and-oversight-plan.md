# Settlement Plan — Gates, Checks & Oversight Control Plane (2026-06-07)

**Purpose (Maya directive):** a complete plan based on *what is not working*, with the
gates/checks to make sure everything settles correctly, and an **oversight-agent control
plane** verifying every fix at the **micro** (per-change) and **macro** (whole-system)
levels. **Compliance-bound throughout.**

**Status:** PLAN ONLY. Nothing executes. Every phase is HELD behind an explicit per-step
Maya GO. Builds on `2026-06-07-systematic-fix-plan.md` (Phases 0/0.4/0.5 already shipped) and
the verified findings in `docs/audits/repo-wide-audit-verification-2026-06-07.md` +
`docs/incidents/2026-06-06-system-root-cause-registry.md`.

**Three non-negotiables (CLAUDE.md):** §F proof-first (failing-test-flips-green or live URL
proof — never grep alone), §G validation chain, §D compliance-first (read the canonical file
BEFORE touching any §D surface).

**Sentinel-L is NON-FUNCTIONAL — excluded from every gate.** It is not a check, not a
dependency, not a prerequisite, and is **never cited as evidence** anywhere in this plan. We
do **not** wait on it, build a canary for it, or block on it. (If it is ever rebuilt, that is
a separate, independently-verified task — it does not gate this work.)

**No work in the dark (the core rule of this plan).** Every change passes TWO concrete,
pass-required evaluation points before anything advances: a **MICRO** gate (is the change
locally correct?) **and** a **MACRO** gate (how does this change affect the *whole system*?).
A change that has not had its system-wide blast radius mapped and re-verified is not done —
regardless of how green its local tests are.

---

## PART A — The verified problem ledger (what is NOT working)

Only CONFIRMED, code-proven items. Each row: defect · severity · compliance tie · owning
phase · current status. (Class per §J; B/C/D items still need a live proof before any fix.)

### A1. Compliance-critical (must gate hardest)
| # | Defect | Sev | Compliance | Phase | Status |
|---|---|---|---|---|---|
| CC1 | Coming Soon badge not set on detail **DB path** (`page.tsx:653-657` inline DTO omits `_displayCompliance.comingSoon`) | P0 | REBNY UCBA Art. I §16(C) | 6 | OPEN |
| CC2 | FARE Act block gated solely on `listingType==='rent'` — a mis-typed rental shows **no** disclosure | P0 | NYC LL 119/2024 (DCWP §20-699.22) | 6 | OPEN (live rental probe required) |
| CC3 | Third-party IDX `publicRemarks` rendered verbatim; prohibited-term scan is write-path only | P1 | Fair Housing (Fed/NY/NYC) | 6 | OPEN |
| CC4 | Footer settings wholesale-replace could blank license/address | P1 | NY DOS §175.25 | 6 | OPEN |
| CC5 | DOM plumbed from raw `DaysOnMarket`, never UCBA-computed (latent — not rendered today) | P2 | UCBA Art. I §11 | 6 | LATENT |
| CC6 | REBNY access-audit write swallowed (`logTrestleAccess` catch) | P1 | 12-mo MLS-access retention | 2 | OPEN |
| CC7 | `/api/favorites/sync` lead-capture POST → 404 (route missing) | P1 | TCPA/consent + lead routing (§D) | 2 | OPEN |

### A2. The meta-disease (held refactor + incremental-only sync)
| # | Defect | Sev | Phase | Status |
|---|---|---|---|---|
| M1 | 3+ writers fight `Listing.media` JSON; denorm/projection columns written, read by nobody; 5 JSON cols never dropped | P1 | 5 | HELD (PR-4/5B/10) |
| M2 | Sync is incremental-only (no full/reconcile pass), capped 1000/call + 120s + Active-only → media starvation, incomplete inventory, stale status/gates/price | P1 | 3 | OPEN |
| M3 | Media classifier divergence — `mapping.ts:335` classifies Trestle `FloorPlan` as Photo on the live render path | P1 | 4 | OPEN |
| M4 | Coverage gap: ~8,568 displayable listings with no active `listing_media` | P1 | 8 | OPEN (backfill HELD) |

### A3. Silent failures / blind observability
| # | Defect | Sev | Phase | Status |
|---|---|---|---|---|
| SF1 | Sync/media crons log `status=ok` while broken | P1 | 2 | OPEN |
| SF2 | `/api/analytics/event` missing → all first-party analytics silently dropped | P2 | 2 | OPEN |
| SF3 | DB-outage → silent Trestle fallback | P2 | 2 | OPEN |
| SF4 | `refused` neon-prune now surfaced (Codex) | — | 0.5 | **DONE (#371)** |

### A4. Search correctness
| # | Defect | Sev | Phase | Status |
|---|---|---|---|---|
| S1 | Dedup-after-pagination → cross-page duplicate cards | P1 | 4 | OPEN |
| S2 | `total`/`hasMore` from undeduped count | P2 | 4 | OPEN |
| S3 | DB path silently drops `propertyType` + `bounds` (map "search this area" no-op) | P1 | 4 | OPEN |

### A5. Auth / security
| # | Defect | Sev | Phase | Status |
|---|---|---|---|---|
| AS1 | `auth/login` no rate-limit / lockout (credential stuffing) | P1 | 3 | OPEN |
| AS2 | Ethics gate not enforced per-request (scoped enforcement DECIDED) | P1 | 3 | OPEN |
| AS3 | `next@16.2.4` auth-bypass + SSRF advisories | P1 | 6→deps | OPEN (HELD) |
| AS4 | vercel.json ↔ proxy.ts divergent `Permissions-Policy` (stale header block) | P1 | 6 | OPEN (HELD) |

### A6. CI / infra discipline
| # | Defect | Sev | Phase | Status |
|---|---|---|---|---|
| CI1 | `prisma db push --accept-data-loss` in CI; `validator:migration` not wired; release-truth non-blocking | P1 | 7 | OPEN (HELD .github) |
| CI2 | rotate-db-keys / neon-branch-prune unguarded production-cut landmines | P1 | 0.5 | **DONE (#371)** |
| CI3 | db-keepalive ineffective (15m vs 5m suspend); orphaned media-backfill route; no VACUUM cron | P2 | 4/9 | OPEN |

### A7. Frontend / a11y
| # | Defect | Sev | Phase | Status |
|---|---|---|---|---|
| FE1 | Nested `<main>` ×50 + redundant `role="main"` | P1 a11y | 5 | OPEN |
| FE2 | Contact form required fields lack `required`/`aria-required` | P2 | 5 | OPEN |
| FE3 | `picsum.photos`/`unsplash` in prod image allowlist | P2 | 5 | OPEN (HELD build) |

### A8. UNVERIFIED — trace before any fix (Phase 7, read-only first)
Portal offers model (`ClientListingAction` vs `Offer`) · impersonation per-write provenance ·
`requireWorkspace` uniformity · portal-write rate limits · Outlook scaling · CRM panel
durability · rental `applications_count` · agent row isolation. **No fix until a code trace
produces a findings doc.**

---

## PART B — The gate system (concrete evaluation points)

Five layers. Layers 0-3 are the **MICRO** evaluation point (local correctness). Layer 4 is the
**MACRO** evaluation point (whole-system impact). **Both must PASS, in order, before any change
merges and before any phase advances.** These are hard gates with explicit checklists — not
advisory. A phase is "settled" only when its macro layer signs off with live proof and zero
cross-system regressions.

> **Advancement rule:** MICRO green → run MACRO → MACRO green → only then merge/advance. If
> MACRO surfaces an effect on another surface, that surface's gate runs too, and the change is
> not done until every affected surface is re-verified. Skipping the macro evaluation = working
> in the dark = not allowed.

### B0. Layer 0 — The harness (every commit) — the regression floor
The §G chain **plus** `type-check` and `build`, run identically every time and **diffed
against the frozen baseline** (`docs/audits/green-baseline-2026-06-07.md`):
```
type-check · lint · test:runtime · crm:test · test:scanner · ucba:audit
compliance-check · rls:validate · idx:validate · audit:display-compliance · build
```
**Rule:** pass-set must equal `baseline ∪ {this step's new tests}`. Any red beyond the one
accepted exception (`idx:validate`: `/api/cron/media-backfill not scheduled`) = a regression
→ STOP. Each fix ships its own failing-test-flips-green; the baseline ratchets up.

### B1. Layer 1 — The compliance gate chain (mandatory for any §D surface)
Before merging anything touching a §D surface (listings, IDX/RLS, search, CRM lead-flow,
intake forms, advertising text, attribution, disclosures, display gates, status transitions,
media): read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` → the area's canonical file
FIRST, then run + require green:
`ucba:audit` (0 regressions) · `rls:validate` (0 errors) · `idx:validate` (0 critical
beyond the known exception) · `compliance-check` (0 BLOCKER+STRICT) · `crm:test` (if
`public/crm/**`). **Fail-closed (§E): unclear/conflicting/missing canonical rule → STOP and
report, do not guess.**

### B2. Layer 2 — Live proof (§F) for any rendering/behavior claim
Source-grep is NEVER sufficient for "does it render / behave." Each such fix attaches one of:
a failing test the fix flips green · a live preview-URL capture · a Vercel runtime log. The
CC1/CC2 compliance P0s **require a live rental/Coming-Soon preview capture** to close.

### B3. Layer 3 — Micro oversight agents (per-PR, by change-type) — PART C1
The change-type→agent matrix. Completes the **MICRO** evaluation point: the change is locally
correct, reviewed, and compliance-clean. Detailed in PART C1.

### B4. Layer 4 — MACRO evaluation point (per change) — "how does this affect the whole system?"
A **mandatory, per-change** assessment (verified by the macro-oversight agent, PART C2) that
must PASS before merge. Produces a written **blast-radius record** and re-verifies every
surface the change can reach. The concrete checklist (all must be answered + green):

1. **Blast-radius map** — list every module / route / DB column / data-path / **downstream
   consumer** the change can affect, direct AND transitive (the §J.5 end-to-end trace: live
   field → select → mapper → raw_data → DB-DTO path → Trestle-direct DTO path → render → form
   hydrate → tests). Unknown reach = STOP and trace first.
2. **Cross-domain check** — does it touch any of: search · media · sync · CRM/lead-flow ·
   portal · auth · compliance-display · status/gates · attribution? For **each** touched
   domain, run that domain's gate (and its micro agent) — not just the change's "home" domain.
3. **Cross-ledger check** — does this change move, mask, or regress **any other** Settlement
   Ledger row (PART D)? A fix that silences a symptom elsewhere is flagged, not hidden.
4. **Whole-harness diff** — full B0 pass-set vs the frozen baseline (catches collateral reds).
5. **Whole-surface compliance** — `tristle-rebny-compliance` over the *whole* surface, not the
   local area (a media change can break attribution; a search change can break display gates).
6. **Macro sign-off** — the macro-oversight agent records the blast-radius, confirms every
   affected surface re-verified green, and writes the result to the change's PR + the ledger.

**A change with an unmapped or unverified macro effect is NOT done.** No merge, no advance.

---

## PART C — Oversight control plane (micro + macro agents)

A two-tier control plane. **Micro** = per-change, pre-merge, blocks the PR. **Macro** =
per-phase + scheduled, blocks "settled" and catches cross-cutting/drift. Every agent is
**report/verify-first** unless it is a named release gate. All are invoked **only with Maya
GO** for the phase they serve.

### C1. MICRO oversight — per-PR, by change-type (fires before merge)
A change-type → required-agent matrix. A PR cannot be called done until each required agent
returns PASS (or its findings are resolved + re-run).

| Change touches… | Required micro agents (in order) | Blocks merge? |
|---|---|---|
| **Any §D compliance surface** | `tristle-rebny-compliance` (final release gate) | **YES — must PASS** |
| **Search filters / results / field-map** | `rebny-search-compliance-auditor` → `tristle-rebny-compliance` | YES |
| **Auth / API routes / portal / secrets / headers / AI endpoints** | `security-agent` (release blocker) | **YES — must PASS** |
| **Any UI page/component** | `frontend-auditor` | YES (a11y/disclosure/CTA) |
| **Frontend↔backend wiring (forms, search fetch, dashboards)** | `frontend-flow-verifier` | YES (contract + no leak) |
| **Any code change (always)** | `pr-review-toolkit:code-reviewer` + `:silent-failure-hunter` | YES (no new silent failures) |
| **New/changed types** | `pr-review-toolkit:type-design-analyzer` | advisory |
| **New/changed tests** | `pr-review-toolkit:pr-test-analyzer` | YES (coverage of the fix + edge cases) |
| **New/changed comments/docs** | `pr-review-toolkit:comment-analyzer` | advisory |
| **Cloud PR review (existing)** | CodeRabbit + Codex (already wired) | Codex Class-A findings actioned per §J |

**Micro exit rule:** harness green (B0) + compliance chain green (B1) + live proof (B2 if
applicable) + every "YES" agent PASS. Only then is the PR mergeable (documented-waiver path
when the sole red is the known-stuck `release-truth` PARTIAL).

### C2. MACRO oversight — per-change + per-phase + scheduled (gates "settled")
The macro-oversight layer. The **system-impact verifier runs on EVERY change** (enforcing the
B4 macro evaluation); the rest gate phase-close and run on a schedule. **Sentinel-L is excluded
— it is non-functional and appears in no gate.**

| Agent / mechanism | Cadence | What it verifies (macro) | Output / gate |
|---|---|---|---|
| **System-impact verifier** (the per-change macro gate) | **every change, pre-merge** | Builds + records the B4 blast-radius; runs each touched domain's gate; confirms no other ledger row regressed; runs whole-surface `tristle`; the "no work in the dark" enforcer | **PASS required to merge** + blast-radius record on the PR |
| **`repo-audit-bot`** (report-only) | per-phase close + weekly | Deep cross-cutting audit: did the phase's fixes hold? any new drift, silent failure, or compliance regression vs the prior report? | dated report under `memory/audits/` |
| **Settlement verifier** | per-phase | Every ledger row owned by the phase is green (harness ✓ + compliance ✓ + live proof ✓ + micro ✓ + macro ✓); updates the Settlement Ledger | ledger rows → SETTLED |
| **Baseline regression-diff** | every harness run | full pass-set vs frozen baseline; flags any new red | pass/fail |
| **`tristle-rebny-compliance`** (final release gate) | every change touching §D + before every deploy | whole-surface compliance PASS — IDX/RLS display, attribution, disclaimers, FARE, Fair Housing, NY DOS, data security | PASS/FAIL (merge + deploy blocker) |

### C3. The oversight loop (micro → macro → settle)
```
per change:   [MICRO]  TDD fix → B0 harness → B1 compliance → B2 live proof → C1 micro agents
              [MACRO]  → B4 system-impact verifier (blast-radius + every touched domain's gate
                         + cross-ledger check + whole-surface tristle)
              → BOTH green → merge.  Either red → STOP, do not advance.
per phase:    all phase PRs merged → repo-audit-bot + settlement verifier
              → all phase ledger rows SETTLED with proof → phase CLOSED; else reopen the red row
whole system: every phase CLOSED + final whole-surface tristle PASS + every ledger row SETTLED
              → SETTLED.  (No Sentinel dependency — it is excluded.)
```

---

## PART D — The Settlement Ledger (single source of "is it settled")

A tracked table (to live at `docs/audits/settlement-ledger-2026-06.md`, created when Phase 1
starts) with one row per ledger defect (PART A). Columns:
`id · defect · severity · compliance-tie · owning-phase · gate(s) · proof-artifact ·
micro-agent-signoffs · macro-signoff · status(OPEN/IN-PR/VERIFYING/SETTLED)`.
**A row is SETTLED only when:** its fix merged · harness green · compliance chain green · live
proof attached · all required micro agents PASS · macro (repo-audit-bot + tristle) confirm no
regression. The macro layer owns this ledger; "the system is settled" ≡ **all rows SETTLED**.

---

## PART E — The remediation roadmap (phases, gates, oversight per phase)

Updated master order. Each phase lists: scope · compliance reads · exit gate · oversight
sign-off. **DONE** = shipped; **HELD** = needs explicit Maya GO to start.

- **Phase 0 — Green baseline.** DONE (#370). Exit: harness green except 1 known exception. ✓
- **Phase 0.4 — Un-blind compliance-check.** DONE (#370). ✓
- **Phase 0.5 — Production-cut guardrails.** DONE (#371, incl. Codex ops-health fix). Macro
  sign-off pending #371 settle. ✓ (settling)
- **Phase 1 — Measure + confirm (read-only).** Run `trestle-listing-count`, integrity SQL
  packs, the live Class-B Trestle probe; trace all A8 UNVERIFIED items into findings docs;
  stand up the Settlement Ledger. *Gate:* read-only proofs captured. *Oversight:* repo-audit-bot
  baseline. **HELD.**
- **Phase 2 — Stop the silent failures (SF1-SF3, CC6, CC7).** Make crons fail loud; build
  `/api/favorites/sync` + `/api/analytics/event` (consent + rate-limit + no PII + contract
  test + audit — §D); un-swallow the access-audit. *Compliance reads:* CRM lead-routing,
  audit-retention, TCPA. *Gate:* B0+B1+B2; *Micro:* security-agent + silent-failure-hunter +
  frontend-flow-verifier + tristle; *Macro:* B4 system-impact (crons + lead-flow + audit
  surfaces re-verified). (Sentinel is excluded — not rebuilt or relied on here.) **HELD.**
- **Phase 3 — Rebuild sync as full+reconcile (M2) + auth hardening (AS1, AS2).** *Compliance
  reads:* IDX Plus display gate, status semantics, ethics. *Gate:* B0+B1; reconcile proof on
  a probe set; security-agent PASS. **HELD.**
- **Phase 4 — Search correctness (S1-S3) + media classifier (M3) + cron hygiene (CI3).**
  canonicalize-before-paginate; restore propertyType/bounds; one media classifier. *Micro:*
  rebny-search-compliance-auditor + frontend-flow-verifier + tristle. **HELD.**
- **Phase 5 — Complete the held refactor (M1) + a11y/hygiene (FE1-FE3).** one writer → typed
  reader → drop JSON → VACUUM; strip nested `<main>` (batched); form a11y; image allowlist.
  *Micro:* frontend-auditor + type-design-analyzer + tristle. **HELD.**
- **Phase 6 — Compliance fixes (CC1-CC5) + headers (AS4).** the two P0s with **live rental /
  Coming-Soon proof**; Fair Housing render scan; footer attribution fallback; Permissions-Policy
  single-source. *Micro:* tristle (must PASS) + security-agent (headers). **HELD.**
- **Phase 7 — CI discipline (CI1) + deps (AS3).** migrate-deploy in CI; wire validator:migration;
  release-truth blocking; bump next ≥16.2.6. *HELD .github/deps + security-agent.* **HELD.**
- **Phase 8 — Coverage + denorm backfill (M4).** only after 2-5 land; dry-run preview → execute
  as separate approved PRs. **HELD.**
- **Phase 9 — Repoint cleanup.** retire stale config; confirm db-keepalive/VACUUM. **HELD.**

**Ordering invariant:** Phase 2 (loud failures) before 3 (rebuild) before 4 (search) before
5 (refactor) before 8 (backfill) — you cannot safely rebuild/backfill while failures are
silent or the data model is contested. Compliance P0s (Phase 6) may be pulled earlier as
standalone test-first PRs if Maya prioritizes legal exposure (CC1/CC2) over sequence.

---

## PART G — Anti-skip enforcement (how we keep agents on point)

The failure mode: an agent *says* a step passed without running it, or rationalizes skipping.
Defense in depth — **none of these rely on the agent being honest or diligent.** Each gate is
machine-verifiable, independently checked, and fail-closed.

### G1. The gate is the exit code, not the narrative (machine-enforced)
- Wire the full harness (B0) + compliance chain (B1) into CI (`pr-check.yml`) as **required
  status checks**. With branch protection, a red required check **cannot be merged** — the
  agent has no discretion. "I ran it" is irrelevant; the check's exit code is the gate. *(HELD:
  editing `.github/workflows/**` — needs Maya GO; this is the single highest-leverage control.)*
- **CI parity:** the same harness runs locally AND in CI, so a local "green" is re-verified by
  an independent run. Divergence is caught, not trusted.

### G2. Evidence-or-it-didn't-happen (artifact-presence checks)
For the steps CI can't run directly (live-URL proof, compliance reading, the macro blast-radius),
require a **tangible artifact** and fail the PR if it's absent:
- Every render/behavior claim → a failing-test-that-flips-green **in the same PR** (§F) or a
  committed live-URL capture under `proof/`. No artifact → gate fails.
- Every §D change → a **citation line** naming the canonical compliance file read (a CI grep
  fails the PR if the touched surface has no citation).
- Every change → a committed **Correction Trace Record** (`docs/audits/corrections/<id>.md`,
  template at `corrections/_TEMPLATE.md`) capturing **every step** (RED→fix→GREEN→gates→
  sign-offs→trace-back) + a **Settlement Ledger row update**. The record is committed *in the
  same PR* so the full trail lives in git and can be replayed from scratch (§8 of the record).
- A correction with no complete, green Trace Record is **not done**.
- A CI "evidence gate" step greps the PR for these and **fails closed** if missing.

### G3. Independent, adversarial verification (no self-marking)
- The agent doing the work **never signs off its own gate.** A **different**, report-only
  scoped agent (the micro reviewers + the macro system-impact verifier) checks it — and is
  **prompted to refute** ("find the skipped step / the unmapped effect"), not to approve.
- High-risk changes (compliance P0, auth, data model) get a **perspective-diverse panel**
  (correctness / security / compliance lenses); a finding survives only if it withstands them.
- Verifier agents have **read-only / report-only tool scopes** (like `repo-audit-bot`) so a
  verifier physically cannot "fix and hide."

### G4. Deterministic orchestration (remove agent discretion over order)
- The gate sequence is a **script** (the harness, CI, or a Workflow), not the agent's choice —
  fixed order, barriers between phases. The agent fills steps; it does not decide which to skip.
- Each agent returns a **schema-forced structured verdict** — `{step, command, exit_code,
  artifact_path, proves_what, does_NOT_prove}` (per §J.8). Schema validation **rejects vague
  "looks good"**; a missing field = incomplete = fail.

### G5. Fail-closed defaults + pre-registered blast radius
- **Missing / ambiguous / unverified = FAIL**, never pass (§E). A skipped step yields an
  unverified state, which fails closed — skipping cannot read as success.
- The agent **pre-declares** the expected blast radius **before** coding; the verifier diffs
  the **actual** changed files against the declaration. Files touched outside the declared
  radius = **unexpected reach = fail** (catches scope creep + dark work).

### G6. Reconciliation backstop (catch what slipped through)
- `repo-audit-bot` (scheduled, report-only) **independently re-derives** the truth and compares
  it to the claimed Settlement Ledger — claims vs receipts. A "SETTLED" row with no real proof
  is reopened.
- The **frozen-baseline diff** runs on every harness pass; a silently-skipped fix shows up as a
  baseline mismatch.
- **Human backstop:** Maya's per-step GO + **no self-merge** + documented-waiver-only merges.
  The agent cannot advance the work past a person.

### G7. What each control costs / needs
| Control | Strength | Needs |
|---|---|---|
| G1 CI required checks | **highest** (removes discretion) | Maya GO (HELD `.github`) — Phase 7 |
| G2 evidence-presence gate | high | small CI step + PR template (HELD `.github`) |
| G3 adversarial verifier | high | agent invocations per PR (token cost) |
| G4 deterministic + schema verdicts | high | scripted orchestration / Workflow |
| G5 fail-closed + pre-declared radius | high | discipline + a CI diff check |
| G6 reconciliation + human backstop | catch-net | already in place (repo-audit-bot, Maya GO) |

**Bottom line:** make the gates **CI-enforced (G1)**, **evidence-backed (G2)**, **independently
& adversarially verified (G3)**, and **fail-closed (G5)** — then an agent that skips a step
produces a *missing artifact / red check / unverified verdict*, which blocks the merge
automatically. Honesty stops being a precondition.

### G8. Implemented now (runnable + harness-tested checkers)
The micro/macro gates are real scripts, not prose:
- **`npm run gate:micro`** (`scripts/ci/micro-gate.js`) — enforces **test-first**: any code change
  in the diff must ship a test change (fail-closed, exit 1).
- **`npm run gate:macro`** (`scripts/ci/macro-gate.js`) — enforces **whole-system impact**: maps
  changed files → domains → the gates/agents that must run, requires a **Correction Trace Record**
  for any code change, and reconciles actual changed files against the record's **declared blast
  radius** ("no work in the dark").
- Pure logic in `scripts/ci/gate-lib.js`, pinned by `tests/runtime/gate-checkers.test.ts`.
- **Governance-doc drift** (e.g. the template contradicting §F) is caught automatically by
  `tests/runtime/governance-consistency.test.ts` — both run in the harness on every PR.
- Wiring `gate:micro`/`gate:macro` + the harness as **required CI checks** (G1) is the remaining
  HELD `.github` step — the control that makes these block the merge platform-side, not by promise.

**MICRO rules (enforced in `gate-lib.js`, pinned by tests):**
1. Any non-test, non-generated, non-config code change → a test change must be in the same diff.
2. Docs-only changes are allowed without tests; test-only changes are allowed.
3. **Generated files/artifacts do NOT bypass and do NOT satisfy the rule** (they are neither code
   needing a test nor a valid test).
4. Route/API/auth/compliance code changes require a **test** (the RED proof is a failing test or
   live probe per §F — never grep).
5. An intentional test-exemption is allowed **only with an explicit reason**
   (`testExemptReason`), which the reviewer records in the Trace Record.

**MACRO rules (enforced in `gate-lib.js`, pinned by tests):**
1. Changed files map to domains; domains map to required gates/agents (compliance/auth/API/data →
   domain-specific review gates: security-agent / tristle / rebny-search-compliance-auditor / etc.).
2. Any code change requires a **Correction Trace Record**.
3. Actual changed code files must fall **within** the record's declared blast radius; files outside
   it fail the gate (unexpected reach).
4. **Fail-closed on UNKNOWN changed-file domains** — code with no matching domain rule fails unless
   explicitly classified (allowlist).

**RED-proof machine-check (basic — G2-hardening follow-up for full parsing):**
`traceRecordIssues()` flags a **completed** (IN-PR/VERIFYING/SETTLED) Trace Record that has a blank
RED proof, a grep-only RED proof, or no permanent regression guard. This is a **heuristic**; full
structured Trace-Record parsing is recorded as **G2-hard (PLANNED)** in the ledger — **not "done."**

---

## PART F — Governance (standing rules)
- **Per-step Maya GO** to start any phase/PR. No phase auto-starts.
- **Holds** (CLAUDE.md §C) remain: PR-5B, external inventory, syndication, schema/env/Neon/
  cron/CRM-frontend/workflows, manual cron triggers, reconciliation runs, admin bypass, force-push.
- **Merge** only via documented-waiver squash (no `--admin`, no force) when the sole blocker is
  the known-stuck `release-truth` PARTIAL.
- **Proof-first / fail-closed / compliance-first** as above. **Sentinel-L is non-functional
  and excluded from every gate** — never cited, never a dependency, never waited on.
- **No work in the dark:** no change merges or advances without BOTH the micro gate and the
  per-change macro (system-impact) gate green. An unmapped blast radius = not done.
- **Nothing in this plan has executed.** It is the control structure; each piece runs only
  on approval.
