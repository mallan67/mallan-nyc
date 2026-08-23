# Handoff — authenticated backend Search (#618)

**Head `56855a54` · 38 commits ahead of production `a0db2dac` · draft, preview-only.**
Public consumer Search is **zero-delta** against production and must stay that way —
re-verified at this head: the production→head delta contains no `app/search`,
`SearchFilterPanel`, `/api/listings` or `lib/search/public-listing-*` change.

> ## READ THIS BEFORE ANYTHING ELSE
>
> ### 0. AUTHORITY BOOTSTRAP — run this first, every session
>
> ```
> node scripts/resolve-master-authority.mjs
> ```
>
> *(Invoked directly rather than as an npm script: `package.json` currently carries
> uncommitted changes from another workstream, and adding a line would mean committing
> their work. Add `"authority:resolve"` once that settles.)*
>
> `MALLAN-PLATFORM-MASTER-PLAN.md` and `docs/operations/MALLAN-CONTINUOUS-EXECUTION-STATE.md`
> are **not tracked on this branch.** They live on the still-open **PR #595**, which is the
> single product authority. The bootstrap re-resolves #595's **current head SHA** from
> GitHub and reads both files **read-only at that exact commit**.
>
> **Resolution order — deterministic, not negotiable:**
>
> ```
> CURRENT #595 HEAD → MASTER PLAN → CONTINUOUS EXECUTION STATE
>   → CURRENT #618 HANDOFF → SEARCH EVIDENCE
> ```
>
> **Conflict rule: #595 wins automatically.** A #618 audit, matrix or handoff that disagrees
> with the master is simply overridden — **this is not escalated to Maya.** Only a genuine
> ambiguity *within the master itself* comes back to her.
>
> The master states the same thing in its own words: *"Audits, issue registries, PRs,
> technical notes, temporary ledgers and historical plans are evidence/reference only and may
> not become competing master plans."*
>
> **Never:**
> - copy either file into #618 — two physical copies can drift, which is worse than the gap;
> - modify #595, #618 or #620 to resolve authority;
> - proceed from whatever #618 happens to contain when the master cannot be read. The
>   bootstrap **fails loud** (exit 2) rather than degrading to that, because *"master
>   unavailable → read #618 → ask Maya"* permits exactly the context-loss loop this exists to
>   close.
>
> The SHA is re-resolved every run and never hardcoded, so a stale master cannot be silently
> pinned. The cache lives under `.cache/` (**gitignored — verified**) and is rewritten each
> run.
>
> **REMOVE THIS when #595 merges.** The script detects a non-OPEN #595, exits 3, and tells
> you to read the authority from the normal tree and delete the bootstrap.

>
> ### 2. The work is NOT at "one engine" yet, and must not jump there
>
> `docs/search/PROJECTION-CAPABILITY-GAP-MATRIX-2026-08-21.md` records:
> **Structural: YES · Capability: NO, not yet** — the projection "cannot replace
> `/api/idx/search` today without silently losing substantial broker Search capability."
>
> So unifying the engines is **step 5**, not step 2. Doing it earlier either deletes broker
> capability or forces a provider fallback, and a fallback recreates the two-engine problem.
>
> ### 3. The current authoritative sequence
>
> **`docs/search/CRM-UI-BROKERAGE-AUDIT-2026-08-21.md` §10** — reconciled across three
> independent reviews. Order:
>
> `0` **governance bootstrap** — #595 authority deterministically readable every session
> `1` **stop provably false behaviour** — fake transit/commute, fabricated showing
>     instructions, `photoCount || 6`, unknown → 0 / Manhattan / Active / Exclusive /
>     permitted, and the Google client/report links
> `2` **Cotality RAW CONTRACT → VERIFIED MAPPING** — Sale/Rental/status semantics,
>     classifications, fee frequencies, direct Property fields, exact enums, permissions,
>     the Media contract. **No guessing.**
> `3` **VERIFIED MAPPING → MALLAN STORAGE/PROJECTION** — stop discarding `ClosePrice`,
>     `LeaseAmount`, frequencies, dates and fees. **Exhaust existing schema/JSON first.**
> `4` **PROJECTION READINESS PROOF** — 1 eligible listing ↔ exactly 1 projection row · zero
>     missing · zero orphan · material parity · freshness. **No provider fallback.**
> `5` **ONE Search engine/universe** — only after `4`
> `6` **count / paging / sort / cache correctness**
> `7` **listing-open hydration** — `CustomProperty` · `OpenHouse` · `Office` · `Member` ·
>     `Media`. The three direct Property fields stay in the Property mapping — **not**
>     `$expand`.
> `8+` results workbench → Map → Reports → CMA → calculators → 1440/1024/390 proof.
>
> **Steps 1 and 2 are two distinct closure groups, not one pass.**
>
> **Broad auditing is CLOSED.** The architecture defect is known. New investigation happens
> only when a specific implementation step meets an unresolved Cotality fact or an impact
> dependency.
>
> Follows the chain **COTALITY RAW CONTRACT → VERIFIED MAPPING → MALLAN STORAGE →
> BUSINESS RULE / SEARCH UNIVERSE → AGENT CONSUMERS**.
>
> ### 4. P0 defects found since this file was last accurate
>
> | defect | evidence |
> |---|---|
> | **Two engines** — live passthrough (A) vs projection (B), different criteria vocabularies; a saved search replays into a different universe | `criteria-to-prisma.ts:336-339` |
> | **`total` is post-gate, `hasMore` is pre-gate** — the code calls it "a known limitation" | `app/api/idx/search/route.ts:362-366,383-385` |
> | **Sale universe is wrong** — `PropertyType ne 'ResidentialLease'` admits CommercialLease/Land/Farm/Specialty; a CommercialLease can enter via Sale and leave as a rental row | `crm-idx-filter.ts` + mapper |
> | **Agent "Pending" searches `ActiveUnderContract`**; live `StandardStatus` carries both separately; `MlsStatus` has 25 members and `Leased` is unmapped | `search-engine.js:461` |
> | **Facts fetched then discarded** — `ClosePrice`, `LeaseAmount` appear **zero** times in the mapper; CMA is built on `ClosePrice` | `SEARCH_SELECT_FIELDS` vs `crm-idx-mapper.ts` |
> | **Fees assumed monthly** — `AssociationFeeFrequency` (16 live members) ignored; `$12,000 Annual` can present as `$12,000/month`; `\|\| 0` turns unknown into zero | `crm-idx-mapper.ts:60,192` |
> | **Sort cache collision** — cache key omits sort | `route.ts:199` |
> | **Sort changes the universe** — re-fetch rebuilds only price/beds/baths/one neighborhood | `toolbar-functions.js` |
> | **Media read through a false premise** — code says "only 2 categories"; live `MediaCategory` has **18**; missing category defaults to `Photo`; `DOCUMENT-*` inferred as FloorPlan | `media/batch/route.ts:19`, `media-sync.ts:1700` |
> | **Three rich Property fields never selected** — `DocumentsAvailable` (94), `ShowingRequirements` (39), `Disclosures` (119). These are **direct Property fields, not subresources** — do not `$expand` them | live `$metadata` |
> | **Fabrications** — synthetic "Live MTA" arrivals, a commute calculator that ignores the address, `(UCOM)` showing instructions, `photoCount \|\| 6`, twelve unbound amenity cards, `RLS-*` demo cards carrying `data-source="REBNY-RLS"` | audit §2, §8b, §8c |
> | **Google still in the product** — `reports.js:1301` emails a `maps.google.com` link | `public/crm/js/output/reports.js` |
> | **Search writes during a GET** — building upsert inside the search request | `route.ts:255` |
>
> ### 5. Standing evidence rule
>
> Every claim carries **how** it is known (`LIVE` / `CODE` / `CI` / `INFERENCE` /
> `RECOMMENDATION`) **and who** established it (`CLAUDE_LIVE_RUN` /
> `INDEPENDENTLY_REPRODUCED` / `CURRENT_GITHUB_CODE`). `LIVE` alone never means two parties
> agree. **If a claim is about the product, the scan must cover the product** — three
> reports here were narrower than they read, most recently a "Google is removed" claim whose
> scan excluded `public/crm`.


