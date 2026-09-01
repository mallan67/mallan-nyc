import { Prisma } from "@prisma/client";
import { lookupNeighborhoodZips } from "@/lib/geo/neighborhood-zips";
import {
  buildSearchDisplayWhere,
  SEARCH_DISPLAY_GATE,
} from "@/lib/search/listing-access-decision";
import { excludeMallanRlsReturnCopies } from "@/lib/listings/mallan-source-identity";
import { minBathsPrisma, maxBathsPrisma } from "@/lib/search/canonical/bath-contract";
import { AMENITY_FIELD_MAP, type AmenityFilter } from "@/lib/search/types";

export interface PublicListingDbSearch {
  where: Prisma.ListingWhereInput;
  orderBy: Prisma.ListingOrderByWithRelationInput;
}

const ALLOWED_PUBLIC_STATUSES = ["Active", "ComingSoon", "ActiveUnderContract"];

const PROPERTY_SUB_TYPE_MAP: Record<string, string> = {
  Condo: "Condo",
  "Co-op": "StockCooperative",
  Condop: "Condop",
  Townhouse: "SingleFamilyTownhouse",
  "Multi-Family": "MultiFamily",
  "New Development": "NewConstruction",
  "Single Family": "SingleFamilyResidence",
  Loft: "Loft",
  Duplex: "Duplex",
  Triplex: "Triplex",
};

// CommonInterest enum values mapped from the public-facing ownership filter.
// Substring match against the DTO `propertyType` (which dbListingToPublicDTO
// derives from CommonInterest in the JSON address column).
const OWNERSHIP_TYPE_MAP: Record<string, string> = {
  Condo: "Condominium",
  "Co-op": "StockCooperative",
  Condop: "Condop",
};

// PascalCase Trestle field name → camelCase DTO key on the public listing.
// Used for amenity filtering: try the DTO key first, fall back to the raw
// features JSON when the DTO doesn't expose that field directly.
const AMENITY_FIELD_TO_DTO: Record<string, string> = {
  BuildingFeatures: "buildingFeatures",
  InteriorFeatures: "interiorFeatures",
  ExteriorFeatures: "exteriorFeatures",
  Appliances: "appliances",
  Cooling: "cooling",
  View: "view",
  ParkingFeatures: "parkingFeatures",
  LaundryFeatures: "laundryFeatures",
  PetsAllowed: "petsAllowed",
};

function appendAnd(where: Prisma.ListingWhereInput, condition: Prisma.ListingWhereInput): void {
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), condition];
}

function appendAndMany(where: Prisma.ListingWhereInput, conditions: Prisma.ListingWhereInput[]): void {
  if (conditions.length === 0) return;
  where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), ...conditions];
}

