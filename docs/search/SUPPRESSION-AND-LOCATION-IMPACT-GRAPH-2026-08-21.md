# Suppression & location — consumer impact graph

**The full consumer trace, produced before any reader is patched** — deliberately not
surface-by-surface as defects were found.

Every consumer below has been traced for ONE question: does it consult the suppression
authority? That axis is complete. A SECOND axis — what each currently returns in production
— needs Neon and is marked UNVERIFIED per row. Those are different claims and are not
merged. Production Neon was NOT queried —
the acceptance window is open — so every row marked UNVERIFIED stays unverified.

Two invariants under test:

1. **Suppression** — a verified Mallan-office Cotality representation must never produce a
   second listing identity or a second consumer result, anywhere.
2. **Location** — coordinates are map-rendering support, never a canonical listing fact,
   and must never be fabricated for a listing whose address may not be shown.

---

## A. THE HEADLINE DEFECT — suppression stops at the projection boundary

`lib/search/listing-access-decision.ts` exports two gates. Only one suppresses:

| gate | suppression | feeds |
|---|---|---|
| `buildSearchDisplayWhere` | **`AND: [excludeMallanRlsReturnCopies()]`** | the `Listing`-backed public read path |
| `buildProjectionSearchWhere` | **NONE** — returns `PROJECTION_DISPLAY_GATE` + status only | `criteriaToProjectionWhere` → `runProjectionListingSearch` → Saved Search count/execute → search-alerts cron |

So every consumer on the **projection** path can independently surface a Mallan-office
Cotality representation as its own listing. That is the concrete form of the concern that
suppression was built as *public* suppression: the authenticated and automated surfaces
inherited none of it.

This is a **contract defect, not a data defect**. Whether any of the two live
search-eligible representations currently appears in a Saved Search result is UNVERIFIED
and requires production Neon.

---

## B. CONSUMER MATRIX

`suppressed?` = does this consumer consult the suppression authority at all.
`local preferred?` = does it resolve to the canonical local twin when one exists.

| consumer | source | suppressed? | affects count/total? | local preferred? | unresolved-representation behaviour | duplicate risk | correction required |
|---|---|---|---|---|---|---|---|
| public listing detail `app/listing/[...slug]` | Listing | **yes** — `resolveReturnCopyCanonicalTarget` | n/a | yes → redirects to twin | fail-closed 404 | none | none |
| public suggest `/api/listings/suggest` | Listing | **yes** | yes | n/a | excluded | none | none |
| similar `/api/listings/similar` | Listing | **yes** | yes | n/a | excluded | none | none |
| agent listings `/api/agents/[slug]/listings` | Listing | **yes** | yes | n/a | excluded | none | none |
| sitemap `app/sitemap.ts` | Listing | **yes** | n/a | n/a | excluded | none | none |
| building data `lib/buildings/public-building-data.ts` | Listing | **yes** | yes | n/a | excluded | none | none |
| public `/api/listings` DB path | Listing via `buildSearchDisplayWhere` | **yes** | yes — before skip/take | n/a | excluded | none | none — public is zero-delta |
| **projection search** `lib/search/core.ts` | Projection | **NO** | **yes** | **no** | **surfaces independently** | **HIGH** | apply suppression at the projection gate |
| **Saved Search count** `/api/crm/saved-searches` | Projection | **NO** | **yes** | **no** | **counted** | **HIGH** | same one gate |
| **Saved Search execute** `/api/crm/saved-searches/[id]/execute` | Projection | **NO** | **yes** | **no** | **returned** | **HIGH** | same one gate |
| **alert replay** `/api/cron/search-alerts` | Projection | **NO** | **yes** | **no** | **emailed to a client** | **HIGH** | same one gate |
| CRM listings `/api/crm/listings` | Listing + participation scope | **NO** | yes | no | appears as a second row in the agent's own list | **HIGH** | canonical local listing only; provider IDs as evidence INSIDE it (§C) |
| CRM listing workspace | same reader | **NO** | n/a | no | second workspace possible | **HIGH** | one workspace = the local listing |
| CRM client assignment / actions | CRM listing reader | **NO** | n/a | no | actions attachable to the wrong identity | **HIGH** | follows the CRM reader fix |
| client portal `app/api/portal/*` (listings · comparables · favorites · offers) | 4 routes doing their own `prisma.listing.findMany` | **NO** | yes | no | client-visible duplicate | **HIGH** | route through the canonical gate |
| Compare `CompareProperties.tsx` | consumes selected result set | inherits caller | inherits | inherits | inherits | inherits | fixed by fixing the source |
| **CMA candidate generation** `lib/cma/engine.ts` | own `prisma.listing.findMany` | **NO** | yes | no | enters the comparable pool | **HIGH** | NOT a local patch — must consume the corrected Search foundation (§F) |
| CMA selected-comp analysis | downstream of candidates | inherits | inherits | inherits | inherits | inherits | follows candidate fix |
| CMA report | downstream of selection | inherits | inherits | inherits | inherits | inherits | follows candidate fix |
| Building Search (authenticated) | not yet built | n/a | n/a | n/a | n/a | n/a | must consult suppression by construction |
| Building profile inventory | `lib/buildings/public-building-data.ts` | **yes** | yes | n/a | excluded | none | none |
| Reports — selection/preview/customize `public/crm/js/output/reports.js` | derives from the shared Search result set (12 refs) | inherits caller | inherits | inherits | inherits | inherits | fixed by fixing Search |
| Reports — package `report-package.js` | no shared-result refs; own path | **UNTRACED SOURCE** | UNVERIFIED | UNVERIFIED | UNVERIFIED | needs trace | trace its listing source before report work |
| Report PDF / print / email / share | downstream of report selection | inherits | inherits | inherits | inherits | inherits | follows Reports fix |
| Seller report `lib/seller-report/build-report.ts` | no direct `prisma.listing` | n/a | n/a | n/a | n/a | none observed | confirm its input source during report work |
| marketing / eblast `listing-campaign.js` | no shared-result refs; own path | **UNTRACED SOURCE** | UNVERIFIED | UNVERIFIED | UNVERIFIED | needs trace | trace before marketing work |
| Open Houses `lib/open-houses/upcoming-open-houses.ts` | Listing, Mallan-office scoped | **NO** | yes | no | a representation's OH could surface | **MEDIUM** | trace, then apply the canonical gate |
| Media hero / gallery / floorplan / video / tours | `listing_media` joined by provider key | **NO** | n/a | **no** | parallel media authority | **HIGH** | identity resolves FIRST (§G) |
| results map (authenticated) | client, consumes result set | inherits caller | inherits | inherits | inherits | inherits | fixed by fixing its source |
| public search map | client, consumes DTO | inherits (suppressed upstream) | inherits | n/a | n/a | none | none — evidence only |
| SEO / schema / sitemap | Listing | **yes** | n/a | n/a | excluded | none | none |

