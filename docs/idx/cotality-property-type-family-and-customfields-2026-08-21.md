# PROPERTY TYPE FAMILY + THE UNDECLARED `CustomFields` RESOURCE

**Probed live 2026-08-21 against `https://api.cotality.com/trestle`.** Read-only, GET only,
preview env, never production Neon. Raw evidence:
`artifacts/.property-type-family-census.json` ·
`artifacts/.cotality-live-resource-inventory.json` ·
`artifacts/.coop-financing-policy-probe.json` ·
`artifacts/.customfields-key-census.json`.

Every number is an HTTP response received in that session (CLAUDE.md §A.0). No repo
constant, mapper table, prior audit or agent report was used as evidence.

---

## 0. THE HEADLINE

**Four UI controls were mapped to the wrong Cotality fact, and one entire NYC field family
is invisible to `$metadata` altogether.** Zero population on the first field checked was
never evidence that a brokerage capability was dead — it was evidence of a mis-mapping.

| control | was mapped to | live count | ACTUALLY carried by | live count |
|---|---|---|---|---|
| **Townhouse** | `PropertySubType = Townhouse` | **0** (all statuses) | **`StructureType` (Multi-Enum)** | **612 Active · 5,951 all-status** |
| **Condo** | `PropertySubType = Condominium` | **0** (all statuses) | **`CommonInterest = Condominium`** | **3,722 Active · 240,272 all-status** |
| **Co-op** | `PropertySubType = StockCooperative` | **0** (all statuses) | **`CommonInterest = StockCooperative`** | **2,509 Active · 129,041 all-status** |
| **Land** | `PropertySubType = UnimprovedLand` | **0** | *no candidate carries it* — see §4 | `PropertyType = Land` is **0** too |
| **Multi-Family** | `PropertySubType = MultiFamily` | 426 Active | **`PropertySubType` OR `StructureType`** | **~982 Active — the single field misses ~57%** |

---

## 1. TOWNHOUSE — the UI searched the wrong field entirely

```
StructureType  Type="Cotality.DataStandard.RESO.DD.Enums.Multi.StructureType"   23 members
```

It is a **Multi-Enum**, so it is queried with `has`, not `eq`.

| probe | state | count |
|---|---|---|
| `PropertySubType eq 'Townhouse'` (all statuses) | SUPPORTED | **0** |
| `StructureType has …Multi.StructureType'Townhouse'` (all statuses) | SUPPORTED | **5,951** |
| same, `StandardStatus eq 'Active'` | SUPPORTED | **612** |

**612 active NYC townhouses were being searched as zero.** The capability was never dead;
the criterion pointed at a field this feed does not populate.

`StructureType ne null` on Active = **7,152 / 8,032**, so the field is broadly populated and
is a real classification axis, not a curiosity.

---

## 2 & 3. CONDO AND CO-OP ARE OWNERSHIP FACTS — `CommonInterest`, not `PropertySubType`

| probe | state | count |
|---|---|---|
| `CommonInterest eq 'Condominium'` — Active | SUPPORTED | **3,722** |
| `CommonInterest eq 'Condominium'` — all statuses | SUPPORTED | **240,272** |
| `PropertySubType eq 'Condominium'` — all statuses | SUPPORTED | **0** |
| `CommonInterest eq 'StockCooperative'` — Active | SUPPORTED | **2,509** |
| `CommonInterest eq 'StockCooperative'` — all statuses | SUPPORTED | **129,041** |
| `PropertySubType eq 'StockCooperative'` — all statuses | SUPPORTED | **0** |

Disagreement measured directly: `CommonInterest eq 'Condominium' and PropertySubType ne
'Condominium'` returns **3,722** — i.e. **every single one**. Same for co-op: **2,509**.
The two fields never agree because one of them is empty.

### Live `CommonInterest` census — Active, exhaustive

| member | count |
|---|---|
| `Condominium` | **3,722** |
| `StockCooperative` | **2,509** |
| `None` | **998** |
| `RentalBuilding` | **639** |
| `Condop` | **147** |
| the other 8 declared members | **0** |

**Sum = 8,015 = `CommonInterest ne null` exactly.** Census complete.

**One canonical ownership criterion: `CommonInterest`.** No separate "residential condo" and
"commercial condo" field truths — the provider contract does not require one, and the UI
already uses `CommonInterest` for condo/co-op elsewhere. The commercial section's
`PropertySubType = Condominium` / `StockCooperative` controls match nothing and must be
re-pointed at `CommonInterest`, not preserved because the enum happens to declare those
members.

---

## 4. LAND — "Land" is NOT "UnimprovedLand", and neither is populated

| probe | state | count |
|---|---|---|
| `PropertyType eq 'Land'` — all statuses | SUPPORTED | **0** |
| `PropertySubType eq 'UnimprovedLand'` — all statuses | SUPPORTED | **0** |
| `PropertySubType eq 'Land'` — all statuses | SUPPORTED | **0** |
| `PropertySubType eq 'ImprovedLand'` — all statuses | SUPPORTED | **0** |

