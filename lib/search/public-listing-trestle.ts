/**
 * Public listings Trestle fallback — OData $filter builder.
 *
 * Owned scope (per the slice that extracted this from app/api/listings/route.ts):
 *   - $filter string construction for the public live Trestle fallback
 *   - status / listing-type / commercial / price / beds / baths / sqft
 *   - propertySubTypes / new-development / ownershipTypes / propertyType
 *   - yearBuilt / furnished / address / keywords
 *   - borough → CountyOrParish, neighborhood → ZIP, zipCodes
 *   - safe OData string escaping
 *
 * Intentionally NOT owned by this helper:
 *   - $orderby (route owns sort wiring)
 *   - fetchTop / select / expandMedia (route owns Trestle query shaping)
 *   - distribution gates (lib/idx/trestle-mapper.ts)
 *   - RAW post-filters: pet-friendly amenity match against PetsAllowed,
 *     property sub-type post-filter, borough post-filter, bounds geocoding,
 *     OpenHouse intersection, media backfill, DTO mapping, cache, audit
 *   - Exclusive merge behavior
 *
 * Compliance note: keywords search is restricted to PublicRemarks (PUB-tier)
 * via case-insensitive contains(). Do NOT extend to PrivateRemarks or
 * ShowingInstructions (HID tier per the IDX/VOW display rules).
 */

import { lookupNeighborhoodZips } from "@/lib/geo/neighborhood-zips";
import { maxBathsOData, minBathsOData } from "@/lib/search/canonical/bath-contract";
import { structuralSubTypeFor } from "@/lib/search/canonical/amenity-match";

/**
 * EXPLICIT transaction universes, from the live `PropertyType` enum.
 *
 * Live vocabulary has 13 members. Only these are populated in the current feed
 * (verified 2026-08-19): Residential 7,074 · ResidentialLease 1,027. Every
 * other member — CommercialSale, Land, Farm, BusinessOpportunity, Specialty,
 * MultiFamily, ResidentialIncome, HighRise, DisasterReliefRental,
 * ManufacturedInPark, CommercialLease — is currently ZERO.
 *
 * Listing them explicitly means a new member appearing in the feed cannot
 * silently join Buy Residential; it stays out until someone decides it belongs.
 */
const SALE_PROPERTY_TYPES = ["Residential"] as const;
const RENT_PROPERTY_TYPES = ["ResidentialLease"] as const;

const ALLOWED_STATUSES = ["Active", "ComingSoon", "ActiveUnderContract"];
const DEFAULT_STATUS_CLAUSE =
  "(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')";

// PropertySubType values valid under Residential PropertyType for commercial filter.
// PropertySubType cannot be pushed to Trestle OData broadly (causes 502); these
// specific values are validated as safe to push.
// Live `PropertySubType` members only — MixedUse 1,651 · Office 104 · Retail 4
// · Industrial 0 · Warehouse 0 (2026-08-20). Kept in lockstep with the UI list
// in lib/search/types.ts so the tab universe cannot differ by execution source.
const COMMERCIAL_SUB_TYPES = ["Office", "Retail", "Industrial", "Warehouse", "MixedUse"];

// Public ownership labels → Trestle CommonInterest enum values. Used by
// propertySubTypes (when "Condo"/"Co-op"/"Condop" are passed), ownershipTypes,
// and the legacy single propertyType param.
// Public ownership control -> live `CommonInterest` member. Keys are NORMALISED
// (lowercased, non-alphanumerics stripped) to match the projection path exactly:
// an exact-case map silently returned ZERO for `condo`, the casing the UI sends.
// Live Active population: Condominium 3,795 · StockCooperative 2,567 ·
// Condop 146 · RentalBuilding 630 · None 1,019.
const COMMON_INTEREST_MAP: Record<string, string> = {
  condo: "Condominium",
  condominium: "Condominium",
  coop: "StockCooperative",
  cooperative: "StockCooperative",
  stockcooperative: "StockCooperative",
  condop: "Condop",
  rental: "RentalBuilding",
  rentalbuilding: "RentalBuilding",
};

/** Live PetsAllowed is a MULTI enum; `has` does EXACT-TOKEN matching and is
 *  live-verified SUPPORTED (Yes -> 3,007). `contains()` is rejected (HTTP 400),
 *  and substring matching would wrongly treat `BuildingYes` as `Yes`. */
