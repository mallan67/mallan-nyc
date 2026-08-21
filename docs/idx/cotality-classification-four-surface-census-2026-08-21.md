# FOUR-SURFACE CLASSIFICATION CENSUS + `CustomFields` SEMANTICS

**Probed live 2026-08-21T19:17Z and 19:19Z against `api.cotality.com/trestle`.** Read-only,
GET only, preview env. Evidence: `artifacts/.classification-four-surface-census.json` ·
`artifacts/.customfields-semantics.json`.

**This CORRECTS the earlier census in
`docs/idx/cotality-property-type-family-and-customfields-2026-08-21.md`**, which compared
only `PropertySubType` and `StructureType` and omitted `PropertySubTypeAdditional`
entirely. That omission meant "StructureType carries Townhouse" was never proven
*exclusive*, the Multi-Family universe was incomplete, and **"Land is a genuine absence"
was not proven at all**.

---

## 1. TOWNHOUSE — now proven EXCLUSIVE to `StructureType`

ID-level, `StandardStatus eq 'Active'`, every set paged to exhaustion.

| surface | state | count | exclusive to it |
|---|---|---|---|
| `PropertyType eq 'Townhouse'` | **PROVIDER_REJECTED 400** — *"'Townhouse' is not a valid enumeration type constant"* | — | — |
| `PropertySubType eq 'Townhouse'` | SUPPORTED (complete) | **0** | 0 |
| `PropertySubTypeAdditional has 'Townhouse'` | SUPPORTED (complete) | **0** | 0 |
| **`StructureType has 'Townhouse'`** | SUPPORTED (complete) | **610** | **610** |

**Union 610. Pairwise overlap: 0 everywhere. `StructureType` is the sole carrier.**

The `PropertyType` probe returning **400** rather than 0 matters: `Townhouse` is not a
member of that enum at all. A rejection and an empty result are different facts and the
probe kept them apart.

### What those 610 listings actually are

| dimension | distribution |
|---|---|
| `PropertyType` | Residential 565 · ResidentialLease 45 |
| `PropertySubType` | **MultiFamily 298 · SingleFamilyResidence 274** · Apartment 11 · Duplex 10 · Triplex 9 · MixedUse 8 |
| `PropertySubTypeAdditional` | (null) 597 · Apartment 11 · MultiFamily 2 |
| `CommonInterest` | **None 584** · RentalBuilding 15 · Condominium 7 · StockCooperative 4 |
| `StructureType` (multi-valued) | `Townhouse` 473 · `MultiFamily,Townhouse` 69 · `House,Townhouse` 25 · `Duplex,Townhouse` 11 · `Townhouse,Triplex` 10 · 8 further combinations |
| `PropertyAttachedYN` | **null on all 610** — cannot distinguish attached from detached |
| `NumberOfUnitsTotal` | 1 → 249 · 2 → 119 · 3 → 55 · 4 → 26 · … · 370 → 1 · **`-1` → 64 (sentinel)** |

The earlier document *speculated* that NYC townhouses land under `SingleFamilyResidence` or
`MultiFamily` and explicitly flagged it as unproven. **It is now measured: they do — 274 and
298 respectively.** So `PropertySubType` cannot express Townhouse: the same value carries
both townhouses and non-townhouses.

`NumberOfUnitsTotal = -1` on 64 rows is a sentinel, not a count. Anything consuming that
field must handle it.

---

## 2. MULTI-FAMILY — four surfaces, and NO listing appears on all of them

| surface | count | **exclusive to it** |
|---|---|---|
| `PropertyType eq 'MultiFamily'` | **0** | 0 |
| `PropertySubType eq 'MultiFamily'` | **424** | **253** |
| `PropertySubTypeAdditional has 'MultiFamily'` | **75** | **1** |
| `StructureType has 'MultiFamily'` | **714** | **556** |

**Union = 981. Present in every surface = 0.**

Pairwise: `PropertySubType ∩ PropertySubTypeAdditional` 74 · `PropertySubType ∩
StructureType` 158 · `PropertySubTypeAdditional ∩ StructureType` 61.

The current UI reads `PropertySubType` alone → **424 of 981 = 43%**. It misses 557.

> **The union is NOT yet the canonical criterion.** The four dimensions mean different
> things — inventory class, primary subtype, additional subtype, structural form — and the
> §1 evidence shows `StructureType` is genuinely structural (69 rows are
> `MultiFamily,Townhouse`, i.e. a multifamily *townhouse*). Whether the broker concept
> "Multi-Family" should include a 2-unit townhouse is a **business** decision, not a token
> match. `PropertySubTypeAdditional` contributes exactly **1** exclusive row and is
> effectively redundant here.
>
> Recommended criterion, pending your call: **`PropertySubType eq 'MultiFamily'` OR
> `StructureType has 'MultiFamily'`** = 979 of the 981. Status **NEEDS_PROBE** on business
> semantics — the measurement is done, the product meaning is not.