---

## HARD RULES IN FORCE

1. **Public consumer Search is OUT OF SCOPE and zero-delta** — `app/search`,
   `SearchFilterPanel`, `/api/listings`, `lib/search/public-listing-*`,
   `lib/search/types.ts`. Verify with a `git diff` against production before every commit.
   It may be read as *evidence*; it may not be modified.
2. **`public/crm/**` IS in scope** — that is the authenticated CRM frontend. Do not confuse
   the directory name with the public product.
3. **No production Neon during the acceptance hold.** Preview never proves Production.
   Anything needing Neon is marked UNVERIFIED, never guessed.
4. No schema change, migration, backfill, env change, destructive DB/R2 op, or production
   deploy without explicit Maya authorization.
5. **Live authenticated Cotality is the only provider-data authority.** No field is VERIFIED
   from metadata existence, an old audit, a committed census, or a code comment.
6. **RED first.** Prove the defect against the current head before correcting it.
7. **THE COTALITY API IS THE ONLY SOURCE.**
   REBNY RLS is the MLS / rules body the listing is filed with. It is NOT the API, NOT the
   source of any field, and NOT an architectural source term. Never write "Cotality/RLS" as
   though they were one system contract. Write `Cotality ListingId`, never "RLS ListingId" —
   the field belongs to the Cotality API contract.
   - Where a Cotality response carries a raw historical string (e.g. `ListingId` values
     prefixed `RLS…`, or `OriginatingSystemName = RLS`), **preserve it exactly at the
     provider boundary** as provenance — and never promote it into a Mallan layer, provider
     name, documentation taxonomy or new code.
   - "REBNY RLS" stays only where it genuinely means REBNY as a body (its rules, UCBA,
     display obligations, a provider-health tracker), and in EXISTING identifiers that
     cannot be renamed without a schema or public-surface change — `rls_eligible`,
     `rls:validate`, `isMallanRlsReturnCopy` (already documented as legacy naming).
   - This was corrected on 2026-08-21 after these documents repeatedly said "RLS ListingId"
     and "RLS display gates", treating the MLS body as the data source.

### Safe invocation for any verification script

```
vercel env run -e preview --git-branch=fix/neon-p0-event-driven-wake-2026-08-16 -- npx tsx <script>
```

`-e production` injects the production `DATABASE_URL`, so any script importing Prisma
silently hits production Neon. That is how the first acceptance window was contaminated.
See `.cache/search-p0/SAFE-INVOCATION.md`.

---

## ARCHITECTURE ESTABLISHED

**Four authenticated workflows over ONE verified mapping layer:** SALE · RENTAL · CMA ·
BUILDING. Four UI/business contracts, not four engines and not one collector with tab
branching. Basic and Advanced are two depth-views of one criteria state.

**Authority hierarchy — do not add a second authority:**

| layer | role |
|---|---|
| `canonical/field-registry.ts` | THE Search mapping authority — owns the criterion |
| `canonical/amenity-vocabulary.ts` | subordinate exact-token table only |
| `data/cotality-live-token-census.json` | dated evidence, never authority |
| `scripts/search/verify-live-search-contract.mts` | verifies the registry against live Cotality |

