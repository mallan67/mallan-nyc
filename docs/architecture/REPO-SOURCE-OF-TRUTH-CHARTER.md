# Repo Source-of-Truth Charter

**Version:** 1.0 · **Created:** 2026-05-01 · **Status:** ACTIVE — mandatory

This charter is the architecture rulebook for mallan-nyc. **Every AI/Codex/Claude session and every human contributor must read this before creating, renaming, moving, or editing files in any of the domains it covers** (Public Search, CRM Search, Featured/Exclusives, Neighborhoods, Media, IDX/Trestle).

The repo has accumulated multiple files with similar names. AI tools have repeatedly invented new files (`search-v2.ts`, `featured-new.tsx`, `location-stuff.json`, `crm-search-final.js`) instead of using the correct existing source files. The charter exists to make those mistakes detectable and refusable.

If you are unsure which system a file belongs to: **stop and ask. Do not create a parallel system.**

---

## Section 1 — Absolute rules

These rules apply to every commit. Violations should fail review.

1. **Do not create new files** in search / CRM / listings / media / neighborhoods / featured / exclusives unless this charter explicitly maps the new file path or you have written approval.
2. **Do not create version-suffixed names** — no `search-v2`, `crm-search-new`, `featured-new`, `location-v2`, `neighborhood-v2`, `media-helper-new`, `listings-final`, `idx-search-final`. If a name has been used once, use it; do not duplicate it under a new name.
3. **Do not abbreviate product names inconsistently.** Use exact term lists from Section 2.
4. **Do not rename files casually.** Renames are a separate, scoped commit with explicit reason in the commit body and a sweep of every importer.
5. **Do not edit generated files directly.** Generated files are listed in Section 9. Edit the source, run the build, commit both.
6. **Do not create parallel systems.** If a system exists, extend it. If extension is hard, raise the design question — do not silently fork.
7. **If the right file is unclear, stop.** Report the uncertainty, list the candidates, and wait for direction. Do not guess.
8. **No one-line "fix" guesses for layout/data bugs.** Identify the actual layer first; cite the file:line.
9. **The Mallan LOCAL listing is canonical.** See Section 1A. This OVERRIDES any
   older document, comment or test saying an RLS/Cotality copy should replace,
   withdraw or supersede a local `SL-*` / `RL-*` listing.

---

## Section 1A — Mallan listing architecture (MANDATORY — read before any listing work)

> **Maya's standing architecture.** OVERRIDES any prior instruction or repo
> document stating that an RLS/Cotality copy should replace the local Mallan
> listing. Documents still describing the old model are SUPERSEDED, not
> authoritative.

### Direction of data

```
Mallan forms -> Mallan backend/Neon -> Mallan CRM + public website   LOCAL, canonical

Mallan information -> the legacy upstream intermediary -> REBNY RLS          OUTSIDE THIS SYSTEM, MANUAL
REBNY RLS -> Cotality/Trestle -> IDX Plus API -> Mallan ingestion    INBOUND, read-only
```

Mallan **creates and amends its listings locally** and **never writes back** to
Cotality/Trestle/RLS. The the legacy upstream intermediary / RLS submission happens outside this
application and is **not** automated here.

Wording matters: a Mallan listing is **not** "submitted to REBNY RLS via
Cotality". It is submitted separately through the legacy upstream intermediary / RLS and **returns
downstream** to Mallan through Cotality.

### When Mallan's own listing returns through Cotality

It reappears as an `RLS*` row — the **Mallan RLS return-copy**.

| Row | Status |
|---|---|
| Local `SL-*` / `RL-*` | **CANONICAL** — public listing, canonical URL, Featured, agent page, CRM editing, media, open houses, seller report |
| Mallan RLS return-copy | **SUPPRESSED on every public surface.** Retained internally for audit, reconciliation, source comparison, feed monitoring, compliance |

**DO NOT** withdraw an `SL-*`/`RL-*` because the RLS copy arrived. **DO NOT** pin
the RLS copy in Featured, switch the public URL to it, or move CRM editing /
open-house management onto it. **DO NOT** delete the returned RLS row — it is
stored source evidence.

A returned twin must **never** make the local row read-only. Local PATCH, local
CRM media, local open houses and local publication keep working, and Cotality
sync must not erase them.

### Three ownership concepts — never conflate

