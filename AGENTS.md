# AGENTS.md — Cross-Agent Constitution (Claude · Codex · ChatGPT)

> **Single shared source of truth for every AI agent working on `mallan67/mallan-nyc`.**
> Claude reads this (pointer in `CLAUDE.md`), **Codex reads this natively** during PR review, and it
> is **paste-ready for ChatGPT**. When any tool's private memory disagrees with this file, **this file
> wins** — do not act on stale chat memory.

This project is a **live Cotality/Trestle (REBNY IDX Plus) synchronization platform** — not "an IDX
website." It has downstream consumers: search, CRM, portal, media, compliance, archive, email, contact.

---

## 0. How each tool gets on the same page

| Tool | Entry path |
|---|---|
| **Claude** | `CLAUDE.md` → this file → `docs/PROJECT-HEALTH-DASHBOARD.md` → latest handoff snapshot |
| **Codex** | this file (`AGENTS.md`) + **review the CURRENT HEAD commit of a PR, never stale bot comments** |
| **ChatGPT** | paste `AGENTS.md` + `docs/PROJECT-HEALTH-DASHBOARD.md` (it has no repo access) |

---

## 1. Invariants (never violate)

0. **ONE CRM. Never build a second one.** The CRM is `public/crm/index.html` -> built to
   `public/crm/index-built.html`, served at **`/crm`**. It holds Property Search (sale + rental, basic +
   advanced), Building search, Comparables/CMA, Manage Listings, Open Houses, saved searches and the
   sale/rental form entry points. **Add every CRM feature there.** Do NOT create a new shell, a new
   route table, a `*-v2` / `*-new` / `dashboard-*` page, or "a cleaner modular rebuild" - and do not add
   features to `public/crm/dashboard.html`, which is the RETIRED duplicate.
   - How this went wrong: `9716752d` "CRM v2 - modular dashboard replacing monolith" added a second CRM
     and repointed `/crm` at it. The monolith was never retired. Both shipped for months, agents worked
     in both, and on 2026-09-09 the owner reported *"i have no search right now"* - the real CRM was
     deployed and healthy the whole time and simply unreachable. A census found 72 routes in the
     duplicate: 2 already existed in the canonical app, 14 were dead stubs, 56 were unique.
   - Owner ruling, 2026-09-09: *"do not just point the crm, remove duplicates, agents go in there and
     create changes in that one and then they create another one... this cannot happen ever again."*
   - Enforced, not merely written down: `tests/runtime/crm-one-application.test.ts` fails if a page
     appears under `public/crm/` without a declared role, if any file outside the retired shell owns a
     `Router.register` table, if the retired shell grows, or if `/crm` stops serving the canonical app.
     `tests/runtime/crm-single-entry-point.test.ts` pins the front door.
   - `public/crm/dashboard.html` and `public/crm/js/dashboard/**` may only SHRINK, as its 56 unique
     capabilities are moved into the canonical CRM and it is deleted.

1. **Canonical Neon production** — project `hidden-mountain-87248164` ("neon-green-school", **Vercel-managed
   org** `Vercel: maya` / `org-wild-king-99967357`) · default branch **`main` = `br-crimson-frog-adr7g9gt`**
   · endpoint **`ep-cold-waterfall-adno3ao2`**. **Stale / do-not-serve:** `morning-bread-68708332` /
   `ep-royal-dawn-ad6eh8t2` (personal org). Never target the stale one. Full rules: `NEON.md`.
2. **Live Cotality/Trestle cadence is intentional** — `/api/cron/idx-sync` **every 10 min**,
   `/api/cron/media-sync` **every 15 min**, `/api/cron/db-keepalive` **every 15 min** (source of truth =
   `vercel.json`). Some route-file **comments are stale** (say "4 hours" / "4 minutes"). **Fix the
   comments, never the schedule**, unless Maya explicitly asks.
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
   **live Cotality API** (`api.cotality.com/trestle` `$metadata`), NOT a snapshot (no metadata snapshot is kept in the repository — the committed contract under `data/cotality-contract/` is compiled from the live feed and checked against it),
   NOT a hand-copied set, NOT another agent's list. The single generated source is
   `data/cotality-enums.live.json` (regenerate with `npm run cotality:pull`; the drift guard
   `npm run cotality:verify` fails if it or any code set diverges from live). If a status/field value is
   wrong in one place it is almost certainly wrong in the copies elsewhere — **verify the whole surface,
   never one file.** Known live truths (2026-07-05): `StandardStatus` = {Active, ActiveUnderContract,
   Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete, Pending, Withdrawn} (spelling is
   **`Canceled`**, one L — never "Cancelled"); "Sold"/"Rented" exist in **no** Cotality enum;
   `Permission` has **no** "OwnerOptOut"; `PropertyType` is camelCase (`ResidentialLease`, never
   "Residential Lease"). Full audit: `docs/audits/cotality-status-truth-audit-2026-07-05.md`.

8. **Semantic authority — no agent may invent meaning.** THE LOCKED RULE (Maya, 2026-09-09):
   > No surface control, API field, persisted fact, Search criterion, CMA field, report field or
   > compliance rule may refer directly to an assumed provider meaning. Every active datum must resolve
   > through **one** Mallan semantic concept. A provider binding must identify the verified **resource,
   > path, field, type and entitlement**. A Mallan-owned concept must identify its **canonical storage
   > and business authority**. Every writer and reader must bind to the **same** concept. Unresolved
   > active writable concepts **fail closed**.

   See §1A. This exists because Mallan does not have a testing problem, it has a missing
   semantic-compiler problem: agents were inferring meaning from HTML ids, aliases, provider-looking
   names, JSON buckets, comments and old audits, so every agent reached a different conclusion.

