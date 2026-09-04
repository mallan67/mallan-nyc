# AGENTS.md — Cross-Agent Constitution (Claude · Codex · ChatGPT)

> **Single shared source of truth for every AI agent working on `mallan67/mallan-nyc`.**
> Claude reads this (pointer in `CLAUDE.md`), **Codex reads this natively** during PR review, and it
> is **paste-ready for ChatGPT**. When any tool's private memory disagrees with this file, **this file
> wins** — do not act on stale chat memory.

This project is a **live Cotality/Trestle (REBNY IDX Plus) synchronization platform** — not "an IDX
website." It has downstream consumers: search, CRM, portal, media, compliance, archive, email, contact.

---

## 0. How each tool gets on the same page

**Every agent reads `docs/architecture/MALLAN-PLATFORM-PLAN.md` first.** It is the single normative
platform plan. This file is the cross-agent constitution; it routes and constrains, it does not restate
the architecture.

| Tool | Entry path |
|---|---|
| **Claude** | `CLAUDE.md` → this file → **the canonical plan** → `docs/PROJECT-HEALTH-DASHBOARD.md` → latest handoff |
| **Codex** | this file (`AGENTS.md`) + **review the CURRENT HEAD commit of a PR, never stale bot comments** |
| **Copilot** | `.github/copilot-instructions.md` → this file → the canonical plan |
| **ChatGPT / other connected tools** | this file + `docs/PROJECT-HEALTH-DASHBOARD.md` + the canonical plan |

> **Repository access is a per-tool, per-session fact — do not assert it here.** An earlier revision
> stated flatly that ChatGPT "has no repo access." Connected tools may or may not have repository access
> depending on how the session is configured, so the honest instruction is: **if a tool can read the
> repository, it reads these files directly; if it cannot, paste them.** Either way the files win over
> any tool's private memory.

---

## 1. Invariants (never violate)

1. **Canonical Neon production** — project `hidden-mountain-87248164` ("neon-green-school", **Vercel-managed
   org** `Vercel: maya` / `org-wild-king-99967357`) · default branch **`main` = `br-crimson-frog-adr7g9gt`**
   · endpoint **`ep-cold-waterfall-adno3ao2`**. **Stale / do-not-serve:** `morning-bread-68708332` /
   `ep-royal-dawn-ad6eh8t2` (personal org). Never target the stale one. Full rules: `NEON.md`.
2. **Live Cotality/Trestle cadence is intentional** — ingestion runs as a single
   **`/api/cron/one-cycle`** job on **`*/10 * * * *`** (every 10 minutes). **`vercel.json` is the source
   of truth**; verify against it, never against prose. Some route-file **comments are stale** (say
   "4 hours" / "4 minutes"). **Fix the comments, never the schedule**, unless Maya explicitly asks.
   *(Corrected 2026-07-30, restated after review: this entry previously named `/api/cron/idx-sync`,
   `/api/cron/media-sync` and `/api/cron/db-keepalive` as separately scheduled jobs. Verified directly
   against `vercel.json` at `04db1b99`: **`/api/cron/one-cycle` is the only scheduled ingestion cron**;
   **`/api/cron/idx-sync` and `/api/cron/media-sync` are still PRESENT in `vercel.json` under the
   `functions` block** as route-specific duration overrides, but are **not independently scheduled under
   `crons`**; **`/api/cron/db-keepalive` is absent from `vercel.json` entirely**. An earlier revision of
   this note said none of the three appears in the file at all — that was false for the first two and
   could lead an agent to overlook live route configuration. Recorded per `C-7`: measured statements are
   dated evidence and they drift.)*
3. **Proof-first** — a change is not "done" without a failing test that flips green, a live URL/runtime-log
   proof, or a direct source read (static claims only). Source-grep alone never proves rendering/behavior.
4. **Fail-closed** — if a REBNY/RLS/IDX/FARE/Fair-Housing rule is unclear or a canonical file is missing,
   STOP and report; do not guess or extrapolate across feeds/fields.
