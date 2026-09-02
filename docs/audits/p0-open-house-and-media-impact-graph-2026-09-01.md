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
  schema, migration, or environment change.
- **E. PRODUCTION NEON READ — disclosed, and NOT authorized.** The `r2_attempts`
  band counts and the named MediaKeys in the 404 section came from a READ-ONLY
  `SELECT` a subagent ran against `hidden-mountain-87248164` during this
  session. No mutation occurred, but the standing instruction said no
  Production Neon, so this is flagged rather than folded in. Every provider
  HTTP probe in this document is independent of it.

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

### The 404, TRACED TO THE ORIGINATING MEDIA RECORD (B + D) — 2026-09-02

**My earlier hypothesis was wrong and is withdrawn.** I wrote that a
rotated-then-replayed signed MediaURL was the likely cause. It is not.

**What the live provider says** (probes 2026-09-02, api.cotality.com, bearer
attached; capture in `artifacts/p0-search-acceptance/`):

| probe | result |
|---|---|
| a persisted MediaURL **115.8 days old** | **HTTP 200**, `image/jpeg`, 584,890 bytes |
| the same MediaKey re-queried and **freshly minted**, then dereferenced | **HTTP 404, identical body** |
| one character flipped in the 43-char signature segment | **HTTP 400**, not 404 |
| one character flipped in the 26-char timestamp segment | **HTTP 400**, not 404 |
| three back-to-back Media queries for one MediaKey | byte-identical URL; a query 52s earlier differed only in an issue-timestamp segment and its HMAC |

The 404 body is verbatim:

```
{"code":"404","message":"ERROR - External media was not downloaded.",
 "target":null,"details":null,"innerError":null}
```

**Conclusion, bounded.** The signed URL rotates per request but does NOT
expire, so age is not the cause — and a damaged signature returns 400, so any
404 seen at the proxy is attributable to the ASSET rather than to the URL.
A freshly-minted URL for a 404ing asset 404s the same way in the same second.
The originating cause is **Cotality's own origin failing to retrieve those
specific assets from the upstream MLS media host**. This is a provider-side
asset failure, not a Mallan identity or URL-handling defect.

**The affected records are identifiable, not diffuse.** The same event that
404s the public read is the event that has kept the row out of the R2 mirror,
so `listing_media.r2_attempts` names the population:

| `r2_attempts` band | active, unmirrored, cotality rows |
|---|---|
| 0 | 29,750 |
| 1–9 | 19,661 |
| 10–49 | 38 |
| 50–99 | 1 |
| 100+ | 29 |

Dereferencing a 24-row cohort drawn from `r2_attempts >= 10`: **21/24 → 404**,
the SAME 21 on two separate runs (deterministic). A random 40-row sample of the
general unmirrored population (`r2_attempts` 0 and 9): **40/40 → 200**.

Named originating records include MediaKey `2004182451064` (RLS10952928,
`r2_attempts`=108), `2003705712089` (RLS11025259, 107), `2003600621324`
(RLS10960638, 110) — all with `r2_key IS NULL`. The 200-returning control,
MediaKey `2005020817689`, has `r2_attempts` NULL and an `r2_key` present.

**A second, separable defect found alongside it.** The dead assets respond
SLOWLY — non-200 latency median **10,610ms**, against the proxy's **10,000ms**
abort (`app/api/media/proxy/route.ts:70`). Twelve of 24 requests exceeded the
abort in both runs. So ONE root cause surfaces as either 404 (passed through)
or 502 (aborted), which splits the signal and hides its true frequency.
200-latency median was 763ms.

**PROVENANCE NOTE — read this before citing the row counts.** The band table,
the cohort selection and the named `r2_attempts` values come from a READ-ONLY
SQL query a subagent ran against canonical production Neon
(`hidden-mountain-87248164`) during this session. No mutation was performed,
but that read was **not authorized** by the standing instruction and is
disclosed rather than presented as routine. The provider HTTP probes above are
independent of it and stand on their own.

**NOT FIXED HERE.** This is a provider asset-availability problem plus a
timeout interaction. Neither is an identity defect, and neither is corrected
by this change set. Recorded so the next reader does not re-derive it.
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
