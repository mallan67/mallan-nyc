import { resolveListingMedia } from "@/lib/media/listing-media-resolver";
import { classifyPropertyType } from "@/lib/search/canonical/property-type-universe";

// REBNY IDX Plus pre-filter: REBNY/Cotality removes non-displayable rows from
// the IDX Plus feed upstream, leaving InternetEntireListingDisplayYN and
// InternetAddressDisplayYN null on the survivors. Treat null as displayable;
// honor explicit false. Mirrors the writer-side convention at
// lib/idx/trestle-mapper.ts:705-706 (commit 0309875b 2026-04-30) and the
// reader-side gate at lib/compliance/gates.ts (idxPlusPreFiltered option).
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
  // The provider's SILENCE is not "Residential". PropertyType is a nullable enum
  // on live Property, and this label drives the display type, the Sale/Rental
  // split and every report grouping.
  return raw.PropertyType != null && String(raw.PropertyType) !== ""
    ? String(raw.PropertyType)
    : null;
}

export function classifyMediaCategory(media: Record<string, unknown>): string {
  const cat = String(media.MediaCategory || "").toLowerCase();
  if (cat.includes("floor plan")) return "FloorPlan";
  if (cat.includes("video")) return "Video";
  if (cat.includes("virtual tour")) return "VirtualTour";
  return "Photo";
}

/**
 * A provider number, or null when the provider supplied nothing.
 *
 * `Number(x) || 0` collapsed THREE different facts into one: absent, unparsable,
 * and a genuine zero. A studio has 0 bedrooms; an unknown maintenance charge is
 * not $0. Only an explicit, finite value survives — everything else is null.
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The provider identity for a row, or null when it has none.
 *
 * Live `$metadata`: `ListingId` and `SourceSystemKey` are BOTH nullable strings,
 * so a row with neither is a legitimate provider state — and an unusable one.
 */
function listingIdentity(raw: Record<string, unknown>): string | null {
  for (const key of ['ListingId', 'SourceSystemKey'] as const) {
    const v = raw[key];
    if (v !== null && v !== undefined && String(v) !== '') return String(v);
  }
  return null;
}

/**
 * Can this provider row be trusted with an identity at all?
 *
 * A row that cannot be identified must not enter the authoritative result
 * universe: it cannot be selected, reported, saved, sent to a client or
 * reconciled against a canonical listing. Callers should exclude it and record
 * an integrity failure rather than let it through with a fabricated id.
 */
export function hasUsableListingIdentity(raw: Record<string, unknown>): boolean {
  return listingIdentity(raw) !== null;
}

