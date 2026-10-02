# Media resource contract — PR #647 raw-mapper convergence (2026-10-02)

Kept strictly separate from `docs/audits/raw-mapper-property-contract-resolution-2026-10-02.md`
per Maya's explicit instruction: "Property and Media are separate Cotality resources and
must be verified separately... Do not flatten them into one old mapper shape and do not
infer Media behavior from Property fields." No Property field is re-litigated here; where a
Media field shares a name with a Property field (`PropertyType`, `StandardStatus`,
`InternetEntireListingDisplayYN`, `ListOfficeMlsId`, etc.), that is a **separate field
instance** on a separate resource, called out explicitly, never merged into one row.

**Method:** workflow `wf_ffb3474e-d8a` (5 parallel agents: Media field contract, a
14-case classifier test, a relationship/`$select`-gap audit covering every current Media
call site, plus lighter OpenHouse and CustomProperty passes) + direct `mcp__trestle-fields__*`
calls this session confirming `MediaCategory` (18 values), `MediaClassification` (7 values,
including that title-case and ALL-CAPS are distinct real members, not case variants),
`MediaType` (44 values, pure file format, also case-duplicated), `ImageOf` (92 values, room
tagging), and `ResourceName` (5 values: Building, Contacts, Member, Office, Property).

---

## 1. Media contract (field-by-field)

