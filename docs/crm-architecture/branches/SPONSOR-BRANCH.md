# SPONSOR BRANCH (Tier 3 — sponsor / Schedule A / new-development) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Checkbox steps.
> **Git branch:** `feat/t3-sponsor` · **Journal:** `docs/crm-architecture/journals/08-t3-sponsor.*` · **Index:** `docs/crm-architecture/BRANCH-INDEX.md`
> **🔒 HELD — do NOT start without explicit Maya approval** (`memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`).
> **Companion detail-spec (authoritative data model):** `docs/superpowers/specs/2026-04-30-sponsor-database-design.md`.

---

## 🛑 MANDATORY RULES — READ EVERY TIME YOU OPEN THIS FILE (including every resume)

You are the **T3 SPONSOR agent**. ONLY branch `feat/t3-sponsor`, ONLY this plan's owned files. No improvising, no scope creep, no other branches' files. **HELD — confirm Maya approval before any work.**

0. **RESUME FIRST.** `docs/crm-architecture/journals/08-t3-sponsor.state.json` + tail journal → resume after `last_completed_step`; append journal + update state each action; block → record, STOP, surface to Maya.
1. **NEVER AN ASSUMPTION.** Unclear/missing → STOP and ask. Companion spec is the data-model source; do not invent fields. Public-records ETL (NY AG offering plans, ACRIS, NYC Open Data) — verify each source + permitted use; no guessing.
2. **NEVER PUBLIC UNLESS COTALITY-LINKED.** A sponsor row reaches a public surface ONLY when linked to a real Cotality listing (`cotality_listing_id` set → T1 rules govern). Otherwise: agent-only opt-in toggle (default OFF) + sponsor badge + non-Cotality disclaimer + client share-only. FIREWALL reverse-pin must stay green.
3. **REBNY/COMPLIANCE IN-REPO.** `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf` + skill. Invoke before compliance-touching commits. Fail-closed. Co-op Application Timeline Law (eff. 2026-07-28) — compile against it.
4. **HEALTH TEST — ALL GREEN BEFORE COMMIT.** TDD. Full suite + FIREWALL reverse-pin green. No `$queryRawUnsafe`.
5. **NO SIGNALING PAGES / TERMINOLOGY = COTALITY** (fields use Cotality naming, e.g. `cotality_listing_id` for the Cotality-linked-listing reference; never legacy product names).
6. **STAY IN LANE / APPROVALS.** Owned files only. Schema (9 tables)/ETL/cron/env STOP for Maya + `NEON.md`.

---

**Goal:** Bring Schedule A / sponsor / new-development units into the CRM as a separate tier — searchable agent-side, share-only to clients, never public unless Cotality-linked — per the companion spec.

**Architecture:** 9-table sponsor schema (buildings, entities, management cos, selling brokerages, units, listings, client-shares, reveal-log) + public-records ETL + shadow-row rule + commission confirmation. Offering plans tie to the doc library (BROKER §6.6). Spec: §3.3; full detail in the companion spec.

## Owned files

- `lib/sponsor/**`, sponsor schema (→ Maya + `NEON.md`), `app/api/crm/sponsor/**`, `app/api/portal/sponsor/**`, T3 UI, ETL jobs (→ Maya for cron).

## Dependencies

SEARCH branch + FIREWALL branch + EXTERNAL branch (T2 architectural precedent) + **Maya approval to lift the hold**.

## Task outline (full bite-sized TDD from the companion spec at activation — NEVER ASSUME)

1. Sponsor schema (9 tables) + reverse-pin — Maya + `NEON.md`.
2. Public-records ETL (NY AG REFB + ACRIS + NYC Open Data) with dry-run; each source verified + permitted.
3. Shadow-row rule (Cotality-linked vs local) + sponsor badge + disclaimer + an **availability-confidence state** on every sponsor row, exactly one of: `verified_available` · `research_lead` · `possibly_available` · `linked_to_cotality` · `not_verified` · `inactive`. Never assert availability beyond what is verified (fail-closed).
4. Agent-search `include_sponsor_inventory` toggle (default OFF).
5. Commission confirmation (reveal-gated after confirmed) + client share + portal render.

## Done criteria

T3 searchable agent-side, never public unless Cotality-linked, share-only to clients, reveal-gated + audited, reverse-pin green, full suite green.
