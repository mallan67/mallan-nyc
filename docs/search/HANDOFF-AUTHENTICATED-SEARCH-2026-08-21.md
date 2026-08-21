# Handoff — authenticated backend Search (#618)

**Head `b064ea66` · 26 commits ahead of production `a0db2dac` · draft, preview-only.**
Public consumer Search is **zero-delta** against production and must stay that way.

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
| sub-type dead UI options | `Townhouse` · `Condominium` · `StockCooperative` · `UnimprovedLand` are **ZERO at EVERY status** — valid literals this feed has never carried. `Retail` = 4 all-status, 0 Active. **Valid-and-zero is not invalid** and the two may never collapse |

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

   | control | was | live | ACTUALLY | live | status |
   |---|---|---|---|---|---|
   | Townhouse | `PropertySubType` | **0** | **`StructureType`** (Multi-Enum, `has`) | **612 Active** | VERIFIED |
   | Condo | `PropertySubType` | **0** | **`CommonInterest`** | **3,722 Active** | VERIFIED |
   | Co-op | `PropertySubType` | **0** | **`CommonInterest`** | **2,509 Active** | VERIFIED |
   | Land | `PropertySubType=UnimprovedLand` | **0** | no candidate carries it (`PropertyType=Land` also 0) | **0** | UNSUPPORTED — no live inventory, control retained |
   | Multi-Family | `PropertySubType` | 426 | **`PropertySubType` OR `StructureType`** | **~982** | VERIFIED — single field misses ~57% |

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
   `amenity_keys` already is. Record that before building on any of them.

4. **FOUR-CONTROL UI RE-POINTING** — bounded, evidence already in hand. Re-point Townhouse
   to `StructureType`, Condo/Co-op to `CommonInterest`, Multi-Family to the OR of both,
   and keep Land as a retained UNSUPPORTED control. Basic and Advanced both. Nothing is
   removed.
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
   status. Status is `VERIFIED` / `NEEDS_PROBE` / `UNSUPPORTED`, **never "dead"** merely
   because one candidate field is unpopulated.

5. **RESOURCE / FIELD-FAMILY COVERAGE MATRIX — before resuming any one-field loop.**
   See METHOD CORRECTION below. This replaces "fix the next translator" as the unit of work.
   The live inventory foundation is already captured mechanically in
   `artifacts/.cotality-live-resource-inventory.json`: **17 entity types · 1,456 declared
   fields · 185 enums (114 multi) · Property 757 (576 scalar / 81 enum / 100 multi-enum) ·
   14 navigation properties**. Note the inventory is NOT complete on its own — §6 of the
   evidence doc shows an undeclared family living inside a declared string.

6. **`listingId` as identity resolution** — NOT a scalar filter. Classify the provider ID,
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

## METHOD CORRECTION — AUDIT FIELD FAMILIES AND PROVIDER RESOURCES, NOT "CONTROLS"

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
- **Measuring coverage against the current form.** "39 controls" measured UI wiring and
  could never have surfaced any of the above, because none of it is wired. Coverage is
  measured against provider resources and field families.
