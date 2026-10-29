import { resolveListingMedia } from "@/lib/media/listing-media-resolver";
import { daysOnMarket, parseCustomFields } from "@/lib/search/crm-idx-filter";
import { boroughDisplay } from "@/lib/idx/geography";
// CommonInterest is read through the raw-contract accessor (convergence 2026-10-02 cutover).
import { readCotalityCommonInterest, readCotalityPropertySubType } from "@/lib/cotality/property";

// Live Cotality carries video and 3D links on Property, not in Media (Media holds only Photo and
// FloorPlan rows — verified 2026-10-23 and 2026-10-26: 0 Video / 0 UnbrandedVirtualTour rows).
// Owner rule (2026-10-26): videos and tours use the UNBRANDED links only. The branded fields
// (VirtualTourURLBranded/2/3) are never read — live, every on-market branded link (336) is also the
// unbranded link and none is branded-only, so nothing is lost. Display preference order.
const TOUR_FIELDS = ["VirtualTourURLUnbranded", "VirtualTourURLUnbranded2", "VirtualTourURLUnbranded3"] as const;

export interface ListingTour {
  url: string;
  kind: "video" | "3d" | "link";
  /** A URL safe to place in an iframe, or null when the host only works as a link. */
  embedUrl: string | null;
}

// Tour hosts the CRM embeds in place. Each must also be in the CRM Content-Security-Policy frame-src
// (lib/middleware/security-headers.ts CRM_CSP); every other tour opens in a new tab.
export const TOUR_EMBED_HOSTS = ["www.youtube.com", "player.vimeo.com", "my.matterport.com", "listing3d.com", "kuula.co"] as const;

