# P0 — Open House + Media: proven defects, root causes, impact graph

**Date:** 2026-09-01
**Branch:** `fix/neon-p0-event-driven-wake-2026-08-16`
**Head when this audit began:** `50f848e9`
**Production main at the time of Maya's acceptance test:** `2a83952a`
**Status:** EVIDENCE + IMPACT GRAPH. Corrections tracked separately below.

This document exists because Search passed its internal guards and still failed a
broker using it. Two defects were found by use, not by test.

---

## Evidence classes — kept separate, never conflated

- **A. LIVE PROVIDER METADATA** — field existence and type only.
- **B. LIVE ROW / POPULATION** — what the provider actually returned, on dated rows.
- **C. LIVE OPERATOR / FILTER** — which queries the provider accepted or rejected.
- **D. MALLAN STATIC CODE TRACE** — read from the repo at the head above. No
  Production Neon probe was run. No schema, migration, or environment change.

Raw capture: `artifacts/p0-search-acceptance/identity-probes.json` (19 probes),
produced by `scripts/cotality/probe-media-and-openhouse-identity.mjs`.

---

## DEFECT 1 — Open House Search is disabled in the broker UI

### The symptom (broker-visible)

Sale and Rental both disable **Today · This Weekend · Next 7 Days · Next 30 Days ·
Custom Date Range** with the message:

> "Open House date range not supported by the search backend."

### Root cause (D)

The message is literally true, and that is the defect.

```
public/crm/js/init/init-disable-dead-controls.js:248-254   the disablement
app/api/idx/search/route.ts                                ZERO OpenHouse code
lib/search/crm-idx-filter.ts                               ZERO OpenHouse code
```

The authenticated broker Search never implemented Open House at all. It was
disabled in the UI rather than built. `FIELD_REGISTRY.open_house` recording
`filterable: 'needs_probe'` is the same gap written down.

### The provider does support it — proven (B + C)

| probe | resource | result |
|---|---|---|
| OpenHouse shape | `OpenHouse` | HTTP 200, `@odata.count` **1993** |
| `OpenHouseDate ge <today> and le <+30d>` | `OpenHouse` | HTTP 200, count **1970** |
| same + `OpenHouseStatus eq 'Active'` | `OpenHouse` | HTTP 200, count **1970** |
| `$orderby OpenHouseDate asc` | `OpenHouse` | HTTP 200, 3 rows |

Fields returned live on the OpenHouse resource: `ListingKey`, `ListingId`,
`OpenHouseDate`, `OpenHouseStartTime`, `OpenHouseEndTime`, `OpenHouseStatus`,
`OpenHouseType`, `AppointmentRequiredYN`.

**Bounded:** the status-filtered count equalling the unfiltered count (1970 = 1970)
shows the filter was ACCEPTED. It does not establish that the status filter
narrows anything in this window, and no claim is made that it does.

### The relationship — proven with paired values (B)

| probe | result |
|---|---|
| `Property.ListingKey eq <OpenHouse.ListingKey 1189393822>` | count **1** |
| `Property.ListingId eq <OpenHouse.ListingKey 1189393822>` | count **0** |

`OpenHouse.ListingKey` reconciles to `Property.ListingKey`, and specifically NOT to
`Property.ListingId`. The domains are distinct, as they are for Media below.

### What must NOT be built

`readOpenHouseMembership` (`lib/search/open-house-membership.ts`) already exists,
is transport-agnostic, traverses `@odata.nextLink` to exhaustion, and returns
`unavailable` rather than a partial set. `/api/listings` already uses it. The
authenticated route must SHARE it. There is no third subsystem to write.

### Required order (the §6 invariant, restated)

```
COTALITY OpenHouse -> verified mapping -> ListingKey membership set
  -> canonical Search universe -> distribution/identity rules
  -> COUNT -> pagination -> broker result page
```

Never `Property page -> cut page -> intersect with OpenHouse`: that answers only
whether the current page happens to contain an open house.

---

## DEFECT 2 — Search returns no photos

### The symptom (broker-visible, production runtime)

```
Yorkville sale:  mapper_returned = 141, listings_with_images = 0, without = 141
another search:  200 listings,          0 with images,            200 without
/api/media/proxy: live 404s
```

### First correction to the reading of that telemetry (D)

`app/api/idx/search/route.ts:797` sets `mediaStrategy: "lazy"`. Under that strategy
the search response is NOT supposed to carry images — the browser fetches them.
So `listings_with_images: 0` at the search route is expected, and is not by itself
the defect. It is, however, why the defect is invisible server-side: the telemetry
that looks alarming is the designed behaviour, and the real failure is downstream
in the browser chain, where nothing counts anything.

### The provider is healthy — proven (B)

Three independent listings claiming photos, all four identity combinations tested:

| probe | 1189393822 | 1189391795 | 1189391756 |
|---|---|---|---|
| `Media.ResourceRecordKey eq <ListingKey>` | **30** | **23** | **8** |
| `Media.ResourceRecordID eq <ListingId>` | **30** | **23** | **8** |
| `Media.ResourceRecordID eq <ListingKey>` | 0 | 0 | 0 |
| `Media.ResourceRecordKey eq <ListingId>` | 0 | 0 | 0 |
| `Property.PhotosCount` | 30 | 23 | 8 |

