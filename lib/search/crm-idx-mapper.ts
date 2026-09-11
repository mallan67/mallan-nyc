import { resolveListingMedia } from "@/lib/media/listing-media-resolver";
import { boroughFromCityRegion } from "@/lib/listings/canonical-location";
import { computeGateColumns, derivePermissionGates, inferListingType, normalizeStandardStatus } from "@/lib/idx/trestle-mapper";
import { derivePermissionBooleans } from "@/lib/compliance/normalizer";
import { displayPropertyType } from "@/lib/idx/display-property-type";
import { lifecycleFromProviderRow } from "@/lib/listings/canonical-lifecycle";
import { normalizeStoredStatus } from "@/lib/listings/mallan-status";
// THE status authority, per transaction (owner ruling 2026-09-08): the same sale / rental mappings the
// Search contract (lib/search/engine/contract.ts) and the CRM status API project, so the DTO's broker
// language cannot drift from the panels and forms that offer it.
import { RENTAL_STATUS_MAPPING, SALE_STATUS_MAPPING } from "@/lib/crm/status-mapping";
import { comingSoonDom, marketDom } from "@/lib/compliance/dom-tracker";
import type { CotalityRow } from "@/lib/cotality/contract";

// Display / permission gates come from THE canonical helpers in lib/idx/trestle-mapper.ts
// (computeGateColumns with the IDX Plus pre-filter convention, derivePermissionGates for the
// Permission enum). This mapper interprets no permission itself.

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

/**
 * Fail-closed display text for a row whose status cannot be resolved to this transaction's canonical set.
 * The same string the server projection uses (lib/crm/status-mapping.ts `statusPresentation`) and the same
 * one the browser helper falls back to (public/crm/js/core/status-presentation.js), so one row reads the
 * same everywhere. It is NEVER "Active".
 */
const STATUS_UNAVAILABLE = "Status unavailable";

