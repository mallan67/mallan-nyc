# FIREWALL BRANCH — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Checkbox steps.
> **Git branch:** `feat/tier-firewall-tests` · **Journal:** `docs/crm-architecture/journals/02-firewall.*` · **Index:** `docs/crm-architecture/BRANCH-INDEX.md`

---

## 🛑 MANDATORY RULES — READ EVERY TIME YOU OPEN THIS FILE (including every resume)

You are the **FIREWALL agent**. ONLY branch `feat/tier-firewall-tests`, ONLY this plan's owned files (tests + CI rules + scan helpers). No improvising, no scope creep, no other branches' files.

0. **RESUME FIRST.** `docs/crm-architecture/journals/02-firewall.state.json` + tail journal → resume after `last_completed_step`; append journal + update state each action; block → record, STOP, surface to Maya.
1. **NEVER AN ASSUMPTION.** Unclear/missing → STOP and ask. Read the actual import graph before pinning it.
2. **ALWAYS COTALITY LIVE PULL** is enforced elsewhere; here you PIN that T2/T3 never reach public surfaces and that live data still passes the gates.
3. **REBNY COMPLIANCE IN-REPO.** `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf` + skill. Invoke before compliance-touching commits.
4. **HEALTH TEST — ALL GREEN BEFORE COMMIT.** TDD. Your tests must themselves pass + the full suite green.
5. **NO SIGNALING PAGES.** N/A (this branch is tests) — but ensure tests assert factual gating, not theater.
6. **TERMINOLOGY = COTALITY.** New identifiers use Cotality / Cotality Live Connect naming. This branch *references* the existing (legacy-named) modules only to pin them — it never creates new legacy-named code (master plan §0.11).
7. **STAY IN LANE.** Owned files only: `tests/runtime/**`, `scripts/ci-compliance-check.js`, pre-send scan helpers. No feature code.

---

**Goal:** Pin the tier boundary so T2/T3 (external/StreetEasy, sponsor/Schedule A) can NEVER leak to any public surface, and pre-send compliance scans run on share copy.

**Architecture:** A reverse-direction CI test (the reverse of the existing syndication import-boundary test in `tests/runtime/`) + source-grep guards + `assertNotPublicSurface()` helper. Spec: §3.4, §5.

**Tech Stack:** Jest/runtime tests, the existing `scripts/ci-compliance-check.js`.

## Owned files

- Create: reverse-pin test (`lib/external-listings/**` + future `lib/sponsor/**` cannot import the search projection / the **Cotality Live Connect** module / be referenced from `app/api/listings/**`, sitemap, robots, structured-data)
- Modify: `scripts/ci-compliance-check.js` (+1 path-allowlist check)
- Create: pre-send Fair-Housing/off-market/compensation scan on share captions

## Dependencies

Can run early/parallel (it's tests). Becomes load-bearing once T2/T3 land.

## Task outline (bite-sized TDD at activation — NEVER ASSUME the import graph; read it)

1. Reverse boundary test: assert no forbidden imports/references (source-grep). Test fails if a T2/T3 helper is referenced from a public surface.
2. `assertNotPublicSurface(routePath)` helper + unit tests (throws on every public-route prefix).
3. CI rule in `ci-compliance-check.js` (count +1) — fails any PR referencing `external_inventory_*` / `sponsor_*` outside the allowlist.
4. Pre-send caption scans (Fair Housing + off-market + compensation) with blocking tests.
5. Tests: default-off toggles return 0 T2/T3 rows; non-Cotality disclaimer present on every T2/T3 row; owner-PII null by default; reveal writes audit + reveal-log.

## Done criteria

The reverse pin is green and CI-enforced; no T2/T3 reference can reach a public surface; pre-send scans block on hit; full suite green.