1. **`isMallanExclusiveListing()`** — Mallan-AUTHORED local listing (`SL-`/`RL-`
   prefix OR `rls_eligible === false`). Governs **data/media authority**. Do NOT
   broaden it to include the RLS return-copy.
2. **Mallan RLS return-copy** — a Cotality row whose VERIFIED LIST-SIDE identity
   is Mallan. Still **Cotality-source-owned**: its media stays Cotality-owned and
   must never be cloned into the `crm:` namespace. It is only barred from being
   the public canonical listing.
3. **Third-party RLS/IDX** — normal IDX inventory, unchanged.

Identity for (2) must come from a verified list-side source field
(`listing.list_office_mls_id` / `Property.ListOfficeMlsId`). **NEVER** infer it
from `agent_id` or free-text brokerage-name matching. Co-list identity is a
separate question and does not by itself establish primary list-side authority.

### `agent_id` is NOT ownership

`syncAgentHistory` assigns `Listing.agent_id` on matches against **both**
`ListAgentMlsId` and `BuyerAgentMlsId` — a CRM **history/roster association**,
not ownership or write authority.

- Local `SL-`/`RL-` row: `agent_id` MAY be a legitimate assigned-agent relation,
  because the local creation/assignment path owns it.
- Any synced RLS row: `agent_id` grants **history visibility only** — never
  listing mutation, status mutation, media ownership, seller-report authority or
  public-open-house management.

Keep legitimate history reads and private client-showing workflows working. A
private showing is NOT a Mallan public open house.

### Open houses

Mallan must create and amend a public open house **locally**, without first
entering it into RLS. A Cotality `OpenHouse` record for the returned twin is at
most an additional upstream source — never a precondition.

### Public suppression is system-wide

Suppression must happen in the canonical public access query/decision **BEFORE
pagination and counting**, so a local row on one page and its twin on another
cannot leak the twin. `count` / `total` / `skip` / `limit` / `hasMore` must all
describe the POST-suppression public set.

Applies to `/api/listings`, `/api/listings/suggest`, listing detail,
`/api/agents/[slug]/listings`, Featured, Exclusives, similar listings, building
listings/units, sitemap, canonical/SEO URLs, open-house surfaces, campaigns and
listing-send public URLs, reports exposing public listing links, and any
live-Trestle public fallback.

`preferCrmExclusiveOverIdxDuplicate()` (`lib/listings/dedupe-crm-vs-idx.ts`) is
the correct existing direction — keep local, suppress the IDX twin, delete
nothing — and remains a valid second defense, but must NOT be the only thing
preventing a return-copy from surfacing.

### Forbidden

No legacy upstream intermediary API integration. No automated RLS submission. No Cotality
write-back. Any UI implying direct submission to Cotality/RLS is misleading and
must be corrected.

---

## Section 2 — Naming rules

Use these exact terms in code, comments, commit messages, and documentation:

| Canonical term | Use for |
|---|---|
| **Public Search** | The user-facing search at `/search` (public website, DB-backed) |
| **CRM Search** | The agent-facing search at `/crm/search` (Trestle-live, auth-required) |
| **Featured Properties** | Broker-curated merchandising shown on the public homepage |
| **Exclusives** | Listings the broker has explicitly marked or pinned via the FeaturedConfig system |
| **Neighborhoods** | NYC neighborhood data — names, slugs, ZIPs, boroughs |
| **Buildings** | Trestle building-key aggregation (Trestle 6.17) |
| **CMA** | Comparative market analysis / comps |
| **Media Resolver** | The shared photo-first ordering helper at `lib/media/listing-media-resolver.ts` |
| **Listing DTO** | The public-safe output of `lib/idx/public-dto.ts` |
| **FeaturedConfig** | The Prisma model that stores broker-pinned IDs + filters |
| **FeaturedCollection** | DOES NOT EXIST. Do not create unless an approved schema migration adds it. |

**Forbidden names** — never create files using these (incomplete list):

- `search-v2.ts`, `search-new.ts`, `search-final.ts`
- `featured-new.tsx`, `featured-v2.tsx`, `featured-collections.tsx` (until schema approved)
- `idx-search-new.ts`, `idx-search-final.ts`
- `location-stuff.json`, `neighborhood-temp.json`, `neighborhoods-v2.json`
- `media-helper-new.ts`, `media-resolver-v2.ts`
- `listings-new.tsx`, `listings-final.tsx`