export function classifyTourUrl(rawUrl: string): ListingTour {
  // Live Cotality carries some links without a scheme ("youtube.com/watch?v=…", 7 active sales) or with
  // text before it ("_https://youtu.be/…", 2026-10-24): use the web address inside the value.
  const embedded = /https?:\/\/\S+/i.exec(rawUrl)?.[0];
  const url = embedded ?? (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(rawUrl) ? `https://${rawUrl}` : rawUrl);
  let host = "";
  let parsed: URL | null = null;
  try { parsed = new URL(url); host = parsed.hostname.replace(/^www\./, "").toLowerCase(); } catch { /* not a URL */ }
  if (parsed && (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be")) {
    const id = host === "youtu.be" ? parsed.pathname.slice(1) : parsed.searchParams.get("v") || parsed.pathname.match(/\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] || "";
    return { url, kind: "video", embedUrl: id ? `https://www.youtube.com/embed/${id}` : null };
  }
  if (parsed && (host === "vimeo.com" || host === "player.vimeo.com")) {
    const id = parsed.pathname.match(/(\d{5,})/)?.[1];
    return { url, kind: "video", embedUrl: id ? `https://player.vimeo.com/video/${id}` : null };
  }
  if (/(^|\.)wistia\.(com|net)$/.test(host) || /\.(mp4|mov|webm)(\?|$)/i.test(url)) {
    return { url, kind: "video", embedUrl: null };
  }
  if (host === "my.matterport.com" || host === "listing3d.com" || host === "kuula.co") {
    return { url, kind: "3d", embedUrl: url };
  }
  if (/(^|\.)(matterport\.com|youriguide\.com|iguide\.com|cupix\.com|ricoh360\.com|the3dapp\.com|vr-360-tour\.com|3dapartment\.com)$/.test(host)
      || (host === "zillow.com" && /\/(view-3d-home|view-imx)\//.test(parsed?.pathname || ""))) {
    return { url, kind: "3d", embedUrl: null };
  }
  return { url, kind: "link", embedUrl: null };
}

export interface AgentContact {
  name: string;
  mlsId: string | null;
  email: string | null;
  directPhone: string | null;
  preferredPhone: string | null;
  mobilePhone: string | null;
  url: string | null;
  license: string | null;
  /** Set by the search route for Mallan's own agents (Mallan agent records); null otherwise. */
  photo: string | null;
  /** Co-listing agents: the office in the same slot. */
  office?: OfficeContact | null;
}
export interface OfficeContact { name: string; mlsId: string | null; phone: string | null; email: string | null; url: string | null }

const text = (v: unknown) => (v == null || v === "" ? null : String(v));
const yn = (v: unknown) => (v === true || v === "true" ? true : v === false || v === "false" ? false : null);
// Cotality carries placeholder phones such as "-" (live 2026-10-24): a phone needs at least 7 digits.
const phone = (v: unknown) => (v != null && String(v).replace(/D/g, "").length >= 7 ? String(v).trim() : null);

/**
 * PublicRemarks is text in RESO, but live Cotality delivers most remarks as HTML: 6,561 of 10,184 Active
 * listings on 2026-10-27 (`<br>` 51k, `<p>` 41k, `<li>` 7.5k, `<strong>` 6.5k, styled spans). Rendered raw,
 * the tags broke the report layout and would carry any markup the listing agent typed into the CRM;
 * escaped, the agent read a literal "<br>". Paragraphs and line breaks are kept as blank lines / newlines,
 * list items become "• " lines, every other tag is dropped and the common entities are decoded. Plain
 * remarks pass through untouched.
 */
export function remarksToText(v: unknown): string {
  if (v == null || v === "") return "";
  let s = String(v);
  if (!/[<&]/.test(s)) return s.trim();
  s = s
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "\n• ")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|tr|blockquote|ul|ol)\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  const named: Record<string, string> = {
    nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘",
    rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", bull: "•",
  };
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    const c = code.toLowerCase();
    if (c[0] === "#") {
      const n = c[1] === "x" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return c in named ? named[c] : m;
  });
  return s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n(• )/g, "\n$1") // bullets stay single-spaced
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** One agent's contact from the Property fields with this prefix (ListAgent, CoListAgent, CoListAgent2…). */
export function agentContact(raw: Record<string, unknown>, prefix: string): AgentContact {
  return {
    name: String(raw[`${prefix}FullName`] || ""),
    mlsId: text(raw[`${prefix}MlsId`]),
    email: text(raw[`${prefix}Email`]),
    directPhone: phone(raw[`${prefix}DirectPhone`]),
    preferredPhone: phone(raw[`${prefix}PreferredPhone`]),
    mobilePhone: phone(raw[`${prefix}MobilePhone`]),
    url: text(raw[`${prefix}URL`]),
    license: text(raw[`${prefix}StateLicense`]),
    photo: null,
  };
}

/** One office's contact from the Property fields with this prefix (ListOffice, CoListOffice, CoListOffice2). */
export function officeContact(raw: Record<string, unknown>, prefix: string): OfficeContact {
  return {
    name: String(raw[`${prefix}Name`] || ""),
    mlsId: text(raw[`${prefix}MlsId`]),
    phone: phone(raw[`${prefix}Phone`]),
    email: text(raw[`${prefix}Email`]),
    url: text(raw[`${prefix}URL`]),
  };
}

export function listingTours(raw: Record<string, unknown>): ListingTour[] {
  const seen = new Set<string>();
  const tours: ListingTour[] = [];
  for (const field of TOUR_FIELDS) {
    const url = raw[field] ? String(raw[field]).trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    tours.push(classifyTourUrl(url));
  }
  return tours;
}


