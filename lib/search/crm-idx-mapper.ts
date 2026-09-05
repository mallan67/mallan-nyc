import { resolveListingMedia } from "@/lib/media/listing-media-resolver";

// REBNY IDX Plus pre-filter: REBNY/Cotality removes non-displayable rows from
// the IDX Plus feed upstream, leaving InternetEntireListingDisplayYN and
// InternetAddressDisplayYN null on the survivors. Treat null as displayable;
// honor explicit false. Mirrors the writer-side convention at
// lib/idx/trestle-mapper.ts:705-706 (commit 0309875b 2026-04-30) and the
// reader-side gate at lib/compliance/gates.ts (idxPlusPreFiltered option).
function isIdxPlusDisplayFlagOn(v: unknown): boolean {
  return v !== false && v !== "false" && v !== "FALSE";
}

/**
 * Provider number or null. ABSENT and ZERO are different facts (Search Consolidation
 * Packet 1 closure): an absent/unparsable value is null; a literal 0 is preserved as 0.
 * Every numeric fact the mapper emits goes through here — never `Number(x) || 0`.
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
/** Provider string or null; empty is unknown. */
function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s === "" ? null : s;
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
  // No PropertyType → unknown. Never "Residential" by default (live: PropertyType is nullable).
  return str(raw.PropertyType);
}

export function classifyMediaCategory(media: Record<string, unknown>): string {
  const cat = String(media.MediaCategory || "").toLowerCase();
  if (cat.includes("floor plan")) return "FloorPlan";
  if (cat.includes("video")) return "Video";
  if (cat.includes("virtual tour")) return "VirtualTour";
  return "Photo";
}