function intParam(params: URLSearchParams, key: string): number | null {
  const value = params.get(key);
  if (value === null || value === "") return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberParam(params: URLSearchParams, key: string): number | null {
  const value = params.get(key);
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function csv(value: string | null): string[] {
  return value?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
}

function mapPropertySubTypes(value: string | null): string[] {
  return csv(value)
    .flatMap((type) => {
      const mapped = PROPERTY_SUB_TYPE_MAP[type];
      if (mapped === "NewConstruction") return ["NewConstruction", "New Construction"];
      return [mapped || type];
    })
    .filter(Boolean);
}

/**
 * Produce case-variant search strings for a cleaned address segment.
 *
 * Prisma's JSON `string_contains` is case-sensitive — there is no
 * `mode: 'insensitive'` option for JSONB filters (only standard string
 * fields). The production DB stores `address.StreetName` in mixed cases:
 * 'PARK' / 'Park', 'MAIN' / 'Main', 'Riverside', 'PROSPECT', etc. A
 * lowercase user query (from `addressConditions` cleaning) matches none
 * of these literally, which is the systemic root cause Maya hit on the
 * "425 park avenue south" search.
 *
 * Generating up to 3 case variants (as-is, UPPER, Title-Case) and ORing
 * them covers every mixed-case shape observed in the live data. The
 * variants are de-duped with a Set so single-case strings (e.g., a
 * lowercase "park") only emit the necessary distinct values.
 */
function streetNameCaseVariants(s: string): string[] {
  // Proper Title Case: lowercase first, then capitalise each word's first
  // character. Without the initial `toLowerCase()` an uppercase input like
  // "PARK" passes the inner regex unchanged (the leading `P` is already
  // uppercase) and we'd never emit the Title-Case "Park" variant. That gap
  // would re-introduce the case-sensitivity miss for users typing all-caps.
  const title = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return [...new Set([s, s.toUpperCase(), title])].filter(Boolean);
}

function addressConditions(address: string | null): Prisma.ListingWhereInput[] {
  if (!address) return [];

  const dirMap: Record<string, string> = {
    west: "w",
    east: "e",
    north: "n",
    south: "s",
  };
  const suffixRe = /\b(street|st|avenue|ave|boulevard|blvd|place|pl|drive|dr|road|rd|lane|ln|way|court|ct)\b\.?/gi;
  const cleaned = address.trim()
    .replace(/\b(west|east|north|south)\b/gi, (match) => dirMap[match.toLowerCase()] || match)
    .replace(suffixRe, "")
    .replace(/\s+/g, " ")
    .trim();

  // Two layers of defensive ORing:
  //   1. PascalCase + camelCase key paths (`StreetNumber` / `streetNumber`,
  //      `StreetName` / `streetName`). Carried forward from PR #106 audit-fix.
  //   2. Case variants of the search value. Production DB stores mixed-case
  //      values (PARK, Park, Riverside, MAIN, etc.); a single
  //      case-sensitive `string_contains` against a lowercase user query
  //      returned 0 rows — that's the live "425 park avenue south" bug.
  const conditions: Prisma.ListingWhereInput[] = [];
  const numMatch = cleaned.match(/^(\d+[-\w]*)\s+(.*)/);
  if (numMatch) {
    const num = numMatch[1];
    conditions.push({
      OR: [
        { address: { path: ["StreetNumber"], equals: num } },
        { address: { path: ["streetNumber"], equals: num } },
      ],
    });
    const streetPart = numMatch[2]
      .replace(/\b[ensw]\b/gi, "")
      .trim()
      .replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    if (streetPart) {
      const variants = streetNameCaseVariants(streetPart);
      const orClauses: Prisma.ListingWhereInput[] = [];
      for (const variant of variants) {
        orClauses.push({ address: { path: ["StreetName"], string_contains: variant } });
        orClauses.push({ address: { path: ["streetName"], string_contains: variant } });
      }
      conditions.push({ OR: orClauses });
    }
  } else if (cleaned) {
    const streetPart = cleaned.replace(/(\d+)(st|nd|rd|th)/gi, "$1");
    const variants = streetNameCaseVariants(streetPart);
    const orClauses: Prisma.ListingWhereInput[] = [];
    for (const variant of variants) {
      orClauses.push({ address: { path: ["StreetName"], string_contains: variant } });
      orClauses.push({ address: { path: ["streetName"], string_contains: variant } });
    }
    conditions.push({ OR: orClauses });
  }

  return conditions;
}

export function buildPublicListingDbSearch(params: URLSearchParams): PublicListingDbSearch {
  const where: Prisma.ListingWhereInput = {
    status: buildSearchDisplayWhere().status,
    OR: [
      {
        rls_eligible: true,
        ...SEARCH_DISPLAY_GATE,
      },
      {
        rls_eligible: false,
        status: { in: ALLOWED_PUBLIC_STATUSES },
        list_price: { gt: 0 },
        address: { not: Prisma.DbNull },
      },
    ],
    // MALLAN RLS RETURN-COPY SUPPRESSION — RESTORED 2026-09-01 (Section 6).
    //
    // This builder read `buildSearchDisplayWhere().status` — ONE key off a gate
    // whose own comment says "Applied HERE, inside the canonical public gate, so
    // it lands BEFORE count, skip and take in every caller. One owner, so no
    // emitter can forget it." Taking `.status` and discarding the rest is
    // exactly how an emitter forgets it, and this is the highest-traffic public
    // reader there is.
    //
    // The consequence was not cosmetic. Mallan's own listing returns through
    // Cotality as an `RLS*` row carrying Mallan's office id; with the clause
    // gone that copy passed the public gate and could surface as a competing
    // listing beside its own canonical `SL-`/`RL-` row. The only thing standing
    // against it was `preferCrmExclusiveOverIdxDuplicate`, which runs AFTER the
    // page is cut and matches on address atoms rather than provenance — so
    // across two pages both could appear.
    //
    // The whole gate is NOT spread here on purpose: the public reader admits
    // website-only rows (`rls_eligible: false`) that deliberately bypass the RLS
    // display gates, and spreading `SEARCH_DISPLAY_GATE` at the top level would
    // deny them. Only the suppression is inherited, and it is ANDed so it holds
    // over BOTH arms — a return-copy is never public on either.
    AND: [excludeMallanRlsReturnCopies()],
  };

  const listingType = params.get("type");
  if (listingType === "sale") where.listing_type = "sale";
  else if (listingType === "rent") where.listing_type = "rent";

  if (params.get("commercial") === "true") {
    appendAnd(where, {
      OR: [
        { property_sub_type: { in: ["Commercial", "Office", "Retail", "Industrial", "MixedUse", "MultiFamily"] } },
        { commercial_sub_type: { not: null } },
      ],
    });
  }

  // `exclusive=mallan` is sourced from the `/exclusives` redirect
  // (vercel.json:55-58). UCBA Art. III §2(A) + 19 NYCRR §175.25 forbid
  // surfacing other brokers' listings as if they were ours.
  //
  // A genuine Mallan exclusive is CRM-AUTHORED (SL-/RL- listing_id prefix) OR
  // website-only (rls_eligible=false) — the SAME robust signal the agent page
  // uses (PR #308, app/api/agents/[slug]/listings/route.ts:245-252). It is NOT
  // `agent_id != null`: syncAgentHistory (lib/idx/sync.ts) stamps agent_id onto
  // THIRD-PARTY Trestle rows where a Mallan agent was the BUYER side
  // (buildAgentHistoricalFilter matches BuyerAgentMlsId, lib/idx/fetch.ts:427),
  // so agent_id would mislabel third-party IDX listings as our exclusives — and
  // the homepage Featured exclusives feed drops the generic bed/price filters,
  // so the identity check here MUST be airtight.
  if (params.get("exclusive") === "mallan") {
    appendAnd(where, {
      OR: [
        { listing_id: { startsWith: "SL-" } },
        { listing_id: { startsWith: "RL-" } },
        { rls_eligible: false },
      ],
    });
  }

  const minPrice = intParam(params, "minPrice");
  const maxPrice = intParam(params, "maxPrice");
  if (minPrice !== null || maxPrice !== null) {
    where.list_price = {};
    if (minPrice !== null) where.list_price.gte = minPrice;
    if (maxPrice !== null) where.list_price.lte = maxPrice;
  }

  const minBeds = intParam(params, "beds");
  const maxBeds = intParam(params, "maxBeds");
  if (minBeds !== null || maxBeds !== null) {
    where.bedrooms_total = {};
    if (minBeds !== null) where.bedrooms_total.gte = minBeds;
    if (maxBeds !== null) where.bedrooms_total.lte = maxBeds;
  }

  // BATHROOMS ARE full + half x 0.5, AND THAT IS DEFINED IN ONE PLACE.
  //
  // This read:
  //
  //     bathrooms_full >= floor(minBaths)
  //     AND (minBaths has a half) bathrooms_half >= 1
  //
  // so `minBaths=1.5` demanded a half-bath and rejected a 2-full/0-half
  // apartment holding 2.0 baths. Measured on the live Preview: 1,896 results for
  // `minBaths=1.5` against 3,674 for `minBaths=2` — a STRICTER minimum returning
  // 1,778 MORE listings, which is not a filter, it is a different question.
  // `maxBaths` was wrong in the other direction: capping only `bathrooms_full`
  // let a 1-full/3-half listing (2.5 baths) through `maxBaths=1.5`.
  //
  // The canonical contract already owned this rule and already rendered it to
  // OData for the authenticated path. It now renders to Prisma too, so all three
  // execution paths answer the same question. The rendering is an EXACT
  // disjunction over the integer range BathroomsFull occupies — not an
  // approximation — so it stays in the predicate, before count and pagination,
  // and cannot remove a listing the canonical value would have kept.
  const minBaths = numberParam(params, "minBaths");
  const maxBaths = numberParam(params, "maxBaths");
  if (minBaths !== null) appendAnd(where, minBathsPrisma(minBaths) as Prisma.ListingWhereInput);
  if (maxBaths !== null) appendAnd(where, maxBathsPrisma(maxBaths) as Prisma.ListingWhereInput);

  const minSqft = intParam(params, "minSqft");
  const maxSqft = intParam(params, "maxSqft");
  if (minSqft !== null || maxSqft !== null) {
    where.living_area = {};
    if (minSqft !== null) where.living_area.gte = minSqft;
    if (maxSqft !== null) where.living_area.lte = maxSqft;
  }

  const borough = params.get("borough");
  if (borough) {
    where.borough = { contains: borough, mode: "insensitive" };
  }

  const neighborhood = params.get("neighborhood");
  if (neighborhood) {
    const names = csv(neighborhood);
    const allZips = names.flatMap((name) => lookupNeighborhoodZips(name));
    const nameConditions = names.map((name) => ({ neighborhood: { equals: name, mode: "insensitive" as const } }));

    if (allZips.length > 0) {
      appendAnd(where, {
        OR: [
          { postal_code: { in: [...new Set(allZips)] } },
          ...nameConditions,
        ],
      });
    } else if (names.length === 1) {
      where.neighborhood = { equals: names[0], mode: "insensitive" };
    } else if (names.length > 1) {
      appendAnd(where, { OR: nameConditions });
    }
  }

  const zips = csv(params.get("zipCodes"));
  if (zips.length > 0) {
    where.postal_code = { in: zips };
  }

  const statuses = csv(params.get("statuses")).filter((status) => ALLOWED_PUBLIC_STATUSES.includes(status));
  if (statuses.length > 0) {
    where.status = { in: statuses };
  } else {
    const status = params.get("status");
    if (status && ALLOWED_PUBLIC_STATUSES.includes(status)) {
      where.status = status;
    }
  }

  const propertySubTypes = mapPropertySubTypes(params.get("propertySubTypes") || params.get("subTypes"));
  if (propertySubTypes.length > 0) {
    where.property_sub_type = { in: propertySubTypes };
  }

  let orderBy: Prisma.ListingOrderByWithRelationInput = { list_price: "desc" };
  switch (params.get("sort")) {
    case "price-asc":
      orderBy = { list_price: "asc" };
      break;
    case "price-desc":
      orderBy = { list_price: "desc" };
      break;
    case "newest":
      orderBy = { listing_contract_date: "desc" };
      break;
    case "sqft-desc":
      orderBy = { living_area: "desc" };
      break;
    case "beds-desc":
      orderBy = { bedrooms_total: "desc" };
      break;
    case "exclusives":
      where.agent_id = { not: null };
      orderBy = { modification_timestamp: "desc" };
      break;
    case "neighborhood":
      orderBy = { neighborhood: "asc" };
      break;
    case "new-development":
      where.property_sub_type = { in: ["NewConstruction", "New Construction"] };
      orderBy = { modification_timestamp: "desc" };
      break;
  }

  appendAndMany(where, addressConditions(params.get("address")));

  return { where, orderBy };
}

// Public listings carry feature data both as DTO fields (camelCase, mapped by
// dbListingToPublicDTO) and as the original Trestle features JSON column. The
// DB-first post-filters need both, so callers must pass a Map keyed by the
// listing id (matching `PublicPostFilterListing.id`) → raw features object.
export interface PublicPostFilterListing {
  id: string;
  propertyType?: string | null;
  yearBuilt?: number | null;
  furnished?: string | null;
  petsAllowed?: string | null;
  publicRemarks?: string | null;
}

// All DB-first DTO post-filters that aren't expressible as a Prisma where —
// run after dbListingToPublicDTO maps a row but before media/open-house
// resource lookups. Order matches the previous inline route logic exactly so
// behavior is preserved across the migration.
//
// NOT included on purpose:
//   - openHouse: needs a live Trestle OpenHouse query (external resource).
//   - media backfill / geocoding: side-effect chains the route owns.
export function applyPublicListingPostFilters<T extends PublicPostFilterListing>(
  listings: T[],
  featuresById: Map<string, Record<string, unknown>>,
  params: URLSearchParams,
): T[] {
  let result = listings;

  // ownershipTypes — substring match against DTO propertyType. Mirrors the
  // dbListingToPublicDTO mapping from address.CommonInterest, so "Condo"
  // matches `condo` but not `condop`, etc.
  const ownershipTypesParam = params.get("ownershipTypes");
  if (ownershipTypesParam) {
    const types = csv(ownershipTypesParam)
      .map((type) => OWNERSHIP_TYPE_MAP[type] || type)
      .filter(Boolean);
    if (types.length > 0) {
      result = result.filter((listing) => {
        const pt = (listing.propertyType || "").toLowerCase();
        return types.some((type) => {
          if (type === "Condominium") return pt.includes("condo") && !pt.includes("condop");
          if (type === "StockCooperative") return pt.includes("co-op");
          if (type === "Condop") return pt.includes("condop");
          return false;
        });
      });
    }
  }

  // yearBuilt — pre-war (≤1946) / post-war (≥1947). Same threshold as the
  // Trestle fallback path (YearBuilt le 1946 / ge 1947).
  const yearBuiltParam = params.get("yearBuilt");
  if (yearBuiltParam === "pre-war") {
    result = result.filter((l) => l.yearBuilt != null && l.yearBuilt <= 1946);
  } else if (yearBuiltParam === "post-war") {
    result = result.filter((l) => l.yearBuilt != null && l.yearBuilt >= 1947);
  }

  // furnished — rental-only filter; matches DTO furnished === "Furnished".
  if (params.get("furnished") === "true") {
    result = result.filter((l) => (l.furnished || "").toLowerCase() === "furnished");
  }

  // amenities — AND across requested keys; each key is OR-of-substring across
  // the configured fields (DTO camelCase first, features JSON PascalCase
  // fallback). PetsAllowed has its own logic because its values encode
  // negative cases (e.g., "No") that need positive recognition.
  const amenitiesParam = params.get("amenities");
  if (amenitiesParam) {
    const requested = amenitiesParam
      .split(",")
      .filter((a): a is AmenityFilter => a in AMENITY_FIELD_MAP);

    for (const amenityKey of requested) {
      const mapping = AMENITY_FIELD_MAP[amenityKey];
      const fields = mapping.field.split(",").map((f) => f.trim());
      const matchValues = mapping.values.map((v) => v.toLowerCase());

      if (amenityKey === "pet-friendly") {
        result = result.filter((listing) => {
          const dtoVal = String(listing.petsAllowed || "").toLowerCase();
          const feat = featuresById.get(listing.id) || {};
          const featVal = String(feat.PetsAllowed || "").toLowerCase();
          const val = dtoVal || featVal;
          if (!val) return false;
          return !val.includes("no") || val.includes("catsok") || val.includes("dogsok");
        });
      } else {
        result = result.filter((listing) => {
          const feat = featuresById.get(listing.id) || {};
          return fields.some((fieldName) => {
            const dtoKey = AMENITY_FIELD_TO_DTO[fieldName];
            const dtoVal = dtoKey
              ? String((listing as unknown as Record<string, unknown>)[dtoKey] || "")
              : "";
            const featVal = String(feat[fieldName] || "");
            const val = (dtoVal || featVal).toLowerCase();
            return matchValues.some((mv) => val.includes(mv));
          });
        });
      }
    }
  }

  // keywords — AND across PublicRemarks substring matches. PublicRemarks is a
  // PUB-tier IDX field so this stays compliance-safe; do NOT extend to
  // PrivateRemarks or ShowingInstructions (HID tier).
  const keywords = csv(params.get("keywords")).filter(Boolean);
  if (keywords.length > 0) {
    result = result.filter((listing) => {
      const feat = featuresById.get(listing.id) || {};
      const remarks = String(feat.PublicRemarks || listing.publicRemarks || "").toLowerCase();
      return keywords.every((kw) => remarks.includes(kw.toLowerCase().trim()));
    });
  }

  return result;
}
