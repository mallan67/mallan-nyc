# CRM ARCHITECTURE — Master Implementation Plan (index)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement the per-branch plans task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the search-centric Mallan CRM as defined in the spec `docs/crm/architecture/MASTER-PLAN.md`, one branch per subsystem, each isolated, journaled, and rule-bound.

**Architecture:** One canonical search core fed live from Cotality; CRM, broker tools, tiers, money-loops, and client portals all serve the loop *Search → match → send/share → track → advise → show → offer/lease/sale → commission*. Each subsystem is owned by ONE agent on ONE branch with a resume-journal.

**Tech Stack:** Next.js 16 (App Router), Prisma + Neon Postgres, **Cotality Live Connect** (live OData feed), R2 media, the existing `lib/search/**` + `lib/compliance/**` spine.

---

## How to use this index (READ FIRST)

1. **Each branch has its own plan file** in `docs/crm/architecture/branches/`, named for the branch.
2. **To start or restart a branch:** open its file, read the **🛑 MANDATORY RULES** block at the top *every time*, read its journal (`docs/crm/architecture/journals/<slug>.*`), resume from the last completed step.
3. **An agent works ONLY its own branch and ONLY its owned files.** It never improvises, never expands scope, never touches another branch's files.
4. The spec (`...listing-search-business-spine-master-plan.md`) is the source of truth for *what*; each branch file is the source of truth for *how*.

## Branch registry (the names you need)

| # | Branch (open this file) | Git branch | Journal slug | Owns | Depends on | Status |
|---|---|---|---|---|---|---|
| 0 | **STABILIZE-BRANCH.md** | `fix/sale-form-commission-history-building` | `00-stabilize` | sale-form, media, building load (#295) | — | ⬜ |
| 1 | **SEARCH-BRANCH.md** | `feat/search-registry-core` | `01-search` | `search-registry.json`, `lib/search/**` | 0 | ⬜ |
| 2 | **FIREWALL-BRANCH.md** | `feat/tier-firewall-tests` | `02-firewall` | reverse-pin CI tests, pre-send scans | 0 (**Phase-1 gate** — green before AGENT / MONEY-LOOPS / PORTALS / sends / T2 / T3) | ⬜ |
| 3 | **AGENT-BRANCH.md** | `feat/agent-search-shell` | `03-agent` | `app/api/crm/search/**`, agent-search UI | 1 | ⬜ |
| 4 | **MONEY-LOOPS-BRANCH.md** | `feat/money-loops-send` | `04-money-loops` | `ListingSend`, send/collection routes + UI | 1, 3 | ⬜ |
| 5 | **PORTALS-BRANCH.md** | `feat/client-portals` | `05-portals` | `app/portal/**`, `app/api/portal/**`, owner-link, deal-readiness | **1 + 2 (SEARCH + FIREWALL) ready**; scheduled after 3 + 4 | ⬜ |
| 6 | **BROKER-BRANCH.md** | `feat/broker-command-center` | `06-broker` | broker routes, credential vault, doc library, Money&Action board, Marketing Hub, leads lifecycle, `panels.js` modularize | 0 (early phase = non-schema) | ⬜ |
| 7 | **EXTERNAL-BRANCH.md** (T2) | `feat/t2-external-inventory` | `07-t2-external` | `lib/external-listings/**`, `external_inventory_*` | 1, 2 · **HELD (Maya)** | 🔒 |
| 8 | **SPONSOR-BRANCH.md** (T3) | `feat/t3-sponsor` | `08-t3-sponsor` | `lib/sponsor/**`, sponsor schema | 1, 2 · **HELD (Maya)** | 🔒 |

**Companion detail-specs (active, cite for T2/T3 data models):** `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md`, `...sponsor-database-design.md`.

## Execution order (CORRECTED 2026-05-30 — SEARCH + FIREWALL come BEFORE PORTALS)

| Phase | Branch(es) | Gate |
|---|---|---|
| **0** | **STABILIZE** (#295) | land first; Maya merge approval; nothing else starts until stable |
| **1** | **SEARCH** + **FIREWALL** | SEARCH builds the live-Cotality field authority + single search core; FIREWALL pins public/private + pre-send boundaries. **Both must be ready before any portal, send, or T2/T3.** |
| **2** | **AGENT** + **MONEY-LOOPS** | AGENT consumes the SEARCH contract; MONEY-LOOPS builds send/share/reaction/daily-queue |
| **3** | **PORTALS pilot** | **starts ONLY after SEARCH contract + FIREWALL baseline are ready** (NOT right after STABILIZE). Narrow seller-portal pilot; dry-run + Maya-gated real-seller go-live |
| **4** | **BROKER** | after STABILIZE, **early phase = no-schema inventory + `panels.js` modularization only** (Maya approval for `public/crm`); credential/CE/E&O/doc-library/commission-confirmation schema all need Maya approval first |
| **5** | **EXTERNAL (T2)** → **SPONSOR (T3)** | 🔒 HELD — explicit Maya approval for each |

**HARD RULE:** PORTALS does **not** start before SEARCH + FIREWALL. (The earlier "Phase 0.5 first" framing was wrong and is corrected here.)

## Shared gates (apply to every branch)

- **Health test:** run the full validation suite — **exact commands in the `rebny-compliance` skill §7** — ALL green before commit (type-check + compliance/audit validators + CRM smoke + ops-health).
- **Compliance:** invoke the `rebny-compliance` skill before any compliance-touching commit; primary source `compliance/UCBA_Master_Copy_rev._2026_3.30.pdf`.
- **Design (UI branches AGENT / BROKER / PORTALS):** invoke `frontend-design` + `ui-ux-pro-max` for every screen; clear tabs + easy-to-follow workflow + one design system + result→action ≤1 click + mobile-first per §11.5 + WCAG 2.1 AA + honest empty-states. Each UI branch has an explicit design-pass before "done" (spec §13).
- **Approval holds:** schema/migration · `public/crm/**` · cron · env · Neon · T2/T3 · force-push — STOP for Maya + `NEON.md`.

*Index — 2026-05-30. Open the per-branch file to work. The full mandatory-rules block is repeated at the top of every branch file so a resuming agent always sees it.*
