# BUILDER LIVE PROBES — execution design facts (2026-09-05T03:40Z)

**Evidence class: Builder.** Run by the Builder against the live Cotality API to decide how the executor is built. Not part of any Validator verdict; the Runtime/Integration Validator will exercise the resulting executor independently. Every line carries its query. `SALE` = `StandardStatus eq 'Active' and PropertyType eq 'Residential'`.

| # | Question | Query (appended to SALE unless noted) | Live answer | Design consequence |
|---|---|---|---|---|
| 1 | Does the provider evaluate arithmetic in `$filter`? | `(BathroomsFull mul 2 add BathroomsHalf) ge 3` | **HTTP 500** Internal Server Error (TraceId 98bbd7d1…) — treated as not usable | The canonical bath rule `Full + 0.5 × Half` cannot be one arithmetic predicate. |
| 1b | Baseline disjunction | `(BathroomsFull ge 2 or (BathroomsFull ge 1 and BathroomsHalf ge 1))` | SUPPORTED, 3,777 | Bath thresholds execute as a finite disjunction over half-bath counts. |
| 2 | Is `tolower()` supported in `$filter`? | `tolower(SubdivisionName) eq 'tribeca'` | SUPPORTED, **114** | Equals `Tribeca` 109 + `TriBeCa` 5 (Validator item 5). Neighborhood executes **case-insensitively at the provider**; no vocabulary file is needed at execution. The captured vocabulary remains evidence for suggestions and validation only. |
| 2b | Baseline | `(SubdivisionName eq 'Tribeca' or SubdivisionName eq 'TriBeCa')` | SUPPORTED, 114 | — |
| 3 | Can Mallan's office be excluded in the provider filter? | `ListOfficeMlsId ne '7041'` | SUPPORTED, **6,636** (= 6,638 − 2) | Return-copy suppression is applied **inside the provider query**, before count and pagination. |
| 4 | Is the `in` operator supported on keys? | `ListingKey in ('1175519507','1170236599')` | SUPPORTED, 2 | Page hydration by key list. |
| 5 | Live maximum of half-baths | `BathroomsHalf gt 3` → 24; `BathroomsHalf gt 2` → 65; `$orderby=BathroomsHalf desc&$top=1` → `{Full: 8, Half: 8}` | max Half = **8** on SALE | The bath disjunction enumerates half-bath counts 0…8; a Validator re-check of this bound is required if the corpus changes. |
| 6 | Page cap for a `$select+$orderby+$count` query | `$top=7000` / `2000` / `5000` / `10000` | HTTP 400 **"The maximum limit/$top value for this kind of query is 1000."** (verbatim) | Universe key walks page at 1,000 rows. |
| 6b | Does `nextLink` walking cover the universe? | `page --select=ListingKey,ListPrice,ListingContractDate --orderby=ListingKey asc --top=1000 --max=8000` | rows **6,638**, pages 7, complete=true | Seven calls settle the whole sale key universe. |
| 7 | Two-term ordering | `$orderby=ListPrice desc,ListingKey asc` | SUPPORTED, 6,638 | Deterministic tie-break on `ListingKey` is accepted by the provider. |
| c | 50-key `in` list on Property | `ListingKey in (<50 keys>)` `$top=50 $count=true` | SUPPORTED, count 50, rows 50, **`@odata.nextLink` present even though all rows were returned** | A walker must stop on an empty page or on fewer rows than requested; it must never treat `nextLink` alone as "more rows". |
| d | 50-key `in` list on Media | `Media?$filter=ResourceRecordKey in (<50 keys>)` `$top=1000` | SUPPORTED, count 1,087, rows 1,000, nextLink present | Media for a 50-listing page can exceed one 1,000-row page; hydration walks or selects only hero-relevant rows. |

## Consequences adopted in the executor

1. **Universe settled before count.** Provider keys plus sort fields are walked at 1,000 rows per page with return-copy suppression and `Permission has 'IDX'` inside the filter; Mallan-authored rows are read from Mallan storage under the same criteria; the two are merged and globally sorted with an identity tie-break; `total` is the merged length; the page is a slice; the page's provider rows are hydrated by `ListingKey in (…)`.
2. **No post-page filtering.** Every criterion is expressed in the provider filter or in the storage query; nothing is dropped after the page is cut.
3. **Neighborhood** executes as `tolower(SubdivisionName) eq '<lowercased token>'`.
4. **Bathrooms** execute as a disjunction over half-bath counts 0…8 that is exactly equivalent to `2·Full + Half ≥ 2·min` (and `≤ 2·max`).
5. **Borough** executes on `CityRegion` with Mallan labels mapped to the five live tokens; an unknown token is refused before the query, because the provider would accept it and return an empty result silently (Validator item 4).
6. **Sort** uses `ListPrice` or `ListingContractDate` as primary with `ListingKey asc` as tie-break at the provider, and the same comparator over the merged universe.