---

## 3. LAND — now measured across ALL candidate surfaces

Eleven probes. **All SUPPORTED (complete). All ZERO. Zero UNVERIFIED.**

| probe | Active | all statuses |
|---|---|---|
| `PropertyType eq 'Land'` | 0 | **0** |
| `PropertySubType eq 'Land'` | 0 | — |
| `PropertySubType eq 'UnimprovedLand'` | 0 | 0 |
| `PropertySubType eq 'ImprovedLand'` | 0 | — |
| `PropertySubTypeAdditional has 'Land'` | 0 | **0** |
| `PropertySubTypeAdditional has 'UnimprovedLand'` | 0 | **0** |
| `PropertySubTypeAdditional has 'ImprovedLand'` | 0 | **0** |

### Classification correction

**`VERIFIED_ZERO_POPULATION_CURRENT_FEED` — NOT `UNSUPPORTED`.**

The provider **supports** every one of these criteria: each probe returned HTTP 200 with a
well-formed empty result. What is zero is the *current inventory*, not the capability.
Those are different facts, and the earlier document's "UNSUPPORTED / genuine absence"
wording collapsed them. **The broker capability is retained.**

If land inventory ever appears, `PropertyType eq 'Land'` is the general criterion and
Unimproved Land is a separate, narrower one. "Land" must never silently mean
"UnimprovedLand".

---

## 4. `CustomFields` IS AN OBSERVED EXTENSION PAYLOAD, NOT 52 METADATA FIELDS

The correct model — and the earlier document was loose about this:

| layer | value |
|---|---|
| resource | `CustomProperty` |
| **declared** field | `CustomFields` |
| **declared** type | `Edm.String` |
| observed payload encoding | JSON object |
| observed extension key | e.g. `MaximumFinancingPercent` |

The 52 inner keys are **observed extension keys**, not `$metadata`-declared properties.
`FIELD_REGISTRY` may reference the conceptual path
`CustomProperty.CustomFields.MaximumFinancingPercent`, but must mark it as an observed
extension key. Two rules now coexist:

> **"Not declared in `$metadata`" does not mean "not supplied by Cotality"** — it may be an
> observed extension inside an opaque declared field.
>
> **"A JSON key exists" does not mean its semantics are verified.** An internal key name is
> not semantic proof.

---

## 5. `MaximumFinancingPercent` — real, but sentinel-bearing and LISTING-level

Exhaustive: 8,010 / 8,010 Active rows.

| `CommonInterest` | rows with key | top values |
|---|---|---|
| **StockCooperative** | 2,497 / 2,507 (**99.6%**) | 80.00 → 1,192 · 75.00 → 483 · **0.00 → 243** · 50.00 → 194 · 90.00 → 156 · 70.00 → 82 · 65.00 → 50 |
| **Condominium** | 3,615 / 3,720 (**97%**) | **90.00 → 2,313** · **0.00 → 576** · 80.00 → 549 · 75.00 → 47 · 100.00 → 34 |
| **Condop** | 139 / 147 (94.6%) | 80.00 → 73 · 90.00 → 31 · 0.00 → 23 |
| **RentalBuilding** | 242 / 640 (**38%**) | **0.00 → 225 of 242 (93%)** |
| **None** | 310 / 996 (31%) | 100.00 → 103 · 0.00 → 102 · 90.00 → 46 |

### What this establishes

1. **It behaves like a genuine ownership-financing rule for co-op, condo and condop.** The
   co-op distribution in particular (80/75/50/90/70/65) is the shape of real board rules,
   not a default. Condominium clusters hard at 90.
2. **`0.00` is a NOT-SPECIFIED SENTINEL, not "0% financing allowed."** It appears across
   every class and dominates `RentalBuilding` (93%), where the concept does not apply.
   Corroborated by paired `MaximumFinancingRemarks` values of `"0"` and `"none"`. **Treating
   0.00 as a real limit would exclude listings that simply did not state one.**
3. **It is NOT reliably a building fact.** Of 3,402 buildings (street+zip), **380 (11%) carry
   disagreeing values** — e.g. `10 MADISON 10010` → {90.00, 0.00}; `252 SOUTH 10002` →
   {90.00, 75.00, 25.00}; `36 SUTTON 10022` → {50.00, 60.00}. Some is the 0.00 sentinel,
   some is genuine conflict. **Listing-level fact. Do not expose as a building rule without
   reconciliation.**
4. Outliers `1.00`, `10.00`, `20.00`, `25.00`, `33.00` need review before any range filter.

**State: NEEDS_PROBE** — population proven, sentinel identified, scope (listing not
building) established; the remaining question is provenance/freshness of the disagreements.

---

## 6. `AttendanceType` — a 16-token vocabulary. DO NOT call it "doorman"

**84 distinct raw combinations over 16 tokens** (comma-joined multi-value):

