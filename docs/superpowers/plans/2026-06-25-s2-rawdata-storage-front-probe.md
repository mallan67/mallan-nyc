# S2 storage-front probe — `listings.raw_data` JSON (READ-ONLY report)

> **REPORT-ONLY. No strip, no SQL writes, no migration, no reclaim, no downgrade, no branch
> creation; S1 rollback branches untouched.** Read-only DB probe (cold-waterfall, read-only txn,
> ROLLBACK) + repo consumer scan. Date 2026-06-25 · #415. Methodology: the Step-4 probe plan.

## Headline: 🔴 NO-GO on stripping `raw_data`. Unlike S1 compliance (a redundant copy), `raw_data`'s bulk is **render-critical and non-redundant** — `PublicRemarks` (the listing description, ~144 MB, now load-bearing after S1) plus render-DTO-derived fields. The only big safe lever is **terminal `raw_data` via the archive path, which is DEFERRED to the archive eligibility-clock fix.**

## 1. Size [DB-measured]
- **Total ≈ 267 MB stored** (`pg_column_size`, i.e. compressed/TOAST). Terminal **216 MB** (92,810 rows) · live/other **51 MB** (17,259 rows). avg **2,550 B/row**, max **20 kB**. 0 null; 34 non-object scalar `raw_data` rows.
- **Uncompressed per-key weights** (text length — compresses down in storage): **`PublicRemarks` ≈ 144 MB** (terminal 112 / live 32) · **`Media` ≈ 30 MB** (live 30 / terminal 0.2) · then small: `LaundryFeatures` 2.4 MB, `ExteriorFeatures` 1.5 MB, `Appliances` 0.9 MB, `InteriorFeatures` 0.8 MB, `Cooling` 0.5 MB, `VirtualTourURLUnbranded` 0.2 MB, rest < 0.1 MB. (`PrivateRemarks`/`ShowingInstructions`/`SyndicationRemarks` = 0 — private fields are stripped before storage.)
- Largest rows are media-array-heavy live `Pending` listings (e.g. one with 272 kB of Media text compressing into a 20 kB row).

## 2. Key classification
| Class | Keys | Notes |
|---|---|---|
| **Render-critical** | **`PublicRemarks`** (description), `VirtualTourURLBranded/Unbranded`, `PreviousListPrice`, `AvailabilityDate`, `OnMarketDate`/`OffMarketDate`/`CloseDate`, `LeaseAmount`/`LeaseAmountFrequency`, `ActivationDate` | the public DB DTO derives virtualTourURL / previousListPrice / DOM / lease / availability / on-close dates **only** from `raw_data`; `page.tsx` reads `PublicRemarks` (post-S1 fallback). **Not removable without re-sourcing.** |
| **Search/filter-critical** | `PropertySubType`, `CommonInterest`, `BedroomsTotal`/`Bathrooms*`, `LivingArea`, `YearBuilt`, feature arrays | mostly mirrored by typed columns / `features`; raw SQL `extractSavedProfileValues` reads `raw_data` (`buildings/search`) |
| **Media-critical** | **`Media`**, `PhotosChangeTimestamp`, `PhotosCount` | **redundant** with the `media` JSON column + `listing_media` table; kept only for the compliance-audit photo count + virtualTour |
| **Compliance/RLS/IDX** | `Permission(s)`, `InternetEntireListingDisplayYN`, `InternetAddressDisplayYN`, `InternetAutomatedValuationDisplayYN`, `InternetConsumerCommentYN`, `MlsStatus`, `StandardStatus`, `OwnerOptOut`, `SyndicateTo` | mirrored by typed gate columns, but kept as the gate-helper re-derive source + RLS reference |
| **CRM/seller/landlord** | `ListingKey`, `SourceSystemKey`, agent/office fields, FARE fee fields (`MoveInCosts*`, `OngoingFees`, `AdditionalFee*`), `AssociationFee`, `TaxAnnualAmount` | CRM PATCH merges `raw_data`; SALE-FORM hydrates from it |
| **Duplicate of typed columns** | `ListPrice`, `BedroomsTotal`, `BathroomsFull/Half`, `LivingArea`, `City`, `PostalCode`, `StandardStatus`, `ModificationTimestamp`, `ListingContractDate`, `ListAgent*` | typed columns exist (see §4) — readable from columns IF readers migrate |
| **Stale/debug/no-longer-used** | none material | `raw_data` is already slimmed to `RAW_DATA_KEEP_FIELDS` (~110 keys); private/debug fields already excluded. No dead-weight to prune. |

