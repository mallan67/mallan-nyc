# Domain 2 — one selection authority: every provider field list the program sends (2026-09-08)

Scope: the `$select` / `$expand(...$select)` lists Mallan sends to Cotality, per resource, and whether the code that
consumes the returned rows reads fields it never asked for. Evidence: `select-site-census.json` (a read-only
census of every site, each read-but-not-selected claim independently refuted or confirmed) and the coverage matrix §B.

## 1. What was wrong (confirmed, not assumed)

| # | Defect | Proof | Effect |
|---|---|---|---|
| 1 | Four Media sites selected fewer fields than the shared classifier reads (`classifyMediaItem` reads MediaCategory, MediaClassification, ShortDescription, MediaURL). | `app/api/media/batch/route.ts` primary-photo mode (6 fields), `app/api/agents/[slug]/listings/route.ts`, `lib/search/engine/hydrate.ts`, `lib/buildings/public-building-data.ts` — all CONFIRMED by refutation agents. | Floor plans / documents could be classified as photos on those surfaces (classification fell back to URL shape). |
| 2 | Ten Media select lists in nine files — five different shapes; three byte-identical OpenHouse literals in two files; two Property-expand lists in the same route differing by three fields (26 vs 25). | matrix §B, census. | Drift by construction; no compile check on a string literal (a wrong name is an HTTP 400 for the whole query). |
| 3 | The ghost/orphan reconciliation expanded Media with **no** inner select — all 56 Media fields per row to read 13. | `app/api/cron/feed-reconcile/route.ts:394`. | Wasted quota on every orphan batch. |
| 4 | The persisted (sync) select did not request fields the runtime paths serve or the keep-list retains: `OwnerPays` (7,915 rows), `PriceChangeTimestamp` (361,678), `OnMarketTimestamp` (265,702), `UnparsedAddress` (591,607), plus the declared `VirtualTourURLBranded2/3` and `MLSAreaMajor`. | `lib/idx/__tests__/sync-select-covers-runtime.test.ts` (red first). | The DB-backed page and the provider-direct page could show different facts for the same listing; price changes were dated by the modification time ("Approximate date" in `PriceHistory.tsx`). |
| 5 | The suggest route read `City` / `PostalCity` through the canonical location interpreter but never requested them. | `app/api/listings/suggest/route.ts` — CONFIRMED. | Latent: null today because only borough/neighborhood are rendered. |
| 6 | The public search open-house facet (`app/api/listings/route.ts`, both paths) counted **any** active open house — Broker-only and Private events included — while every open-house page filters `OpenHouseType eq 'Public'`. | census (new site, not in the matrix). | A listing with only a broker-only event matched the public "open house" facet. |
| 7 | Sibling-unit lookup (`app/api/listings/building/route.ts`) hard-coded Active / ActiveUnderContract / ComingSoon while claiming parity with the active-display set — Pending (In Contract) units were dropped. | route comment vs `ACTIVE_DISPLAY_VALUES`. | Domain 1 consequence. |
| 8 | CustomProperty is **never** expanded by any production caller (`expandCustomProperty` is set only in tests). | census, `lib/idx/fetch.ts:146`. | The 61 `CustomFields` keys (7 NYC terminology matches) are not ingested at all — Domain "CustomFields lossless storage". |

## 2. The authorities now (extend, never fork — charter)

| Resource / purpose | Authority | Module | Consumers |
|---|---|---|---|
| Media (every query) | `MEDIA_SELECT_FIELDS` (13 fields = union of every interpreter read; `MediaType` excluded — file format, never consulted) | `lib/media/listing-media-resolver.ts` (the one media resolver, boundary) | fetch ×2, media lane, search hydration, media batch ×2, agent cards, building units, ghost reconciliation |
| OpenHouse | `OPEN_HOUSE_SELECT_FIELDS`; Property-in-OpenHouse `OPEN_HOUSE_PROPERTY_SELECT_FIELDS` (25, no agent identity — nothing renders `ListAgentFullName`); `OPEN_HOUSE_PUBLIC_FILTER` | `lib/open-houses/upcoming-open-houses.ts` (declared shared-scope module; now in the boundary) | open-houses route (5 sites), the module's own query, the public search facet (2 sites) |
| Property location facts | `CANONICAL_LOCATION_SELECT_FIELDS` | `lib/listings/canonical-location.ts` | suggest route (spread into its typed select) |
| Property sync / search / card | `IDX_PLUS_SELECT_FIELDS` (+7 fields), `SEARCH_SELECT_FIELDS`, `CARD_SELECT_FIELDS` | unchanged homes | unchanged |
| Route-local Property lists | contract-typed (`cotalityFields`), duplicates removed | buildings search, listings/building, feed-reconcile ghost lookup | — |

Ratchets: `tests/runtime/provider-select-authority.test.ts` (no literal multi-field `$select` in runtime code outside the held
sync module; the authorities are exported and consumed), `lib/media/__tests__/media-select-fields.test.ts`,
`lib/idx/__tests__/sync-select-covers-runtime.test.ts`, plus the existing Cotality boundary ratchet (497 keys, 0 new).

## 3. Held / not changed

- `lib/idx/sync.ts` keeps its three literal Media selects (charter: "Do not touch IDX sync without explicit
  authorization"). They are listed in the ratchet's held table; one of them (`backfillEmptyMedia`, documented as
  unreachable) omits `MediaKey`.
- `lib/buildings/public-building-data.ts` still ignores `PreferredPhotoYN` for the unit thumbnail (takes the first
  classified photo in provider order) — behaviour, not selection; Domain 7 (media).
- `lib/open-houses/upcoming-open-houses.ts` emits `addressKey` even when `InternetAddressDisplayYN` is false (the
  route gates it) — Domain 3 (visibility).
- The provider vocabulary members `NearSchools` / `SeniorCommunityYN` must never be rendered publicly (Fair Housing
  display rule) — Domain 3.

## 4. Checks

tsc 0 errors · boundary ratchet 497 keys / 0 new · select-authority ratchet green · 117 suites / 2,243 tests green on the
affected projects (media, idx, search, listings, runtime pins) · full-run tally in the commit message.