---

## 1A. Semantic authority (read before touching any field, control, criterion or mapping)

**Five things must stay separate. Never let one name carry more than one of them.**

| # | Layer | Question it answers |
|---|---|---|
| 1 | Cotality raw fact | What exactly did Cotality expose? resource + path + field + type + enum + permission |
| 2 | Mallan business concept | What does the fact mean to this brokerage? |
| 3 | Mallan storage | Where is Mallan's version/history persisted? |
| 4 | Surface control | Which form / search / report / workspace control reads or writes it? |
| 5 | Business consumers | Search · CMA · CRM · Portal · Reports · Compliance · Marketing |

A name like `RentingAllowedYN` was being asked to mean all five. That is the defect.

**Provider identity is never `fieldName → yes/no`.** That check produces confident wrong answers.
Worked example, verified 2026-09-09: `ManagementCompanyName` is **absent** from Property, **present** on
the `Building` resource in the field catalogue, and `Building` returns **403 (not entitled)**. Three
different answers to what a name-only lookup treats as one question. Always resolve resource + path +
entitlement, and remember a fact can be **observed in delivered payloads without being a first-class
field** (e.g. `ManagingAgencyListingYN`: 89,230 populated observations, not on the Property contract).

**Semantic states** (a TypeScript discriminated union, exhaustively checked — adding a state must force
every branch to handle it): `verified-provider` · `verified-mallan` · `derived` · `ui-only` ·
`legacy-alias` · `unresolved` · `forbidden`.

**An alias is never authority.** `SecurityDeposit → DepositAmount` means only "an old surface used this
historical name." It must never imply the target is a Cotality field. An alias points at a *concept*;
the concept decides source and storage.

**Controls belong to concepts; concepts do not belong to controls.** Thousands of surface instances map
to hundreds of concepts and a smaller set of canonical storage facts. Never mint one concept per control.

**Exhaust system evidence before escalating to Maya.** For an unresolved concept, produce the evidence
packet first: does Cotality expose it (live resource + exact path) · have we actually received it (raw
sample) · is it in the runtime surface census · what does the label say · does the collector write it ·
does the API accept it · is it persisted (exact column / JSON path) · does reload restore it · who reads
it · does the Master Plan require it · is it governed by a compliance rule. Only what survives all of
that is `OWNER DECISION REQUIRED`. Most cases resolve to delete-legacy-alias, map-to-existing-concept,
Mallan-owned-fact, or provider-nested-observation.

**Runtime census, not HTML grep.** Static text cannot prove what the browser creates. A behavioural
claim needs the real page driven end to end: set value → real collector → real API → persistence →
reload → hydrate → verify meaning survived. A validator that greps is worse than none, because it counts
as coverage: today a REBNY gate could be satisfied by a comment, and two compliance scanners passed
while matching zero elements.

**Four different jobs. Do not collapse them.** JSON Schema = structural validity · semantic kernel =
meaning · behavioural tests = actual execution · compliance engine = legal and business constraints.

**Declare consumers.** Every concept names its producer and its consumers, so a change cannot quietly
fix Search while breaking CMA. "What else can this damage?" must be answerable by the machine.

**What "green" must mean.** Today green means the tests agree with the current implementation, which is
not enough. The target gate: provider contract valid · all active surfaces censused at runtime · zero
undeclared active controls · zero unresolved writable concepts · every writable concept has storage ·
every stored concept has reload proof · every provider fact has resource/path provenance · every
consumer declared · direct and negative tests · integration · downstream · compliance · browser proof.
Only then may `semanticSubmissionReady` be true.

**Current state, so nobody overstates it.** The authority kernel exists on branch
`fix/cotality-authority-kernel-2026-09-09` (not merged): 5 seed concepts, `semanticSubmissionReady:
false`, `listingWriteCapability: unavailable`, 16 unresolved alias declarations and 2 unresolved surface
controls. The runtime census is not installed. **Do not** hand-expand the seed concepts, and **do not**
repair the 16 aliases one by one — that would encode today's misunderstandings permanently. Order:
runtime census → semantic evidence graph → concept classification → surface manifests → compiler →
delete the greps. Only then populate the registry at scale.

**Process rules for multi-agent work** (learned 2026-09-09, when locally-green lanes produced 41
integration failures): file ownership prevents collisions, not semantic breakage — no lane declares done
on its own files; the integrated suite plus the validators is the gate. State per check what it proves
**and what it does not** (§J.8). Never loosen a test to make it pass; if you change an expectation, say
what it still proves.

---

## 2. Non-negotiable holds (require explicit Maya approval)

Gate 6 `--execute` / any archive-drain execute / 20K–80K batches · manual cron trigger · Vercel env
changes · Neon reclaim/downgrade · `VACUUM FULL` · `rotate-db-keys` · production migrations
(`prisma migrate deploy` / `db push`) · PR-5B · projection backfill · PageSpeed/media lane ·
notification dispatcher · open-house v2 · admin merge bypass · force-push to main. (Full list + why:
`CLAUDE.md` §C and the handoff snapshot.)

## 3. Where truth lives

| Topic | File |
|---|---|
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