## 3. Consumers (repo scan — `raw_data` is read far more widely than `compliance` was)
- **Listing detail render** — `app/listing/[...slug]/page.tsx` (`PublicRemarks`), `lib/idx/db-to-public-dto.ts` + `app/api/listings/route.ts` (virtualTourURL / previousListPrice / DOM / lease / availability / on-close dates).
- **Cards/search** — `app/api/listings`, `app/api/listings/suggest`, `app/api/listings/building`; raw SQL `app/api/buildings/search/route.ts` → `extractSavedProfileValues(raw_data, …)`.
- **Public DTO** — derives the above; PublicRemarks now sourced from `features`/`raw_data` (S1).
- **CRM loaders** — `app/api/crm/listings/[id]/route.ts` (PATCH merges `raw_data`), `…/validate`, `…/status` (reads `ClosePrice`), `reset-sync`; `public/crm/SALE-FORM-REDESIGN.html` hydrates from `raw_data`.
- **Syndication** — `lib/syndication/*` (reference fields).
- **Display gate** — typed columns are the source of truth; `raw_data` is a re-derive fallback only.
- **Closed comps / CMA** — `scripts/comps/by-property.ts`, `lib/comps/*`, `lib/cma/engine.ts` (read `ClosePrice`/`CloseDate` etc. from `raw_data`).
- **Archive summary** — `data-retention` derives `close_price`/`close_date`/`original_list_price` from `raw_data` (the archive-critical reads).
- **Sync/reconcile** — `lib/idx/sync.ts` writes/slims `raw_data` every upsert; `feed-reconcile`, `import-closed`, prospects/research, compliance/audit (photo count from `raw.Media`).

## 4. Fields already typed (readable from columns instead of `raw_data`)
`ListPrice`→`list_price` · `BedroomsTotal`→`bedrooms_total` · `BathroomsFull/Half`→`bathrooms_full/half` · `LivingArea`→`living_area` · `City`→`city` · `PostalCode`→`postal_code` · `StandardStatus`→`status` · `PropertyType/SubType`→`property_type/sub_type` · `ListingType`→`listing_type` · `ModificationTimestamp`→`modification_timestamp` · `ListingContractDate`→`listing_contract_date` · gate flags→`idx_display_yn`/`internet_*`/`participant_only`/`owner_opt_out`/`rls_eligible` · `ListAgent*`→the 8 typed agent columns · DOM→`days_on_market`. **These are duplicated**, but several render paths still read the `raw_data` copy → a reader-migration is required before the duplicates could be pruned (and the per-row scalar savings are small).

## 5. Fields that MUST remain in `raw_data` (no safe alternative today)
- **`PublicRemarks`** — the canonical listing description; no typed home; render reads it (and the S1 compliance copy is gone). **Load-bearing.**
- **Render-DTO-derived, not-yet-typed:** `VirtualTourURL*`, `PreviousListPrice`, `AvailabilityDate`, on-close dates, `LeaseAmount*` — render derives these only from `raw_data`.
- **Archive close-terms:** `ClosePrice`/`CloseDate`/`OriginalListPrice` — the archiver + comps read these from `raw_data`.
- **Sync identity / restoration:** `ListingKey`/`SourceSystemKey`/`ModificationTimestamp`/`OriginatingSystem*` — change detection + re-fetch identity.
- **FARE / fee fields** — legal display (rentals).