**Factual authority is resolved per LISTING, not fixed per field.** `list_price` is
Mallan-authored on a local listing and Cotality-authored on third-party inventory.
`authorityResolution` is mandatory (`fixed` · `by_listing_authority` · `mallan_derived` ·
`unresolved`); a static `sourceAuthority` only where authorship is permanent.
`resolve-factual-authority.ts` resolves instances; `AttributionEnvelope` carries the answer.

**A suppressed Mallan-office representation may supply PROVIDER EVIDENCE ONLY.** Authorable
facts, Mallan-derived facts, CRM state, ACRIS facts and unresolved contracts are all refused
with `NON_CANONICAL_SOURCE`. Authorship and permission-to-supply are different things.

**UNRESOLVED is not a synonym for `mallan_derived`** and never acquires authority by
fallback.

---

## LIVE-VERIFIED FACTS (exhaustive unless stated)

| fact | evidence |
|---|---|
| `BuildingKey` / `BuildingKeyNumeric` | declared, **populated 0 of 8,056**; `GET /Building` → **403**. Building identity must be Mallan-derived |
| `Property.Permission` | **MULTI-enum** (`Multi.ListingPermission`); `IDX,SyndicateOptOut` occurs live; `OwnerOptOut` is NOT a member |
| bath components | `BathroomsHalf` non-zero on 2,023/8,103; quarter components present but **ZERO**; `BathroomsTotalInteger` is NOT a derivable function of the parts (best hypothesis 98.8%) → contract is `full + half/2` |
| `PropertyCondition` | populated **0/8,110** exhaustively — `renovated` unavailable |
| `NewConstructionYN` · `GarageYN` | live filterable Booleans (951 / 2,630) — the registry previously denied both |
| `PetsAllowedYN` | filterable but **populated ZERO** — the multi-enum parse must stay |
| `LivingAreaUnits` | `SquareFeet` on 8,104/8,104 — no normalization needed |
| Mallan-office rows | 35 total, **2 search-eligible**; `SourceSystemName`/`SourceSystemKey` **0/35** — no Mallan identifier round-trips |
| coordinates | Cotality **declares** `Latitude`/`Longitude`; usable population **UNVERIFIED**. Populated today by the **US Census** geocoder — never Google |
| `Property.PropertySubType` | **SCALAR** nullable Enum, **75 members** — NOT a multi-enum. The MULTI field is the separate `PropertySubTypeAdditional` (`.Enums.Multi.` namespace, same 75-member vocabulary, 6,781 non-null vs 8,021, never disagreeing) |
| sub-type operators | `eq` / `in` / `or` **SUPPORTED**. **`contains(PropertySubType,…)` is HTTP 400** — `contains` takes strings, this is an enum. The registry's "502" was **Mallan's own** `/api/idx/search` converting that 400 |
| sub-type case sensitivity | an invalid literal is rejected **400**, but a **MIS-CASED** one returns **200 with ZERO rows**. The provider will not catch `'apartment'` — validation must be Mallan-side and case-exact |
| sub-type population | exhaustive census, **75/75 probed, 0 UNVERIFIED**: Apartment 6,625 · MultiFamily 425 · SingleFamilyResidence 402 · Duplex 354 · Loft 79 · MixedUse 72 · Triplex 63 · Office 1 = **8,021 = `ne null` exactly**. The other 67 are zero |
| sub-type zero-population members | `Townhouse` · `Condominium` · `StockCooperative` · `UnimprovedLand` are **ZERO on this field at every status**. **That was a MIS-MAPPING, not an absent capability** — Townhouse is carried by `StructureType` (610 Active) and condo/co-op by `CommonInterest` (3,722 / 2,509). `Retail` = 4 all-status, 0 Active. Valid-and-zero, provider-rejected and unavailable are three different states that may never collapse |

---

## THE TWO OPEN STRUCTURAL DEFECTS

### 1. Authenticated Search is provider-only — the primary conflict

`/api/idx/search` contains **no `prisma.listing` reference at all**. It is 100%
provider-sourced, takes `finalTotal` from `result.odataCount` (route.ts:323), and runs
`upsertBuildingFromSearchResult` on the live path (route.ts:207).

So a Mallan-authored listing reaches broker Search **only** through its Cotality
representation — which the listing-authority contract says to suppress. Two committed
contracts that cannot both hold.

> Applying suppression to `/api/idx/search` without sourcing the local canonical listing
> would REMOVE MALLAN'S OWN LISTINGS FROM MALLAN'S OWN BROKER SEARCH.

Required universe: local canonical + third-party Cotality − Mallan-office representations,
as ONE identity/count/pagination universe. Not "Cotality minus Mallan rows"; not two
searches merged in browser JS; **not a per-criterion fallback to Trestle**.

### 2. Source-class / audience eligibility

`PROJECTION_DISPLAY_GATE` begins `rls_eligible: true`, so **Mallan website-only local
listings (`rls_eligible=false`) are excluded** — that gate was shaped for alert replay and
public redistribution. Client-alert eligibility must not define what a broker can search.
One canonical query foundation with an audience policy; never two engines. **Do not change
that gate blindly.**

---

## COMPLETED

- Public Search reverted to production and the canonical layer decoupled from it
- `FIELD_REGISTRY` made the single authority; stale claims corrected from live
- Amenity semantic leak closed — `Concierge` never becomes `doorman`, and no substitute
  observation key is invented either
- `Permission` multi-enum unified across reader (`gates.ts`) and writer (`trestle-mapper`),
  compliance owning the token primitive
