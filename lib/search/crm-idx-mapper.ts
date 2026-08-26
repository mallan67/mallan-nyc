import { resolveListingMedia } from "@/lib/media/listing-media-resolver";
import { classifyPropertyType } from "@/lib/search/canonical/property-type-universe";
import { isStandardStatusMember } from "@/lib/search/canonical/status-token-contract";

/**
 * Existing authenticated-feed display convention. This is a Mallan runtime
 * convention, NOT a claim about Cotality null semantics. Explicit false is
 * always honored; the separate compliance gate remains authoritative.
 */
function isIdxPlusDisplayFlagOn(v: unknown): boolean {
  return v !== false && v !== "false" && v !== "FALSE";
}

export function mapDisplayPropertyType(raw: Record<string, unknown>): string | null {
  const ci = raw.CommonInterest ? String(raw.CommonInterest) : "";
  if (ci === "Condominium") return "Condo";
  if (ci === "StockCooperative") return "Co-op";
  if (ci === "Condop") return "Condop";

  const sub = raw.PropertySubType ? String(raw.PropertySubType).toLowerCase() : "";
  if (sub.includes("condo")) return "Condo";
  if (sub.includes("co-op") || sub.includes("coop") || sub.includes("stock cooperative")) return "Co-op";
  if (sub.includes("condop")) return "Condop";
  if (sub.includes("townhouse")) return "Townhouse";
  if (sub.includes("loft")) return "Loft";
  if (sub.includes("single family") || sub.includes("house")) return "House";
  if (sub.includes("multi")) return "Multi-Family";
  if (sub === "apartment") return "Residential";
  if (sub) return String(raw.PropertySubType);
  return raw.PropertyType != null && String(raw.PropertyType) !== ""
    ? String(raw.PropertyType)
    : null;
}

/**
 * Mallan media GROUPING from the exact Cotality MediaCategory value.
 *
 * Live Cotality declares Photo, FloorPlan and Video as exact members. It does
 * NOT declare a generic VirtualTour member, and every other declared category
 * remains unclassified until its business equivalence is separately proven.
 * Unknown/null is never a photograph.
 */
export function classifyMediaCategory(media: Record<string, unknown>): string {
  const category = media.MediaCategory == null ? "" : String(media.MediaCategory);
  if (category === "Photo") return "Photo";
  if (category === "FloorPlan") return "FloorPlan";
  if (category === "Video") return "Video";
  return "Unclassified";
}

/** Provider number or null. Absent/unparsable is never silently zero. */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Exact Cotality provider identity for Property.
 *
 * Live authenticated $metadata: Property.ListingKey is String(20) and
 * Nullable=false. ListingId is separately nullable; SourceSystemKey is provider
 * lineage. Neither is permitted to impersonate ListingKey.
 */
function listingIdentity(raw: Record<string, unknown>): string | null {
  const value = raw.ListingKey;
  if (value === null || value === undefined || String(value) === "") return null;
  return String(value);
}

export function hasUsableListingIdentity(raw: Record<string, unknown>): boolean {
  return listingIdentity(raw) !== null;
}

/**
 * A provider MULTI-ENUM collection, or null when the provider sent nothing.
 *
 * Absent stays null rather than becoming `[]`: an empty collection is the
 * provider asserting "none", which is a different fact from "not supplied".
 * A single scalar is wrapped rather than String()-coerced, so a one-member
 * response cannot decay into a per-character array downstream.
 */
function multiEnumOrNull(value: unknown): string[] | null {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [String(value)];
}

