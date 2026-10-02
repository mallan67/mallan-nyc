# Media resource contract — PR #647 raw-mapper convergence (2026-10-02, third correction)

Kept strictly separate from `docs/audits/raw-mapper-property-contract-resolution-2026-10-02.md`
(Property) and from `docs/audits/raw-mapper-openhouse-contract-resolution-2026-10-02.md` /
`docs/audits/raw-mapper-customproperty-contract-resolution-2026-10-02.md` (split out of this
document in this revision — see "History of corrections," item 5). Structured per Maya's
required template: **RAW COTALITY RESOURCE CONTRACT → CANONICAL MALLAN STORAGE FIELDS →
DOWNSTREAM PROJECTION → CURRENT DEFECT/GAP → PROOF.**

**Classification taxonomy** (unchanged from the prior revision, one label corrected — see
item 1 below):

- **PROVEN_LIVE_FAILURE** — the exact input is observed in actual entitled rows, **and the
  code is on a live execution path**, and its behavior on that input is contradicted by the
  intended result. Dead code with zero production callers can never earn this label, no
  matter how clearly wrong its logic is — see the correction below.
- **PROVEN_DEAD_CODE_CONTRACT_MISMATCH** — zero production callers, and its logic is proven
  incompatible with a live contract pattern if it were ever invoked.
- **PROVEN_RESOURCE_GAP** — the live contract defines this value/case; direct code tracing
  proves the current implementation cannot produce the correct result for it, within that
  implementation's own stated scope; no live row showing the failure has occurred yet.
- **VALID_ZERO_POPULATION_CASE** — a value the live RLS contract supports, zero rows today,
  the code has an explicit, unambiguous branch for it.
- **LEGACY_UNVERIFIED** — two old implementations disagree, nothing live or stated settles
  which (if either) is correct.

Population counts are timestamped verification evidence only, never durable architecture —
a recheck already found the live `Photo` count move between two checks minutes apart.

---

## 1. RAW COTALITY RESOURCE CONTRACT

### MediaCategory — 18 global `$metadata` members, only 8 associated with RLS

`Addendum, AerialView, AgentPhoto, BrandedVirtualTour, Disclosure, Document, FloorPlan, Map,
OfficeLogo, OfficePhoto, Other, Photo, RentalDocuments, Restriction, Survey, Topography,
UnbrandedVirtualTour, Video` (18, global `$metadata`). **Only 8 are RLS-associated** per the
live `Lookup` catalog: `Addendum, BrandedVirtualTour, Document, FloorPlan, Other, Photo,
UnbrandedVirtualTour, Video`. Every finding below uses only these 8; the other 10 are out of
scope for Mallan's feed.

### MediaClassification — 7 `$metadata` members (correction: not 6)

`Document, Floorplan, Photo, Video` (title-case) and `PHOTO, DOCUMENT, VIDEO` (all-caps) —
**all seven are confirmed distinct real members** (an earlier draft of this document said
"six," which was a wording error; there are seven). The live `Lookup` catalog alone exposes
only 4 of the 7 (the title-case set) — it does not list the all-caps members. **Actual live
RLS rows currently return the uppercase forms** (`PHOTO`, `DOCUMENT`), which the Lookup
catalog doesn't show. Methodological conclusion: the Lookup catalog alone is insufficient to
define this enum's contract; `$metadata` (the full declared set) and actual row sampling
(which forms are really used) are both required.

### MediaType — 44 members, pure file format, never a classification signal.

### ImageOf — 92 members, room/location tagging, orthogonal to content-type.

### ResourceName — 5 members: `Building, Contacts, Member, Office, Property`. Confirmed live population: ~2.08M `Property` rows, **62 `Building` rows**, `Office`/`Member`/`Contacts` at zero. The `Building` rows are real, not hypothetical.

### The dominant real pattern (observed, not synthetic)

`MediaCategory='FloorPlan'` + `MediaClassification='DOCUMENT'` + a `MediaURL` containing
`DOCUMENT-Jpeg`/`DOCUMENT-Pdf` is the dominant live floor-plan pattern — Cotality itself tags
floor plans with `DOCUMENT` classification and `DOCUMENT`-prefixed URL naming. `MediaCategory`
is Mallan's chosen primary field for classification design, a conclusion drawn from this
contract plus the observed row pattern — **not a quoted Cotality rule**; no provider
statement giving `MediaCategory` explicit precedence over `MediaClassification` was found.

---

## 2. CANONICAL MALLAN STORAGE FIELDS

`listing_media` (Prisma `prisma/schema.prisma`, populated by `lib/idx/media-sync.ts`'s
`defaultFetchMedia`/sync loop) **already separates raw provider fields from a derived
projection**, contrary to this document's second draft's framing:

- `listing_media.media_category` — **raw `Property`/`Media.MediaCategory`, preserved
  verbatim** (`mediaCategory: raw.MediaCategory ? String(raw.MediaCategory) : null`,
  `media-sync.ts:1076`). Not run through any classifier at write time.