/** Lowercase + strip non-alphanumerics so `Co-op`, `co op`, `COOP` all agree. */
function normalizeOwnershipKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const PETS_ALLOWED_ENUM = "Cotality.DataStandard.RESO.DD.Enums.Multi.PetsAllowed";
const UNIT_PET_TOKENS_ODATA = ["Yes", "CatsOk", "DogsOk"];

/** Push pet-friendly to the PROVIDER rather than post-filtering the page. */
export function buildPetFriendlyFilterPart(params: URLSearchParams): string | null {
  const wantsPets =
    params.get("pets") === "true" ||
    (params.get("amenities") ?? "").split(",").map((a) => a.trim()).includes("pet-friendly");
  if (!wantsPets) return null;
  return `(${UNIT_PET_TOKENS_ODATA.map((t) => `PetsAllowed has ${PETS_ALLOWED_ENUM}'${t}'`).join(" or ")})`;
}

// NYC borough names → REBNY CountyOrParish values. Trestle stores the county
// name (e.g. "New York" for Manhattan), not the borough name.
const BOROUGH_TO_COUNTY: Record<string, string> = {
  manhattan: "New York",
  brooklyn: "Kings",
  queens: "Queens",
  bronx: "Bronx",
  "staten island": "Richmond",
};

// New-development heuristics live in PublicRemarks because NewConstructionYN
// and NewDevelopmentYN are NOT exposed on IDX Plus and PropertySubType pushes
// crash Trestle. Keep this list aligned with the matching post-filter regex
// in app/api/listings/route.ts (Step 1c).
const NEW_DEV_REMARKS_CONTAINS = [
  "new development",
  "new construction",
  "sponsor unit",
  "brand new",
];

const STREET_SUFFIX_RE =
  /\s+(STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|PLACE|PL|DRIVE|DR|ROAD|RD|LANE|LN|COURT|CT|WAY|TERRACE|TER)\s*$/i;
// Strip ordinal suffixes from street numbers (1ST→1, 2ND→2, 90TH→90). Only
// strip when preceded by a digit so "PARK ST" stays intact when it reaches
// the suffix stripper above.
const STREET_ORDINAL_RE = /(\d+)(ST|ND|RD|TH)\b/gi;

