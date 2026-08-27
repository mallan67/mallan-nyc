# Agent + Listing Identity (Cotality-authoritative) + Canonical URL — Audit

> Generated 2026-05-28. **Audit only. No code.** Branch (when opened): `fix/agent-listing-identity-cotality-url`.
>
> **Governing principle (Maya, locked):** *Always follow Cotality rules.* Do NOT build a local-only shortcut that merely makes the page look right. Cotality / IDX Plus / REBNY identity is **authoritative** for cross-source agent + listing matching. Name matching is **fallback only** when no stronger ID exists (REBNY syndication invariant I.4).
>
> Supersedes the partial conclusions in the conversation: the earlier "agent_id mismatch" hypothesis was **wrong** (verified — see §1). The real causes are an IDX-only display gate on the agent page, a cross-source merge that doesn't dedupe, and a Cotality-incompatible agent-identity capture path.

---

## 0 · Evidence — live production values (read-only query, 2026-05-28)

| Field | Maya (Agent table) | SL-0004 (CRM exclusive) | RLS20093870 (Trestle/IDX copy — same physical unit 2G) |
|---|---|---|---|
| `Agent.id` / `listing.agent_id` | **1** | **1** ✓ (matches Maya) | `null` |
| `trestle_mls_id` / `ListAgentMlsId` | **39361** | **"" (empty)** | **39361** ✓ (matches Maya) |
| `ListAgentKey` | (not stored) | "" | 25272030 |
| `license_no` (NY State) | 10311201806 | — | — |
| `ListAgentFullName` | Maya Allan | "" | Maya Allan |
| `ListAgentEmail` | maya@mallan.nyc | "" | maya@mallan.nyc |
| `ListOfficeName` | (not stored; constant = "Mallan Real Estate Inc.") | "" | **"MAllan Real Estate Inc"** (REBNY typo) |
| `ListOfficeMlsId` | (not stored) | "" | 7041 |
| `ListOfficeKey` | (not stored) | "" | 5671398 |
| `idx_display_yn` | — | **`false`** | `true` |
| `status` | active | Active | Active |