If you find a real reason to introduce a new name, follow Section 11 first.

---

## Section 3 — Public Website (mallan.nyc) Source-of-Truth

| Layer | Canonical file | Notes |
|---|---|---|
| Public sale/rent search frontend | `app/search/page.tsx` | Single page handles `tab=buy-residential`, `rent-residential`, `buy-commercial`, `rent-commercial`. Switches via URL param. |
| Public search cards | `app/components/SearchListingCard.tsx` | Exports `GridCard`, `SplitCard`, `ListCard` (3 view modes). |
| Public listing image wrapper | `app/components/IDXImage.tsx` | Native `<img>` (not Next.js Image, avoids Vercel optimization charges). Aspect ratios live here. |
| Public listing detail gallery | `app/components/ListingMediaGallery.tsx` | Hero gallery on `/listing/[id]`. |
| Public homepage search widget | `app/components/HeroSearch.tsx` | Hero search input. |
| Public filter modal | `app/components/SearchFilterPanel.tsx` | "Filters" button modal. |
| Public autocomplete | `app/components/SearchAutocomplete.tsx` | Address/neighborhood autocomplete. |
| Public map | `app/components/SearchMap.tsx` | Leaflet map markers. |
| Public neighborhood selector | `app/components/NeighborhoodSelector.tsx` | Multi-select neighborhood picker. |
| Public featured listings component | `app/components/FeaturedListings.tsx` | Homepage Featured section. |
| Public listings API | `app/api/listings/route.ts` | `GET /api/listings` (DB-backed, rate-limited). |
| Public listing detail API | `app/api/listings/[id]/route.ts` | `GET /api/listings/[id]`. |
| Public autocomplete API | `app/api/listings/suggest/route.ts` | Autocomplete suggestions. |
| Public similar/comps API | `app/api/listings/similar/route.ts` | Comps by neighborhood + property type. |
| Public building agg API | `app/api/listings/building/route.ts` | Trestle 6.17 building grouping. |
| Public DTO | `lib/idx/public-dto.ts` | `IDXListing → PublicListingDTO`. Strips PII, suppresses address per gates. |
| DB → public DTO | `lib/idx/db-to-public-dto.ts` | DB row → public DTO. |
| Public search query builder | `lib/search/listing-search-projection.ts` | Public DB SELECT + post-filters. |
| URL params → Prisma | `lib/search/criteria-to-prisma.ts` | URL → WHERE clause. |
| Search orchestrator | `lib/search/core.ts` | `runProjectionListingSearch()` — the projection-backed traversal. (`runListingSearch()`, the Listing-table-backed original, was deleted 2026-08-13: PR 5D/5E migrated both real callers and it had zero call sites left.) |

**Listing-search file family** (each has a distinct, non-duplicate role):
- `lib/search/types.ts` — `SearchTab`, `ViewMode`, `SearchFilters`, `AmenityFilter`
- `lib/search/criteria-to-prisma.ts` — URL → Prisma WHERE
- `lib/search/listing-search-projection.ts` — DB SELECT shape + amenity filtering
- `lib/search/public-listing-db.ts` — DB-side post-filters (zip, amenity narrowing)
- `lib/search/public-listing-trestle.ts` — Trestle OData `$filter` builder
- `lib/search/listing-access-decision.ts` — Gate decisions for per-listing access
- `lib/search/natural-language-parser.ts` — Parses "2 bed UES" → filters
- `lib/search/core.ts` — Orchestrator

These are NOT duplicates. They are layers of the same pipeline. **Do not consolidate without a written design + approval.**

---

## Section 4 — CRM Search Source-of-Truth

The CRM search is a **separate** pipeline from public search. Different shell, different API, different mapper, different gates option.