// REBNY IDX Plus pre-filter: REBNY/Cotality removes non-displayable rows from
// the IDX Plus feed upstream, leaving InternetEntireListingDisplayYN and
// InternetAddressDisplayYN null on the survivors. Treat null as displayable;
// honor explicit false. Mirrors the writer-side convention at
// lib/idx/trestle-mapper.ts:705-706 (commit 0309875b 2026-04-30) and the
// reader-side gate at lib/compliance/gates.ts (idxPlusPreFiltered option).
function isIdxPlusDisplayFlagOn(v: unknown): boolean {
  return v !== false && v !== "false" && v !== "FALSE";
}

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
  // SingleFamilyResidence has no dedicated case here -- MALLAN_BUSINESS_RULE_UNRESOLVED
  // (see readCotalityPropertySubType's docstring in lib/cotality/property.ts). Falls
  // through to the verbatim raw-value return below. A prior branch here
  // (sub.includes("single family") || sub.includes("house")) was proven dead against the
  // live spelling "SingleFamilyResidence" and was deleted, not retained, 2026-10-03.
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

// Co-list side (live Property CoListAgent{,2,3}* and CoListOffice{,2}*). Kept separate from the primary ListAgent*/ListOffice*
// fields and never merged with them. The office relation is derived ONLY from the two office MLS IDs: same / different / unknown
// (a blank id). It says nothing about whether two offices belong to one firm; several Office records can share a main office.
function coListSlots(raw: Record<string, unknown>, kind: "Agent" | "Office", slots: number[]) {
  return slots
    .map((slot) => {
      const prefix = `CoList${kind}${slot === 1 ? "" : slot}`;
      return {
        slot,
        mlsId: String(raw[`${prefix}MlsId`] || ""),
        name: String(raw[kind === "Agent" ? `${prefix}FullName` : `${prefix}Name`] || ""),
      };
    })
    .filter((entry) => entry.mlsId || entry.name);
}

function officeRelation(primaryMlsId: string, otherMlsId: string): "same" | "different" | "unknown" {
  if (!primaryMlsId || !otherMlsId) return "unknown";
  return primaryMlsId === otherMlsId ? "same" : "different";
}