## 6. Terminal-only vs live-row opportunities
- **Terminal `raw_data` ≈ 216 MB** — terminal listings are NOT publicly rendered → the safe path is the **archive drain** (the archiver extracts close terms, then nulls `raw_data` atomically). **This is the single biggest safe lever** — but it is **gated on the archive eligibility-clock fix** (P2 finding: the drain currently reaches ~0 rows because the eligibility clock is contaminated). So terminal `raw_data` reduction = **DEFER to the archive-clock fix**, not a direct strip.
- **Live `raw_data` ≈ 51 MB** — render-critical. Dominated by `PublicRemarks` (32 MB, must stay) + `Media` (30 MB uncompressed, redundant). Only a **narrow `Media` key-prune** is plausible, and only after migrating the 2 `Media`-from-`raw_data` readers (compliance-audit photo count + virtualTour) to `listing_media`. Modest compressed yield; real work.

## 7. Safe removable MB by category (no writes proposed)
| Category | Uncompressed | Safe to remove now? |
|---|---|---|
| `PublicRemarks` (~144 MB) | 144 MB | **No** — render-critical / load-bearing |
| `Media` (~30 MB, live) | 30 MB | **Only after** migrating audit/virtualTour readers to `listing_media` (narrow future prune; less once compressed) |
| Typed-duplicated scalars | small (~MB-scale) | Only after a reader normalization migration; **low yield** |
| Render-DTO-derived (virtualTour/prevPrice/dates/lease) | small | **No** — render derives only from `raw_data` (or normalize first) |
| **Terminal `raw_data` (216 MB)** | — | **Via the archive drain, DEFERRED to the archive-clock fix** (not a strip) |
- **Net safely-removable *now* by a direct strip: ≈ 0 MB.** Every lever needs a prerequisite (archive-clock fix, or a reader migration).

## 8. Compare against S1
| | S1 `compliance` | S2 `raw_data` |
|---|---|---|
| Nature | redundant Trestle COPY (PublicRemarks 100% in raw_data; gate flags in typed cols) | **canonical store** of the description + render-derived fields |
| Render dependence | one removable fallback (re-pointed to raw_data) | **deep** — DTO derives multiple fields only from raw_data; PublicRemarks load-bearing |
| Redundancy | ~100% redundant → safe strip | mostly **non-redundant**; only `Media` (~30 MB) is redundant |
| Outcome | stripped (202 MB → 541 kB), clean | **NO-GO on strip**; terminal via archive (gated), live stays |

## 9 & 10. Recommendation + go/no-go
🔴 **NO-GO — leave `raw_data` intact as a direct strip target.** The realistic, safe path is a **combination**:
1. **Terminal (216 MB) → defer to the archive eligibility-clock fix** (already scoped: `2026-06-24-archive-eligibility-clock-fix-PR-plan.md`). Fixing that clock lets the archive drain extract close terms and null `raw_data` on genuinely-old terminal rows — the biggest safe reduction, on the correct (archive) path, not a strip.
2. **Live (51 MB) → leave intact now.** `PublicRemarks` (render) must stay. The only future option is a **narrow `Media` key-prune** after migrating the audit/virtualTour readers to `listing_media` — small yield; optional.
3. **Typed-duplicate scalars → only via a future typed-field normalization migration** (migrate render/DTO readers off `raw_data` first) — low yield, not worth it for storage alone.
- **Do NOT** attempt a general raw_data strip like S1; the surfaces are fundamentally different (render-critical, non-redundant).
- **Free-tier context:** even the full terminal-archive path (~216 MB, gated) + Media (~30 MB) wouldn't be a clean standalone strip; combined with S1's ~202 MB it moves the needle but the DB stays over the ~477 MiB Free cap. $19 Launch remains the floor.

## Hard limits honored
Report only. Read-only queries. No strip, SQL writes, migration, branch creation, reclaim, or downgrade. S1 rollback branches untouched.
