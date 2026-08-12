/**
 * Convert Prisma DB listings (exclusives) → PublicListingDTO.
 *
 * This bridges the CRM listing manager (local DB) to the public frontend.
 * When an agent creates a listing in the CRM forms, it gets saved to Prisma.
 * This module maps that DB record to the same DTO shape that Trestle/IDX
 * listings use, so both can appear in the public search results.
 *
 * COMPLIANCE:
 * - Only Active, IDX-eligible listings are included
 * - Owner opt-out and participant-only listings are excluded
 * - Address suppression respected (InternetAddressDisplayYN)
 * - Agent PII stripped (same as Trestle path)
 *
 * @module lib/idx/db-to-public-dto
 */

import type { PublicListingDTO } from './public-dto';
import { resolveMoveInFees } from './public-dto';
import { mapPropertyTypeToDisplay, buildAuctionPublic } from './public-dto';
import { publicListOfficeName } from './public-attribution';
import { toPublicMediaUrl } from '@/lib/media/proxy-url-policy';
import { composeDbPublicMedia } from '@/lib/media/db-media-composition';
import { composeSlugStreetName, buildListingSlugFromDbRow } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { affirmPermission, isAddressDisplayable } from '@/lib/compliance/gates';
import {
  resolveDbListingMedia,
  toDtoMedia,
  tourUrlsForDto,
  type ListingMediaTableRow,
} from '@/lib/media/listing-media-resolver';

import { normalizeStreetCase } from './normalize-street-case';
import { resolveListingAgentInfo } from '@/lib/listings/agent-info-resolver';

/** Borough → County mapping (reverse of display-adapter) */
const BOROUGH_TO_COUNTY: Record<string, string> = {
  manhattan: 'New York',
  brooklyn: 'Kings',
  queens: 'Queens',
  bronx: 'Bronx',
  'staten island': 'Richmond',
};

interface DbAddress {
  street?: string;
  StreetNumber?: string;
  StreetDirPrefix?: string;
  StreetName?: string;
  StreetSuffix?: string;
  StreetDirSuffix?: string;
  UnitNumber?: string;
  City?: string;
  StateOrProvince?: string;
  PostalCode?: string;
  Borough?: string;
  Neighborhood?: string;
  SubdivisionName?: string;
  BuildingName?: string;
  UnparsedAddress?: string;
  // Trestle stores Latitude/Longitude on the Property resource. Per the
  // 2026-03-04 CLAUDE.md note REBNY's IDX Plus feed returns these as null
  // for the vast majority of records and our `geocodeListings()` fills the
  // gap. When they ARE populated by Trestle (or by our geocode-cache
  // backfill), propagate them so the map can render without paying for an
  // online geocode round-trip on every request.
  Latitude?: number | string | null;
  Longitude?: number | string | null;
}

interface DbFeatures {
  YearBuilt?: number | string;
  StoriesTotal?: number | string;
  Rooms?: number | string;
  PublicRemarks?: string;
  /**
   * B13_BUILDING owns BuildingName, and `mapTrestleToPrisma` spreads
   * `pick(raw, B13_BUILDING)` into `features` (trestle-mapper.ts:1073), while
   * `address` is `pick(raw, B1_ADDRESS)` — which does NOT contain it. Synced
   * rows therefore carry BuildingName HERE, not on the address JSON.
   */
  BuildingName?: string;
  AssociationFee?: number | string;
  AssociationFeeFrequency?: string;
  TaxAnnualAmount?: number | string;
  TaxYear?: number | string;
  ArchitecturalStyle?: string;
  // FARE Act fee transparency
  MoveInCosts?: string;
  MoveInCostsAmount?: number | string;
  MoveInCostsComments?: string;
  // legacy field — does not exist on live Trestle; intentional read-only fallback
  // for old raw_data only (never written). See resolveMoveInFees().
  MoveInCostsAmountTotal?: number | string;
  OngoingFees?: string;
  TenantPays?: string;
  TenantPaysDescription?: string;
  AdditionalFeeYN?: boolean | string;
  AdditionalFee?: number | string;
  AdditionalFeeDescription?: string;
  FeeFrequency?: string;
  [key: string]: unknown;
}

interface DbAgentInfo {
  ListAgentFullName?: string;
  ListOfficeName?: string;
  /** Mallan's own contact for an exclusive — published ONLY for the
   *  exclusive provenance path (see buildSourceAndCompliance). */
  ListAgentEmail?: string;
  ListAgentDirectPhone?: string;
  [key: string]: unknown;
}

