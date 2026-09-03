/**
 * MALLAN-AUTHORED LISTING → THE CRM SEARCH DTO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN REUSING mapTrestleToCrmListing
 *
 * The Search route maps every result row through `mapTrestleToCrmListing`,
 * which reads Cotality Property fields — `ListingKey`, `StreetNumber`,
 * `BedroomsTotal`, `StandardStatus`, `ListOfficeName` and so on. A
 * Mallan-authored row has none of them.
 *
 * Feeding a Mallan row through that mapper would produce a card with a null id,
 * a blank address, status UNKNOWN, null beds and baths and no media — while
 * every count and pagination test stayed green. The engine would report that
 * Mallan inventory is included and the broker would receive malformed cards.
 * That is worse than the gap it closes, because it looks like it worked.
 *
 * The alternative — dressing an SL-/RL- Listing in fake Cotality field names so
 * the old mapper accepts it — is the conflation that produced every identity
 * defect in this workstream. A fabricated `ListingKey` is indistinguishable
 * from a real one to the next reader, and it would eventually be sent to the
 * provider.
 *
 * So: two mappers, one DTO. The source is discriminated at the boundary and
 * never after it.
 */
import { isStandardStatusMember } from '@/lib/search/canonical/status-token-contract';

/** The Mallan storage columns this mapper needs. */
export interface MallanListingForDto {
  listing_id: string | null;
  status: string | null;
  listing_type: string | null;
  address: string | null;
  neighborhood: string | null;
  borough: string | null;
  city: string | null;
  postal_code: string | null;
  list_price: unknown;
  bedrooms_total: number | null;
  bathrooms_full: number | null;
  bathrooms_half: number | null;
  living_area: unknown;
  property_type: string | null;
  property_sub_type: string | null;
  listing_contract_date: Date | null;
  modification_timestamp: Date | null;
  updated_at: Date | null;
  days_on_market: number | null;
  cumulative_days_on_market: number | null;
  photo_count: number | null;
  list_office_name: string | null;
  list_agent_full_name: string | null;
  list_agent_email: string | null;
}

const dec = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * One Mallan-authored listing as the CRM Search DTO.
 *
 * Field-for-field the same shape `mapTrestleToCrmListing` produces, so every
 * downstream consumer — card, gallery, summary, grid, master-detail, map popup,
 * detail panel, selection, Compare, Reports, Saved Search restore — reads it
 * without knowing which source it came from.
 *
 * Provider-only facts are explicitly `null`, never invented. A blank
 * `providerListingId` is the truth about a listing the provider has never seen.
 */