5. **Review the current HEAD** — a Codex/reviewer comment against an older commit is **not** a blocker if
   the current HEAD already addresses it. Always check the PR's current head SHA first.
6. **Compliance-first** — anything touching listings, IDX, syndication, CRM lead/contact, intake forms,
   display gates, media, or public text: read `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` first.
7. **Cotality is the sole authority — always live, never a copy, never a spot-check** (Maya law,
   2026-07-05). Every listing **status, field name, and picklist value** must be verified against the
   **live Cotality API** (`api.cotality.com/trestle` `$metadata`), NOT a snapshot (`artifacts/metadata.xml`),
   NOT a hand-copied set, NOT another agent's list. The single generated source is
   `data/cotality-enums.live.json` (regenerate with `npm run cotality:pull`; the drift guard
   `npm run cotality:verify` fails if it or any code set diverges from live). If a status/field value is
   wrong in one place it is almost certainly wrong in the copies elsewhere — **verify the whole surface,
   never one file.** Known live truths (2026-07-05): `StandardStatus` = {Active, ActiveUnderContract,
   Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn} (spelling is
   **`Canceled`**, one L — never "Cancelled"); "Sold"/"Rented" exist in **no** Cotality enum;
   `Permission` has **no** "OwnerOptOut"; `PropertyType` is camelCase (`ResidentialLease`, never
   "Residential Lease"). Full audit: `docs/audits/cotality-status-truth-audit-2026-07-05.md`.

## 2. Non-negotiable holds (require explicit Maya approval)

Gate 6 `--execute` / any archive-drain execute / 20K–80K batches · manual cron trigger · Vercel env
changes · Neon reclaim/downgrade · `VACUUM FULL` · `rotate-db-keys` · production migrations
(`prisma migrate deploy` / `db push`) · PR-5B · projection backfill · PageSpeed/media lane ·
notification dispatcher · open-house v2 · admin merge bypass · force-push to main. (Full list + why:
`CLAUDE.md` §C and the handoff snapshot.)

## 3. Where truth lives

| Topic | File |
|---|---|
| **Platform architecture, business rules, cross-system contracts, implementation sequence** | **`docs/architecture/MALLAN-PLATFORM-PLAN.md` — the single normative plan (`DOC-1`)** |
| **Retired identifiers, open conflicts, deferred items** | `docs/architecture/MALLAN-PLATFORM-PLAN.md` §0.8, §1.2, §18 — normative |
| Historical reconciliation evidence (**non-normative**, not in this repo) | archival tag `archive/platform-plan-reconciliation-corpus-53688877` |
| Cross-agent constitution (this) | `AGENTS.md` |
| Live operational status | `docs/PROJECT-HEALTH-DASHBOARD.md` (auto tier via `npm run health:probe`) |
| **All tracked issues / incidents / debt / risks** | `docs/PLATFORM-ISSUE-REGISTRY.md` (IDs, Evidence Scores, hypotheses) |
| Dated session snapshot | `docs/operations/site-audit-handoff-YYYY-MM-DD.md` |
| Claude-specific command center | `CLAUDE.md` |
| Neon / Prisma / DB rules | `NEON.md` |
| Compliance per-area map | `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` |
| REBNY skill | `.claude/skills/rebny-compliance/SKILL.md` |
| **Cotality enum truth (status/field/picklist)** | `data/cotality-enums.live.json` (generated live via `npm run cotality:pull`; guarded by `npm run cotality:verify`). The live API is authority; this file is its verified mirror. |

### Canonical Documentation (Maya directive 2026-07-01)

These files are the authoritative operational documents for this repository:

0. **`docs/architecture/MALLAN-PLATFORM-PLAN.md`** — the single **normative** plan. Added 2026-07-30 by
   the planning reconciliation. Only this file establishes platform-wide architecture, business rules,
   implementation sequence or cross-system contracts (`DOC-1`). The documents below are **operational**;
   where operational status and the plan appear to disagree, the operational documents describe *what is*
   and the plan describes *what must be* — neither overwrites the other.
