# Media resource contract — PR #647 raw-mapper convergence (2026-10-02, twice-corrected)

Kept strictly separate from `docs/audits/raw-mapper-property-contract-resolution-2026-10-02.md`
per Maya's explicit instruction: "Property and Media are separate Cotality resources and
must be verified separately... Do not flatten them into one old mapper shape and do not
infer Media behavior from Property fields." No Property field is re-litigated here; where a
Media field shares a name with a Property field, that is a **separate field instance** on a
separate resource, called out explicitly, never merged into one row.

**Classification taxonomy used throughout (Maya's correction, 2026-10-02, second pass)** —
replaces the earlier PROVEN_DEFECT / LEGACY_DISAGREEMENT labels used in this document's
first two drafts:

- **PROVEN_LIVE_FAILURE** — the exact input combination is observed in actual entitled
  rows, and the code's behavior on it is contradicted by the intended/expected result.
- **PROVEN_RESOURCE_GAP** — the live contract defines this value/case; direct code tracing
  proves the current implementation cannot produce the correct result for it; no live row
  showing the failure has occurred yet.
- **VALID_ZERO_POPULATION_CASE** — a value the live RLS contract supports, with zero rows
  today, where the code has an explicit, unambiguous branch for it (not a silent default).
- **LEGACY_UNVERIFIED** — two old implementations disagree, and no live row or stated
  intended behavior settles which (if either) is correct.

A synthetic category/classification combination that has not been observed live is **never**
labeled PROVEN_LIVE_FAILURE merely because it can be constructed — only PROVEN_RESOURCE_GAP,
and only when direct code tracing (not assumption) proves the gap.

**Population counts throughout this document were measured at the stated check time and
are evidence for this verification pass only — they are not durable architectural
constants.** A recheck during this same engagement already found the live `Photo` count
move from 1,487,153 to 1,487,172 between two checks minutes apart. Do not hardcode a count
into test expectations or treat one as a permanent fact.

---

## 1. Media contract (field-by-field)

### MediaCategory — scope correction: 18 GLOBAL members, only 8 are RLS-associated

Live `$metadata` declares 18 global `MediaCategory` enum members (`Addendum, AerialView,
AgentPhoto, BrandedVirtualTour, Disclosure, Document, FloorPlan, Map, OfficeLogo,
OfficePhoto, Other, Photo, RentalDocuments, Restriction, Survey, Topography,
UnbrandedVirtualTour, Video`). **Only 8 of these are associated with RLS** — the feed Mallan
actually reads — per the live `Lookup` catalog: `Addendum, BrandedVirtualTour, Document,
FloorPlan, Other, Photo, UnbrandedVirtualTour, Video`. Every classifier test and every
finding in this document uses only these 8; the other 10 global values (AerialView,
AgentPhoto, Disclosure, Map, OfficeLogo, OfficePhoto, RentalDocuments, Restriction, Survey,
Topography) are out of scope for Mallan's RLS feed and are not tested or claimed to be
handled.

Live population (measured, this pass, NOT a durable constant — see note above): `Photo` and
`FloorPlan` have substantial population (low millions / high hundred-thousands); `Addendum`,
`BrandedVirtualTour`, `Document`, `Other`, `UnbrandedVirtualTour`, `Video` currently have
**zero rows** in Mallan's entitled feed. Zero rows does not mean invalid — all 8 are live
RLS contract values and must be structurally supported.

### MediaClassification — scope correction: 7 `$metadata` members, only 4 in the Lookup catalog, live rows use the uppercase forms

Live `$metadata` declares 7 `MediaClassification` enum members: `Document, Floorplan, Photo,
Video` (title-case) and `PHOTO, DOCUMENT, VIDEO` (all-caps) — six are confirmed distinct real
members, not case variants of each other. **The live `Lookup` catalog alone only exposes 4
rows (the title-case set)** — it does not list the uppercase members at all. **Actual live
RLS rows currently return the uppercase forms (`PHOTO`, `DOCUMENT`)**, not the title-case
ones the Lookup catalog shows. This is a methodological finding in its own right: **the
Lookup catalog alone is insufficient to define this enum's contract — `$metadata` (the full
declared set) and actual row sampling (which forms are really used) are both required.**
Relying on the Lookup catalog alone would have missed the exact forms Mallan's live data
actually contains.

