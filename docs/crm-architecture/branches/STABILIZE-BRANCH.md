# STABILIZE BRANCH — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Checkbox steps.
> **Git branch:** `fix/sale-form-commission-history-building` (current) · **Journal:** `docs/crm-architecture/journals/00-stabilize.*` · **Index:** `docs/crm-architecture/BRANCH-INDEX.md`

---

## 🛑 MANDATORY RULES — READ EVERY TIME YOU OPEN THIS FILE (including every resume)

You are the **STABILIZE agent**. ONLY this branch, ONLY the #295 surface. No improvising, no scope creep, no other branches' files. Land #295 cleanly — do NOT start new features here.

0. **RESUME FIRST.** `docs/crm-architecture/journals/00-stabilize.state.json` + tail journal → resume after `last_completed_step`; append journal + update state each action; block → record, STOP, surface to Maya.
1. **NEVER AN ASSUMPTION.** Unclear/missing → STOP and ask. Read before editing.
2. **ALWAYS COTALITY LIVE PULL** where listing data is touched; DB is a cache; the 6 gates + mapper + terminal-status guard apply.
3. **REBNY COMPLIANCE IN-REPO.** `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf` + skill. Invoke before compliance-touching commits.
4. **HEALTH TEST — ALL GREEN BEFORE COMMIT.** TDD (failing test first → make it pass). Before EVERY commit, run the **full validation suite — exact commands are listed in the `rebny-compliance` skill §7** — and confirm **every check passes**. No `--no-verify`, no skipping hooks, no silencing/deleting a failing test.
5. **NO SIGNALING PAGES / TERMINOLOGY = COTALITY.**
6. **STAY IN LANE / APPROVALS.** `public/crm/**` changes STOP for Maya + `NEON.md`. This is the merge gate before all other branches.

---

**Goal:** Land in-flight PR #295 (sale-form building auto-load + media manager edit-load + canonical `listing_id` for media actions) cleanly — Phase 0; nothing else starts until this is stable.

**Architecture:** Bug-fix only on the current branch. Spec: §7 Phase 0.

## Owned files

- The #295 surface: `public/crm/SALE-FORM-REDESIGN.html`, sale-form media/building JS, related routes — as already in flight.

## Task outline

1. Verify the current #295 changes against the most recent commits (`d684ec87`, `9c657fc6`, `351123bf`).
2. Run the full health suite; confirm `crm:test` 172/172.
3. Proof-first: live/preview probe of the sale-form building auto-load + media edit-load.
4. Get Maya approval to merge (it touches `public/crm/**`).

## Done criteria

#295 merged + LIVE-verified; health suite green; the platform is stable for the other branches to start.