1. `AGENTS.md`
2. `docs/PROJECT-HEALTH-DASHBOARD.md`
3. `docs/PLATFORM-ISSUE-REGISTRY.md`
4. `docs/operations/site-audit-handoff-YYYY-MM-DD.md`
5. `docs/operations/handoff-neon-gate6-YYYY-MM-DD.md`

**Do not create parallel governance documents** (no `STATUS.md`, `NOTES.md`, `TODO.md`, or other
competing sources of truth). Extend or update these instead.

## 4. Handoff rule (binds every agent, every session)

Before ending a session or handing off:
1. Run **`npm run health:probe`** (read-only) to refresh the dashboard's auto tier.
2. Update any **assessed-tier** rows you actually verified (with evidence). Leave the rest ⚪ UNVERIFIED.
3. Update the dated **handoff snapshot** with: date/time, main SHA, open PRs, latest prod deploy, last-24h
   runtime errors, unresolved blockers, what changed, exact stop point.
4. Never mark a status 🟢 without captured proof. Never rely on chat memory alone.

## 5. Evidence language rule (binds every agent, every report — Maya directive 2026-07-01)

- The words **"probably," "likely," "appears," "root cause"** are FORBIDDEN in any issue entry or
  status report, EXCEPT (a) prefixed **`Hypothesis H-###`** and entered in the Hypothesis Register
  of `docs/PLATFORM-ISSUE-REGISTRY.md` with **Observed · Evidence · Missing · Confidence · Next
  verification**, or (b) "root cause" backed by an Evidence Score ≥ 9 on the same line.
- Every registry item carries an **Evidence Score (0–10)** — one point per captured field
  (endpoint · source · request · response · stack trace/log · DB query · repro · user impact ·
  frequency/timestamps · environment) with the ✗ fields listed. 9–10 act · 6–8 act naming the
  gaps · ≤5 verify before touching production.
- A hypothesis mistaken for a diagnosis is a process failure; wording must make the difference
  impossible to miss across sessions and across agents.
- **Derived-summary invariant (Maya 2026-07-02):** changing any issue requires updating every
  derived summary in the same PR (Issue Row → Priority Table → P0/P1 Summary → Dashboard →
  Handoff). Any stale layer = the PR is incomplete.
- **Single-ID invariant (Maya 2026-07-02):** every issue has exactly one ID, defined in the
  Platform Issue Registry; all other documents reference the ID instead of duplicating the
  description.

## 6. Review policy (binds every merge decision — Maya directive 2026-07-03)

- **Codex is PREFERRED, not mandatory** — one strong reviewer, not the gatekeeper. The standard is
  evidence-based and multi-reviewer.
- **High-risk PRs** require EITHER a clean Codex review OR **two independent clean reviews plus a
  written exception note.**
- **High-risk** = migrations · env flags · cron · archive/shedding · billing/storage · public
  compliance surfaces · contact/lead writes · seller-report attribution.
- **Low-risk docs/read-only PRs** require: CI green · one independent review · no unrelated files ·
  and no unresolved Codex finding if Codex is available.
- **Any Codex finding** must be FIXED, proven PRE-EXISTING and split to its own issue, or
  documented as future-gated / out-of-scope — never silently ignored.

## 7. Current status (pointer, not a copy)

Live status → `docs/PROJECT-HEALTH-DASHBOARD.md`. Narrative → latest handoff snapshot. As of
2026-07-02: **PR #465 (rehydration guard) and #466 (governance) are MERGED** and deployed
(`858da234`); the guard is under registry **RW-004** regression watch. **OPS-009 archive controls
are IMPLEMENTED + deployed (#470) and the kill-switch proof is VERIFIED (OPS-020, 03:00:46Z).**
**Gate 6 has NOT executed.** Next gate is Maya's `ARCHIVE_ENABLED=true` MAINTENANCE decision, then the
5K pilot — which also requires a **FRESH rollback branch: the prior one was auto-pruned 2026-07-03
(OPS-022), so no rollback branch currently exists.** Roadmap: SEO-001 ✅ · OPS-009 ✅ (awaiting flag) ·
5K pilot (blocked on OPS-022 + flag) · OPS-017.