- Bath contract frozen on exhaustive evidence; rendered to Prisma AND OData from one definition
- Provenance model: `authorityResolution` + instance resolver + typed `AudienceObligation`
- **Suppression & location impact graph** — 42 traced consumer rows
- **Projection capability gap matrix** — 39 controls extracted mechanically
- **Projection-gate suppression fix** (RED-first) — reuses `excludeMallanRlsReturnCopies()`
  through the existing `listing` relation; fixes Saved Search count/execute and alert replay
- Behavioural source-class tests + execution proof that `findMany`/`count` share one predicate
- Live contract verifier, proven to FAIL on injected drift
- Committed-tree import scanner (catches the class that broke the build once)

### PROPERTY SUB-TYPE — the EXECUTION CONTRACT is closed (2026-08-21)

> **Scope of this claim, precisely.** The `PropertySubType` **scalar-enum execution
> contract** is closed. The broader **Property Type / ownership UI family remains OPEN**
> for four zero-population semantic mappings — `Townhouse`, `Condominium`,
> `StockCooperative`, `UnimprovedLand` (see OPEN below). Do not let the next handoff read
> this section as "the Property Type controls are solved". They are not.
>
> **The four controls stay.** Zero population on ONE candidate field is evidence that a UI
> label may be mapped to the WRONG Cotality fact — never evidence that the brokerage
> capability is dead. Nothing here removes or disables them.

Probed live FIRST, which is what caught it: had the translator been written from the
registry, `PropertySubType` would have been encoded as a multi-enum with a `contains()`
push, and both are wrong.

| link | what changed |
|---|---|
| live contract | `docs/idx/cotality-property-subtype-live-contract-2026-08-21.md` + `artifacts/.property-subtype-live-probe{,-2}.json` |
| canonical criterion | NEW `lib/search/canonical/property-subtype-contract.ts` — 75 live members, exact case-sensitive validation, ONE OData renderer + ONE Prisma renderer |
| `FIELD_REGISTRY` | `multi_enum`→`enum` · `partial`→`mapped` · `needs_probe`→`yes` · `searchParam` `subTypes`→`propertySubType` · `dbColumn`/`projectionColumn` filled · notes rewritten from live |
| stale factory comment | the "`sourceAuthority` is REQUIRED here" line that contradicted the next sentence is gone |
| provider execution | `contains(PropertySubType,…)` → exact `eq` / OR-of-`eq` in `crm-idx-filter.ts` |
| projection execution | `property_sub_type IN […]` in `criteriaToProjectionWhere`; SEARCH-capable, deliberately **NOT** alert-capable |
| unsupported criterion | `/api/idx/search` now answers **400 + the offending tokens**, not a 502 "try again later" |
| authenticated frontend | local pre-render is exact-token; **a failed search leaves NO result universe** |
| verifier | new §6 re-probes shape · 75 members · the 8-member census · the 4 never-populated; `contains` pinned REJECTED. **PASS** |

**The frontend defect this uncovered.** `_serverSearch`'s catch kept the local pre-render on
screen as the terminal result and showed an error ONLY when there were no local rows. With
`contains(…)` failing at the provider, every authenticated search carrying a Property Type
box showed a full screen of rows with no error. Those rows are not a fixture and not
"canonical local Mallan inventory" — `listings` is the 200-row UNFILTERED page fetched at
page load, so every row looks real. Now: preview is `provisional`, a server answer is
`authoritative`, a failure is `none` — and `validateReportState` refuses to build a CSV /
Excel / public share link / client email from anything that is not `authoritative`. The
other three writers (`_replaceListings` reload, `recallLastSearch`, `toggleSortOrder`)
downgrade or restore provenance correctly.

`type-check` 0 · `lib/search` **845/845** · runtime **4,435 passed** (7 failures ALL
pre-existing — proven by re-running the same 5 suites with these changes stashed) ·
`crm:test` 39/39 · compliance-check 95/0 · `rls:validate` UNKNOWN 0 · `ucba:audit` 0
REGRESSIONS · `search:verify-live` **PASS**

`idx:validate` reports 1 critical — `field-registry.ts: Potential hardcoded API key`. It is
a FALSE POSITIVE on the `provider_lineage` entry's slash-joined `cotalityField` string,
which matches `/['"][A-Za-z0-9+/=]{40,}['"]/`. Present at HEAD; not introduced here.

---

## NEXT, IN ORDER

1. ~~**`propertySubType` translator**~~ — **EXECUTION CONTRACT DONE 2026-08-21.** See
   COMPLETED. The old framing was wrong twice over: the column is written by the projection
   builder but production population is still UNVERIFIED, and the defect was not "only the
   translator is missing" — the provider execution was a hard HTTP 400.

