# Location semantics on the REBNY IDX Plus feed — exhaustive live evidence (2026-09-08)

Question (Maya): does Cotality have a neighborhood field, and what do `CityRegion`,
`SubdivisionName`, `City`, `CountyOrParish`, `PostalCity`, `MLSAreaMajor/Minor` MEAN on this feed —
not by name, by evidence. Everything below is either **LIVE** (api.cotality.com, every row, no
sampling), **RESO** (the Data Dictionary 2.0 page fetched live from dd.reso.org — RESO's definition,
not REBNY's), or **DB** (read-only aggregate over the whole stored corpus).

## 1. Existence — all 17 resources, 1,456 declared fields (LIVE `$metadata`, light probe 2026-09-08)

- No field named `Neighborhood` or `Borough` exists on any resource. (`data/cotality-contract/contract.compact.json`.)
- The subsections carry no listing-location fields: CustomProperty (142 fields — area/size ranges only),
  PropertyRooms, PropertyUnitTypes, OpenHouse, Media. Member/Office have their own `*City`,
  `*CityRegion` (0 populated), `*CountyOrParish` (0 populated).
- Location fields on Property, with measured facts:

| Field | Type | RLS-listed | Filterable | Populated (of 591,596) | Lookup |
|---|---|---|---|---|---|
| `City` | String(50) | yes | yes | 591,596 | platform-wide 24,514 members |
| `CityRegion` | String(150) | yes | yes | 591,596 | none |
| `SubdivisionName` | String(150) | yes | yes | 591,596 | none |
| `CountyOrParish` | String(50) | yes | yes | 591,596 | platform-wide 4,423 |
| `PostalCity` | String(50) | yes | yes | 591,053 | platform-wide 20,098 |
| `CountrySubdivision` | String | no | yes | 591,571 | none |
| `MLSAreaMajor` | String | **no** | **suppressed** | **0** (full scan) | `["Other"]` placeholder |
| `MLSAreaMinor` | String | **no** | **suppressed** | **0** (full scan) | `["Other"]` placeholder |
| `StateOrProvince` | String(10) | yes | yes | 591,593 | — |

The Field catalogue's `Definition` is empty (= the name) for all 2,249 rows; Cotality publishes no
field-level definitions. `CustomProperty.CustomFields` keys were measured on 3,000 rows earlier this
session (50 keys, none location-related) — **that measurement is not exhaustive** and is recorded as such.

## 2. Value sets — every row, sums reconciled (LIVE, `scripts/cotality/distinct-values.mjs --count`)

| Field | Distinct | Values (count) |
|---|---|---|
| `City` | **1** | New York City 591,596 |
| `CityRegion` | **5** | Manhattan 397,924 · Brooklyn 151,492 · Queens 32,963 · Bronx 8,434 · StatenIsland 783 |
| `CountyOrParish` | **5** | New York 397,913 · Kings 151,504 · Queens 32,960 · Bronx 8,436 · Richmond 783 |
| `StateOrProvince` | 2 | NY 591,586 · VA 7 (seven Closed Greenpoint/Brooklyn rows from one office — a source data-entry error, pinned by ListingKey in `location/StateOrProvince.json` + query) |

Full-corpus scan (LIVE, `scripts/cotality/location-census.mjs`, 592 pages, 4 m 18 s, 591,596 rows):

| Field | Distinct | Top values |
|---|---|---|
| `SubdivisionName` | **723** | Upper East Side 51,664 · Upper West Side 47,919 · Greenwich Village 19,698 · Park Slope 18,301 · Chelsea 18,027 · Williamsburg 17,217 · Murray Hill 13,433 · Midtown West 13,244 · Financial District 12,603 · Midtown East 11,940 · Harlem 9,980 · West Village 9,558 … |
| `PostalCity` | 56 | New York 399,427 · Brooklyn 147,444 · Bronx 8,235 · Long Island City 7,015 · Astoria 6,490 · Queens 6,009 · Manhattan 2,379 · Jackson Heights 1,663 … (USPS place names) |
| `CountrySubdivision` | 8 | 36061 398,142 · 36047 151,445 · 36081 32,764 · 36005 8,436 · 36085 778 · 36001 4 · 36093 1 · 36059 1 (FIPS county codes; 6 stray rows) |
| `PostalCode` | 298 | 10011 24,677 · 10016 24,536 · 11201 23,752 … |
| `MLSAreaMajor` / `MLSAreaMinor` | **0** | empty on every one of 591,596 rows |

## 3. Co-occurrence (LIVE, same scan)

- `City` → `CityRegion`: the one City value carries all five CityRegion values. **CityRegion is the
  subsection of New York City = the borough.**
- `CityRegion` ↔ `CountyOrParish`: agree on 591,561 rows; **disagree on 35** (all Closed): Kings→Manhattan 21,
  New York→Brooklyn 9, New York→Queens 3, Bronx→Manhattan 2. In those rows the FIPS code
  (`CountrySubdivision`) sides with the county in some and with CityRegion in others (e.g. Williamsburg:
  county "New York", CityRegion Brooklyn, FIPS 36047 = Kings; Financial District: county "New York",
  CityRegion Brooklyn, FIPS 36061 = New York). Two different provider facts; neither is perfectly clean.
- `SubdivisionName` → `CityRegion`: 723 names; **129 appear under more than one borough**, almost all with
  tiny minority counts (Upper West Side → Manhattan 47,846 / Brooklyn 52 / Queens 16 / Bronx 5). Some are
  genuinely shared names (Kensington: Brooklyn 2,438 / Manhattan 3). **A neighborhood is not unique across
  boroughs; the identity is the pair (CityRegion, SubdivisionName).**
- `PostalCity` → `CityRegion`: 10 of 56 USPS cities span boroughs ("New York" → Manhattan 395,061 /
  Brooklyn 2,449 / Queens 1,667 / …). PostalCity is the USPS city, not a borough.

## 4. RESO Data Dictionary 2.0 definitions (fetched live from dd.reso.org — RESO's, not REBNY's)

- **CityRegion**: "A subsection or area of a defined city (e.g., SOHO in New York, NY; Ironbound in
  Newark, NJ; Inside the Beltway)." String, max 150.
