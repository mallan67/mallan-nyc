# EXTERNAL BRANCH (Tier 2 — external / StreetEasy / off-market) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Checkbox steps.
> **Git branch:** `feat/t2-external-inventory` · **Journal:** `docs/crm-architecture/journals/07-t2-external.*` · **Index:** `docs/crm-architecture/BRANCH-INDEX.md`
> **🔒 HELD — do NOT start without explicit Maya approval** (`memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`).
> **Companion detail-spec (authoritative data model):** `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md`.

---

## 🛑 MANDATORY RULES — READ EVERY TIME YOU OPEN THIS FILE (including every resume)

You are the **T2 EXTERNAL agent**. ONLY branch `feat/t2-external-inventory`, ONLY this plan's owned files. No improvising, no scope creep, no other branches' files. **This branch is HELD — confirm Maya approval before any work.**

0. **RESUME FIRST.** `docs/crm-architecture/journals/07-t2-external.state.json` + tail journal → resume after `last_completed_step`; append journal + update state each action; block → record, STOP, surface to Maya.
1. **NEVER AN ASSUMPTION.** Unclear/missing → STOP and ask. Use the companion spec as the data-model source; do not invent fields.
2. **NEVER PUBLIC.** T2 rows NEVER touch `/api/listings`, sitemap, robots, SEO/JSON-LD, the projection. CRM/agent-search opt-in toggle (default OFF) + non-Cotality disclaimer + owner-PII reveal-gate + client share-only. The FIREWALL branch's reverse-pin must stay green.
2b. **COTALITY DEDUP.** One-time StreetEasy Manhattan scrape → normalize address → **drop if already in the Cotality `Listing` table** → store only the residual. Ambiguous matches → manual-review queue (NEVER auto-drop, NEVER auto-duplicate).
2c. **PHOTOS = LINK, NEVER RE-HOST.** Agent view = deep-link to source; client view = masked like a Cotality portal listing. No StreetEasy photos copied/stored.
3. **REBNY/LEGAL.** `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf` + skill. **StreetEasy scraper requires Maya's recorded broker-of-record ToS memo + Open-NY/source ToS read BEFORE scraper code** (spec §3.2, §5.7).
4. **HEALTH TEST — ALL GREEN BEFORE COMMIT.** TDD. Full suite + the FIREWALL reverse-pin green. No `$queryRawUnsafe`.
5. **NO SIGNALING PAGES / TERMINOLOGY = COTALITY** (tables + fields use Cotality naming; the companion spec's legacy field names get renamed per master plan §10.1).
6. **STAY IN LANE / APPROVALS.** Owned files only. Schema/migration/scraper/cron/env STOP for Maya + `NEON.md`.

---

**Goal:** Make genuinely-not-in-Cotality Manhattan inventory (FSBO, off-market, non-Cotality-broker exclusives) searchable inside the CRM only, shared privately to clients only — per the companion spec.

**Architecture:** Separate `external_inventory_listings` + `external_inventory_client_shares` + `external_inventory_pii_reveal_log` tables; agent-search opt-in union; reveal-gate; portal DTO strips PII. Phased: manual entry → bulk → scraper (each its own gate). Spec: §3.2; full detail in the companion spec.

## Owned files

- `lib/external-listings/**`, `external_inventory_*` schema (→ Maya + `NEON.md`), `app/api/crm/external-inventory/**`, `app/api/portal/external-inventory/**`, T2 UI.

## Dependencies

SEARCH branch (toggle into the core) + FIREWALL branch (reverse-pin) + **Maya approval to lift the hold**.

## Task outline (full bite-sized TDD from the companion spec §10 at activation — NEVER ASSUME)

1. Schema (3 tables) + reverse-pin proof (FIREWALL) — Maya + `NEON.md`.
2. Manual "Add Off-Market" + dedup-against-Cotality + manual-review queue.
3. Owner-PII reveal-gate (attestation + audit + reveal-log).
4. Agent-search `include_external_inventory` toggle (default OFF) + non-Cotality disclaimer stamping.
5. Per-client share + portal render (PII null, photos = link, disclaimer).
6. (Later, separate gates) bulk import; then StreetEasy scraper after the ToS memo.

## Done criteria

T2 searchable in CRM only, never public, share-only to clients, PII reveal-gated + audited, photos linked not hosted, reverse-pin green, full suite green.