2. ~~**FOUR-CONTROL LIVE SEMANTIC CENSUS**~~ — **DONE 2026-08-21.** Every one of the four
   was mapped to the WRONG provider fact, and the census also surfaced a 52-key NYC field
   family invisible to `$metadata`. Full evidence:
   `docs/idx/cotality-property-type-family-and-customfields-2026-08-21.md`.

   **Corrected 2026-08-21 by a FOUR-SURFACE ID-level census** — the first pass omitted
   `PropertySubTypeAdditional`, so Townhouse exclusivity was unproven, Multi-Family was
   incomplete, and Land was not proven absent at all.
   `docs/idx/cotality-classification-four-surface-census-2026-08-21.md`.

   | control | was | live | ACTUALLY | live | status |
   |---|---|---|---|---|---|
   | Townhouse | `PropertySubType` | **0** | **`StructureType`** — now proven **EXCLUSIVE** (other three surfaces 0, `PropertyType` **rejects** the literal 400) | **610 Active** | VERIFIED |
   | Condo | `PropertySubType` | **0** | **`CommonInterest`** | **3,722 Active** | VERIFIED |
   | Co-op | `PropertySubType` | **0** | **`CommonInterest`** | **2,509 Active** | VERIFIED |
   | Land | `PropertySubType=UnimprovedLand` | **0** | **11 probes** across `PropertyType` · `PropertySubType` · `PropertySubTypeAdditional`, Active AND all-status — all SUPPORTED, all zero | **0** | **`VERIFIED_ZERO_POPULATION_CURRENT_FEED`** — NOT unsupported. Provider supports it; inventory is empty. **Capability retained** |
   | Multi-Family | `PropertySubType` | 424 | **four** surfaces: PropertyType 0 · PropertySubType 424 (253 excl) · PropertySubTypeAdditional 75 (1 excl) · StructureType 714 (556 excl) | **union 981, none on all four** | **NEEDS_PROBE** — measured, but the business definition is NOT made. No OR encoded |

   **Multi-Family stays `NEEDS_PROBE`. Do NOT encode any OR as canonical yet.** The four
   dimensions describe different things, and "a multi-family property for sale" is not the
   same brokerage concept as "a unit inside a multi-unit structure" — 69 rows are
   `MultiFamily,Townhouse`. Townhouses, two-family houses, rental buildings and apartment
   units need distinct business treatment. `NumberOfUnitsTotal` also carries a `-1`
   sentinel, so it cannot simply be layered on. The measurement is complete; the business
   definition is Maya's and is not yet made.

   Registry rows added/corrected in the EXISTING `FIELD_REGISTRY`: `structure_type` (new),
   `max_financing` (new), `ownership` and `property_sub_type` (corrected). No new registry.

   **UI re-pointing is NOT yet done** — the evidence now names the correct field for each
   control, and changing the CRM mapping is the next bounded implementation step.

3. **`MaximumFinancingPercent` AND THE UNDECLARED `CustomFields` FAMILY.** The building
   financing limit Maya asked for EXISTS, live, on **84.9% of active inventory** — inside
   `CustomProperty.CustomFields`, an **undeclared JSON object carried in one declared
   `Edm.String`**. Exhaustive census: 8,010/8,010 Active rows, 0 null, 0 unparsable, **52
   distinct keys**. The declared financing fields (`CurrentFinancing`, `BuyerFinancing`,
   `ListingTerms`) are populated **ZERO**.

   The same blob carries `AttendanceType` (**100%** — the doorman/concierge fact this
   registry still records as ABSENT), `ElevatorsTotal` (**100%**), `FlipTax` (89%),
   `SponsorUnitYN` (97%), `TaxAbatementYN` (99.9%), `TaxDeductionPercent` (59.3%),
   `PercentOfCommonElements` (86%), `BuildingRules`, `BuildingStaffType`,
   `PrivateOutdoorSpaceSize`, `MaxLeaseMonths`, `GuarantorsAcceptedYN`, `CeilingHeight*`,
   `AreaOver/UnderFAR`, `RoofRightsYN` and more.

   **CAPABILITY CONSTRAINT:** `$filter` cannot reach inside an `Edm.String`, so **none of
   these 52 keys is provider-filterable.** They must be read via `$expand=CustomProperty`
   and matched Mallan-side, or derived onto the projection at build time the way
   `amenity_keys` already is.

   **MODEL — two provider-contract layers, not one.** These 52 are **observed extension
   keys** inside a declared `Edm.String`, NOT `$metadata` fields. Two rules coexist:
   *"not declared in `$metadata`" does not mean "not supplied by Cotality"*, AND *"a JSON
   key exists" does not mean its semantics are verified*. Each key proposed for
   Search/Workspace/CMA needs its own extraction + semantic contract.

   **`MaximumFinancingPercent` — measured, not assumed.** StockCooperative 2,497/2,507 with
   a real board-rule spread (80/75/50/90/70/65); Condominium 3,615/3,720 clustering at 90;
   RentalBuilding only 242/640 of which **93% are `0.00`**. **`0.00` is a NOT-SPECIFIED
   SENTINEL**, not a 0% limit. And it is a **LISTING-level** fact: **380 of 3,402 buildings
   carry disagreeing values**, so it may not be exposed as a building rule without
   reconciliation. State **NEEDS_PROBE**.

   **`AttendanceType` — NO brokerage label attached.** 16 tokens over **five roles**
   (Doorman · Concierge · LobbyAttendant · **VideoDoorman** · ElevatorAttendance) at four
   coverage levels. The declared amenity fields miss **67%** of `DoormanFullTime` rows, and
   `BuildingStaffType` is a different concept (superintendent) absent on ~74% of them.
   Collapsing this to "doorman" would repeat the Concierge ≠ Doorman error at scale —
   **a video doorman is not a doorman.** Vocabulary VERIFIED; mapping **NEEDS_PROBE**.

   **STORAGE TRACED — two defects found, recorded not fixed.** `/api/idx/search` never sets
   `expandCustomProperty`, so `CustomProperty` is never expanded on the Search path and the
   one wired key (`sponsorUnit`) is `null` on every result. And the mapper accepts
   `true|"true"|"Yes"|1` / `false|"false"|"No"|0` while the live values are the **strings**
   `"1"` / `"0"` — matching neither list. The in-code comment also says 41 keys; live says
   **52**.