/** Provider boolean or null. Never invents true/false. */
function boolOrNull(value: unknown): boolean | null {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

export function mapTrestleToCrmListing(
  raw: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  void index;

  const streetParts = [
    raw.StreetNumber,
    raw.StreetDirPrefix,
    raw.StreetName,
    raw.StreetSuffix,
    raw.StreetDirSuffix,
  ].filter(Boolean);
  const address = streetParts.join(" ").toUpperCase() || "";

  const propertyType = String(raw.PropertyType || "");
  const universe = classifyPropertyType(propertyType);
  const isRental = universe === "rental";
  const price = num(raw.ListPrice);
  const yearBuilt = raw.YearBuilt != null ? Number(raw.YearBuilt) : null;

  const taxAnnual = num(raw.TaxAnnualAmount);
  const monthlyTax = taxAnnual === null ? null : taxAnnual / 12;

  // Cotality carries the unit in a separate FeeFrequency enum. A fee is a
  // monthly carrying cost ONLY when the provider explicitly says Monthly.
  // Quarterly/annual/semi-monthly/etc. are preserved raw for later business
  // normalization; Other/SeeAgent/SeeRemarks/NotApplicable are not periods at all.
  const associationFee = num(raw.AssociationFee);
  const associationFeeFrequency = raw.AssociationFeeFrequency != null
    ? String(raw.AssociationFeeFrequency)
    : null;
  const maintCC = associationFeeFrequency === "Monthly" ? associationFee : null;

  const addressDisplayYN = isIdxPlusDisplayFlagOn(raw.InternetAddressDisplayYN);
  const displayAddress = addressDisplayYN
    ? address
    : "ADDRESS AVAILABLE UPON REQUEST";

  const media = Array.isArray(raw.Media) ? raw.Media : [];
  const resolved = resolveListingMedia(media);
  const images = resolved.map(m => ({
    url: m.url,
    isPrimary: m.isPrimary,
    order: m.providerOrder,
    mediaType: m.mediaType,
  }));
  const providerPhotoCount = num(raw.PhotosCount);
  const photoCount = providerPhotoCount !== null ? providerPhotoCount
    : images.length > 0 ? images.length
    : null;

  const customProps = Array.isArray(raw.CustomProperty)
    ? raw.CustomProperty[0] as Record<string, unknown> | undefined
    : raw.CustomProperty as Record<string, unknown> | undefined;

  // Legacy raw_data compatibility only. These are now declared Property fields;
  // no new provider mapping is inferred from the old CustomProperty shape.
  const dpaAmountSrc =
    raw.DownPaymentAssistanceAmount != null && raw.DownPaymentAssistanceAmount !== ""
      ? raw.DownPaymentAssistanceAmount
      : customProps?.DownPaymentAssistanceAmount;
  const dpaAmount = dpaAmountSrc != null && dpaAmountSrc !== "" ? Number(dpaAmountSrc) : null;
  const dpaCountSrc =
    raw.DownPaymentAssistanceCount != null && raw.DownPaymentAssistanceCount !== ""
      ? raw.DownPaymentAssistanceCount
      : customProps?.DownPaymentAssistanceCount;
  const dpaCount = dpaCountSrc != null && dpaCountSrc !== "" ? Number(dpaCountSrc) : null;

  let sponsorUnit: boolean | null = null;
  const customFieldsRaw = customProps?.CustomFields;
  if (typeof customFieldsRaw === "string" && customFieldsRaw.length > 0) {
    try {
      const parsed = JSON.parse(customFieldsRaw) as Record<string, unknown>;
      const v = parsed?.SponsorUnitYN;
      if (v === true || v === "true" || v === "Yes" || v === 1) sponsorUnit = true;
      else if (v === false || v === "false" || v === "No" || v === 0) sponsorUnit = false;
    } catch {
      sponsorUnit = null;
    }
  }

  const originalPrice = num(raw.OriginalListPrice);
  let priceChange: string | null = null;
  if (price !== null && originalPrice !== null && originalPrice !== price) {
    priceChange = price < originalPrice ? "down" : "up";
  }

  let era: string | null = null;
  if (yearBuilt) {
    if (yearBuilt >= 2015) era = "New Construction";
    else if (yearBuilt >= 1960) era = "Post-War";
    else era = "Pre-War";
  }

  const standardStatus = raw.StandardStatus;
  const status = isStandardStatusMember(standardStatus) ? standardStatus : "UNKNOWN";

  // Transitional field name: downstream consumers currently read mlsStatus as
  // effective StandardStatus. Raw Cotality MlsStatus is preserved separately and
  // never participates in status decisions.
  const mlsStatus = standardStatus != null ? String(standardStatus) : "";
  const providerMlsStatus = raw.MlsStatus != null ? String(raw.MlsStatus) : null;

  let comingSoonDate: string | null = null;
  if (status === "ComingSoon") {
    const dateRaw = raw.ActivationDate ?? raw.OnMarketDate;
    if (dateRaw) comingSoonDate = String(dateRaw).split("T")[0];
  }

  const listingKey = listingIdentity(raw);

  return {
    id: listingKey,
    address: displayAddress,
    unit: String(raw.UnitNumber || ""),
    price,

    // Rental list price remains a Cotality fact. Sale "total monthly" is only a
    // TOTAL when both tax and an explicitly-monthly association fee are known.
    totalMonthly: isRental ? price
      : (monthlyTax !== null && maintCC !== null) ? monthlyTax + maintCC
      : null,

    rooms: num(raw.RoomsTotal),
    beds: num(raw.BedroomsTotal),
    baths: (() => {
      if (raw.BathroomsTotalInteger != null) return Number(raw.BathroomsTotalInteger);
      const f = num(raw.BathroomsFull);
      const h = num(raw.BathroomsHalf);
      if (f === null && h === null) return null;
      return (f ?? 0) + (h ?? 0) * 0.5;
    })(),
    fullBaths: num(raw.BathroomsFull),
    halfBaths: num(raw.BathroomsHalf),
    reTaxes: monthlyTax,
    maintCC,
    associationFee,
    associationFeeFrequency,
    intSqft: raw.LivingArea != null ? Number(raw.LivingArea) : null,

    status,
    mlsStatus,
    providerMlsStatus,

    // CommonInterest is the verified ownership fact. OwnershipType is a
    // separate Cotality field and is preserved separately rather than used as a
    // silent fallback.
    ownership: raw.CommonInterest != null ? String(raw.CommonInterest) : "",
    providerOwnershipType: raw.OwnershipType != null ? String(raw.OwnershipType) : null,
    propertyType: mapDisplayPropertyType(raw),
    propertySubType: String(raw.PropertySubType || ""),

    // Geography semantics are not yet closed against live Cotality. Preserve the
    // raw facts without asserting that SubdivisionName/CityRegion/CountyOrParish
    // are the Mallan neighborhood/borough concepts.
    neighborhood: null,
    borough: null,
    providerSubdivisionName: raw.SubdivisionName != null ? String(raw.SubdivisionName) : null,
    providerCityRegion: raw.CityRegion != null ? String(raw.CityRegion) : null,
    providerCountyOrParish: raw.CountyOrParish != null ? String(raw.CountyOrParish) : null,
    zip: String(raw.PostalCode || ""),

    yearBuilt,
    era,
    buildingName: raw.BuildingName ? String(raw.BuildingName) : null,
    buildingKey: raw.BuildingKeyNumeric != null ? Number(raw.BuildingKeyNumeric) : null,
    listingType: null,

    // Distinct provider identity/lineage domains.
    lid: raw.ListingId != null ? String(raw.ListingId) : "",
    wid: listingKey,
    providerListingId: raw.ListingId != null ? String(raw.ListingId) : null,
    providerSourceSystemKey: raw.SourceSystemKey != null ? String(raw.SourceSystemKey) : null,

    // ── Verified rental fee facts, preserved (not rendered here) ─────────────
    //
    // The Search route already selects these four from the live Property feed
    // and they were being discarded at this boundary. They are NOT displayed on
    // the authenticated Agent grid — Maya's 2026-08-26 determination is that an
    // agent-only workbench is not the consumer-facing disclosure surface the
    // FARE Act (NYC LL 119/2024) governs. They are preserved so that any
    // downstream CLIENT-FACING rental output — share page, listing email,
    // rental report, print, client collection, portal — can disclose
    // tenant-payable fees from verified provider facts rather than re-fetching
    // or inventing them.
    //
    // Live $metadata (probed 2026-08-26): MoveInCosts, OngoingFees and
    // TenantPays are MULTI-ENUMS (Enums.Multi.*); TenantPaysDescription is a
    // nullable String(1024). The collections stay collections — flattening them
    // to a comma-joined string would force every consumer to re-parse something
    // the provider never sent.
    //
    // ABSENT IS null, NEVER []. `[]` asserts "the provider says there are no
    // tenant-payable fees"; null says "we were not told". A disclosure surface
    // must be able to tell those apart, so the distinction is preserved here.
    providerMoveInCosts: multiEnumOrNull(raw.MoveInCosts),
    // Edm.Decimal(14,2) nullable. `num()` keeps a genuine 0 as 0 and turns an
    // unparsable value into null rather than NaN — an amount is the single most
    // disclosure-critical fee fact, so it must never silently become zero.
    providerMoveInCostsAmount: num(raw.MoveInCostsAmount),
    // Edm.String(1024) nullable — the human explanation of the amount.
    providerMoveInCostsComments:
      raw.MoveInCostsComments != null ? String(raw.MoveInCostsComments) : null,
    providerOngoingFees: multiEnumOrNull(raw.OngoingFees),
    providerTenantPays: multiEnumOrNull(raw.TenantPays),
    providerTenantPaysDescription:
      raw.TenantPaysDescription != null ? String(raw.TenantPaysDescription) : null,

    dom: num(raw.DaysOnMarket),
    cdom: num(raw.CumulativeDaysOnMarket),
    listedDate: raw.ListingContractDate
      ? new Date(String(raw.ListingContractDate)).toLocaleDateString("en-US")
      : "",
    updatedDate: raw.ModificationTimestamp
      ? new Date(String(raw.ModificationTimestamp)).toLocaleDateString("en-US")
      : "",
    company: String(raw.ListOfficeName || ""),
    agentName: String(raw.ListAgentFullName || ""),
    agentEmail: String(raw.ListAgentEmail || ""),
    agentPhone: String(raw.ListAgentDirectPhone || ""),
    priceChange,
    originalPrice: originalPrice !== null && originalPrice !== price ? originalPrice : null,
    photoCount,
    images,

    // Raw provider coordinate evidence. Canonical map coordinates are a
    // different Mallan fact and are not asserted here.
    latitude: null,
    longitude: null,
    providerLatitude: raw.Latitude != null ? Number(raw.Latitude) : null,
    providerLongitude: raw.Longitude != null ? Number(raw.Longitude) : null,

    crossStreet: String(raw.CrossStreet || ""),
    floor: null,
    description: String(raw.PublicRemarks || ""),
    virtualTourUrl: raw.VirtualTourURLUnbranded
      ? String(raw.VirtualTourURLUnbranded)
      : raw.VirtualTourURLBranded
        ? String(raw.VirtualTourURLBranded)
        : null,

    idxDisplayYN: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
    internetDisplayYN: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
    addressDisplayYN,
    listingCategory: universe === "unknown" ? undefined : universe,
    closedDate: raw.CloseDate ? String(raw.CloseDate) : null,
    contractDate: raw.ListingContractDate ? String(raw.ListingContractDate) : null,
    comingSoonDate,
    downPaymentAssistanceAmount: dpaAmount,
    downPaymentAssistanceCount: dpaCount,
    sponsorUnit,

    permissions: {
      // No live Property field named OwnerOptOut/ParticipantOnly has been
      // established for this mapper. Unknown stays unknown rather than being
      // manufactured from unrelated provider facts.
      ownerOptOut: null,
      participantOnly: null,
      idxDisplay: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
      internetDisplay: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
      syndication: null,
    },

    ListingAgreement: raw.ListingAgreement ? String(raw.ListingAgreement) : null,
    LandLeaseYN: boolOrNull(raw.LandLeaseYN),
    CoolingYN: boolOrNull(raw.CoolingYN),
    GarageYN: boolOrNull(raw.GarageYN),
    DirectionFaces: raw.DirectionFaces ? String(raw.DirectionFaces) : null,
    View: raw.View ? String(raw.View) : null,
    OwnerPays: raw.OwnerPays ? String(raw.OwnerPays) : null,
    ArchitecturalStyle: raw.ArchitecturalStyle ? String(raw.ArchitecturalStyle) : null,
    StructureType: raw.StructureType ? String(raw.StructureType) : null,
    BusinessType: raw.BusinessType ? String(raw.BusinessType) : null,
    AccessibilityFeatures: raw.AccessibilityFeatures ? String(raw.AccessibilityFeatures) : null,
    ExteriorFeatures: raw.ExteriorFeatures ? String(raw.ExteriorFeatures) : null,
    BuildingFeatures: raw.BuildingFeatures ? String(raw.BuildingFeatures) : null,
    LaundryFeatures: raw.LaundryFeatures ? String(raw.LaundryFeatures) : null,
    SecurityFeatures: raw.SecurityFeatures ? String(raw.SecurityFeatures) : null,
    PoolFeatures: raw.PoolFeatures ? String(raw.PoolFeatures) : null,
    PatioAndPorchFeatures: raw.PatioAndPorchFeatures ? String(raw.PatioAndPorchFeatures) : null,
    AssociationAmenities: raw.AssociationAmenities ? String(raw.AssociationAmenities) : null,
    CurrentFinancing: raw.CurrentFinancing ? String(raw.CurrentFinancing) : null,
    PetsAllowedYN: boolOrNull(raw.PetsAllowedYN),
    AvailableLeaseType: raw.AvailableLeaseType ? String(raw.AvailableLeaseType) : null,
    ExistingLeaseType: raw.ExistingLeaseType ? String(raw.ExistingLeaseType) : null,
    ConstructionMaterials: raw.ConstructionMaterials ? String(raw.ConstructionMaterials) : null,
    NewConstructionYN: boolOrNull(raw.NewConstructionYN),
    PriceChangeTimestamp: raw.PriceChangeTimestamp ? String(raw.PriceChangeTimestamp) : null,

    _source: "idx",
    _listingKey: listingKey ?? "",
  };
}
