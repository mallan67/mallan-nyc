# Sentinel-L Improvement Audit — Findings Must Explain the Failure, Not the Detector

**Status:** SPEC / REPORT ONLY · **Date:** 2026-05-29 · **Author:** Claude Code under Maya direction
**Scope of the implementation PR this spec governs:** Sentinel-L **finding schema + category taxonomy + output behavior only.**
**Hard scope rule:** **No product code fixes ride in the Sentinel-L improvement PR.** Sentinel-L is report-only. Any product bug it surfaces is fixed in its *own* separate PR.

> No code was written or changed to produce this document. It is the design contract for the next Sentinel-L iteration. Implementation (workflow YAML + scanner script + tests) is a follow-up PR that must satisfy §7 acceptance criteria.

---

## 0. Current state (grounded, not assumed)

Read from the live repo on 2026-05-29:

- **Workflow:** `.github/workflows/sentinel-listing-readiness.yml` — *"Sentinel-L – Platform Actionable Error Scanner"*. Triggers on `pull_request` (opened/synchronize/ready_for_review) for the listing-workflow path set (`public/crm/**`, `app/api/listings/**`, `app/api/buildings/**`, `app/api/crm/**`, `app/listing/**`, `lib/search/**`, `lib/idx/**`, `lib/crm/**`, `lib/media/**`, `lib/compliance/**`, `lib/address/**`, `lib/listing-slug.ts`, `lib/listing-canonical-url.ts`, …) plus `workflow_dispatch`.
- **Scanner:** `npm run sentinel:l` → writes `ops/audit/sentinel-l/<ts>-errors.json` + `.md`.
- **Output channels:** uploaded **artifact** (`actions/upload-artifact@v4`, `if: always()`), **GitHub Step Summary** (top-5 P0/P1), and a **red CI check** (`Fail on actionable errors`). **PR comment posting is disabled** (`if: ${{ false }}`, per PR #266 anti-spam).
- **Finding fields the scanner emits today** (from the summary builder): `code`, `severity`, `file`, `line`, `searchSystem`, `actualFailure`, `impact`, `required fix`, `proof required`.

### The gap this audit closes

Today a finding can read like a **detector match** ("field `X` appears near a `where:` clause") rather than a **business/system failure** ("Maya's exclusive disappears from public search because the display gate is inverted"). The current object has *some* explanatory fields (`actualFailure`, `impact`) but is missing the structured contract tie-in, the exact evidence snippet, the false-positive guard, the layer, the related surfaces, and a real system taxonomy (it only has a single `searchSystem` string).

**Goal (verbatim from Maya):** *Sentinel-L findings must explain the actual business/system failure, not just the detector match.*

---

## 1. The 15-field finding schema (mandatory for every finding)

Every Sentinel-L finding object in `*-errors.json` MUST contain all 15 fields. A finding missing any field is itself a Sentinel-L self-error (the writer rejects it — see §7).

| # | Field (JSON key) | Type | Rule |
|---|---|---|---|
| 1 | `code` | string | Stable id, `S-<SYSTEM>-<NNN>` (e.g. `S-COTALITY-001`). Stable across runs so findings can be tracked/suppressed. |
| 2 | `severity` | enum | `P0` \| `P1` \| `P2`. P0 = compliance/legal exposure or data loss or public-facing breakage; P1 = workflow-blocking or wrong data shown; P2 = degraded UX / cosmetic / SEO drift. |
| 3 | `system` | enum | One of the §2 systems. (Replaces the old free-text `searchSystem`.) |
| 4 | `layer` | enum | `frontend` \| `backend` \| `data` \| `compliance` \| `workflow`. |
| 5 | `file` + `line` | string + int | `file` repo-relative; `line` 1-based start line. Range allowed as `lineEnd`. |
| 6 | `triggerPattern` | string | The code pattern OR the **missing guard** that produced the finding. Name the rule, not just "matched regex". |
| 7 | `evidenceSnippet` | string | **Exact** source lines that triggered it (verbatim, ≤ 8 lines, with the line numbers). Not paraphrased. |
| 8 | `actualFailure` | string | Plain English: *"What breaks for Maya or the user?"* Concrete, not "may cause issues". |
| 9 | `whyError` | object | Tie to the governing contract — see §3. `{ "contract": <enum>, "rule": "<the specific clause>", "citation": "<file/section>" }`. |
| 10 | `expectedBehavior` | string | What should happen instead. |
| 11 | `requiredFix` | string | Precise engineering change (file + function + the exact change), **described** — not applied. |
| 12 | `proofRequired` | string | The exact test / command / production probe that flips red→green. Must be runnable/verifiable, per the project proof-first rule. |
| 13 | `falsePositiveGuard` | string | The safe pattern that must NOT be flagged (the negative-evidence rule). |
| 14 | `relatedSurfaces` | string[] | Other surfaces the same root cause touches (e.g. `["SALES_FORM","BUILDING_AUTOFILL","/api/buildings/search"]`). |
| 15 | `confidence` | object | `{ "level": "high"\|"medium"\|"low", "reason": "<why>" }`. Low confidence may emit but must say why and must not gate the build (see §6). |

### Before / after (the whole point)

**Detector-match style (banned):**
> `S-BACKSEARCH-009` — field `internet_address_display_yn` found within 500 chars of `where`. File `lib/search/public-listing-db.ts:212`.

**Business-failure style (required):**
> `S-DISPLAY-001` · **P0** · system `DISPLAY_GATE` · layer `compliance` · `lib/search/public-listing-db.ts:212`
> **triggerPattern:** public search builds its WHERE with `internet_entire_listing_display_yn=true` as a flat AND with no `rls_eligible=false` bypass branch.
> **actualFailure:** Maya's website-only exclusive `SL-0004` (InHouseWebOnly, both display flags false) is filtered out of `/search` and Featured — it never appears on mallan.nyc even though it's Active.
> **whyError:** `{contract:"REBNY_UCBA", rule:"InHouseWebOnly listings are website-displayable but RLS/IDX-gated; the display gate must branch on rls_eligible", citation:"docs/compliance/COMPLIANCE-CANONICAL-INDEX.md → display-gate"}`
> **expectedBehavior:** `rls_eligible=false` rows bypass the IDX display gate and require `list_price>0` + address present instead.
> …

---

## 2. System taxonomy (replaces free-text `searchSystem`)

`system` MUST be one of these. They map to the real mallan-nyc surfaces seen in PRs #237–#277:

| `system` | What it covers | Canonical code locations |
|---|---|---|
| `PUBLIC_SEARCH` | Public `/search`, Featured, search cards, address composition for display | `lib/search/public-listing-*`, `app/components/FeaturedListings.tsx`, `SearchListingCard.tsx`, `lib/address/**` |
| `BACKEND_SEARCH` | DB/OData query construction, filters, pagination, display-gate WHERE clauses | `lib/search/public-listing-db.ts`, `app/api/listings/**` |
| `DISPLAY_GATE` | `idx_display_yn`, `internet_*_display_yn`, `rls_eligible`, address suppression, status→public visibility | `lib/idx/**`, `lib/compliance/**`, `lib/search/**` |
| `SALES_FORM_SAVE_LOAD` | SALE/RENTAL form field round-trip (collect → POST/PATCH → DB → edit-reload), FIELD/RADIO/CHECKBOX maps | `public/crm/SALE-FORM-REDESIGN.html`, `app/api/crm/listings/**` |
| `BUILDING_AUTOFILL` | Building-tab + main-address lookup → form auto-population from Cotality | `app/api/buildings/search/route.ts`, `populateBuildingFromIDX` in the sale form |
| `COTALITY_CONTRACT` | OData `$select`/`$filter` field validity vs live Cotality/Trestle `$metadata`, RESO field names, picklists | `lib/idx/fetch.ts`, `lib/idx/trestle-mapper.ts`, `app/api/buildings/**`, `artifacts/metadata.xml` |
| `COTALITY_FEED` | **Connection integrity** — endpoint host, base URL, token endpoint, media host allowlist/CSP, deprecated endpoints. Flags **old Trestle/CoreLogic connections** that should now be Cotality. | `lib/idx/auth.ts`, `lib/idx/fetch.ts`, `app/api/media/proxy/route.ts`, `app/api/media/batch/route.ts`, `vercel.json` (CSP), env defaults |
| `MEDIA_P0` | Photo/floorplan/video classification, hero selection, dedup, media table vs JSON | `lib/media/**`, `app/api/crm/listings/**/media/**` |
| `LISTING_DETAIL` | `/listing/[...slug]` resolution, metadata, address compose, FARE Act disclosure render | `app/listing/[...slug]/page.tsx`, `lib/idx/db-to-public-dto.ts` |
| `CANONICAL_URL` | One-canonical-URL emission + redirect (`/listing/{address}/{id}`), slug generation | `lib/listing-slug.ts`, `lib/listing-canonical-url.ts`, `lib/crm/listing-urls.ts` |
| `AGENT_IDENTITY` | Agent attribution (Cotality-authoritative `trestle_mls_id` vs name fallback), `/agents/*` | `app/agents/**`, `lib/idx/**`, agent-card DTO |
| `AGENT_PAGE` | Agent listing tabs, active/closed filtering, attribution display | `app/agents/[slug]/**`, `ActiveListingsTabs` |
| `CRM_DASHBOARD` | My Listings, draft lifecycle, delete/withdraw, status transitions | `public/crm/js/manage/**`, `app/api/crm/listings/**` |

> Keep the legacy `searchSystem` value populated for one release as `system` alias, then drop it (migration note for the implementation PR).

`layer` ∈ `frontend | backend | data | compliance | workflow`. A finding can name additional layers in `relatedSurfaces` but `layer` is the **primary** locus of the fix.

---

## 3. `whyError.contract` enum — the tie-in that makes a finding real

Every finding must justify itself against at least one governing contract. `whyError.contract` ∈:

- `COTALITY_IDX_PLUS` — Cotality/Trestle 5.0 Web API + live `$metadata`: a field must exist in the resource before it can be `$select`ed/`$filter`ed; `ResourceRecordKey` not `ResourceRecordID`; read-only display. **The Cotality feed (`https://api.cotality.com/trestle`) is the single authoritative connection.** The feed migrated from the old **CoreLogic** Trestle endpoints to the **Cotality** domain; per `docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` and README, the legacy hosts `api-trestle.corelogic.com` + `api-prod.corelogic.com` (and the deprecated `Media/All` endpoint) were transition-only with removal deadlines of **2026-03-31 / 2026-04-30** — both now elapsed. Any live reference to a `corelogic.com` host, a hardcoded non-Cotality base URL, or `Media/All` is an **old connection** and a finding (see the `COTALITY_FEED` detector, §4.1). Note: the *word* "Trestle", the env var `TRESTLE_API_URL`, and `trestle-mapper.ts` are **current** (Trestle 5.0 is the API product served on the Cotality domain) — not stale.
- `REBNY_UCBA` — UCBA 2026 display/distribution rules, the 6 distribution gates, InHouseWebOnly vs InHouseInternal semantics.
- `RESO` — RESO field names, enum values, `PropertySubType`/`CommonInterest` mappings, picklist canonical values.
- `PUBLIC_DISPLAY` — NY DOS §175.25 advertising, FARE Act disclosure, Fair Housing language, address-suppression rules.
- `CRM_WORKFLOW` — the broker's save→publish→edit lifecycle invariants (draft suppression, two-layer status model, publish contract).
- `DATA_INTEGRITY` — round-trip/idempotency: what is saved must reload identically; no silent overwrite; canonical-only fields survive edit.
- `USER_BEHAVIOR` — observable user-facing breakage that isn't a named legal/contract rule but still breaks the product.

The `whyError.rule` must quote the *specific* clause, and `citation` must point at the canonical file (`docs/compliance/COMPLIANCE-CANONICAL-INDEX.md` + the area file, `data/RLS-FIELD-REGISTRY.md`, `NEON.md`, etc.). **Fail-closed:** if the rule is unclear or absent from the canonical file, the finding is downgraded to `confidence.level=low` and `severity` capped at P2 — never assert a P0 contract violation from memory (CLAUDE.md §E).

---

## 4. Worked example findings (grounded in real mallan-nyc systems)

These demonstrate the schema. They are illustrative templates for the scanner authors, derived from real issues fixed in PRs #238/#262/#264/#267/#270/#272/#274/#276/#277 — **not** a live scan result.

### S-COTALITY-001 — phantom `$select` fields 400 the whole building query
```json
{
  "code": "S-COTALITY-001",
  "severity": "P0",
  "system": "COTALITY_CONTRACT",
  "layer": "backend",
  "file": "app/api/buildings/search/route.ts",
  "line": 88,
  "triggerPattern": "OData $select includes a field name absent from the live Cotality Property $metadata (artifacts/metadata.xml). No metadata-backed allowlist guards the $select.",
  "evidenceSnippet": "88: const select = ['UnitNumber','BuildingName','AttendanceType','NewDevelopmentYN','SponsorUnitYN','RentingAllowedYN', ...].join(',');",
  "actualFailure": "Trestle returns HTTP 400 for the entire query, so the building lookup returns nothing. The broker picks a building and NOTHING auto-populates — the failure is silent (the 400 is swallowed), so it looks like 'the building just isn't found'.",
  "whyError": { "contract": "COTALITY_IDX_PLUS", "rule": "A field must exist on the resource in live $metadata before it can be $select'd; an unknown field invalidates the whole OData request.", "citation": "artifacts/metadata.xml (Property resource); data/RLS-FIELD-REGISTRY.md" },
  "expectedBehavior": "$select contains only fields present in Property $metadata; concierge/on-site-manager are derived from BuildingFeatures (valid field), not phantom booleans.",
  "requiredFix": "Remove AttendanceType, NewDevelopmentYN, SponsorUnitYN, RentingAllowedYN from the $select; derive from BuildingFeatures; add a metadata-backed contract test that fails on any unknown $select field.",
  "proofRequired": "tests/runtime/cotality-building-autopopulate.test.ts asserts every $select field ∈ metadata field set; live probe: GET /api/buildings/search?address=333+E+46th returns 200 with populated fields (not 400/empty).",
  "falsePositiveGuard": "Do NOT flag fields that ARE in $metadata, and do NOT flag $select strings built from a metadata-validated constant/allowlist.",
  "relatedSurfaces": ["BUILDING_AUTOFILL","SALES_FORM_SAVE_LOAD","/api/buildings/search"],
  "confidence": { "level": "high", "reason": "Field validity is checkable against artifacts/metadata.xml deterministically; this exact class shipped a Trestle 400 in PR #277." }
}
```

### S-COTALITY-FEED-001 — old CoreLogic media host still allowlisted past cutover deadline
```json
{
  "code": "S-COTALITY-FEED-001",
  "severity": "P1",
  "system": "COTALITY_FEED",
  "layer": "backend",
  "file": "app/api/media/proxy/route.ts",
  "line": 19,
  "lineEnd": 20,
  "triggerPattern": "Live media-proxy allowlist (and CSP connect-src/img-src) still contains legacy CoreLogic hosts after the documented Trestle→Cotality cutover deadline. Old-connection reference: host matches /(^|\\.)corelogic\\.com$/ outside an explicitly-dated transition comment whose deadline is in the future.",
  "evidenceSnippet": "15: // Old CoreLogic hosts deprecated — deadline April 30, 2026\n19:   \"api-trestle.corelogic.com\",\n20:   \"api-prod.corelogic.com\",",
  "actualFailure": "The feed migrated to the Cotality domain; the old CoreLogic hosts are kept in the proxy allowlist (and CSP) as a transition shim with a stated removal deadline that has now passed (2026-04-30 / README 2026-03-31; today 2026-05-29). Stale allowlisted hosts widen the SSRF/exfil surface of the media proxy and let dead URLs resolve, masking feed drift instead of surfacing it.",
  "whyError": { "contract": "COTALITY_IDX_PLUS", "rule": "Cotality feed is the authoritative connection; legacy corelogic.com hosts are transition-only and removable after the cutover deadline (2026-03-31/04-30, elapsed).", "citation": "docs/compliance/COMPLIANCE-CANONICAL-INDEX.md §4 (API base + deprecated hosts); README 'API Migration Complete'" },
  "expectedBehavior": "After the elapsed deadline, the proxy allowlist + CSP contain only api.cotality.com (and mallan-owned media hosts). corelogic.com hosts removed once verified unused.",
  "requiredFix": "(separate product PR — NOT this Sentinel PR) Remove api-trestle.corelogic.com + api-prod.corelogic.com from app/api/media/proxy/route.ts allowlist, the dual-accept in app/api/media/batch/route.ts:207, and any vercel.json CSP img-src/connect-src entry — AFTER proving no live or stored media URL still resolves to a corelogic.com host.",
  "proofRequired": "Read-only: query the live Cotality feed media URLs (sample N listings) and grep stored listing_media/listing.media rows for 'corelogic.com' — both must be zero before removal. Then a test asserting the allowlist/CSP contain no corelogic.com host. Removing while stored URLs still reference corelogic would 404 those images — fail-closed: do NOT recommend removal until the probe is clean.",
  "falsePositiveGuard": "Do NOT flag: the word 'Trestle', the env var TRESTLE_API_URL, trestle-mapper.ts, or trestle-documentation.corelogic.com (vendor docs link). Do NOT flag a corelogic host inside a transition comment whose stated deadline is still in the FUTURE. Do NOT flag historical/reference docs that explicitly label 'old' vs 'new' (e.g. REBNY-RLS-RESO-COMPLETE-REFERENCE.md).",
  "relatedSurfaces": ["MEDIA_P0","LISTING_DETAIL","vercel.json CSP","app/api/media/batch/route.ts"],
  "confidence": { "level": "high", "reason": "Deterministic: host string + a deadline date that is parseable and now in the past; confirmed live in app/api/media/proxy/route.ts:19-20 on 2026-05-29." }
}
```

### S-BUILDING-001 — partial mapper drops `BldgNeighborhood`, cascades to validation failure
- **severity** P1 · **system** `BUILDING_AUTOFILL` · **layer** `frontend`/`workflow` · `public/crm/SALE-FORM-REDESIGN.html` (Building-tab select handler).
- **triggerPattern:** Building-tab select calls a partial field mapper instead of `populateBuildingFromIDX` (full field set + building type).
- **actualFailure:** When the broker picks a building, neighborhood (and ~30 other Cotality-derivable fields) never populate; downstream listing validation/display cascade-fails ("when neighborhood does not populate, other fields do not and then things start failing").
- **whyError:** `{contract:"CRM_WORKFLOW", rule:"Building auto-fill must populate the full Cotality-derivable field set so the broker is not forced to retype", citation:"PR #267 spec / CRM workflow"}`.
- **expectedBehavior:** Building-tab select delegates to `populateBuildingFromIDX`; main-address + Building-tab show a clear no-match message on miss.
- **proofRequired:** `tests/runtime/cotality-building-autopopulate.test.ts` asserts `BldgNeighborhood`/`BldgYearBuilt`/`StructureType` set after select; manual: pick a building in 5 boroughs → fields fill.
- **falsePositiveGuard:** Don't flag a select handler that already calls `populateBuildingFromIDX`.
- **relatedSurfaces:** `["SALES_FORM_SAVE_LOAD","COTALITY_CONTRACT"]` · **confidence** high.

### S-SALEFORM-001 — radio group saved but not restored (silent data loss on edit)
- **P1** · `SALES_FORM_SAVE_LOAD` · `data`/`frontend` · `SALE-FORM-REDESIGN.html` (`SALE_RADIO_MAP`).
- **triggerPattern:** a named radio group is collected by the generic collector but has **no entry in `SALE_RADIO_MAP`** (missing-guard), so edit-load can't map the saved value back.
- **actualFailure:** Broker saves "Condop"; on edit-reload the radio reverts to the HTML-default "Condo" → wrong property type persisted on next save. Round-trip loss.
- **whyError:** `{contract:"DATA_INTEGRITY", rule:"What is saved must reload identically; every collected field needs a restore path", citation:"PR #262/#270 round-trip contract"}`.
- **proofRequired:** `tests/runtime/crm-form-field-roundtrip.test.ts` — every collected RLS field has a FIELD/RADIO/CHECKBOX map entry; save→reload assertion.
- **falsePositiveGuard:** Don't flag groups intentionally UI-only and documented in the skip-list (e.g. `BuildingFeatures`, `Heating`/`Cooling` restored via `SALE_CHECKBOX_ARRAY_MAP`).
- **relatedSurfaces:** `["CRM_DASHBOARD"]` · **confidence** high.

### S-DISPLAY-001 — inverted/absent display-gate branch hides exclusives (or leaks suppressed addresses)
- **P0** · `DISPLAY_GATE` · `compliance` · `lib/search/public-listing-db.ts`.
- **triggerPattern:** display gate applied as a flat AND with no `rls_eligible=false` bypass branch, OR address suppression not scoped to RLS-backed rows.
- **actualFailure (two modes):** (a) website-only exclusive never appears publicly; (b) an RLS-eligible row with `InternetAddressDisplayYN=false` has its address leaked. Either is a public-display failure.
- **whyError:** `{contract:"PUBLIC_DISPLAY", rule:"NY DOS §175.25 + UCBA address-suppression; InHouseWebOnly is website-displayable but IDX-gated", citation:"COMPLIANCE-CANONICAL-INDEX.md → display-gate; memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md"}`.
- **proofRequired:** failing test in the same PR that flips green (PR #112/#113/#148 pattern) + live probe of a known SL-/RL- listing and a suppressed-address RLS row.
- **falsePositiveGuard:** display-gate column appearing in a `select:` **projection** is NOT a finding; only a `where:`/filter use with the wrong branch is. (This is the real S-BACKSEARCH-009 false-positive class from PR #265.)
- **relatedSurfaces:** `["PUBLIC_SEARCH","BACKEND_SEARCH","LISTING_DETAIL"]` · **confidence** high.

### S-CANON-001 — non-canonical URL emitted (SEO fragmentation / 404)
- **P1** · `CANONICAL_URL` · `backend`/`workflow` · `lib/crm/listing-urls.ts` / emitters.
- **triggerPattern:** an emitter builds `/listing/{id}` (id-only) or the hybrid `/listing/{slug}-{id}?key=` instead of routing through `buildCanonicalListingPath`.
- **actualFailure:** the same listing is reachable at two URL shapes → SEO dilution; a lowercased id slug can 404 a CRM exclusive (the SL-0004 notFound bug).
- **whyError:** `{contract:"USER_BEHAVIOR", rule:"one listing, one canonical URL /listing/{address}/{id}", citation:"PR #272/#274"}`.
- **proofRequired:** test asserting no emitter returns id-only/hybrid for active CRM listings with displayable address; live: `/listing/{id}` 308→canonical, canonical 200.
- **falsePositiveGuard:** UCBA address-suppressed listings legitimately use the id-only canonical — don't flag those.
- **relatedSurfaces:** `["LISTING_DETAIL","AGENT_PAGE","PUBLIC_SEARCH"]` · **confidence** medium (intent-dependent; needs the suppression check).

### S-AGENT-001 — name-match attribution instead of Cotality-authoritative id
- **P1** · `AGENT_IDENTITY` · `data`/`compliance` · agent-card DTO / `/agents`.
- **triggerPattern:** agent resolution falls back to name matching without first keying on `trestle_mls_id` (Cotality-authoritative).
- **actualFailure:** `/agents/maya-allan` shows the synced RLS duplicate (`RLS20093870`, "Listing Courtesy of…") instead of the CRM exclusive `SL-0004` with Maya's contact card.
- **whyError:** `{contract:"COTALITY_IDX_PLUS", rule:"ListAgentMlsId is the authoritative identity; name match is fallback-only", citation:"PR #272; data/RLS-FIELD-REGISTRY.md"}`.
- **proofRequired:** test pinning `trestle_mls_id` precedence; live probe of `/agents/maya-allan` shows SL-0004.
- **falsePositiveGuard:** name fallback IS allowed when `trestle_mls_id` is genuinely absent — flag only when the id is available but ignored.
- **relatedSurfaces:** `["AGENT_PAGE","LISTING_DETAIL"]` · **confidence** medium.

### S-MEDIA-001 — floor plan eligible as hero / un-deduped uploads
- **P1** · `MEDIA_P0` · `data` · `lib/media/**`, media routes.
- **triggerPattern:** CRM floor-plan rows lack `media_classification='Document'` so the shared resolver classifies them `unknown` and they can become the hero; OR upload appends without content-hash dedup.
- **actualFailure:** a floor plan shows as the listing's lead photo; or the same photo appears 2–3× from repeated uploads.
- **whyError:** `{contract:"DATA_INTEGRITY", rule:"FloorPlan/Document media must be excluded from hero; uploads idempotent by content hash", citation:"PR #276/#263; Trestle Media API (ResourceRecordKey)"}`.
- **proofRequired:** `tests/runtime/media-display-p0.test.ts` (hero=preferred, floor-never-hero, dedup) green.
- **falsePositiveGuard:** don't flag media rows already classified `Document`/`FloorPlan`, or uploads behind a SHA-256 dedup check.
- **relatedSurfaces:** `["LISTING_DETAIL","CRM_DASHBOARD"]` · **confidence** high.

### S-PUBSEARCH-001 — `StreetDirPrefix` dropped in address concat
- **P2** · `PUBLIC_SEARCH` · `data`/`frontend` · `lib/address/**` / concat sites.
- **triggerPattern:** address built from `[StreetNumber, StreetName, StreetSuffix]` omitting `StreetDirPrefix`, OR a `.replace()` that strips a spelled-out direction to empty.
- **actualFailure:** "333 E 46th" stored/searched as "333 46th" → directional listings silently dropped from public search; wrong canonical slug.
- **whyError:** `{contract:"RESO", rule:"StreetDirPrefix is a distinct RESO field and must be preserved in the canonical 4-token concat", citation:"PR #264; data/rebny-rls-property-fields.csv"}`.
- **proofRequired:** address round-trip test across the 7 concat sites; live search for a directional address returns the row.
- **falsePositiveGuard:** do NOT flag OData escape `replace(/'/g,"''")`, map-bounds `[s,w,n,e]=split(',')`, title-case, regex-escape, or whitespace-collapse `.replace()` calls (the documented PR #265 false-positive set).
- **relatedSurfaces:** `["BACKEND_SEARCH","CANONICAL_URL","BUILDING_AUTOFILL"]` · **confidence** medium (regex-shape dependent — see guard).

---

## 4.1 Old-connection detection — Trestle/CoreLogic → Cotality (`COTALITY_FEED`)

**Principle (Maya, locked): everything must be up to code against the *current Cotality feed*.** Every Sentinel-L rule validates against `https://api.cotality.com/trestle`. The `COTALITY_FEED` detector additionally flags any **old connection** — a live reference that belonged to the pre-migration CoreLogic/Trestle endpoints and should now be Cotality. Transition shims whose removal deadline has elapsed are findings, not "still fine".

### Current (up-to-code) vs stale (flag)
| Concern | CURRENT / up-to-code | STALE → flag as old connection |
|---|---|---|
| Feed base URL | `https://api.cotality.com/trestle` (read from `TRESTLE_API_URL`/`IDX_ENDPOINT`, this default) | `api-trestle.corelogic.com`, `api-prod.corelogic.com`, any hardcoded non-Cotality base |
| Token endpoint | `${base}/oidc/connect/token` derived from the Cotality base | hardcoded corelogic token URL |
| Media host (proxy allowlist + CSP `img-src`/`connect-src`) | `api.cotality.com` (+ mallan-owned media hosts) | `*.corelogic.com` hosts **past** the 2026-03-31 / 2026-04-30 deadline |
| Media query endpoint | `/odata/Media?$filter=ResourceRecordKey eq '…'` | deprecated `Media/All` |
| Media key field | `ResourceRecordKey` | `ResourceRecordID` |
| Env var name | `TRESTLE_API_URL` | — (do NOT "modernize" to `COTALITY_*`; the product is still Trestle 5.0 — not stale) |
| Vendor in user-facing text | "Cotality" / "Trestle/Cotality" | "CoreLogic" presented as the **current** vendor in live UI/attribution |

### Detector rules (emit a finding)
- **F1** — any live (non-comment, non-historical-doc) string matching `(^|\.)corelogic\.com` in code/config → finding. Severity by surface: feed/token **base URL = P0**; media allowlist/CSP = **P1**.
- **F2** — a hardcoded feed base URL that is neither `api.cotality.com` nor read from `TRESTLE_API_URL`/`IDX_ENDPOINT` → **P0**.
- **F3** — `Media/All` usage, or `ResourceRecordID` used as the media key → **P1** (Cotality Media API contract).
- **F4** — a transition-shim comment whose stated removal deadline is in the **past** while the shimmed reference is still present → **P1** (overdue cleanup).
- **F5** — user-facing text presenting "CoreLogic" as the **current** data vendor → **P2** (branding drift).

### False-positive guards (must NOT flag)
- `Trestle`, `TRESTLE_API_URL`, `trestle-mapper.ts`, `trestle_mls_id`, `trestle_total_count` — Trestle 5.0 is the current product/field vocabulary.
- `trestle-documentation.corelogic.com` (vendor docs) and `trestlesupport@cotality.com` (support) — verify-then-leave; flag only if the vendor publishes a new host.
- Historical/reference docs that explicitly contrast "old" vs "new" URLs (e.g. `REBNY-RLS-RESO-COMPLETE-REFERENCE.md`).
- A corelogic host inside a transition comment whose deadline is still in the **future**.

### Proof rule (fail-closed)
Every `COTALITY_FEED` removal finding's `proofRequired` MUST include a read-only check that **neither the live Cotality feed nor any stored media URL** (`listing_media` rows / `listing.media` JSON) still resolves to the stale host **before** recommending removal. Removing a still-referenced media host 404s those images — so the finding stays open (do not auto-recommend deletion) until the probe is clean.

---

## 5. Severity rubric (so P0/P1/P2 is consistent, not vibes)

- **P0** — any of: legal/compliance exposure (NY DOS §175.25, FARE Act, Fair Housing, UCBA display/distribution), public-data leak (suppressed address), data loss/corruption, a Cotality/Trestle contract break that kills a whole query, or a public surface rendering wrong/missing.
- **P1** — workflow-blocking for the broker, or **wrong data shown** to a user that isn't a legal exposure (wrong agent, wrong URL shape that 404s, save/load round-trip loss).
- **P2** — degraded UX, SEO drift, cosmetic, or correctness issue with a user-side workaround.
- **Fail-closed downgrade:** if `confidence.level=low` OR the governing rule can't be cited from canonical files, severity is capped at **P2** and the finding does not gate the build.

---

## 6. Output behavior requirements (anti-spam — keep current posture)

These codify the *current* (correct) behavior so the improvement PR cannot regress it:

1. **PR comments stay DISABLED.** The `Post actionable PR comment` step keeps `if: ${{ false }}`. No `gh pr comment` fires on `synchronize`/any event. (Rationale preserved inline + PR #266.)
2. **Findings go to artifact + Step Summary ONLY.**
   - Full findings (all 15 fields) → `ops/audit/sentinel-l/<ts>-errors.json` + `.md`, uploaded as the build artifact (`if: always()`).
   - **Top-5 P0/P1** condensed view → GitHub **Step Summary** (`$GITHUB_STEP_SUMMARY`). The condensed view now includes `system`, `layer`, `actualFailure`, `whyError.rule`, `requiredFix`, `proofRequired` (was: `searchSystem`/`actualFailure`/`impact`/fix/proof).
3. **Red check on actionable errors stays** (`Fail on actionable errors`, `exit 1` when P0/P1 count > 0). P2 and `confidence=low` do **not** gate (they appear in the artifact only).
4. **No email side effects.** No step may post a comment, open an issue, or send mail. The only signals are: red check, artifact, Step Summary.
5. **No product fixes in the Sentinel-L improvement PR.** Only `.github/workflows/sentinel-listing-readiness.yml`, the scanner script(s) under `scripts/sentinel-*`/`tools/sentinel-l/**`, and `scripts/__tests__/sentinel-*`/`tests/runtime/sentinel-l-*` may change. Touching `app/**`, `public/crm/**` (except as scan inputs), `lib/**` product code, `prisma/**`, env, Neon, or Vercel config is out of scope and must be a separate PR.

---

## 7. Acceptance criteria for the implementation PR (proof-first)

The follow-up code PR is "done" only when:

1. **Schema enforced:** the writer rejects any finding missing one of the 15 fields, with an unknown-`system`/`layer`/`contract` enum value, or with an empty `evidenceSnippet`/`whyError.rule`. New unit tests assert each rejection (TDD: tests added in the same PR, red→green).
2. **Taxonomy enforced:** `system` ∈ §2 set, `layer` ∈ §3 set, `whyError.contract` ∈ §3 enum — asserted by test.
3. **Evidence is verbatim:** a test feeds a known fixture file and asserts the emitted `evidenceSnippet` equals the exact source lines (no paraphrase), with correct `line`.
4. **False-positive guards live as negative tests:** for each of the §4 example classes, a negative fixture asserts the safe pattern is **not** flagged (e.g. display-gate column in a `select:` projection; the PR #265 OData/regex set).
5. **Output behavior pinned:** `tests/runtime/sentinel-l-platform-scanner.test.ts` (or the workflow-structure test) asserts: comment step `if: ${{ false }}`; artifact upload present with `if: always()`; Step Summary includes the new fields; `Fail on actionable errors` gates on P0/P1 only (not P2/low-confidence); no `gh pr comment`/`gh issue`/mail step is enabled.
6. **Self-scan clean:** Sentinel-L run on its own PR produces 0 P0/P1 self-errors; any findings are real and carry all 15 fields.
7. **Project gates green** (per CLAUDE.md §G, since scan inputs include compliance surfaces): `npm run type-check`, `npm run compliance-check`, `npm run ucba:audit` (0 REGRESSIONS), `npm run rls:validate`, and `npm run crm:test` if `public/crm/**` touched. The improvement PR itself touches none of those product paths, but the gates must still pass.

---

## 8. Migration / sequencing notes

1. Keep `searchSystem` populated as an alias of `system` for one release; drop after consumers (Step Summary builder) move to `system`.
2. `code` ids are **stable** — when a detector is renamed, keep the old `code` and add an `aliases:[]` so historical suppressions/tracking survive.
3. The 12-lens A–L body (Sentinel-L.2) and the deterministic JSON scripts (`sentinel-field-contract-audit.mjs`, `sentinel-compliance-language-audit.mjs`, `sentinel-listing-flow-static-audit.mjs`) are the natural producers of `whyError`/`relatedSurfaces` — wire their JSON into the 15-field emitter rather than re-deriving.
4. This is a **report-only** system. Nothing in this spec authorizes Sentinel-L to write product code, open PRs, merge, comment, or change infra.

---

## 9. Out of scope (explicit)

- No product bug fixes (Cotality $select, sale-form maps, display gate, canonical URL, media, agent identity) in the Sentinel-L improvement PR — each is its own PR if/when prioritized.
- No re-enabling of PR comments.
- No changes to Neon/Vercel/env/cron settings.
- No change to the trigger path set in this PR (separate consideration).

**Bottom line:** upgrade Sentinel-L from *"a detector matched here"* to *"here is the exact business/system failure, why it violates a named contract, what should happen, the precise fix, the proof that closes it, and the safe pattern not to flag"* — emitted to artifact + Step Summary, never to PR comments.

---

## Implementation status — PR #279 (`fix/sentinel-l-actionable-explanations-v2`)

Implemented TDD-first (tests → red → minimal scanner code → green), one commit
per category. Reporting/detector only — no product code touched. Findings now
carry the full 16-field schema (the 15 above **plus** `relatedSurfaces`), set on
`SentinelLError` and emitted by `buildError` (regex rules) and the two purpose
detectors (`detectCotalitySelect`, `classifyWorkflowFailure`).

| Category | System(s) | New detectors |
|---|---|---|
| C. Cotality contract | `COTALITY_CONTRACT` | `S-COTALITY-001` ($select field absent from live $metadata; PR #277) |
| A. Building autofill | `BUILDING_AUTOFILL` | `S-BUILDING-009` (lossy fetchBuildingsFromAPI; PR #278), `S-BUILDING-010` (cache-only Building tab; PR #277), `S-BUILDING-011` (UnitNumber clobber) |
| B. Media P0 | `MEDIA` | `S-MEDIA-010` (JSON-only media vs `listing_media` rows), `S-MEDIA-011` (reorder writes unread field), `S-MEDIA-012` (delete by array index) |
| D. Release-truth / workflow | `WORKFLOW` | `classifyWorkflowFailure()` (external_infra vs pr vs indeterminate, fail-closed; the ECONNRESET-rerun-passed case), `S-WORKFLOW-001` (active advisory PR comment) |
| F. Canonical URL / display gate | `CANONICAL_URL`, `DISPLAY_GATE` | `S-URL-010` (hybrid URL; PR #272), `S-URL-011` (lowercase id not normalized; PR #272), `S-COMP-011` (website-only exclusive hidden by IDX-only gate; PR #238/#274) |
| E. Sales-form save/load | `SALES_FORM` | `S-SALE-015` (workflow status clobbered by canonical status; PR #260/#262), `S-SALE-016` (autosave without populate-complete gate; PR #263) |

Each detector ships a positive test (real failure flagged + explanation
asserted) and a negative test (safe pattern not flagged). Fixtures cover PR #277
(phantom $select + cache-only building search), PR #276 (JSON-only media,
reorder-wrong-field, index delete), Release-Truth (geo-validate ECONNRESET rerun
→ external_infra), and an unknown failure (→ indeterminate, fail-closed).

**Workflow:** PR comments stay disabled (`if: ${{ false }}`); findings go to the
JSON + Markdown artifact and a top-5 P0/P1 Step Summary now showing
`system / layer` and `Why this is an error`. Full detail stays in the artifact.

**Live baseline:** `npm run sentinel:l` reports exactly one finding —
`S-MEDIA-010` on `app/api/crm/listings/[id]/media/upload/route.ts:207` (a real
JSON-only media write; fixing it is a separate PR per the media-PR-#276
do-not-touch). type-check clean; 54 new + 22 existing scanner tests + 4 workflow
tests green.