Two physical-identity facts: SL-0004 and RLS20093870 are the **same unit** (333 E 46th St #2G). SL-0004 is the CRM-owned Mallan exclusive; RLS20093870 is the Trestle copy REBNY created after submission.

---

## 1 · The agent-page failure — true root cause (earlier hypothesis corrected)

`/agents/maya-allan` → `/api/agents/[slug]/listings` builds results from two branches and merges them:

- **DB branch** (`fetchDbAgentListings`, route.ts:148-209): `prisma.listing.findMany({ where: { agent_id } })` then `filterDisplayableDbListings()` then status filter then `preferCrmExclusiveOverIdxDuplicate()`.
- **Trestle branch** (`fetchTrestleAgentListings`, route.ts:94+): Trestle OData `$filter=ListAgentFullName eq 'Maya Allan' …`.
- **Merge** (route.ts:53-59): `dbActiveNew = dbResults.active.filter(l => !trestleActiveIds.has(l.id))` → dedupes **by exact listing_id only**.

**Why SL-0004 disappears — NOT agent_id.** SL-0004.`agent_id = 1` = Maya.id. The query matches it. It is then dropped by `filterDisplayableDbListings` (`lib/idx/db-to-public-dto.ts:236-254`):

```js
// Gate 2: IDX display must be enabled (fail-closed: null/undefined → deny)
if (!affirmPermission(l.idx_display_yn)) return false;   // SL-0004.idx_display_yn=false → DROPPED HERE
```

`/api/listings` (general) **shows** SL-0004 with the same `idx_display_yn=false` because it uses a different, Mallan-exclusive-aware gate (`buildSearchDisplayWhere` / `SEARCH_DISPLAY_GATE`). The agent route uses the raw IDX-feed gate → inconsistent → SL-0004 dropped only on the agent page.

**Why RLS20093870 survives.** It comes from the Trestle branch (matched by name), has `idx_display_yn=true`, and the merge only dedupes by exact id. The existing `preferCrmExclusiveOverIdxDuplicate()` runs **only inside the DB branch**, so it never sees the Trestle row → no cross-source suppression.

Ruled out by evidence: agent_id↔User-id space mismatch (sessions use `Agent.id`; `createSession("agent", agent.id…)` in `lib/auth/oauth.ts:40`); status filter (SL-0004 is Active); `rls_eligible` bypass (SL-0004 is RLS-eligible, so it does not take the `=== false` website-only bypass at line 243).

---

## 2 · The agent-identity CAPTURE path is not Cotality-compatible

This is why SL-0004 has empty/wrong identity, and the deeper "always follow Cotality" issue.

**2a. The picker is fake.** `public/crm/SALE-FORM-REDESIGN.html:5772`:
```js
var rebnyAgents = { 'mallan': [] };          // "Loaded from API" — but NEVER loaded
var rebnyCompanyNames = { 'mallan': 'Mallan Real Estate Inc.' };  // hardcoded single entry
```
`renderAgentList` reads `rebnyAgents[companyKey]` → always `[]` → the dropdown shows *"Select a company first"* / *"No agents match"* forever. The banner *"pulled from the REBNY RLS database"* is **false**. Maya cannot pull her agent (confirmed by screenshot).

**2b. The auto-fill path uses the WRONG identifier.** `initLoggedInAgent()` pulls `/api/auth/me` (`u`) and `collectSaleFormData` maps (lines 7089-7094):

| Form line | Mapping | Problem |
|---|---|---|
| `data.ListAgentMlsId = data.saleUpdatingAgent` | `saleUpdatingAgent = u.id` = internal **Agent.id ("1")** | Should be `trestle_mls_id` (**39361**). RESO `ListAgentMlsId` ≠ internal PK. |
| `data.ListOfficeKey = data.saleUpdatingAgentCompanyKey` | `= "mallan"` (slug) | Should be Cotality `ListOfficeKey` (**5671398**). |
| (no mapping) | `ListOfficeMlsId` | **Never captured** (should be **7041**). |
| `data.ListAgentFullName / Email / DirectPhone` | from session | OK in principle. |

**2c. The session never exposes the Cotality id.** `/api/auth/me` (`app/api/auth/me/route.ts`) selects `license_no` and returns `license: agent.license_no`, `companyKey:"mallan"` — but **does not return `trestle_mls_id`** or any office MLS id/key. So even a correct mapping has nothing to read.

Net: every CRM exclusive is saved with **no Cotality agent/office identity** (SL-0004 = empty), making cross-source matching by `ListAgentMlsId` impossible for CRM rows. They are only linkable by internal `agent_id`.

---

## 3 · Identity audit table (Maya's required columns)

| Field | Cotality / IDX Plus source | Current CRM value (SL-0004) | Current Trestle value (RLS20093870) | Required value (CRM-owned) | Source of truth | Fix | Test |
|---|---|---|---|---|---|---|---|
| Agent MLS id | `Member.MemberMlsId` → listing `ListAgentMlsId` | "" | 39361 | **39361** | `Agent.trestle_mls_id` | Expose `trestle_mls_id` via `/api/auth/me`; `collect` maps `ListAgentMlsId ← trestle_mls_id` (not `Agent.id`); backfill SL-0004 | SL-0004 gets `ListAgentMlsId=39361`; collect never emits internal id |
| Agent full name | `ListAgentFullName` | "" | Maya Allan | Maya Allan | `Agent.full_name` | capture + backfill | round-trips |
| Agent email | `ListAgentEmail` | "" | maya@mallan.nyc | maya@mallan.nyc | `Agent.email` | capture + backfill | round-trips |
| Agent key | `ListAgentKey` | "" | 25272030 | 25272030 (if verified) | **NOT stored** — open item | add `Agent.trestle_member_key` OR derive from verified Cotality | present when known |
| Office name | `ListOfficeName` | "" | "MAllan Real Estate Inc" (typo) | **"Mallan Real Estate Inc."** | `MALLAN_BROKERAGE_NAME` constant | CRM rows use canonical name, **never the REBNY typo** | CRM row office name = canonical |
| Office MLS id | `ListOfficeMlsId` | "" | 7041 | 7041 (verify) | **NOT stored** — open item | add canonical office id store (`MALLAN_OFFICE_MLS_IDS` / Office record); capture + backfill | present + correct |
| Office key | `ListOfficeKey` | "" (would be "mallan") | 5671398 | 5671398 (verify) | **NOT stored** — open item | same as above; stop writing "mallan" slug into `ListOfficeKey` | not a slug |
| CRM ownership | (internal) `listing.agent_id` | 1 | null | 1 | session `Agent.id` | keep as CRM-owned match key | agent page finds SL-0004 by agent_id |
| Listing physical id | address atoms + unit + zip | 333 / E / 46th / Street / 2G / 10017 | same | same | listing `address` JSON | cross-source dedupe key (already in `dedupe-crm-vs-idx.ts`) | same-unit dedupes, diff-unit doesn't |
| Display eligibility | `idx_display_yn` (IDX feed) vs Mallan-exclusive site rule | `false` | `true` | site-displayable as Mallan exclusive | Mallan-exclusive display decision | agent page uses Mallan-exclusive-aware gate, not raw IDX gate | `idx_display_yn=false` exclusive still shows on agent page |

---

## 4 · Canonical URL audit (workstream B)

Root: `generateListingSlug` (lib/listing-slug.ts:114-118) deliberately appends `-{id}` → DTO `slug` is hybrid (`…-sl-0004`). `buildCanonicalListingPath` (lib/listing-canonical-url.ts:26-44) strips it to `/listing/{address}/{id}`. Only the detail page + `lib/crm/listing-urls.ts` use the builder; ~15 emitters concat the hybrid slug + `?key=`.

| Surface | Current emitted URL | Required | Fix |
|---|---|---|---|
| FeaturedListings (249,254), Compare (186), RecentlyViewed (85), SimilarListings (47), LiveListingsWidget (184), favorites (230), agent-page ActiveListingsTabs (48), `lib/idx/display-adapter.ts:44` | `/listing/{hybrid-slug}?key={id}` | `/listing/{address}/{id}` | route through `buildCanonicalListingPath`; drop `?key=` |
| building (392,485), buildings (351,405), BuildingUnits (279) | `/listing/{mlsId}` | `/listing/{address}/{id}` | same |
| `app/sitemap.ts:116` | `/listing/{hybrid-slug}` | `/listing/{address}/{id}` | use builder |
| CRM publish modal (SALE-FORM `:6726`) | `mallan.nyc/listing/{hybrid-slug}` | canonical | use API `publicUrl` (already canonical via `lib/crm/listing-urls.ts`) |
| Detail page (`[...slug]/page.tsx:859-864`) | 308 legacy→canonical; canonical meta | ✓ | none — already correct (inbound) |

Legacy forms that may **redirect** but must **never be emitted**: `/listing/{hybrid-slug}`, `/listing/{hybrid-slug}?key={id}`, `/listing/{id}`, `/listing/listing-{id}`.

Minimal-DTO change (justified): add one canonical `url` (or `path`) field to the public DTO computed via `buildCanonicalListingPath`, so consumers read `listing.url` instead of constructing it. No broader DTO consolidation.

---

## 5 · Backfill plan (idempotent, controlled — principle 8)

Script `scripts/backfill-crm-exclusive-cotality-identity.ts` (dry-run default; `--apply` to write):
1. Select CRM exclusives (`listing_id` prefix `SL-`/`RL-`, or `agent_id != null`) where any of `agent_info.ListAgentMlsId / ListAgentFullName / ListAgentEmail / ListOfficeName / ListOfficeMlsId / ListOfficeKey` is blank.
2. For each, read the owning `Agent` (`agent_id`) → `trestle_mls_id`, `full_name`, `email`; read canonical office identity (constant/Office record).
3. **Fill only blank fields.** Never overwrite a non-blank value without `--force` + explicit approval. Never write the REBNY "MAllan" typo into a CRM row — always canonical "Mallan Real Estate Inc."
4. Log before/after per row + a summary count. Safe to rerun (idempotent — a re-run with all fields filled is a no-op).
5. Also backfill the promoted columns `list_agent_full_name`, `list_office_name`.

For SL-0004 specifically → `ListAgentMlsId=39361`, `ListAgentFullName="Maya Allan"`, `ListAgentEmail="maya@mallan.nyc"`, `ListOfficeName="Mallan Real Estate Inc."`, `ListOfficeMlsId=7041*`, `ListOfficeKey=5671398*` (*pending Maya verification — see §8).

---

## 6 · Proposed PR structure (3 commits, one branch)

Branch `fix/agent-listing-identity-cotality-url`:
1. **Commit 1 — this audit doc.**
2. **Commit 2 — backend identity + agent-page fix:**
   - `/api/auth/me` + `/api/crm/agents/me`: expose `trestle_mls_id` (+ canonical office id/key/name).
   - Agent route: DB branch uses the **Mallan-exclusive-aware display decision** (not raw `filterDisplayableDbListings`) so `idx_display_yn=false` exclusives show; Trestle branch matches by **`ListAgentMlsId = trestle_mls_id`** (name fallback); **cross-source dedupe after merge** (extend `dedupe-crm-vs-idx` to the merged set, prefer `SL-`/`RL-`).
   - Canonical `url` field on DTO + route all emitters + sitemap + CRM modal through `buildCanonicalListingPath`; drop `?key=`.
   - Backfill script (dry-run committed; apply run is a separate, logged, Maya-approved step).
3. **Commit 3 — form capture fix:**
   - `collect` maps `ListAgentMlsId ← trestle_mls_id`; office fields ← canonical office identity (stop writing `Agent.id` / "mallan" slug).
   - Picker: either (a) wire to a real agent-search endpoint backed by the Agent table / Cotality `Member`, or (b) since the creating agent IS the listing agent, drive identity from the authenticated session and present the picker read-only/confirmable. Persist stable `ListAgentMlsId / FullName / Email / ListOfficeName / ListOfficeMlsId / ListOfficeKey`.

Frontend-only vs backend-required: **backend-required** = `/api/auth/me`, agent route, DTO `url`, backfill. **Frontend** = collect mapping, picker, emitter URL usage. Both needed for full correctness; agent-page CHECK-4 pass needs only the agent-route display-gate + cross-source dedupe (commit 2).

---

## 7 · Tests (all required by Maya)

1. Agent page returns SL-0004 and **excludes** RLS20093870 (same unit).
2. Trestle branch matches by `ListAgentMlsId` when present; name fallback only when no MLS id exists.
3. Mallan exclusive with `idx_display_yn=false` but valid Mallan display eligibility **appears** on agent page.
4. CRM row + Trestle duplicate dedupes **after merge**, prefers `SL-`/`RL-`.
5. Same building, different unit (e.g. 20B) **remains**.
6. Backfill fills SL-0004's blank `agent_info` from Agent/Office source; non-blank values untouched; rerun is a no-op; "MAllan" typo never written to CRM rows.
7. Picker persists stable agent + office IDs (`ListAgentMlsId`, `ListAgentFullName`, `ListAgentEmail`, `ListOfficeName`, `ListOfficeMlsId`/`ListOfficeKey`).
8. Emitted URLs are canonical two-segment only; legacy hybrid/`?key=`/id-only **redirect** but are never emitted.
9. Suppressed-address listing (`internet_address_display_yn=false`) does not leak address in URL (slug → `listing-{id}`).
10. `collect` never emits internal `Agent.id` as `ListAgentMlsId`.

---

## 8 · Open items requiring Maya's confirmation (fail-closed — do not invent)

1. **Canonical Mallan office identifiers.** `ListOfficeMlsId=7041` and `ListOfficeKey=5671398` are **observed from the Trestle copy**, not stored canonically anywhere in our system (`MALLAN_OFFICE_MLS_IDS` is empty; Agent table has no office id/key). Per principle 8 the backfill "reads canonical office fields" — those fields don't exist yet. **Decision needed:** (a) confirm 7041 / 5671398 are correct and store them (constant in `mallan-identity.ts` or a new Office record), or (b) confirm via REBNY/the legacy upstream intermediary before use. Until confirmed, backfill fills office **name** only (canonical) and leaves office id/key blank rather than guess.
2. **`ListAgentKey` (25272030)** — same situation (observed on Trestle, not stored). Store on `Agent` (`trestle_member_key`) or leave blank until confirmed.
3. **Schema touch?** Storing office id/key/agent-key cleanly may want new nullable `Agent`/Office columns → that is **NEON.md-governed** and needs explicit approval (Maya hold). The backfill + capture can work without it by sourcing office name from the constant and office id/key from a verified config — confirm preferred path.

---

## 9 · Compliance notes

- **Cotality-authoritative** matching (`trestle_mls_id`/`ListAgentMlsId`) over name — satisfies syndication invariant I.4 and Maya's principle 1.
- **No REBNY typo propagation** — CRM-owned rows use canonical office name; Trestle-synced rows keep source spelling (principle 3).
- **No DB mutation of Trestle rows** — backfill touches CRM-owned rows only; the IDX duplicate stays intact for audit history.
- **Address suppression** preserved in dedupe + URL (no leak).
- **Agent page display** broadened only for Mallan-owned exclusives via the Mallan-exclusive display decision — does **not** loosen the IDX-feed gate for third-party rows.

**No code until this doc is reviewed and approved.**