/** Display property type for a raw record — THE implementation lives in lib/idx/display-property-type.ts. */
export function mapDisplayPropertyType(raw: Record<string, unknown>): string | null {
  return displayPropertyType(raw.CommonInterest, raw.PropertySubType, raw.PropertyType);
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
  asOf: Date | string = new Date(),
): Record<string, unknown> {
  const streetParts = [
    raw.StreetNumber,
    raw.StreetDirPrefix,
    raw.StreetName,
    raw.StreetSuffix,
    raw.StreetDirSuffix,
  ].filter(Boolean);
  const address = streetParts.join(" ").toUpperCase() || "";

  // Inventory type: THE classification in lib/idx/trestle-mapper.ts (inferListingType).
  const isRental = inferListingType(raw) === "rent";
  // ListPrice is nullable live: absent stays null; a literal 0 stays 0.
  const price = num(raw.ListPrice);
  const yearBuilt = raw.YearBuilt != null ? Number(raw.YearBuilt) : null;

  // TaxAnnualAmount is nullable live (Active sale: 3,111 of 6,628 rows carry it, 888 of them
  // an explicit 0). Absent → null; /12 is a safe derivation only when the annual figure is known.
  const taxAnnual = num(raw.TaxAnnualAmount);
  const monthlyTax = taxAnnual === null ? null : taxAnnual / 12;
  // AssociationFee is nullable live and carries its own unit, AssociationFeeFrequency (live
  // FeeFrequency enum, 16 members — verified live 2026-09-05; on both active universes every fee-bearing row is
  // Monthly except 2 Annually rows — verified 2026-09-05). A fee is a MONTHLY carrying cost
  // only when the provider says Monthly. Any other frequency is preserved raw and is never
  // presented as monthly maintenance nor added into an exact monthly total.
  const associationFee = num(raw.AssociationFee);
  const associationFeeFrequency = str(raw.AssociationFeeFrequency);
  const maintCC = associationFee !== null && associationFeeFrequency === "Monthly" ? associationFee : null;

  // Provider fact (Permission tokens) and Mallan decisions (_mallanPermission → owner_opt_out / participant_only)
  // are separate: neither is derived from the other.
  const permission = derivePermissionGates(raw);
  const mallanDecision = derivePermissionBooleans(raw._mallanPermission);
  const gates = computeGateColumns({
    status: raw.StandardStatus,
    internetEntireListingDisplayYN: raw.InternetEntireListingDisplayYN,
    internetAddressDisplayYN: raw.InternetAddressDisplayYN,
    internetAutomatedValuationDisplayYN: raw.InternetAutomatedValuationDisplayYN,
    internetConsumerCommentYN: raw.InternetConsumerCommentYN,
    participantOnly: mallanDecision.participant_only,
    ownerOptOut: mallanDecision.owner_opt_out,
    providerIdxPermitted: permission.idxPermitted,
    rls_eligible: true,
  });
  const addressDisplayYN = gates.internet_address_display_yn;
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
  // Every 3D/video carrier the provider publishes on the Property row (live 2026-09-08: the Media
  // subsection has 0 Video / 0 VirtualTour rows; these fields are the only source).
  const virtualTourUrls = [
    raw.VirtualTourURLUnbranded, raw.VirtualTourURLUnbranded2, raw.VirtualTourURLUnbranded3,
    raw.VirtualTourURLBranded, raw.VirtualTourURLBranded2, raw.VirtualTourURLBranded3,
  ].map(str).filter((u): u is string => u !== null);

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

  // ClosePrice — the provider's own ACHIEVED figure, and the only honest price for a comp. It is already
  // selected (lib/search/engine/select.ts) and the DTO already carried `closedDate`, but no `closePrice`,
  // so the Comparables "Sold Price" / "Rented Price" column read `l.closePrice ?? l.close_price`, found
  // neither, and rendered an em-dash on every closed row — a CMA priced at the ask. Only a POSITIVE number
  // is a closing; absent, unparsable, zero and negative are all "the provider published none" → null, which
  // is exactly what the column's own dash means. It is NEVER derived from ListPrice.
  const closePriceRaw = num(raw.ClosePrice);
  const closePrice = closePriceRaw !== null && closePriceRaw > 0 ? closePriceRaw : null;

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

  // ── STATUS: the exact live Cotality StandardStatus token, plus its per-transaction broker label ──
  //
  // Owner rulings (Maya, 2026-09-08 / 2026-09-09). This block used to invent a Mallan uppercase
  // presentation vocabulary ("ACTIVE", "COMING_SOON", "CANCELLED", "OFF_MARKET", "UNKNOWN") and hand it to
  // the browser as `status`. That was the origin of four shipped defects: it collapsed the two distinct
  // live members ActiveUnderContract and Pending into one word, it manufactured the two-L "CANCELLED" the
  // project bans (which then missed the REBNY off-market photo key 'CANCELED' and failed the browser
  // status validators), it left every renderer to re-derive a label from a word that is in no contract,
  // and it carried no transaction, so a rental's Closed could not be told from a sale's.
  //
  //   `status`             — an exact live StandardStatus member, or null. NEVER a Mallan word, never a
  //                          sentinel, never "Active" by default: a status is a Cotality fact and
  //                          defaulting it advertises an off-market or unknown row as live inventory.
  //   `status_label`       — broker language for THAT token in THIS transaction (a sale's Closed reads
  //                          "Sold", a rental's "Rented"; a sale's Pending reads "In Contract", a
  //                          rental's "Pending"), from THE status authority lib/crm/status-mapping.ts —
  //                          the same `canonicalLabels` the Search contract and the CRM forms render.
  //                          A token outside this transaction's canonical set (a rental cannot be
  //                          ComingSoon; Delete is not a marketable state) reads "Status unavailable"
  //                          rather than being relabelled into the other transaction's language.
  //   `status_transaction` — 'sale' | 'rent', so a browser consumer never has to guess the language.
  //
  // Wire-compatible with the server projection every other surface already ships
  // (lib/compliance/dto.ts `statusProjection`, app/api/crm/listings `status_presentation`).
  //
  // Provider rows: the live StandardStatus. MlsStatus is provider-suppressed (null on all 591,597 rows,
  // census 2026-09-08) and can never carry a provider fact; it is read LAST only for legacy Mallan-authored
  // raw_data written before Packet 2 (7 production rows). Mallan rows: their business status under the
  // Mallan key. `normalizeStoredStatus` resolves the legacy Mallan spellings ('Sold' / 'Rented' / 'Leased' /
  // 'Cancelled' / 'Draft') to their token and refuses everything else — it never defaults.
  const rawStatus = str(raw._mallanStatus) ?? str(raw.StandardStatus) ?? str(raw.MlsStatus);
  const status: string | null = normalizeStoredStatus(rawStatus);
  const statusTransaction: "sale" | "rent" = isRental ? "rent" : "sale";
  const statusMapping = isRental ? RENTAL_STATUS_MAPPING : SALE_STATUS_MAPPING;
  const statusLabel =
    status && (statusMapping.canonicalStatuses as readonly string[]).includes(status)
      ? statusMapping.canonicalLabels[status] ?? status
      : STATUS_UNAVAILABLE;

  // `mlsStatus` keeps its existing Mallan-storage-normalizer contract for the ensure-listing boundary
  // (lib/listings/ensure-local-listing.ts reads `dto.mlsStatus || dto.status` and validates it against the
  // live enum). It is NOT a display value and no renderer reads it.
  const mlsStatus = normalizeStandardStatus(rawStatus ?? "");

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
  if (status === "ComingSoon") {
    const dateRaw = raw.ActivationDate ?? raw.OnMarketDate;
    if (dateRaw) {
      comingSoonDate = String(dateRaw).split("T")[0];
    }
  }

  // DOM — ONE rule (lib/compliance/dom-tracker.ts): the Mallan market clock from the provider's contract-event
  // dates (the provider's DaysOnMarket is null on every sampled row of this feed). A Mallan-authored row without
  // provider dates carries its stored clock under the Mallan key (lib/search/engine/hydrate.ts), never a provider field.
  const lifecycle = lifecycleFromProviderRow(raw as CotalityRow<"Property">);
  const market = lifecycle ? marketDom(lifecycle, asOf) : null;

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
    status_label: statusLabel,
    status_transaction: statusTransaction,
    mlsStatus,
    ownership: String(raw.CommonInterest || raw.OwnershipType || ""),
    propertyType: mapDisplayPropertyType(raw),
    propertySubType: String(raw.PropertySubType || ""),
    neighborhood: String(raw.SubdivisionName || ""),
    // CityRegion is the borough (canonical location, 2026-09-08) rendered in Mallan's form
    // ("Staten Island"); a missing borough is unknown — never Manhattan, never the county.
    borough: boroughFromCityRegion(raw.CityRegion),
    zip: String(raw.PostalCode || ""),
    yearBuilt,
    era,
    buildingName: raw.BuildingName ? String(raw.BuildingName) : null,
    buildingKey: raw.BuildingKeyNumeric != null ? Number(raw.BuildingKeyNumeric) : null,
    // The listing-agreement type is a provider fact (ListingAgreement), never a hard-coded label.
    listingType: str(raw.ListingAgreement),
    lid: String(raw.ListingId || ""),
    wid: raw.SourceSystemKey ? String(raw.SourceSystemKey) : null,
    dom: market?.days ?? num(raw._mallanDaysOnMarket),
    cdom: num(raw._mallanCumulativeDaysOnMarket),
    // `estimated` rides with the clock: an off-feed end is Mallan's DETECTION day, not a proven removal date.
    domClock: market ? { start: market.start, end: market.end, endReason: market.endReason, estimated: market.estimated, unverified: market.unverified } : null,
    comingSoonDom: lifecycle ? comingSoonDom(lifecycle, asOf) : null,
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
    // The Cotality fields by their live names, unbranded first (UCBA §5(C)). VirtualTourURLUnbranded2/3
    // (2,382 / 354 live rows) were ignored here before.
    virtualTourUrl: virtualTourUrls[0] ?? null,
    virtualTourUrls,
    idxDisplayYN: gates.idx_display_yn,
    internetDisplayYN: gates.internet_entire_listing_display_yn,
    addressDisplayYN,
    listingCategory: isRental ? "rental" : undefined,
    closedDate: raw.CloseDate ? String(raw.CloseDate) : null,
    closePrice,
    contractDate: raw.ListingContractDate ? String(raw.ListingContractDate) : null,
    comingSoonDate,
    downPaymentAssistanceAmount: dpaAmount,
    downPaymentAssistanceCount: dpaCount,
    sponsorUnit,
    permissions: {
      ownerOptOut: mallanDecision.owner_opt_out,
      participantOnly: mallanDecision.participant_only,
      idxDisplay: gates.idx_display_yn,
      internetDisplay: gates.internet_entire_listing_display_yn,
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
