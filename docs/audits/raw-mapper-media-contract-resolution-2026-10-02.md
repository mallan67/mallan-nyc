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

**Gap confirmed by Section 5's three live rows:** `listing_media` has **no column for
`ShortDescription`/`LongDescription` at all** — `media-sync.ts`'s canonical sync loop never
selects either. This is proven as an omission, not as a missing fix: the third live row in
Section 5 shows `LongDescription` carries a second provider signal (`'floor plan'`) that
disagrees with `MediaClassification`/the URL path, and that signal was never even a
candidate for persistence — but nothing establishes that persisting it would have resolved
anything, since no rule says `LongDescription` outranks the other signals. `MediaType` and
`ImageOf` are likewise absent from canonical storage (Section 1). See Section 5 for the full,
corrected finding — do not add schema columns for these without a proven business
requirement.

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

## 5. PROOF — closed with three sanitized live-row-derived fixtures

The prior revision flagged true live-row fixtures as an open item this session's tools
cannot produce (`mcp__trestle-fields__*` queries `$metadata`/picklists only, not row data).
**Maya supplied three live rows directly, with `MediaKey`/`ResourceRecordKey` provenance.**
`lib/idx/__tests__/media-classifier-contract.test.ts` now runs these three fixtures with
every classification-relevant field reproduced exactly. **Correction: these are "sanitized
live-row-derived fixtures," not "verbatim/exact" rows** — the real Cotality host and the
opaque, rotating `MediaURL` tail were intentionally replaced; only the stable
`/Media/Property/<PREFIX>-Jpeg/` path segment the classifier actually inspects is preserved,
since fabricating the real tail would misrepresent the source.

Required distinction per row: **PROVIDER ROW FACTS** (what Cotality sent) → **CURRENT CODE
OUTPUT** (what the real functions return, provable by running them) → **VERIFIED SEMANTIC
RESULT** (whether that output is actually correct — only provable when every signal on the
row agrees).

| MediaKey | Category | Classification | Type | Short/LongDescription | URL path | Current code output | Verified semantic result |
|---|---|---|---|---|---|---|---|
| `2005927277918` | `Photo` | `PHOTO` | `Jpeg` | —/"Photo 6" | `PHOTO-Jpeg` | `photo`/`Photo` | **CONFIRMED CORRECT** — every signal agrees |
| `2005917243395` | `FloorPlan` | `DOCUMENT` | `Jpeg` | "FloorPlan"/— | `DOCUMENT-Jpeg` | `floorplan`/`FloorPlan` | **CONFIRMED CORRECT** — every signal agrees; the exact live proof that `DOCUMENT` classification does not mean "generic document" |
| `2003600763305` | `null` | `PHOTO` | `Jpeg` | —/"floor plan" | `PHOTO-Jpeg` | `photo`/`Photo` | **OBSERVED_LIVE_PROVIDER_CONFLICT — UNVERIFIED.** `MediaClassification` and the URL path say photo; `LongDescription` literally says "floor plan." `classifyMediaItem` structurally never reads `LongDescription` (only `ShortDescription`), so it never even sees this signal. No precedence between `MediaClassification`/URL and `LongDescription` is established or invented here — this is a Cotality/REBNY semantics question (does free text ever outrank a classification field? is "floor plan" here a genuine description or a data-entry error on an unrelated field?) outside this verification's scope. |

**Two further findings, corrected (second pass) to match exactly what the live evidence
proves — no fix proposed for either:**

