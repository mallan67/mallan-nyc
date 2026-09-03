# Cotality Media resource — live contract evidence, 2026-08-22

> **STATUS: DATED EVIDENCE. NOT AN AUTHORITY.**
>
> This document records what the live Cotality API returned during one session.
> It is **not** a competing authority to `MALLAN-PLATFORM-MASTER-PLAN.md`, and it
> is **not** a source anyone may cite for a current provider fact. Provider truth
> is the live API; this is the dated record of one reading of it.
>
> **Population counts in this document are observations with a date on them, not
> architecture.** `Photo = 1,395,882` was true at 06:27–06:52 UTC on 2026-08-22.
> It will not be true tomorrow. Nothing in `FIELD_REGISTRY`, in a mapper, in a
> filter or in a test may hard-code a number from this file. What may be promoted
> is *stable structure* — that a field exists, its declared type, its enum
> vocabulary, an operator restriction — and each promotion cites this document by
> name so the promoted claim can be re-derived.

| | |
|---|---|
| **Provider** | Cotality API |
| **Endpoint** | `https://api.cotality.com/trestle/odata` |
| **Auth** | `client_credentials`, scope `api`, preview environment credentials |
| **Resource** | `Media` |
| **Session** | 2026-08-22, 06:27–06:52 UTC |
| **Branch** | `fix/neon-p0-event-driven-wake-2026-08-16` |
| **Evidence trail** | 473 recorded HTTP exchanges — 375 × `200`, 98 × non-`200` |

---

## 1. Method

Every fact below came from an HTTP response received during the session named
above. Per `CLAUDE.md` §A.0, a repo constant, a mapper table, a code comment, a
committed `artifacts/metadata.xml`, a prior audit, RESO documentation and model
memory are **not** evidence and were not used as such.

**Probe helper.** All queries went through one script that appends
`{at, url, status, ok, bytes, excerpt}` to an `evidence.jsonl` line per request,
so any claim here traces to the exact exchange that produced it. The helper
**fails loud**: a non-`200` prints `PROVIDER_REJECTED` with the status and body
and exits `3`. It has no path that turns an HTTP failure into `0`, `null` or `[]`.

**Three states, never collapsed.**

| state | meaning |
|---|---|
| `SUPPORTED` | asked, answered `200`, here is the value |
| `PROVIDER_REJECTED` | asked, answered `4xx`/`5xx`, here is the status and body |
| `UNVERIFIED` | not asked, or could not be asked |

A member returning `0` rows is `VERIFIED_ZERO_POPULATION_CURRENT_FEED`. A member
whose name the service refuses as an enum constant is `PROVIDER_REJECTED`. **These
are different findings and are reported differently throughout.**

**`$metadata` was read in full.** The document is 1,946,777 bytes. An early read
truncated at 200,000 bytes and produced "no `EnumType` declared" for every Media
enum — a false negative caused by the tool, not the provider. It was re-fetched
whole to a file before any enum claim was made. A subagent working from the
truncated view reported `MediaClassification` as having 3 members; the full
document shows 6. **The truncated reading was wrong and is not used here.**

---

## 2. Declared shape

`Media` declares **56 properties** plus a `Property` navigation property.

Only `MediaKey` carries `Nullable="false"`. The other 55 omit the attribute.
Under OData 4.0 the default is nullable — that is an inference from the
specification, **not** an observation, and is marked as such.

There is **no `ListingKey` and no `ListingId` on `Media`**. Listing linkage is
carried instead by `ResourceRecordKey`, `ResourceRecordKeyNumeric` and
`ResourceRecordID`, qualified by `ResourceName` (whose vocabulary includes
`Property`). `Media` additionally declares `OriginatingSystemResourceRecordKey`,
`OriginatingSystemResourceRecordId` and `SourceSystemResourceRecordKey`.