Unlike the other three, this is **not** a mis-mapping to a populated sibling: no candidate
field carries land inventory in this feed at any status. The semantic objection still
stands and is now recorded — `PropertyType = Land` (the general concept) and
`PropertySubType = UnimprovedLand` (a narrower one) are different facts and "Land" must
never silently mean "UnimprovedLand".

Status is **UNSUPPORTED — no live inventory in ANY candidate field**, not "dead". The
control stays. If land inventory ever appears, `PropertyType eq 'Land'` is the general
criterion and Unimproved Land becomes a separate, narrower one.

---

## 5. MULTI-FAMILY — one field is not enough

Declared on **three** fields. Measured on Active:

| probe | count |
|---|---|
| `PropertyType eq 'MultiFamily'` | **0** |
| `PropertySubType eq 'MultiFamily'` | **426** |
| `StructureType has …'MultiFamily'` | **715** |
| `StructureType has …'MultiFamily'` **and** `PropertySubType ne 'MultiFamily'` | **556** |

So the two populated fields **overlap on only 159** rows (715 − 556), and the union is
roughly **982**. The current UI, which reads `PropertySubType` alone, returns 426 — it
**misses about 57% of live multifamily inventory.**

Multi-Family therefore needs **`PropertySubType` OR `StructureType`**, not a choice between
them. `PropertyType eq 'MultiFamily'` is declared but empty and contributes nothing.

---

## 6. THE UNDECLARED FIELD FAMILY — `CustomProperty.CustomFields`

**This is the finding that most changes the method.**

`$metadata` declares `CustomProperty.CustomFields` as one `Edm.String`. Its CONTENT is a
JSON object of NYC/REBNY-specific facts that appear in **no schema anywhere** — so every
field-level audit ever run against this feed was structurally blind to them.

**Census: 8,010 / 8,010 Active rows read via `$expand=CustomProperty`. 0 null blobs, 0
unparsable. Coverage COMPLETE — a census, not a sample. 52 distinct keys.**

### The answer to "how much max financing does the building allow"

| key | rows carrying | sample values |
|---|---|---|
| **`MaximumFinancingPercent`** | **6,803 / 8,010 = 84.9%** | `80.00` · `90.00` · `75.00` · `70.00` · `50.00` · `72.00` |
| `MaximumFinancingRemarks` | 6,616 = 82.6% | `"90%"` · `"Confirm with listing agent."` |
| `MaximumFinancingAmount` | 761 = 9.5% | `511200.00` |

It exists, it is live, and it is populated on ~85% of active inventory. It is simply not a
declared field, which is why searching `$metadata` for it returns nothing.

Meanwhile the **declared** financing fields are empty on Active:
`CurrentFinancing` **0** · `BuyerFinancing` **0** · `ListingTerms` **0**.

### The rest of the family (all 52 keys, % of the 8,010 rows read)

| key | coverage | sample values | notes |
|---|---|---|---|
| `ElevatorsTotal` | **100%** | `0` `1` `2` `4` `7` `9` | the registry records `ElevatorYN` as ABSENT |
| `AttendanceType` | **100%** | `DoormanFullTime,ConciergeFullTime,ElevatorAttendanceYes` · `None` | the registry records `DoormanYN` as ABSENT |
| `BuildingTaxLot` | **100%** | | NYC parcel identity |
| `TaxAbatementYN` | 99.9% | `0` `1` | |
| `SponsorUnitYN` | 97% | `0` `1` | the NL dictionary emits "Sponsor Unit" with no backing today |
| `FlipTax` | 89% | `2.00` `1.75` `15.00` `3750.00` | with `FlipTaxType` (`Percent`/`Dollars`/`SeeRemarks`) 29.6% and `FlipTaxRemarks` 65.4% |
| `PercentOfCommonElements` | 86% | | |
| `CertificateOfOccupancyYN` | 74.3% | | |
| `TaxMonthlyAmount` | 72.2% | | |
| `LandmarkStatusYN` | 71% | `0` `1` | |
| `ViewRemarks` | 61% | | |
| `TaxDeductionPercent` | 59.3% | | co-op tax deductibility |
| `CapitalReservesYN` | 55.2% | `0` `1` | |
| `PrivateOutdoorSpaceSize` | 39.1% | `LessThan60SqFt` · `GreaterThan60SqFt` | |
| `UnitLine` | 38.6% | `B` `D` | |
| `KitchenCondition` / `BathroomCondition` | 31.2% / 25.5% | `Excellent` | |
| `FurnishedListPrice` | 17.5% | | rental economics |
| `BuildingStaffType` | 16.4% | `SuperLiveIn` · `SuperOffsite` · `ResidentManagerFullTime` | |
| `BuildingSmokeFreeYN` | 15.8% | `0` `1` | |
| `MaxLeaseMonths` | 12.7% | `12` `24` `18` | with `FurnishedMin/MaxLeaseMonths` 1.9% |
| `BuildingRules` | 10.6% | `PiedATerreAllowed,CorporateOwnerAllowed,BuildingWasherDryerAllowed` | |
| `ClosetsTotal` | 10.5% | | |
| `TaxDeductionAmount` | 9.5% | | |
| `GuarantorsAcceptedYN` | 8.1% | `0` `1` | rental qualification |
| `CommercialUnitsYN` | 8% | | |
| `TaxDeductionRemarks` | 7.8% | | |
| `CeilingHeightFeet` / `Inches` / `Units` | 4.6% / 4.1% / 0.8% | | |
| `TaxAbatementComments` / `ExpirationYear` | 2.5% | | |
| `BuildingParkingTotal` | 2.3% | `200` | |
| `ComingSoonTimestamp` | 1.1% | | |
| `NumberOfProfessionalUnitsTotal` | 0.9% | | |
| `CapitalReservesTotal` | 0.7% | | |
| `ManagingAgencyListingYN` | 0.6% | | |
| `ArchitectName` | 0.3% | | |
| `SpecialAssessmentExpirationDateTime` | 0.2% | | |
| `AreaOverFAR` / `AreaUnderFAR` | 0.1% | | development rights |
| `RoofRightsYN` · `BonusYN` · `BuyerAgentRLSParticipantYN` | ~0% | | |