interface DbMediaItem {
  MediaURL?: string;
  url?: string;
  MediaType?: string;
  MediaCategory?: string;
  mediaType?: string;
  ShortDescription?: string;
  shortDescription?: string;
  Order?: number;
  order?: number;
  PreferredPhotoYN?: boolean | string;
}

/**
 * A numeric-like DB value.
 *
 * Prisma returns `Decimal` for numeric columns; some callers carry the same
 * value as a numeric string, and a few as a plain number. All three arrive here
 * in practice, so the type says so rather than being cast away at call sites.
 */
export type DbNumericLike = string | number | { toString(): string };

/**
 * Normalize any accepted numeric-like form to a finite number, else null.
 *
 * This replaces bare `parseFloat(value)`, which happened to work on a Prisma
 * `Decimal` only through implicit `toString()` coercion — correct at runtime but
 * undeclared, and the reason the detail page could not call this builder without
 * an `as unknown as` cast.
 */
function numericOf(value: DbNumericLike | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

// The shape returned by Prisma listing.findMany with our select.
//
// Types here describe the ACTUAL runtime forms this builder accepts, so callers
// pass their real Prisma row instead of laundering it through
// `as unknown as DbListing`. A cast would silence the disagreement without
// proving anything about the values that arrive.
export interface DbListing {
  /**
   * The surrogate primary key. Prisma types it `bigint`; some list callers
   * carry it as a string. This builder never reads it (the PUBLIC identity is
   * `listing_id`), so both forms are accepted rather than forcing a conversion
   * at every call site.
   */
  id: string | bigint;
  listing_id: string;
  mls_id?: string | null;
  status: string;
  listing_type: string;
  property_type: string | null;
  property_sub_type: string | null;
  list_price: DbNumericLike;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  bathrooms_half: number | null;
  living_area: DbNumericLike | null;
  borough: string | null;
  neighborhood: string | null;
  address: unknown;
  features: unknown;
  media: unknown;
  // Phase D code-prep: agent_info is OPTIONAL — runtime readers no longer select it
  // (typed columns are the source of truth; A6 backfill proved typed_gap_rows=0). The
  // consumer reads `listing.agent_info || {}` (absent-safe), so a dropped column is safe.
  agent_info?: unknown;
  // Phase B (agent_info normalization): typed agent columns read TYPED-FIRST via
  // resolveListingAgentInfo, with agent_info JSON fallback. Optional so callers that
  // don't yet select them safely fall back to JSON (no regression).
  list_agent_full_name?: string | null;
  list_office_name?: string | null;
  list_agent_email?: string | null;
  list_agent_direct_phone?: string | null;
  list_office_mls_id?: string | null;
  list_agent_mls_id?: string | null;
  co_list_office_mls_id?: string | null;
  co_list_agent_mls_id?: string | null;
  // C1 fix (2026-05-13): ownership signals required to classify each row as
  // Mallan-authored (`agent_id` or `owner_client_id` non-null), website-only
  // commercial (`rls_eligible === false`), or third-party IDX/RLS. Without
  // these, every DB row was hard-coded as `_source: 'exclusive'` regardless
  // of provenance — see the per-row classifier below.
  //
  // Prisma exposes both as `bigint | null`; the route's serialize step
  // stringifies for JSON safety and the classifier only checks `!= null`,
  // so accepting either shape keeps callers flexible.
  agent_id?: bigint | string | null;
  owner_client_id?: bigint | string | null;
  rls_eligible?: boolean;
  commercial_sub_type?: string | null;
  commercial_ownership?: string | null;
  idx_display_yn: boolean;
  internet_entire_listing_display_yn?: boolean;
  internet_address_display_yn?: boolean;
  owner_opt_out: boolean;
  participant_only: boolean;
  listing_contract_date: string | Date | null;
  modification_timestamp: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
  raw_data?: unknown;
  // Auction (UCBA Art. I exception path) — schema added in PR #50.
  // All five are nullable on the model; presence is gated by the validator
  // (AU-001..AU-005) at the write path. Surfaced publicly via auction object.
  auction_yn?: boolean | null;
  auction_type?: string | null;
  auction_start_date?: Date | string | null;
  auction_end_date?: Date | string | null;
  auction_terms_url?: string | null;
  // PR 4 reader swap — relational media table.
  //
  // When the caller's Prisma query includes `listing_media: { ... }`, this
  // field carries the typed media rows. When it doesn't, the field is
  // undefined and the mapper falls back to the legacy `media` JSON column.
  // Both paths flow through the same classify→sort pipeline so the public
  // DTO shape is identical.
  listing_media?: ListingMediaTableRow[];
  // All-status existence signal (Prisma `_count`). Callers that select only
  // ACTIVE `listing_media` rows (e.g. /api/listings) include
  // `_count: { select: { listing_media: true } }` so the resolver can tell
  // "no rows ever imported" from "rows existed but all deleted" WITHOUT loading
  // every deleted row. Optional; when absent, existence derives from the passed
  // (all-status) rows.
  _count?: { listing_media?: number } | null;
}

/** RESO StandardStatus values that are publicly displayable */
export const DISPLAYABLE_STATUSES = ['Active', 'ComingSoon', 'ActiveUnderContract'];

/** Map RESO StandardStatus to user-friendly display */
const STATUS_DISPLAY: Record<string, string> = {
  Active: 'Active',
  ComingSoon: 'Coming Soon',
  ActiveUnderContract: 'Active Under Contract',
  Closed: 'Closed',
  Sold: 'Sold',
  Rented: 'Rented',
};

// REMOVED 2026-08-07 — `DB_TRESTLE_PROXY_HOSTS` + `proxyDbMediaUrl`.
//
// This was a THIRD independent copy of the media-URL policy (alongside
// `proxy-url-policy.ts` and the resolver's suffix rule). Three owners meant
// three chances to drift apart from what the proxy route actually accepts.
//
// The canonical `toPublicMediaUrl` — imported by the proxy route itself — now
// owns this. It is additionally IDEMPOTENT, which the local copy was not:
// re-applying it to an already-proxied relative URL returns it unchanged rather
// than nesting a second wrapper (the defect that produced the 403s on the
// listing detail page).
const proxyDbMediaUrl = toPublicMediaUrl;

/**
 * Provenance of a DB-cached listing row.
 *
 * - `mallan-exclusive`: owned by a Mallan client (`owner_client_id` non-null)
 *   or carried by a Mallan agent (`agent_id` non-null). True Mallan exclusive.
 * - `website-only`: commercial / off-RLS listing (`rls_eligible === false`).
 *   Bypasses REBNY distribution gates; surfaced only on mallan.nyc.
 * - `third-party-idx`: synced from REBNY RLS via Trestle/IDX Plus with no
 *   Mallan attribution. Must carry the full REBNY disclaimer and
 *   `_source: "db+idx"`.
 */
export type DbListingProvenance =
  | 'mallan-exclusive'
  | 'website-only'
  | 'third-party-idx';

/**
 * Classify a DB row by provenance. C1 fix (2026-05-13).
 *
 * Before this helper existed, `dbListingToPublicDTO` hard-coded every row as
 * `_source: 'exclusive'` and `disclaimerRequired: false`, mis-labeling every
 * Trestle-synced third-party row as a Mallan exclusive (10,484 / 10,484 rows
 * affected). The classifier is exported so tests, sitemap, and any downstream
 * consumer can reuse the same predicate.
 */
export function classifyDbListing(listing: Pick<DbListing,
  'agent_id' | 'owner_client_id' | 'rls_eligible'>): DbListingProvenance {
  // Website-only check first: commercial rows opt out of RLS entirely and
  // are tagged exclusive (Mallan-owned) by definition.
  if (listing.rls_eligible === false) return 'website-only';
  if (listing.agent_id != null || listing.owner_client_id != null) {
    return 'mallan-exclusive';
  }
  return 'third-party-idx';
}

/**
 * Filter DB listings to only those eligible for public display.
 * Applies the same 6 REBNY distribution gates as the Trestle path.
 */
export function filterDisplayableDbListings(listings: DbListing[]): DbListing[] {
  return listings.filter((l) => {
    // Gate 1: Must be an active/displayable status
    if (!DISPLAYABLE_STATUSES.includes(l.status)) return false;
    // Website-only listings (commercial, rls_eligible=false) bypass RLS gates.
    // `rls_eligible` is a real internal boolean, not a Trestle permission flag,
    // so the literal `=== false` check is intentional here.
    if (l.rls_eligible === false) return true;
    // Gate 2: IDX display must be enabled (fail-closed: null/undefined → deny)
    if (!affirmPermission(l.idx_display_yn)) return false;
    // Gate 3: Internet display must be enabled (fail-closed)
    if (!affirmPermission(l.internet_entire_listing_display_yn)) return false;
    // Gate 4: Owner must not have opted out
    if (l.owner_opt_out) return false;
    // Gate 5: Must not be participant-only
    if (l.participant_only) return false;
    return true;
  });
}

/**
 * Convert a single Prisma DB listing to PublicListingDTO.
 */
export function dbListingToPublicDTO(listing: DbListing): PublicListingDTO {
  const addr = (listing.address || {}) as DbAddress;
  const features = (listing.features || {}) as DbFeatures;
  const agentInfo = (listing.agent_info || {}) as DbAgentInfo;
  // Phase B: typed-first agent attribution (JSON fallback). Exposure unchanged below.
  const resolvedAgent = resolveListingAgentInfo(listing);
  const mediaArr = (Array.isArray(listing.media) ? listing.media : []) as DbMediaItem[];

  // Case-tolerant like composeSlugStreetName: legacy/mixed address JSON stores
  // some rows in camelCase. PascalCase-only reads silently DROPPED the street
  // number and postal code from the canonical slug on those rows, so the DTO
  // and the sitemap emitted different URLs for the same listing.
  const legacyAddr = addr as unknown as Record<string, unknown>;
  const camel = (key: string): string =>
    typeof legacyAddr[key] === 'string' ? (legacyAddr[key] as string).trim() : '';
  const streetNumber = addr.StreetNumber || camel('streetNumber');
  const streetDirPrefix = addr.StreetDirPrefix || '';
  const streetNameRaw = [
    addr.StreetName,
    addr.StreetSuffix,
    addr.StreetDirSuffix,
  ].filter(Boolean).join(' ') || '';
  const streetName = normalizeStreetCase(streetNameRaw);
  const unitNumber = addr.UnitNumber || null;
  const city = addr.City || camel('city') || listing.borough || 'New York';
  const postalCode = addr.PostalCode || camel('postalCode');
  const borough = (addr.Borough || listing.borough || '').toLowerCase();
  const county = BOROUGH_TO_COUNTY[borough] || borough || 'New York';
  // Neighborhood: SubdivisionName (Trestle) > Neighborhood (legacy) > DB column
  const neighborhood = addr.SubdivisionName || addr.Neighborhood || listing.neighborhood || undefined;

  // CRM-created exclusives always show address — IDX gate is for RLS-distributed only.
  // Use listing_id prefix (always selected, always present) instead of mls_id
  // which may not be selected by every caller.
  // Address suppression — the ONLY legitimate bypass is "not RLS-backed".
  //
  // This previously keyed off an `SL-`/`RL-` listing_id PREFIX, which meant an
  // RLS-ELIGIBLE Mallan exclusive carrying an explicit
  // `internet_address_display_yn = false` had its seller opt-out OVERRIDDEN and
  // its street address, unit, coordinates and address-derived slug published on
  // cards, search, /api/listings and Featured.
  //
  // A prefix is not a permission. Only inventory that is genuinely outside RLS
  // (`rls_eligible === false` — Mallan's website-only listings) may bypass the
  // IDX address gate; an RLS-backed row must always honour it.
  //
  // app/listing/[...slug]/page.tsx:455-461 already found this exact prefix
  // bypass unsafe and reverted it ("Earlier draft unconditionally bypassed by
  // SL-/RL- prefix — that exposed RLS-eligible opt-out addresses; reverted").
  // That correction was never carried across to this canonical builder, so the
  // two paths disagreed for the same listing. They now use the same rule.
  const isRlsBacked = listing.rls_eligible !== false;
  const suppressAddress = isRlsBacked && !isAddressDisplayable(listing);
  const isComingSoon = listing.status === 'ComingSoon';
  const rawData = (listing.raw_data || {}) as Record<string, unknown>;
  const comingSoonDate = isComingSoon
    ? (rawData.ActivationDate as string | undefined) || undefined
    : undefined;

  // SLUG STREET — composed by the ONE owner, `composeSlugStreetName`, which the
  // sitemap also uses. This builder previously did its own composition
  // (StreetName + StreetSuffix + StreetDirSuffix, PascalCase only) and passed
  // `streetDirPrefix` separately, so the two routes could disagree: the helper
  // omitted StreetDirSuffix while this one omitted the camelCase fallback.
  //
  // NOTE the prefix is NOT passed separately below — the helper already
  // includes StreetDirPrefix, and passing both would double it ("W W 20th St").
  // The DISPLAY address further down keeps its own `streetDirPrefix + streetName`
  // composition, which is a different concern and is deliberately untouched.
  const slugStreet = normalizeStreetCase(
    composeSlugStreetName(addr as unknown as Record<string, unknown>),
  );

  // ONE owner for the DB-row slug (extracted 2026-08-09). The RLS return-copy
  // redirect must land on exactly the URL this builder emits, and a second
  // derivation over there would be a fresh way for the canonical URL and the
  // redirect target to diverge — the same class of bug the composeSlugStreetName
  // extraction (SEO-001) was created to end. `buildListingSlugFromDbRow` performs
  // the identical composition, including the `suppressAddress` gate. `slugStreet`
  // is retained above because it also feeds the DISPLAY address below.
  const slug = buildListingSlugFromDbRow(listing as unknown as {
    listing_id: string;
    rls_eligible?: boolean | null;
    address?: unknown;
    borough?: string | null;
  });

  const listPrice = numericOf(listing.list_price) ?? 0;

  // PR 4 reader swap (2026-05-11): prefer the relational `listing_media`
  // table when the caller's Prisma query included it. The 99.67% of listings
  // already mirrored to R2 serve directly from R2 URLs (no Trestle proxy),
  // and ordering / FloorPlan classification stay identical because both
  // paths flow through the same `listing-media-resolver` pipeline.
  //
  // Fallback: when `listing_media` is empty (un-synced listing, mid-sync
  // race, or caller didn't include the relation), read the legacy
  // `Listing.media` JSON column so no listing renders blank.
  // SHARED DB-only policy (2026-07-16 card/detail P0): resolve the relational
  // rows first; fall back to the legacy Cotality JSON ONLY when they yield zero
  // usable media AND the listing is not Mallan-owned with authoritative deletions.
  // Media ownership uses the canonical signal (SL-/RL- listing_id OR rls_eligible
  // === false), NEVER agent_id — syncAgentHistory stamps agent_id onto third-party
  // IDX rows (Codex review, 2026-07-16).
  //
  // `hadRelationalRows` is the ALL-STATUS existence signal. It is taken ONLY from
  // `_count.listing_media` — never derived from `tableRows.length`, because a
  // caller that selected active-only rows has a length that reflects the ACTIVE
  // count, not existence; deriving from it would read "all deleted" as "never
  // imported" and resurrect deleted Mallan media. When `_count` is absent it is
  // `undefined` (unknown), so resolveDbListingMedia FAILS CLOSED for Mallan-owned
  // media. Active-only callers of this DTO MUST select
  // `_count: { select: { listing_media: true } }` to enable the never-imported
  // legacy fallback on Mallan exclusives.
  const tableRows = Array.isArray(listing.listing_media) ? listing.listing_media : [];
  const hadRelationalRows =
    typeof listing._count?.listing_media === 'number'
      ? listing._count.listing_media > 0
      : undefined;
  // ONE canonical composition — shared with the listing-detail page so the two
  // cannot derive different media, URLs or photo counts for the same listing.
  const { media, photoCount } = composeDbPublicMedia({
    listingId: listing.listing_id,
    rlsEligible: listing.rls_eligible,
    tableRows,
    legacyMedia: mediaArr,
    hadRelationalRows,
  });

  return {
    id: listing.listing_id,
    mlsId: listing.listing_id,
    slug,
    url: buildCanonicalListingPath({ slug, id: listing.listing_id }),
    status: STATUS_DISPLAY[listing.status] || listing.status,
    listingType: listing.listing_type as 'sale' | 'rent',
    address: suppressAddress
      ? {
          // UCBA Art. III §2(C) — when InternetAddressDisplayYN is not
          // affirmed, the address text AND map pin both must be suppressed.
          // Revealing exact lat/lng on a map would defeat the address
          // suppression by allowing reverse-lookup, so coords are intentionally
          // omitted on this branch.
          streetNumber: '',
          streetName: 'Address Undisclosed',
          unitNumber: null,
          city,
          stateOrProvince: 'NY',
          postalCode,
          county,
          neighborhood,
        }
      : {
          streetNumber,
          streetName: [streetDirPrefix, streetName].filter(Boolean).join(' '),
          unitNumber,
          city,
          stateOrProvince: 'NY',
          postalCode,
          county,
          neighborhood,
          // PR (search-fix): propagate Latitude/Longitude from the DB's
          // address JSON so the map can render without depending on
          // geocodeListings() winning a 1.5s timeout race. When Trestle
          // didn't supply coords (the common case on this REBNY feed) the
          // values are null/undefined — geocodeListings will then attempt
          // to fill them. Numeric coercion handles both number and string
          // JSON shapes; `null` and `undefined` cascade to `undefined`.
          latitude:
            addr.Latitude != null && !Number.isNaN(Number(addr.Latitude))
              ? Number(addr.Latitude)
              : undefined,
          longitude:
            addr.Longitude != null && !Number.isNaN(Number(addr.Longitude))
              ? Number(addr.Longitude)
              : undefined,
        },
    listPrice,
    originalListPrice: rawData.OriginalListPrice != null ? Number(rawData.OriginalListPrice) : listPrice,
    previousListPrice: rawData.PreviousListPrice != null ? Number(rawData.PreviousListPrice) : undefined,
    closePrice: rawData.ClosePrice != null ? Number(rawData.ClosePrice) : (features.ClosePrice != null ? Number(features.ClosePrice) : null),
    propertyType: mapPropertyTypeToDisplay(
      features.CommonInterest as string | undefined,
      listing.property_sub_type,
      listing.property_type || 'Residential',
    ),
    propertySubType: listing.property_sub_type,
    bedroomsTotal: listing.bedrooms_total || 0,
    bathroomsFull: listing.bathrooms_full || 0,
    bathroomsHalf: listing.bathrooms_half || 0,
    livingArea: numericOf(listing.living_area),
    lotSizeArea: features.LotSizeArea ? Number(features.LotSizeArea) : null,
    yearBuilt: features.YearBuilt ? Number(features.YearBuilt) : null,
    storiesTotal: features.StoriesTotal ? Number(features.StoriesTotal) : undefined,
    roomsTotal: features.Rooms ? Number(features.Rooms) : undefined,
    // UCBA Art. III §2(C) — listing attribution must identify the ACTUAL listing
    // broker, never the displaying broker. Falling back to "Mallan Real Estate
    // Inc." when the source data omits `ListOfficeName` would falsely attribute
    // every IDX listing to us. When the source data is silent, fall back to the
    // neutral "REBNY RLS" string (matches the pattern in `BuildingUnits.tsx`
    // and `SearchMap.tsx`). Mallan attribution is preserved only when the source
    // row's `agent_info.ListOfficeName` actually carries it.
    listOfficeName: resolvedAgent.officeName || 'REBNY RLS',
    media,
    photosCount: photoCount,
    // S1 (#415) storage correction: `mapTrestleToPrisma` does NOT put
    // B7_REMARKS into `features`, and the redundant Trestle `compliance` JSON
    // copy is no longer persisted — so on a SYNCED row PublicRemarks lives in
    // `raw_data`. Reading only `features` returned undefined for every synced
    // listing. `features` still wins first for CRM/legacy rows that carry it.
    publicRemarks:
      features.PublicRemarks ||
      (typeof rawData.PublicRemarks === 'string' ? rawData.PublicRemarks : undefined) ||
      undefined,
    listingContractDate: listing.listing_contract_date
      ? new Date(listing.listing_contract_date).toISOString()
      : new Date(listing.created_at).toISOString(),
    modificationTimestamp: new Date(listing.modification_timestamp || listing.updated_at).toISOString(),
    onMarketDate: rawData.OnMarketDate ? String(rawData.OnMarketDate) : undefined,
    closeDate: rawData.CloseDate ? String(rawData.CloseDate) : undefined,
    // B13_BUILDING owns BuildingName and lands in `features`; B1_ADDRESS does
    // not carry it, so reading `addr` alone was empty for synced rows. The
    // address fallback is retained deliberately for historical/CRM rows that
    // stored it there — not deleted on assumption.
    buildingName: features.BuildingName || addr.BuildingName,
    architecturalStyle: features.ArchitecturalStyle ? String(features.ArchitecturalStyle) : undefined,
    // Amenity fields from features JSON (PascalCase keys from Trestle sync)
    buildingFeatures: features.BuildingFeatures ? String(features.BuildingFeatures) : undefined,
    interiorFeatures: features.InteriorFeatures ? String(features.InteriorFeatures) : undefined,
    exteriorFeatures: features.ExteriorFeatures ? String(features.ExteriorFeatures) : undefined,
    appliances: features.Appliances ? String(features.Appliances) : undefined,
    laundryFeatures: features.LaundryFeatures ? String(features.LaundryFeatures) : undefined,
    securityFeatures: features.SecurityFeatures ? String(features.SecurityFeatures) : undefined,
    attendanceType: features.AttendanceType ? String(features.AttendanceType) : undefined,
    communityFeatures: features.CommunityFeatures ? String(features.CommunityFeatures) : undefined,
    associationAmenities: features.AssociationAmenities ? String(features.AssociationAmenities) : undefined,
    parkingFeatures: features.ParkingFeatures ? String(features.ParkingFeatures) : undefined,
    poolFeatures: features.PoolFeatures ? String(features.PoolFeatures) : undefined,
    spaFeatures: features.SpaFeatures ? String(features.SpaFeatures) : undefined,
    heating: features.Heating ? String(features.Heating) : undefined,
    cooling: features.Cooling ? String(features.Cooling) : undefined,
    flooring: features.Flooring ? String(features.Flooring) : undefined,
    petsAllowedDetail: features.PetsAllowed ? String(features.PetsAllowed) : undefined,
    petsAllowed: features.PetsAllowed ? String(features.PetsAllowed) : undefined,
    associationFee: features.AssociationFee != null ? Number(features.AssociationFee) : undefined,
    associationFeeFrequency: features.AssociationFeeFrequency,
    taxAnnualAmount: features.TaxAnnualAmount != null ? Number(features.TaxAnnualAmount) : undefined,
    taxYear: features.TaxYear != null ? Number(features.TaxYear) : undefined,
    // Rental-specific
    leaseAmount: rawData.LeaseAmount != null ? Number(rawData.LeaseAmount) : undefined,
    leaseAmountFrequency: rawData.LeaseAmountFrequency ? String(rawData.LeaseAmountFrequency) : undefined,
    furnished: features.Furnished ? String(features.Furnished) : undefined,
    availabilityDate: rawData.AvailabilityDate ? String(rawData.AvailabilityDate) : undefined,
    // Days on Market
    daysOnMarket: rawData.DaysOnMarket != null ? Number(rawData.DaysOnMarket) : undefined,
    cumulativeDaysOnMarket: rawData.CumulativeDaysOnMarket != null ? Number(rawData.CumulativeDaysOnMarket) : undefined,
    // Virtual tour + video — host-split (YouTube/Vimeo → video; Matterport/3D → tour),
    // unbranded preferred over branded (UCBA Art. I §5(C)). See tourUrlsForDto.
    // Both families pass ALL THREE slots as arrays. An `??` chain here would
    // return only the first non-null branded URL and drop the others — the same
    // silent loss that cost production Unbranded2/3. Live $metadata confirms
    // Branded2/3 exist; they are empty upstream today, so this changes nothing
    // now and prevents the defect recurring when Cotality populates them.
    ...tourUrlsForDto(
      [rawData.VirtualTourURLUnbranded, rawData.VirtualTourURLUnbranded2, rawData.VirtualTourURLUnbranded3],
      [rawData.VirtualTourURLBranded, rawData.VirtualTourURLBranded2, rawData.VirtualTourURLBranded3],
    ),
    // FARE Act fee transparency
    moveInCosts: features.MoveInCosts ? String(features.MoveInCosts) : undefined,
    // Shared zero-safe resolver (canonical-first legacy fallback) — same on every path.
    ...resolveMoveInFees(features as Record<string, unknown>),
    ongoingFees: features.OngoingFees ? String(features.OngoingFees) : undefined,
    tenantPays: features.TenantPays ? String(features.TenantPays) : undefined,
    tenantPaysDescription: features.TenantPaysDescription ? String(features.TenantPaysDescription) : undefined,
    additionalFeeYN: features.AdditionalFeeYN === true || features.AdditionalFeeYN === 'true' ? true : undefined,
    additionalFee: features.AdditionalFee != null ? Number(features.AdditionalFee) : undefined,
    additionalFeeDescription: features.AdditionalFeeDescription ? String(features.AdditionalFeeDescription) : undefined,
    feeFrequency: features.FeeFrequency ? String(features.FeeFrequency) : undefined,
    // Auction (UCBA Art. I exception path) — null on non-auction listings.
    // buildAuctionPublic() reads the snake_case columns from the DB row and
    // returns null unless auction_yn === true AND type/endDate are present.
    auction: buildAuctionPublic(listing),
    // C1 fix (2026-05-13): _source + _displayCompliance are now derived from
    // provenance instead of hard-coded. Before this fix every DB row was
    // labeled `_source: 'exclusive'` / `disclaimerRequired: false` regardless
    // of whether it was Mallan-authored or a 3rd-party Trestle sync. See
    // `classifyDbListing` above for the predicate.
    ...buildSourceAndCompliance(listing, agentInfo, isComingSoon, comingSoonDate),
  };
}

/**
 * Derive `_source` + `_displayCompliance` from listing provenance.
 *
 * - `third-party-idx` → `_source: 'db+idx'`, full REBNY disclaimer required,
 *   attribution courtesy of the actual listing brokerage (or "REBNY RLS" when
 *   the source row omits ListOfficeName).
 * - `mallan-exclusive` → `_source: 'exclusive'`, no RLS disclaimer (this is
 *   our own listing), attribution = "Exclusive listing by Mallan Real Estate
 *   Inc.".
 * - `website-only` → same as mallan-exclusive but for commercial rows that
 *   bypass RLS entirely; no RLS disclaimer because the data is not RLS-sourced.
 */
export function buildSourceAndCompliance(
  listing: DbListing,
  agentInfo: DbAgentInfo,
  isComingSoon: boolean,
  comingSoonDate: string | undefined,
): Pick<PublicListingDTO, '_source' | '_displayCompliance' | '_assignedAgent'> {
  const provenance = classifyDbListing(listing);
  // Phase B: typed-first agent attribution (JSON fallback). Exposure rules unchanged.
  const resolved = resolveListingAgentInfo(listing);
  const officeName = publicListOfficeName(resolved.officeName);

  if (provenance === 'third-party-idx') {
    return {
      _source: 'db+idx',
      _displayCompliance: {
        requiresAttribution: true,
        // UCBA Art. III §2(C) — listing attribution must identify the ACTUAL
        // listing broker, never the displaying broker.
        attributionText: `Listing courtesy of ${officeName}`,
        disclaimerRequired: true,
        comingSoon: isComingSoon || undefined,
        comingSoonDate,
      },
      // No `_assignedAgent`: third-party agent email/phone is stripped from
      // public IDX display (NAR settlement + REBNY). We never surface a
      // non-Mallan agent's PII.
    };
  }

  // mallan-exclusive or website-only — same attribution shape, no RLS
  // disclaimer required (Mallan-owned data, not third-party IDX content).
  //
  // Surface the assigned listing agent's contact card. For our OWN exclusive
  // Mallan IS the listing broker, so publishing our own agent's name + Mallan
  // contact is required attribution (§175.25), not third-party PII. Built from
  // whatever the row's agent_info carries — never invented; blank fields are
  // simply omitted so the detail page falls back to the brokerage block.
  // Phase B: typed-first (JSON fallback). This is the GATED exclusive-card path
  // (mallan-exclusive / website-only only) — the one place agent email/phone may
  // surface publicly, exactly as before; third-party IDX returned above with none.
  const assignedName = resolved.fullName ?? undefined;
  const assignedEmail = resolved.agentEmail ?? undefined;
  const assignedPhone = resolved.agentDirectPhone ?? undefined;
  const assignedCompany = resolved.officeName ?? undefined;
  const assignedAgent =
    assignedName || assignedEmail || assignedPhone || assignedCompany
      ? {
          ...(assignedName ? { name: assignedName } : {}),
          ...(assignedEmail ? { email: assignedEmail } : {}),
          ...(assignedPhone ? { phone: assignedPhone } : {}),
          ...(assignedCompany ? { company: assignedCompany } : {}),
        }
      : undefined;

  return {
    _source: 'exclusive',
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: 'Exclusive listing by Mallan Real Estate Inc.',
      disclaimerRequired: false,
      comingSoon: isComingSoon || undefined,
      comingSoonDate,
    },
    ...(assignedAgent ? { _assignedAgent: assignedAgent } : {}),
  };
}
