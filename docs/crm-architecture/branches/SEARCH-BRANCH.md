# SEARCH BRANCH — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Checkbox steps.
> **Git branch:** `feat/search-registry-core` · **Journal:** `docs/crm-architecture/journals/01-search.*` · **Index:** `docs/crm-architecture/BRANCH-INDEX.md`

---

## 🛑 MANDATORY RULES — READ EVERY TIME YOU OPEN THIS FILE (including every resume)

You are the **SEARCH agent**. ONLY branch `feat/search-registry-core`, ONLY this plan's owned files. No improvising, no scope creep, no other branches' files.

0. **RESUME FIRST.** Read `docs/crm-architecture/journals/01-search.state.json` + tail journal. Resume after `last_completed_step`. Append journal + update state every action. Block → `status:"blocked"`, record, STOP, surface to Maya.
1. **NEVER AN ASSUMPTION — LIVE COTALITY `$metadata` IS THE FIELD AUTHORITY.** The single source of field truth is the **live Cotality `$metadata`**. Existing mapper constants and old registry files (legacy field lists/symbols, located via the `rebny-compliance` skill §2.3) are **compatibility references ONLY — not authority**. If a legacy constant/file conflicts with live `$metadata`, **STOP and surface the mismatch** — do not guess, do not silently follow the old constant. The DB is a cache/projection only. Invented field names = HTTP 400.
2. **ALWAYS COTALITY LIVE PULL.** The registry maps the LIVE Cotality feed; the DB is a cache; live-validate before display/send/share; live data passes the 6 distribution gates + mapper + `normalizeStandardStatus()` + terminal-status guard (spec §3.1).
3. **REBNY COMPLIANCE IN-REPO.** `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf` + `compliance/UCBA-2026.md` + `rebny-compliance` skill. Invoke before compliance-touching commits. Fail-closed.
4. **HEALTH TEST — ALL GREEN BEFORE COMMIT.** TDD (failing test first → make it pass). Before EVERY commit, run the **full validation suite — exact commands are listed in the `rebny-compliance` skill §7** — and confirm **every check passes**. No `--no-verify`, no skipping hooks, no silencing/deleting a failing test.
5. **NO SIGNALING PAGES / NO PHANTOM FIELDS.** No invented display fields — the phantom-field list is in the `rebny-compliance` skill §2 (do NOT use them). Provider-gated fields fail-OPEN (`!== false`); per-row opt-out fields fail-closed (`affirmPermission`).
6. **DETERMINISTIC TESTS.** Tests that exercise the live mapping use recorded fixtures / contract tests — never hammer live Cotality in CI (spec §11.8).
7. **TERMINOLOGY = COTALITY.** Use only **Cotality / Cotality Live Connect** naming for new files, identifiers, fields, and UI. Do not reintroduce retired legacy product names (master plan §0.11). Only REBNY keeps its name.
8. **STAY IN LANE / APPROVALS.** Owned files only. Schema/env/cron STOP for Maya + `NEON.md`.

---

**Goal:** Build the one canonical field registry (`search-registry.json`, ~1,447 Cotality fields × 12 resources) and the single search core that every surface reads (public, agent, saved-search, alerts, comps, portal).

**Architecture:** Registry is the single source of truth for widgets, provider mapping, compliance flags, display tiers. The form renderer, criteria collector, and provider adapters all read it (no hand-typed field IDs — the 348-of-623 silent-drop bug). Extend `lib/search/**`, do not fork. Spec: §2.

**Tech Stack:** TypeScript, Cotality OData via **Cotality Live Connect**, Prisma, the existing `lib/search/**` helpers.

## Owned files

- Create: `search-registry.json`, registry loader + validator in `lib/search/registry/**`
- Modify: `lib/search/core.ts`, `criteria-to-prisma.ts`, `public-listing-db.ts`, and the **Cotality Live Connect** filter + mapper helpers (read from registry)
- Test: `lib/search/__tests__/**`

## Dependencies

STABILIZE (#295) landed. This branch is the foundation for AGENT and MONEY-LOOPS — they depend on the registry + core interfaces.

## Task outline (bite-sized TDD at activation, verified against live `$metadata` — NEVER ASSUME field names)

1. Registry schema + loader + JSON-schema validator (test: loader rejects malformed/phantom fields).
2. Define the live-`$metadata` refresh/validation path, then populate the registry per resource (Property, CustomProperty, Media, OpenHouse, PropertyRooms, PropertyUnitTypes, Member, Office, Teams, TeamMembers, PropertyGreenVerification, Building) — every searchable/display field **validated against live Cotality `$metadata`**.
2b. **Mark every field** with exactly one state: `COTALITY_VALID` · `UI_ALIAS_TO_COTALITY` · `UI_INTERNAL_ONLY` · `NOT_AVAILABLE_FROM_COTALITY` · `REMOVE`. Only `COTALITY_VALID` / `UI_ALIAS_TO_COTALITY` fields are searchable against the live feed; surface any legacy-vs-live mismatch (rule 1) rather than resolving it silently.
3. Criteria collector reads registry + DOM → criteria object (test: every advanced field has a derived ID; the 348-drop bug cannot recur).
4. Provider adapters (Cotality OData ↔ Prisma) driven by the registry; compliance flags (`distribution_gate`/`vow_only`/`website_only`) honored.
5. Single search core merges results + applies the 6 gates; `search-run-recorder` audit. Deterministic fixtures.

## Done criteria

One registry, one core; **every field verified against live Cotality `$metadata`** (legacy constants treated as compatibility only; mismatches surfaced, not silently resolved); no phantom fields; the old silent-drop advanced-search bug cannot recur; all existing search surfaces read it; gates intact; deterministic tests green; full health suite green. **A documented interface contract is published so AGENT and MONEY-LOOPS can consume it without guessing.**
