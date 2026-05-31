# AGENT BRANCH — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Checkbox steps.
> **Git branch:** `feat/agent-search-shell` · **Journal:** `ops/agent-journals/03-agent.*` · **Index:** `docs/superpowers/plans/2026-05-30-CRM-ARCHITECTURE-MASTER-PLAN.md`

---

## 🛑 MANDATORY RULES — READ EVERY TIME YOU OPEN THIS FILE (including every resume)

You are the **AGENT-SEARCH agent**. ONLY branch `feat/agent-search-shell`, ONLY this plan's owned files. No improvising, no scope creep, no other branches' files.

0. **RESUME FIRST.** Read `ops/agent-journals/03-agent.state.json` + tail journal. Resume after `last_completed_step`. Append journal + update state each action. Block → record, STOP, surface to Maya.
1. **NEVER AN ASSUMPTION.** Unclear/missing → STOP and ask. Read the SEARCH-branch registry/core interfaces before consuming them — do NOT invent their shape.
2. **ALWAYS COTALITY LIVE PULL.** Agent search reads the search core which is live from Cotality (DB cache + live-capture on open/send/share); never serve stale as fresh; the 6 gates + mapper + terminal-status guard always apply (spec §3.1).
3. **REBNY COMPLIANCE IN-REPO.** `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf` + `compliance/UCBA-2026.md` + `rebny-compliance` skill. Invoke before compliance-touching commits. Fail-closed. Search filters must NEVER filter by a protected class (Fair Housing).
4. **HEALTH TEST — ALL GREEN BEFORE COMMIT.** TDD (failing test first → make it pass). Before EVERY commit, run the **full validation suite — exact commands are listed in the `rebny-compliance` skill §7** — and confirm **every check passes**. No `--no-verify`, no skipping hooks, no silencing/deleting a failing test.
5. **NO SIGNALING PAGES.** Every result/action traces to real data + a real outcome. Per-agent privacy: Agent A never sees Agent B's searches/sends/shares.
6. **DESIGN & WORKFLOW STANDARD (spec §13).** This is a UI branch — **invoke the `frontend-design` skill (and `ui-ux-pro-max` for layout/flows) for every screen.** Tabs and flow must be obvious and easy to follow: one clear primary action per screen, consistent design system, result→action in ≤1 click, mobile-first for agent **search** + **own-listing edits (price/status/description/open-house)** (spec §11.5). No generic AI aesthetic.
7. **TERMINOLOGY = COTALITY.** Use only **Cotality / Cotality Live Connect** naming for new files, identifiers, fields, and UI. Do not reintroduce retired legacy product names (master plan §0.11). Only REBNY keeps its name.
8. **STAY IN LANE / APPROVALS.** Owned files only. `public/crm/**`/schema/env STOP for Maya + `NEON.md`.

---

**Goal:** Build the agent-search workspace that does not exist today — a real `GET /api/crm/search` + UI shell with per-agent saved searches, tier toggles (T1 on; T2/T3 off), wider status set, ranking, and result→action (send/share/collection/CMA/showing/reveal).

**Architecture:** Consumes the SEARCH-branch registry + core. Reads `Listing` today (one-line swap to the projection when PR 5B lands). Clear tabs: Sales · Rentals · Exclusives · Client Matches · Comps/CMA · Outside (T2) · Buildings · Saved. Spec: §2.3, §2.4.

**Tech Stack:** Next.js App Router, the search core, `frontend-design` + `ui-ux-pro-max` skills for UI.

## Owned files

- Create: `app/api/crm/search/**`, `app/api/crm/saved-searches/**`, agent-search UI (page or `public/crm/js/dashboard/panels/search-workspace/**` per current frontend strategy — confirm with Maya)
- Test: `app/api/crm/__tests__/**`, UI smoke

## Dependencies

SEARCH branch (registry + core) landed. Per-agent ownership middleware (`requireOwnedBy`) from BROKER/Lane-1.

## Task outline (bite-sized TDD at activation, against the real registry/core — NEVER ASSUME)

1. `GET /api/crm/search` backend (filters, wider status, ranking, pagination, per-agent privacy) reading the search core.
2. Saved searches CRUD (`POST/GET/PATCH /api/crm/saved-searches`), per-agent-scoped.
3. **Design pass (frontend-design + ui-ux-pro-max):** the search workspace — clear tabs, persistent filter pills, never-leave-results editing, one primary action, mobile-first agent search.
4. Result→action wiring: send to client · add to collection · request showing · add to CMA · compare to subject · reveal owner (T2/T3) · open client-match.
5. Ranking (recency · price-match · neighborhood · beds/baths · agent's own recent activity) — explainable, no black-box score.

## Done criteria

Agent can search across tiers, save searches (private), act on a result in ≤1 click, on a clean easy-to-follow UI; per-agent privacy enforced; health suite green; design-skill review passed.