const DIR_WITH_NUM_RE = /^(\d+)\s+(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i;
const DIR_NO_NUM_RE = /^(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i;
const NUM_ONLY_RE = /^(\d+)\s+(.*)/;

/** Single-quote escape for OData string literals (case-sensitive comparisons). */
function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

/** Lowercase + single-quote escape for `tolower(...)` comparisons. */
function escapeODataLower(value: string): string {
  return value.toLowerCase().replace(/'/g, "''");
}

function stripStreetSuffix(value: string): string {
  return value.replace(STREET_SUFFIX_RE, "").trim();
}

function stripStreetOrdinal(value: string): string {
  return value.replace(STREET_ORDINAL_RE, "$1").trim();
}

function buildAddressFilterPart(addressParam: string): string | null {
  const raw = addressParam.trim();
  if (!raw) return null;

  // Pattern 1: "400 E 90TH ST" — number + direction + street.
  const dirWithNumMatch = raw.match(DIR_WITH_NUM_RE);
  if (dirWithNumMatch) {
    const streetNum = dirWithNumMatch[1];
    const direction = dirWithNumMatch[2].charAt(0).toUpperCase();
    const streetPart = escapeODataLower(stripStreetOrdinal(stripStreetSuffix(dirWithNumMatch[3])));
    const conditions = [
      `startswith(StreetNumber,'${streetNum}')`,
      `StreetDirPrefix eq '${direction}'`,
    ];
    if (streetPart) conditions.push(`contains(tolower(StreetName),'${streetPart}')`);
    return `(${conditions.join(" and ")})`;
  }

  // Pattern 2: "E 90TH ST" — direction + street, no number.
  const dirNoNumMatch = raw.match(DIR_NO_NUM_RE);
  if (dirNoNumMatch) {
    const direction = dirNoNumMatch[1].charAt(0).toUpperCase();
    const streetPart = escapeODataLower(stripStreetOrdinal(stripStreetSuffix(dirNoNumMatch[2])));
    const conditions = [`StreetDirPrefix eq '${direction}'`];
    if (streetPart) conditions.push(`contains(tolower(StreetName),'${streetPart}')`);
    return `(${conditions.join(" and ")})`;
  }

  // Pattern 3: "400 PARK AVE" — number + street, no direction.
  const numMatch = raw.match(NUM_ONLY_RE);
  if (numMatch && numMatch[1]) {
    const streetNum = numMatch[1];
    const streetPart = escapeODataLower(stripStreetOrdinal(stripStreetSuffix(numMatch[2] || "")));
    if (streetPart) {
      return `(startswith(StreetNumber,'${streetNum}') and contains(tolower(StreetName),'${streetPart}'))`;
    }
    return `startswith(StreetNumber,'${streetNum}')`;
  }

  // Pattern 4: text only — search StreetName OR BuildingName.
  const cleaned = escapeODataLower(stripStreetSuffix(raw));
  if (!cleaned) return null;
  return `(contains(tolower(StreetName),'${cleaned}') or contains(tolower(BuildingName),'${cleaned}'))`;
}

function buildStatusFilterPart(params: URLSearchParams): string {
  const statusesParam = params.get("statuses");
  if (statusesParam) {
    const requested = statusesParam.split(",").filter((s) => ALLOWED_STATUSES.includes(s));
    if (requested.length === 1) return `StandardStatus eq '${requested[0]}'`;
    if (requested.length > 1) {
      return `(${requested.map((s) => `StandardStatus eq '${s}'`).join(" or ")})`;
    }
    return DEFAULT_STATUS_CLAUSE;
  }

  const statusFilter = params.get("status");
  if (statusFilter) {
    if (ALLOWED_STATUSES.includes(statusFilter)) return `StandardStatus eq '${statusFilter}'`;
    return DEFAULT_STATUS_CLAUSE;
  }

  return DEFAULT_STATUS_CLAUSE;
}

function buildListingTypeFilterPart(params: URLSearchParams): string | null {
  const listingType = params.get("type");
  // EXPLICIT inclusion contract, not an exclusion. `ne 'ResidentialLease'`
  // happens to return the same 7,074 rows today ONLY because every other
  // PropertyType member is currently empty in this feed — it would silently
  // admit CommercialSale, Land, Farm, BusinessOpportunity, Specialty,
  // MultiFamily and ResidentialIncome the moment one appears.
  // Live-verified 2026-08-19: PropertyType eq 'Residential' = 7,074 Active.
  if (listingType === "sale" || listingType === "buy") return `(${SALE_PROPERTY_TYPES.map((t) => `PropertyType eq '${t}'`).join(" or ")})`;
  if (listingType === "rent") return `(${RENT_PROPERTY_TYPES.map((t) => `PropertyType eq '${t}'`).join(" or ")})`;
  return null;
}

function buildPriceBedsBathsSqftParts(params: URLSearchParams): string[] {
  const parts: string[] = [];

  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  if (minPrice) parts.push(`ListPrice ge ${parseInt(minPrice, 10)}`);
  if (maxPrice) parts.push(`ListPrice le ${parseInt(maxPrice, 10)}`);

  // Public search uses `beds` for the minimum bedrooms param; CRM uses `minBeds`.
  // The Trestle fallback only sees `beds`, matching the previous inline behavior.
  const minBeds = params.get("beds");
  const maxBeds = params.get("maxBeds");
  if (minBeds !== null && minBeds !== "") parts.push(`BedroomsTotal ge ${parseInt(minBeds, 10)}`);
  if (maxBeds !== null && maxBeds !== "") parts.push(`BedroomsTotal le ${parseInt(maxBeds, 10)}`);

  // Baths go through the CANONICAL total-bath contract so this path and the
  // projection path cannot answer the same question differently.
  //
  // The rule replaced here was `BathroomsFull ge floor(m)` plus, for a half,
  // `BathroomsHalf ge 1`. That REJECTED a 2-full/0-half apartment for
  // minBaths=1.5, and `BathroomsFull le floor(m)` ADMITTED a 1.5-bath listing
  // for maxBaths=1. Live-verified: BathroomsHalf is non-zero on 2,023 Active
  // rows, so this is not a corner case.
  const minBaths = params.get("minBaths");
  const maxBaths = params.get("maxBaths");
  if (minBaths) parts.push(minBathsOData(Number(minBaths)));
  if (maxBaths) parts.push(maxBathsOData(Number(maxBaths)));

  const minSqft = params.get("minSqft");
  const maxSqft = params.get("maxSqft");
  if (minSqft) parts.push(`LivingArea ge ${parseInt(minSqft, 10)}`);
  if (maxSqft) parts.push(`LivingArea le ${parseInt(maxSqft, 10)}`);

  return parts;
}

function buildPropertySubTypeFilterPart(params: URLSearchParams): string | null {
  const raw = params.get("propertySubTypes") || params.get("subTypes");
  if (!raw) return null;

  const types = raw.split(",").map((t) => t.trim()).filter(Boolean);
  const odataParts: string[] = [];

  // Push only CommonInterest values — PropertySubType, NewConstructionYN, and
  // NewDevelopmentYN all crash Trestle (502). Other types are post-filtered.
  for (const t of types) {
    const ci = COMMON_INTEREST_MAP[normalizeOwnershipKey(t)];
    if (ci) odataParts.push(`CommonInterest eq '${ci}'`);
  }

  // STRUCTURAL sub-types were emitted NOWHERE before this. The builder handled
  // only ownership labels and New Development, and the route then did no
  // route-side sub-type filter on the belief that "sub-types are pushed to the
  // provider" — so a structural request was silently broadened to everything.
  // Live-verified: `PropertySubType eq 'Loft'` is SUPPORTED (83 Active) and
  // multi-value ORs are SUPPORTED, so there was never a provider reason to drop.
  for (const t of types) {
    const member = structuralSubTypeFor(t);
    if (member) odataParts.push(`PropertySubType eq '${member}'`);
  }

  if (types.includes("New Development")) {
    // Structured provider boolean, not a prose heuristic.
    odataParts.push("NewConstructionYN eq true");
  }

  if (odataParts.length === 0) return null;
  return `(${odataParts.join(" or ")})`;
}

function buildSortNewDevelopmentFilterPart(params: URLSearchParams): string | null {
  if (params.get("sort") !== "new-development") return null;
  if (params.get("propertySubTypes") || params.get("subTypes")) return null;
  return "NewConstructionYN eq true";
}

function buildOwnershipTypesFilterPart(params: URLSearchParams): string | null {
  const raw = params.get("ownershipTypes");
  if (!raw) return null;

  const types = raw
    .split(",")
    .map((t) => COMMON_INTEREST_MAP[normalizeOwnershipKey(t)])
    .filter((t): t is string => Boolean(t));
  if (types.length === 0) return null;

  return `(${types.map((t) => `CommonInterest eq '${t}'`).join(" or ")})`;
}

function buildLegacyPropertyTypeFilterPart(params: URLSearchParams): string | null {
  const propertyTypeFilter = params.get("propertyType");
  if (!propertyTypeFilter) return null;
  // Legacy filter only applies when neither propertySubTypes nor ownershipTypes
  // were provided — those win and this falls through silently.
  if (params.get("propertySubTypes") || params.get("subTypes")) return null;
  if (params.get("ownershipTypes")) return null;

  const safe = escapeOData(propertyTypeFilter);
  const ci = COMMON_INTEREST_MAP[normalizeOwnershipKey(safe)];
  if (!ci) return null;
  return `CommonInterest eq '${ci}'`;
}

function buildZipCodesFilterPart(params: URLSearchParams): string | null {
  const raw = params.get("zipCodes");
  if (!raw) return null;

  const zips = raw
    .split(",")
    .map((z) => z.trim().replace(/[^0-9]/g, ""))
    .filter((z) => z.length === 5);
  if (zips.length === 0) return null;
  if (zips.length === 1) return `PostalCode eq '${zips[0]}'`;
  return `(${zips.map((z) => `PostalCode eq '${z}'`).join(" or ")})`;
}

function buildNeighborhoodFilterPart(params: URLSearchParams): string | null {
  // Explicit zipCodes always wins — neighborhood→ZIP push is the fallback path.
  if (params.get("zipCodes")) return null;
  const raw = params.get("neighborhood");
  if (!raw) return null;

  const names = raw.split(",").map((n) => n.trim()).filter(Boolean);
  const allZips = [...new Set(names.flatMap((n) => lookupNeighborhoodZips(n)))];
  if (allZips.length === 0) return null;
  if (allZips.length === 1) return `PostalCode eq '${allZips[0]}'`;
  return `(${allZips.map((z) => `PostalCode eq '${z}'`).join(" or ")})`;
}

function buildBoroughFilterPart(params: URLSearchParams): string | null {
  const borough = params.get("borough");
  if (!borough) return null;
  const countyValue = BOROUGH_TO_COUNTY[borough.toLowerCase()] || borough;
  return `CountyOrParish eq '${escapeOData(countyValue)}'`;
}

function buildKeywordsFilterParts(params: URLSearchParams): string[] {
  const raw = params.get("keywords");
  if (!raw) return [];

  // Replicates the inline route logic verbatim: strip SQL wildcards (%, _),
  // escape single quotes, trim, lowercase. Skip empties so that a stray
  // `keywords=,foo` still fires only the meaningful clause.
  const keywords = raw.split(",").filter(Boolean);
  const parts: string[] = [];
  for (const kw of keywords) {
    const safe = kw.replace(/[%_]/g, "").replace(/'/g, "''").trim().toLowerCase();
    if (safe) parts.push(`contains(tolower(PublicRemarks),'${safe}')`);
  }
  return parts;
}

/**
 * Build the OData $filter string for the public /api/listings live Trestle
 * fallback. Returns the joined "X and Y and Z" clause with no leading or
 * trailing whitespace. Returns "" if no params produced any filter clauses
 * (which only happens if the default status clause is somehow stripped —
 * never under normal usage).
 *
 * The route owns $orderby, $top, $select, $expand, fetchFromTrestle, the
 * RAW post-filters (pet-friendly amenity match, property sub-type, borough,
 * bounds), the OpenHouse intersection, the media backfill chain, the DTO
 * mapping, and the cache. None of those are touched here.
 */
export function buildPublicListingTrestleFilter(params: URLSearchParams): string {
  const filterParts: string[] = [];

  filterParts.push(buildStatusFilterPart(params));

  const listingTypePart = buildListingTypeFilterPart(params);
  if (listingTypePart) filterParts.push(listingTypePart);

  if (params.get("commercial") === "true") {
    filterParts.push(
      `(${COMMERCIAL_SUB_TYPES.map((t) => `PropertySubType eq '${t}'`).join(" or ")})`,
    );
  }

  filterParts.push(...buildPriceBedsBathsSqftParts(params));

  const yearBuilt = params.get("yearBuilt");
  if (yearBuilt === "pre-war") filterParts.push("YearBuilt le 1946");
  else if (yearBuilt === "post-war") filterParts.push("YearBuilt ge 1947");

  if (params.get("furnished") === "true") filterParts.push("Furnished eq 'Furnished'");

  const addressParam = params.get("address");
  if (addressParam) {
    const addressPart = buildAddressFilterPart(addressParam);
    if (addressPart) filterParts.push(addressPart);
  }

  const subTypePart = buildPropertySubTypeFilterPart(params);
  if (subTypePart) filterParts.push(subTypePart);

  const sortNewDevPart = buildSortNewDevelopmentFilterPart(params);
  if (sortNewDevPart) filterParts.push(sortNewDevPart);

  const ownershipPart = buildOwnershipTypesFilterPart(params);
  if (ownershipPart) filterParts.push(ownershipPart);

  // Pets push to the PROVIDER via exact-token `has`. This was previously a RAW
  // post-filter using substring logic, which is wrong twice over: it filtered a
  // page rather than the corpus, and matching "Yes" as a substring also matches
  // "BuildingYes" — the building permits pets while the UNIT does not.
  const petPart = buildPetFriendlyFilterPart(params);
  if (petPart) filterParts.push(petPart);

  const legacyPropertyTypePart = buildLegacyPropertyTypeFilterPart(params);
  if (legacyPropertyTypePart) filterParts.push(legacyPropertyTypePart);

  const zipPart = buildZipCodesFilterPart(params);
  if (zipPart) filterParts.push(zipPart);

  const neighborhoodPart = buildNeighborhoodFilterPart(params);
  if (neighborhoodPart) filterParts.push(neighborhoodPart);

  const boroughPart = buildBoroughFilterPart(params);
  if (boroughPart) filterParts.push(boroughPart);

  filterParts.push(...buildKeywordsFilterParts(params));

  return filterParts.join(" and ");
}