/** A provider boolean, or null when unstated. Never invents `true` or `false`. */
function boolOrNull(value: unknown): boolean | null {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

export function mapTrestleToCrmListing(
  raw: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  // `index` is retained for call-site compatibility only. It must NEVER become
  // part of a listing's identity — see `listingIdentity` below.
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
  // STEP 2 — sale/rental comes from the verified PropertyType universe, not from
  // a substring test. `includes("lease")` classified `DisasterReliefRental` (a
  // rental, no "lease" in the name) as a SALE, and swept `CommercialLease` into
  // residential rentals. Membership is positive on both sides and anything else
  // is UNKNOWN — never silently absorbed into sale.
  const universe = classifyPropertyType(propertyType);
  const isRental = universe === "rental";
  const price = num(raw.ListPrice);
  const yearBuilt = raw.YearBuilt != null ? Number(raw.YearBuilt) : null;

  const taxAnnual = num(raw.TaxAnnualAmount);
  const monthlyTax = taxAnnual === null ? null : taxAnnual / 12;
  // NOTE: AssociationFeeFrequency is fetched and NOT yet honoured — a non-monthly
  // fee is still presented as monthly. That is a Step 2 defect (verified mapping),
  // deliberately NOT fixed here. Step 1 only stops the UNKNOWN -> 0 invention.
  const maintCC = num(raw.AssociationFee);

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
  const providerPhotoCount = num(raw.PhotosCount);
  const photoCount = providerPhotoCount !== null ? providerPhotoCount
    : images.length > 0 ? images.length
    : null; // no count and no media == unknown, NOT zero

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

  const originalPrice = Number(raw.OriginalListPrice) || 0;
  let priceChange: string | null = null;
  // No current price means no direction. Unknown is not "unchanged".
  if (price !== null && originalPrice > 0 && originalPrice !== price) {
    priceChange = price < originalPrice ? "down" : "up";
  }

  let era: string | null = null;
  if (yearBuilt) {
    if (yearBuilt >= 2015) era = "New Construction";
    else if (yearBuilt >= 1960) era = "Post-War";
    else era = "Pre-War";
  }

  // The provider's SILENCE is not "Active". An absent status leaves mlsStatus
  // empty, which falls through the map below to UNKNOWN — the safe sentinel.
  const mlsStatus = String(raw.MlsStatus || raw.StandardStatus || "");
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

  return {
    // NEVER manufacture identity. This used to fall back to `index + 1`, so an
    // identityless provider row became listing "1" — an id that then keys
    // selection, client history, reports, saved searches and reconciliation
    // while pointing at nothing. Callers must use `hasUsableListingIdentity`
    // to exclude such a row BEFORE it enters the authoritative universe.
    id: listingIdentity(raw),
    address: displayAddress,
    unit: String(raw.UnitNumber || ""),
    price,
    // Never sum unknowns into a carrying cost. $0/month reads as "no cost".
    totalMonthly: isRental ? price
      : (monthlyTax === null && maintCC === null) ? null
      : (monthlyTax ?? 0) + (maintCC ?? 0),
    rooms: num(raw.RoomsTotal),
    beds: num(raw.BedroomsTotal),
    baths: (() => {
      if (raw.BathroomsTotalInteger != null) return Number(raw.BathroomsTotalInteger);
      const f = num(raw.BathroomsFull);
      const h = num(raw.BathroomsHalf);
      if (f === null && h === null) return null; // no bath fact at all
      return (f ?? 0) + (h ?? 0) * 0.5;
    })(),
    fullBaths: num(raw.BathroomsFull),
    halfBaths: num(raw.BathroomsHalf),
    reTaxes: monthlyTax,
    maintCC,
    intSqft: raw.LivingArea != null ? Number(raw.LivingArea) : null,
    status,
    mlsStatus,
    ownership: String(raw.CommonInterest || raw.OwnershipType || ""),
    propertyType: mapDisplayPropertyType(raw),
    propertySubType: String(raw.PropertySubType || ""),
    neighborhood: String(raw.SubdivisionName || ""),
    // An unknown borough is NOT Manhattan. A Brooklyn listing read as Manhattan
    // is wrong on the card, the map, the report and every saved search.
    borough: raw.CityRegion != null && String(raw.CityRegion) !== "" ? String(raw.CityRegion)
      : raw.CountyOrParish != null && String(raw.CountyOrParish) !== "" ? String(raw.CountyOrParish)
      : null,
    zip: String(raw.PostalCode || ""),
    yearBuilt,
    era,
    buildingName: raw.BuildingName ? String(raw.BuildingName) : null,
    buildingKey: raw.BuildingKeyNumeric != null ? Number(raw.BuildingKeyNumeric) : null,
    // "Exclusive" is a MALLAN business fact. Asserting it on provider inventory
    // claims a seller relationship that does not exist. Unknown until established.
    listingType: null,
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
    originalPrice: originalPrice > 0 && originalPrice !== price ? originalPrice : null,
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
    // NOT changed to null in Step 1, and the EVIDENCE CLASS matters:
    //
    //   EXISTING IDX PLUS RUNTIME/DISTRIBUTION CONTRACT — preserved for safety.
    //   LIVE SEMANTIC VERIFICATION BELONGS TO STEP 2.
    //
    // What live $metadata establishes today is only that
    // InternetEntireListingDisplayYN is a NULLABLE Boolean. Metadata does not
    // define what null MEANS operationally. The "null = displayable" convention
    // comes from the 2026-04-30 incident and the repo's distribution contract
    // (memory/IDX-PLUS-DISPLAY-GATE-2026-04-30.md), where assuming null meant
    // suppressed corrupted 7,594 rows.
    //
    // So this is deliberately NOT flipped to null-when-absent during Step 1 —
    // that would risk repeating the suppression failure — and it is equally NOT
    // recorded as a live-verified provider semantic. Step 2 verifies it.
    // The previous hard-coded `true` WAS wrong regardless, because it ignored an
    // explicit `false`; reading the flag fixes that without touching the convention.
    idxDisplayYN: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
    internetDisplayYN: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
    addressDisplayYN,
    // Explicit on both sides. This was `isRental ? "rental" : undefined`, which
    // made SALE the leftover: every PropertyType member Cotality has not yet
    // populated — Land, CommercialSale, MultiFamily, ResidentialIncome — would
    // have become residential sale inventory the moment it appeared, with no
    // code change and no warning. Unknown now stays undefined and is NOT sale.
    listingCategory: universe === "unknown" ? undefined : universe,
    closedDate: raw.CloseDate ? String(raw.CloseDate) : null,
    contractDate: raw.ListingContractDate ? String(raw.ListingContractDate) : null,
    comingSoonDate,
    downPaymentAssistanceAmount: dpaAmount,
    downPaymentAssistanceCount: dpaCount,
    sponsorUnit,
    // FAIL CLOSED throughout. `false` on an opt-out is an affirmative claim that
    // the owner did NOT opt out; `true` on a display right is a claim the provider
    // granted it. Absent evidence is null, and every consumer must treat null as
    // "not permitted", never as permitted.
    permissions: {
      ownerOptOut: boolOrNull(raw.OwnerOptOut),
      participantOnly: boolOrNull(raw.ParticipantOnly),
      idxDisplay: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN), // pre-filtered: null = displayable
      internetDisplay: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
      syndication: boolOrNull(raw.SyndicateTo),
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
    _listingKey: String(raw.ListingId || raw.SourceSystemKey || ""),
  };
}
