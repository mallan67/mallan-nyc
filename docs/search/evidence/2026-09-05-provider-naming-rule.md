# PROVIDER NAMING RULE — the Cotality API names its own fields and members (2026-09-05T03:53Z)

**Evidence class: Builder live observation** (`query --resource=Field` and `--resource=Lookup`). Adopted as the naming rule for the Search lane.

## What the provider supplies

| Layer | Provider source | Live example |
|---|---|---|
| Field name and display name | `Field.FieldName`, `Field.DisplayName` | `StructureType` → "StructureType"; `CommonInterest` → "CommonInterest"; `PropertySubType` → "PropertySubType". The display name **is** the field name; no friendlier label exists at field level. |
| Field typing | `Field.Type` | "String List, Single" (CommonInterest, PropertySubType, PropertyType, StandardStatus, CountyOrParish) · "String List, Multi" (StructureType, Permission) · "String" (CityRegion, SubdivisionName) · "Number" · "Date" |
| Field → member list | `Field.LookupName` | `Permission` → lookup `ListingPermission` (which is why its runtime type is `Multi.ListingPermission`) |
| Execution token | `Lookup.LookupValue` | `StockCooperative`, `RentalBuilding`, `ComingSoon`, `ResidentialLease`, `HighRise` |
| Display form | `Lookup.StandardLookupValue` | "Stock Cooperative", "Rental Building", "Coming Soon", "Residential Lease", "High Rise", "Condominium", "Condop", "Townhouse" |
| Meaning | `Lookup.Definition` | `RentalBuilding`: "indicates whether the building consists of all rental units (neither condo, coop, condop)". `Condop`: "a co-op that was formed inside of a condominium building…". `Townhouse` (StructureType): "A dwelling unit, generally having two or more floors and attached to other similar units via party walls." `Pending`: "An offer has been accepted and the listing is no longer on market." |

## The rule

1. A search field is named by the provider's field name. No invented field labels ("Building Form", "Property Sub-Type") anywhere in registry, code or UI copy.
2. A member is **stored and executed** as `LookupValue` and **displayed** as `StandardLookupValue`, both taken from the live Lookup resource. No Mallan alias keys (`condo`, `coop`) as tokens.
3. A member's meaning is the provider's `Definition`. Mallan groups members for its own product (for example, offering a "basic property type" picker) but the group is a presentation over provider members, never a new vocabulary.
4. String fields without a lookup (`CityRegion`, `SubdivisionName`) have no provider display form; their live values are the display. `StatenIsland` is what the provider returns.
5. Anything whose live `Definition` is only its own name (every Field row above) carries no provider semantics beyond the member definitions; nothing further is inferred from the name.
