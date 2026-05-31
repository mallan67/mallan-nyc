# BROKER BRANCH — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Checkbox steps.
> **Git branch:** `feat/broker-command-center` · **Journal:** `ops/agent-journals/06-broker.*` · **Index:** `docs/superpowers/plans/2026-05-30-CRM-ARCHITECTURE-MASTER-PLAN.md`

---

## 🛑 MANDATORY RULES — READ EVERY TIME YOU OPEN THIS FILE (including every resume)

You are the **BROKER agent**. You work ONLY on branch `feat/broker-command-center` and ONLY this plan's owned files. No improvising, no scope creep, no touching other branches' files.

0. **RESUME FIRST.** Read `ops/agent-journals/06-broker.state.json` + tail `06-broker.journal.jsonl`. Resume after `last_completed_step`. Append journal + update state on every action. On block: `status:"blocked"`, record, STOP, surface to Maya.
1. **NEVER AN ASSUMPTION.** Unclear/undefined/missing → STOP and ask. Read the file before editing. No guessed fields, rules, or values.
2. **ALWAYS COTALITY LIVE PULL.** Listing data is live from Cotality; DB is a cache; live-validate before open/send/share; live data still passes the 6 distribution gates + mapper + `normalizeStandardStatus()` + terminal-status guard (spec §3.1).
3. **REBNY COMPLIANCE IS IN-REPO.** `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf` + `compliance/UCBA-2026.md` + the `rebny-compliance` skill. Invoke before any compliance-touching commit. Fail-closed.
4. **HEALTH TEST — ALL GREEN BEFORE COMMIT.** TDD (failing test first → make it pass). Before EVERY commit, run the **full validation suite — exact commands are listed in the `rebny-compliance` skill §7** — and confirm **every check passes**. No `--no-verify`, no skipping hooks, no silencing/deleting a failing test.
5. **NO SIGNALING PAGES.** Every panel = real data + factual outcome. **Money & Action Board has ZERO scores** — facts/dollars/dates/counts only. Honest empty-states. Removing a page = flag-and-confirm with Maya (e.g., the hardcoded Agent-Disclosures panel `panels.js:908–947`).
6. **CREDENTIAL VAULT IS FAIL-CLOSED.** NYS license auto-sync = data.ny.gov `yg7h-zjbf` (SODA + app token, daily, match by license #); a tracked agent dropping out of the active set = "REQUIRES MANUAL VERIFICATION", NEVER auto-classify as revoked. CE + E&O are broker-entered with date alerts (E&O is NOT NY-mandated). (spec §6.4)
7. **TERMINOLOGY = COTALITY.** Use only **Cotality / Cotality Live Connect** naming for new files, identifiers, fields, and UI. Do not reintroduce retired legacy product names (master plan §0.11). Only REBNY keeps its name.
8. **STAY IN LANE / APPROVALS.** Owned files only. Schema/migration/`public/crm/**`/cron/env/skill changes STOP for Maya + `NEON.md`.

---

**Goal:** Make the broker command center top-notch: total visibility, lead distribution, post-NAR commission oversight, the NYS-tied credential vault, the document/template library, the factual Money & Action Board, the Marketing Hub, and the improved leads lifecycle — on a normalized, modularized codebase.

**Architecture:** Extends the existing broker routes/models. First modularize the 13,358-line `public/crm/js/dashboard/panels.js` (once, permanently, no behavior change) so panels don't collide; then add the missing capabilities. Spec: §6, §11.1, §11.7.

**Tech Stack:** Next.js App Router, Prisma/Neon, R2 (doc library), SODA/Socrata (NYS feed), existing auth/audit.

## Owned files (high level)

- `app/api/crm/agents/**`, `app/api/crm/commissions/**`, `app/api/crm/leads/**` (assign), `app/api/crm/documents/**`, doc-library + credential routes (new), Marketing Hub routes (new)
- `public/crm/js/dashboard/**` (the modularization + broker panels) — **`public/crm/**` is Maya-approval-gated**
- `prisma/schema.prisma` (credential vault, CE model, CommissionConfirmation, doc library) — **schema = Maya + `NEON.md`**

## Start condition (CORRECTED 2026-05-30) — Phase 4

May begin after **STABILIZE** for the **early safe phase ONLY**: (a) broker-surface inventory, (b) signaling-page wire/delete list for Maya (hardcoded disclosures, fake market insights, fake agent-performance, empty panels), (c) `panels.js` modularization with **no behavior change** (`public/crm` needs Maya approval). **All schema-heavy features — credential vault, CE model, E&O fields, CommissionConfirmation, document-library schema, NYS SODA sync, cron — require explicit Maya approval + `NEON.md` before any work.** No vanity-score / fake-performance pages, ever.

## Dependencies

STABILIZE (#295) landed. Modularization (Task 1) before new panels. Credential/CE/E&O/doc-library/CommissionConfirmation tasks need schema → Maya approval first.

---

## Task outline (each expanded to bite-sized TDD steps at activation — against the then-existing code; NEVER ASSUME)

1. **`panels.js` modularize-once** — split the monolith into focused per-feature modules, **no behavior change**, with a before/after smoke proof (`crm:test` 172/172 unchanged). Maya approval (`public/crm/**`). *(Foundation — must precede the other broker tasks within this branch.)*
2. **Lead distribution** — build `POST /api/crm/leads/[id]/assign` (declared, missing) + `POST /api/crm/leads/bulk-reassign`, broker-only, audited.
3. **Deal-form submit fix** — wire BUYER/TENANT deal forms to actually POST `/api/crm/deals` (PR #146 pattern). 
4. **Commission confirmation (post-NAR)** — `CommissionConfirmation` model (schema → Maya): `commission_confirmed_at`, `commission_basis`, `commission_value`, audit; the **buyer-rep agreement** (Portals/§11.1) is the factual source of buyer-side commission.
5. **Credential vault** (schema → Maya) — license fields + `ContinuingEducationCourse` model + E&O fields; **NYS auto-sync** (SODA `yg7h-zjbf`, app token, daily, match by license #, fail-closed per rule 6); alerts (license/CE/E&O) to agent + broker at T-90/30/7 / T-60.
6. **Document & Template library** (schema + R2) — disclosures (DOS-2105, PCDS, Fair Housing, FARE, commission-negotiability), offering plans (→ T3), exclusive agreements, letterhead, invoice templates; versioned canonical; agent-pull. **This backs the disclosures tracker** — wire it to real Document status or delete the hardcoded panel (rule 5).
7. **Money & Action Board** (factual, zero scores) — lanes: Action-needed-now · Waiting(external) · Money-in-flight · This-week's-deadlines; every card links to a real row. (spec §6.7)
8. **Marketing Hub** — eBlast send backend (Fair Housing pre-send scan + CAN-SPAM + §175.25 attribution + unsubscribe), market reports, lead-gen, agent tools. (spec §6.8)
9. **Leads lifecycle** — `Lead.converted_at`, **factual `stage_reason` + `LeadStageEvent`** (spec §6.9.1), verified-leads plugin intake (§6.9.2), unify `AuditEvent`/`ActivityLog`, broker portfolio view. 
10. **Signaling-page purge** — Agent-Disclosures panel (wire-or-delete, Maya-confirm), verify Market-Insights / Agent-Performance (remove if non-factual).

## Done criteria

Each capability lands TDD + health-green + compliance-checked; `panels.js` modularized with no behavior change; credential vault fail-closed and Maya-verified; no vanity scores anywhere; all schema applied per `NEON.md` before merge. **Every broker UI surface passes a design-skill review** (`frontend-design` + `ui-ux-pro-max`, spec §13) — clear tabs, easy-to-follow workflow, one design system.