Media rows fetched and dereferenced for `1189393822` (Order 1-3):
`MediaStatus=Active`, `MediaCategory=Photo`, `InternetEntireListingDisplayYN=true`,
and the MediaURL itself returned **HTTP 200 `image/jpeg`, 364369 / 127290 / 244903
bytes**.

**THE MEDIA IDENTITY RULE, live-proven:**

```
Property.ListingKey  ->  Media.ResourceRecordKey     (exact, count == PhotosCount)
Property.ListingId   ->  Media.ResourceRecordID      (exact, count == PhotosCount)
cross-domain         ->  0 rows, both directions
```

Both relationship fields work, each strictly inside its own domain. Neither is a
fallback for the other; a cross-domain query returns an empty 200, which is
indistinguishable from "this listing has no photos".

**Bounded:** counts matching `PhotosCount` on three listings establishes the
relationship on those rows on this date. `IEDY=true` was observed on the three
Media rows dereferenced, not asserted for the resource as a whole.

### Root cause (D) — the identity the browser sends, and the views that send nothing

`lib/search/crm-idx-mapper.ts` emits three separate identities, correctly:

```
:217  id  = listingKey     :274  lid = raw.ListingId (or "")     :275  wid = listingKey
```

The browser then discards the right one:

```
render-gallery.js:12   data-listing-lid="${listing.lid}"   <- ListingId
render-summary.js:11   data-listing-lid="${listing.lid}"   <- ListingId
photo-loader.js:122    lid = card.getAttribute('data-listing-lid')
photo-loader.js        GET /api/media/batch?ids=<ListingId>
```

`/api/media/batch` then tries to REVERSE-ENGINEER the key it was never given:

```
app/api/media/batch/route.ts:61-64   prisma.listing.findMany({ where: { listing_id: { in: ids } } })
                             :68     const key = l.mls_id || l.listing_id
                             :73-78  ids not in the DB fall back to the id itself
                             :103    key !== id ? ResourceRecordKey eq <key> : ResourceRecordID eq <id>
```

`Listing.mls_id` is written from `raw.ListingKey` (`lib/idx/trestle-mapper.ts:1049`),
so for a persisted listing the translation is correct. But a live-Cotality search
result **is not in the Mallan DB**, so the lookup misses and the route falls through
to `ResourceRecordID eq '<ListingId>'`.

Per the probes above, that query is VALID and returns rows. So the identity
fallback is not, on its own, the cause of a blank card — and any fix premised on
"the fallback query is wrong" would be fixing something that works. What is
genuinely wrong is that a Mallan DATABASE round-trip sits in the path of a
provider fact the search row already held: `wid` is the ListingKey, and the
endpoint is made to re-derive it from a table that may not contain the listing.

### The larger defect — four of six views can never show a photo (D)

| view | emits media identity | can lazy-load |
|---|---|---|
| `render-gallery.js` | yes | yes |
| `render-summary.js` | yes | yes |
| `render-master-detail.js` | **no** — renders `<img src="${getListingPhotoThumb(listing)}">` | **no** |
| `render-short-summary.js` | **no** — renders `<img src="${getListingPhoto(listing)}">` | **no** |
| `render-grid.js` | **no** — placeholder colours only | **no** |
| `results-map.js:123` | **no** — reads `l.images[0].url` | **no** |

`photo-loader.js:133` observes `document.querySelectorAll('[data-listing-lid]')`.
A view that does not emit the attribute is never observed, never queued, and never
fetched. Under `mediaStrategy: "lazy"` the listing object carries no `images`, so
these four views resolve to a placeholder permanently — not because the provider
has no photo, but because nothing ever asks.

This is why a single-screen media patch would have been false completion: fixing
Gallery would have left Summary's sibling views silently broken.

### The 404, specifically (D)

`app/api/media/proxy/route.ts:85-90` returns `status: response.status` — the
provider's status, passed through unchanged. A 404 from `/api/media/proxy`
therefore reports that **Cotality returned 404 for that MediaURL**, not that the
proxy failed. The proxy's host allow-list contains `api.cotality.com`
(`lib/media/proxy-url-policy.ts:36-40`), and the bearer token IS attached
(`:65,75`), so neither is implicated.

The live probe returned HTTP 200 for freshly-read MediaURLs. `lib/idx/media-sync.ts:939`
records that the signed Trestle MediaURL **rotates**, and `ListingMedia`
persists `media_url_original` / `media_url_cached`. A rotated-then-replayed URL is
therefore a live hypothesis for the observed 404s and is **UNVERIFIED** — it has
not been traced to a specific originating Media record, and is not claimed here as
the cause.

---

## Consumers to re-verify after any media correction

Search card · Gallery · Summary · Grid · Master-detail · Short-summary · Map popup ·
Detail · Compare · CMA · Reports · Print · Email/share · Public listing · Featured
listing.

Known batch callers today: `photo-loader.js`, `search-engine.js`, `reports.js`,
`pagination.js` (detail).

---

## Rules carried into the correction

- One canonical Open House execution contract, shared — not a third subsystem.
- Membership settled BEFORE count and pagination.
- Open House provider failure FAILS CLOSED; never an unfiltered population.
- One media identity rule, carried on the row, not re-derived from the database.
- A Mallan-local (SL-/RL-) listing is never given a manufactured provider key and
  never sent to Cotality; its media stays Mallan canonical media.
- A placeholder is legitimate only when the provider genuinely has no displayable
  photo, or when the fetch failed and the UI says so. A false "no photo" must
  never be cached.