### MediaCategory + MediaClassification — the dominant real pattern

**Confirmed, observed live:** `MediaCategory='FloorPlan'` + `MediaClassification='DOCUMENT'`
+ a `MediaURL` containing `DOCUMENT-Jpeg`/`DOCUMENT-Pdf` is the dominant real floor-plan
pattern in this feed — Cotality itself tags floor plans with `DOCUMENT` classification and
`DOCUMENT`-prefixed URL naming. **`MediaCategory` is the correct primary field for Mallan's
mapping design** — this is a design conclusion Mallan draws from the contract plus this
observed row pattern, not a quoted Cotality/provider statement that `MediaCategory` has
precedence over `MediaClassification`; no such explicit provider rule was found. The
supporting design logic: `MediaCategory`'s members carry a specific, narrow semantic
(`FloorPlan`, `Photo`, `Document`, `BrandedVirtualTour`, etc.) while `MediaClassification`'s
6-7 members are broader and, per the observed pattern, used by Cotality as a secondary
descriptor even for a category as specific as `FloorPlan`. `MediaType` remains file-format
only (`Jpeg`/`Pdf`/etc.), never a classification signal. URL text is never primary
authority.

### ResourceName — real Building-media rows exist today; this is not theoretical

Live-queried this pass: Mallan's Media resource currently contains roughly 2.08 million rows
with `ResourceName='Property'` and **62 rows with `ResourceName='Building'`** (`Office`,
`Member`, `Contacts` are at zero). **The `Building`-attached rows are real, not
hypothetical.** Zero of the ~12 current Media call sites (Section 2) filter or constrain on
`ResourceName`. No key collision between a `Building` media row and a `Property` row has
been proven — this is a **PROVEN_RESOURCE_GAP** (the resource genuinely contains another
domain's rows in the same table Mallan queries without a guard), not a confirmed collision.
**Recommendation: every Property-media retrieval must explicitly constrain
`ResourceName='Property'`.**

### Other fields (unchanged from the first pass, population caveats apply equally)

| Field | Live contract | Current Mallan select/usage | Risk |
|---|---|---|---|
| `MediaKey` | String(20), **Nullable: FALSE**. | Selected 2 of 3 `sync.ts` sites + `media-sync.ts`'s `defaultFetchMedia` (fully enforced there); selected-but-discarded in `fetch.ts`'s `fetchListingMedia()`. | Only one of ~6 call sites enforces it despite the schema guarantee. |
| `MediaURL` | String(8000), nullable. | Selected everywhere; `$filter` precondition in 2 places. | Its text is used as a content-type signal in two places — see Section 3; URL text is never primary authority per the corrected priority model above. |
| `MediaType` | Enum, nullable, 44 values, pure file format (`Jpeg`/`jpeg`, etc., case-duplicated). No content-type semantics. | Selected ONLY at `fetch.ts:609`, confirmed fetched and never read there. | The one call site that ever requests it throws the value away unread. |
| `Order` | Int32, nullable. | Selected everywhere; drives gallery ordering. | Presentation ordinal only, per-`MediaCategory`, not identity — `MediaKey` owns identity. |
| `ImageOf` | Enum, nullable, 92 values — room/location tagging, orthogonal to content-type. | **Never selected anywhere**, repo-wide. | Unused, not misused. |
| `ShortDescription` | String(50), nullable. | Selected in 3 call sites. | Used as a free-text keyword fallback — same text-inference-last-resort caveat as `MediaURL`. |
| `LongDescription` | String(1024), nullable. | **Never selected anywhere.** | Fully unused. |
| `PreferredPhotoYN` | Boolean, nullable. | Selected everywhere. | A sort nudge/tie-break only, not authoritative alone. |
| `MediaStatus` | Enum, nullable, 3 values: `Active, Deleted, Other`. | Selected everywhere; `Deleted` excluded. | `Other` never branched; whether Cotality emits it in practice is unverified. |
| `ResourceRecordKey` | String(20), nullable per live metadata (primary join key in practice). | Selected everywhere. | Confirmed live: `Media.ResourceRecordKey = Property.ListingKey` for `ResourceName='Property'` rows. |
| `ResourceRecordID` | String(255), nullable. | Fallback join key, matching Trestle's own "can duplicate" guidance. | Correctly treated as lower-priority. |
| `InternetEntireListingDisplayYN` (Media's own) | Boolean, nullable, confirmed to exist as a distinct field on Media. | **Never selected on Media anywhere** (Property's own copy is selected elsewhere). | No relationship-proof exists for whether Media's copy ever diverges from Property's. |
| `ModificationTimestamp` / `MediaModificationTimestamp` | DateTime, nullable, both. | Load-bearing in `media-sync.ts` — drives the production media-sync watermark. | Confirms `media-sync.ts` as a major Media consumer not in the originally-assumed call-site list. |
| `Permission` (Media's own) | Multi-enum, 20 values (comma-separated), including distinct `IDX`/`Idx` and `VOW`/`Vow` members. | Selected and used only in `media-sync.ts` (`!== 'Public'` → skip). | Schema-verified risk: exact-string equality against a documented multi-value field; a `'Public,IDX'` row would fail this check. Not observed live — a schema risk, not a confirmed failure. |

---

## 2. Relationship proof — Media ↔ Property

**Proven:** `Media.ResourceRecordKey = Property.ListingKey` and `Media.ResourceName =
'Property'` for ordinary listing photos (live-confirmed on a real listing). At least 12
distinct `$select`/`$expand` call sites exist across 10+ files (`lib/idx/fetch.ts` ×2,
`lib/idx/sync.ts` ×3, `app/api/media/batch/route.ts` ×2, `lib/idx/media-sync.ts`'s
`defaultFetchMedia`, `app/api/cron/feed-reconcile/route.ts`'s orphan-create path,
`app/api/idx/search/route.ts`'s lazy-photo backfill, `app/api/agents/[slug]/listings/route.ts`'s
`batchFetchPhotos`, plus two offline scripts).

**PROVEN_RESOURCE_GAP:** zero of these 12 call sites filter or check `ResourceName`, and the
resource is now confirmed (Section 1) to actually contain 62 `Building`-attached rows today
— not a theoretical concern. No collision has been proven; the gap is the absent guard
itself.

**Gate-level finding:** display-gate functions (`gates.ts`, `trestle-mapper.ts`) read only
Property-level `Permission`/`InternetEntireListingDisplayYN`, by construction.
`media-sync.ts` separately runs its own Media-row-level `Permission` gate, but only on the
two ingest paths that select `Media.Permission`.

---

## 3. Classifier verdict (reclassified under the corrected taxonomy)

Three classifiers, directly against PR #647 HEAD:

- `classifyMediaItem` — `lib/media/listing-media-resolver.ts:120-165`
- `classifyTrestleMediaCategory` — `lib/media/media-sync-service.ts:142-166`
- `classifyMediaCategory` — `lib/search/crm-idx-mapper.ts:32-38` (dead, 0 production callers)

### 3.1 Confirmed against observed live patterns (not synthetic)

- `MediaCategory='FloorPlan'` + `MediaClassification='DOCUMENT'` + a `DOCUMENT-Jpeg`/
  `DOCUMENT-Pdf` URL (the dominant real pattern) → `classifyMediaItem` and
  `classifyTrestleMediaCategory` **both correctly** return `floorplan`/`FloorPlan`. No gap.
- `MediaCategory=null` + `MediaClassification='PHOTO'` (observed live) → both **correctly**
  return `photo`/`Photo`. No gap.
- The dead `classifyMediaCategory` (crm-idx-mapper.ts), if it were ever invoked on the
  dominant `FloorPlan`+`DOCUMENT` pattern, would wrongly return `'Photo'` (its space-dependent
  `.includes("floor plan")` can never match the real no-space `FloorPlan` value) — this is the
  one **PROVEN_LIVE_FAILURE** in this document: the input combination is massively observed
  live (the dominant floor-plan pattern), and the (unused) function's behavior on it is wrong.
  Moot in production today only because the function has zero callers.

### 3.2 PROVEN_RESOURCE_GAP — `classifyMediaItem` has no real priority tiering

`classifyMediaItem` OR's `MediaCategory`, `MediaClassification`, and `MediaURL`-text checks
at the same level — any one firing returns `'floorplan'`, with no tiering that resolves an
explicit `MediaCategory` first. Proven by direct code trace (not observed live — the
specific combinations below have zero population today, but the code's behavior on them is
deterministic and demonstrably wrong against the stated design intent):

1. `MediaCategory='Photo'` + `MediaClassification='DOCUMENT'` → wrongly returns `'floorplan'`
   (line 144). `Photo` has substantial live population; this exact combination is unobserved.
2. `MediaCategory='Document'` (valid RLS value, 0 rows today) alone → `'unknown'` (no
   dedicated document output class exists at all); with a `DOCUMENT-Jpeg` URL added →
   wrongly `'floorplan'` (line 150's `TRESTLE_DOCUMENT_URL_PATTERN`). Unobserved combination.
3. `MediaCategory='Addendum'` (valid RLS value, 0 rows today) + a `.pdf` URL → wrongly
   `'floorplan'` (line 148's blanket `/\.pdf(\?|$)/` regex). Unobserved combination.
4. `MediaCategory='BrandedVirtualTour'` / `'UnbrandedVirtualTour'` (valid RLS values, 0 rows
   today) → both fall through to `'unknown'` instead of a virtual-tour class (line 158 has no
   no-space `cat.includes('virtualtour')` check). The intended behavior here is unambiguous
   even absent live rows: a virtual-tour category should not become `'unknown'`.
   `classifyTrestleMediaCategory` does not share this gap (it has the no-space check).

### 3.3 VALID_ZERO_POPULATION_CASE and LEGACY_UNVERIFIED — the remaining RLS categories

- `MediaCategory='Video'` (valid RLS value, 0 rows today): **VALID_ZERO_POPULATION_CASE**.
  Both functions have an explicit, unambiguous `video` branch — not a silent default. Not
  provable as production-correct absent real rows, but not a stated gap either.
- `MediaCategory='Addendum'` / `'Other'` alone (no URL/classification): **LEGACY_UNVERIFIED**.
  `classifyMediaItem` returns `'unknown'`; `classifyTrestleMediaCategory` silently defaults
  both to `'Photo'`. Neither is proven correct — there are zero live rows for either category
  to settle it, and no stated intended behavior exists for these document-adjacent
  categories. **This is explicitly not permission to assume the `Photo` default is fine** —
  see 3.4.

### 3.4 Per-classifier verdict — corrected, no premature "keep as-is"

- **`classifyMediaItem` — fix the priority-tiering gap (3.2).** Canonical/most-used. The fix
  is resolving `MediaCategory` first and exactly, falling back to `MediaClassification` only
  when category is null/missing (matching the one live-confirmed fallback case), and never
  letting URL text override an explicit category.
- **`classifyTrestleMediaCategory` — correct where tested against live/explicit-branch
  cases (`FloorPlan`, `Photo`, the null fallback, `Video`'s explicit branch); NOT confirmed
  canonical.** It silently defaults three valid, zero-population RLS categories
  (`Document`, `Addendum`, `Other`) to `Photo` with no dedicated branch. Zero population does
  not grant permission to assume this default is correct — it must remain
  **UNVERIFIED FOR ZERO-POPULATION CATEGORIES** until each of the 8 RLS-supported
  `MediaCategory` values has an explicit, intended Mallan handling (a product decision, not
  an inferred one). Do not declare this function canonical for Stage B until that exists.
- **`classifyMediaCategory` (crm-idx-mapper.ts) — DELETE.** Dead (0 production callers) and
  now a confirmed `PROVEN_LIVE_FAILURE` against the dominant live pattern (3.1) if it were
  ever invoked.

**No single canonical classifier is recommended.** Still missing, beyond the two confirmed
live patterns: an explicit, stated Mallan product decision for each of `Document`,
`Addendum`, `Other`, `BrandedVirtualTour`, `UnbrandedVirtualTour`, and `Video` (all currently
zero-population but live-valid); a live disagreement-rate measurement between `MediaCategory`
and `MediaClassification` beyond the two confirmed patterns; and a check of
`resolveListingMediaFromRows`'s separate DB-row fallback, not exercised by any case here.

---

## 4. Other resources (unchanged — lighter-weight passes, OpenHouse/CustomProperty findings not affected by this correction)

See the prior version of this document's Section 4: two OpenHouse `PROVEN_RESOURCE_GAP`-class
findings (a public-search filter omitting `OpenHouseType='Public'` entirely, and a separate
filter missing 2 of 3 real public enum values), and CustomProperty findings (confirmed
`$expand=CustomProperty` is never enabled in production; `main`'s current `trestle-mapper.ts`,
outside this PR, has independently grown the same flat-`pick()` `AdditionalFee*` defect
already flagged in `mapping.ts`). These were not built on the corrected/withdrawn
Document-vs-FloorPlan claim and are not affected by either correction in this document.

---

## 5. History of corrections to this document (same engagement, same day)

1. **First draft** (Section 3 only) asserted a `MediaClassification='DOCUMENT'`/
   `DOCUMENT`-URL match proves an item is "a generic document, not a floor plan," and labeled
   several synthetic cases PROVEN_DEFECT. **Withdrawn**: Maya found live rows showing
   Cotality itself tags all `FloorPlan` rows with `DOCUMENT` classification/URL-naming —
   the opposite of the first draft's claim for the dominant real case.
2. **Second draft** corrected the priority model (`MediaCategory` primary) but still labeled
   several unobserved synthetic combinations PROVEN_DEFECT, stated "18 MediaCategory values"
   without the RLS-subset scope, declared `classifyTrestleMediaCategory` "KEEP as-is"
   unconditionally, did not note the `MediaClassification` Lookup-catalog-vs-`$metadata` gap,
   did not have the `ResourceName='Building'` live population figures, and wrote exact
   population counts as if durable. **This (third) draft corrects all of the above** per
   Maya's explicit instruction not to label unobserved synthetic combinations PROVEN_DEFECT
   unless contradicted by an explicit provider/REBNY requirement, and not to treat a passing
   test against existing code as proof of a fact the provider contract and live rows haven't
   independently established.

---

**Sources:** workflow `wf_ffb3474e-d8a`; direct `mcp__trestle-fields__*` calls this session
for `Media.MediaCategory`, `MediaClassification`, `MediaType`, `ImageOf`, `ResourceName`;
Maya's direct live-row queries (RLS-associated `MediaCategory` subset and population,
`ResourceName` population by domain, `MediaClassification` Lookup-catalog-vs-`$metadata` and
actual-row-casing); `lib/media/listing-media-resolver.ts`, `lib/media/media-sync-service.ts`,
`lib/search/crm-idx-mapper.ts` read directly at PR #647 HEAD.