**These are several linkage fields, not one.** `ResourceRecordKey` is the
stronger identity domain and is what Mallan reconciles canonical media through;
`ResourceRecordID` is a provider linkage and evidence field, present and usable,
not absent. Nothing here weakens the existing rule that media joins stay in the
provider key domain rather than being repointed at a Mallan local id.

Gate-shaped properties, as declared: `HumanModifiedYN`,
`InternetEntireListingDisplayYN`, `PreferredPhotoYN`, `Permission`,
`ListingPermission`, `SyndicateTo`, `MediaAlteration`, `MediaStatus`,
`MediaStatusDescription`, `StandardStatus`, `RecordSignature`, `X_MediaStream`.

### 2.1 `MediaCategory` — 18 members

Read from the full `$metadata`. Underlying type `Edm.Int64`.

```
Addendum=0  AerialView=1  AgentPhoto=2  BrandedVirtualTour=3  Disclosure=4
Document=5  FloorPlan=6   Map=7         OfficeLogo=8          OfficePhoto=9
Other=10    Photo=11      RentalDocuments=12  Restriction=13  Survey=14
Topography=15  UnbrandedVirtualTour=16  Video=17
```

**`VirtualTour` is not a member.** A filter on it is rejected:

```
$filter=MediaCategory eq 'VirtualTour'   ->  HTTP 400
"The string 'VirtualTour' is not a valid enumeration type constant."
```

The branded and unbranded tour categories are separate members. Any Mallan
mapping that produces a canonical `VirtualTour` from `MediaCategory` is mapping
from a value this vocabulary does not contain.

### 2.2 `MediaClassification` — 6 members, 6 distinct values

```
Document=0   Photo=1   Video=2   PHOTO=3   DOCUMENT=4   VIDEO=5
```

**These are not casing aliases.** Six names, six distinct `Edm.Int64` values.
This single fact explains the operator anomaly in §5.1 and must not be lost.

### 2.3 `MediaStatus` — 3 members

```
Active=0   Deleted=1   Other=2
```

### 2.4 `MediaType` — 44 members

File format, not content type: `Bmp, Doc, Docx, Gif, Htm, Html, Jpeg, Mov, Mp4,
Mpeg, Pdf, Png, Pptx, Quicktime, Rtf, Svg, Tiff, Txt, Wmv, Wps, Xls, Xlsx` and
the same 22 again in lower case. RESO separates `MediaType` (format) from
`MediaCategory` (content). `lib/idx/mapping.ts` already documents this
correctly.

---

## 3. Population census — **2026-08-22 observation, not architecture**

Total `Media` rows: **1,978,250**.

### 3.1 `MediaCategory` — every one of the 18 members probed individually