- **Media-level `InternetEntireListingDisplayYN`: OBSERVED MEDIA-ROW COPY — semantics
  unresolved, likely a listing-level value replicated onto each row, NOT a per-photo
  opt-out.** Withdrawn: the first pass's claim that row 1's `false` meant "this specific
  photo is individually opted out." Maya queried every Media row for all three captured
  listings and found **zero intra-listing variance**: `1185755400` — 9/9 rows `false`;
  `1185008759` — 3/3 rows `true`; `1091333591` — 20/20 rows `true`. A 100-row sample across
  14 further `ResourceRecordKey`s found zero listings with mixed `true`/`false` values among
  their own Media rows. This pattern — the field varies between listings but never within
  one — is far more consistent with a listing-level value Cotality repeats onto every Media
  row than with genuine per-asset permission. Current REBNY documentation also describes
  this field as a listing-level visibility setting, not an individual-photo control. This
  could not be directly confirmed against the parent `Property` value for these three
  listings (they have since aged out of Mallan's current entitlement window). **Do not add a
  media-level suppression rule without explicit provider confirmation** that this field is
  ever set independently per asset.
- **`ShortDescription`/`LongDescription`: PROVEN UNPERSISTED PROVIDER FIELDS — storage
  requirement unverified.** Corrected: the first pass's framing of `LongDescription` as "the
  one signal that could have resolved row 3's conflict" overstated what it proves — it does
  **not** resolve the conflict, it is merely a second, equally-unverified provider signal
  with no established precedence over `MediaClassification`/the URL path. What **is** proven
  (confirmed directly against `prisma/schema.prisma` and the `media-sync.ts` sync writer):
  `ShortDescription` and `LongDescription` are available on live Cotality Media and are not
  preserved by `listing_media` at all — their omission is proven. Whether Mallan has an
  actual downstream business requirement to persist them is **not** proven, and per this
  engagement's architecture discipline against casual schema growth, **no schema column
  should be added during this convergence batch without first proving that requirement and
  exhausting existing storage options.**

### 5.1 Recorded for Stage B, not fixed now (frozen schema file)

`prisma/schema.prisma`'s comment on `listing_media.media_type` describes it as if it were
literally Cotality/Trestle `MediaType` with values like `Photo`/`FloorPlan`/`Video`. This is
incorrect against the live contract (Section 1): Cotality's `MediaType` is file format
(`Jpeg`/`Pdf`/etc.); `listing_media.media_type` is a **derived Mallan projection**, produced
by `classifyTrestleMediaCategory` from `MediaCategory`, not a copy of Cotality's `MediaType`
field. The column itself may be fine; the comment teaches the wrong architecture. Not fixed
in this revision — `prisma/schema.prisma` is on the hard-forbidden list enforced by both
`push-647.js` and `push-647-mapper-exception.js` (database schema); any fix needs its own,
separately-authorized schema-comment change, not this exception.

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
4. **This (fourth) revision** closes the Section 5 open item: Maya supplied three exact
   captured live rows with `MediaKey`/`ResourceRecordKey` provenance, now run verbatim in
   `lib/idx/__tests__/media-classifier-contract.test.ts`. Two of the three have every signal
   agreeing (`CONFIRMED CORRECT`). The third does not — `MediaClassification`/URL say photo,
   `LongDescription` says "floor plan," and `classifyMediaItem` never reads
   `LongDescription` at all — reclassified from "confirmed correct" to
   `OBSERVED_LIVE_PROVIDER_CONFLICT`, semantic result left explicitly `UNVERIFIED`, with no
   precedence rule invented to resolve it. Two further findings recorded directly from these
   rows without proposing a fix: Media-level `InternetEntireListingDisplayYN` is proven to
   diverge per-row (row 1's photo is individually opted out; Mallan's gates never read
   Media's copy of this field); and `LongDescription`/`ShortDescription` are not persisted by
   the canonical `listing_media` ingestion path at all, which is why the one signal that could
   have resolved row 3's conflict was never even in Mallan's own storage.
5. **This (fifth, final) revision** corrects two overreaching claims from item 4 and renames
   the fixtures: (a) "this specific photo is individually opted out" is withdrawn — Maya
   queried every Media row for all three listings and found zero intra-listing variance
   (9/9, 3/3, 20/20, plus a 100-row/14-listing sample with no mixed values anywhere), which
   together with REBNY's own listing-level framing of this field is far more consistent with
   a replicated listing-level value than a per-photo permission; reclassified to "OBSERVED
   MEDIA-ROW COPY — semantics unresolved," with an explicit instruction not to build a
   media-level suppression rule without provider confirmation; (b) "the one signal that could
   have resolved row 3's conflict" is withdrawn — `LongDescription` does not resolve
   anything, it is only a second unverified signal with no established precedence over
   `MediaClassification`/the URL path; reclassified to "PROVEN UNPERSISTED PROVIDER FIELDS —
   storage requirement unverified," with an explicit instruction not to add schema columns
   without first proving a downstream business requirement. Also: the three fixtures are
   renamed from "verbatim/exact captured rows" to **sanitized live-row-derived fixtures**,
   since the real Cotality host and the opaque URL tail were intentionally replaced (only
   classification-relevant fields are exact). Also recorded, not fixed (schema file is hard-
   forbidden by this convergence's tooling): `prisma/schema.prisma`'s comment on
   `listing_media.media_type` wrongly describes it as literal Cotality `MediaType`; it is a
   derived Mallan projection, and live Cotality `MediaType` is file format only (5.1).

**Per Maya's explicit instruction, this closes Stage A's Media verification. No further
Media audit is planned; Stage B proceeds from the findings recorded in this document as of
this revision.**

---

**Sources:** workflow `wf_ffb3474e-d8a`; direct `mcp__trestle-fields__*` calls this session;
Maya's direct live-row queries (RLS-associated `MediaCategory` subset and population,
`ResourceName` population by domain, `MediaClassification` Lookup-vs-`$metadata`-vs-actual-rows);
`lib/media/listing-media-resolver.ts`, `lib/media/media-sync-service.ts`,
`lib/search/crm-idx-mapper.ts`, `lib/idx/media-sync.ts`, `prisma/schema.prisma` read directly
at or near PR #647 HEAD.
