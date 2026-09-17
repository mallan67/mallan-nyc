# Domains 8–9 — amenities on the live vocabulary, media and coordinates as the feed delivers them, CustomFields ingested (2026-09-08)

## 8a. Amenity filters — every value a live member, or an explicit text concept

The census found 15 amenity values that were not published members of their field. The DB public path matches
amenities by case-insensitive substring over the stored member strings, so some phantoms matched by accident
(`RoofDeck` ⊂ `BuildingRoofDeck`, `HighCeiling` ⊂ `HighCeilings`) and others could never match
(`OnCommonFloor` vs the live `CommonOnFloor`; `WoodBurningFireplace`, `DecorativeFireplace`, `NaturalLight`,
`Renovated`, `GutRenovated`, `NewlyRenovated`, `Quiet` — no such InteriorFeatures members exist).

| Amenity | Before | Now (live members; * = observed on the feed) |
|---|---|---|
| roof-deck | RoofDeck (phantom), BuildingRoofDeck | BuildingRoofDeck*, Deck |
| laundry-room | LaundryRoom, OnCommonFloor (phantom), CommonOnFloor, CommonArea | LaundryRoom, CommonOnFloor*, CommonArea*, BuildingInBasement*, BuildingInHall*, BuildingInside*, BuildingMultipleLocations* |
| walk-in-closet / high-ceilings | + singular phantoms | WalkInClosets*, HighCeilings* |
| fireplace | WoodBurningFireplace, DecorativeFireplace (phantoms), Fireplace | InteriorFeatures `Fireplace` or any FireplaceFeatures member but `None` (WoodBurning*, Decorative*, Gas*, Electric*, Masonry*, Stone*, …) |
| park-views / views | `Park` (phantom) | ParkGreenbelt* (+ River*, Water*, City*, CityLights*, Skyline, Downtown for views) |
| natural-light / renovated / quiet | InteriorFeatures phantoms | **text concepts on PublicRemarks** ("natural light", "sun-drenched" …; "renovated", "renovation"; "quiet") — declared as such, no provider member exists |

Ratchet: `lib/search/__tests__/amenity-vocabulary.test.ts` binds every enum-field value to the live vocabulary and
pins the text concepts. (`pet-friendly` and `no-fee` were done in Domain 6.)

## 8b. Media and coordinates — provider facts, and what production still needs

| Fact | Value | Consequence |
|---|---|---|
| `Latitude` / `Longitude` / `MapCoordinate` | **SUPPRESSED** on this feed (filter 400, null on every row); `CLIP_Latitude/Longitude` not entitled | The 0 / 26,510 projection coordinates are the provider's suppression, not a mapping defect. Coordinates come only from Mallan's own geocoder (`lib/geo`, the geocode manifest); the map depends on that job, not on the feed. |
| `VirtualTourURLUnbranded` / `VirtualTourURLBranded` | populated 26,372 / 13,879 of 591,607 (4.5% / 2.3%) | Production raw_data carries a tour URL on 3,271 rows, yet the projection's `has_virtual_tour` is 0 on every row: the projection builder now derives the flag from the six carriers (commit 0d6c5e29), but the stored projection predates it and needs the projection backfill (`scripts/backfill-listing-search-projection.ts`) — a production data step, held. |
| Media selects | — | The classification starvation on four Media sites was fixed in Domain 2 (one `MEDIA_SELECT_FIELDS`). |

## 9. CustomProperty.CustomFields — ingested losslessly

Provider facts: the CustomProperty navigation returns a payload on every row (591,599 / 591,599); `CustomFields` is a
JSON string with **61 keys on every row** (BuildingTaxLot, CertificateOfOccupancyYN, GuarantorsAcceptedYN,
FlipTaxRemarks, MaximumFinancingRemarks, BonusRemarks, BuildingRules, TaxAbatementComments …);
`$expand=CustomProperty($select=CustomFields)` was accepted live for the whole corpus (the 2026-05-15 rejection
concerned the DownPaymentAssistance* names, which are Property fields now). Mallan fact: production
`listings.custom_fields` is NULL on all 26,552 rows — no production caller expanded CustomProperty and the mapper
never read it.

Now: `customFieldsFromProviderRow` (boundary, in the mapper) parses the expanded payload into `custom_fields`
when the row carries it, writes nothing when it does not (never a null overwrite of a CRM-authored value), and
stores nothing that is not JSON (`lib/idx/__tests__/custom-fields-ingestion.test.ts`).

**Held:** the one remaining line is the sync's `expandCustomProperty: true` in `lib/idx/sync.ts` (charter: do not
touch IDX sync without explicit authorization). With it, the 61 keys land on every synced row on the next run.
