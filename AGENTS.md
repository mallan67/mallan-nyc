# AGENTS.md — Cross-Agent Operating Instructions (Claude · Codex · ChatGPT)

> **Shared OPERATING INSTRUCTIONS for every AI agent working on `mallan67/mallan-nyc`.**
> Claude reads this (pointer in `CLAUDE.md`), **Codex reads this natively** during PR review, and it
> is **paste-ready for ChatGPT**. When any tool's private chat memory disagrees with this file, **this
> file wins over the memory** — do not act on stale chat memory.
>
> ## AUTHORITY ORDER — this file is rank 3, and knows it
>
> | Rank | File | What it is authority for |
> |---|---|---|
> | 1 | `docs/Master Bus Plan work in progress/MALLAN-PLATFORM-MASTER-PLAN.md` | **The ONLY product/system authority.** What the platform IS, which applications exist, what each owns. |
> | 2 | `MALLAN-CONTINUOUS-EXECUTION-STATE.md` | Where execution currently stands, when present and current. |
> | 3 | **`AGENTS.md` (this file) · `CLAUDE.md`** | **How agents work without violating 1 and 2.** |
>
> This file is **NOT** a product or system authority and must never override the Master Plan. Where it
> states an architectural invariant it **MIRRORS** the Master Plan — it does not define it.
> **If this file disagrees with the Master Plan, the Master Plan wins and this file is the defect.**
> Say so and correct it; do not act on the stale copy. Do not create another authority document.
>
> Why this is written down: on 2026-09-10 §1 invariant 0 below, and `CLAUDE.md` §A.0, were found
> asserting an architecture the repository had already disproven — and this file is what **Codex**
> reads. Correcting one agent's instructions while another agent is still told the opposite is not a
> correction. **`AGENTS.md` and `CLAUDE.md` move together, always.**
>
> *(Status note, 2026-09-10: `MALLAN-CONTINUOUS-EXECUTION-STATE.md` does not currently exist anywhere
> in the repository or working tree, although the session-start hook names it. Rank 2 is vacant. Do
> not invent a replacement — that is Maya's document to create.)*

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

0. **THREE APPLICATIONS, THREE ADDRESSES, ONE OWNER EACH.** Mirrored from Master Plan §5.1. The
   separation is a **compliance and audience-rights boundary**, not a refactoring opportunity.

   **ONE BROKERAGE CRM** — `public/crm/dashboard.html` + `public/crm/js/dashboard/**`.
   Canonical human entry **`/crm`**; compatibility **`/crm/dashboard`**. It owns brokerage-operating
   capabilities: broker dashboard · agent roster · clients · leads · deals · commissions · referrals ·
   finance · compliance · brokerage documents · tasks/communications · Agent My Business ·
   administration.
   **DO NOT** create another CRM shell, another CRM route table, or an alternate dashboard.
   **DO NOT** migrate Search/Listings into the CRM merely to "converge" applications.

   **ONE BACKEND AGENT SEARCH / LISTINGS PLATFORM** — `public/crm/index.html` → generated
   `public/crm/index-built.html`. Current professional entry **`/crm/search`**. It owns professional
   listing work: backend agent property search · My Listings · listing detail / listing workspace ·
   professional saved searches · sale listing editor · rental listing editor · buildings and property
   intelligence · media · open houses · compare/CMA · listing reports and distribution ·
   listing-related tools and calculators.
   It **may consume CRM APIs and data** where brokerage workflow requires it. It **MUST NOT require
   `dashboard.html` or the CRM router to boot, render or execute.** The CRM may launch it.
   Dependency: **CRM → Backend Search/Listings**, never Backend Search → CRM shell.
   **DO NOT** create another Backend Search, another My Listings, or another listing writer.

   **FRONTEND CONSUMER SEARCH REMAINS SEPARATE** — `app/search/page.tsx`, at **`/search` `/buy`
   `/rent`**. This is the public Consumer Search, deliberately separate from Backend Agent Search for
   compliance and audience-rights reasons.
   **DO NOT** move professional/member-only Search functionality into `/search`.
   **DO NOT** expose professional, member-only or private data through the Consumer Search DTO.
   The two products **may share** verified lower-level infrastructure — Cotality client/auth ·
   semantic mappings · vocabulary · listing identity · building identity · media authority ·
   normalization · address/status — but **retain separate** DTOs · permissions · filter contracts ·
   caches · tests · Saved Search semantics · user actions.

   - `index-built.html` INLINES all its JavaScript — a source change is not live until
     `node public/crm/build.js` runs. `tests/runtime/crm-build-drift.test.ts` proves the artifact
     reproduces from source byte for byte, identically on Windows and Linux.
   - Enforced, not merely written down: `tests/runtime/crm-single-entry-point.test.ts` pins each
     application to its own address and keeps the public and professional applications from resolving
     to each other. `tests/runtime/crm-one-application.test.ts` fails if a page appears under
     `public/crm/` without a declared role, if a second hashchange owner appears, or if a runtime
     module addresses the CRM by build artifact instead of by route.

   **HISTORICAL CORRECTION — do not erase this.** Until 2026-09-10 this invariant read *"ONE CRM.
   Never build a second one. The CRM is `public/crm/index.html` → `index-built.html`, served at
   `/crm` … `public/crm/dashboard.html`, which is the RETIRED duplicate"*, told agents to **add every
   CRM feature** to `index-built.html`, claimed Property Search / My Listings / CMA / Open Houses
   belong inside the CRM, and declared that `dashboard.html` and `js/dashboard/**` **"may only SHRINK
   … and it is deleted."** **Every one of those statements is disproven and must not be reinstated.**

   The real defect was never "two CRMs". It was **application-ownership and routing confusion**:
   Backend Search/Listings and the CRM were mistaken for duplicate shells of a single product, and
   `/crm` was repointed at Backend Search. A browser at `/crm` therefore reached Search while the
   installed PWA (`start_url` `/crm/dashboard`) reached the CRM — which is exactly why the owner
   reported *"i have no search right now"* and *"seriously how it can be that there are two crms?"*
   about applications that were deployed and healthy the whole time. A forensic census settled it:
   `dashboard.html` carries 71 `Router.register` routes and **no search engine**; `index-built.html`
   carries the search form, executor and renderer and **no CRM panels**. Corrected in `928f31c4`.

   - Owner ruling, 2026-09-09, which still stands and is about DUPLICATES, not about applications:
     *"do not just point the crm, remove duplicates, agents go in there and create changes in that one
     and then they create another one... this cannot happen ever again."*
   - The duplicate **My Listings** implementation deleted in `da8e3046` was a genuine duplicate and
     **stays deleted.** Do not resurrect it.
   - The CRM's **Property Search control is a LAUNCHER** into Backend Search. A launcher is not a
     duplicate Search. It is legitimate and it remains.

1. **Canonical Neon production** — project `hidden-mountain-87248164` ("neon-green-school", **Vercel-managed
   org** `Vercel: maya` / `org-wild-king-99967357`) · default branch **`main` = `br-crimson-frog-adr7g9gt`**
   · endpoint **`ep-cold-waterfall-adno3ao2`**. **Stale / do-not-serve:** `morning-bread-68708332` /
   `ep-royal-dawn-ad6eh8t2` (personal org). Never target the stale one. Full rules: `NEON.md`.
2. **Live Cotality/Trestle cadence is intentional** — there is ONE scheduled entry point:
   `/api/cron/one-cycle-preflight` **every 10 minutes** (`*/10 * * * *`), which drives `idx-sync` and
   `media-sync` as **in-process members** of `/api/cron/one-cycle` (`app/api/cron/one-cycle/route.ts`
   `MEMBER_NAMES` / `runIdxSyncMember` / `runMediaSyncMember`). Neither `idx-sync` nor `media-sync`
   has its own `crons[]` entry any more, and `/api/cron/db-keepalive` **no longer exists** (route
   deleted 2026-08-07, `2e641f11`). Source of truth = the `crons[]` array in `vercel.json`
   (20 entries today), always read live, never quoted from memory.
   **Correction 2026-09-10:** this invariant previously read "`/api/cron/idx-sync` **every 10 min**,
   `/api/cron/media-sync` **every 15 min**, `/api/cron/db-keepalive` **every 15 min**" — none of those
   three has a `crons[]` entry, and the two stale route-file comments it cited ("4 hours" /
   "4 minutes") are not present in the repo either. If you find a route-file **comment** quoting an
   old cadence, **fix the comment, never the schedule**, unless Maya explicitly asks.
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

**The authority order at the top of this file governs this table.** Nothing listed here is a product
or system authority; the Master Plan is. These are where OPERATING truth is recorded.

| Topic | File |
|---|---|
| **Product / system authority — what the platform IS** | `docs/Master Bus Plan work in progress/MALLAN-PLATFORM-MASTER-PLAN.md` |
| **Execution state — where work currently stands** | `MALLAN-CONTINUOUS-EXECUTION-STATE.md` *(does not exist as of 2026-09-10)* |
| Cross-agent operating instructions (this) | `AGENTS.md` |
| Live operational status | `docs/PROJECT-HEALTH-DASHBOARD.md` (auto tier via `npm run health:probe`) |
| **All tracked issues / incidents / debt / risks** | `docs/PLATFORM-ISSUE-REGISTRY.md` (IDs, Evidence Scores, hypotheses) |
| Dated session snapshot | `docs/operations/site-audit-handoff-YYYY-MM-DD.md` |
| Claude-specific command center | `CLAUDE.md` |
| Neon / Prisma / DB rules | `NEON.md` |
| Compliance per-area map | `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` |
| REBNY skill | `.claude/skills/rebny-compliance/SKILL.md` |
| **Cotality enum truth (status/field/picklist)** | `data/cotality-enums.live.json` (generated live via `npm run cotality:pull`; guarded by `npm run cotality:verify`). The live API is authority; this file is its verified mirror. |

### Canonical Documentation (Maya directive 2026-07-01, scope clarified 2026-09-10)

These are the authoritative **OPERATIONAL** documents for this repository — how work is run,
tracked and handed off. They are **not** product or system authority; that is the Master Plan, and
the authority order at the top of this file governs.

1. `AGENTS.md`
2. `docs/PROJECT-HEALTH-DASHBOARD.md`
3. `docs/PLATFORM-ISSUE-REGISTRY.md`
4. `docs/operations/site-audit-handoff-YYYY-MM-DD.md`
5. `docs/operations/handoff-neon-gate6-YYYY-MM-DD.md`

**Do not create parallel governance documents** (no `STATUS.md`, `NOTES.md`, `TODO.md`, or another
authority file). Extend or update these instead. If one of them states an architectural fact that
contradicts the Master Plan, the Master Plan wins and the operational document is the defect.

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