### The capability constraint that comes with it

**`CustomFields` is a JSON STRING. It cannot be `$filter`ed server-side.** None of these 52
keys is provider-filterable. Any criterion built on them must be read via
`$expand=CustomProperty` and matched Mallan-side, or derived onto the projection at build
time — the same shape already used for amenity keys. That is a capability fact, and it must
be recorded as such rather than discovered later by a failing query.

Also: a key ABSENT from a row is absent, not null. Percentages above are of rows read, and
rows read is the complete Active universe.

---

## 7. LIVE RESOURCE INVENTORY (extracted mechanically from `$metadata`)

**17 entity types · 1,456 declared fields · 185 enums, of which 114 are Multi-Enums.**

| resource | fields | | resource | fields |
|---|---|---|---|---|
| **Property** | **757** | | OpenHouse | 47 |
| **CustomProperty** | **142** | | PropertyGreenVerification | 39 |
| Member | 91 | | **PropertyRooms** | **39** |
| Office | 80 | | HistoryTransactional | 29 |
| **Media** | **56** | | TeamMembers | 29 |
| **PropertyUnitTypes** | **52** | | Field / Lookup | 15 / 15 |
| Teams | 48 | | Model / Enumeration | 8 / 8 |
| | | | **Building** | **1** |

`Property` field kinds: **576 scalar · 81 enum · 100 multi-enum.**

**14 navigation properties on Property:** `Media` · `OpenHouse` · `CustomProperty` ·
`Rooms` · `UnitTypes` · `Building` · `ListAgent` · `CoListAgent` · `BuyerAgent` ·
`CoBuyerAgent` · `ListOffice` · `CoListOffice` · `BuyerOffice` · `CoBuyerOffice`.

`Building` declaring exactly **1** field is consistent with the existing finding that
`BuildingKey`/`BuildingKeyNumeric` are populated 0/8,056 and `GET /Building` returns 403.

> `$metadata` **over-declares** what the licence grants. Everything in this inventory is
> `DECLARED_ONLY` until an endpoint probe proves it — and, as §6 shows, the inventory is not
> even complete, because an undeclared JSON family sits inside one of the declared strings.

### NYC parcel identity is live and near-complete

`TaxBlock` **8,014 / 8,032 Active**. `AssociationFee` 7,261. `TaxAnnualAmount` 3,316.
Plus `TaxLot`, `TaxMapNumber`, `TaxTract`, `TaxParcelLetter`, `TaxLegalDescription`,
`TaxBookNumber` — and `BuildingTaxLot` at 100% inside `CustomFields`.

### The investment / operating family exists on Property

`GrossIncome` · `GrossScheduledIncome` · `NetOperatingIncome` · `OperatingExpense` ·
`OperatingExpenseIncludes` · `TotalActualRent` · `RentControlYN` · `VacancyAllowance(Rate)`
· and 15 individual expense lines (`MaintenanceExpense`, `InsuranceExpense`,
`ElectricExpense`, `FuelExpense`, `ManagerExpense`, `ProfessionalManagementExpense`,
`TrashExpense`, `WaterSewerExpense`, `PestControlExpense`, `PoolExpense`,
`GardenerExpense`, `SuppliesExpense`, `LicensesExpense`, `CableTvExpense`,
`FurnitureReplacementExpense`, `WorkmansCompensationExpense`, `NewTaxesExpense`,
`OtherExpense`). Population **UNVERIFIED** — census required before any of it is offered.

---

## 8. WHAT THIS MEANS FOR METHOD

The 39-control inventory measured **current UI wiring**. It could not have found any of the
above, because none of it is wired. Two of these findings are not even reachable from
`$metadata`:

1. A UI label pointing at a valid-but-empty enum member looks identical to a genuinely
   unavailable capability — only a cross-field census tells them apart.
2. An entire 52-key NYC field family lives inside an undeclared JSON string, including the
   doorman, elevator, flip-tax, tax-abatement and max-financing facts a NYC broker needs
   most.

Coverage must therefore be measured against **provider resources and field families**, with
per-field capability probed, not against the count of controls the current form happens to
serialise.