export function mapTrestleToCrmListing(
  raw: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const streetParts = [
    raw.StreetNumber,
    raw.StreetDirPrefix,
    raw.StreetName,
    raw.StreetSuffix,
    raw.StreetDirSuffix,
  ].filter(Boolean);
  const address = streetParts.join(" ").toUpperCase() || "";

  const propertyType = String(raw.PropertyType || "");
  const isRental = propertyType.toLowerCase().includes("lease");
  // ListPrice is nullable live: absent stays null; a literal 0 stays 0.
  const price = num(raw.ListPrice);
  const yearBuilt = raw.YearBuilt != null ? Number(raw.YearBuilt) : null;

  // TaxAnnualAmount is nullable live (Active sale: 3,111 of 6,628 rows carry it, 888 of them
  // an explicit 0). Absent → null; /12 is a safe derivation only when the annual figure is known.
  const taxAnnual = num(raw.TaxAnnualAmount);
  const monthlyTax = taxAnnual === null ? null : taxAnnual / 12;
  // AssociationFee is nullable live and carries its own unit, AssociationFeeFrequency (live
  // FeeFrequency enum, 15 members; on both active universes every fee-bearing row is
  // Monthly except 2 Annually rows — verified 2026-09-05). A fee is a MONTHLY carrying cost
  // only when the provider says Monthly. Any other frequency is preserved raw and is never
  // presented as monthly maintenance nor added into an exact monthly total.
  const associationFee = num(raw.AssociationFee);
  const associationFeeFrequency = str(raw.AssociationFeeFrequency);
  const maintCC = associationFee !== null && associationFeeFrequency === "Monthly" ? associationFee : null;

  const addressDisplayYN = isIdxPlusDisplayFlagOn(raw.InternetAddressDisplayYN);
  const displayAddress = addressDisplayYN
    ? address
    : "ADDRESS AVAILABLE UPON REQUEST";

  // Photo-first media ordering — single source of truth in
  // lib/media/listing-media-resolver.ts. Replaces the prior
  // `isPrimary: i === 0` index-based assignment which would mark a FloorPlan
  // as primary whenever Trestle returned floor-plan rows ahead of photo rows.
  const media = Array.isArray(raw.Media) ? raw.Media : [];
  const resolved = resolveListingMedia(media);
  const images = resolved.map(m => ({
    url: m.url,
    isPrimary: m.isPrimary,
    order: m.providerOrder,
    mediaType: m.mediaType,
  }));
  const photoCount = Number(raw.PhotosCount) || images.length;

  const customProps = Array.isArray(raw.CustomProperty)
    ? raw.CustomProperty[0] as Record<string, unknown> | undefined
    : raw.CustomProperty as Record<string, unknown> | undefined;
  // DownPaymentAssistance* are live Property fields (migrated from CustomProperty,
  // 2026-06-04). Read Property first; fall back to legacy CustomProperty values
  // ONLY when the Property field is blank/null — protects old raw_data that stored
  // these under CustomProperty.
  const dpaAmountSrc =
    raw.DownPaymentAssistanceAmount != null && raw.DownPaymentAssistanceAmount !== ''
      ? raw.DownPaymentAssistanceAmount
      : customProps?.DownPaymentAssistanceAmount;
  const dpaAmount = dpaAmountSrc != null && dpaAmountSrc !== '' ? Number(dpaAmountSrc) : null;
  const dpaCountSrc =
    raw.DownPaymentAssistanceCount != null && raw.DownPaymentAssistanceCount !== ''
      ? raw.DownPaymentAssistanceCount
      : customProps?.DownPaymentAssistanceCount;
  const dpaCount = dpaCountSrc != null && dpaCountSrc !== '' ? Number(dpaCountSrc) : null;

  // CustomFields is a REBNY-specific JSON string on CustomProperty that
  // carries 41 NYC-specific flags (per CLAUDE.md). SponsorUnitYN is the
  // canonical source-of-truth for "Is this a sponsor sale?" — the prior
  // CRM rendering (grid-column-defs.js:63) showed a static '--' because
  // there was no source. Now we parse the JSON once and expose
  // sponsorUnit: true | false | null on the flat listing shape.
  // null = unknown (CustomProperty not expanded, or field absent in JSON).
  // Listing-detail and column renderers can read l.sponsorUnit directly.
  let sponsorUnit: boolean | null = null;
  const customFieldsRaw = customProps?.CustomFields;
  if (typeof customFieldsRaw === "string" && customFieldsRaw.length > 0) {
    try {
      const parsed = JSON.parse(customFieldsRaw) as Record<string, unknown>;
      const v = parsed?.SponsorUnitYN;
      if (v === true || v === "true" || v === "Yes" || v === 1) sponsorUnit = true;
      else if (v === false || v === "false" || v === "No" || v === 0) sponsorUnit = false;
    } catch {
      // Malformed JSON — leave sponsorUnit as null. No log spam: CustomFields
      // is provider-controlled and may legitimately be empty / non-JSON
      // for older listings or non-REBNY MLOs.
    }
  }

  const originalPrice = num(raw.OriginalListPrice);
  let priceChange: string | null = null;
  if (originalPrice !== null && price !== null && originalPrice !== price) {
    priceChange = price < originalPrice ? "down" : "up";
  }

  let era: string | null = null;
  if (yearBuilt) {
    if (yearBuilt >= 2015) era = "New Construction";
    else if (yearBuilt >= 1960) era = "Post-War";
    else era = "Pre-War";
  }

  // A missing status is UNKNOWN — never Active by default. (Provider status text still goes
  // through the UCBA-safe map below; unmapped/absent → "UNKNOWN".)
  const mlsStatus = str(raw.MlsStatus) ?? str(raw.StandardStatus) ?? "";
  const statusMap: Record<string, string> = {
    Active: "ACTIVE",
    ComingSoon: "COMING_SOON",
    "Coming Soon": "COMING_SOON",
    ActiveUnderContract: "PENDING",
    "Active Under Contract": "PENDING",
    Pending: "PENDING",
    Closed: "CLOSED",
    Expired: "EXPIRED",
    Withdrawn: "WITHDRAWN",
    Hold: "HOLD",
    Incomplete: "INCOMPLETE",
    Canceled: "CANCELLED",
    Cancelled: "CANCELLED",
    // ── UCBA Art. I §5(D) — "Off-Market" labeling is prohibited.
    // Some MLS feeds (or stale data sources) may emit "Off Market" /
    // "Off-Market" / "OffMarket" in MlsStatus. Map all variants to
    // "WITHDRAWN", the closest UCBA-compliant canonical status.
    // Without this mapping, the prior `mlsStatus.toUpperCase()`
    // fallback would produce "OFF MARKET" — a literal violation.
    "Off Market": "WITHDRAWN",
    "Off-Market": "WITHDRAWN",
    OffMarket: "WITHDRAWN",
    offMarket: "WITHDRAWN",
    "off market": "WITHDRAWN",
  };
  // Unmapped values fall through to "UNKNOWN" — a SAFE default that
  // never accidentally surfaces non-canonical status text in UCBA-
  // sensitive contexts. Renderers should treat UNKNOWN as a non-active
  // sentinel and either suppress badges or show a neutral indicator.
  // (Was: `mlsStatus.toUpperCase()` which could produce "OFF MARKET",
  // "FUTURE", or any other vendor-specific string in the UI.)
  const status = statusMap[mlsStatus] || "UNKNOWN";

  // ── Coming Soon date (UCBA Art. I §16(C)) ──────────────────────────
  // UCBA requires "No Showings or Open House until [date]" disclosure
  // for Coming Soon listings. The date must be specific. Previously
  // comingSoonDate was hard-coded to null in the return object, and
  // the badge renderer fell back to the vague string "until active
  // date". Pull the actual date from Trestle:
  //   ActivationDate    — REBNY's "showings begin" timestamp
  //   OnMarketDate      — RESO standard fallback
  // Format as ISO YYYY-MM-DD for downstream display.
  let comingSoonDate: string | null = null;
  if (status === "COMING_SOON") {
    const dateRaw = raw.ActivationDate ?? raw.OnMarketDate;
    if (dateRaw) {
      comingSoonDate = String(dateRaw).split("T")[0];
    }
  }

  const fullBaths =
    raw.BathroomsFull != null && Number.isFinite(Number(raw.BathroomsFull))
      ? Number(raw.BathroomsFull)
      : null;
  const halfBaths =
    raw.BathroomsHalf != null && Number.isFinite(Number(raw.BathroomsHalf))
      ? Number(raw.BathroomsHalf)
      : null;
  const baths =
    fullBaths != null && halfBaths != null
      ? fullBaths + halfBaths * 0.5
      : null;

  return {
    id: String(raw.ListingId || raw.SourceSystemKey || index + 1),
    address: displayAddress,
    unit: String(raw.UnitNumber || ""),
    price,
    // Rental: the verified rental meaning (monthly rent = ListPrice). Sale: a TOTAL only when
    // both the monthly tax and an explicitly-monthly fee are known; otherwise unavailable.
    totalMonthly: isRental ? price : (monthlyTax !== null && maintCC !== null ? monthlyTax + maintCC : null),
    rooms: num(raw.RoomsTotal),
    beds: num(raw.BedroomsTotal),
    // Canonical Mallan bath value = BathroomsFull + 0.5 x BathroomsHalf, ONLY when both
    // components are present and numeric; otherwise null. Live Cotality declares all three
    // bathroom fields nullable. The Validator proved Full/Half complete on the current active
    // sale and rental universes (2026-09-05, re-check item 3) and that BathroomsTotalInteger
    // disagrees with Full+Half on sampled rows, so TotalInteger is never the source and never
    // a fallback. A null component is an unknown provider fact, never 0.
    baths,
    fullBaths,
    halfBaths,
    reTaxes: monthlyTax,
    maintCC,
    associationFee,
    associationFeeFrequency,
    intSqft: raw.LivingArea != null ? Number(raw.LivingArea) : null,
    status,
    mlsStatus,
    ownership: String(raw.CommonInterest || raw.OwnershipType || ""),
    propertyType: mapDisplayPropertyType(raw),
    propertySubType: String(raw.PropertySubType || ""),
    neighborhood: String(raw.SubdivisionName || ""),
    // CityRegion is the live borough carrier (Validator 2026-09-05). CountyOrParish is the
    // county field, not a borough; a missing borough is unknown — never Manhattan.
    borough: str(raw.CityRegion),
    zip: String(raw.PostalCode || ""),
    yearBuilt,
    era,
    buildingName: raw.BuildingName ? String(raw.BuildingName) : null,
    buildingKey: raw.BuildingKeyNumeric != null ? Number(raw.BuildingKeyNumeric) : null,
    // The listing-agreement type is a provider fact (ListingAgreement), never a hard-coded label.
    listingType: str(raw.ListingAgreement),
    lid: String(raw.ListingId || ""),
    wid: raw.SourceSystemKey ? String(raw.SourceSystemKey) : null,
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
    originalPrice: originalPrice !== null && price !== null && originalPrice !== price ? originalPrice : null,
    photoCount,
    images,
    latitude: raw.Latitude != null ? Number(raw.Latitude) : null,
    longitude: raw.Longitude != null ? Number(raw.Longitude) : null,
    crossStreet: String(raw.CrossStreet || ""),
    floor: null,
    description: String(raw.PublicRemarks || ""),
    virtualTourUrl: raw.VirtualTourURLUnbranded
      ? String(raw.VirtualTourURLUnbranded)
      : raw.VirtualTourURLBranded
        ? String(raw.VirtualTourURLBranded)
        : null,
    idxDisplayYN: true,
    internetDisplayYN: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
    addressDisplayYN,
    listingCategory: isRental ? "rental" : undefined,
    closedDate: raw.CloseDate ? String(raw.CloseDate) : null,
    contractDate: raw.ListingContractDate ? String(raw.ListingContractDate) : null,
    comingSoonDate,
    downPaymentAssistanceAmount: dpaAmount,
    downPaymentAssistanceCount: dpaCount,
    sponsorUnit,
    permissions: {
      ownerOptOut: false,
      participantOnly: false,
      idxDisplay: true,
      internetDisplay: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
      syndication: true,
    },
    ListingAgreement: raw.ListingAgreement ? String(raw.ListingAgreement) : null,
    LandLeaseYN: raw.LandLeaseYN === true || raw.LandLeaseYN === "true",
    CoolingYN: raw.CoolingYN === true || raw.CoolingYN === "true",
    GarageYN: raw.GarageYN === true || raw.GarageYN === "true",
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
    PetsAllowedYN: raw.PetsAllowedYN === true || raw.PetsAllowedYN === "true",
    AvailableLeaseType: raw.AvailableLeaseType ? String(raw.AvailableLeaseType) : null,
    ExistingLeaseType: raw.ExistingLeaseType ? String(raw.ExistingLeaseType) : null,
    ConstructionMaterials: raw.ConstructionMaterials ? String(raw.ConstructionMaterials) : null,
    NewConstructionYN: raw.NewConstructionYN === true || raw.NewConstructionYN === "true",
    PriceChangeTimestamp: raw.PriceChangeTimestamp ? String(raw.PriceChangeTimestamp) : null,
    _source: "idx",
    _listingKey: String(raw.ListingId || raw.SourceSystemKey || ""),
  };
}
