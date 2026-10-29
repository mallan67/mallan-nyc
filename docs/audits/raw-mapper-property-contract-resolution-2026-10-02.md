# Raw-mapper field-mapping resolution — live Property contract first (2026-10-02)

Supersedes the mapper-vs-mapper comparison this engagement started from. Per Maya's
correction: "Stage A tests are LEGACY OBSERVATION tests only... do not preserve [existing
mapper behavior] unless separately proven." Every row below is anchored, in this order, to
the live Cotality Property contract, then MALLAN-PLATFORM-MASTER-PLAN.md §0 (itself
verified against live data and the one authority above mapper code), then a REBNY rule
where one applies — never to what the three existing mappers happen to agree on.
Three-mapper agreement is convergence evidence, not proof.

**Classification test applied throughout:** a finding is **PROVEN_DEFECT** only if directly
contradicted by the live Cotality contract, the Master Plan's own recorded live-verified
facts, or a cited REBNY/UCBA clause. Everything else that looks like a bug from comparing
the three mappers to each other is **LEGACY_UNVERIFIED** — explicitly not an acceptance
criterion, not yet a defect, and not to block Stage B.

**Method:** a 10-cluster workflow (`wf_0986966a-a73`) verified every field the three
mappers touch directly against live Trestle `$metadata` (`mcp__trestle-fields__*` tools),
then reclassified the 9 originally-flagged mapper disagreements under the test above. This
document adds two findings from an independent read of `MALLAN-PLATFORM-MASTER-PLAN.md`
§0.2/§0.3/§0.6 that the workflow could not reach (it has no access to that file's specific
sections) and that supersede two of the workflow's own LEGACY_UNVERIFIED verdicts.

---

## 0. Two findings added after the workflow, from the Master Plan itself

### 0.1 Building identity is already decided — `TaxBlock` + `TaxLot`, not `BuildingKeyNumeric`

