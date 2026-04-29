import { affirmPermission } from "@/lib/compliance/gates";

export function mapDisplayPropertyType(raw: Record<string, unknown>): string {
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
  return String(raw.PropertyType || "Residential");
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
  const price = Number(raw.ListPrice) || 0;
  const yearBuilt = raw.YearBuilt != null ? Number(raw.YearBuilt) : null;

  const taxAnnual = Number(raw.TaxAnnualAmount) || 0;
  const monthlyTax = taxAnnual / 12;
  const maintCC = Number(raw.AssociationFee) || 0;

  const addressDisplayYN = affirmPermission(raw.InternetAddressDisplayYN);
  const displayAddress = addressDisplayYN
    ? address
    : "ADDRESS AVAILABLE UPON REQUEST";

  const media = Array.isArray(raw.Media) ? raw.Media : [];
  const photoCount = Number(raw.PhotosCount) || media.length;
  const images = media.map((item: Record<string, unknown>, i: number) => {
    const rawUrl = String(item.MediaURL || "");
    const url = rawUrl.includes("cotality.com") || rawUrl.includes("corelogic.com")
      ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`
      : rawUrl;
    return {
      url,
      isPrimary: i === 0,
      order: Number(item.Order || i),
      mediaType: classifyMediaCategory(item),
    };
  }).filter((img: { url: string }) => img.url);

  const customProps = Array.isArray(raw.CustomProperty)
    ? raw.CustomProperty[0] as Record<string, unknown> | undefined
    : raw.CustomProperty as Record<string, unknown> | undefined;
  const dpaAmount = customProps?.DownPaymentAssistanceAmount != null
    ? Number(customProps.DownPaymentAssistanceAmount)
    : null;
  const dpaCount = customProps?.DownPaymentAssistanceCount != null
    ? Number(customProps.DownPaymentAssistanceCount)
    : null;

  const originalPrice = Number(raw.OriginalListPrice) || 0;
  let priceChange: string | null = null;
  if (originalPrice > 0 && originalPrice !== price) {
    priceChange = price < originalPrice ? "down" : "up";
  }

  let era: string | null = null;
  if (yearBuilt) {
    if (yearBuilt >= 2015) era = "New Construction";
    else if (yearBuilt >= 1960) era = "Post-War";
    else era = "Pre-War";
  }

  const mlsStatus = String(raw.MlsStatus || raw.StandardStatus || "Active");
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
  };
  const status = statusMap[mlsStatus] || mlsStatus.toUpperCase();

  return {
    id: String(raw.ListingId || raw.SourceSystemKey || index + 1),
    address: displayAddress,
    unit: String(raw.UnitNumber || ""),
    price,
    totalMonthly: isRental ? price : monthlyTax + maintCC,
    rooms: Number(raw.RoomsTotal) || 0,
    beds: Number(raw.BedroomsTotal) || 0,
    baths:
      raw.BathroomsTotalInteger != null ? Number(raw.BathroomsTotalInteger) :
      (Number(raw.BathroomsFull) || 0) +
      (Number(raw.BathroomsHalf) || 0) * 0.5,
    fullBaths: Number(raw.BathroomsFull) || 0,
    halfBaths: Number(raw.BathroomsHalf) || 0,
    reTaxes: monthlyTax,
    maintCC,
    intSqft: raw.LivingArea != null ? Number(raw.LivingArea) : null,
    status,
    mlsStatus,
    ownership: String(raw.CommonInterest || raw.OwnershipType || ""),
    propertyType: mapDisplayPropertyType(raw),
    propertySubType: String(raw.PropertySubType || ""),
    neighborhood: String(raw.SubdivisionName || ""),
    borough: String(raw.CityRegion || raw.CountyOrParish || "Manhattan"),
    zip: String(raw.PostalCode || ""),
    yearBuilt,
    era,
    buildingName: raw.BuildingName ? String(raw.BuildingName) : null,
    buildingKey: raw.BuildingKeyNumeric != null ? Number(raw.BuildingKeyNumeric) : null,
    listingType: "Exclusive",
    lid: String(raw.ListingId || ""),
    wid: raw.SourceSystemKey ? String(raw.SourceSystemKey) : null,
    dom: Number(raw.DaysOnMarket) || 0,
    cdom: Number(raw.CumulativeDaysOnMarket) || 0,
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
    idxDisplayYN: true,
    internetDisplayYN: affirmPermission(raw.InternetEntireListingDisplayYN),
    addressDisplayYN,
    listingCategory: isRental ? "rental" : undefined,
    closedDate: raw.CloseDate ? String(raw.CloseDate) : null,
    contractDate: raw.ListingContractDate ? String(raw.ListingContractDate) : null,
    comingSoonDate: null,
    downPaymentAssistanceAmount: dpaAmount,
    downPaymentAssistanceCount: dpaCount,
    permissions: {
      ownerOptOut: false,
      participantOnly: false,
      idxDisplay: true,
      internetDisplay: affirmPermission(raw.InternetEntireListingDisplayYN),
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