- `listing_media.media_classification` — **raw `Media.MediaClassification`, preserved
  verbatim** (`media-sync.ts:1077`), used today only for sync mismatch-detection bookkeeping
  (`media-sync.ts:892-995`), not for classification.
- `listing_media.media_type` — the **derived/projected** bucket, computed via
  `classifyTrestleMediaCategory(MediaCategory)` at sync time (confirmed call sites in
  `media-sync.ts`).
- `listing_media.media_key`, `.order`, `.preferred_photo_yn`, `.media_url`, `.resource_record_key`, `.r2_key`/cache fields — as named, 1:1 with the raw fields in Section 1.

**`media_category` and `media_classification` are selected widely in production** —
confirmed live in `app/api/listings/route.ts`, `app/api/listings/[id]/route.ts`,
`app/api/crm/listings/route.ts`, `app/listing/[...slug]/page.tsx`,
`app/api/agents/[slug]/listings/route.ts`, `app/api/open-houses/route.ts`, and others — so the
raw value is **not lost at the storage layer**. The architecture concern Maya raised is
narrower than "the raw category is permanently collapsed": it survives in the DB and in every
query that selects it.

---

## 3. DOWNSTREAM PROJECTIONS — and the boundary Maya's correction draws

**`classifyMediaItem`** (`lib/media/listing-media-resolver.ts`) is explicitly a **gallery
display projection**. Its stated job (its own docstring, and its usage in
`resolveListingMedia`/the public DTO/CRM mapper/`batch/route.ts`) is deciding which listing
imagery shows first in a photo gallery. **Its output type (`MediaClass`) has exactly five
members by design: `photo | floorplan | video | virtualTour | unknown`.** It has no
`document`/`addendum`/`other` class, because those are not gallery-displayable image content
— this is a deliberate scope boundary, not an oversight.

**`classifyTrestleMediaCategory`** (`lib/media/media-sync-service.ts`) is the **ingestion-time
R2-namespace-routing projection** — a different, narrower purpose, by its own documented
design (4-bucket model: `Photo | FloorPlan | Video | VirtualTour`).

**Every path from a raw `MediaCategory` value to any consumer today goes through one of
these two gallery/routing projections.** `resolveListingMediaFromRows` (the function that
reads the DB-persisted raw `media_category` back out) immediately re-feeds it into
`classifyMediaItem` (`MediaCategory: r.media_category ?? r.media_type`,
`listing-media-resolver.ts:555`) — confirmed by direct code read, no other consumer found.
**No downstream projection exists yet that uses the preserved raw `media_category` for a
non-gallery purpose** (a document list, an addendum viewer, an "other internal media"
surface). This is the real, narrower gap: not that the raw value is destroyed, but that
nothing has been built to use it outside the gallery/routing projections. Whether such a
projection is needed is a product question outside this verification's scope — flagged, not
assumed either way.

---

## 4. CURRENT DEFECT/GAP (reclassified)

### 4.1 PROVEN_DEAD_CODE_CONTRACT_MISMATCH (corrected from the prior draft's PROVEN_LIVE_FAILURE)

`classifyMediaCategory` (`lib/search/crm-idx-mapper.ts:32-38`) has **zero production
callers** (confirmed: 2 repo hits total, its own definition and its own test). Per the
taxonomy, a dead function with no live execution path cannot be a `PROVEN_LIVE_FAILURE`
regardless of how clearly wrong its logic is — the prior draft mislabeled it. Correct label:
**`PROVEN_DEAD_CODE_CONTRACT_MISMATCH`** — its space-dependent `.includes("floor plan")`
(line 34) can never match the real no-space `FloorPlan` value, and would be wrong against the
dominant live `FloorPlan`+`DOCUMENT` pattern if it were ever invoked. Recommendation
unchanged: delete as dead code; the mismatch is additional justification, not new urgency.

### 4.2 PROVEN_RESOURCE_GAP — within `classifyMediaItem`'s own declared 5-class scope

`BrandedVirtualTour` / `UnbrandedVirtualTour` → `classifyMediaItem` falls through to
`'unknown'` instead of `virtualTour` (line 158 has no no-space `cat.includes('virtualtour')`
check). **This is a real gap, not a scope question** — unlike `Document`/`Addendum`/`Other`
below, `virtualTour` is one of the gallery resolver's own five target classes, so failing to
produce it for a valid RLS category is a defect within the function's own stated job, even
though both categories have zero live rows today. `classifyTrestleMediaCategory` does not
share this gap.

`classifyMediaItem` also has no priority tiering between `MediaCategory`,
`MediaClassification`, and `MediaURL` text — demonstrated (not observed live) by:
`MediaCategory='Photo'` + `MediaClassification='DOCUMENT'` → wrongly `'floorplan'`;
`MediaCategory='Document'`/`'Addendum'` + a document-shaped URL → wrongly `'floorplan'`
instead of resolving from the explicit category first. These remain `PROVEN_RESOURCE_GAP`:
unobserved combinations, but the structural flaw (a lower-priority signal overriding an
explicit different category) is proven by direct trace.