export function mapMallanLocalToCrmListing(
  row: MallanListingForDto,
  index: number,
): Record<string, unknown> {
  void index;

  const listingId = String(row.listing_id ?? '').trim();

  // The SAME status contract the provider path uses. A Mallan status outside
  // the canonical vocabulary becomes UNKNOWN rather than being passed through,
  // so one result set cannot carry two status vocabularies.
  const rawStatus = String(row.status ?? '');
  const status = isStandardStatusMember(rawStatus) ? rawStatus : 'UNKNOWN';

  const full = row.bathrooms_full ?? null;
  const half = row.bathrooms_half ?? null;
  // Half-baths count as 0.5, matching the canonical bath semantics used to
  // FILTER these rows. Displaying a different number than the one filtered on
  // is the kind of mismatch a broker reports as "the filter is broken".
  const baths = full == null && half == null ? null : (full ?? 0) + (half ?? 0) * 0.5;

  return {
    // ── IDENTITY ──
    //
    // The canonical Mallan identity IS the id. It is not a ListingKey and must
    // never be presented as one; `wid` and `providerListingId` stay null
    // because the provider has no record of this listing.
    id: listingId,
    lid: listingId,
    wid: null,
    providerListingId: null,
    providerSourceSystemKey: null,
    /** Explicit, so a consumer never has to infer the source from a prefix. */
    source: 'mallan_local',
    isMallanAuthored: true,

    // ── ADDRESS ──
    address: row.address ?? '',
    unit: null,
    neighborhood: row.neighborhood ?? '',
    borough: row.borough ?? '',
    zip: row.postal_code ?? '',
    buildingName: null,
    buildingKey: null,
    providerSubdivisionName: null,
    providerCityRegion: row.city ?? null,
    providerCountyOrParish: null,

    // ── THE FACTS A CARD SHOWS ──
    price: dec(row.list_price),
    beds: row.bedrooms_total ?? null,
    baths,
    fullBaths: full,
    halfBaths: half,
    intSqft: dec(row.living_area),
    totalMonthly: null,
    reTaxes: null,
    status,
    listingType: row.listing_type === 'rent' ? 'rental' : 'sale',
    propertyType: row.property_type ?? '',
    propertySubType: row.property_sub_type ?? '',
    ownership: row.property_sub_type ?? '',
    providerOwnershipType: null,

    // ── DATES ──
    listedDate: row.listing_contract_date ? row.listing_contract_date.toISOString() : null,
    updatedDate: (row.modification_timestamp ?? row.updated_at)?.toISOString() ?? null,
    dom: row.days_on_market ?? null,
    cdom: row.cumulative_days_on_market ?? null,

    // ── MEDIA ──
    //
    // Empty, exactly like the provider path: the route runs expandMedia:false
    // and the browser lazy-loads. `photoCount` is what Mallan storage holds, so
    // the card cannot claim photos that do not exist.
    images: [],
    photoCount: row.photo_count ?? 0,

    // ── ATTRIBUTION ──
    //
    // Mallan's OWN attribution. It must not inherit provider attribution, and a
    // provider row must not inherit Mallan's.
    company: row.list_office_name ?? 'Mallan Real Estate Inc.',
    agentName: row.list_agent_full_name ?? null,
    agentEmail: row.list_agent_email ?? null,

    // ── CARRYING COST ──
    //
    // Mallan storage has no reconciled monthly-cost column, and the criterion
    // is itself blocked on an unreconciled fee model. Null is the truth; a 0
    // would read as "no maintenance", which is a different and false claim.
    maintCC: null,
    associationFee: null,
    associationFeeFrequency: null,

    // ── STATUS DETAIL ──
    mlsStatus: status,
    providerMlsStatus: null,
    listingCategory: null,

    // ── FACTS MALLAN STORAGE DOES NOT CARRY ──
    //
    // Each is null rather than 0/'': a zero year built or a blank floor reads
    // as a known value, and the whole point of this mapper is that a Mallan
    // card must not assert facts nobody recorded.
    yearBuilt: null,
    era: null,
    rooms: null,
    crossStreet: null,
    floor: null,
    description: null,
    virtualTourUrl: null,
    agentPhone: null,

    // ── PRICE HISTORY ──
    priceChange: null,
    originalPrice: null,
    PriceChangeTimestamp: null,

    // ── GEO ──
    //
    // The provider suppresses Latitude/Longitude at licence level (HTTP 400,
    // 'field Latitude cannot be used'), and Mallan storage has no coordinate
    // columns either. Both halves are equally geo-less, which at least means
    // the map behaves the same way for both sources.
    latitude: null,
    longitude: null,
    providerLatitude: null,
    providerLongitude: null,

    // ── DISPLAY GATES ──
    //
    // A Mallan-authored listing is Mallan's own to display, and this is the
    // AUTHENTICATED broker surface: the visibility contract states agent
    // audience = full lifecycle and the public display gate does not apply.
    // These are reported as permitted rather than copied from provider gates
    // that were written for a different audience.
    idxDisplayYN: true,
    internetDisplayYN: true,
    addressDisplayYN: true,

    // ── LIFECYCLE DATES MALLAN STORAGE DOES NOT SEPARATE ──
    closedDate: null,
    contractDate: null,
    comingSoonDate: null,

    // ── PROVIDER PROGRAMME FACTS ──
    downPaymentAssistanceAmount: null,
    downPaymentAssistanceCount: null,
    sponsorUnit: null,
    maximumFinancingPercent: null,
    permissions: null,

    // ── PROVIDER FEATURE VOCABULARY ──
    //
    // These are Cotality picklists. A Mallan listing keeps its own features in
    // `Listing.features`; mapping them into provider vocabulary without a
    // proven equivalence would invent semantics, so they stay null until the
    // mapping is established rather than guessed.
    ListingAgreement: null,
    LandLeaseYN: null,
    CoolingYN: null,
    GarageYN: null,
    DirectionFaces: null,
    View: null,
    OwnerPays: null,
    ArchitecturalStyle: null,
    StructureType: null,
    BusinessType: null,
    AccessibilityFeatures: null,
    ExteriorFeatures: null,
    BuildingFeatures: null,
    LaundryFeatures: null,
    SecurityFeatures: null,
    PoolFeatures: null,
    PatioAndPorchFeatures: null,
    AssociationAmenities: null,
    CurrentFinancing: null,
    PetsAllowedYN: null,
    AvailableLeaseType: null,
    ExistingLeaseType: null,
    ConstructionMaterials: null,
    NewConstructionYN: null,

    // ── INTERNAL PROVENANCE ──
    _source: 'mallan_local',
    // Deliberately null. `_listingKey` is the provider key everywhere else in
    // Search, and a value here would eventually reach Cotality.
    _listingKey: null,

    // ── PROVIDER-ONLY FACTS, HONESTLY ABSENT ──
    providerMoveInCosts: null,
    providerMoveInCostsAmount: null,
    providerMoveInCostsComments: null,
    providerOngoingFees: null,
    providerTenantPays: null,
    providerTenantPaysDescription: null,
  };
}