| Field | Live contract | Current Mallan select/usage | Risk |
|---|---|---|---|
| `MediaKey` | String(20), **Nullable: FALSE**. | Selected 2 of 3 `sync.ts` sites + `media-sync.ts`'s `defaultFetchMedia` (fully enforced there: required, drives R2 identity); selected-but-discarded in `fetch.ts`'s `fetchListingMedia()`. | Only one of ~6 call sites enforces it despite the schema guarantee. |
| `MediaURL` | String(8000), nullable. | Selected everywhere; `$filter` precondition in 2 places. | Its text is used as a content-type signal (`TRESTLE_DOCUMENT_URL_PATTERN`, and primarily in `fetch.ts`'s inline classifier) — the exact URL-as-content-type trap the live "DOCUMENT-Jpeg" case demonstrates. |
| `MediaCategory` | Enum, nullable, 18 values: `Addendum, AerialView, AgentPhoto, BrandedVirtualTour, Disclosure, Document, FloorPlan, Map, OfficeLogo, OfficePhoto, Other, Photo, RentalDocuments, Restriction, Survey, Topography, UnbrandedVirtualTour, Video`. No bare `VirtualTour`. | Selected everywhere; primary signal for all three classifiers tested. | See Section 3 — the primary signal, and primary site of the proven defects. |
| `MediaClassification` | Enum, nullable, 7 values: `Document, Floorplan, Photo, Video, PHOTO, DOCUMENT, VIDEO` — title-case and ALL-CAPS are distinct real members. | Selected only in `app/api/media/batch/route.ts` detail mode and `media-sync.ts`. The one place that reads it (`classifyMediaItem`) only checks `cls === 'document'` — the dedicated `Floorplan` member is never checked by name. | A real semantic signal that's almost entirely unused, and misused where it is used (see case 13, Section 3). |
| `MediaType` | Enum, nullable, 44 values, pure file format (`Jpeg`/`jpeg`, `Pdf`/`pdf`, etc., case-duplicated). No content-type semantics. | Selected ONLY at `fetch.ts:609`, and confirmed **fetched and never read** there. | The one call site that ever requests it throws the value away unread — the given facts' core warning, confirmed in the most literal way possible. |
| `Order` | Int32, nullable. | Selected everywhere; drives gallery ordering. | Presentation ordinal only (per existing #575 documentation), per-`MediaCategory`, reassigned on reorder — not identity. `MediaKey` owns identity. |
| `ImageOf` | Enum, nullable, 92 values — room/location tagging, orthogonal to content-type. | **Never selected anywhere**, repo-wide. | Unused, not misused — nothing conflates it because nothing touches it. |
| `ShortDescription` | String(50), nullable. | Selected in 3 of the call sites. | Used as a free-text keyword fallback (`'floorplan'`, `'video'`, `'virtual tour'`, `'3d tour'`, `'matterport'`) — the same text-inference trap class as `MediaURL`. |
| `LongDescription` | String(1024), nullable. | **Never selected anywhere.** | Fully unused. |
| `PreferredPhotoYN` | Boolean, nullable. | Selected everywhere. | Not authoritative alone — `resolveListingMedia` independently computes `isPrimary`; this is only a sort nudge/tie-break. |
| `MediaStatus` | Enum, nullable, 3 values: `Active, Deleted, Other`. | Selected everywhere; `Deleted` excluded via `$filter` or explicit tombstone. | `Other` is never branched — treated identically to `Active` everywhere; whether Cotality emits it in practice is unverified. |
| `ResourceRecordKey` | String(20), **nullable** per live metadata (despite being the primary join key in practice). | Selected everywhere; primary join/filter key. | Live-confirmed (ListingKey `1191869357`, 18 rows): `Media.ResourceRecordKey = Property.ListingKey`. No call site null-checks it. |
| `ResourceRecordID` | String(255), nullable. | Fallback join key (`ResourceRecordKey \|\| ResourceRecordID`) almost everywhere, matching Trestle's own "can duplicate across MLOs" guidance. | Consistently treated as lower-priority — correct per that guidance. |
| `ResourceName` | Enum, nullable, 5 values: `Building, Contacts, Member, Office, Property`. | **Never selected or filtered on anywhere.** | **Structural gap** — see Section 2. |
| `InternetEntireListingDisplayYN` (Media's own) | Boolean, nullable. Confirmed to exist as a distinct field ON MEDIA, separate from Property's own copy. | **Never selected on Media anywhere** (Property's copy is selected elsewhere — a different field, different query). | No relationship-proof exists for whether Media's copy ever diverges from Property's. |
| `ModificationTimestamp` | DateTime, nullable. | Selected in `fetch.ts`'s `$expand` path; load-bearing in `media-sync.ts` (drives half the sync watermark, `mismatchModificationTs`). | Confirms `media-sync.ts` (the hourly cron ingest pipeline) as a major, previously-under-examined Media consumer. |
| `MediaModificationTimestamp` | DateTime, nullable. | Selected and used only in `media-sync.ts` — drives `photos_change_timestamp`, mismatch bookkeeping, #530 no-op suppression. | Together with `ModificationTimestamp`, the actual production watermark for `feed-reconcile`, `listing-expiration`, and `one-cycle` crons. |
| `OffMarketDate` (Media's own) | Date(10), nullable. Confirmed to exist. | **Never selected on Media** — every repo hit is Property's own copy. | Fully unused; no relationship-proof vs. Property's copy. |
| `Permission` (Media's own) | Multi-enum, 20 values: `AgentOnly, ComingSoon, CompSold, DownPaymentResourceNo, DownPaymentResourceYes, FirmOnly, History, IDX, Idx, MemberInactive, Officeidxoptout, OfficeInactive, OfficeOnly, OfficeSuspended, PhotoOptedOut, Private, Public, SyndicateOptOut, VOW, Vow`. | Selected and used only in `media-sync.ts` (`!== 'Public'` → skip). | **Schema risk:** exact-string equality against a documented multi-value/comma-joined field. A `'Public,IDX'` row would fail this check and be wrongly skipped. Not observed live — a verified schema risk, not a confirmed failure. |
| `ListingPermission` | Multi-enum, 18 values — not the same vocabulary as `Permission`. | **Never selected anywhere.** | Distinct field; current code reads only `Permission`. Do not conflate in Stage B. |
| `PropertyType`/`PropertySubType`/`StandardStatus` (Media's own copies) | Confirmed to exist as separate fields on Media. | **Never selected on Media** (Property's own copies are read elsewhere). | Fully unused; no relationship-proof that a photo row's own status/type ever lags its parent listing. |
| `ListAgentKey`/`ListOfficeKey`/`ListOfficeMlsId` (Media's own copies) | Confirmed to exist. | **Never selected on Media** (`ListOfficeMlsId` IS read, but only Property's instance — confirming the same field name is read on one resource and ignored on the other). | Illustrates the task's exact framing: same name, two resources, only one read. |

---

## 2. Relationship proof — Media ↔ Property

**Proven:** on a live listing (`ListingKey = 1191869357`, 18 Media rows), `Media.ResourceRecordKey = Property.ListingKey` and `Media.ResourceName = 'Property'`. Every current call site implements the key-match side of this join. **At least 12 distinct `$select`/`$expand` call sites were found** (not the 3 originally assumed): `lib/idx/fetch.ts` (2 functions), `lib/idx/sync.ts` (3 near-duplicate blocks), `app/api/media/batch/route.ts` (2 modes), `lib/idx/media-sync.ts`'s `defaultFetchMedia` (the hourly cron ingest pipeline — not previously examined), `app/api/cron/feed-reconcile/route.ts`'s orphan-create path, `app/api/idx/search/route.ts`'s lazy-photo backfill, `app/api/agents/[slug]/listings/route.ts`'s `batchFetchPhotos`, plus two offline scripts.

**Not proven, and currently unguarded:** **zero of these 12 call sites filter or check `ResourceName`.** Safety rests entirely on the unverified assumption that Cotality guarantees key uniqueness across the other four `ResourceName` domains (Building/Contacts/Member/Office) too. This is a structural gap, not a confirmed failure — no evidence a collision has ever occurred.

**Gate-level finding:** `lib/compliance/gates.ts`/`trestle-mapper.ts`'s display-gate functions read only **Property-level** `Permission`/`InternetEntireListingDisplayYN` — by construction, not omission. Separately, `media-sync.ts` runs its own **Media-row-level** `Permission` gate, but only on the two ingest paths that select `Media.Permission`; the other ~10 call sites have no Media-level permission check at all. Every consumer of `Permission` anywhere (Property or Media level) does exact-string equality against a schema-documented multi-value field — a shared, verified schema risk across both levels, not an observed failure.

---

## 3. Classifier verdict

Three classifiers tested against 14 constructed cases spanning the real live enums, directly against PR #647 HEAD (`9a05ac6`):

- `classifyMediaItem` — `lib/media/listing-media-resolver.ts:120-165`
- `classifyTrestleMediaCategory` — `lib/media/media-sync-service.ts:142-166`
- `classifyMediaCategory` — `lib/search/crm-idx-mapper.ts:32-38` (dead)

**Results: 6 PROVEN_DEFECT, 2 LEGACY_DISAGREEMENT, 6 ALL_AGREE_CORRECT.**

The 6 PROVEN_DEFECTs, all traced to exact source lines:
1. `MediaCategory='Document'` + a `.jpg` URL matching the Document-URL pattern → `classifyMediaItem` wrongly returns `'floorplan'` (line 150's `TRESTLE_DOCUMENT_URL_PATTERN`) — conflating Document with FloorPlan, the exact live anomaly Maya found.
2. `MediaCategory='FloorPlan'` (real spelling) → the dead `crm-idx-mapper.ts` classifier wrongly returns `'Photo'` (line 34's space-dependent `.includes("floor plan")` can never match the real no-space value).
3. `MediaCategory='BrandedVirtualTour'` → `classifyMediaItem` wrongly returns `'unknown'` (line 158 has no no-space `cat.includes('virtualtour')` check — **correction to the prior Property-contract doc's #12**: the fallthrough is `'unknown'`/displayed as `mediaType: 'Unknown'`, not silently `'Photo'` as previously stated).
4. `MediaCategory='UnbrandedVirtualTour'` → same bug, same wrong `'unknown'` result.
5. `MediaCategory='Photo'` + `MediaClassification='DOCUMENT'`, no URL → `classifyMediaItem` wrongly returns `'floorplan'` (line 144's `cls === 'document'` overrides a legitimate Photo category and conflates Document with FloorPlan a second, independent way).
6. `MediaCategory='Addendum'` + a `.pdf` URL → `classifyMediaItem` wrongly returns `'floorplan'` again (line 148's blanket `/\.pdf(\?|$)/` regex — a third independent Document-vs-FloorPlan conflation path inside the same function).

**Per-classifier Stage B verdict:**
- **`classifyMediaItem` — KEEP, FIX.** Canonical and most-used (feeds `resolveListingMedia`, the public DTO, the CRM mapper, `batch/route.ts` detail mode). Defective in 5 of 6 proven cases via three independent conflation paths (lines 144, 148, 150) that all treat "document-like" as "floorplan," plus the virtual-tour gap (line 158). It also has the broadest signal surface (URL, description, `MediaClassification`) — fix the three branches, don't discard the function.
- **`classifyTrestleMediaCategory` — KEEP as-is for its narrower, documented purpose.** Zero proven defects across all 14 cases; the only one that correctly classifies `FloorPlan` and both real virtual-tour values, precisely because it has no URL/description parameter and so cannot fall into the document-conflation trap. Its clean record partly reflects a narrower signal surface by design (R2-namespace routing only) — it silently defaults ~13 of 18 real `MediaCategory` values to `Photo`.
- **`classifyMediaCategory` (crm-idx-mapper.ts) — DELETE.** Re-confirmed zero production callers (2 repo hits: its own definition, its own test). Broken against 3 of 14 cases via the identical space-dependent bug `media-sync-service.ts`'s own changelog already documents fixing elsewhere.

**No single canonical classifier is recommended yet** — explicitly missing: a live population sample of how often `MediaCategory` and `MediaClassification` actually disagree on real rows; a product decision on whether defaulting ~13 document-adjacent categories to `Photo` is acceptable; whether `MediaClassification` should become a second input to whichever function survives; and a check of `resolveListingMediaFromRows`'s separate DB-row fallback (`r.media_category ?? r.media_type`), not exercised by any of the 14 cases.

---

## 4. Other resources (lighter-weight passes)

**OpenHouse** (actively queried — `app/api/open-houses/route.ts`, `app/api/listings/route.ts`, `lib/open-houses/upcoming-open-houses.ts`):
- **PROVEN_DEFECT:** `app/api/listings/route.ts`'s `openHouse=true` filter omits `OpenHouseType eq 'Public'` (present in the other two files) — a listing whose only current OpenHouse row is `Private`/`Broker`/`Office`-typed still satisfies this filter and surfaces to public search.
- **PROVEN_DEFECT:** where the `'Public'` filter IS applied, it's an exact match against one literal value, missing the two other genuinely-public live enum values `LivestreamPublic` and `InPersonAndLivestreamPublic` — those are silently excluded from `/open-houses` and the "next open house" banner.
- Core fields (`OpenHouseDate`, start/end time, `OpenHouseStatus`, `AppointmentRequiredYN`, remarks) match live types with no mismatch.

**CustomProperty** (confirmed never actually `$expand`ed in production — `expandCustomProperty` flag exists but is never set `true` outside a test fixture):
- **PROVEN_DEFECT (reconfirmed):** `lib/idx/mapping.ts` reads `AdditionalFee*` fields as flat `raw.*` with zero `$expand` — structurally non-functional.
- **PROVEN_DEFECT (reconfirmed):** the bare field name `FeeFrequency` referenced in code does not exist on live Trestle; the real field is `AdditionalFeeFrequency`.
- **New, time-sensitive finding:** `main`'s CURRENT `lib/idx/trestle-mapper.ts` (not this PR's pinned reference — a newer, different blob) has independently grown a `B30_FARE_ACT_FEES` block doing the identical flat-`pick()` read into the persisted `features` column. `pick()` silently drops undefined keys, so `features.AdditionalFee*` is silently absent from every listing persisted by `main` today. **This is live on production `main` right now, independent of this PR** — flagging for Maya's attention outside the convergence batch, since `main` is frozen and this PR's tooling cannot touch it.
- `lib/search/crm-idx-mapper.ts`'s `CustomProperty[0]`-unwrapping pattern is confirmed correct and is the template to copy once `$expand=CustomProperty` is actually enabled.

---

## 5. Correction to the Property-contract doc

- **Confirms** PROVEN_DEFECT #12 (classifyMediaItem's missing virtual-tour check) but **corrects its stated consequence**: the real fallthrough is `'unknown'`/`mediaType: 'Unknown'`, not a silent mislabel as `'Photo'`. Production rows exhibiting this bug are findable by searching for `mediaType = 'Unknown'`, not misfiled `Photo` rows.
- **Confirms** the dead `crm-idx-mapper.ts` classifier verdict (delete), now with exact failing cases (3, 4, 5 above) rather than a general description.
- **Corrects a premise**: the "PhotosCount/image-count heuristic" was never one of that document's 16 numbered PROVEN_DEFECTs — it appeared only in the LEGACY_UNVERIFIED population-question list. The three mappers ARE inconsistent here (`crm-idx-mapper.ts` heuristic-combines `Property.PhotosCount` with a Media-derived count; the other two just pass `PhotosCount` through), but whether that's wrong depends on `PhotosCount`'s live semantics (Photo-class only, or everything?), which remains unverified. Stays LEGACY_UNVERIFIED — not promoted to a defect on this evidence. Also note: `PhotosCount` is a **Property** field, not a Media field — this is a Property↔Media boundary question, not part of the Media contract itself.

---

## 6. Office and Member — confirmed out of scope

Neither is queried as an independent Cotality resource anywhere in current Mallan code (not selected, `$expand`ed, or filtered on) — confirmed by repo-wide search, not inferred. This applies to Media's own `ListOfficeKey`/`ListAgentKey`/`ListOfficeMlsId` fields too (Section 1) and to Office/Member as resources in their own right. Should not be re-litigated without new evidence.

---

**Sources:** workflow `wf_ffb3474e-d8a` (5 agents, live `mcp__trestle-fields__*` calls + direct `gh api`/`gh search code` reads against PR #647 HEAD `9a05ac69666e2db1f3b46b4af743aa9228b7794b`); direct `trestle_list_fields`/`trestle_get_picklist`/`trestle_validate_field` calls this session for `Media.MediaCategory`, `MediaClassification`, `MediaType`, `ImageOf`, `ResourceName`; `lib/media/listing-media-resolver.ts`, `lib/media/media-sync-service.ts`, `lib/search/crm-idx-mapper.ts` read directly at PR #647 HEAD.
