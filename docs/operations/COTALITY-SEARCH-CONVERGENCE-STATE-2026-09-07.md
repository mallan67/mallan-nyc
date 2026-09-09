# COTALITY-ONLY FEED + SEARCH CONVERGENCE — EXECUTION STATE

> **Purpose.** This file exists so that a compaction, a session end, or a new agent does
> **not** restart this program or divert it into a fourth parallel attempt. Read this file
> before touching Search, provider vocabulary, or any RLS/RESO/RealPlus reference.
>
> **Subordinate to:** `MALLAN-PLATFORM-MASTER-PLAN.md` (product/system authority) and
> `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` (execution-state authority).
> Where either disagrees with this file, they win and this file is stale.
>
> **Non-authoritative:** AI memory, handoff files, old chats, prior audits, generated
> summaries. Provider truth comes ONLY from the live authenticated Cotality API.

**Opened:** 2026-09-07
**Authorized checkout:** `C:\Users\MayaAllan\Desktop\mallan-nyc` — the ONLY folder. No
worktrees, no clones, no other copies.
**Owner directive this session (verbatim intent):**
1. The ONLY feed is the Cotality API on Trestle.
2. `RLS IDX`, `RealPlus`, `Real Plus`, `RESO` references are to be **deleted, safely**.
3. **RLS may remain ONLY in a compliance capacity — never as the feed.**
4. The entire Search must be systematically fixed.
5. Context must be retained across sessions/compaction so progress continues, not diverts.
6. **SCOPE: BACKEND SEARCH ONLY. Backend search is a different product from public search.
   DO NOT MIX THEM.**

### 0.0 SCOPE FENCE — backend vs public

`MALLAN-PLATFORM-MASTER-PLAN.md` §5.1 already mandates this: *"Separate Frontend and Backend
Search products."* This program touches **backend only**.

| | IN SCOPE — backend / authenticated | OUT OF SCOPE — public / frontend |
|---|---|---|
| Routes | `app/api/idx/search/**`, `app/api/crm/saved-searches/**`, `app/api/crm/**search**`, CRM building/comp/CMA lookups | `app/api/listings/**`, `app/api/listings/similar`, `app/api/buildings/**` (public), `app/api/open-houses` |
| Pages / UI | `public/crm/**` search UI (⚠️ approval hold) | `app/search/**`, `app/components/Search*.tsx`, `app/listing/[...slug]/**` |
| Foundation | `lib/search/canonical/**`, `lib/search/engine/**`, `lib/search/core.ts` | `lib/search/public-listing-db.ts`, `lib/search/public-listing-trestle.ts` |
| Execution-state lane | **§6 Authenticated final universe / count / pagination — ACTIVE** | "Public Search correctness sub-lane — **CLOSED** at `2d55ce6a`" |

The public sub-lane is **CLOSED with an accepted SHA**. Do not reopen it, do not refactor it as
a side effect, and do not let a shared module change silently alter public behavior. Where a
module is genuinely shared (e.g. a vocabulary or a compliance gate), changes must be proven
**non-regressive for public** before landing — but public correctness work is not this program.

---

## 0. LAW — provider vocabulary (proposed; enforce in CI)

| Term | Status | Where it may appear |
|---|---|---|
| **Cotality** / **Trestle** | ✅ The one and only data feed | Anywhere a data source is named |
| **RLS** | ⚠️ **Compliance only** | REBNY RLS rules, UCBA, display rules, distribution gates, attribution, licensing, submission obligations |
| **RLS feed / RLS IDX / RLS API / "from RLS"** | ❌ **BANNED** | Nowhere |
| **RESO feed / RESO API / RESO as authority or fallback** | ❌ **BANNED** | Nowhere |
| **RealPlus / Real Plus** | ❌ **BANNED** | Nowhere |
| **IDX** | ⚠️ Split — see §5 | `IDX Plus` (REBNY product) and IDX **display rules** are compliance. "The IDX feed" is banned. |

**Fail-closed rule.** If it is unclear whether an occurrence is compliance or feed, it is
**feed** and it goes. Compliance usage must be provable from the surrounding sentence.

---

## 0.1 THE LAYERING LAW (owner-issued, 2026-09-07) — THIS IS THE ARCHITECTURE

```
COTALITY RAW CONTRACT
        ↓
VERIFIED COTALITY CONTRACT / VOCABULARY
        ↓
ONE COTALITY ACCESS + MAPPING LAYER
        ↓
ONE MALLAN SEARCH FOUNDATION
        ↓
MALLAN BUSINESS / COMPLIANCE RULES
        ↓
MULTIPLE SEARCH CONSUMERS
```

**Rules.** Dependencies point downward only. Every layer above the last has **exactly one**
implementation. "Multiple" is legal at the consumer layer and **nowhere else**. A consumer may
never reach around the foundation into the access layer. Compliance is applied **once**, at L5,
**above** the foundation — never inside the provider mapper.

**This makes the vocabulary law mechanically checkable:**

| Layer | May name the provider as | May say "RLS" |
|---|---|---|
| L1 Cotality raw contract | Cotality / Trestle only | ❌ except verbatim provider response text |
| L2 Verified vocabulary | Cotality / Trestle only | ❌ |
| L3 Access + mapping | Cotality / Trestle only | ❌ |
| L4 Search foundation | Cotality / Trestle only | ❌ |
| **L5 Business / compliance** | Cotality / Trestle only | ✅ **RLS lives here and ONLY here** |
| L6 Consumers | Cotality / Trestle only | ❌ (consume L5 decisions) |

`RESO` and `RealPlus` are banned at **every** layer, **with NO carve-out at any layer including
L1** (owner ruling 2026-09-07 — see §13). Cotality may emit the literal token `RESO` in raw
payloads (its `Cotality.DataStandard.RESO.DD` type namespace, its `RESOStandardYN` field). That
is **opaque raw provider content**. It does **not** authorize Mallan code, documentation,
filenames, scripts, comments or tests to use RESO terminology. Above the raw boundary, Mallan
exposes Cotality/Mallan-neutral concepts only.

The **only** narrow provider-literal carve-out is for **`RLS`** as raw provider DATA
(`OriginatingSystemName`, `ListingId` prefix, verbatim error text) — and only at L1, interpreted
once by the adapter. See §12.6.

### Current state vs the law — every layer is violated

