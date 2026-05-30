# CRM ARCHITECTURE — Control File (single entry point)

> **Read this first.** This is the ONE control surface for the Mallan search-centric CRM rebuild. It indexes the plan, assigns each section to an agent on its own branch, defines the auto-memory (resume journal) so work survives a freeze/shutdown, and tracks live status. Open this file to know: *what we're building, who owns what, where the work is, and what's next.*
>
> **Created:** 2026-05-30 · **Owner:** Maya Allan · **Status:** PLANNING (no implementation until each section's gate clears — see §G).

---

## §A. Canonical documents (the only sources of truth)

| Role | File |
|---|---|
| **THE PLAN** (spine — scope, ordering, hard rules) | `docs/superpowers/specs/2026-05-30-listing-search-business-spine-master-plan.md` |
| **Companion — Tier 2** (external / StreetEasy / off-market) — *active, mostly complete* | `docs/superpowers/specs/2026-04-30-external-inventory-listings-design.md` |
| **Companion — Tier 3** (sponsor / Schedule A / new-development) — *active, mostly complete* | `docs/superpowers/specs/2026-04-30-sponsor-database-design.md` |
| Governance | `CLAUDE.md` · `NEON.md` · `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` · `.claude/skills/rebny-compliance/SKILL.md` |
| Operational records | `memory/REFACTOR-2026-04-25.md` · `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md` · `memory/SEARCH-SPINE-HANDOFF-2026-04-29.md` |
| ⛔ RESTRICTED (read-only, non-authoritative — do NOT use) | `docs/archive/superseded-2026-05-30/` (WIP vision + 2026-05-21 audit) |

---

## §B. Hard rules — every agent, every commit (condensed from plan §0)

1. **Search is the center.** Everything serves the loop: *Search → match → send/share → track → advise → show → offer/lease/sale → commission → repeat.*
2. **Cotality is the live source of record.** ALL listing info pulled **live from Cotality**; the DB is a cache only; live-validate before every open/send/share. No guessing, no stale data. (plan §0.8, §3.1)
3. **Triple compliance check before commit:** REBNY rules + project compliance suite + Cotality's data-use/display rules. Fail-closed. (plan §0.9)
4. **Health-tested, all-green before commit.** A failing test that flips green; full suite (§7.4) + feature tests must pass. No `--no-verify`, no silencing tests. (plan §0.10)
5. **No signaling pages.** Every surface traces to a real data source + a factual outcome. No vanity scores. Removal = flag-and-confirm with Maya. (plan §0.2)
6. **Normalized & canonical.** One registry, one search core, one canonical template/document. No `*-v2`/`*-new` files. (plan §0.4)
7. **Terminology = Cotality.** Use only **Cotality / Cotality Live Connect** naming for new files, identifiers, and UI; only REBNY keeps its name. Retiring the legacy module/column names is a tracked rename task (plan §10.1). (plan §0.11)
8. **T2/T3 never touch any public surface.** Separate tables, opt-in toggles default OFF, non-Cotality disclaimer, owner-PII reveal-gated, share-only to clients. (plan §3, §5)

---

## §C. Section → Agent → Branch → Journal → Status (the live board)

Each section is owned by ONE agent, on its OWN branch in an isolated worktree, writing its OWN resume-journal. Strict file-ownership = no collisions. No agent crosses its "Owns" boundary. Schema / migration / T2 / T3 / cron / env each STOP for Maya approval.

| # | Section (plan ref) | Agent focus | Branch | Journal | Owns (write) | Status |
|---|---|---|---|---|---|---|
| 0 | Stabilize #295 (plan §7 Phase 0) | Stabilize | `fix/sale-form-commission-history-building` (current) | `ops/agent-journals/00-stabilize.*` | sale-form / media / building load | ⬜ NOT STARTED |
| 1 | Canonical registry + search core (§2) | Search spine | `feat/search-registry-core` | `ops/agent-journals/01-registry-core.*` | `search-registry.json`, `lib/search/**` | ⬜ NOT STARTED |
| 2 | Agent search shell (§2.3–2.4) | Agent search | `feat/agent-search-shell` | `ops/agent-journals/02-agent-search.*` | `app/api/crm/search/**`, agent-search UI | ⬜ NOT STARTED |
| 3 | Money loops + send (§4) | Loops / send | `feat/money-loops-send` | `ops/agent-journals/03-money-loops.*` | `ListingSend`, send/collection routes + UI | ⬜ NOT STARTED |
| 4 | **Broker Command Center** (§6) — *top-notch* | Broker | `feat/broker-command-center` | `ops/agent-journals/04-broker.*` | broker routes, credential vault, doc library, Money&Action board, Marketing Hub, leads lifecycle | ⬜ NOT STARTED |
| 5 | Tier 2 — external / StreetEasy (§3.2) | T2 (HELD) | `feat/t2-external-inventory` | `ops/agent-journals/05-t2-external.*` | `lib/external-listings/**`, `external_inventory_*` | ⬜ NOT STARTED — Maya approval |
| 6 | Tier 3 — sponsor / Schedule A (§3.3) | T3 (HELD) | `feat/t3-sponsor` | `ops/agent-journals/06-t3-sponsor.*` | `lib/sponsor/**`, sponsor schema | ⬜ NOT STARTED — Maya approval |
| 7 | Compliance firewall + tests (§5, §3.4) | Compliance | `feat/tier-firewall-tests` | `ops/agent-journals/07-firewall.*` | reverse-pin CI tests, pre-send scans | ⬜ NOT STARTED |
| 8 | Client Portals + **Seller-Portal Pilot** (§12) | Portals | `feat/client-portals` | `ops/agent-journals/08-portals.*` | `app/portal/**`, `app/api/portal/**`, owner-link flow, anonymized engagement, deal-readiness tracker | ⬜ NOT STARTED — **Phase 3; starts ONLY after SEARCH + FIREWALL ready (NOT first)** |

*The Broker section (#4) is the one you flagged for a dedicated agent to make top-notch — it includes the NYS-tied credential vault, the document/template library, the Money & Action Board, the Marketing Hub, and the leads-lifecycle factual-stage-reason + verified-leads-plugin work.*

---

## §D. Auto-memory — resume protocol (so work continues after a freeze/shutdown)

Every agent writes its own memory so any interruption can be picked up exactly where it stopped.

**Files (per section, under `ops/agent-journals/`):**
- `<slug>.journal.jsonl` — append-only action log; one JSON line per action:
  `{"ts":"<iso>","step":"<n>","action":"<what>","files":["..."],"result":"ok|fail","next":"<what's next>"}`
- `<slug>.state.json` — resume pointer:
  `{"branch":"<branch>","last_completed_step":"<n>","status":"in_progress|blocked|done","blockers":["..."],"updated":"<iso>"}`

**Protocol:**
1. **On start/resume:** read `<slug>.state.json` + tail `<slug>.journal.jsonl` → determine last completed step → resume from the next step. Never redo completed work.
2. **On every meaningful action:** append to the journal, then update state.
3. **On block:** set `status:"blocked"` + record the blocker; stop; surface to Maya.
4. **On done:** set `status:"done"`; run the §7.4 suite; request review.

> The Workflow tool provides journaling + resume natively (same-session); these files are the durable, human-readable, cross-session mirror. Update the §C **Status** column from each section's `state.json`.

---

## §E. Status legend + global status

**Legend:** ⬜ NOT STARTED · 🟦 IN PROGRESS · ⏸️ BLOCKED (see blockers) · ✅ DONE (suite green) · 🔒 HELD (Maya approval)

**Global status (2026-05-30):** PLANNING. The plan + both companion specs are written and reviewed-pending. No section has started implementation. Phase 0 (#295) is the first gate.

**Next action:** Per-branch plans are written (`docs/superpowers/plans/branches/`). **Corrected execution order: STABILIZE → SEARCH + FIREWALL → AGENT + MONEY-LOOPS → PORTALS pilot → BROKER → (T2/T3 held).** Start with STABILIZE; **SEARCH + FIREWALL are the Phase-1 gate that must be ready before AGENT, PORTALS, sends, or T2/T3.** No code/implementation without Maya approval per branch.

---

## §F. Holds & gates (nothing past these without Maya)

- **Per-PR approval** for: schema/migration · `public/crm/**` · cron · env · Neon settings · agents/skills/workflows · force-push.
- **`NEON.md` discipline** before any migration (manual apply to prod before code merge).
- **T2/T3 implementation** (sections 5, 6) — explicit Maya approval to start (HELD per `memory/HOLD-EXTERNAL-INVENTORY-2026-04-30.md`; planning lifted, build gated).
- **StreetEasy scrape** — Maya's broker-of-record ToS memo recorded before scraper code (plan §3.2, §5.7, §9 D2).
- **NYS credential auto-sync** — read Open NY Terms of Use + register Socrata app token before go-live (plan §6.4, §9 D4).
- **Validation suite green** (plan §7.4) + section health tests before any commit.

---

*Control file — 2026-05-30. Update the §C status board and §E global status as work progresses; the detailed plan lives in the master plan (§A).*