Two rows remain **UNTRACED SOURCE** — `report-package.js` and `listing-campaign.js` obtain
listings by a path this pass did not establish. They are named rather than silently omitted,
and must be traced before Reports or marketing work begins. No reader is patched on the
strength of an untraced row.

**One gate fixes four rows.** Projection search, Saved Search count, Saved Search execute
and alert replay all pass through `buildProjectionSearchWhere`. That is the correction to
make — not four patches. It also honours "do not add another suppression implementation":
the authority already exists and simply is not called there.

---

## C. CRM — ALREADY DECIDED, NOT AN OPEN QUESTION

An earlier version of this section asked Maya to choose between two CRM behaviours. That
was wrong: the rule is already committed in `lib/listings/mallan-source-identity.ts`, which
states a Mallan-office Cotality representation may not independently participate as a
canonical listing in CRM, client portal, Reports, CMA, Open House, Media authority,
marketing or Search.

**Required CRM behaviour:**

| case | behaviour |
|---|---|
| matched representation | the canonical LOCAL Mallan listing is THE one listing and THE one workspace. Cotality IDs, status, permissions and timestamps may appear as PROVIDER EVIDENCE **inside** that canonical workspace |
| | never a second inventory row · never a second count · never independently editable · never an alternative canonical record |
| unresolved / ambiguous | representation stays suppressed · integrity defect raised · NO fallback provider listing or workspace |

"Provider evidence" means fields rendered within the canonical listing. It does **not**
mean a second listing row labelled "provider evidence", and no second provider-evidence
listing type is to be created.

## D. LOCATION FINDINGS

### D.1 Cotality DECLARES coordinates; their usable population is UNPROVEN

An earlier version of this section said "Cotality supplies no coordinates". **That was too
strong, and it was sourced from a repo comment** — the exact failure mode this workstream
keeps correcting elsewhere. No field is established from a document.

The accurate statement:

- Live authenticated Cotality **declares** `Property.Latitude` and `Property.Longitude` as
  nullable coordinate fields.
- What is **NOT proven** is their usable population in Mallan's current authorized feed.
- Existing Mallan code (`lib/geo/geocode.ts`) reports them commonly null and therefore
  falls back to the Census-backed map-resolution support.