export function mapTrestleToCrmListing(
  raw: Record<string, unknown>,
  index: number,
): Record<string, unknown> {
  const permission = String(raw.Permission || "").split(",").map((v) => v.trim()).filter(Boolean);
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
  const maintCC = Number(raw.AssociationFee) || 0;

  const addressDisplayYN = isIdxPlusDisplayFlagOn(raw.InternetAddressDisplayYN);
  const displayAddress = addressDisplayYN
    ? address
    : "ADDRESS AVAILABLE UPON REQUEST";

  // Photo-first media ordering — single source of truth in
  // lib/media/listing-media-resolver.ts. Replaces the prior
  // `isPrimary: i === 0` index-based assignment which would mark a FloorPlan
  // as primary whenever Cotality returned floor-plan rows ahead of photo rows.
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

  // REBNY CustomProperty.CustomFields (sponsor, attendance, financing, flip tax, conditions, …).
  // Live values are strings: YN keys carry "1" / "0" (verified 2026-10-23). sponsorUnit is
  // true | false | null (null = CustomFields absent or the key not present).
  const rebny = parseCustomFields(raw);
  // Monthly real-estate taxes: Property.TaxAnnualAmount / 12 when Cotality has it, otherwise the REBNY
  // CustomFields TaxMonthlyAmount (live 2026-10-26: 2,374 of 4,413 active condos carry no
  // TaxAnnualAmount while their custom fields hold the monthly tax, e.g. RLS20117661 → "1560.00").
  // 0 = neither source has it; the renderers show "--" for 0.
  const monthlyTax = taxAnnual ? taxAnnual / 12 : Number(rebny.TaxMonthlyAmount) || 0;
  const sponsorRaw = rebny.SponsorUnitYN;
  const sponsorUnit: boolean | null =
    sponsorRaw === "1" || sponsorRaw === 1 || sponsorRaw === true ? true
      : sponsorRaw === "0" || sponsorRaw === 0 || sponsorRaw === false ? false
        : null;

  const tours = listingTours(raw);
  const firstTour = (kind: ListingTour["kind"]) => tours.find((t) => t.kind === kind) || null;

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

  // Status comes from StandardStatus only — MlsStatus is suppressed by Cotality and is never
  // substituted (Master §0.6). The `mlsStatus` output key is kept for existing renderers and
  // carries the raw StandardStatus value.
  const mlsStatus = String(raw.StandardStatus || "");
  // The canonical status for the UCBA-safe status map below is the same raw StandardStatus (null when absent).
  const canonicalStatus: string | null = mlsStatus || null;
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
    // Some data sources may emit "Off Market" / "Off-Market" / "OffMarket" as the
    // canonicalStatus value (sourced from StandardStatus via readCotalityStandardStatus
    // above -- never from Cotality's actual MlsStatus field; 2026-10-03 Status residue
    // cutover). Map all variants to "WITHDRAWN", the closest UCBA-compliant canonical
    // status. Without this mapping, the prior `mlsStatus.toUpperCase()` fallback would
    // produce "OFF MARKET" — a literal violation.
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
  const status = statusMap[canonicalStatus ?? ""] || "UNKNOWN";

  // ── Coming Soon date (UCBA Art. I §16(C)) ──────────────────────────
  // UCBA requires "No Showings or Open House until [date]" disclosure
  // for Coming Soon listings. The date must be specific. Previously
  // comingSoonDate was hard-coded to null in the return object, and
  // the badge renderer fell back to the vague string "until active
  // date". Pull the actual date from the Cotality record:
  //   ActivationDate    — REBNY's "showings begin" timestamp
  //   OnMarketDate      — fallback (live Cotality field)
  // Format as ISO YYYY-MM-DD for downstream display.
  let comingSoonDate: string | null = null;
  if (status === "COMING_SOON") {
    const dateRaw = raw.ActivationDate ?? raw.OnMarketDate;
    if (dateRaw) {
      comingSoonDate = String(dateRaw).split("T")[0];
    }
  }

  return {
    id: String(raw.ListingId || raw.ListingKey || index + 1),
    listingKey: raw.ListingKey ? String(raw.ListingKey) : null,
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
    // Sort keys matching the Cotality $orderby the agent search uses (StreetName, ListingContractDate)
    streetName: String(raw.StreetName || ""),
    streetNumber: String(raw.StreetNumber || ""),
    listedDateIso: raw.ListingContractDate ? String(raw.ListingContractDate).slice(0, 10) : null,
    status,
    mlsStatus,
    ownership: readCotalityCommonInterest(raw),
    propertyType: mapDisplayPropertyType(raw),
    propertySubType: readCotalityPropertySubType(raw),
    // Live Cotality values as delivered (free text filled by the listing broker); the borough is
    // shown with its display spelling ("StatenIsland" → "Staten Island") and never defaulted.
    neighborhood: String(raw.SubdivisionName || ""),
    borough: boroughDisplay(String(raw.CityRegion || "")),
    cityRegion: String(raw.CityRegion || ""),
    zip: String(raw.PostalCode || ""),
    city: raw.City ? String(raw.City) : "",
    postalCity: raw.PostalCity ? String(raw.PostalCity) : "",
    countyOrParish: raw.CountyOrParish ? String(raw.CountyOrParish) : "",
    // Building facts and listing history as Cotality carries them (Sales / Rental Tools viewers, detail page)
    totalUnits: raw.NumberOfUnitsTotal != null ? Number(raw.NumberOfUnitsTotal) : null,
    stories: raw.StoriesTotal != null ? Number(raw.StoriesTotal) : null,
    exposures: raw.Exposures ? String(raw.Exposures) : null,
    lotSizeArea: raw.LotSizeArea != null ? Number(raw.LotSizeArea) : null,
    associationFeeFrequency: raw.AssociationFeeFrequency ? String(raw.AssociationFeeFrequency) : null,
    onMarketDate: raw.OnMarketDate ? String(raw.OnMarketDate) : null,
    offMarketDate: raw.OffMarketDate ? String(raw.OffMarketDate) : null,
    activationDate: raw.ActivationDate ? String(raw.ActivationDate) : null,
    contractStatusChangeDate: raw.ContractStatusChangeDate ? String(raw.ContractStatusChangeDate) : null,
    originalEntryDate: raw.OriginalEntryTimestamp ? String(raw.OriginalEntryTimestamp) : null,
    // Rental terms and FARE Act fee transparency (Property fields; AdditionalFee* travel in REBNY CustomFields)
    securityDeposit: raw.SecurityDeposit != null ? Number(raw.SecurityDeposit) : null,
    MoveInCosts: raw.MoveInCosts ? String(raw.MoveInCosts) : null,
    MoveInCostsComments: raw.MoveInCostsComments ? String(raw.MoveInCostsComments) : null,
    OngoingFees: raw.OngoingFees ? String(raw.OngoingFees) : null,
    TenantPays: raw.TenantPays ? String(raw.TenantPays) : null,
    TenantPaysDescription: raw.TenantPaysDescription ? String(raw.TenantPaysDescription) : null,
    yearBuilt,
    era,
    buildingName: raw.BuildingName ? String(raw.BuildingName) : null,
    buildingKey: raw.BuildingKeyNumeric != null ? Number(raw.BuildingKeyNumeric) : null,
    listingType: "Exclusive",
    lid: String(raw.ListingId || ""),
    // SourceSystemKey is suppressed by Cotality; the Cotality record key is ListingKey.
    wid: raw.ListingKey ? String(raw.ListingKey) : null,
    dom: daysOnMarket(raw),
    cdom: null,
    listedDate: raw.ListingContractDate
      ? new Date(String(raw.ListingContractDate)).toLocaleDateString("en-US")
      : "",
    updatedDate: raw.ModificationTimestamp
      ? new Date(String(raw.ModificationTimestamp)).toLocaleDateString("en-US")
      : "",
    company: String(raw.ListOfficeName || ""),
    agentName: String(raw.ListAgentFullName || ""),
    agentEmail: String(raw.ListAgentEmail || ""),
    agentPhone: phone(raw.ListAgentDirectPhone) || phone(raw.ListAgentPreferredPhone) || "",
    agentMlsId: raw.ListAgentMlsId ? String(raw.ListAgentMlsId) : null,
    officeMlsId: raw.ListOfficeMlsId ? String(raw.ListOfficeMlsId) : null,
    // Full contact as Cotality carries it (Property ListAgent* / ListOffice*). Agent photos are not in
    // the feed (Media has 0 Member rows, live 2026-10-24): the route adds Mallan agents' own headshots.
    agent: agentContact(raw, "ListAgent"),
    office: officeContact(raw, "ListOffice"),
    // Co-listing agents / offices as Cotality carries them (Member / Office attributions).
    coAgents: (["CoListAgent", "CoListAgent2", "CoListAgent3"] as const)
      .filter((p) => raw[`${p}MlsId`] || raw[`${p}FullName`])
      // Each co-listing agent with the office in the same slot (CoListAgent2 ↔ CoListOffice2; slot 3 has none)
      .map((p) => { const o = p.replace("Agent", "Office"); return { ...agentContact(raw, p), office: raw[`${o}Name`] || raw[`${o}MlsId`] ? officeContact(raw, o) : null }; }),
    coOffices: (["CoListOffice", "CoListOffice2"] as const)
      .filter((p) => raw[`${p}MlsId`] || raw[`${p}Name`])
      .map((p) => officeContact(raw, p)),
    priceChange,
    originalPrice: originalPrice > 0 && originalPrice !== price ? originalPrice : null,
    photoCount,
    images,
    videosCount: raw.VideosCount != null ? Number(raw.VideosCount) : null,
    // Every unbranded tour link Cotality carries, classified as video / 3d / link (Property tour fields).
    tours,
    // videoTourUrl / virtualTourUrl: the first video and the first 3D tour — the names the CRM
    // reports, report package and field dictionaries read (lib/types/listing.ts ListingInfo).
    videoTourUrl: firstTour("video")?.url ?? null,
    virtualTourUrl: firstTour("3d")?.url ?? null,
    crossStreet: String(raw.CrossStreet || ""),
    // Floor = the floor the unit is on = Cotality EntryLevel (owner rule; live on most records)
    floor: raw.EntryLevel != null && raw.EntryLevel !== "" ? String(raw.EntryLevel) : null,
    description: remarksToText(raw.PublicRemarks),
    idxDisplayYN: permission.length ? permission.includes("IDX") : true,
    internetDisplayYN: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
    // Live Cotality Permission values (multi-select, e.g. "IDX", "SyndicateOptOut") and the IDX Plus display flags
    permission,
    consumerCommentsYN: yn(raw.InternetConsumerCommentYN),
    avmDisplayYN: yn(raw.InternetAutomatedValuationDisplayYN),
    addressDisplayYN,
    listingCategory: isRental ? "rental" : "sale",
    closePrice: raw.ClosePrice != null ? Number(raw.ClosePrice) : null,
    closedDate: raw.CloseDate ? String(raw.CloseDate) : null,
    // Contract signed (sale) / lease signed (rental) is PurchaseContractDate; ListingContractDate
    // is the listing agreement date (listedDate above).
    contractDate: raw.PurchaseContractDate ? String(raw.PurchaseContractDate) : null,
    availabilityDate: raw.AvailabilityDate ? String(raw.AvailabilityDate) : null,
    taxBlock: raw.TaxBlock ? String(raw.TaxBlock) : null,
    taxLot: raw.TaxLot ? String(raw.TaxLot) : null,
    comingSoonDate,
    downPaymentAssistanceAmount: dpaAmount,
    downPaymentAssistanceCount: dpaCount,
    sponsorUnit,
    permissions: {
      // No Cotality source: Permission has no owner-opt-out or participant-only value. Kept false for the
      // existing send gates; the detail view does not present them as listing facts.
      ownerOptOut: false,
      participantOnly: false,
      idxDisplay: permission.length ? permission.includes("IDX") : true,
      internetDisplay: isIdxPlusDisplayFlagOn(raw.InternetEntireListingDisplayYN),
      syndication: !permission.includes("SyndicateOptOut"),
    },
    ListingAgreement: raw.ListingAgreement ? String(raw.ListingAgreement) : null,
    LandLeaseYN: raw.LandLeaseYN === true || raw.LandLeaseYN === "true",
    CoolingYN: raw.CoolingYN === true || raw.CoolingYN === "true",
    GarageYN: raw.GarageYN === true || raw.GarageYN === "true",
    DirectionFaces: raw.DirectionFaces ? String(raw.DirectionFaces) : null,
    Exposures: Array.isArray(raw.Exposures) ? raw.Exposures.join(",") : raw.Exposures ? String(raw.Exposures) : null,
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
    CurrentFinancing: raw.CurrentFinancing ? String(raw.CurrentFinancing) : null,
    PetsAllowed: raw.PetsAllowed ? String(raw.PetsAllowed) : null,
    Furnished: raw.Furnished ? String(raw.Furnished) : null,
    AvailableLeaseType: raw.AvailableLeaseType ? String(raw.AvailableLeaseType) : null,
    ExistingLeaseType: raw.ExistingLeaseType ? String(raw.ExistingLeaseType) : null,
    ConstructionMaterials: raw.ConstructionMaterials ? String(raw.ConstructionMaterials) : null,
    NewConstructionYN: raw.NewConstructionYN === true || raw.NewConstructionYN === "true",
    PriceChangeTimestamp: raw.PriceChangeTimestamp ? String(raw.PriceChangeTimestamp) : null,
    // REBNY CustomFields as Cotality sends them (string values), for detail views and reports.
    rebny,
    _source: "idx",
    _listingKey: String(raw.ListingKey || raw.ListingId || ""),
  };
}