| Layer | Required | Actual | Verdict |
|---|---|---|---|
| **L1** | Live API is the raw contract | `artifacts/metadata.xml` is a **stale snapshot** treated as contract | ❌ |
| **L2** | ONE dated verified vocabulary | **8+ competing**: `data/RLS-FIELD-REGISTRY.md`, `data/rebny-rls-property-fields.csv`, `data/rebny-rls-property-lookup.csv`, `artifacts/metadata.xml`, `lib/cotality/cotality-enums.ts`, `data/cotality-property-fields.live.json` (branch-only), `public/crm/js/core/reso-field-map.js`, `public/crm/data/search-fields-schema.json` | ❌ |
| **L3** | ONE access + ONE mapper | `lib/idx/` (auth/fetch/sync/trestle-mapper) **plus a second mapper** `lib/idx/mapping.ts::mapRESOToInternal`, **plus** `lib/search/engine/provider-client.ts` + `provider-query.ts` (branch), **plus** `scripts/reso/*`, **plus** `scripts/trestle-*` | ❌ |
| **L4** | ONE foundation | **THREE rival lineages** — `canonical/` (#618), `engine/` (consolidation branch), and main's `core.ts`/`criteria-to-prisma.ts` | ❌ **headline defect** |
| **L5** | Compliance applied once, above L4 | **FIVE competing `TERMINAL_STATUSES`** + a test that mocks its own; and `idx_display_yn` is computed **inside the L3 provider mapper** — a layer inversion | ❌ |
| **L6** | Consumers read L5 only | `app/api/listings/route.ts` merges DB + live provider itself, reaching around L4 into L3 | ❌ |

**Work order follows the arrows.** L2 must be settled before L3; L3 before L4; L4 before the
three lineages can be adjudicated; L5 before consumers are rewired. Fixing L4 first — which is
what the "consolidation" attempted — cannot converge, because L2 and L3 are still plural
underneath it. **That is the mechanical reason the consolidation produced a third architecture
instead of one.**

---

## 1. VERIFIED GROUND TRUTH (live, 2026-09-07 — not from any document)

| Fact | Evidence |
|---|---|
| Live Cotality API reachable and authenticated | OAuth2 `client_credentials` → `$TRESTLE_API_URL/oidc/connect/token`, token OK, `expires_in=28800`, `scope=api` |
| Credentials source | **Shell environment**, not a file. `.env.local` and `.env` DO NOT EXIST in this checkout. `TRESTLE_API_URL`, `IDX_CLIENT_ID`, `IDX_CLIENT_SECRET` are set in the session env. If live scripts report AUTH FAILED after a reboot, that is the cause — not a code regression. |
| Live entity sets | **18**: Property, Office, Member, Media, OpenHouse, CustomProperty, PropertyRooms, PropertyUnitTypes, Teams, TeamMembers, Field, Lookup, Model, PropertyGreenVerification, Building, HistoryTransactional, DataSystem, Enumeration |
| Repo claim | `CLAUDE.md` says "all 12 resources" — **wrong by 6** |
| `artifacts/metadata.xml` | **STALE.** Repo 2,005,977 B vs live 1,946,777 B — differ |

---

## 1.2 LIVE PROVIDER VERIFICATION — 2026-09-07 (closes the study's §13 evidence gap)

Probed with the authenticated API this session. The forensic study could not verify live
(HTTP 429, then a 404 at the connector). These are first-hand results.

| Fact | Live value |
|---|---|
| Quota (**our licence**) | `minute-quota-limit: 280` · `hour-quota-limit: 8400` — **not** the 4920/147600 in public docs |
| Token | `expires_in=28800` (8 h), `scope=api`, OData 4.0 |
| Entity sets | **18** (CLAUDE.md's "12 resources" is wrong by 6) |
| Trestle version | **5.9** (skill said 5.0) |
| Lookup rows (all resources) | **191,912** across 192 pages |
| Published field vocabularies | **621** — Property 243, Building 137, Custom_Property 54 |
| EnumTypes in live `$metadata` | 181 |
| Fields whose declared type is an EnumType | 335 |

**§5 of the study is CONFIRMED — and understated.**

| Test | Result |
|---|---|
| Publishes Lookup vocabulary but **no EnumType declared at all** | **325** (62 on Property) |
| Old **field-name indexing** would find | 282 of 621 → **339 MISSED** (study estimated 121) |
| EnumTypes **shared** by >1 field | **30** — `AOR` by 21 fields, `AreaSource` 17, `AreaUnits` 17 |
| EnumType vs published set **diverges** | **27** fields, in *both* directions (e.g. `Property.BuyerAgentAOR` declares 1110, publishes 1127) |

**Therefore: `$metadata` EnumTypes CANNOT produce field picklists.** `Lookup(ResourceName,
FieldName)` is the only authority for published values; `$metadata` gives declared type only.

**Repo impact (verified in source):**
- `scripts/cotality/pull-enums.mjs:34` harvests `<EnumType Name=...>` **with no field mapping at
  all** → cannot answer "valid values for field X" for the 325 no-EnumType fields or the 30 shared ones.
- `trestle-fields` MCP `trestle_get_picklist` presents EnumType members as the field picklist —
  same defect — and silently falls back to the **stale** local `artifacts/metadata.xml`.

**Compliance-gate vocabularies (live):**
- `Property.Permission` → `Public, Private, IDX, VOW, OfficeOnly, FirmOnly, AgentOnly,
  SyndicateOptOut, PhotoOptedOut, ComingSoon, CompSold, History, Officeidxoptout,
  MemberInactive, OfficeInactive, OfficeSuspended, DownPaymentResourceYes/No`
  — **`Private` present (Gate 2 OK). NO `OwnerOptOut` member in the aggregated Trestle Lookup.**
  Gate 1 matches `Permission='OwnerOptOut'`; this needs REBNY-specific confirmation before any
  change (Trestle Lookup is cross-MLS; do NOT generalise — fail-closed).
- `Property.StandardStatus` → `Active, ActiveUnderContract, Canceled, Closed, ComingSoon,
  Delete, Expired, Hold, Incomplete, Pending, Withdrawn` — note **`Canceled` (single-L)**.

**Status-normalisation audit (verified, not assumed):**
- `normalizeStandardStatus` maps `canceled`→`Cancelled` via `STATUS_ALIASES`; `computeGateColumns`
  normalises **before** `TERMINAL_STATUSES.has` → **primary writer is correct.**
- `app/api/cron/data-retention/route.ts:29` keeps its **own** raw list with double-L `Cancelled`
  only and **never calls `normalizeStandardStatus`** → latent §2.05 gap if a raw single-L value is
  ever stored. **8 competing TERMINAL_STATUSES definitions** exist (study said 5).
- **Production check (canonical `hidden-mountain` / `br-crimson-frog-adr7g9gt`):** distinct statuses
  are only `Active 7591`, `Withdrawn 6975`, `Closed 6089`, `Pending 5800`, `ComingSoon 7`.
  **No single-L `Canceled` rows exist.** §2.05 is holding: Withdrawn→0 displayed, Closed→0 displayed.
  The single-L risk is **latent, not live**.

---

## 2. THE CENTRAL FINDING — three rival Search architectures

`main` contains **none** of them.

| Lineage | Branch | Ahead of main | Shape |
|---|---|---|---|
| **A — `canonical/`** | `fix/neon-p0-event-driven-wake-2026-08-16` (**PR #618**) | 241 | **Additive.** +19 `canonical/*`, +11 top-level: amenity vocabulary, bath contract, NYC geography, property-type universe, open-house membership/window/provider, mallan-local source/mapper/rows, continuation, public-universe |
| **A′ — reduced** | `fix/search-cotality-fields-2026-08-23` (82), `fix/cotality-provider-boundary-2026-08-23` (96), `fix/backend-agent-search-geography-2026-08-24` (103) | — | Subset of A. Two have **no PR at all**. |
| **B — `engine/`** | `search/clean-foundation-2026-09-04` (4) → `search/browser-integration-2026-09-05` (53) | 53 | **Replacement.** +9 `engine/*`; **DELETES** `canonical/saved-search.ts`, `criteria-to-prisma.ts`, `crm-idx-filter.ts` |
| **C — DOM harness** | `agent/search-p0-contract-integrity-2026-08-11` (**PR #600**) | 5 | +`testing/advanced-search-dom.ts` only |

### 2.1 Why this matters — the recorded law was broken

`docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` (checkpoint 2026-09-03) records
**#618 / lineage A as the sanctioned Search program**, with three layers already CLOSED:

| Layer | State | Closure SHA |
|---|---|---|
| §4 Canonical Criteria / Transport | **CLOSED** | `939884e15ec8447988c7fb791a8978fb8676f3a4` |
| §5 Registry → Executor Authority | **CLOSED** | `8e03fd3f7ac8d057bd2db44f46510d9ff4063c8b` |
| Public Search correctness sub-lane | **CLOSED** | `2d55ce6a528adbeaf64584f031aa3711dd8be6bb` |
| §6 Authenticated final universe / count / pagination | **ACTIVE** | — |
| §7 Sale + Rental · §8 Map/Saved/Workbench · §9 Compare/Reports/CMA · §10 browser E2E | queued | — |

That same file states, normatively:

> **"#618 feature expansion is FROZEN at `d19c03cd…`. It is preservation/convergence work.
> The 229-commit / 310-file branch is NOT a wholesale deployment candidate and is not to be
> rewritten from zero either."**

**Lineage B was created 2026-09-04/05 — after that checkpoint — and rewrote it from zero.**
It carries none of §4/§5's closed invariants as code. This is the divergence to end.

### 2.2 Consequence

Lineage B **deletes three modules lineage A depends on**, so the two cannot be fast-forwarded
or trivially merged. Convergence requires a **module-by-module adjudication**, not a merge.

---

## 3. STATUS OF THIS PROGRAM

| Step | State |
|---|---|
| Live Cotality study (all 18 resources, Field/Lookup/protocol) | **IN PROGRESS** — workflow `wf_a5f67bb8-112` |
| Vocabulary census (RealPlus / RESO / RLS+IDX) with per-occurrence verdicts | **IN PROGRESS** — same workflow |
| Search lineage characterization + wiring census | **IN PROGRESS** — same workflow |
| Adversarial verification of the 4 load-bearing claims | **IN PROGRESS** — same workflow |
| Branch to carry the work | **BLOCKED** — see §4 |
| Vocabulary deletion + CI law | not started |
| Search convergence | not started |

---

## 4. BLOCKERS

1. **Branch switching is denied.** `.claude/settings.local.json` `permissions.deny` contains
   `Bash(git checkout *)`, `Bash(git switch *)`, `Bash(git worktree *)`, `Bash(git clone *)`,
   `Agent(isolation:worktree)`. `deny` overrides the `Bash(git checkout:*)` entry in `allow`.
   Editing that file is additionally blocked by the auto-mode classifier.
   **Maya must run the checkout with a `!` prefix, or remove the two lines herself.**
   *Recommendation: keep `worktree`/`clone`/`Agent(isolation:worktree)` denied — those create
   the separate folders that caused this sprawl. Lift only `checkout`/`switch`.*

2. **The two declared authority documents are not on `main`.** `MALLAN-PLATFORM-MASTER-PLAN.md`
   and `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md` exist ONLY on
   `chore/remove-ai-reference-sprawl-2026-09-06`. The SessionStart hook points every new
   session at files that are absent from the working branch. **This must be fixed first** or
   every future session starts blind. That branch is 1 commit off main (`e7017225`) and also
   deletes 56 competing authority files including `CLAUDE.md` and `AGENTS.md`.

3. **22 open PRs, nearly all DRAFT**, oldest 2026-07-28. At least five overlap this work:
   #616 remove obsolete provider contract · #624 remove obsolete competing docs ·
   #595 establish master plan · #585 reconcile canonical plan · #618 Search · #600 Search drift.

---

## 5. OPEN DECISIONS FOR MAYA

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Which Search lineage is canonical?** | **Converge onto #618 / lineage A.** It is the lane the execution state sanctions, it has three CLOSED layers with pinned SHAs, and the recorded law forbids rewriting it from zero. Salvage from lineage B only what is provably better, module by module. |
| D2 | **`lib/idx/` (30 files) — rename to `lib/cotality/`?** | Pending import-site count from the census. `IDX Plus` is a real REBNY licensing term, so the directory name is defensible; but "the IDX feed" language inside it is not. |
| D3 | **`scripts/reso/` (13 scripts) + `reso:*` npm scripts** | Rename into a single `cotality:*` namespace; delete redundant duplicates. These are diagnostic tools against the live API — the name is simply wrong. |
| D4 | **RealPlus in 26 docs** | Commit `d6444b00` stamped them with HISTORICAL NOTE banners instead of deleting. Owner now wants the references **gone**. Strip references and banners; keep the documents (several are legally load-bearing compliance material). |
| D5 | **`rls_eligible`, `idx_display_yn` DB columns** | **KEEP.** These are compliance distribution gates, not feed identity. Renaming them is a schema migration and is on the standing approval hold. |

---

## 6. RULES THIS PROGRAM MUST NOT BREAK

- One folder: `C:\Users\MayaAllan\Desktop\mallan-nyc`. No worktrees, no clones.
- One branch = one writer.
- Never `--no-verify`, never `--no-gpg-sign`, never amend a published commit.
- Held without explicit Maya approval: schema migrations, env vars, Neon settings, cron config,
  `public/crm/**`, agents, skills, `.github/workflows/**`, force-push to main, admin merge bypass.
- Proof-first: a failing test flipped green, a live URL probe, a runtime log, or direct source
  Read for purely static claims. Source-grep alone never proves rendering or behavior.
- Fail-closed: if a REBNY / RLS / IDX Plus / Trestle / Cotality / FARE / NY DOS / Fair Housing
  requirement is unclear or absent from the canonical file — STOP and report. Do not guess.
- No "all green" claims. State per check what it proves and what it does not.

---

## 7. CHANGE LOG

| Date | Entry |
|---|---|
| 2026-09-07 | Live provider verification (§1.2): 18 entity sets, Trestle 5.9, quota 280/8400, 621 published vocabularies, 339 missed by name-indexing, 30 shared EnumTypes. `pull-enums.mjs` + `trestle-fields` MCP confirmed defective. Production status audit: no single-L rows; §2.05 holding. |
| 2026-09-07 | File opened. Live Cotality ground truth captured (18 entity sets, stale metadata artifact). Three rival Search lineages identified and the #618 divergence documented. Branch-switch blocker recorded. |

---

## 8. PHASE 1 FINDINGS — recorded 2026-09-07

### 8.1 CRM forms: FOUR files, TWO products — **DO NOT MIX OR CONSOLIDATE**

Owner ruling 2026-09-07: *"rental form design is the listing input, the tools is also
important, do not mix them."* Confirmed by `<title>`, content and distinct API consumers.

| File | `<title>` | Product | Classification |
|---|---|---|---|
| `public/crm/RENTAL-FORM-REDESIGN.html` | Rental Listing **Form** | **Listing input** (intake/edit) | **CANONICAL — rental input** |
| `public/crm/RENTAL-FORM-WITH-TOOLS.html` | Rental Listing **Viewer** | **Viewer + agent tools** — carries `OPEN HOUSE SIGN-IN SHEET`, branded printable output | **SPECIALIZED CONSUMER** |
| `public/crm/SALE-FORM-REDESIGN.html` | Sale Listing **Form** | **Listing input** | **CANONICAL — sale input** |
| `public/crm/SALE-FORM-WITH-TOOLS.html` | Sale Listing **Viewer** | **Viewer + agent tools** | **SPECIALIZED CONSUMER** |

They are **NOT duplicates.** `*-REDESIGN` writes listings; `*-WITH-TOOLS` views them and
produces agent tooling. Different consumers prove it: `*-REDESIGN` is referenced by
`app/api/crm/sales/listings/route.ts` and `compliance/FORMS-AND-RLS-SUBMISSION.md`;
`*-WITH-TOOLS` by `app/api/crm/listings/[id]/route.ts` and
`docs/crm/SALES-FORM-STABILITY-CONTRACT.md`.

**An earlier note in this session called them duplicate pairs. That was wrong and is retracted.**
Collapsing them would destroy the agent-tools surface. All four are under `public/crm/**` =
owner approval hold: REPORT, DO NOT EDIT.

### 8.2 Provider vocabulary census — the Phase 3 work-list

Gate: `scripts/cotality/verify-provider-vocabulary.mjs` (new, untracked). Measured on `main`.

| Category | Target | Actual | Files |
|---|---|---|---|
| REALPLUS | 0 | 129 | 47 |
| RESO | 0 | 914 | 159 |
| RLS_IDX | 0 | 150 | 64 |
| RLS_AS_PROVIDER | 0 | 2,328 | 167 |
| IDX_AS_FEED | 0 | 124 | 71 |
| **TOTAL** | **0** | **3,645** | — |

**RLS-as-compliance is enforced as a PATH rule, not a prose rule** — lawful only under
`compliance/`, `lib/compliance/`, `docs/compliance/`, `data/UCBA-*`,
`.claude/skills/rebny-compliance/`. Anywhere else, `RLS` near a provider word is a violation.

**The one carve-out — provider-verbatim.** Cotality's OWN API emits the token `RLS`:
`"Results from 'RLS' has been suppressed (provider Level) as field
InternetEntireListingDisplayYN' cannot be used for filtering or ordering queries."`
Code matching that string quotes the provider; it does not claim RLS is our feed. Such lines
must carry the marker `cotality-verbatim`. **A blind deletion sweep would break real error
handling — this is the single most dangerous part of Phase 3.**

### 8.3 The `data-rls-*` binding convention — 76% of all RLS contamination

| File | RLS_AS_PROVIDER hits |
|---|---|
| `public/crm/SALE-FORM-REDESIGN.html` | 509 |
| `public/crm/RENTAL-FORM-WITH-TOOLS.html` | 452 |
| `public/crm/RENTAL-FORM-REDESIGN.html` | 437 |
| `public/crm/SALE-FORM-WITH-TOOLS.html` | 375 |
| **subtotal** | **1,773 of 2,328 (76%)** |

An HTML attribute scheme binding form inputs to provider field names **under the RLS name**:
`data-rls-field` (157) and `data-rls-ignore` (343) in the sale input form alone. This is
literally "RLS as mapping", which the law sets to 0. Its toolchain:

- `scripts/inject-rls-attributes.js` · `scripts/validate-form-rls.js` · `scripts/validate-rls-compliance.js`
- `data/rls-form-bindings.json` — the shared binding registry (an **L2 vocabulary artifact
  carrying an RLS name**)
- `.github/workflows/crm-validate.yml` — CI asserts `data-rls-viewer="true"`
- `tests/runtime/cotality-datarlsfield-cleanup.test.ts` — a cleanup was already started

**Renaming this convention is a coordinated change across 4 held HTML files + 3 scripts +
1 data registry + 1 CI workflow + tests.** `.github/workflows/**` and `public/crm/**` are both
on the approval hold. This is the largest single Phase 3 item and needs owner sign-off.

### 8.4 Live-verified compliance defects (from the Cotality API, not from any document)

1. **The Owner-Opt-Out gate cannot fire.** Live `Property.Permission` publishes **18** members;
   `OwnerOptOut` is **not** among them. Any code testing `Permission == 'OwnerOptOut'` is dead.
   `app/api/listings/building/route.ts:57-58` half-knows this — it says the field doesn't exist
   but still claims `Permission` encodes owner opt-out. It does not. Owner opt-out is a
   **Mallan-side** decision (`owner_opt_out` column, set from CRM forms) and only that.
2. **`Media.Permission` publishes 7 members with different casing** (`Idx`, `Vow` — not `IDX`,
   `VOW`). Case-sensitive cross-resource comparison fails silently.
3. **At least five competing `TERMINAL_STATUSES` definitions** exist —
   `lib/idx/trestle-mapper.ts` (claims to be the single source of truth),
   `lib/compliance/public-listing-filter.ts` (includes `Sold`/`Rented`),
   `lib/compliance/rls-enforcement.ts` (**only** `Closed`), `lib/compliance/status.ts`
   (`CANCELLED`/`LEASED`), `lib/retention/archive-terminals.ts`, plus a test that mocks its own
   set. Live `Property.StandardStatus` publishes exactly 11: Active, ActiveUnderContract,
   **Canceled** (one L), Closed, ComingSoon, **Delete**, Expired, Hold, Incomplete, Pending,
   Withdrawn. `normalizeStandardStatus()` does alias `canceled`→`Cancelled`, so the spelling is
   mitigated **on paths that call it** — unverified whether all five do. `Delete` appears in
   **no** terminal set. UNVERIFIED: whether this is a live display exposure. Phase 1 must settle it.

### 8.5 Cotality protocol facts (live-verified — do not re-derive)

- `$top` **maximum is 1000**. `$top=5000` → HTTP 400. Page via `@odata.nextLink`.
- **Always check the HTTP status code.** A 400 body parses to an empty `value` array and will
  read as "0 rows / not published". This produced one wrong conclusion in this session before
  it was caught.
- Vocabulary lives in the **`Lookup` resource keyed by `(ResourceName, FieldName)`** — this is
  NOT the same as `$metadata` EnumTypes, and the two disagree.
- `$filter=InternetEntireListingDisplayYN eq true` → HTTP 400 (provider-level suppression).
- Cotality's own OData type namespace is `Cotality.DataStandard.RESO.DD.*`. **This is opaque raw
  provider content and grants NO terminology allowance** (owner ruling 2026-09-07, §13). Mallan
  code, docs, filenames, scripts, comments and tests must contain **zero** RESO occurrences. The
  raw namespace string is never surfaced above the adapter; nothing above L1 may name it.

---

## 9. PHASE 2 — COTALITY EVIDENCE PACKET (live-verified 2026-09-07)

All facts below come from the live authenticated API. No document, CSV, snapshot or skill was
accepted as evidence. Sample sizes are stated; anything unsampled is marked UNVERIFIED.

### 9.1 Protocol contract

| Property | Verified value |
|---|---|
| Base | `https://api.cotality.com/trestle`, OData v4 |
| Auth | OAuth2 `client_credentials` → `/oidc/connect/token`, `scope=api`, `expires_in=28800` (8h) |
| Entity sets | **18** (repo claims 12) |
| `$top` maximum | **1000** — `$top=5000` → HTTP 400 *"The maximum limit/$top value for this kind of query is 1000."* |
| Paging | server-driven `@odata.nextLink` |
| **Trap** | A 400 body parses to an empty `value` array. **Always read the HTTP status.** This produced one wrong conclusion in this session before it was caught. |

### 9.2 The metadata resources — how vocabulary is REALLY published

`Field` publishes, per `(ResourceName, FieldName)`: `Type`, `Length`, `Precision`,
**`NumOccurrences`** (multi-value arity), **`LookupName`**, `RESOStandardYN`, `DisplayName`,
`Definition`, `SystemReferences`/`SystemReferenceCount`, `ModificationTimestamp`, `FieldKey`.

**`Field` does NOT publish filter or sort capability.** Filterability must be discovered
**empirically** by probing. This is a first-order constraint on backend search: you cannot know
from metadata which criteria are executable.

**The authoritative vocabulary join is `Field.LookupName` → `Lookup.LookupName`, NOT `FieldName`.**
In 4 of 5 fields checked they differ:

| Field | Type | NumOccurrences | LookupName | Vocabulary size |
|---|---|---|---|---|
| `Permission` | String List, **Multi** | **20** | **`ListingPermission`** | 18 |
| `StandardStatus` | String List, Single | 1 | `StandardStatus` | 11 |
| `InteriorFeatures` | String List, **Multi** | **40** | **`InteriorOrRoomFeatures`** | **303** |
| `CurrentUse` | String List, **Multi** | **20** | **`CurrentOrPossibleUse`** | 66 |
| `AvailableLeaseType` | String List, **Multi** | **5** | **`ExistingLeaseType`** | 23 |

Any code that resolves a field's allowed values by matching on `FieldName` is structurally
wrong. This is the root L2 defect.

### 9.3 Live data distribution — 4,000 Property records sampled

| Field | Observed |
|---|---|
| `Permission` | **`'IDX'` on 4,000 / 4,000 (100%)**. No other value. No comma-delimited multi-value observed. |
| `StandardStatus` | Active 2,678 · **Closed 723** · Pending 593 · ComingSoon 6 |

Separately, 3,000 records sampled for the four Internet gate fields:

| Field | Distribution | Correct fail mode |
|---|---|---|
| `InternetEntireListingDisplayYN` | **null on 3,000/3,000** | fail-**OPEN** (`!== false`) ✅ |
| `InternetAddressDisplayYN` | **null on 3,000/3,000** | fail-**OPEN** (`!== false`) ✅ |
| `InternetAutomatedValuationDisplayYN` | True 2,828 / False 172 (94.3%/5.7%) | fail-**CLOSED** ✅ |
| `InternetConsumerCommentYN` | True 2,816 / False 184 (93.9%/6.1%) | fail-**CLOSED** ✅ |

### 9.4 What this proves about the distribution gates

1. **Gate 1 (Owner Opt-Out) is dead code.** `OwnerOptOut` is not one of the 18 `ListingPermission`
   members and appears in 0 of 4,000 records. It cannot fire. Owner opt-out is a **Mallan-side**
   decision (`owner_opt_out`, written from the CRM input forms) and nothing else.
2. **Gate 2 (Participant Only, `Permission='Private'`) never fires in this feed.** `Private` is a
   lawful vocabulary member, but REBNY's IDX Plus pre-filter means we receive only `IDX` rows.
   The gate is **defensive, not load-bearing**. UNVERIFIED beyond the 4,000-record sample.
3. **The equality check on `Permission` is fragile but not currently broken.** `lib/idx/trestle-mapper.ts`
   treats `Permission` as a single string (`:859` "The raw Permission string as read"). Metadata
   declares it **Multi with up to 20 occurrences**. Today every row carries exactly `'IDX'`, so
   equality happens to be safe. If REBNY ever emits `'IDX,Private'`, Gate 2 silently fails.
   **Structural fragility, not a live defect. Do not overstate it.**
4. **Terminal-status filtering IS load-bearing.** 18% of sampled rows are `Closed`. The feed
   genuinely delivers terminal listings, so the five divergent `TERMINAL_STATUSES` definitions
   (§8.4) are a real risk surface, not a tidiness issue.

### 9.5 Verdict on the rebny-compliance skill — verified, not assumed

The owner's caution was correct: it is a hypothesis set, not authority.

| Skill claim | Verdict | Evidence |
|---|---|---|
| Two-tier fail-open / fail-closed gate model | ✅ **CORRECT** | 3,000-record distribution above matches exactly |
| `InternetEntireListingDisplayYN` not OData-filterable | ✅ **CORRECT** | HTTP 400, provider-level suppression |
| IDX Plus licensed direct, **NOT** via RealPlus/LMP | ✅ **CORRECT** | supports the RealPlus = 0 law |
| Gate 1: `Permission` enum = `OwnerOptOut` | ❌ **FALSE** | not in the 18 published members; 0 of 4,000 records |
| "All 12 Trestle resources" | ❌ **FALSE** | live publishes **18** |
| `Permission` is a single enum | ⚠️ **INCOMPLETE** | declared `String List, Multi`, `NumOccurrences=20`, LookupName `ListingPermission` |
| CoreLogic hosts deprecated 2026-03-31 | ⚠️ **STALE** | deadline passed 5 months ago; `corelogic.com` still allowlisted in 6 runtime paths |

### 9.6 Phase 8 form defects — all three CONFIRMED against live vocabulary

| Form field | Form renders | Live truth | Verdict |
|---|---|---|---|
| `InteriorFeatures` | Yes/No radio | `InteriorOrRoomFeatures`, **303 members**, Multi(40) | **CONFIRMED defect** |
| `CurrentUse` | offers `Healthcare`, `Professional` | `CurrentOrPossibleUse`, 66 members | **CONFIRMED** — neither value published |
| `AvailableLeaseType` | offers `StabilizedLease`, `NonStabilizedLease` | `ExistingLeaseType`, 23 members: AbsoluteNet, BaseAndPercentage, CpiAdjustment, DepositRequired, EscalationClause, Fixed, FullService, Gross, GroundLease, IndustrialGross, Modified, ModifiedGross, Net, Nn, Nnn, None, NotForLease, Oral, Other, Percentage, SeeAgent, SeeRemarks, Sublease | **CONFIRMED** — this is a **commercial lease-structure** vocabulary. **NYC rent stabilization has NO Cotality field and must become a Mallan-owned business criterion.** |

All three live in `public/crm/**` = owner approval hold. REPORTED, NOT EDITED.

---

## 10. PHASE 1 COMPLETE — THE SEARCH AUTHORITY MATRIX (2026-09-07)

Method: 18 agents, 883 tool calls, all reads via `git show <lane>:<path>` against
`search/browser-integration-2026-09-05` @ `79efbc04`, plus status-checked live Cotality probes.
Four load-bearing claims went through an adversarial refute/verify pair. **Two of my own earlier
claims were refuted and are corrected below.**

### 10.1 The matrix — 51 surfaces, not 14

| Classification | Count |
|---|---|
| CANONICAL | 6 |
| CONSUMER | 10 |
| SPECIALIZED CONSUMER | 13 |
| **DUPLICATE** | **16** |
| **OBSOLETE** | **6** |
| | **51** |

**22 of 51 surfaces (43%) are duplicate or obsolete.** Backend 31 · Public 16 · Shared 4.
The "12 searches" problem is really 22 removable surfaces.

### 10.2 Phase 4/5 authority counts — only ONE is at target

| Responsibility | Target | Actual | Proposed canonical |
|---|---|---|---|
| Cotality OAuth token | 1 | **1** OK | `lib/idx/auth.ts` |
| Cotality HTTP client | 1 | **21-24** | `lib/search/engine/provider-client.ts` (only one fail-loud on non-2xx) |
| Cotality query builder | 1 | **6 (>=24 sites)** | `lib/search/engine/provider-query.ts` |
| Cotality pagination | 1 | **5-6** | `lib/search/engine/provider-client.ts` walkProvider |
| Cotality field registry | 1 | **8-17** | `data/cotality-property-fields.live.json` via `lib/cotality/live-contract.ts` |
| Cotality vocabulary registry | 1 | **8-23** | `data/cotality-enums.live.json` via `lib/cotality/live-contract.ts` |
| Cotality to Mallan mapper | 1 | **8-17** | `lib/idx/trestle-mapper.ts` |
| Sale search engine | 1 | **12** | `lib/search/engine/` |
| Rental search engine | 1 | **7** | `lib/search/engine/` |
| Saved Search interpreter | 1 | **2** | `lib/search/engine/saved-search.ts` |
| **Terminal-status set** | 1 | **12 defs / 8 distinct member sets** | `lib/listings/mallan-status.ts` |
| Display-gate decision | 1 | **9** | `lib/compliance/gates.ts evaluateDisplayGate` |
| Browser provider-status tables | 0 | **21** | **none — the browser must hold no provider catalogue** |

The prior commit's "SIX copies of the browser status table" was wrong: **it is 21.**

### 10.3 CORRECTIONS to my own earlier claims

**(a) "Five competing TERMINAL_STATUSES" — WRONG, understated.**
The lane carries **12 independent definitions across at least 8 mutually distinct member sets**:
`lib/listings/mallan-status.ts:42`, `lib/compliance/status.ts:138` and `:193`,
`lib/compliance/public-listing-filter.ts:13`, `lib/crm/status-mapping.ts:169`,
`lib/syndication/eligibility.ts:96`, `app/api/cron/feed-reconcile/route.ts:87`,
`scripts/reconcile-ghosts.js:61`, `lib/compliance/rls-enforcement.ts:222`,
`scripts/archive-backlog-predicate.js:27`, `scripts/ops-health.js:225`, plus the jest
re-declaration at `app/api/crm/listing-campaigns/__tests__/route.test.ts:35`.

**My sub-claim "Delete appears in none of them" is FALSE.** Delete IS present in
MALLAN_TERMINAL_STATUSES (`lib/listings/mallan-status.ts:42-44`), MALLAN_STORAGE_STATUSES,
COTALITY_TO_MALLAN (`:61`) and `scripts/archive-backlog-predicate.js:27`. Retracted.

CONFIRMED: Sold, Rented, Leased, Cancelled (two L) are **not** live StandardStatus members —
each returns HTTP 400 "not a valid enumeration type constant" when probed directly.

**(b) "The Owner-Opt-Out gate is dead code" — REASONING UNSOUND, conclusion too broad.**
The FACTS hold: live Property.Permission has 18 members, no OwnerOptOut; the server rejects
OwnerOptOut as an enum constant (HTTP 400); no live Property field is named
OwnerOptOut/OwnerOptOutYN/ParticipantOnly among **810 field definitions**; Permission == 'IDX'
on 3,000/3,000 sampled rows of **591,560 total**.

But "the enum has no such member, therefore code testing for it is dead" is only valid where the
key is populated **exclusively** by a Cotality response. **It is not.** Permission / Permissions
are ALSO Mallan-authored CRM form keys — `lib/crm/listing-form-mapping.ts:150` aliases
RLS-Owner-OptOut, Owner Opt-Out, Owner Opt Out, OWNER_OPT_OUT to 'OwnerOptOut'.

**Precise version:** the gate is unreachable for **Cotality-sourced** records and fully reachable
for **Mallan-authored** ones. It is not dead. What IS false is the repo comment claiming
Cotality's Permission enum *encodes* owner opt-out (`app/api/listings/building/route.ts:57-58`).

**(c) "The lane lacks six #618 capabilities" — REFUTED, overstated.**
Ancestry confirmed: #618 (`fix/neon-p0-event-driven-wake-2026-08-16` @ `d19c03cd`) is **not an
ancestor** of the lane; 241 commits absent; merge-base `45455682` (2026-08-15); the lane's
foundation arrived via `3c02f102` from `3eda1789`, unreachable from #618. But the capability list
was wrong on 4 of 6 items. **Real gap: two items, plus one wrong-implementation item; three
assertions were live-refuted.** Phase 0 designates #618 evidence-only — re-derive, never merge.

**(d) "More than one authority remains on the lane" — CONFIRMED and understated.**
Not "at least one of four" — it is **all four plus a fifth (the HTTP client)**. Critically:
**CMA (`lib/comps/fetch-comps.ts`), Reports (`lib/market-report/generator.ts`), Suggestions
(`app/api/listings/suggest/route.ts`) and Agent Listings
(`app/api/agents/[slug]/listings/route.ts`) all BYPASS the engine** and use a second stack.

### 10.4 What the lane already got right

`lib/search/engine/**` IS the canonical backend Search foundation and is genuinely wired:
`app/api/crm/saved-searches/[id]/execute/route.ts` (executeSearch),
`lib/search/saved-search-read.ts` (countSearch), `app/api/cron/search-alerts/route.ts`
(settledUniverseFor / rowsModifiedSince / hydrateRows). The lane **deleted** the competing
core.ts, criteria-to-prisma.ts, crm-idx-filter.ts, canonical/saved-search.ts and no runtime
import of them survives. Live probes confirm every clause it emits is accepted (HTTP 200):
`Permission has 'IDX'` (6,631), `ListOfficeMlsId ne '7041'` (6,629),
`tolower(SubdivisionName) eq 'tribeca'` (114), `StructureType has 'Townhouse'` (520),
`CityRegion eq 'StatenIsland'` (27), two-term $orderby with $top=1000 (1000 + nextLink).

### 10.5 Defects found INSIDE the canonical engine

- **Three places decide "is this criterion executable"**: server `lib/search/engine/criteria.ts:135`
  EXECUTED_PARAMS; browser `public/crm/js/search/search-engine.js:270-283` _NOT_EXECUTABLE; and a
  **third hand-written whitelist** at `public/crm/js/core/api-client.js:698-720` that would
  **silently drop a newly-executable param**.
- **Two vocabulary registries on one request path**: `lib/search/canonical/live-truth.ts` feeding
  criteria.ts, and `lib/cotality/live-contract.ts` feeding `lib/listings/mallan-status.ts`, which
  both universe.ts and hydrate.ts import.
- **Hard ceiling**: walkProvider maxPages 25 x $top 1000 = **25,000 provider rows**; beyond that
  the universe is truncated and countMeaning drops to lower_bound. Feed total is **591,560**.
- **Three different numbers for one query**: run.total, _meta.providerCount (Cotality's
  @odata.count), and the live-match badge's independent request
  (`public/crm/js/init/init-tracker.js:114-130`).
- **Mallan display-gate columns are never applied in backend search.** `listings.owner_opt_out`
  and `listings.participant_only` (`prisma/schema.prisma:472-473`) are not read by
  `lib/search/engine/**`; Mallan rows are hydrated with InternetAddressDisplayYN:true,
  InternetEntireListingDisplayYN:true, Permission:'IDX' **hardcoded** (`hydrate.ts:143`), and
  passesGate is applied to provider rows only (`hydrate.ts:177`).
  **Compliance exposure — needs an owner decision.**

### 10.6 PHASE 7 DELETION LIST — backend/shared, 15 items with evidence

| # | Class | Surface | Key evidence |
|---|---|---|---|
| 1 | OBSOLETE | CRM saved-search localStorage store | `data-loader.js:80` reads a key nothing writes |
| 2 | OBSOLETE | CRM building directory `/api/crm/buildings` | backing table has **no live writer**; only consumer is a count badge; `app/sitemap.ts:172` comment is now FALSE |
| 3 | DUPLICATE | `/api/portal/open-houses` | 3rd impl over prisma.showing; **no display gate, no ownership check** — can show a lead what the public feed fails closed on |
| 4 | DUPLICATE | CRM "Similar / Nearby" panel | `pagination.js:1061-1080`; no price band, no bedroom match, no property-class gate |
| 5 | DUPLICATE | CRM neighborhood autocomplete | 3rd copy of NYC vocabulary, **drifted: 122 names vs 59**, incompatible spellings |
| 6 | DUPLICATE | CRM address autocomplete | `search-engine.js:486`; no street parsing, no provider reach, no gate |
| 7 | DUPLICATE | CRM browser "CMA" report format | shares no code/criteria/valuation with `lib/cma/engine.ts`; comps chosen by **checkbox order** |
| 8 | OBSOLETE | `report-package.js` | **1,050 lines, zero callers** anywhere |
| 9 | OBSOLETE | AI Market Report | **LIVE-VERIFIED DEAD** — all four TYPE_FILTERS (`generator.ts:119-127`) use constants Cotality does not publish: Condo, Cooperative, Condop, SingleFamilyTownhouse vs live Condominium, StockCooperative, Townhouse |
| 10 | DUPLICATE | CRM in-search compare modal | 3rd compare impl, weaker gate, depends on a global the engine says is not a result set |
| 11 | DUPLICATE | CRM "Comparison" report format | **no comparand limit — will render 250 columns** |
| 12 | DUPLICATE | Workbench working-set | 2nd selection model; two localStorage keys, one never written, one never read |
| 13 | DUPLICATE | Broker Console "Company Listings" | same endpoint as Manage, own mapper, **demonstrably incorrect count** above 200 rows |
| 14 | OBSOLETE | `/api/crm/sales/listings`, `/api/crm/rentals/listings` | **zero callers**, but live authenticated routes spreading whole Listing rows with **no limit and no display gate** — dead code with a live attack surface |
| 15 | OBSOLETE | Browser Latitude/Longitude OData builders | dead statically AND **live-refuted** — Cotality rejects the clause |

Each removal requires a **negative test** proving the obsolete path cannot silently return
(plan Phase 7).

### 10.7 Phase status

| Phase | State |
|---|---|
| 0 Freeze | **DONE** — lane identified, state verified, no new branch created |
| 1 Impact graph | **DONE** — 51 surfaces classified, authorities counted |
| 2 Cotality truth | **SUBSTANTIALLY DONE** — see section 9 |
| 3 Remove false authorities | **READY** — gate written, 3,645 occurrences listed. BLOCKED on branch access |
| 4-9 | not started |

---

## 11. PHASE 2 CORRECTED — `SystemReferences` scopes the vocabulary to RLS (2026-09-07)

Second workflow: 20 agents, 779 tool calls, 68 min. It **corrects section 9 of this file**.
Section 9 remains true about the API's *global* vocabulary; it was wrong to treat that as
*our* vocabulary.

### 11.1 THE CORRECTION — `$metadata` and `Lookup` are a UNION ACROSS ~118 MLS SYSTEMS

`$metadata` EnumType members are the **wire contract across every Cotality MLS**, not the
values REBNY/RLS emits. The `Lookup` resource carries the column that scopes them:

**`SystemReferences`** — a comma-list of the MLS system codes that actually publish that value,
with `SystemReferenceCount`. **This is the only way to scope allowed values to our feed.**

| Field | Members in `$metadata` | **Members RLS actually publishes** |
|---|---|---|
| `Permission` (enum `ListingPermission`) | **18** | **3** — `IDX`, `Private`, `SyndicateOptOut` |
| `StandardStatus` | **11** | **9** — `ActiveUnderContract` and `Incomplete` are **NOT RLS values** |

The other 15 `ListingPermission` members belong to other MLSs. `VOW` alone is referenced by 64
systems, **none of them RLS**.

**Section 9.2's "18 members" and 9.4's reasoning were measured against the global union.
Corrected: our vocabulary is 3.** The conclusion that `OwnerOptOut` does not exist is unchanged
and is now stronger.

### 11.2 The duplicate-row trap that produced my earlier casing claim

`Lookup` returns **duplicate rows per LookupValue** — `StandardStatus` returns **22 rows for 11
distinct values** (one RLS-annotated copy, one bare copy). **You must dedupe on `LookupValue`
and OR the `SystemReferences` together**, or you will conclude RLS supports nothing.

This explains my earlier unfiltered `LookupName eq 'Permission'` query returning 25 rows with
apparent case variants (`Vow`/`VOW`, `Idx`/`IDX`). Part of that was duplicate rows, not purely a
cross-resource casing difference. **Section 9's casing claim is downgraded to UNVERIFIED** and
must be re-measured with dedupe before any code relies on it.

### 11.3 Wire format — multi-value enums are COMMA-JOINED STRINGS

Despite `IsFlags="true"` over `UnderlyingType="Edm.Int64"`, multi-valued enums serialize as
comma-joined strings, **not** integers and **not** JSON arrays. Live examples:

- `Permission: "IDX"`
- `PetsAllowed: "BuildingYes,Yes"`
- `PatioAndPorchFeatures: "None,Rooftop"`

Any parser expecting an int bitmask or an array is wrong. Section 9.4's note that equality on
`Permission` is "fragile but not broken" is confirmed — and the mechanism is now exact: a second
value would arrive as `"IDX,Private"`, which `=== 'Private'` misses.

### 11.4 Field-name vs enum-name

The field is literally **`Permission`**. **`ListingPermission` is the ENUM TYPE name.** Code or
agents searching for a *field* named `ListingPermission` will find nothing. A sibling
`PermissionPrivate` exists in the Field dictionary but is **absent from `$metadata`** — not
selectable, not queryable.

### 11.5 Corpus shape (live)

| Fact | Value |
|---|---|
| Property rows | **591,560** |
| `OriginatingSystemName eq 'RLS'` | **591,560 — every row** |
| `StandardStatus eq 'Active'` | **7,568** |
| `StandardStatus eq 'Closed'` | **578,388** |
| `City eq 'New York City'` | 591,560 (every row) |
| `City eq 'Brooklyn'` | **0** — borough is NOT in `City` |
| Property field declarations | **757** + 14 NavigationProperties |
| Fields with `Nullable="false"` | **1 — `ListingKey` only.** All other 756 are nullable |
| Declared EnumType fields | 181 · `Collection(...)` fields: **0** |
| One real record | 115 populated / 642 null (**84.8% null**) |

**The feed is 98% closed listings.** Section 9.3's 4,000-row sample (Active 2,678 / Closed 723)
was NOT representative of the corpus — it was the default page order. Any performance or
correctness reasoning based on that ratio is void.

`OriginatingSystemName = "RLS"`, `OriginatingSystemSubName = "RLS_REBNY"`,
`SourceSystemID = "TRESTLE"` are **provider field VALUES**. Querying them is lawful under the
provider-verbatim carve-out; naming our feed "RLS" is not.

### 11.6 Identity and replication — settled

| Concern | Answer |
|---|---|
| **Primary key** | **`ListingKey`** — Edm.String, MaxLength 20, the sole `<PropertyRef>`. `ListingKeyNumeric` is a parallel convenience, NOT the key. `ListingId` (`"RLS20112879"`) is the human MLS number, NOT the key. |
| **Replication cursor** | **`ModificationTimestamp`** — verified both filterable (`gt 2026-09-06` → 1,377) and orderable. |
| **Do NOT use** | `OriginatingSystemModificationTimestamp` — it is the SOURCE MLS stamp and **LAGS ~4h** (observed 10:23:22.520 vs 06:23:09.500). Using it as the cursor **silently drops rows**. |
| Absent from `$metadata` | `SourceSystemModificationTimestamp`, `SourceSystemModificationTimestampUTC`, `KafkaSourceTimestampUTC` — in the Field dictionary but not selectable. |

### 11.7 HIGH SEVERITY — the two compliance gates cannot be filtered server-side

`InternetEntireListingDisplayYN` **and** `InternetAddressDisplayYN` cannot be used in `$filter`
**or** `$orderby`. HTTP 400 for `eq true`, `eq false` **and** `eq null` alike:

> `Results from 'RLS' has been suppressed (provider Level) as field
> InternetEntireListingDisplayYN' cannot be used for filtering or ordering queries.`

By contrast `InternetAutomatedValuationDisplayYN` (445,756) and `InternetConsumerCommentYN`
(445,589) **are** filterable.

**Consequence: the two most compliance-critical display gates MUST be evaluated client-side
after fetch. No server-side narrowing is possible.** This interacts badly with the 25,000-row
walk ceiling in §10.5 — you cannot narrow the universe by display gate before truncation.

**Two committed repo scripts violate this today** (they emit a `$filter` on these fields and
will 400 in production). Phase 3/4 must fix them.

### 11.8 Live data traps confirmed on a real record

- **`ZoningDescription = "null"`** — the literal four-character **string** `"null"`, not JSON
  null. Any `if (v)` or `v ?? default` guard renders the word "null" to the public.
- **`AssociationFee = 0.0`** — a legitimate zero. The `||` fallback trap is **live-reachable on
  this exact field**.
- Address arrives split: `StreetNumber` 112, `StreetDirPrefix` W, `StreetName` "73RD",
  `StreetSuffix` Street, `UnitNumber` PH, alongside `UnparsedAddress`.
- `InternetEntireListingDisplayYN` is **null** while the two per-row opt-outs are `true` — live
  confirmation of the fail-open premise for the provider-gated pair.

### 11.9 OPEN DISCREPANCY — field count

One agent reports **757** Property field declarations in `$metadata`; another reports **810**
field definitions via the `Field` endpoint. These count different things (`$metadata` selectable
schema vs the Field data dictionary, which includes non-selectable entries such as
`PermissionPrivate` and the Kafka timestamps). **Not yet reconciled — do not cite either number
as "the" field count until Phase 4 settles which is authoritative for select-list generation.**

---

## 12. PHASE 2 — SCOPING PROOF AND CLOSE-OUT (2026-09-07)

Owner ruling: Phase 2 stays OPEN until `SystemReferences` scoping and the field-count
discrepancy are resolved. Both are now settled by direct live probe. Items 1, 2, 4, 5, 6 are
proven below; **item 3 (correcting the code) requires the lane and is the only thing left.**

### 12.1 RETRACTION — there are NO duplicate Lookup rows

Section 11.2 claimed `Lookup` returns duplicate rows per `LookupValue` (22 rows for 11
`StandardStatus` values) and that dedupe is required. **That is WRONG. Retracted.**

Proven live:

| Query | Rows | Distinct `LookupValue` |
|---|---|---|
| `ResourceName eq 'Property' and FieldName eq 'StandardStatus'` | **11** | 11 — **no duplication** |
| `LookupName eq 'StandardStatus'` (no resource filter) | **110** | 11 |

The 110 are the **same 11 values published once per resource** — Property, Media, OpenHouse,
PropertyRooms, PropertyUnitTypes, PropertyGreenVerification, PropertyLevels,
HistoryTransactional, Custom_Property. Querying by `LookupName` alone crosses resources; that is
where the apparent duplication came from.

Verified across all 12 fields probed in 12.3: **rows == distinct in every single case.**

**Consequence: the lane's generator keys correctly by `(ResourceName, FieldName)`. It has
EXACTLY ONE defect, not two.**

### 12.2 THE ONE REAL DEFECT — no `SystemReferences` scoping

`scripts/cotality/pull-enums.mjs` on the lane (`79efbc04`), lines 128-129:

```
$filter: `ResourceName eq '${resource}'`
$select: 'FieldName,LookupValue'
```

`SystemReferences` is **never selected**, so scoping is impossible. The generated
`data/cotality-enums.live.json` is therefore the **global union across ~118 MLS systems**, not
the vocabulary our REBNY/RLS subscription publishes.

**Correct algorithm (proven):**
1. `Lookup?$filter=ResourceName eq '<R>' and FieldName eq '<F>'`
2. `$select` must include **`SystemReferences`** (and `SystemReferenceCount`)
3. Split `SystemReferences` on `,`, trim, and **exact-token match `RLS`** — never a substring
   match, which would false-positive on other system codes
4. `$metadata` supplies **type/schema**; `Lookup` supplies **published values**

### 12.3 SCOPING PROOF — global union vs RLS subscription

| Resource.Field | Rows | Global | **RLS** | Reduction |
|---|---|---|---|---|
| Property.Permission | 18 | 18 | **3** | −83% |
| Property.StandardStatus | 11 | 11 | **9** | −18% |
| Property.MlsStatus | 26 | 26 | **9** | −65% |
| Property.InteriorFeatures | 299 | 299 | **55** | −82% |
| Property.CurrentUse | 66 | 66 | **10** | −85% |
| **Property.AvailableLeaseType** | 23 | 23 | **0** | **−100%** |
| Property.PropertySubType | 76 | 76 | **10** | −87% |
| Property.PropertyType | 13 | 13 | **3** | −77% |
| Media.Permission | 7 | 7 | **2** | −71% |
| Media.MediaCategory | 18 | 18 | **8** | −56% |
| OpenHouse.OpenHouseType | 9 | 9 | **2** | −78% |
| OpenHouse.OpenHouseStatus | 3 | 3 | **3** | 0% |

Exact RLS member lists:

- **`Property.Permission`** → `IDX`, `Private`, `SyndicateOptOut`
  (`VOW` is referenced by 64 systems but **NOT** ours. `OwnerOptOut` does not exist at all.)
- **`Property.StandardStatus`** → `Active`, `Canceled`, `Closed`, `ComingSoon`, `Delete`,
  `Expired`, `Hold`, `Pending`, `Withdrawn`
  (**`ActiveUnderContract` and `Incomplete` are NOT ours. `Delete` IS ours.**)
- **`Media.Permission`** → `Private`, `Public`
- **`OpenHouse.OpenHouseType`** → `Broker`, `Public`
- **`Property.AvailableLeaseType`** → **EMPTY**

### 12.4 `AvailableLeaseType` scopes to ZERO — Phase 8 item (c) is settled

No RLS system reference on **any** of its 23 values. The field is not part of our subscription
at all. So the CRM form offering `StabilizedLease` / `NonStabilizedLease` is not merely using
wrong values — **the entire field should not be presented as provider-backed.**

**NYC rent stabilization has no Cotality field and must be a Mallan-owned business criterion.**
Confirmed twice: the global vocabulary is commercial lease structures (AbsoluteNet, Nnn,
GroundLease, ModifiedGross...), and our subscription publishes none of it.

### 12.5 757 vs 810 — RESOLVED, no contradiction

| Source | Count | Authoritative for |
|---|---|---|
| `$metadata` Property EntityType | **757** `<Property>` + 14 `<NavigationProperty>` | **`$select` generation** — what can be requested |
| `Field` endpoint, ResourceName eq 'Property' | **810** distinct FieldName | **field metadata** — Type, LookupName, NumOccurrences, Length |

Reconciliation: intersection **757**; in `$metadata` but not `Field` = **0**; in `Field` but not
`$metadata` = **53**.

`$metadata` is a **strict subset**. The 53 extra are Trestle **platform internals that are NOT
selectable**: `BLXListingKey`, `CLIP_Address`, `CLIP_CountyCode`, `CLIP_Latitude`,
`CLIP_Longitude`, `CoListAgentTrestleMemberKey`, `CoListOfficeTrestle*Key` (6),
`FlowPriority`, `KafkaSourceTimestampUTC`, and 40 more.

**Rule: build select lists from `$metadata` (757). Read field metadata from `Field` (810).
Never put a Field-only name in a `$select` — it will 400.**

### 12.6 The raw-`RLS` boundary — owner ruling, narrowed

```
COTALITY RAW CONTRACT        may contain provider literal "RLS"
        |
COTALITY ADAPTER             interprets raw provider provenance  <- the ONLY interpreter
        |
MALLAN                       neutral semantic concept
```

Outside the raw layer, code consumes neutral concepts — `providerOrigin`, `providerListingId`,
`isAuthorizedProviderOrigin(...)`, `isCotalityProviderListing(...)` — **never**
`startsWith("RLS")`, "RLS listing", "RLS feed", "RLS search".

Provider literals that legitimately exist at L1 only:
`OriginatingSystemName = "RLS"` (591,550/591,550), `OriginatingSystemSubName = "RLS_REBNY"`,
`ListingId` prefix `"RLS..."`, and the verbatim error text
`"Results from 'RLS' has been suppressed (provider Level)"`.

**Known violation to fix in Phase 4/6:** `app/api/cron/feed-reconcile/route.ts:193,203,330` runs
`listing_id: { startsWith: "RLS" }` — three consumers independently knowing the provider's
prefix. That knowledge belongs once, at the adapter.

The only other lawful use of "RLS" is the REBNY/RLS **compliance/business rule** layer (L5).

**The vocabulary gate must be extended**: today it exempts only lines marked
`cotality-verbatim`. It needs a narrow, individually-justified allowlist for provider DATA
values at L1 — not a blanket pattern exemption. Also note the gate enumerates `git ls-files`
only, so it currently **misses untracked files** including
`.claude/skills/rebny-compliance/SKILL.md`, which is auto-loaded every session and contains
RealPlus references.

### 12.7 Phase 2 status

| Item | State |
|---|---|
| 1. Correct Lookup scoping | **PROVEN** (12.2, 12.3) |
| 2. Resolve 757 vs 810 | **RESOLVED** (12.5) |
| 3. Correct `lib/cotality/live-contract.ts` + regenerate data | **BLOCKED — requires the lane** |
| 4. Re-run known examples | **DONE** — 12 fields incl. Media + OpenHouse (12.3) |
| 5. Prove duplicate handling | **DONE — no duplicates exist** (12.1, retraction) |
| 6. `$metadata` for types, Lookup for values, correctly scoped | **ESTABLISHED** (12.2, 12.5) |

**Phase 2 cannot be marked CLOSED until item 3 lands on the lane and the regenerated
`data/cotality-enums.live.json` is proven scoped.** Everything needed to do it is now proven.

### 12.8 Blast radius of the scoping fix — read before applying item 3

Regenerating the vocabulary **shrinks** every enum. Anything validating against the old global
union will start rejecting values it used to accept, and anything that offered global values in
a UI will lose options. Before regenerating, enumerate consumers of
`data/cotality-enums.live.json` and `lib/cotality/live-contract.ts` (reported as 23 importers)
and check each for:
- select lists that will lose options (e.g. PropertySubType 76 -> 10)
- validators that will newly fail (e.g. a form storing `ActiveUnderContract`)
- **stored Mallan rows already carrying a now-out-of-scope value** — a data question, not a code
  question, and it needs a read-only Neon count before anything is enforced.

Do NOT enforce the narrowed vocabulary as fail-closed until that census is done.

---

## 13. RESO TOTAL ELIMINATION — OWNER RULING AND IMPACT GRAPH (2026-09-07)

### 13.1 The ruling — no exceptions, no carve-outs

> "RESO IS TO BE DELETED COMPLETELY FROM THE ACTIVE MALLAN REPOSITORY. This is a hard
> architectural rule, not a terminology preference."
>
> **Final acceptance condition: RESO tracked-tree occurrences = 0**

RESO must NOT be preserved as: provider vocabulary · schema terminology · compatibility
terminology · diagnostic terminology · reference documentation · script namespace · mapping
namespace · test terminology · comments · historical banners.

> "Delete or replace the underlying RESO-based authority. Do not merely rename a duplicate
> implementation."

Cotality emits the literal token `RESO` in raw payloads — its OData type namespace is
`Cotality.DataStandard.RESO.DD`, and the `Field` endpoint publishes a column named
`RESOStandardYN`. **This grants NO terminology allowance.** Such content is opaque raw provider
data. Above the raw boundary Mallan exposes Cotality/Mallan-neutral concepts only.
**There is no carve-out at any layer, including L1.**

**RETRACTED:** §0.1 previously granted RESO an L1 carve-out and §11.5 called the RESO Data
Dictionary "a provider fact". Both are revoked. Corrected in place.

**Also required:** `MALLAN-PLATFORM-MASTER-PLAN.md` contains an allowance stating RESO
terminology may remain as provider-schema language. **That allowance is revoked and the file
must be corrected.** It exists only on `chore/remove-ai-reference-sprawl-2026-09-06`.

### 13.2 Acceptance gate — `scripts/cotality/verify-reso-eliminated.mjs`

| # | Proof | Target | Actual |
|---|---|---|---|
| 1 | tracked-tree RESO occurrences | 0 | **18,418** |
| 2 | no RESO filenames / directories | 0 | **23** |
| 3 | no RESO npm scripts | 0 | **12** |
| 4 | no RESO mapping constants / functions | 0 | **1,695** |
| 5 | no RESO documentation / reference toolkit | 0 | **321** (48 docs) |
| 6 | no RESO compatibility / fallback path | 0 | **13** |
| 7 | tests + runtime consumers still work | — | not mechanical; command list in the gate |

2,003 tracked files scanned. Pattern is `\bRESO\b` — word-anchored, so `resolve`, `resource`,
`RESOLVED`, `reset` are excluded by construction.

### 13.3 THE SHAPE OF THE PROBLEM — 7 files hold 93%

**This is not 18,418 line edits.**

| Occurrences | File |
|---|---|
| **14,553** | `artifacts/metadata.xml` |
| **1,994** | `compliance/lookups.json` |
| **451** | `compliance/fields.json` |
| 63 | `data/rebny-rls-property-fields.csv` |
| 58 | `artifacts/schema-audit.md` |
| 53 | `artifacts/schema-audit.json` |
| — | `data/rebny-rls-property-lookup.csv` |

**7 snapshot-as-authority files = 17,174 occurrences (93%).**
**Everything else = 1,244 occurrences across 171 files.**

Every one of those 7 is a captured provider snapshot treated as truth — which the project law
already bans independently of RESO. Deleting them satisfies 93% of proof 1 as a **single
reviewed architectural decision**, not a sweep.

A live re-pull does NOT help: it would reintroduce `Cotality.DataStandard.RESO.DD`. **If any
captured schema document is kept in any form, proof 1 is unsatisfiable.** They must be deleted.

### 13.4 THE IMPACT GRAPH — who actually breaks

Comment citations vastly outnumber real reads. Verified by grepping for actual file I/O:

**Comment-only (safe — edit the prose, nothing breaks):**
`app/api/buildings/search/route.ts:243,778` · `lib/compliance/dto.ts:110` ·
`lib/media/crm-media.ts:102` · `lib/idx/trestle-mapper.ts:895,1099` ·
`lib/compliance/rebny-field-tables.ts:4,5,179`

**REAL READERS — these break on deletion:**

| Consumer | Reads | Severity |
|---|---|---|
| `scripts/idx-validate.js:203,214,336,406` | both CSVs + `metadata.xml` | **`npm run idx:validate` — REQUIRED pre-commit chain** |
| `scripts/test-rls-bindings.js:59,73` | both CSVs | **`npm run test:rls` — REQUIRED** |
| `mcp/trestle-fields/index.ts:36,331` | `metadata.xml` as **fallback when live fetch fails** | **The banned snapshot-as-authority pattern.** Correct behavior is to fail loudly. |
| `lib/idx/__tests__/moveincosts-ingestion.test.ts:22` | `metadata.xml` | test |
| `tests/runtime/building-cotality-full-subset.test.ts:18` | `metadata.xml` | test |
| `tests/runtime/building-identity-profile.test.ts:32` | `metadata.xml` | test |
| `tests/runtime/building-profile-architecture.test.ts:16` | `metadata.xml` | test |
| `tests/runtime/sale-form-building-parking-pets-track1.test.ts:25` | `metadata.xml` | test |
| `scripts/get-metadata.js:49` | **WRITES** `metadata.xml` | the generator — delete it too |

**Hidden L2 authority:** `lib/compliance/rebny-field-tables.ts` does not read the CSVs at
runtime — **it has the CSV values transcribed into TypeScript** ("ENUM VALUES — From
data/rebny-rls-property-lookup.csv", line 179). It is a hardcoded copy of a snapshot and is
therefore itself a false authority requiring regeneration from live + RLS-scoped truth.

### 13.5 SEQUENCING CONSEQUENCE — RESO removal is blocked behind Phase 4

The snapshots are not documentation. **They ARE the L2 "verified vocabulary" layer today**, and
two of them feed validators in the required pre-commit chain.

Deleting them before a replacement exists would remove the field/vocabulary authority the system
runs on and break `idx:validate` and `test:rls`.

**Therefore the order is forced:**

1. **Phase 2 item 3** — correct `lib/cotality/live-contract.ts` to scope by `SystemReferences`;
   regenerate `data/cotality-enums.live.json` and a live field registry. *(Blocked on the lane.)*
2. **Phase 4** — make that the single Cotality field + vocabulary authority; migrate
   `scripts/idx-validate.js`, `scripts/test-rls-bindings.js` and
   `lib/compliance/rebny-field-tables.ts` onto it; make `mcp/trestle-fields` fail loudly instead
   of falling back; rework the 5 live-parity tests to compare live against the live-derived
   contract rather than a snapshot.
3. **Then** delete the 7 snapshots → 93% of proof 1 satisfied.
4. **Then** the remaining 1,244 occurrences across 171 files, by category.

**RESO removal cannot be done as a standalone string sweep. Attempting it before step 2 breaks
the pre-commit chain and removes the running vocabulary authority.** This is the ripple the
owner asked to be traced, and it reorders the plan: Phase 3's RESO component depends on Phase 4.

The RealPlus and RLS-as-provider components of Phase 3 do **not** have this dependency and can
proceed independently once the lane is available.

### 13.6 Known coupling that must land in one commit

- `public/crm/js/core/reso-field-map.js` ← `scripts/validate-rls-compliance.js`
  (`npm run rls:validate`) reportedly hard-codes the filename and symbol. Renaming the map
  without the validator breaks a required check. Both `public/crm/**` and the validator must
  change together. **UNVERIFIED — confirm the exact line before acting.**
- `public/crm/index-built.html` (162 occurrences) is **generated** by `public/crm/build.js`.
  Never edit it; change `public/crm/js/**` sources then `npm run crm:build`.
- `.github/workflows/crm-validate.yml` enforces literal `data-rls-viewer="true"`; that is an RLS
  item, not RESO, but it is in the same held surface.

---

## 13. RESO TOTAL ELIMINATION — OWNER RULING AND IMPACT GRAPH (2026-09-07)

### 13.1 The ruling — no exceptions, no carve-outs

> "RESO IS TO BE DELETED COMPLETELY FROM THE ACTIVE MALLAN REPOSITORY. This is a hard
> architectural rule, not a terminology preference."
>
> **Final acceptance condition: RESO tracked-tree occurrences = 0**

RESO must NOT be preserved as: provider vocabulary · schema terminology · compatibility
terminology · diagnostic terminology · reference documentation · script namespace · mapping
namespace · test terminology · comments · historical banners.

> "Delete or replace the underlying RESO-based authority. Do not merely rename a duplicate
> implementation."

Cotality emits the literal token `RESO` in raw payloads — its OData type namespace is
`Cotality.DataStandard.RESO.DD`, and the `Field` endpoint publishes a column named
`RESOStandardYN`. **This grants NO terminology allowance.** Such content is opaque raw provider
data. Above the raw boundary Mallan exposes Cotality/Mallan-neutral concepts only.
**There is no carve-out at any layer, including L1.**

**RETRACTED:** §0.1 previously granted RESO an L1 carve-out and §11.5 called the RESO Data
Dictionary "a provider fact". Both are revoked. Corrected in place.

**Also required:** `MALLAN-PLATFORM-MASTER-PLAN.md` contains an allowance stating RESO
terminology may remain as provider-schema language. **That allowance is revoked and the file
must be corrected.** It exists only on `chore/remove-ai-reference-sprawl-2026-09-06`.

### 13.2 Acceptance gate — `scripts/cotality/verify-reso-eliminated.mjs`

| # | Proof | Target | Actual |
|---|---|---|---|
| 1 | tracked-tree RESO occurrences | 0 | **18,418** |
| 2 | no RESO filenames / directories | 0 | **23** |
| 3 | no RESO npm scripts | 0 | **12** |
| 4 | no RESO mapping constants / functions | 0 | **1,695** |
| 5 | no RESO documentation / reference toolkit | 0 | **321** (48 docs) |
| 6 | no RESO compatibility / fallback path | 0 | **13** |
| 7 | tests + runtime consumers still work | — | not mechanical; command list in the gate |

2,003 tracked files scanned. Pattern is `\bRESO\b` — word-anchored, so `resolve`, `resource`,
`RESOLVED`, `reset` are excluded by construction.

### 13.3 THE SHAPE OF THE PROBLEM — 7 files hold 93%

**This is not 18,418 line edits.**

| Occurrences | File |
|---|---|
| **14,553** | `artifacts/metadata.xml` |
| **1,994** | `compliance/lookups.json` |
| **451** | `compliance/fields.json` |
| 63 | `data/rebny-rls-property-fields.csv` |
| 58 | `artifacts/schema-audit.md` |
| 53 | `artifacts/schema-audit.json` |
| — | `data/rebny-rls-property-lookup.csv` |

**7 snapshot-as-authority files = 17,174 occurrences (93%).**
**Everything else = 1,244 occurrences across 171 files.**

Every one of those 7 is a captured provider snapshot treated as truth — which the project law
already bans independently of RESO. Deleting them satisfies 93% of proof 1 as a **single
reviewed architectural decision**, not a sweep.

A live re-pull does NOT help: it would reintroduce `Cotality.DataStandard.RESO.DD`. **If any
captured schema document is kept in any form, proof 1 is unsatisfiable.** They must be deleted.

### 13.4 THE IMPACT GRAPH — who actually breaks

Comment citations vastly outnumber real reads. Verified by grepping for actual file I/O:

**Comment-only (safe — edit the prose, nothing breaks):**
`app/api/buildings/search/route.ts:243,778` · `lib/compliance/dto.ts:110` ·
`lib/media/crm-media.ts:102` · `lib/idx/trestle-mapper.ts:895,1099` ·
`lib/compliance/rebny-field-tables.ts:4,5,179`

**REAL READERS — these break on deletion:**

| Consumer | Reads | Severity |
|---|---|---|
| `scripts/idx-validate.js:203,214,336,406` | both CSVs + `metadata.xml` | **`npm run idx:validate` — REQUIRED pre-commit chain** |
| `scripts/test-rls-bindings.js:59,73` | both CSVs | **`npm run test:rls` — REQUIRED** |
| `mcp/trestle-fields/index.ts:36,331` | `metadata.xml` as **fallback when live fetch fails** | **The banned snapshot-as-authority pattern.** Correct behavior is to fail loudly. |
| `lib/idx/__tests__/moveincosts-ingestion.test.ts:22` | `metadata.xml` | test |
| `tests/runtime/building-cotality-full-subset.test.ts:18` | `metadata.xml` | test |
| `tests/runtime/building-identity-profile.test.ts:32` | `metadata.xml` | test |
| `tests/runtime/building-profile-architecture.test.ts:16` | `metadata.xml` | test |
| `tests/runtime/sale-form-building-parking-pets-track1.test.ts:25` | `metadata.xml` | test |
| `scripts/get-metadata.js:49` | **WRITES** `metadata.xml` | the generator — delete it too |

**Hidden L2 authority:** `lib/compliance/rebny-field-tables.ts` does not read the CSVs at
runtime — **it has the CSV values transcribed into TypeScript** ("ENUM VALUES — From
data/rebny-rls-property-lookup.csv", line 179). It is a hardcoded copy of a snapshot and is
therefore itself a false authority requiring regeneration from live + RLS-scoped truth.

### 13.5 SEQUENCING CONSEQUENCE — RESO removal is blocked behind Phase 4

The snapshots are not documentation. **They ARE the L2 "verified vocabulary" layer today**, and
two of them feed validators in the required pre-commit chain.

Deleting them before a replacement exists would remove the field/vocabulary authority the system
runs on and break `idx:validate` and `test:rls`.

**Therefore the order is forced:**

1. **Phase 2 item 3** — correct `lib/cotality/live-contract.ts` to scope by `SystemReferences`;
   regenerate `data/cotality-enums.live.json` and a live field registry. *(Blocked on the lane.)*
2. **Phase 4** — make that the single Cotality field + vocabulary authority; migrate
   `scripts/idx-validate.js`, `scripts/test-rls-bindings.js` and
   `lib/compliance/rebny-field-tables.ts` onto it; make `mcp/trestle-fields` fail loudly instead
   of falling back; rework the 5 live-parity tests to compare live against the live-derived
   contract rather than a snapshot.
3. **Then** delete the 7 snapshots → 93% of proof 1 satisfied.
4. **Then** the remaining 1,244 occurrences across 171 files, by category.

**RESO removal cannot be done as a standalone string sweep. Attempting it before step 2 breaks
the pre-commit chain and removes the running vocabulary authority.** This is the ripple the
owner asked to be traced, and it reorders the plan: Phase 3's RESO component depends on Phase 4.

The RealPlus and RLS-as-provider components of Phase 3 do **not** have this dependency and can
proceed independently once the lane is available.

### 13.6 Known coupling that must land in one commit

- `public/crm/js/core/reso-field-map.js` ← `scripts/validate-rls-compliance.js`
  (`npm run rls:validate`) reportedly hard-codes the filename and symbol. Renaming the map
  without the validator breaks a required check. Both `public/crm/**` and the validator must
  change together. **UNVERIFIED — confirm the exact line before acting.**
- `public/crm/index-built.html` (162 occurrences) is **generated** by `public/crm/build.js`.
  Never edit it; change `public/crm/js/**` sources then `npm run crm:build`.
- `.github/workflows/crm-validate.yml` enforces literal `data-rls-viewer="true"`; that is an RLS
  item, not RESO, but it is in the same held surface.

---

## 14. THE REPLACEMENT AUTHORITY EXISTS — `data/cotality-contract.live.json` (2026-09-07)

Owner ruling: *"there is no other feed other than cotality api… everything else will collapse
the system. So find realplus, real plus, REALPLUS or RLS or RLS idx, or RESO or whatever else
was introduced there, update it, correct it and match it to cotality api system."*

The correction is not a string sweep. It is: **build the real Cotality truth, then bring every
assertion in the tree into line with it.** The banned vocabulary disappears as a *consequence*
of the system becoming correct. That truth now exists.

### 14.1 What was built

`scripts/cotality/build-live-contract.mjs` → `data/cotality-contract.live.json` (669,702 bytes)

| Resource | selectable | fieldMetadata | nonSelectable | fields with scoped vocabulary |
|---|---|---|---|---|
| Property | 757 | 810 | 53 | **243** |
| Media | 56 | 86 | 31 | 22 |
| OpenHouse | 47 | 76 | 29 | 16 |
| Member | 91 | 120 | 29 | 23 |
| Office | 80 | 112 | 32 | 21 |
| Building | 1 | 354 | 353 | 137 |
| CustomProperty | 142 | 0 | 0 | 0 |
| PropertyRooms | 39 | 69 | 30 | 20 |
| PropertyUnitTypes | 52 | 82 | 30 | 22 |
| PropertyGreenVerification | 39 | 70 | 31 | 15 |
| HistoryTransactional | 29 | 38 | 9 | 10 |
| Teams | 48 | 74 | 26 | 10 |
| TeamMembers | 29 | 55 | 26 | 7 |
| **TOTAL** | **1,410** | **1,946** | **679** | — |

### 14.2 The four correctness properties it encodes

1. **Subscription scoping.** Vocabulary is filtered by exact-token match within
   `Lookup.SystemReferences`. The authorized system code is **DISCOVERED at build time** from
   `Property.OriginatingSystemName` — it is never hardcoded, because a distribution-system name
   is not Mallan vocabulary and must not appear in the Cotality layer. If the feed ever carried
   more than one originating system the build **aborts** rather than guessing.
2. **Selectability.** `selectableFields` comes from `$metadata`; `fieldMetadata` from the `Field`
   endpoint. The **679 non-selectable** platform fields (`CLIP_*`, `CoListOfficeTrestle*Key`,
   `KafkaSourceTimestampUTC`, …) are recorded but flagged `selectable:false` — putting one in a
   `$select` returns HTTP 400.
3. **Paging completeness.** Every collection is paged with `$count=true` and the row total is
   asserted against the provider's own count. Property alone is **69,801 Lookup rows / 70 pages**;
   a short page set would have silently produced a wrong vocabulary. The build throws instead.
4. **Vocabulary neutrality.** Provider type namespaces are stripped to the bare type name, and
   the provider's shared-dictionary flag is re-emitted as `isProviderStandardField`. Before
   writing, the artifact is asserted to contain **zero** banned tokens — the build **aborts**
   rather than emit a violating file. Result: **PASS, 0 tokens in 669,702 bytes.**

### 14.3 Verified against independent probes

| Field | authorized | global | arity | vocabularyName |
|---|---|---|---|---|
| `Permission` | **3** | 18 | 20 | `ListingPermission` |
| `StandardStatus` | **9** | 11 | 1 | `StandardStatus` |
| `MlsStatus` | **9** | 26 | 1 | `MlsStatus` |
| `InteriorFeatures` | **55** | 299 | 40 | `InteriorOrRoomFeatures` |
| `CurrentUse` | **10** | 66 | 20 | `CurrentOrPossibleUse` |
| `AvailableLeaseType` | **0** | 23 | 5 | `ExistingLeaseType` |
| `PropertySubType` | **10** | 76 | 1 | `PropertySubType` |
| `PropertyType` | **3** | 13 | 1 | `PropertyType` |

`Permission` → `IDX`, `Private`, `SyndicateOptOut`
`StandardStatus` → `Active`, `Canceled`, `Closed`, `ComingSoon`, `Delete`, `Expired`, `Hold`,
`Pending`, `Withdrawn`
`AvailableLeaseType` → **[]**
`ListingKey` → `nullable: false`, the only non-nullable Property field.

Every number matches the independent probes recorded in §12.3. Two sources, same answer.

### 14.4 What this unblocks

The seven snapshot artifacts holding 93% of the RESO occurrences can now be **replaced rather
than merely deleted**, so nothing collapses:

| Consumer | Reads today | Migrate to |
|---|---|---|
| `scripts/idx-validate.js:203,214,336,406` | both CSVs + `metadata.xml` | `data/cotality-contract.live.json` |
| `scripts/test-rls-bindings.js:59,73` | both CSVs | same |
| `lib/compliance/rebny-field-tables.ts` | CSV values **transcribed into TS** | same, generated |
| `mcp/trestle-fields/index.ts:36,331` | `metadata.xml` **as a silent fallback** | remove the fallback; **fail loudly** |
| 5 live-parity tests | `metadata.xml` | compare live against the contract |
| `scripts/get-metadata.js:49` | **writes** `metadata.xml` | delete — superseded by the builder |

Only after those migrations do the seven snapshots get deleted. That order is mandatory: they
are the running vocabulary authority and two of them feed the required pre-commit chain.

### 14.5 KNOWN DEFECT IN MY OWN TOOLING — the gate violates the rule it enforces

`scripts/cotality/verify-reso-eliminated.mjs` fails proof 2 (its **filename** carries the banned
token) and proof 1 (30 occurrences in its body). `verify-provider-vocabulary.mjs` carries 16 RLS
and 5 banned tokens.

An enforcement tool cannot contain the literal it bans. **Fix:** fold the seven proofs into a
single neutrally-named gate and construct every banned token programmatically from character
arrays (the technique already used for the standard-field flag in the builder), so no literal
appears in the tree. Until then the acceptance condition is unsatisfiable by construction.

### 14.6 Status

| Phase | State |
|---|---|
| 0 Branch discipline | **CLOSED** — `main` pristine, 0 dirty, lane intact |
| 1 Authority matrix | PROVISIONAL evidence (51 surfaces) |
| 2 Cotality truth | items 1,2,4,5,6 PROVEN; **the contract artifact now exists**; item 3 (wire `lib/cotality/live-contract.ts` to it) blocked on the lane |
| 3 RESO/RealPlus/RLS correction | **UNBLOCKED IN PRINCIPLE** — the truth to correct against now exists; execution blocked on the lane |
| 4 One Cotality layer | the artifact is the candidate single authority; consumer migration not started |

**Blocker unchanged:** `.claude/settings.local.json` lines 221-222 deny `git checkout` /
`git switch`. Nothing can be committed to the lane until those are removed or the owner runs the
checkout.

---

## 15. THE RENAME AUTHORITY IS 100% WRONG — settled against the live contract (2026-09-07)

Owner: *"The saved patch is not safe to apply wholesale. It mostly performed textual
substitutions such as RESO → Cotality while leaving a model like '23 Cotality→RLS renames'
intact. That would merely rename the wrong authority instead of removing it."*

Confirmed. Both artifacts below are now settled against `data/cotality-contract.live.json`.
**Neither may be renamed. Both must be retired.**

### 15.1 `compliance/rules/reso-rls-renames.json` — ZERO of 23 renames are valid

Its own `_meta` states the false model outright:

> `"description": "23 fields where RESO name differs from RLS (Matrix) name. Always use the RLS
> name. REBNY IDX Plus is the authority."`
> `"source": "data/rebny-rls-property-fields.csv"`
> `"rule": "If a script or form uses the RESO name, it MUST be mapped to the RLS name before RLS submission."`

A distribution matrix is declared the field authority and a CSV snapshot is its source. Both are
banned. Verified per-entry against the live Property contract (757 selectable / 810 metadata):

| Verdict | Count |
|---|---|
| **Both names are distinct REAL live fields** → renaming **CORRUPTS data** | **13** |
| Neither name exists live → **pure fiction** | **5** |
| Source is live, target does not exist → **query returns HTTP 400** | **5** |
| **Valid** | **0** |

The four most dangerous entries:

| Rename | Why it is destructive |
|---|---|
| `ListingKey` → `SourceSystemKey` | **`ListingKey` is the PRIMARY KEY** and the only non-nullable Property field. This rewrites record identity onto a different real field. |
| `ModificationTimestamp` → `SourceSystemModificationTimestamp` | `ModificationTimestamp` is the **replication cursor**; the target is **not selectable**. Incremental sync would silently break. |
| `ShowingContactPhoneExt` → `ShowingContactPhone` | Two distinct real fields. The extension is destroyed. |
| `UnparsedAddress` → `UnParsedAddress` | Casing-only target does not exist → HTTP 400. |

**VERDICT: DELETE the file and the rename model entirely. No replacement mapping is required —
Cotality returns fields under the names it returns them under.** The same applies to
`lib/idx/trestle-mapper.ts` `RESO_TO_RLS_RENAMES` and `compliance/fields.json`
`_meta.resoToRlsRenames`, which encode the same premise and contradict each other in direction.

### 15.2 `public/crm/js/core/reso-field-map.js` — a parallel browser vocabulary

190 lines. Declares itself a mapping to a shared industry dictionary, drives `data-*-field`
attributes on rendered HTML, and cites **three stale snapshots** as its verification basis:
`data/rebny-rls-property-fields.csv`, `data/trestle-dictionary/property-fields.csv` (744 fields
— live is 757), `data/trestle-excel/02_PROPERTY.csv`.

Audited all **71** mappings against the live contract:

| | Count |
|---|---|
| targets that ARE live-selectable | **67** |
| targets that are NOT | **4** |

| Mapping | Defect |
|---|---|
| `totalMonthly` → `AssociationFee+TaxAnnualAmount` | not a field — a computed expression in a field-name slot |
| `updatedDate` → `SourceSystemModificationTimestamp` | **not selectable → HTTP 400.** Correct field is `ModificationTimestamp` |
| `idxDisplayYN` → `IDXEntireListingDisplayYN` | **phantom — does not exist live** |
| `comingSoonTimestamp` → `ComingSoonTimestamp` | **does not exist live** |

### 15.3 CORRECTION TO MY OWN EARLIER CLAIM — StandardStatus vs MlsStatus

I previously implied that `status: 'MlsStatus'` (line 59) is value-wrong because the rename
premise is false. **The premise IS false — they are two distinct real fields, not one renamed —
but the practical consequence is benign today, and I should not have implied otherwise.**

Measured live:

```
StandardStatus authorized: Active, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Pending, Withdrawn
MlsStatus      authorized: Active, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Pending, Withdrawn
identical? TRUE   (0 members differ in either direction)
```

Under our subscription the two vocabularies **coincide exactly**. They diverge only in their
global unions (StandardStatus 11, MlsStatus 26). So reading `MlsStatus` yields the same nine
tokens as `StandardStatus` for our data. The comment justifying it is false; the value it
produces is not currently wrong.

**This matters for sequencing:** the status mapping is NOT an urgent data defect, so it must not
be used to justify an emergency edit to a held CRM surface. The four defects in 15.2 are real;
the status line is a false comment, not a false value.

### 15.4 Why renaming these files is the wrong fix

Both files are **authority artifacts, not naming artifacts**. Renaming
`reso-rls-renames.json` → `cotality-renames.json` preserves a rename model that is 0-for-23.
Renaming `reso-field-map.js` → `cotality-field-map.js` preserves a **second provider vocabulary
living in the browser**, sourced from three stale snapshots.

The correct action for both:
1. **Delete the rename model outright** — no replacement.
2. **Retire the browser catalogue** — the browser must hold no provider vocabulary. It consumes
   the server contract (`data/cotality-contract.live.json` via the search contract endpoint),
   which already exists.
3. Fix the 4 real mapping defects **at the server**, where the contract lives.

### 15.5 Coupling that forces a single commit

`scripts/validate-rls-compliance.js` (`npm run rls:validate`, in the REQUIRED pre-commit chain)
references the browser map by filename and symbol. Deleting or renaming the map without changing
the validator breaks a required check. **The CRM file, the validator, and any CI reference must
change together**, then `npm run crm:build` regenerates `public/crm/index-built.html`
(162 occurrences — generated, never hand-edited).

`public/crm/**` is on the standing owner approval hold. **Reported, not edited.**

---

## 16. STEP 2 — CONSUMER + STORED-VALUE CENSUS (2026-09-07)

Executed against the owner's 12-step order. Steps 1 and 3-12 status is in §17.

### 16.1 Consumers of the vocabulary authority — on the lane

`data/cotality-enums.live.json` — **27 consumers**

| Layer | Files |
|---|---|
| Cotality layer | `lib/cotality/cotality-enums.ts`, `lib/cotality/live-contract.ts` |
| Search foundation | `lib/search/canonical/{field-registry,index,listing-class,live-truth,ownership,source-provenance}.ts`, `lib/search/engine/{contract,criteria}.ts` |
| Browser (**HELD**) | `public/crm/js/search/search-engine.js`, `public/crm/index-built.html` (generated) |
| Scripts | `scripts/cotality-verify.mjs`, `scripts/cotality/pull-enums.mjs`, `scripts/idx-validate.js` |
| Tests | 6 |

`lib/cotality/live-contract.ts` — **47 consumers**

| Layer | Files |
|---|---|
| Compliance runtime | `lib/compliance/{index,normalizer,rebny-ucba-rules,rebny-validator,rls-enforcement}.ts` |
| CRM / listings | `lib/crm/listing-form-mapping.ts`, `lib/listings/{mallan-form-contract,mallan-status}.ts` |
| Provider mapper | `lib/idx/trestle-mapper.ts` |
| Browser (**HELD**) | `public/crm/{SALE,RENTAL}-FORM-REDESIGN.html`, `index-built.html`, `js/core/reso-field-map.js` |
| Validator | `scripts/validate-rls-compliance.js` (required pre-commit chain) |
| Tests | 12+ |

**Finding:** `lib/cotality/live-contract.ts` is **already the widely-adopted single reader** —
47 consumers. It is the correct consolidation target. Its defect is not adoption; it is that its
backing DATA is unscoped. Exported surface already includes `liveEnumMembers(field, resource)`,
`isLiveCotalityField`, `livePublishedValues`, `liveEnumViolations` — the right shape.

**Blast radius of narrowing:** all 47 consumers see smaller enums. The highest-risk are
`lib/compliance/rebny-validator.ts` and `lib/crm/listing-form-mapping.ts`, which validate form
values, plus the two held CRM input forms.

### 16.2 Stored-value census — READ-ONLY, production Neon

Project `hidden-mountain-87248164`, branch `main` (`br-crimson-frog-adr7g9gt`). Read-only
`SELECT ... GROUP BY`. No mutation.

**`listings.status` — 26,466 rows, 5 distinct values**

| value | rows | authorized? |
|---|---|---|
| Active | 7,595 | YES |
| Withdrawn | 6,975 | YES |
| Closed | 6,090 | YES |
| Pending | 5,799 | YES |
| ComingSoon | 7 | YES |

**Out-of-scope: 0 rows.** Narrowing `StandardStatus` 11 → 9 has **zero stored-data impact**.

**`listings.property_sub_type` — 9 distinct values + 26 null**

Apartment 22,461 · SingleFamilyResidence 1,185 · MultiFamily 1,158 · Duplex 992 · Loft 218 ·
Triplex 212 · MixedUse 212 · Office 1 · Retail 1

Authorized (10): Apartment, Duplex, Loft, MixedUse, MultiFamily, Office, Retail,
SingleFamilyResidence, Townhouse, Triplex.
**Out-of-scope: 0 rows.** Narrowing 76 → 10 has **zero stored-data impact**.

**`listings.property_type` — DEFECT FOUND**

Authorized (3): `MultiFamily`, `Residential`, `ResidentialLease`

| value | rows | authorized? |
|---|---|---|
| Residential | 21,942 | YES |
| ResidentialLease | 4,491 | YES |
| **Condominium** | **25** | **NO** |
| **Cooperative** | **7** | **NO** |
| **Condop** | **1** | **NO** |

**Out-of-scope: 33 rows.** These are PropertySubType-family concepts written into the
`property_type` column. Narrowing 13 → 3 would newly reject them.

### 16.3 ROOT-CAUSE LINK — the AI Market Report's dead filters

Phase 1 found `lib/market-report/generator.ts:119-127` `TYPE_FILTERS` uses `Condo`,
`Cooperative`, `Condop`, `SingleFamilyTownhouse` — constants Cotality does not publish, making
the feature **live-verified dead**.

Those constants match the **corrupted local `property_type` column**, not the provider. The
market report was written against local storage state rather than provider truth. That is the
same failure mode as the rename maps: a repo artifact treated as field authority.

**Consequence:** fixing the market report requires fixing the 33 stored rows first, or the
feature will keep returning nothing. Both are needed.

### 16.4 Enforcement precondition — SATISFIED with one exception

The narrowed vocabulary may be enforced fail-closed for `StandardStatus`, `MlsStatus` and
`PropertySubType` — **zero stored rows are affected**.

It may **NOT** be enforced fail-closed for `PropertyType` until the 33 rows are reconciled.
That is a data decision requiring owner authorization (a write to production listings), not a
code change. Options to put to Maya:
- reclassify the 33 rows to a real `PropertyType` and move the concept to `property_sub_type`
  (`Condominium`/`Cooperative`/`Condop` are ownership/interest concepts — live `CommonInterest`
  is the likely correct home; needs its own vocabulary check), or
- accept them as Mallan-local values explicitly outside the provider vocabulary and exclude them
  from provider-vocabulary validation by an explicit, documented rule.

**No write has been made. Census only.**

---

## 17. THE COTALITY INFORMATION MODEL — how the system actually works (2026-09-07)

Live-verified. This section is the "learn the system" deliverable and is prerequisite reading
for backend Search work.

### 17.1 Subscription identity — what Cotality says we are

`GET /odata/DataSystem` returns exactly ONE row:

| Field | Value |
|---|---|
| `ID` | `Trestle-11371-20` |
| `Name` | **"IDX Plus feed for Mallan Real Estate Inc"** |
| `ServiceURI` | `https://api.cotality.com/trestle/odata` |
| `DataDictionaryVersion` | `2.0` |
| `TransportVersion` | `1.0.0` |

**There is no published entitlement discriminator.** `DataSystem` does not expose an MLS code,
a system-identity token, or a vocabulary scope. See §17.7 for the consequence.

### 17.2 Resource graph — Property and its subsections

`Property` declares **14 navigation properties**, and **`$expand` works on all of them**
(verified HTTP 200 each):

| Navigation | Target | Cardinality | Live sample |
|---|---|---|---|
| `Media` | Media | MANY | 16 rows on one listing |
| `OpenHouse` | OpenHouse | MANY | 0 |
| `CustomProperty` | CustomProperty | MANY | **1** |
| `Rooms` | PropertyRooms | MANY | 0 |
| `UnitTypes` | PropertyUnitTypes | MANY | 0 |
| `Building` | Building | MANY | 0 |
| `ListAgent` / `CoListAgent` / `BuyerAgent` / `CoBuyerAgent` | Member | MANY | 1 |
| `ListOffice` / `CoListOffice` / `BuyerOffice` / `CoBuyerOffice` | Office | MANY | 1 |

**A complete listing can be assembled in ONE request:**
`Property?$expand=Media,CustomProperty,ListAgent,ListOffice`
The repo currently issues separate calls per resource. This is an efficiency and consistency
opportunity for the single Cotality access authority (Step 8).

### 17.3 Field families — where Property's 757 selectable fields live

| Family | Selectable | With vocabulary |
|---|---|---|
| **Agent / Office / Team** | **229 (30%)** | 21 |
| Financing / purchase | 62 | 12 |
| Features / amenities | 43 | 34 |
| Status / lifecycle / dates | 39 | 5 |
| Rental / FARE Act | 33 | 21 |
| Location / geography | 27 | 9 |
| Size / rooms | 24 | 7 |
| NYC building character | 19 | 5 |
| Display / permission | 14 | 6 |
| Co-op / condo / ownership | 7 | 3 |
| uncategorized | 260 | — |

**30% of the Property schema is agent/office contact data** — a large PII surface that portal
DTO tiers and agent-masking rules must account for.

### 17.4 THE NYC LAYER — `CustomProperty.CustomFields`

`CustomProperty` has **142 selectable fields**, one of which — `CustomFields` — is a **JSON
string blob** carrying the NYC brokerage vocabulary. 26 keys observed live:

| Key | Example | NYC meaning |
|---|---|---|
| `FlipTax` · `FlipTaxType` · `FlipTaxRemarks` | `0.00` · `Percent` · `negotiable` | co-op flip tax |
| **`MaximumFinancingPercent`** · `MaximumFinancingRemarks` | `90.00` | co-op board financing cap |
| **`SponsorUnitYN`** | `0` | sponsor unit |
| `TaxDeductionPercent` | `39.00` | co-op tax deductibility |
| `PercentOfCommonElements` | `1.00` | condo common elements |
| `AttendanceType` | `DoormanFullTime,ConciergeYes` | doorman / concierge (comma multi-value) |
| `BuildingStaffType` | `ResidentManagerFullTime` | resident manager |
| `ElevatorsTotal` · `LandmarkStatusYN` · `CertificateOfOccupancyYN` · `BuildingSmokeFreeYN` | | building facts |
| `TaxAbatementYN` · `TaxMonthlyAmount` · `BuildingTaxLot` | | NYC tax |
| `UnitLine` | `C` | NYC unit line |
| `PrivateOutdoorSpaceSize` | `GreaterThan60SqFt` | outdoor space |
| `MaxLeaseMonths` · `CapitalReservesYN` · `FurnishedListPrice` · `KitchenCondition` · `BathroomCondition` · `ViewRemarks` | | |

Also on `CustomProperty` as first-class fields: `AdditionalFee`, `AdditionalFeeFrequency`,
`AdditionalFeeYN`, `ApplicationFee`, `AssociationFeeTotal`, `LastMonthRentReqYN`,
`LeaseTermsDescription` — the FARE Act fee family.

### 17.5 ⚠ CRITICAL — `contains()` on `CustomFields` SILENTLY RETURNS NOTHING

**Proven with a single record, both calls HTTP 200:**

```
ListingKey eq '1190009560'                                             -> count = 1
ListingKey eq '1190009560' and contains(CustomFields,'SponsorUnitYN')  -> count = 0
```

That record demonstrably contains `SponsorUnitYN='0'` and `MaximumFinancingPercent='90.00'`.
Adding a `contains()` predicate that is TRUE makes the record disappear. Every variant tested
returned 200/0 — the bare key, exact JSON pairs, `DoormanFullTime`, `LandmarkStatusYN`.

**This is the worst failure mode available: syntactically accepted, semantically inert.** A
Sponsor-Unit or Maximum-Financing search pushed to the provider returns an empty page that is
indistinguishable from a legitimate "no results".

**Consequence for backend Search:** every NYC criterion sourced from `CustomFields` —
Sponsor Unit, Maximum Financing, Flip Tax, Doorman/Concierge, Landmark, Tax Abatement, Private
Outdoor Space, Unit Line — **CANNOT be pushed to the provider.** It must either be evaluated
locally over the complete eligible universe after fetch, or the search must **explicitly
refuse**. This is exactly the rule `MALLAN-CONTINUOUS-EXECUTION-STATE.md` §6 states; the
mechanism is now proven.

This interacts badly with the 25,000-row walk ceiling (§10.5): a complete-corpus local filter
cannot be correct if the universe was truncated. Either the ceiling rises for such queries or
the search refuses.

### 17.6 NYC ownership — `CommonInterest` is the correct field

Live-published members (13 global) with **real counts in our feed**:

| Value | Live rows | NYC term |
|---|---|---|
| `Condominium` | **240,321** | Condo |
| `StockCooperative` | **129,153** | Co-op |
| `RentalBuilding` | **31,061** | rental building |
| `Condop` | **19,783** | condop (NYC co-op/condo hybrid) |
| `CommunityApartment`, `Leasehold`, `Freehold`, `Timeshare`, `PlannedDevelopment`, `BareLandCondominium`, `CoOwnership`, `Other`, `None` | | |

**`OwnershipType` is a real Cotality field but publishes NOTHING for us — `CommonInterest` is
the field.** A reasonable guess would have chosen wrong.

**Correction for the 33 mis-stored `listings.property_type` rows (§16.2):**

| Stored (wrong column) | rows | Correct |
|---|---|---|
| `Condominium` | 25 | `CommonInterest = 'Condominium'`, `property_type = Residential` |
| `Cooperative` | 7 | `CommonInterest = 'StockCooperative'` ← **token differs from the NYC word** |
| `Condop` | 1 | `CommonInterest = 'Condop'` |

Note `Cooperative` is **not** a Cotality token. The provider token is `StockCooperative`.

This also fixes the AI Market Report root cause (§16.3): its `TYPE_FILTERS` used
`Condo`/`Cooperative`/`Condop`/`SingleFamilyTownhouse` as **PropertyType/PropertySubType**
values. They belong to `CommonInterest`, and `SingleFamilyTownhouse` maps to
`PropertySubType='SingleFamilyResidence'` or `StructureType='Townhouse'`.

Other NYC-relevant vocabularies verified live:
- `ArchitecturalStyle` (18 authorized, arity 15) — includes **`Prewar`**, **`WalkUp`**, `Loft`,
  `ArtDeco`, `BeauxArts`, `Brownstone`-adjacent styles
- `StructureType` (11, arity 5) — `HighRise`, `Townhouse`, `MixedUse`, `Duplex`, `Triplex`
- `AssociationFeeIncludes` (14, arity 20) — what maintenance/common charges cover

### 17.7 ⚠ ENTITLEMENT SCOPING IS NOT PROVEN — do not filter by it

Owner ruling: do not treat a discovered system identity as the subscription entitlement unless
Cotality explicitly proves it is the correct discriminator. Investigated:

| Question | Answer from the authorized API |
|---|---|
| Does Cotality publish a definition of `SystemReferences`? | **NO.** `Field` rows for the Lookup resource return `Definition` values that merely echo the field name. |
| Does `DataSystem` publish an entitlement discriminator? | **NO.** It names the feed and its ID only. |
| Is `OriginatingSystemName` documented as an entitlement selector? | **NO.** It is a record-origin field. |
| Can `Lookup` return subscription-scoped values directly? | **No evidence that it does.** It returns the platform vocabulary. |

**CONCLUSION: the `SystemReferences` scoping I implemented is an UNPROVEN HEURISTIC and must not
be enforced as entitlement.** The prototype artifact has been demoted to
`docs/operations/evidence-2026-09-07/PROTOTYPE-cotality-contract-UNPROVEN-SCOPING.json` and is
evidence only. `data/` carries no competing contract.

**The provable alternative:** Cotality already scopes what it serves us. Therefore the authoritative
statement of "what values occur in our subscription" is **measured from our own data**, e.g.
`Property?$filter=CommonInterest eq 'Condop'&$count=true` → 19,783. That is a fact, not an
inference. Any narrowed vocabulary must be labelled **observed**, never **entitled**, unless
Cotality publishes an entitlement contract.

Counter-evidence against the heuristic: `Condop` and `RentalBuilding` each show
`SystemReferenceCount = 1`, yet both have tens of thousands of live rows in our feed. A naive
"few systems ⇒ not ours" reading would be exactly backwards.

### 17.8 Corrections to the rebny-compliance skill found in this study

| Skill claim | Live truth |
|---|---|
| `MoveInCostsAmountTotal` / `MoveInCostsComments` "do not exist on Property — check CustomProperty" | **`MoveInCosts`, `MoveInCostsAmount`, `MoveInCostsComments` ARE first-class Property fields.** |
| "All 12 Trestle resources" | **18 entity sets** |
| Gate 1 `Permission = OwnerOptOut` | `OwnerOptOut` is not published |

---

## 18. RESOURCE ENTITLEMENT CENSUS — measured, whole-corpus (2026-09-07)

Previous sections spot-checked. This is an exact `$count` over every published entity set.
It changes what backend Search can honestly offer.

### 18.1 What our subscription actually contains

| Resource | Rows | Verdict |
|---|---|---|
| **Property** | **591,565** | populated |
| **Media** | **1,999,708** | populated (~3.4 per listing) |
| **CustomProperty** | **591,607** | populated — **1:1 with Property** |
| **Member** | **11,191** | populated |
| **OpenHouse** | **1,402** | thin but real |
| **Office** | **578** | thin but real |
| `PropertyRooms` | **86** | 86 rows against 591k listings — **effectively unusable** |
| `PropertyUnitTypes` | **1** | **EMPTY** — and every `UnitType*` field in that row is null |
| `Building` | **HTTP 403 FORBIDDEN** | **NOT LICENSED** |
| `Teams` | HTTP 400 | **NOT ENTITLED** |
| `TeamMembers` | HTTP 400 | **NOT ENTITLED** |
| `HistoryTransactional` | HTTP 400 | **NOT ENTITLED** |
| `PropertyGreenVerification` | HTTP 404 | does not exist |
| `Enumeration` | HTTP 404 | does not exist |
| Field / Lookup / Model / DataSystem | 2,249 / 191,912 / 17 / 1 | metadata resources |

**Six data resources are usable. Twelve of the eighteen are not.**

### 18.2 ⚠ THE ENTITLEMENT DISCRIMINATOR — found, and it is authoritative

§17.7 concluded that Cotality publishes no entitlement contract, so scoping could not be proven.
**That was incomplete.** Cotality states entitlement by REFUSING unentitled resources:

```
Teams / TeamMembers / HistoryTransactional
  -> HTTP 400  "No OriginatingSystemNames available for querying given request!
                This is an indication that you do not have access to the defined
                Data Provider or fields in the filtering or ordering queries not
                permitted by Data Provider."

Building
  -> HTTP 403  "Resource ...Building... "
```

**That is the authoritative entitlement signal — an explicit provider refusal, not an inference
from dictionary metadata.** It is the correct basis for an entitlement model:

- **Resource entitlement** = does the resource answer, or refuse with 400/403.
- **Field entitlement** = the same refusal appears per-field (`InternetEntireListingDisplayYN`
  returns *"Results from '<system>' has been suppressed (provider Level) as field ... cannot be
  used for filtering or ordering queries"*).
- **Value entitlement** = measured by `$count` per value over the full corpus.

None of these require Mallan to infer a system identity. **The `SystemReferences` heuristic
remains unproven and unused; this replaces it with provider-stated facts.**

### 18.3 CONSEQUENCES FOR BACKEND SEARCH — these are correctness issues, not cleanup

**1. Building Search cannot be served from Cotality. `Building` is HTTP 403 — not licensed.**
The repo carries `app/api/buildings/search/route.ts`, `app/api/buildings/route.ts`,
`lib/buildings/public-building-data.ts`, `lib/buildings/building-address-filter.ts` and a CRM
building directory. Phase 1 already flagged `/api/crm/buildings` as OBSOLETE because its table
has no live writer. **Now the provider side is settled too: there is no Cotality Building
resource available to us.** Building identity must be derived from Property address fields
(`BuildingName`, `StreetNumber`/`StreetName`/`StreetSuffix`, `SubdivisionName`) or be a
Mallan-owned concept. It cannot be a Cotality Building lookup.
Note `$expand=Building` returned **0 rows silently** rather than 403 — another silent failure.

**2. Multi-family / townhouse unit mix is not available.** `PropertyUnitTypes` = 1 empty row.
No `UnitTypeActualRent`, `UnitTypeTotalRent`, `UnitTypeProForma`, `UnitTypeBedsTotal`,
`UnitTypeUnitsTotal`. A rent-roll feature cannot be built on Cotality data. If Mallan needs it
for multi-family or townhouse listings it must be **Mallan-authored**.

**3. Room-by-room detail is not available.** `PropertyRooms` = 86 rows across 591,565 listings
(0.015%). `RoomType`, `RoomLevel`, `RoomDimensions`, `RoomFeatures` cannot drive search or
display.

**4. Listing change history is not available.** `HistoryTransactional` = HTTP 400. Price-change
and status-change history must be derived from Mallan's own captured `ModificationTimestamp`
deltas, not from the provider.

**5. Team structures are not available.** `Teams` / `TeamMembers` = HTTP 400. Any team concept
is Mallan-owned. Note Property still carries `ListTeamKey` / `ListTeamMlsId` scalar fields —
those may be populated even though the Team resource is not queryable; that needs its own
population check before use.

**6. The NYC layer IS fully available.** `CustomProperty` at 591,607 is 1:1 with Property, so
flip tax, maximum financing, sponsor unit, doorman, landmark status, tax abatement, unit line
and outdoor space are present for essentially every listing — but per §17.5 they sit inside the
`CustomFields` JSON blob and **cannot be filtered at the provider**, so they are post-fetch
criteria over a complete corpus, or an explicit refusal.

### 18.4 What was wrong in my own earlier sections

| Earlier claim | Correction |
|---|---|
| §17.2 "`$expand` works on all 14 navigation properties" | It returns **HTTP 200 with 0 rows** for `Building`, `Rooms`, `UnitTypes` — because those resources are unlicensed or empty, not because that listing lacked them. `$expand` masks entitlement failures. |
| §17.7 "Cotality publishes no entitlement discriminator" | **Wrong.** It publishes entitlement by refusal (400/403). See 18.2. |
| §17.2 sampled one apartment and inferred sub-resources were empty | Correct conclusion, wrong method. The resources are empty **corpus-wide**, which only a full count shows. |

### 18.5 Method note

`scripts/cotality/census-field-population.mjs` performs the per-field version of this: for every
declared field it issues `$count` over the whole corpus for `ne null`, tests filterability and
orderability, and distinguishes "always null" from the **SILENT-FAIL** pattern (`ne null` = 0
AND `eq null` = 0, meaning the predicate is inert rather than the data absent). Run per resource;
output is evidence, not a new authority.

---

## 19. FIELD CENSUS + SEARCH CONSOLIDATION MAP (2026-09-07)

### 19.1 The real searchable surface — whole-corpus, every field tested

`scripts/cotality/census-field-population.mjs --resource Property` — for each of the 757 declared
fields it issued `$count` over all 591,565 rows for `ne null`, then tested `$filter` and
`$orderby`. Not sampled.

| | Count |
|---|---|
| Declared in `$metadata` | 757 |
| **ALWAYS NULL in our subscription** | **458 (60.5%)** |
| Have data | **299** |
| Populated **and** filterable | **299** |
| Populated **and** sortable | 291 |
| Populated but NOT filterable | **0** |

**The searchable surface is 299 fields, not 757.** A search UI generated from the schema would
offer ~458 filters that can never match anything.

Population bands among the 299:

| Band | Fields | Meaning for Search |
|---|---|---|
| ≥99% | **58** | the reliable core |
| 50–99% | 39 | usable, disclose coverage |
| 10–50% | 58 | usable with care |
| 1–10% | 60 | rarely useful |
| **<1%** | **28** | **must not be offered as filters** |

Settled by this census: `City` is 100% populated with a single value, so **`CityRegion` is the
borough field** (100% populated, filterable, sortable). `PropertyUnitTypes`-based rent-roll and
`PropertyRooms`-based room detail are unavailable (§18).

Evidence: `docs/operations/evidence-2026-09-07/census-Property.json` and `census-Property.log`,
`census-PropertyUnitTypes.json`.

### 19.2 COMPETING SEARCHES — every path reaching Cotality outside the canonical engine

Measured on the lane: `git grep -l "odata" search/browser-integration-2026-09-05 -- lib app`.

**CANONICAL (the one that must survive):**
`lib/search/engine/provider-client.ts` — with `criteria.ts`, `provider-query.ts`, `universe.ts`,
`executor.ts`, `hydrate.ts`, `select.ts`, `saved-search.ts`, `contract.ts`.
Only three search entry points are exported anywhere on the lane:
`executeSearch()`, `searchContract()`, `queryProvider()`.

**COMPETING LIB MODULES (13):**

| Module | Disposition |
|---|---|
| `lib/idx/fetch.ts` | second provider client — **consolidate into the engine client** |
| `lib/idx/sync.ts` · `media-sync.ts` · `media-pagination.ts` · `one-cycle-preflight.ts` | ingestion lane — legitimately separate concern, but must use ONE HTTP/auth authority |
| `lib/idx/cotality-telemetry.ts` | telemetry — fold into the single client |
| `lib/search/public-listing-trestle.ts` | **PUBLIC search — out of scope**, but shares the provider; non-regression proof required |
| `lib/buildings/public-building-data.ts` | **DEAD — `Building` is HTTP 403, not licensed (§18)** |
| `lib/open-houses/upcoming-open-houses.ts` | specialized consumer — migrate to the engine client |
| `lib/market-report/generator.ts` | **DEAD — live-verified type filters (§16.3)** |
| `lib/search/canonical/field-registry.ts` · `live-truth.ts` | vocabulary readers — must resolve to ONE authority with `lib/cotality/live-contract.ts` |

**ROUTES REACHING THE PROVIDER DIRECTLY (12) — each bypasses the engine:**

| Route | Scope | Disposition |
|---|---|---|
| `app/api/crm/sales/prospects/[id]/comps/route.ts` | BACKEND | **migrate to engine** |
| `app/api/crm/sales/prospects/[id]/research/route.ts` | BACKEND | **migrate to engine** |
| `app/api/crm/sales/prospects/[id]/pitch-packet/route.ts` | BACKEND | **migrate to engine** |
| `app/api/crm/sales/prospects/[id]/pdf/route.ts` | BACKEND | **migrate to engine** |
| `app/api/agents/[slug]/listings/route.ts` | PUBLIC | consumer — migrate to shared client |
| `app/api/buildings/search/route.ts` | BACKEND | **cannot work — Building is 403** |
| `app/api/listings/building/route.ts` | PUBLIC | same |
| `app/api/listings/route.ts` | **PUBLIC — OUT OF SCOPE** | do not reopen; shared-module changes need non-regression proof |
| `app/api/listings/similar/route.ts` | PUBLIC | consumer |
| `app/api/listings/suggest/route.ts` | PUBLIC | consumer |
| `app/api/market/route.ts` | PUBLIC | consumer |
| `app/api/media/batch/route.ts` | shared | media lane |
| `app/api/open-houses/route.ts` | PUBLIC | consumer |
| `app/api/cron/feed-reconcile/route.ts` | cron | also holds `startsWith("RLS")` — §12.6 |
| `app/api/cron/prospect-triggers/route.ts` | cron | migrate |

**NEWLY FOUND:** the four `crm/sales/prospects/[id]/*` routes were not in the Phase 1 matrix.
They are BACKEND surfaces issuing their own provider queries — additional competing searches.
The matrix in §10 is therefore **incomplete and must be extended before Phase 7 deletion**.

### 19.3 Consolidation order — safe, not a sweep

Per the owner's Step 8: do not create new files; determine which existing implementation is
correct, migrate all readers, then delete the redundant authority.

1. **Canonical = `lib/search/engine/*`.** Already wired to saved-search execute, count, and the
   alerts cron; already deleted its predecessors (`core.ts`, `criteria-to-prisma.ts`,
   `crm-idx-filter.ts`, `canonical/saved-search.ts`).
2. **Delete outright — provably dead, no migration needed:**
   `lib/buildings/public-building-data.ts` + `app/api/buildings/search` + `app/api/listings/building`
   (Building = 403) and `lib/market-report/generator.ts` (type filters do not exist live).
   Each needs a negative test proving the path cannot silently return.
3. **Migrate the 4 backend prospect routes** onto `executeSearch()`.
4. **Consolidate HTTP/auth**: `lib/idx/fetch.ts` → the engine's `provider-client.ts`
   (`queryProvider`/`walkProvider`), keeping `lib/idx/auth.ts` as the single token authority
   (already the only one at target).
5. **Resolve the two vocabulary readers** (`canonical/live-truth.ts`, `cotality/live-contract.ts`)
   to one.
6. **Public consumers last**, with explicit non-regression proof. Public Search stays out of scope.

**Nothing above is executable until the lane is reachable.** Every item is reported, not done.