- **Metadata declaration alone does not make provider coordinates usable**, and neither
  does a code comment make them absent.

**Added to the live census backlog:** measure `Latitude`/`Longitude` population across the
Search-eligible universe, exhaustively, before any reliance or dismissal.

Coordinates are populated today by the **US Census** geocoder via
`scripts/batch-geocode.js` into `geocode_cache` (`source=census`). Google was never
involved — an earlier draft invented it. No new location authority may be introduced.

### D.2 Two independent layers fabricate precise-looking positions

| layer | fallback | error |
|---|---|---|
| `lib/geo/geocode.ts` step 3 | ZIP centroid + deterministic hash jitter | up to ZIP-wide |
| `public/crm/js/render/results-map.js` | neighborhood centroid + spiral offset | several blocks |

Both produce a marker that *looks* like a building position. Required instead: resolved
address → exact pin; neighborhood only → explicitly neighborhood-level; unresolvable → **no
pin**. Never manufacture a nearby point so a marker appears.

Distinct from presentation: the public map's `0.00012°` separation of listings sharing one
coordinate is *stacking*, not location. For authenticated Search, prefer one exact building
position with grouping/stacking unless the design exploration proves otherwise.

### D.3 PUBLIC COMPLIANCE DEFECT — RECORDED, NOT PATCHED (public is zero-delta)

Verified by reading the committed code:

1. `dbListingToPublicDTO` emits `latitude`/`longitude` only when present, and the
   address-display gate suppresses street/unit.
2. **`postalCode` is emitted unconditionally** and survives suppression.
3. `/api/listings` calls `geocodeListings(publicListings)` **after** the DTO is built.
4. `geocodeListings` step 3 reads `addr.postalCode` and assigns
   `addr.latitude`/`addr.longitude` from a ZIP centroid + jitter.

So a listing whose address may not be displayed can **reacquire plottable coordinates after
the compliance gate**, and be mapped.

**Not fixed here** — public consumer Search is out of scope and held at zero-delta. Recorded
so it is not lost.

Required future proof: address display denied → complete `/api/listings` pipeline →
`latitude` absent → `longitude` absent → no map marker.

### D.4 Public Search confirms the architectural boundary

Its chain is `app/search/page.tsx → useListings → /api/listings → PublicListingDTO →
DisplayListing → SearchMap`: coordinates ride on the **display DTO** as map support, never
as Search criteria. The map is **display-driven** (criteria → results → map), not
viewport-driven. `/api/listings` does support geographic bounds, but the main public Search
UI does not send viewport bounds — so "search this map" does not exist today and must not be
assumed.

Used as evidence only. Authenticated Search must not depend on public Search code; both
should eventually consume the same canonical address/neighborhood/map-location contracts
without becoming one product.

---

## F. CMA DOES NOT GET A LOCAL FIX

`lib/cma/engine.ts` runs its own `prisma.listing.findMany`, so representations can enter
the comparable pool. Pasting a suppression clause into that query would make the symptom go
away and PRESERVE the actual defect — a second search engine.

CMA must consume the corrected foundation:

    ComparableCriteria -> corrected canonical Search/provider execution
                       -> eligible candidate universe
                       -> CMA-specific ranking and analysis

The suppression correction for CMA therefore happens during the CMA refactor, not now.

---

## G. MEDIA NEEDS IDENTITY RESOLUTION, NOT DELETION

The representation's Media rows are legitimate Cotality provider evidence and must be
retained. What they must never become is a second gallery, hero, floorplan, video or report
media source.

    Mallan local listing        -> canonical listing identity AND media authority
    matching representation     -> provider Media kept as evidence/reconciliation input
                                -> never an independent gallery/hero/report source

Listing identity resolves FIRST; media authority follows it. Provider Media
`ResourceRecordKey` stays in its proper Cotality `ListingKey` domain — identity is not
"fixed" by repointing Media at the Mallan local id. Trace the exact readers before altering
any media join.

---

## H. WHAT THIS GRAPH DOES NOT ESTABLISH

- Whether either live search-eligible representation has a proven local twin — needs
  production Neon.
- Whether Open Houses or Media currently surface a representation — needs a trace and, for
  counts, Neon.
- The neighborhood contract. The live Cotality geography study must map `SubdivisionName` /
  `CityRegion` / `MLSAreaMajor` / `MLSAreaMinor` / `PostalCity` onto **Mallan's existing**
  RLS neighborhood GeoJSON vocabulary, aliases and polygons. One canonical neighborhood for
  Sale, Rental, CMA, Building, Saved Search and the map — never a second taxonomy, and never
  `neighborhood = SubdivisionName` because the field exists.