| Layer | Canonical file | Notes |
|---|---|---|
| CRM search URL | `/crm/search` | Vercel rewrite |
| URL rewrite | `vercel.json` line `{ "source": "/crm/search", "destination": "/crm/index-built.html" }` | Do not change without coordinating with build pipeline. |
| **Runtime shell** (generated) | `public/crm/index-built.html` | **GENERATED. DO NOT HAND-EDIT.** |
| Source shell template | `public/crm/index.html` | 180-line orchestrator with `@include` + `<script src=...>` directives |
| Build script | `public/crm/build.js` | Inlines all CSS, HTML partials, JS into the runtime shell |
| Build automation | `package.json` scripts: `crm:build`, `crm:check-build` + `.github/workflows/guardrails.yml` runs the drift guard | Drift guard fails CI if shell out of sync with sources |
| CRM search frontend module | `public/crm/js/search/search-engine.js` | Search criteria builder, calls `MallanAPI.idx.search()` |
| CRM search actions | `public/crm/js/search/search-actions.js` | Save/delete search actions |
| CRM filter modal | `public/crm/js/search/filter-modal.js` | Advanced filter modal |
| CRM neighborhood autocomplete | `public/crm/js/search/neighborhood-autocomplete.js` | Inside CRM search |
| CRM saved searches | `public/crm/js/search/saved-searches.js` | "My Saved Searches" UI |
| CRM gallery render | `public/crm/js/render/render-gallery.js` | Card photo rendering |
| CRM photo loader | `public/crm/js/render/photo-loader.js` | IntersectionObserver lazy-load via `/api/media/batch` |
| CRM detail render | `public/crm/js/render/render-master-detail.js` | Detail panel rendering |
| CRM grid render | `public/crm/js/render/render-grid.js` | Grid view rendering |
| CRM map | `public/crm/js/render/results-map.js` | Map markers in CRM |
| CRM API client | `public/crm/js/core/api-client.js` | All MallanAPI.* methods |
| CRM placeholder SVG | `public/crm/js/core/reso-field-map.js:173` | "No Photo Available" SVG data URI |
| CRM search backend | `app/api/idx/search/route.ts` | `GET /api/idx/search` — Trestle-live, broker auth |
| CRM filter builder | `lib/search/crm-idx-filter.ts` | Trestle OData filter from URL params |
| CRM mapper | `lib/search/crm-idx-mapper.ts` | Trestle record → CRM flat shape |
| CRM gates | `lib/compliance/gates.ts` | The 6 distribution gates (`evaluateDisplayGate`, `checkDistributionGates`) |
| Trestle HTTP client | `lib/idx/fetch.ts` | Pulls from Cotality/Trestle API |
| Trestle OAuth | `lib/idx/auth.ts` | Bearer token refresh, 8h TTL |
| CRM media batch endpoint | `app/api/media/batch/route.ts` | Bulk photo backfill (auth-gated) |
| Trestle field arrays + mapper | `lib/idx/trestle-mapper.ts` | `ALL_RLS_FIELDS`, `RESO_TO_RLS_RENAMES`, `mapTrestleToPrisma`, `checkDistributionGates` wrapper |

**Hard rule:** never hand-edit `public/crm/index-built.html`. Edit source files (`public/crm/{index.html, html/, css/, js/}`) and run `npm run crm:build`. CI will run `crm:check-build` and fail if the bundle drifts.

---

## Section 5 — Featured / Exclusives Source-of-Truth

| Layer | Canonical file | Notes |
|---|---|---|
| Broker control panel | `public/crm/js/dashboard/panels.js` lines ~6266-6470 | "Featured Properties" + "Our Exclusives" section. Pin/unpin, 11 presets, fine-tune. |
| CRM dashboard shell | `public/crm/dashboard.html` | Hosts the panel. |
| Featured config GET API | `app/api/featured-config/route.ts` (GET) | Public, 5-min cache, returns config object |
| Featured config PATCH API | `app/api/featured-config/route.ts` (PATCH) | Broker-only, upserts FeaturedConfig row |
| Featured config Prisma model | `prisma/schema.prisma` `FeaturedConfig` (~line 1880) | `pinned_ids[]`, `filters{}`, `sort`, `display_limit`, `is_active`, `updated_by` |
| Featured config defaults | `data/featured-config.json` | Static fallback if DB lookup fails. Read-only file. |
| Public homepage component | `app/components/FeaturedListings.tsx` | Reads `/api/featured-config`, queries `/api/listings` with broker-set filters, applies pins |
| Homepage embed | `app/page.tsx` | `<FeaturedListings />` |
| `/exclusives` redirect | `vercel.json` `{ "source": "/exclusives", "destination": "/buy?exclusive=mallan" }` | Currently points at a URL whose filter is **not implemented** (known bug — see Section 12) |

**Rules:**