4. **THE CENSUS DETAIL BEHIND STEP 2** (kept as evidence — this is NOT a licence to
   re-point yet; UI re-pointing is step 8, after the storage path and the business
   definitions). Multi-Family carries NO canonical OR, and Land is
   `VERIFIED_ZERO_POPULATION_CURRENT_FEED`, not `UNSUPPORTED`.
   - **Townhouse** — `PropertySubType eq 'Townhouse'` vs exact-token `StructureType has …`.
     Compare returned IDs and PropertyType context; decide which carries NYC townhouse
     inventory. Do not infer from enum existence.
   - **Condo** — `CommonInterest eq 'Condominium'` vs `PropertySubType eq 'Condominium'`.
     One canonical Condo criterion. Do not create separate "residential condo" and
     "commercial condo" field truths unless the provider contract genuinely requires an
     extra criterion such as `PropertyType`.
   - **Co-op** — `CommonInterest eq 'StockCooperative'` vs `PropertySubType eq …`. Same
     rule; one section must not use `CommonInterest` while another uses `PropertySubType`
     for the same business concept.
   - **Land** — `PropertyType eq 'Land'`, then examine `PropertySubType`,
     `PropertySubTypeAdditional`, `StructureType` and land-classification fields on those
     rows. "Land" must NOT silently mean `UnimprovedLand`; a narrower Unimproved Land
     option is a separate criterion if the product later needs one.
   - **Multi-Family** — declared on `PropertyType`, `PropertySubType` AND `StructureType`.
     Measure population, overlap, disagreement.

   Output: four rows added to the EXISTING capability/field contract — **not a new
   registry** — as: UI label → canonical business meaning → Cotality resource/field(s) →
   shape → live population → operator → Mallan storage → projection → exact execution →
   status. Status is `VERIFIED` / `NEEDS_PROBE` / **`VERIFIED_ZERO_POPULATION_CURRENT_FEED`** /
   `UNSUPPORTED` — and the last two are DIFFERENT facts: a criterion the provider serves
   with an empty result is not an unsupported one. **Never "dead"** merely
   because one candidate field is unpopulated.

5. ~~**COTALITYURCE / FIELD-FAMILY COVERAGE MATRIX**~~ — **BUILT 2026-08-21.**
   **`docs/search/COTALITY-COTALITYURCE-FIELD-FAMILY-COVERAGE-2026-08-21.md`** is now the
   execution artifact beneath the master plan and `FIELD_REGISTRY`. All 17 entity types
   endpoint-probed, 15 field families with consumer roles, the 52-key observed-extension
   family, a Media contract and a 9-item defect register.

   **Endpoint probing overturned four planning assumptions** — declaration is not access:

   | resource | expected | live |
   |---|---|---|
   | `HistoryTransactional` | price/status history · DOM · CMA chronology · CRM timeline | **400 — not available to this licence** |
   | `PropertyUnitTypes` | multifamily / building / investment analysis | **1 row in the entire feed** |
   | `PropertyRooms` | the real rooms contract beyond `RoomsTotal` | **86 rows in the entire feed** |
   | `PropertyGreenVerification` | classify for Detail/Report | **404 — endpoint does not exist** |
   | `Teams` / `TeamMembers` | listing-team attribution | **400 — not available** |
   | `Building` | (already known) | **403 — not licensed**, and declares exactly 1 field |

   Accessible and real: Property 591,244 · CustomProperty 591,286 · **Media 1,977,836** ·
   Member 11,152 · Office 575 · OpenHouse 3,162. `Field`/`Lookup`/`Model` are
   provider-schema support with no brokerage consumer.

6. **CLOSE THE `CustomProperty` STORAGE PATH (D1–D3) BEFORE EXPOSING ANY OF THE 52 KEYS.**
   Finding the keys is not enough — the canonical pipeline still throws them away.
   Prove: provider fetch → `$expand=CustomProperty` → preserve in EXISTING Mallan JSON →
   reload → mapper → projection/workspace. **No schema change.** Fix `SponsorUnit`
   `"1"`/`"0"` parsing as part of that family.

7. **Semantic contracts for the remaining 50 CustomFields keys** (2 of 52 studied),
   then the business definitions: Multi-Family · `Restrictions` vs `BuildingRules` ·
   parcel/BBL identity · co-op vs condo carrying costs.

8. **UI re-pointing** — Townhouse → `StructureType`, Condo/Co-op → `CommonInterest`, Land
   retained as zero-population. **Multi-Family waits for its business definition.**

9. **`listingId` as identity resolution** — NOT a scalar filter. Classify the provider ID,
   resolve the canonical twin for a Mallan-office representation, return the LOCAL listing;
   no-twin/ambiguous stays suppressed with an integrity defect. Otherwise searching your own
   Cotality `ListingId` returns ZERO. Note the VALUES carry a raw `RLS…` prefix — that is
   provider provenance, not evidence that the field belongs to REBNY RLS.
3. Remaining A/B translator gaps (arbitrary year range).
4. Inspect C/D facts before promoting anything — no schema growth is justified by the matrix.
5. **Live census of the E rows**, in order: achieved rent (`LeaseAmount` /
   `TotalActualRent`) · assessment (`TaxOtherAnnualAssessmentAmount`) · price/SF
   (`CustomProperty.PricePerArea` + unit) · owner opt-out writer · maintenance FAMILY (fees +
   frequencies + `CommonInterest`) · NYC geography · `Latitude`/`Longitude` population.
6. Define source-class-aware Search eligibility (defect 2).
7. One authenticated result DTO + sort + pagination contract. Do NOT copy
   `crm-idx-mapper.ts` into a second projection mapper. Sorting must run on the canonical
   universe BEFORE page boundaries.
8. Population readiness + freshness gates.
9. **Only then** cut `/api/idx/search` over.

Also queued: campaign identity boundary (`/api/crm/listing-campaigns` resolves a raw
client-supplied `listing_id` with no identity check — a caller can address the suppressed
duplicate directly); Media identity-then-authority; the design exploration (durable under
`docs/search/`, prototypes in `.cache/`).

---

## CI

#618 is stacked on the **moving** #620 branch. CI tests the synthetic merge, so a #620
failure appears red on #618, and **a rerun replays the same merge rather than recomputing
it**. Diagnose by reading the merge-ref parents:

```
git fetch origin refs/pull/618/merge:refs/remotes/pr618merge --force
git log -1 --format=%p refs/remotes/pr618merge
```

Production is the only frozen SHA. Never hard-code either moving head.

---

## KEY DOCUMENTS

- `docs/search/SEARCH-P0-CRITERIA-MATRIX-2026-08-19.md`
- `docs/search/MALLAN-RETURN-COPY-RECONCILIATION-EVIDENCE-2026-08-21.md`
- `docs/search/SUPPRESSION-AND-LOCATION-IMPACT-GRAPH-2026-08-21.md`
- `docs/search/PROJECTION-CAPABILITY-GAP-MATRIX-2026-08-21.md`
- `.cache/search-p0/SAFE-INVOCATION.md` · `PRODUCTION-TRAFFIC-RECORD.md` (gitignored)

---

## METHOD CORRECTION — AUDIT FIELD FAMILIES AND PROVIDER COTALITYURCES, NOT "CONTROLS"

**The 39-control inventory is CURRENT UI WIRING ONLY.** It is not the Cotality Property
capability inventory, and it is not the required Mallan brokerage Search/workspace
contract. Those are three different measurements and conflating them is why whole field
families keep disappearing between sessions.

Preserve the number with its real meaning:

> **39 currently reachable authenticated UI inputs.**
>
> Provider resource coverage is measured against ALL applicable Cotality Property field
> families and related resources — never against the number of controls wired into the
> current form. **A field family is not complete merely because the form has no control
> for it.**

**Stop the one-field loop.** Do not patch `listingId`, then a year range, then rooms, and
discover Media four fields later. Build the resource / field-family coverage matrix FIRST
— it is the execution artifact beneath the master plan and `FIELD_REGISTRY`, not another
audit — then implement in bounded groups:

`A` identity/classification · `B` Sale core · `C` Rental core · `D` building/parcel ·
`E` amenities · `F` financial/financing · `G` OpenHouse · `H` Media ·
`I` result/workspace/report hydration.

### Families to map (from the LIVE contract, extracted mechanically)

Identity · Address/Geography · **Block/Lot/Parcel/Building identity** (`TaxBlock`,
`TaxLot`, `TaxMapNumber`, `ParcelNumber`, `UniversalParcelId`, `UniversalPropertyId`,
`UniversalPropertySubId`, `CLIP`, `BuildingName`) · Property classification ·
Price/Transaction · Rooms/Size · **Amenities—UNIT** · **Amenities—BUILDING/ASSOCIATION**
(kept separate; the UI showing both under one "Amenities" heading is not a reason to merge
them) · **Financing/Terms** · Carrying costs/Financial (condo common charges, co-op
maintenance and other fees stay semantically distinct) · Rental · Remarks/Documents
(private remarks and showing instructions stay agent-private) · Permissions/Attribution.

### Related resources are NOT optional

The Property row is only the parent. `CustomProperty` · `PropertyRooms` (distinct from
`RoomsTotal`) · `PropertyUnitTypes` (multifamily / building / investment analysis) ·
`OpenHouse` · `Building` · `Member` / `Office`. Field counts to be taken from live
`$metadata`, never from memory or another agent's report.

### Media is a full resource contract, not three booleans

Not `has_photo` / `has_floorplan` / `has_video`. `MediaCategory`, `MediaClassification`
and `MediaType` are DIFFERENT fields and must not be collapsed. Consumers: search hero ·
gallery · floor plans · video · tours · listing detail · Building workspace · CMA ·
Reports · client portal · CRM workspace · marketing · public publication. Identity rule
holds: **listing identity resolves first, media follows canonical listing identity** — a
suppressed Mallan-office representation never becomes a second gallery or hero source.

### A verified fact is not automatically a Search control

757 Property fields must not become 757 filters. Classify each verified fact by ROLE:
`SEARCHABLE` · `RESULT-SUMMARY` · `DETAIL/WORKSPACE` · `CMA` · `REPORT` · `CRM-INTERNAL` ·
`COMPLIANCE-ONLY` · `PROVIDER-EVIDENCE-ONLY` · `UNSUPPORTED/UNVERIFIED`.

**Hard completion criterion, not a later enhancement:** agents keep missing information, so
"the filter works" is not done. The authenticated listing workspace must expose every
useful verified section — property, building, block/lot/parcel, financial, financing,
amenities, rooms, unit types, open houses, media, agent/office, documents/remarks,
activity/CMA/marketing — hydrated from the SAME canonical Listing/resources Search uses.
No second listing-detail data system.

Basic stays fast (type · price · beds/baths · location · status · key ownership).
Advanced exposes the verified families. **Switching Basic ↔ Advanced never drops active
state.**

---

## RECURRING FAILURE MODES FROM THIS SESSION

Worth reading before continuing — each cost a correction cycle:

- **Asserting a mechanism instead of reading one.** "Google geocoding" was invented; the repo
  uses US Census. Same class as `achieved_rent = mallan_derived` before probing `LeaseAmount`.
- **Trusting a code comment as field truth.** "Cotality supplies no coordinates" came from a
  comment, not a probe.
- **Hand-summarising an inventory.** "29 controls" hid 10 range-table controls, five of which
  were then filed as unsupported. Extract mechanically.
- **String assertions passed off as behavioural proof.** Asserting a `where` contains `"SL-"`
  proves nothing about row inclusion.
- **Committing working-tree state that isn't yours.** Broke the build once by staging a file
  importing an untracked module; `type-check` and `jest` both passed locally.
- **Solving a leak by relocating it.** Removing `doorman` and inventing `concierge-present`
  created a second unregistered vocabulary.