- **SubdivisionName**: "A neighborhood, community, complex or builder tract." String, max 50 (Cotality
  declares 150).
- **MLSAreaMajor**: "The major marketing area name, as defined by the MLS or other nongovernmental
  organization. If there is only one MLS area in use, it must be the MLSAreaMajor." — REBNY does not use it.
- **PostalCity**: "The official city per the U.S. Postal Service (USPS), which may be different from the
  recorded city."

## 5. What REBNY's feed therefore means (evidence, not name-reading)

| Provider field | Meaning on this feed | Basis |
|---|---|---|
| `City` | New York City (constant) | 1 value on 100 % of rows |
| `CityRegion` | **the borough** | RESO: "subsection of a defined city"; exactly the five boroughs on 100 % of rows under the one City; RLS-listed |
| `SubdivisionName` | **the neighborhood** | RESO: "a neighborhood, community…"; 723 NYC neighborhood names on 100 % of rows; RLS-listed |
| `CountyOrParish` | the county (New York / Kings / Queens / Bronx / Richmond) | 5 county names; disagrees with CityRegion on 35 rows — a separate fact, not a borough source |
| `CountrySubdivision` | FIPS county code | 5 NYC codes + 6 stray rows |
| `PostalCity` | USPS city | 56 USPS place names |
| `MLSAreaMajor/Minor` | unused by REBNY | 0 rows, not RLS-listed, placeholder lookup |

Neighborhood identity = (`CityRegion`, `SubdivisionName`).

## 6. Mallan's readers today (mechanical: `cotality:authority impact`, DB aggregates)

- Canonical mapper (`lib/idx/trestle-mapper.ts:512-523`): `borough` ← `CountyOrParish`/`City` (county map;
  the `City` branch is dead — City is constant); `neighborhood` ← `SubdivisionName`, else `CityRegion` if
  ≠ borough (`:1010-1011`). It does not read `CityRegion` for borough at all.
- Second mapper (`lib/search/crm-idx-mapper.ts:266-269`): `borough` ← `CityRegion`, `neighborhood` ← `SubdivisionName`.
- Building writer (`lib/buildings/upsert.ts:194-197, 413-416`): `borough` ← `CityRegion`, `neighborhood` ← `SubdivisionName`, `city` ← `PostalCity` ?? `City`.
- CRM PATCH (`app/api/crm/listings/[id]/route.ts:269-272`): `Borough` ?? `CityRegion` → borough; `Neighborhood` ?? `SubdivisionName` → neighborhood.
- Public DTO (`lib/idx/db-to-public-dto.ts:378-383`): `city` ← `addr.City` ?? borough ?? **'New York'** (fabricated default); `borough` ← `addr.Borough` ?? column; county derived from borough by table; `neighborhood` ← `addr.SubdivisionName` ?? `addr.Neighborhood` ?? column.
- Comps (`lib/comps/fetch-comps.ts:158-166`): neighborhood filter `CityRegion eq '<neighborhood>'`; borough fallback `CountyOrParish eq '<borough>'`. **LIVE proof of the defect:** `CityRegion eq 'Upper East Side'` → **0** rows; `CountyOrParish eq 'Manhattan'` → **0**; `CountyOrParish eq 'Brooklyn'` → **0**; controls: `SubdivisionName eq 'Upper East Side'` → 51,664; `CityRegion eq 'Manhattan'` → 397,924. Area comps by neighborhood never match; the borough fallback matches only Bronx and Queens by coincidence of naming.
- `lib/compliance/reso-mapper.ts` (borough from `City`) exists on `main`; it was deleted on this lane by `f0ff8302`/`d6444b00` — not a reader here.
- Stored corpus (DB, 11,126 provider rows with `mls_id`; 26,510 rows total, of which 15,384 RLS-prefixed rows have `mls_id` NULL — pre-2026-08-13 syncs without `ListingKey`): `borough` == normalized `CityRegion` on every row that has CityRegion (the 33 mismatches are rows whose raw_data lacks it); `neighborhood` == `SubdivisionName` likewise; the `CityRegion` fallback into `neighborhood` fired 0 times; stored `MLSAreaMajor` non-null 0.

## 7. Proposed declaration (for Maya — the semantic layer is hers)

- `listings.borough` ← `CityRegion` (display "Staten Island" for `StatenIsland`); `CountyOrParish` kept as its own fact (`county`), never a borough source.
- `listings.neighborhood` ← `SubdivisionName` only; no `CityRegion` fallback (it would write a borough into the neighborhood column).
- Neighborhood vocabulary and Search criteria keyed by (borough, neighborhood).
- `city` ← `City`; `postal_city` ← `PostalCity`; never a fabricated 'New York'.
- Comps: neighborhood filter on `SubdivisionName`, borough filter on `CityRegion`.
- Impact (mechanical): `listings.borough` 26 typed reader sites, `listings.neighborhood` 42 — the exact list is in the authority's impact output for `CityRegion`/`SubdivisionName`.

Evidence files: `docs/operations/evidence-2026-09-08/location/*.json` (reconciled value sets and the full census).
