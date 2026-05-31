# MONEY-LOOPS BRANCH — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Checkbox steps.
> **Git branch:** `feat/money-loops-send` · **Journal:** `docs/crm-architecture/journals/04-money-loops.*` · **Index:** `docs/crm-architecture/BRANCH-INDEX.md`

---

## 🛑 MANDATORY RULES — READ EVERY TIME YOU OPEN THIS FILE (including every resume)

You are the **MONEY-LOOPS agent**. ONLY branch `feat/money-loops-send`, ONLY this plan's owned files. No improvising, no scope creep, no other branches' files.

0. **RESUME FIRST.** `docs/crm-architecture/journals/04-money-loops.state.json` + tail journal → resume after `last_completed_step`; append journal + update state each action; block → record, STOP, surface to Maya.
1. **NEVER AN ASSUMPTION.** Unclear/missing → STOP and ask. Read interfaces before consuming.
2. **ALWAYS COTALITY LIVE PULL.** A live capture from Cotality fires immediately **before any send/share** to a client; never send a stale price or dead listing; the 6 gates + mapper + terminal-status guard apply (spec §3.1, §3.1 compliance pin).
3. **REBNY COMPLIANCE IN-REPO.** `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf` + `compliance/UCBA-2026.md` + `rebny-compliance` skill. Invoke before compliance-touching commits. Fail-closed.
4. **HEALTH TEST — ALL GREEN BEFORE COMMIT.** TDD (failing test first → make it pass). Before EVERY commit, run the **full validation suite — exact commands are listed in the `rebny-compliance` skill §7** — and confirm **every check passes**. No `--no-verify`, no skipping hooks, no silencing/deleting a failing test.
5. **PRE-SEND COMPLIANCE GATE (non-negotiable).** Every send/share runs: Fair Housing scan on caption+cover-note · off-market-language ban · compensation-text ban · FARE Act injection on NYC rentals · TCPA consent on recipient · brokerage attribution present (§175.25) · agent owns the recipient. Block on hit.
6. **DESIGN STANDARD (spec §13).** Send/collection UI uses `frontend-design` + `ui-ux-pro-max`: easy, obvious flow.
7. **TERMINOLOGY = COTALITY.** Use only **Cotality / Cotality Live Connect** naming for new files, identifiers, fields, and UI. Do not reintroduce retired legacy product names (master plan §0.11). Only REBNY keeps its name.
8. **STAY IN LANE / APPROVALS.** Owned files only. Schema (`ListingSend`)/`public/crm/**` STOP for Maya + `NEON.md`.

---

**Goal:** Build the canonical send/share primitive (`ListingSend`) and the collection/reaction loop so search results become client action and reactions return to the CRM daily queue.

**Architecture:** One `ListingSend` row per send (exactly one of `listing_id` / `external_inventory_listing_id` / `sponsor_listing_id`). Reactions write to the event spine → agent daily queue. Spec: §4, §P (send primitive).

**Tech Stack:** Next.js App Router, Prisma/Neon, the search core, email/SMS senders with consent gates.

## Owned files

- Create: `ListingSend`/`ListingSendItem` (schema → Maya), `app/api/crm/sends/**`, collections routes, reaction endpoints
- Test: `app/api/crm/__tests__/**`

## Dependencies

SEARCH + AGENT branches (search results to send). Schema → Maya + `NEON.md`.

## Task outline (bite-sized TDD at activation — NEVER ASSUME)

1. `ListingSend`/`ListingSendItem` model + CHECK constraint (exactly-one-tier) — schema → Maya.
2. `POST /api/crm/sends` with the full pre-send compliance gate (rule 5) + live-capture before send (rule 2).
3. Collections (create/add/remove) + send-as-collection.
4. Reaction endpoints (liked/passed/discuss/tour_requested) → event spine; agent daily-queue rollup.
5. Send-history + status (delivered/opened/clicked/replied) per agent (private).

## Done criteria

Agent sends a search result to a client through the compliance gate with a live-captured listing; reactions return to the CRM queue; health suite green.