1. Featured Properties means **broker-curated merchandising**, not "all of Trestle filtered by something."
2. Exclusives means **listings the broker has marked exclusive**, not "anything Trestle returned."
3. `/buy?exclusive=mallan` must NOT silently return the full feed. The filter must be implemented or the redirect changed.
4. The DTO must NOT default `listOfficeName` to `"Mallan Real Estate Inc."` when Trestle's office field is missing — that creates false attribution and is a UCBA Art. III §2(C) compliance concern.
5. Do **not** create `FeaturedPropertiesV2`, `FeaturedCollection`, `MerchandisingConfig`, or any new merchandising model unless a written design + schema migration has been approved.
6. Use the existing `FeaturedConfig` model. Until a future approved migration adds collections, multiple "boards" are not a thing.

---

## Section 6 — Neighborhoods / Locations Source-of-Truth

| Layer | Canonical file | Notes |
|---|---|---|
| De-facto public loader | `lib/neighborhoods/boroughs.ts` | `loadNeighborhoods(slug)`, `findNeighborhoodBySlug()`, `BOROUGH_CONFIGS`, `getAllNeighborhoods()` |
| Manhattan data | `data/manhattan-neighborhoods.json` (312 KB) | Per-neighborhood: slug, name, zipCodes, market stats, FAQs, transit, boundaries |
| Brooklyn data | `data/brooklyn-neighborhoods.json` (107 KB) | Same shape |
| Queens data | `data/queens-neighborhoods.json` (75 KB) | Same shape |
| Bronx data | `data/bronx-neighborhoods.json` (54 KB) | Same shape |
| Staten Island data | `data/staten-island-neighborhoods.json` (43 KB) | Same shape |
| ZIP → neighborhood (TS) | `lib/geo/nyc-zip-neighborhoods.ts` (777 lines, 220+ ZIPs) | Used by listings filter |
| ZIP filter helper | `lib/geo/neighborhood-zips.ts` | `lookupNeighborhoodZips()` — used by `/api/listings/route.ts:37` |
| Geocoding fallback | `lib/geo/geocode.ts` | ZIP centroid for null Trestle lat/lng |
| CRM Trestle alias map | `public/geo/neighborhood-aliases.json` (24 KB) | Inlined into CRM search shell. SubdivisionName variant → canonical name. |
| RLS Trestle neighborhood values | `data/rls/neighborhoods.v1.json` (99 KB) | 4,744 lines. Referenced by CRM frontend modules. |
| Public selector | `app/components/NeighborhoodSelector.tsx` | Manhattan hardcoded inline (`MANHATTAN_GROUPS`); other boroughs via `loadNeighborhoods(slug)` |
| Legacy / dead | `data/neighborhoods.json` (header says "DO NOT USE") | **Header is misleading — file IS imported by `lib/neighborhoods/boroughs.ts` and `lib/geo/neighborhood-zips.ts`. PROTECTED.** Do not archive. |
| Template residue | `src/data/geography/neighborhoods.json`, `boroughs.json` | Next.js template residue. Verify before touching. |
| Map polygons | `public/geo/rls-neighborhoods.v1.min.geojson` (40 KB), `rls-neighborhood-centroids.v1.json` (7.5 KB) | Public assets, fetched by CRM map renderers. PROTECTED. |

**Rules:**

1. **Do not create another neighborhood list.** There are already 10+ files that touch neighborhood data; the right answer is to consolidate (per the deferred design at `lib/locations/neighborhood-registry.ts`), not to add an 11th.
2. **Do not create `location-v2/`, `neighborhood-v2/`, `neighborhood-registry.ts`** without an approved design spec. The canonical registry shape is documented in the architecture audit but **not yet implemented**.
3. The existing fragmentation is a known issue. Until approved, use the existing files and document which one your change touches in the commit body.
4. `lib/geo/` is the working location for geo helpers. `lib/locations/` does NOT exist yet and must not be created without the canonical-registry design.

---

## Section 7 — Media Source-of-Truth