| member | rows | state |
|---|---:|---|
| `Photo` | 1,395,882 | SUPPORTED |
| `FloorPlan` | 582,367 | SUPPORTED |
| *(null)* | 1 | SUPPORTED |
| `Addendum` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `AerialView` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `AgentPhoto` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `BrandedVirtualTour` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Disclosure` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Document` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Map` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `OfficeLogo` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `OfficePhoto` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Other` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `RentalDocuments` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Restriction` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Survey` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Topography` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `UnbrandedVirtualTour` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `Video` | 0 | VERIFIED_ZERO_POPULATION_CURRENT_FEED |
| `VirtualTour` | — | **PROVIDER_REJECTED** — not a member |

**The census closes exactly:** `1,395,882 + 582,367 + 1 = 1,978,250`. Nothing is
unaccounted for, so the sixteen zeros are genuine zeros and not a paging artefact.

**Read this as: "on 2026-08-22 this licence carried only photographs and floor
plans."** Not as: "Cotality only has photographs and floor plans." Sixteen
declared members are dead *on this feed today*. A category that is zero today can
be populated tomorrow without notice, which is precisely why §7 recommends the
zero-population set be pinned by a test rather than assumed.

### 3.2 `MediaClassification`

| member | rows |
|---|---:|
| `Photo` | 1,395,883 |
| `PHOTO` | 1,395,883 |
| `Document` | 582,367 |
| `DOCUMENT` | 582,367 |
| `Video` | 0 |
| `VIDEO` | 0 |

`1,395,883 + 582,367 = 1,978,250` — closes exactly.

`eq 'Photo'` and `eq 'PHOTO'` return the identical count, i.e. `eq` resolves the
member name case-insensitively across two distinct members. See §5.1 for why
`ne` does not behave symmetrically.

### 3.3 `MediaStatus`

| member | rows |
|---|---:|
| `Active` | 1,978,250 (100%) |
| `Deleted` | 0 |
| `Other` | 0 |

**There is no queryable deletion signal on this resource today.** Any incremental
sync expecting to observe deletions here needs a different mechanism.
`lib/idx/fetch.ts:139` already documents this, recording 1,969,243 Active from an
earlier session; today's 1,978,250 shows the feed grew ~9,000 rows since. The
prior note and this measurement corroborate each other.

### 3.4 `PreferredPhotoYN` — tri-state, and mostly absent

| filter | rows |
|---|---:|
| `eq true` | 34,284 |
| `eq false` | 35,205 |
| `eq null` | 1,908,699 |

Populated on **3.5%** of rows. Treating it as a two-state boolean mishandles the
other 96.5%. Sum = 1,978,188 — see §5.4.

---

## 4. The single null-category row

The one row in 1,978,250 with `MediaCategory: null`, retrieved in full:

```json
{
  "MediaKey": "2003600763305",
  "MediaCategory": null,
  "MediaClassification": "PHOTO",
  "MediaType": "Jpeg",
  "MediaStatus": "Active",
  "Order": 1,
  "PreferredPhotoYN": null,
  "ResourceRecordKey": "1091333591",
  "MediaURL": "…/Media/Property/PHOTO-Jpeg/1091333591/1/…"
}
```

Three independent signals — `MediaClassification: PHOTO`, `MediaType: Jpeg`, and
a `PHOTO-Jpeg` URL segment — agree that this is a photograph.

**What this does and does not establish.** It does **not** establish a semantic
rule that "an absent `MediaCategory` means photograph": **n = 1**. It does
establish that the one row currently affected is classifiable **from surviving
provider evidence that the reader already reads**, without needing a category at
all. That is the basis for the §7 recommendation to classify from corroboration
rather than to keep an unproven `null → Photo` assumption.

The count difference in §3.2 is this row: `MediaClassification eq 'Photo'` is
1,395,883 while `MediaCategory eq 'Photo'` is 1,395,882. Cross-checked directly:

```
$filter=MediaClassification eq 'Photo' and MediaCategory ne 'Photo'   ->  1
```

---

## 5. Operator and capability findings

These matter more than the counts, because they are structural and they silently
corrupt queries rather than failing them.

### 5.1 `eq` and `ne` are not complements on these enums

Measured:

| filter | rows |
|---|---:|
| `MediaClassification eq 'Document'` | 582,367 |
| `MediaClassification eq 'DOCUMENT'` | 582,367 |
| `MediaClassification ne 'DOCUMENT'` | 1,395,883 |
| **`MediaClassification ne 'Document'`** | **1,978,250 — every row** |
| `ne 'Document' and ne 'DOCUMENT'` | 1,395,883 |

The stored value is member `DOCUMENT` (=4). `eq 'Document'` resolves the *name*
case-insensitively and matches those rows. `ne 'Document'` compares
*member-exactly* against member `Document` (=0) and therefore excludes **nothing**.

**Consequence, scoped to what was actually probed:** on `MediaClassification`,
an exclusion written as `ne 'Document'` is a silent no-op. It does not error. It
returns a plausible, wrong set. Any `ne` against `MediaClassification` must
account for the exact stored member and its casing, or be rewritten as a positive
`eq` predicate.

**CORRECTED — this was over-generalised on first writing.** The original text
said the restriction applied to `MediaCategory` as well. It does not, and this
document contained its own counter-evidence: `MediaCategory ne 'FloorPlan'`
(§6.1) and `MediaCategory ne 'Photo'` (§4) were both used successfully here to
establish set relationships, returning `0` and `1` respectively — correct,
meaningful results. The mechanism also cannot arise there: the trap requires a
pair of members differing only in case, and `MediaCategory`'s eighteen members
contain no such pair (§2.1). `MediaStatus`'s three members contain none either.

**The general rule this establishes is about method, not about `ne`:** an
operator behaviour verified on one Cotality enum may not be carried to another
merely because both are enums. Probe the exact field/operator pair before
relying on it. That is the same discipline `$metadata` over-declaration demands
(§5.5) — a declaration, or a behaviour observed next door, is not a capability.

### 5.2 `$filter` on `MediaURL` disagrees with the projection

| filter | rows |
|---|---:|
| `MediaURL eq null` | 1,412,634 (71.4%) |
| `MediaURL ne null` | 565,554 |

Yet the projection returns a non-null `MediaURL` on **100 of 100** rows sampled
(and 400 of 400 across two widely separated offsets in a second run).

**A filter predicate on `MediaURL` cannot be trusted.** A sync using
`$filter=MediaURL ne null` to find media with images would silently discard
~1.41M rows that *do* return one. Mallan does not currently use such a filter;
this is recorded so that nobody adds one.

Root cause is not visible from outside the service. The signed-token shape of the
projected URL suggests it may be computed at projection time rather than stored,
which would explain a filter engine seeing null. **That is a hypothesis, not a
finding.**

### 5.3 `ne false` on a nullable Boolean also excludes nulls

| filter | rows |
|---|---:|
| `InternetEntireListingDisplayYN eq true` | 1,694,026 |
| `InternetEntireListingDisplayYN eq false` | 284,162 |
| `InternetEntireListingDisplayYN eq null` | 62 |
| `InternetEntireListingDisplayYN ne false` | **1,694,026** |

`1,694,026 + 284,162 + 62 = 1,978,250` — the tri-state closes exactly.

But `ne false` returns 1,694,026, **not** the 1,694,088 that excluding only the
`false` rows would give. The 62 null-flag rows are excluded as well — standard
SQL three-valued logic, where `NULL <> FALSE` is `UNKNOWN`.

Direction: **fail-closed**. It hides 62 rows rather than exposing any. See §6 for
why this produces a divergence between two Mallan code paths.

### 5.4 A consistent 62-row shortfall in some tri-state counts

| field | true + false + null | vs total |
|---|---:|---|
| `InternetEntireListingDisplayYN` | 1,978,250 | exact |
| `PreferredPhotoYN` | 1,978,188 | **62 short** |
| `MediaURL` (`eq null` + `ne null`) | 1,978,188 | **62 short** |

Sixty-two rows fall out of some tri-state partitions and not others. The number
is the same as the `InternetEntireListingDisplayYN eq null` count, which may be
coincidence or may not. **Not explained. Recorded as an open question (§8).**

### 5.5 Query capabilities

| capability | state | evidence |
|---|---|---|
| `$count=true` | SUPPORTED | used throughout |
| `$filter` on `MediaCategory` | SUPPORTED | per-member counts in §3.1 |
| `$filter` on `MediaClassification` | SUPPORTED | §3.2, with the §5.1 caveat |
| `$select` of all 56 declared properties | SUPPORTED | one request returned all 56 keys |
| `$apply` / `groupby` / `aggregate` | **PROVIDER_REJECTED** | HTTP 400; every distribution above therefore cost one `$count` per member |
| `$orderby=MediaCategory` | **PROVIDER_REJECTED** | HTTP 400 |
| `$skip` beyond ~1,000,000 | **PROVIDER_REJECTED** | HTTP 400 at `$skip=1038581`; ~49.5% of the resource is unreachable by offset paging |
| `$filter` on `Permission` | **PROVIDER_REJECTED** | provider-level suppression naming RLS and directing to support |
| `$filter` on `X_MediaStream`, `MediaAlteration`, `MediaStatusDescription`, `OriginatingSystemResourceRecordId`, `SourceSystemResourceRecordKey` | **PROVIDER_REJECTED** | "Invalid field … cannot be used for filtering, grouping or ordering" |
| `$filter` on `HumanModifiedYN` | **UNRELIABLE** | `eq null` matches all rows; `eq true`, `eq false`, `ne null` all match 0, while the projection returns `false` — every predicate returns an empty or total set |

**`$metadata` over-declares, confirmed in this session.** Five declared,
selectable properties are query-inert, and a sixth (`Permission` — a permission
gate) is suppressed at provider level. Their populations are therefore
**UNVERIFIED, explicitly not zero.** Separately, the live `Field` resource lists
86 fields for `Media`, 31 more than `$metadata`, and six probed
(`PermissionPrivate`, `MediaURLDirect`, `Nucleus_MediaHost`,
`SyndicationDuplicateYN`, `FlowPriority`, `PathRootID`) return HTTP 400 "not in
metadata". **`Field` is not a capability source either.**

---

## 6. Category ↔ classification ↔ URL shape

### 6.1 `DOCUMENT` classification and `FloorPlan` category are the same set — today

```
$filter=MediaClassification eq 'Document' and MediaCategory ne 'FloorPlan'  ->  0
```

Set-equivalence, not merely equal counts. Every `DOCUMENT`-classified row is
`FloorPlan`-categorised.

**Why this is fragile, and exactly how fragile.** The equivalence holds *because*
`Document`, `Disclosure`, `Addendum`, `Survey`, `Restriction` and
`RentalDocuments` are all zero-population (§3.1). A `DOCUMENT` classification
genuinely spans those categories in the Cotality vocabulary. **The moment any one
of them becomes populated, `MediaClassification === Document ⇒ FloorPlan` starts
misclassifying disclosures and surveys as floor plans.** The inference is exactly
as durable as six zeros that nobody controls.

`lib/media/listing-media-resolver.ts` currently encodes `cls === 'document'` as a
floor-plan signal. It is **correct today and unsafe as a permanent rule** — hence
the §7 recommendation to pin the zero-population set with a test rather than
remove the heuristic.

### 6.2 URL path segment

Sampled 200 rows per category:

| `MediaCategory` | URL segment | rows |
|---|---|---:|
| `Photo` | `/Media/Property/PHOTO-Jpeg/` | 200 / 200 |
| `FloorPlan` | `/Media/Property/DOCUMENT-Pdf/` | 167 / 200 |
| `FloorPlan` | `/Media/Property/DOCUMENT-Jpeg/` | 33 / 200 |

**A floor plan is not necessarily a PDF.** 16.5% of sampled floor plans are
JPEGs served under a `DOCUMENT-` path. A `.pdf` extension test alone would
misclassify those as photographs; the `DOCUMENT-` **path prefix** is what catches
them. This is direct live vindication of `TRESTLE_DOCUMENT_URL_PATTERN` in
`lib/media/listing-media-resolver.ts` — the URL-shape rule is load-bearing, not
belt-and-braces.

Sample size is 400 rows of 1,978,250. Strong, and not a proof of universality.

---

## 7. How Mallan's code stands against this evidence

### 7.1 The display gate is enforced — an earlier claim of mine was wrong

284,162 rows carry `InternetEntireListingDisplayYN = false`. I initially reported
that Mallan's media filter did not gate on it and called it a latent compliance
gap. **That was wrong.** I read the `$filter` strings and missed the row loop
underneath. Every path enforces it:

| path | mechanism |
|---|---|
| `lib/idx/fetch.ts:143` | server-side `InternetEntireListingDisplayYN ne false` |
| `lib/idx/fetch.ts:689` | `records.filter(m => m.…YN !== false)` |
| `app/api/idx/search/route.ts:394` | `if (m.…YN === false) continue;` |
| `app/api/media/batch/route.ts:129, :213` | `if (m.…YN === false) continue;` |

All four `$select` the field, so the check has data to act on. **There is no gap.**

**One genuine residual divergence.** Server-side `ne false` excludes the 62
null-flag rows (§5.3); client-side `!== false` keeps them (`null !== false` is
true). The two paths therefore disagree about 62 rows out of 1,978,250. Both are
defensible; they are simply not the same rule. Recorded, not acted on.

Note also that Mallan treats a null `InternetEntireListingDisplayYN` as
**displayable on `Property`** (the REBNY pre-filter convention, canonicalised in
`memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md`) and as **non-displayable on
`Media`** in the server-side path. Same field name, two resources, opposite null
treatment. Whether that is intended is an open question (§8).

### 7.2 Recommendations, for `FIELD_REGISTRY` promotion

1. **Do not promote `null → Photo` as a registry rule.** Classify from surviving
   provider evidence — `MediaClassification`, the `PHOTO-`/`DOCUMENT-` URL
   segment, `MediaType` — which §4 shows is sufficient for the one affected row.
2. **Do not promote `Document ⇒ FloorPlan` as a semantic.** Keep the heuristic,
   and add a test that fails if any of the six document-family categories becomes
   populated (§6.1). That converts an invisible fragility into a loud one.
3. **Map only what is proven:** `Photo → Photo`, `FloorPlan → FloorPlan`,
   `Video → Video`. Branded/unbranded tour mappings wait for live semantic proof;
   `VirtualTour` is not a member of the vocabulary at all (§2.1).
4. **Everything else stays `needs_probe` / `Unclassified`** rather than guessed.
   `Other` is a *real* member being left ungrouped, which is not the same as a
   value being unreal — raw provider values are preserved in `media_category`
   independently of the Mallan group in `media_type`.
5. **Record the `ne` restriction** (§5.1) in the registry, because it constrains
   executable queries.
6. **Do not add a `MediaURL` null filter** (§5.2).

---

## 8. Open questions — not resolved by this session

1. **Why do 62 rows fall out of some tri-state partitions** but not the
   `InternetEntireListingDisplayYN` one (§5.4)?
2. **Root cause of the `MediaURL` filter/projection divergence** (§5.2). The
   projection-time-computation hypothesis is unverified.
3. **Population of the six non-filterable properties**, `Permission` above all —
   a permission gate whose values cannot be counted. `UNVERIFIED`, not zero.
4. **Is the `Property`/`Media` null-treatment divergence intended** (§7.1)?
5. **Media referencing listings absent from `Property`.** `Property` totals
   591,233 against `Media`'s 1,978,250, and **0 of 389** sampled parent keys of
   `IELD=false` media were present in `Property`. The scope asymmetry is
   established; its cause is not.
6. **Whether the 16 zero-population categories are licence-scoped or genuinely
   absent from REBNY RLS** — a licence question, not answerable by probing.
7. **`$metadata` capability annotations** (`Org.OData.Capabilities.V1`) were not
   examined; they would be the declared counterpart to the runtime 400s in §5.5.

---

## 9. Reproducing this

The probe helper and the full `$metadata` dump live in the session scratchpad,
outside the repository, because the environment file alongside them carries live
credentials. To re-derive any number here:

```
vercel env pull <file> --environment=preview --git-branch=<branch>
set -a && . <file> && set +a
node cot.mjs "Media?$top=0&$count=true&$filter=MediaCategory eq 'Photo'"
```

Re-running will produce **different counts**. That is expected and is the reason
this document is dated and the reason none of its numbers may be promoted.

---

**Related:** `memory/COTALITY-IS-THE-ONLY-AUTHORITY.md` (the rule) ·
`lib/search/canonical/field-registry.ts` (promoted conclusions, each citing this
file) · `memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md` (the null-display-flag
incident) · `lib/media/listing-media-resolver.ts` (the reader whose semantics
§6 and §7 assess).