### 4.3 NOT automatically a defect — `Document`/`Addendum`/`Other` → `'unknown'` in the gallery resolver

Per Section 3's boundary: `classifyMediaItem` has no `document`/`addendum`/`other` output
class **by design**, because it is a gallery-display projection and these are not gallery
image content. `MediaCategory='Document'` or `'Addendum'` alone (no URL) resolving to
`'unknown'` may simply mean "correctly excluded from the gallery" — this is **not** reframed
as a defect in this revision. The open question is architectural and separate: whether a
different, non-gallery downstream projection should exist to do something with these
categories (Section 3) — that is a product decision, not a bug in the gallery resolver.
`classifyTrestleMediaCategory`'s silent default of these same three categories to `Photo`
remains **LEGACY_UNVERIFIED** (disagreement with `classifyMediaItem`'s `'unknown'`, settled by
neither a live row nor a stated intended behavior) — explicitly not confirmed correct merely
because it defaults quietly.

### 4.4 VALID_ZERO_POPULATION_CASE

`MediaCategory='Video'` — explicit, unambiguous branch in both functions; zero live rows
today; not provable as production-correct absent real rows, but not a stated gap.

### 4.5 PROVEN_RESOURCE_GAP — `ResourceName` boundary (unchanged from the prior draft)

Zero of ~12 current Media call sites filter on `ResourceName`. Confirmed live: `Building`
rows exist in the same resource (62, Section 1) that Property-media queries read from without
a guard. No key collision is proven. **Property-media retrieval must prove it is explicitly
scoped to `ResourceName='Property'`.**

---

## 5. PROOF

### 5.1 What the current tests actually prove — relabeled

`lib/idx/__tests__/media-classifier-contract.test.ts`'s cases are **not** live-row execution
tests. They construct plain objects reproducing a reported live field combination and run
them through the real, unmodified classifier functions. This is useful and valid — it proves
"the real code, given exactly these field values, returns X" — but it is not the same as
executing against a literally captured Cotality row. Corrected label for these cases:
**`LIVE_PATTERN_REPRODUCTION_AGAINST_REAL_CODE`**, not "confirmed correct, observed live" (the
prior draft's wording, which overstated what the test itself proves).

### 5.2 Open item: true live-row fixtures are still needed

Maya's instruction was to add at least one **exact, captured** live Media-row fixture (with
query evidence recorded) for each of: `Photo`+`PHOTO`, `FloorPlan`+`DOCUMENT`,
`MediaCategory=null`+`PHOTO`. **This has not been done in this revision** — the tools
available this session (`mcp__trestle-fields__*`) query live `$metadata`/picklists only; they
do not return actual row data, and no other live-row-query capability is available in this
context. Fabricating a "captured row" would violate the standard this entire engagement is
built on. **This is recorded as an open item, not silently worked around**: a true row-level
fixture requires either Maya supplying the exact JSON she already queried (with the query and
timestamp noted), or a live-data-query tool becoming available. Until then, Section 5.1's
pattern-reproduction tests are the strongest proof this document can offer.

---

## 6. History of corrections to this document (same engagement, same day)

1. First draft (Section 3 only) claimed a `DOCUMENT` classification/URL match proves an item
   is "a generic document, not a floor plan" — withdrawn; Cotality itself uses `DOCUMENT` for
   the dominant live `FloorPlan` pattern.
2. Second draft corrected the priority model but still labeled several unobserved synthetic
   combinations as a flat "PROVEN_DEFECT," mixed the 18-global/8-RLS `MediaCategory` scope,
   declared `classifyTrestleMediaCategory` "KEEP as-is" unconditionally, missed the
   `MediaClassification` Lookup-vs-`$metadata` gap and the real `ResourceName='Building'`
   population, and wrote population counts as if durable.
3. **This (third) draft** corrects: the dead-classifier taxonomy misuse (4.1); the
   canonical-storage-vs-gallery-projection architecture boundary, including that
   `listing_media.media_category`/`media_classification` already preserve the raw values at
   the storage layer (Sections 2-3) — meaning `Document`/`Addendum`/`Other` → `'unknown'` in
   the gallery resolver is not automatically a defect (4.3); the "six" → "seven"
   `MediaClassification`-members wording error; relabels test evidence as pattern
   reproduction, not live execution, and flags the still-missing true live-row fixture as an
   open item rather than fabricating one (5); and splits OpenHouse/CustomProperty into their
   own separate resource-contract documents (no longer part of this file).

---

**Sources:** workflow `wf_ffb3474e-d8a`; direct `mcp__trestle-fields__*` calls this session;
Maya's direct live-row queries (RLS-associated `MediaCategory` subset and population,
`ResourceName` population by domain, `MediaClassification` Lookup-vs-`$metadata`-vs-actual-rows);
`lib/media/listing-media-resolver.ts`, `lib/media/media-sync-service.ts`,
`lib/search/crm-idx-mapper.ts`, `lib/idx/media-sync.ts`, `prisma/schema.prisma` read directly
at or near PR #647 HEAD.