| Layer | Canonical file | Notes |
|---|---|---|
| **Shared resolver** (single source of truth for ordering) | `lib/media/listing-media-resolver.ts` | `classifyMediaItem`, `resolveListingMedia`, `pickPrimaryPhotoUrl`, `pickBestThumbnailUrl`, `proxyTrestleUrl` |
| Media sync service | `lib/media/media-sync-service.ts` | R2 cache + Trestle proxy management. Used by cron + ingest. |
| R2 client | `lib/media/r2-client.ts` | Cloudflare R2 SDK wrapper |
| Cache helper | `lib/images/cache-listing-photos.ts` | (separate folder; pre-existing) |
| R2 wrapper | `lib/images/r2.ts` | (separate folder; pre-existing) |
| Media batch API | `app/api/media/batch/route.ts` | Auth-gated. Detail mode uses resolver post-fetch. |
| Media proxy API | `app/api/media/proxy/route.ts` | Server-side Bearer auth fallback. Allowlists `cotality.com` + legacy CoreLogic hosts. |
| Public IDX image wrapper | `app/components/IDXImage.tsx` | Native `<img>` with aspect-ratio container |
| Public listing gallery | `app/components/ListingMediaGallery.tsx` | Detail-page hero gallery |
| CRM photo loader | `public/crm/js/render/photo-loader.js` | Lazy-load via batch API |
| CRM placeholder | `public/crm/js/core/reso-field-map.js:173` | SVG data URI |

**Rules:**

1. **Use `lib/media/listing-media-resolver.ts` for primary-image logic.** It encodes the ordering rule: photos before floor plans before videos before virtual tours. Use `pickPrimaryPhotoUrl()` for surfaces that should fall back to a placeholder when no photo exists. Use `pickBestThumbnailUrl()` for surfaces that should fall back to a floor plan.
2. **Do not create another media helper.** There is one resolver. Extend it.
3. **Photos before floor plans.** Floor plans appear ONLY if no real photo exists for that listing.
4. **Do not rewrite public media URLs** unless PR 4 is explicitly authorized. PR 4 is currently blocked.
5. The `lib/images/` folder pre-dates `lib/media/`. Do not move files between them without a coordinated rename PR.

---

## Section 8 — IDX / Trestle / REBNY Source-of-Truth

The data flow has three distinct layers. Conflating them is how compliance bugs creep in.

| Layer | What it is |
|---|---|
| **REBNY** | The MLS/RLS organization, data owner, and policy layer. Sets distribution rules (UCBA, IDX Plus pre-filter convention, attribution requirements). |
| **Cotality / Trestle** | The API platform that implements + serves the data. Bearer auth, OData, Media expansion. |
| **RESO** | The certification / data-standard framework. Defines field names, DD versions, the Property entity type. |

**Source-of-truth files:**

| Layer | Canonical file | Notes |
|---|---|---|
| Trestle field arrays | `lib/idx/trestle-mapper.ts` exports `ALL_RLS_FIELDS`, `RESO_TO_RLS_RENAMES`, `IDX_PLUS_SELECT_FIELDS`, `REQUIRED_RLS_FIELDS` | Single source of truth for field names |
| Trestle → Prisma mapper | `lib/idx/trestle-mapper.ts` `mapTrestleToPrisma()` | Writer-side: Trestle → DB |
| Distribution gate wrapper (Trestle records) | `lib/idx/trestle-mapper.ts` `checkDistributionGates()` | Passes `idxPlusPreFiltered: true` to evaluateDisplayGate |
| IDX sync orchestrator | `lib/idx/sync.ts` | Cron-run sync. **Do not touch IDX sync without explicit authorization.** |
| Trestle HTTP fetch | `lib/idx/fetch.ts` | OData query builder, $expand=Media handling |
| Trestle auth | `lib/idx/auth.ts` | OAuth client-credentials, 8h token TTL, 5-min refresh buffer |
| Card-fields select | `lib/idx/card-fields.ts` | Includes PhotosChangeTimestamp |
| Distribution gates (reader) | `lib/compliance/gates.ts` | `evaluateDisplayGate`, `isInternetEntireListingDisplayable`, `isAddressDisplayable`. Has `idxPlusPreFiltered` option for Trestle-live records. |
| Compliance status | `lib/compliance/status.ts` | RESO status normalization |
| RLS validator | `lib/compliance/rebny-validator.ts` | 10-section validator (CI-gateable) |
| Field tables | `lib/compliance/rebny-field-tables.ts` | Authority table for required fields |
| Compliance DTO sanitizer | `lib/compliance/dto.ts` | Public/portal/CRM tier sanitizer |
| RLS field CSV | `data/rebny-rls-property-fields.csv` | 902+ REBNY IDX Plus fields. Replaced 2026-03-19. |
| RLS lookup CSV | `data/rebny-rls-property-lookup.csv` | 2,066+ picklist values |
| RLS field registry doc | `data/RLS-FIELD-REGISTRY.md` | Human-readable registry |
| UCBA rules | `data/UCBA-2026-Requirements.md` | Extracted from PDF |
| Trestle metadata snapshot | `artifacts/metadata.xml` | Full Trestle OData metadata |