| token | rows | | token | rows |
|---|---|---|---|---|
| `DoormanFullTime` | 4,152 | | `VideoDoormanYes` | 163 |
| `None` | 2,971 | | `ElevatorAttendanceYes` | 86 |
| `ConciergeFullTime` | 1,347 | | `ElevatorAttendanceFullTime` | 52 |
| `ConciergeYes` | 1,177 | | `VideoDoormanFullTime` | 52 |
| `DoormanYes` | 563 | | `ConciergePartTime` | 43 |
| `LobbyAttendantFullTime` | 533 | | `LobbyAttendantPartTime` | 36 |
| `DoormanPartTime` | 298 | | `LobbyAttendantYes` | 12 |
| | | | `VideoDoormanPartTime` | 4 · `ElevatorAttendancePartTime` 1 |

It encodes **five distinct roles** — Doorman · Concierge · LobbyAttendant · VideoDoorman ·
ElevatorAttendance — at **four coverage levels** — FullTime · PartTime · Yes · None.

### Correlation evidence

| token | rows | also Doorman/Concierge in DECLARED `AssociationAmenities`/`BuildingFeatures` | `BuildingStaffType` |
|---|---|---|---|
| `DoormanFullTime` | 4,152 | **1,380 (33%)** | absent 3,072 · SuperLiveIn 947 · ResidentManagerFullTime 122 |
| `ConciergeFullTime` | 1,347 | 734 (54%) | absent 876 · SuperLiveIn 396 |
| `None` | 2,971 | **23 (0.8%)** | absent 2,852 |

1. The declared amenity fields **miss 67% of full-time doorman buildings**. `AttendanceType`
   is materially richer — but the two disagree, so neither substitutes for the other.
2. `None` correlating with a doorman amenity only 0.8% of the time is good evidence the
   token means what it says.
3. `BuildingStaffType` (SuperLiveIn / SuperOffsite / ResidentManagerFullTime) is a
   **different concept** — building superintendent, not lobby attendance — and is absent on
   ~74% of `DoormanFullTime` rows. Not a synonym.

**NO brokerage label is attached.** `AttendanceType` is retained as its own provider
observation. Collapsing it to "doorman" would repeat the Concierge ≠ Doorman error at
larger scale, and would be worse: **`VideoDoormanYes` (163) is not a doorman**, and
`ElevatorAttendance*` is a third thing again. **State: NEEDS_PROBE** on the brokerage
mapping. Vocabulary: VERIFIED.

---

## 7. STORAGE TRACE — before any promotion

| link | state |
|---|---|
| `lib/idx/fetch.ts` | `expandCustomProperty` exists and is **opt-in**; its comment says the CustomProperty schema "has not been audited via Trestle `$metadata`" — this census is that audit |
| **`/api/idx/search`** | does **NOT** set `expandCustomProperty` → `CustomProperty` is never expanded on the authenticated Search path |
| `lib/search/crm-idx-mapper.ts:99-120` | already parses `CustomFields` JSON — for exactly **one** key, `SponsorUnitYN` → `sponsorUnit` |
| `lib/compliance/raw-data-keep-fields.ts` | does **not** list `CustomProperty` → the blob is not preserved in `raw_data` |

### Two defects this trace exposes — recorded, not fixed here

1. **`sponsorUnit` is inert on the Search path.** The mapper reads it, but `/api/idx/search`
   never expands `CustomProperty`, so `customProps` is undefined and `sponsorUnit` is
   `null` on every search result.
2. **The parse would not work even if it were expanded.** Live values are JSON **strings**
   `"0"` / `"1"`. The mapper accepts `true | "true" | "Yes" | 1` and `false | "false" |
   "No" | 0` — **`"1"` and `"0"` match neither list**, so the result is `null` twice over.

The in-code comment also says CustomFields "carries 41 NYC-specific flags (per CLAUDE.md)".
The live census found **52**. The repo number is stale.

**No schema change is proposed.** The existing canonical JSON path should be exhausted
first, and `expandCustomProperty` is already the supported mechanism.

---

## 8. WHAT CHANGES IN THE CONTRACT

| item | before | after |
|---|---|---|
| Townhouse | "StructureType carries it" | **proven EXCLUSIVE** — 610, other three surfaces 0/rejected |
| Multi-Family | "PropertySubType OR StructureType, ~982" | four surfaces measured, union **981**, **none present on all**; criterion is a business decision, not a token OR |
| Land | "UNSUPPORTED / genuine absence" | **`VERIFIED_ZERO_POPULATION_CURRENT_FEED`** — 11 probes, all 200, all zero; capability retained |
| `CustomFields` keys | described alongside `$metadata` fields | **observed extension keys** in a declared `Edm.String` |
| `AttendanceType` | "the doorman/concierge fact" | **16-token, 5-role vocabulary; no label attached** |
| `MaximumFinancingPercent` | "the building financing limit" | listing-level, sentinel-bearing, 11% of buildings disagree |