Master Plan §0.2 "IDENTIFIER" (measured, live-verified, not this pass's speculation):

```
BUILDING   TaxBlock            591,229  (100%)  + TaxLot 266,520   = BBL
           BuildingName        220,923                where named
```

> "`BuildingKey` is a dead end. It is the join key to a resource that is an empty stub in
> this licence — one property, 403 direct, and `$expand=Building` returns 200 with no
> data. It is null on every row and rejected for filtering.
>
> Building identity is `TaxBlock` + `TaxLot`, cross-checked with `BuildingName` and street
> address. Measured on one building: address components grouped 45 units, `BuildingName`
> grouped 50. Use both — neither alone is complete."

This fully resolves the one gap the verification workflow itself flagged as unresolved
("I could not retrieve the Master Plan §0.2 text to adjudicate [the BuildingKeyNumeric vs
TaxBlock+TaxLot contradiction]"). It also confirms, independently, the workflow's finding
that `Property.BuildingKey`/`BuildingKeyNumeric` are unusable — not from a schema lookup
this pass performed, but from the Master's own prior measurement, which is stronger
(actual row counts, not inferred from a metadata flag).

**PROVEN_DEFECT (new, #15):** `lib/buildings/upsert.ts` keys Mallan's own persistent
Buildings table on `BuildingKeyNumeric` — a field the Master Plan has already measured and
rejected as "a dead end... null on every row." This is not a Cotality-contract violation;
it is a violation of Mallan's own already-decided canonical-storage authority. Building
identity must be rebuilt on `TaxBlock` + `TaxLot`, cross-checked with `BuildingName` and
street address (both signals — the Master's own measurement shows neither is complete
alone).

**Supersedes the earlier "in the interim, build from normalized street address" fallback
recommendation** — that was offered only because the question looked unresolved; it is not.
Do not implement the interim fallback. Implement the Master's answer directly.

### 0.2 Status-field substitution is explicitly forbidden — upgrades finding #3 for all three mappers

Master Plan §0.6 "Status — two independent enums":

> "`StandardStatus` and `MlsStatus` exposed separate picklists and behaved as separate
> fields. Neither is derived from the other. **Never substitute one for the other.**...
> `StandardStatus` filters and orders; `MlsStatus` does neither."

This is an explicit, cited Master rule, not a mapper-vs-mapper style disagreement. It
reclassifies finding #3 from the earlier LEGACY_UNVERIFIED verdict:

**PROVEN_DEFECT (upgraded, was #3):** all three mappers violate this rule today —
`trestle-mapper.ts`'s `String(raw.StandardStatus || raw.MlsStatus || "Active")`,
`mapping.ts`'s identical pattern, and `crm-idx-mapper.ts`'s reversed
`String(raw.MlsStatus || raw.StandardStatus || "Active")` are all fallback-substitution
chains between two fields the Master Plan says must never substitute for each other. The
fact that `MlsStatus` is frequently null (per the GIVEN population fact) makes
`crm-idx-mapper.ts`'s version practically converge to `StandardStatus` most of the time, but
the pattern itself — on any of the three mappers — is the thing the Master rule forbids,
independent of how often it is exercised. The fix is not "pick StandardStatus-first" (that
is also substitution); it is to stop substituting: read `StandardStatus` for the canonical
status (filterable, orderable, Gate 5/16(C)-relevant), and read `MlsStatus` separately and
only where a consumer specifically needs it, never as a fallback source for the other.

### 0.3 Borough/geography derivation is not a raw-mapper question

Master Plan §0.3 "THERE IS NO GEOGRAPHY IN THIS FEED":

> "`Latitude`, `Longitude`, `MapCoordinate`... are declared in `$metadata`, null on every
> row, and rejected for filtering. Mallan creates and owns its geography, and Search
> depends on that Mallan layer... The provider supplies `SubdivisionName` (591,229,
> filterable) and address components; everything spatial is derived by Mallan from those."

This means the three mappers' competing borough-derivation approaches
(`trestle-mapper.ts`'s `CountyOrParish`/`City` substring match; `crm-idx-mapper.ts`'s
`CityRegion`-first-with-"Manhattan"-fallback; `mapping.ts`'s none) are not three candidate
raw-mapper implementations to pick a winner from — borough/neighborhood is explicitly
Mallan-owned downstream geography, already a separate, already-tracked Open item on PR #647
("replace the old RLS geography artifacts... with Mallan's own geography," Maya's
checkpoint item 7). Re-classify this from a raw-mapper LEGACY_UNVERIFIED item to **out of
scope for this mapper-convergence batch** — route it to that existing geography work
instead of resolving it ad hoc inside the raw mapper. Also note: `Latitude`/`Longitude`
being null-on-every-row today means the earlier-flagged "coordinates ungated while street
is masked" concern in `crm-idx-mapper.ts` is currently inert in practice (matching the same
"unreachable, not proven safe" caveat applied elsewhere) — not a live leak today, worth a
defensive fix regardless since the field is still declared nullable, not forbidden.

---

## 1. PROVEN_DEFECTs (15 total — the only items that justify a code change on verification grounds alone)

1. `Permission === 'OwnerOptOut'`/`'Owner Opt-Out'` and `MlsStatus === 'OwnerOptOut'` (trestle-mapper.ts `derivePermissionGates`; gates.ts `isOwnerOptOut`) — dead code; live `Permission` has 18 members, live `MlsStatus` has 26, neither contains `OwnerOptOut`.
2. `crm-idx-mapper.ts` hardcodes `ownerOptOut: false, participantOnly: false` unconditionally, never reading `raw.Permission` — contradicts the verified Gate 2 rule the moment a `Private` row reaches it.
3. **(upgraded per §0.2 above)** All three mappers substitute `StandardStatus`/`MlsStatus` for each other via `||` fallback chains — directly forbidden by Master Plan §0.6 ("Never substitute one for the other").
4. `computeGateColumns` (trestle-mapper.ts) has no `CloseDate` parameter and cannot implement the UCBA Art. I §6 24-hour grace period that `checkDistributionGates`/`evaluateDisplayGate` (gates.ts) correctly implements. Confirmed by direct code reading AND by the passing Stage A CI test (commit `036a57c3`).
5. `PropertyType` rent/sale inference in `mapping.ts`/`crm-idx-mapper.ts` checks only `.includes('lease')`; the live picklist contains `DisasterReliefRental`, which that check misses but trestle-mapper.ts's broader `'lease' || 'rental'` check catches.
6. `crm-idx-mapper.ts`'s `propertyType` output field holds invented display strings ("Condo", "Co-op"…) that are never members of the live 13-value `PropertyType` picklist.
7. `PropertySubType`'s `sub.includes('single family')` branch (crm-idx-mapper.ts) can never match the live enum value `SingleFamilyResidence` (no space, camelCase).
8. `PropertySubType` null-vs-`''` divergence (crm-idx-mapper.ts defaults to `''`, the other two to `null`) — live-exercised today, confirmed 20 null rows exist.
9. `CommonInterest`/`OwnershipType` collapsed via `||` in crm-idx-mapper.ts's `ownership` field — two independently-nullable enum fields with near-zero vocabulary overlap; a record can carry both, and `||` silently discards `OwnershipType`.
10. `ListAgentMlsId`/`ListOfficeMlsId` fallback to `ListAgentKey`/`ListOfficeKey` in mapping.ts — live metadata proves these are separate fields with separate counterpart fields on `Member`/`Office` (RESO mutable-ID-vs-immutable-key convention); `agent-info-typed-columns.ts` in the same codebase already avoids this.
11. `CoListAgentFullName`/`CoListOfficeName` — UCBA Art. I §14 (verified primary text) requires both co-exclusive brokers' names be disseminated; neither field reaches any typed column, display field, or public DTO in any of the five reviewed files.
12. `classifyMediaItem`'s virtual-tour branch (listing-media-resolver.ts, used by trestle-mapper.ts) is missing the no-space `cat.includes('virtualtour')` check its sibling `classifyTrestleMediaCategory` has — against the live enum (`BrandedVirtualTour`/`UnbrandedVirtualTour`, no bare `VirtualTour` member), real virtual-tour media falls through and gets persisted mislabeled as `'Photo'`.
13. `ConcessionComments` (missing the second "s") in trestle-mapper.ts's `PRIVATE_FIELDS` strip set — confirmed via `trestle_validate_field` to not exist on live Trestle at all; dead code regardless of intent.
14. `ConcessionsBuyerBrokerFee`/`ConcessionsClosingCosts`/`ConcessionsOtherCosts`/`ConcessionsPropertyImprovementCosts` — four real, live, nullable Int32 Property fields, absent from every `$select` and every mapping layer in all three files.
15. `AdditionalFee`/`AdditionalFeeDescription`/`AdditionalFeeYN`/`AdditionalFeeFrequency` (mapping.ts) live exclusively on the `CustomProperty` `$expand` sub-resource; mapping.ts reads them as flat `raw.*` with no `$expand`, structurally non-functional. The bare field `FeeFrequency` referenced in `RESO_FIELDS`/`FIELD_MAP` does not exist on live Trestle at all.
16. **(new, §0.1 above)** `lib/buildings/upsert.ts` keys Mallan's Buildings table on `BuildingKeyNumeric` — contradicts Master Plan §0.2's own measured, decided building identity (`TaxBlock`+`TaxLot`, cross-checked with `BuildingName`+street address).

---

## 2. LEGACY_UNVERIFIED — explicitly not defects, not acceptance criteria

- Missing `StandardStatus` → `"Active"` default (trestle-mapper.ts): GIVEN fact says zero null rows today; fallback arm unreached, neither proven safe nor unsafe.
- Missing `ListPrice` → `"0"` default: GIVEN fact says zero null rows today; same caveat.
- `BuildingKey`/`BuildingKeyNumeric` naming inconsistency in crm-idx-mapper.ts's `buildingKey` field — no live $filter/$orderby/$groupby violation demonstrated in this pass, only a naming/traceability issue.
- Generic `features` JSONB catch-all bucket adequacy for REBNY-required fields (Concessions, CommonInterest, OwnershipType, StructureType) — no contract or rule prohibits JSONB storage; adequacy for query/display needs is unresolved, not disproven.
- `ListingKey`/`ListingId`/`SourceSystemKey` three-way convergence — trestle-mapper.ts/mapping.ts's `ListingKey`-first choice is schema-stronger (non-nullable) but crm-idx-mapper.ts's different choice is not shown wrong by the contract, only inconsistent.
- A long list of population-rate questions (`BedroomsTotal`, `BathroomsFull/Half`, `OriginalListPrice`, `ClosePrice`, `PostalCode`, `StateOrProvince`, `CommonInterest`, `OwnershipType`, `StructureType`, agent/office fields, `PhotosCount`, dates, etc.) that need a live row-count query to move past UNVERIFIED — not resolved in this pass, not assumed either way.
- `City`/`CityRegion`/`CountyOrParish`/`SubdivisionName` actual semantic content (does `City` ever literally equal a borough name? does `CityRegion` hold a borough or something else?) — needs a live row-*value* sample, not just a null-rate; now also reframed by §0.3 above as belonging to Mallan's separate geography work, not the raw mapper.
- Scope of "address" under Gate 3/4 (`InternetAddressDisplayYN`) — does it cover `UnitNumber`? `Latitude`/`Longitude`? REBNY's public RLS FAQ does not define this; unresolved primary-source question.
- "Public attribution = office, not agent" policy claimed in mapping.ts's comments for `ListAgentFullName` — could not independently confirm or refute against primary REBNY text in this pass.

---

## 3. Effect on Stage A characterization tests (PR #647, commit `036a57c3`)

`lib/idx/__tests__/raw-mapper-characterization.test.ts` already self-labels two blocks
correctly as confirmed defects (the Gate-5 `computeGateColumns` disagreement, and the
owner-opt-out "PROVEN unreachable" note) — both match PROVEN_DEFECTs #4 and #1 above and
need no re-labeling, only a Stage B code fix. Three tests pin disputed or now-reclassified
behavior and need re-labeling as legacy-observation-only (not acceptance criteria) before
Stage B: the `StandardStatus`-precedence/`"Active"`-default test, the missing-`ListPrice`
test, and the Concessions-in-`features` test. The cross-mapper status-precedence test
needs a stronger note: this is no longer "crm-idx-mapper.ts disagrees with the other two,"
it is "all three mappers violate Master Plan §0.6" — see §0.2 of this document.

---

**Sources for this document:** workflow `wf_0986966a-a73` (10 cluster-verification agents +
reclassification + synthesis, live `mcp__trestle-fields__*` tool calls throughout);
`MALLAN-PLATFORM-MASTER-PLAN.md` §0.2/§0.3/§0.4/§0.6/§0.7/§0.8/§0.9, read directly at commit
`036a57c3` (the Master itself cites live-measured Cotality facts, e.g. exact row counts,
which this pass treats as already-verified rather than re-deriving); `lib/idx/__tests__/raw-mapper-characterization.test.ts`
at commit `036a57c3`.