**Rules:**

1. **REBNY ≠ Trestle ≠ RESO.** When writing comments or commit messages, name the layer being affected.
2. **Runtime payload behavior must be verified per feed.** Do not assume generic RESO behavior equals this REBNY IDX Plus feed. Example: REBNY pre-filters non-displayable rows out of IDX Plus, leaving `InternetEntireListingDisplayYN` null on survivors. Other Cotality/Trestle deployments serving non-REBNY MLSes do not necessarily share that convention.
3. **AVM and ConsumerComment are per-row opt-out flags** populated at the row level (~97% true / ~3% false). They are NOT pre-filtered. They remain fail-closed.
4. **`InternetEntireListingDisplayYN` and `InternetAddressDisplayYN` are pre-filtered.** Null = displayable on this feed. Explicit false still blocks.
5. Compliance changes must run `npm run ucba:audit`, `npm run rls:validate`, `npm run idx:validate`, and `npm run compliance-check`. All must pass.
6. **Do not touch `lib/idx/sync.ts`** without explicit authorization. It is the writer; bugs here corrupt DB rows.

---

## Section 9 — Generated-file rules

The following files are **generated**. Do not hand-edit:

| File | Generated by | When |
|---|---|---|
| `public/crm/index-built.html` | `node public/crm/build.js` | After any change to `public/crm/{index.html, html/, css/, js/}`. CI fails if drifted. |
| `public/crm/data/validator-results.json` | `npm run idx:validate` | Daily / on demand. Consumed by CRM System Health dashboard. |
| `.idx-validate/run-history.local.json` | `npm run idx:validate` | Validator run history (local-only, gitignored). |
| `data/MASTER_REGISTRY.json` | `node scripts/generate-master-registry.js` | When schema/CSV changes. |
| `data/FIELD_REGISTRY.json` | (generator script in scripts/) | When schema/CSV changes. |
| `artifacts/reso-drift/latest.json` | `npm run reso:drift` | Regularly. |
| `artifacts/schema-audit.json` | `npm run reso:schema-audit` | On demand. |

**Rules:**

1. Edit the source. Run the generator. Commit both as one logical commit.
2. If a generated file changes when you didn't intend to regenerate it, **stop and investigate** — your edit may have inadvertently affected the source.
3. CI guards: `crm:check-build` runs in `.github/workflows/guardrails.yml`. PR fails if `index-built.html` doesn't match what `build.js` would produce from current sources.

---

## Section 10 — Cleanup / Archive rules

Before any cleanup PR moves a file to `archive/`, every candidate must carry six classifications:

| Field | Values |
|---|---|
| `FRONTEND_CONNECTED` | yes / no / unknown |
| `PUBLIC_FRONTEND_CONNECTED` | yes / no / unknown |
| `CRM_FRONTEND_CONNECTED` | yes / no / unknown |
| `API_CONNECTED` | yes / no / unknown |
| `GENERATED` | yes / no |
| `SAFE_TO_ARCHIVE_NOW` | yes / no |

**Hard rule:** if any of the first four answers is `unknown`, the file is **NOT safe to archive**. Classify as `UNKNOWN_NEEDS_REVIEW` and keep the file in place.

**Cleanup priority order:**

1. Files connected to public frontend → keep
2. Files connected to CRM frontend → keep
3. Files connected to any API or cron → keep
4. Files that are data sources for dropdowns, filters, neighborhoods, maps, or CRM search → keep
5. Files where usage is unknown → keep, mark `UNKNOWN_NEEDS_REVIEW`
6. Only files with **zero** imports, **zero** rewrite usage, **zero** frontend references, **zero** API references, and **no** credential/security risk are archive candidates.

The only files that have currently passed all six checks are documented in the cleanup audit at `memory/CLEANUP-AUDIT-2026-05-01.md` (when present).

---

## Section 11 — Required preflight before creating any new file

Before creating any new file in search / CRM / listings / media / neighborhoods / featured / exclusives:

1. **Search for the existing owner file.**
   - `Glob` the relevant subtree.
   - `Grep` for keywords related to your concern.
   - Check this charter (Sections 3-8).
2. **Read the existing owner file.**
   - Confirm it cannot be extended to cover your case.
3. **State the rationale in writing.**
   - Either in the commit body or in a design doc at `docs/superpowers/specs/`.
   - Include why the existing file cannot be used.
4. **Get approval for the new file name and path.**
   - From the user, or via an existing approved spec/plan.
5. **Use a name from Section 2's canonical-term list.**
   - No version suffixes. No abbreviations.

If you cannot complete steps 1-3 with confidence, **stop and ask**.

---

## Section 12 — PR priority rules

These rules apply to active incident triage. Do not bundle unrelated cleanup with incident fixes.

1. **Search must work before redesign.** Public search must return correct results, and CRM search must return correct results, before any UI redesign or new view modes.
2. **Media primary-image selection must work before PR 4.** PR 4 is the master-plan media batch rewrite; rewriting URLs while primary-image selection is wrong propagates the wrong photos. Resolver landed in `9bf04448` (2026-05-01).
3. **PR 4 remains BLOCKED** unless explicitly released. Master plan PR 4 (Media batch rewrite) is held behind Media PR 3 observation window.
4. **Featured / Exclusives false attribution must be fixed before building new merchandising features.** The default of `listOfficeName: 'Mallan Real Estate Inc.'` for missing Trestle office (currently in `lib/idx/db-to-public-dto.ts:315`) is a UCBA Art. III §2(C) attribution problem and must be addressed before the system gets layered on with new collections / boards.
5. **`/buy?exclusive=mallan` must filter for real,** not silently return the full feed. Implementation candidates:
   - **Option A (DB-backed):** Filter by `listing.list_office_name === 'Mallan Real Estate Inc.'` (literal Trestle office name).
   - **Option B (FeaturedConfig-backed):** Filter by `listing.id IN (FeaturedConfig.pinnedListingIds)` so the URL maps directly to the broker-pinned set.
   - Either is valid. Option B aligns with broker control.
6. **Do not bundle unrelated cleanup with incident fixes.** Cleanup commits are separate, classified per Section 10.

**Active incident order (2026-05-01, may change):**

1. Public card-layout fix (sizing inconsistency on `/search` split view)
2. Restore broker-controlled Featured/Exclusives filter (`exclusive=mallan` + `listOfficeName` default)
3. Verify CRM Featured panel pin/save reaches DB (`pinnedListingIds: []` is suspicious)
4. CRM `/crm/search` 0-results triage (telemetry deployed in `7595f16c`; awaiting authenticated probe)
5. Long-term Featured Collections Manager (deferred until 1-4 settle and a design spec is approved)
6. PR 4 (still blocked)
7. Cleanup / archive (only files with all six checks green; deferred until incident work completes)

---

## Section 13 — Final AI instruction

If you are an AI/Codex/Claude session reading this charter:

1. **You must read this charter** before editing any file in the domains it covers (Sections 3-8).
2. **You must not invent new file names** in those domains. Use the canonical paths.
3. **You must not create parallel systems.** If a system exists, extend it.
4. **You must not edit generated files directly.** Section 9 lists them.
5. **You must not bypass cleanup classification.** Section 10 is mandatory.
6. **If a file's role is unclear, stop and report.** Do not guess. Do not pick a name to "make progress."
7. **Cite this charter** in commit bodies when your change touches Sections 3-8 boundaries.
8. **Update this charter** (and bump the version) when a new canonical file is approved into a domain.

---

## Appendix — Companion files

| File | Purpose |
|---|---|
| `CLAUDE.md` (top of repo) | Per-session AI rules. Points here at the top. |
| `NEON.md` (top of repo) | DB / Prisma / migration discipline. Read before any schema change. |
| `MASTER-PROJECT-TREE-v3.3.md` | Codebase reference. Larger and older than this charter; treat as background context, not authoritative. |
| `data/RLS-FIELD-REGISTRY.md` | Trestle field registry. Authoritative for field names. |
| `data/UCBA-2026-Requirements.md` | UCBA rules. Authoritative for compliance. |
| `.claude/skills/rebny-compliance/SKILL.md` | REBNY compliance gate. Read at session start. |

---

**End of charter. Update version + date at top when amending.**