- **Letting the MLS body drift into the source name.** Three documents said "RLS ListingId",
  "RLS display gates" and "the system contract is Cotality/RLS". The Cotality API is the only
  source; REBNY RLS is a rules body. Raw `RLS…` values in a response are provenance to
  preserve at the boundary — never a licence to name the source that way. This is the
  CLAUDE.md STOP GATE rule, and it eroded gradually rather than in one wrong statement,
  which is what made it hard to notice.
- **Attributing our own error code to the provider.** The registry recorded that sub-type
  filtering "cannot be pushed to `$filter` (502)". Cotality answers **400**; the 502 was
  `/api/idx/search`'s own catch block converting it. The note then justified a whole
  post-filtering design on a provider behaviour the provider never exhibited. Read the
  status the PROVIDER returned, not the one your route re-raised.
- **Assuming the provider validates for you.** `PropertySubType eq 'NotARealMember'` is
  rejected 400, so it looked as though bad tokens fail loud. `eq 'apartment'` is NOT — it
  returns 200 with zero rows. A validator that leans on provider rejection silently passes
  the mis-cased case, which is the one a UI actually produces.
- **A failure path that renders success.** `_serverSearch` kept the local preview on screen
  after a 502 and suppressed the toast whenever those rows were non-empty. Every
  green check stayed green: the request failed loudly at every layer and the SCREEN said
  nothing. When a preview and an answer share one state field, the failure path is where
  they get confused — mark provenance, don't infer it from row count.
- **Calling local data canonical because it is local.** The in-code comments described
  `listings` as "the ~126-row local fixture set". It is not a fixture — that number belongs
  to `scripts/crm-tests/`. At runtime it is the 200-row UNFILTERED page fetched at page load.
  Trace what populated an array before naming its authority.
- **Reading zero population as a dead capability.** Four Property Type controls returned 0
  and looked unavailable. Every one was pointed at the WRONG provider fact: Townhouse is
  carried by `StructureType` (612 Active, not 0), condo and co-op by `CommonInterest`
  (3,722 and 2,509). Multi-Family needed TWO fields and the single-field mapping was
  missing ~57% of live inventory. **Zero on the first field checked is a mapping
  hypothesis, not a verdict** — census the siblings before concluding anything is
  unavailable, and never delete a brokerage capability on that evidence.
- **Auditing only what is DECLARED.** Every field-level audit here started from
  `$metadata`, so all of them were structurally blind to `CustomProperty.CustomFields` — an
  undeclared 52-key JSON family carried inside one declared `Edm.String`, holding
  `MaximumFinancingPercent` (84.9%), `AttendanceType` (100%), `ElevatorsTotal` (100%),
  `FlipTax` (89%) and the rest of the NYC co-op/condo facts a broker most needs. The
  registry meanwhile records `DoormanYN` and `ElevatorYN` as ABSENT. A schema is a floor,
  not a ceiling: read rows, union the keys.
- **Letting an over-claim ride because the narrow version was true.** I asserted "Google is
  no longer named anywhere in the file" — true of `field-registry.ts`, which is what the
  script asserted. It was NOT true of `source-provenance.ts`, `resolve-factual-authority.ts`
  or the A1 test, all of which still carried it. The scope was in the sentence and the
  impression was broader. **Scope a claim to exactly what was checked, or check the wider
  scope before claiming it.**
- **Presenting a repo-internal reading as a provider statement.** Classifying
  `Field`/`Lookup`/`Model` as "provider-schema support with no brokerage consumer" is an
  INFERENCE from their content. Cotality says no such thing. Anything not received from the
  provider is labelled `INFERENCE`, and no authoritative-source claim is made without
  retrieving the source.
- **Measuring coverage against the current form.** "39 controls" measured UI wiring and
  could never have surfaced any of the above, because none of it is wired. Coverage is
  measured against provider resources and field families.
- **Censusing SOME candidate surfaces and concluding as if it were all of them.** The first
  property-type census compared `PropertySubType` and `StructureType` and omitted
  `PropertySubTypeAdditional`. That made "StructureType carries Townhouse" an unproven
  exclusivity claim, left Multi-Family at 2 of 4 surfaces, and produced a **Land verdict
  that had not been tested at all**. Re-run across every declared surface: Townhouse turned
  out genuinely exclusive, Multi-Family gained a fourth dimension, and Land needed a
  different classification entirely. **Enumerate the candidate set from the live contract
  before measuring, not from the ones you happened to think of.**
- **Collapsing UNSUPPORTED into zero-population.** "Land is a genuine absence /
  UNSUPPORTED" was wrong in kind. Every Land probe returned **HTTP 200 with a well-formed
  empty result** — the provider supports the criterion perfectly and the current inventory
  is empty. `VERIFIED_ZERO_POPULATION_CURRENT_FEED` and `UNSUPPORTED` are different facts,
  and only the second is a reason to stop offering a broker capability.
- **Reading a JSON key name as its meaning.** `AttendanceType` is populated 100%, and the
  first write-up called it "the doorman/concierge fact". Enumerating the vocabulary showed
  **16 tokens over five roles** including `VideoDoorman` and `ElevatorAttendance` — and a
  video doorman is not a doorman. Same trap as `Concierge` ≠ `Doorman`, one layer deeper.
  Population proves presence; only correlation and vocabulary prove meaning.
- **Trusting a numeric extension value without a sentinel check.** `MaximumFinancingPercent`
  is 84.9% populated and looks like a clean percentage. `0.00` is a NOT-SPECIFIED sentinel
  — 93% of the RentalBuilding rows carrying it — so a naive range filter would silently
  exclude every listing that just did not state a limit. And 380 of 3,402 buildings
  disagree with themselves, so it is listing-level, not the building rule its name implies.
