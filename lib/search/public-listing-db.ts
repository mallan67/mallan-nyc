import { Prisma } from "@prisma/client";
import { lookupNeighborhoodZips } from "@/lib/geo/neighborhood-zips";
import {
  buildSearchDisplayWhere,
  SEARCH_DISPLAY_GATE,
} from "@/lib/search/listing-access-decision";
import {
  AMENITY_FIELD_MAP,
  UNSUPPORTED_AMENITIES,
  type AmenityFilter,
} from "@/lib/search/types";

export interface PublicListingDbSearch {
  where: Prisma.ListingWhereInput;
  orderBy: Prisma.ListingOrderByWithRelationInput;
}

const ALLOWED_PUBLIC_STATUSES = ["Active", "ComingSoon", "ActiveUnderContract"];

// UI sub-type control → LIVE `PropertySubType` enum members.
//
// EVERY value here was checked against the live enum on 2026-08-19. Values that
// are NOT live members were removed: `Condo` and `SingleFamilyTownhouse` are
// rejected by the provider with HTTP 400 (not an empty result — a hard error),
// and `NewConstruction` is not a member at all.
//
// NYC does NOT express ownership through `PropertySubType`. Live Active counts:
//   Apartment 6,684 · MultiFamily 427 · SingleFamilyResidence 404 · Duplex 359 ·
//   Loft 83 · MixedUse 69 · Triplex 66 — while Condominium, StockCooperative
//   and Townhouse are ALL ZERO.
// Condo / Co-op / Condop are carried by `CommonInterest` and are routed to the
// ownership filter instead (see OWNERSHIP_TYPE_MAP). They are deliberately
// absent here so they can never reach a `PropertySubType` predicate.
//
// "New Development" is a BOOLEAN on the provider (`NewConstructionYN`, 950 live
// Active), never a sub-type — see the `new-development` sort below.
const PROPERTY_SUB_TYPE_MAP: Record<string, string> = {
  Townhouse: "Townhouse",
  "Multi-Family": "MultiFamily",
  "Single Family": "SingleFamilyResidence",
  Apartment: "Apartment",
  "Mixed Use": "MixedUse",
  Loft: "Loft",
  Duplex: "Duplex",
  Triplex: "Triplex",
};

// Public ownership filter → live `CommonInterest` enum values.
//
// LIVE-VERIFIED corpus-wide against production on 2026-08-19 (every displayable
// listing, not a sample). `CommonInterest` is a string on 8,158/8,158 rows:
//   Condominium 3,795 · StockCooperative 2,567 · None 1,019 ·
//   RentalBuilding 630 · Condop 146
//
// `Condop` is a REAL fifth value that a 200-row live sample did not contain —
// which is why this table is built from the full corpus, never from a sample.
//
// Keys are NORMALISED (lowercased, non-alphanumerics stripped) because the
// previous map was keyed on exact-case `"Condo"`. A UI sending `condo` fell
// through to a no-match and returned ZERO results with no error — a silent
// wrong answer. Normalising makes casing and punctuation irrelevant.
const OWNERSHIP_TYPE_MAP: Record<string, string> = {
  condo: "Condominium",
  condominium: "Condominium",
  coop: "StockCooperative",
  cooperative: "StockCooperative",
  stockcooperative: "StockCooperative",
  condop: "Condop",
  rental: "RentalBuilding",
  rentalbuilding: "RentalBuilding",
};

/** Lowercase and strip non-alphanumerics so `Co-op`, `co op` and `COOP` agree. */
function normalizeEnumKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

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

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE FILTERS LIVE IN SQL AND NOT IN A POST-FILTER
 *
 * Until 2026-08-19 `ownershipTypes`, `yearBuilt`, `furnished`, `keywords` and
 * `amenities` were applied in `applyPublicListingPostFilters` — AFTER the page
 * had already been fetched. That filtered THE PAGE, not the corpus, and left
 * `total` reporting the unfiltered count. Measured on production:
 *
 *     /api/listings?yearBuilt=pre-war&limit=10   ->  total 8,159, items   2
 *     ...                          &limit=50     ->  total 8,159, items  16
 *     ...                          &limit=100    ->  total 8,159, items  41
 *     ...                          &limit=200    ->  total 8,159, items 100
 *
 * Items scaled with page size while `total` never moved — proof the predicate
 * saw only the fetched rows. The true corpus counts are 3,460 pre-war and
 * 2,567 co-ops, so a user filtering co-ops saw ONE result labelled "8,159
 * found" and could never reach the other 2,566.
 *
 * Expressed as a Prisma `where`, the same predicate runs in Postgres over every
 * row, `count()` uses the identical predicate, and pagination is coherent.
 *
 * SOURCE COLUMN: `raw_data`, not `features`. Both are populated, but on the
 * live corpus `raw_data` is strictly more complete for these fields —
 * `Furnished` is present on 8,156 rows there versus 3,018 in `features`.
 *
 * Every predicate below was validated against SQL ground truth before being
 * written (8/8 exact matches); see `.cache/search-p0/`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function jsonbFilterConditions(params: URLSearchParams): Prisma.ListingWhereInput[] {
  const conditions: Prisma.ListingWhereInput[] = [];

  // ownershipTypes — exact `CommonInterest` equality, case-insensitive input.
  const ownershipTypesParam = params.get("ownershipTypes");
  if (ownershipTypesParam) {
    const values = [
      ...new Set(
        csv(ownershipTypesParam)
          .map((type) => OWNERSHIP_TYPE_MAP[normalizeEnumKey(type)])
          .filter(Boolean),
      ),
    ];
    // Fail CLOSED: an ownership filter we cannot map must return nothing rather
    // than silently widening to the whole corpus.
    if (values.length === 0) return [{ id: { in: [] } }];
    conditions.push({
      OR: values.map((value) => ({ raw_data: { path: ["CommonInterest"], equals: value } })),
    });
  }

  // yearBuilt — pre-war (<=1946) / post-war (>=1947). `YearBuilt` is a JSON
  // NUMBER on 8,057 rows (101 JSON-null), so numeric comparison is exact and
  // null-carrying rows are correctly excluded from both sides.
  const yearBuiltParam = params.get("yearBuilt");
  if (yearBuiltParam === "pre-war") {
    conditions.push({ raw_data: { path: ["YearBuilt"], lte: 1946 } });
  } else if (yearBuiltParam === "post-war") {
    conditions.push({ raw_data: { path: ["YearBuilt"], gte: 1947 } });
  }

  // furnished — the live vocabulary is FOUR-valued, not boolean:
  // Unfurnished 2,895 · Furnished 107 · Negotiable 12 · Partially 4.
  // `furnished=true` means strictly `Furnished`, preserving the prior contract;
  // `Partially` and `Negotiable` are deliberately excluded as they are not a
  // furnished unit. Widening that is a product decision, not a bug fix.
  if (params.get("furnished") === "true") {
    conditions.push({ raw_data: { path: ["Furnished"], equals: "Furnished" } });
  }

  // pets — the UI emits `pets=true` (useListings.ts) as a first-class filter,
  // SEPARATE from `amenities=pet-friendly`. It was never read here, so a user
  // who ticked "pets allowed" received the entire unfiltered corpus. Both
  // spellings must resolve to the same unit-level predicate, or the same
  // question asked two ways would return two different answers.
  if (params.get("pets") === "true") {
    conditions.push({ OR: ["Yes", "CatsOk", "DogsOk"].flatMap(petToken) });
  }

  // keywords — AND across case-insensitive `PublicRemarks` matches.
  // PublicRemarks is a PUB-tier IDX field so this stays compliance-safe; do NOT
  // extend to PrivateRemarks or ShowingInstructions (HID tier).
  //
  // `mode: "insensitive"` on a JSON filter IS supported by the installed Prisma
  // (6.19.2). An older comment in this file claimed otherwise; that was true of
  // an earlier Prisma and is no longer. Case-insensitivity is REQUIRED here
  // because remarks are free prose ("Penthouse") and the query is user input.
  for (const keyword of csv(params.get("keywords"))) {
    conditions.push({
      raw_data: { path: ["PublicRemarks"], string_contains: keyword, mode: "insensitive" },
    });
  }

  return conditions;
}

/**
 * Amenity predicates, in SQL, over the whole corpus.
 *
 * Amenity fields hold comma-joined FIXED provider tokens (`"Elevators,Storage"`),
 * so a case-sensitive substring test is correct — the casing is the provider's,
 * never the user's. Multiple requested amenities AND together; the values within
 * one amenity OR together, across each of its configured fields.
 */
/**
 * Match ONE exact token inside a comma-joined provider token list.
 *
 * Prisma's JSON `string_contains` cannot anchor, so an exact-token test is
 * assembled from the four positions a token can occupy: sole value, first,
 * middle, or last. This is what separates the unit-level `Yes` from the
 * building-level `BuildingYes` that merely contains it.
 *
 * Checked against both `features` and `raw_data`: `PetsAllowed` is a string on
 * 8,156 rows and an ARRAY on 2, so neither column alone is complete.
 */
function petToken(token: string): Prisma.ListingWhereInput[] {
  return (["features", "raw_data"] as const).flatMap((column) => [
    { [column]: { path: ["PetsAllowed"], equals: token } },
    { [column]: { path: ["PetsAllowed"], string_starts_with: `${token},` } },
    { [column]: { path: ["PetsAllowed"], string_contains: `,${token},` } },
    { [column]: { path: ["PetsAllowed"], string_ends_with: `,${token}` } },
  ]) as Prisma.ListingWhereInput[];
}

function amenityConditions(params: URLSearchParams): Prisma.ListingWhereInput[] {
  const amenitiesParam = params.get("amenities");
  if (!amenitiesParam) return [];

  const conditions: Prisma.ListingWhereInput[] = [];
  for (const key of csv(amenitiesParam)) {
    if (UNSUPPORTED_AMENITIES.has(key)) continue; // rejected upstream; never widen
    if (!(key in AMENITY_FIELD_MAP)) continue;
    const mapping = AMENITY_FIELD_MAP[key as AmenityFilter];
    const fields = mapping.field.split(",").map((f) => f.trim());

    if (mapping.match === "isTrue") {
      conditions.push({ OR: fields.map((f) => ({ features: { path: [f], equals: true } })) });
      continue;
    }

    if (key === "pet-friendly") {
      // `PetsAllowed` carries BOTH building-level and unit-level tokens in one
      // comma-joined list, and encodes negatives alongside positives:
      //   "BuildingYes,No"  = the building permits pets, THIS UNIT DOES NOT.
      //
      // A substring test is therefore wrong twice over: `contains("Yes")` also
      // matches `BuildingYes`. Measured live, that inflates the result from
      // 4,304 to 6,861 — 2,557 listings a renter with a dog cannot actually
      // rent. Exact TOKEN matching is required, so match each affirmative
      // unit-level token at any position in the list.
      conditions.push({ OR: ["Yes", "CatsOk", "DogsOk"].flatMap(petToken) });
      continue;
    }

    const OR: Prisma.ListingWhereInput[] = [];
    for (const field of fields) {
      for (const value of mapping.values) {
        OR.push({ features: { path: [field], string_contains: value } });
      }
    }
    if (OR.length > 0) conditions.push({ OR });
  }
  return conditions;
}


/**
 * BATHROOM TOTALS — normalised, not "full baths plus a half-bath flag".
 *
 * The previous predicate for `minBaths` was
 *     bathrooms_full >= floor(m)  AND  (m has a half -> bathrooms_half >= 1)
 * which REJECTS a 2-full / 0-half apartment for `minBaths=1.5`, even though two
 * full baths is obviously at least one and a half. `maxBaths` had the mirror
 * defect: `maxBaths=1` compared only `bathrooms_full <= 1`, so a 1-full/1-half
 * (1.5 bath) listing passed a "maximum 1 bath" filter.
 *
 * Mallan stores `bathrooms_full` and `bathrooms_half`, so the normalised total
 * is `full + 0.5 * half`. Prisma cannot express arithmetic inside a `where`, so
 * the inequality is expanded into an exact disjunction over the (small) integer
 * values `full` can take. This is exact, not an approximation.
 *
 * Live provider note: Cotality also exposes `BathroomsOneQuarter`,
 * `BathroomsThreeQuarter`, `BathroomsPartial` and `BathroomsTotalInteger` (all
 * Int32, verified live 2026-08-19). Mallan does not store the quarter counts, so
 * they cannot participate in a DB predicate today; `full + half/2` is the exact
 * total for every quantity Mallan actually holds.
 */
const MAX_BATHS_ENUMERATED = 12;

/** `bathrooms_half` is nullable; a null must read as ZERO half-baths. */
function halfAtMost(n: number): Prisma.ListingWhereInput {
  return n >= 0
    ? { OR: [{ bathrooms_half: null }, { bathrooms_half: { lte: n } }] }
    : { id: { in: [] } };
}

function minBathsCondition(minBaths: number): Prisma.ListingWhereInput {
  const ceiling = Math.min(Math.ceil(minBaths), MAX_BATHS_ENUMERATED);
  // Enough full baths on their own always qualifies — this is the arm the old
  // predicate was missing.
  const OR: Prisma.ListingWhereInput[] = [{ bathrooms_full: { gte: ceiling } }];
  for (let full = 0; full < ceiling; full++) {
    const halvesNeeded = Math.ceil((minBaths - full) * 2);
    OR.push({ bathrooms_full: full, bathrooms_half: { gte: halvesNeeded } });
  }
  return { OR };
}

function maxBathsCondition(maxBaths: number): Prisma.ListingWhereInput {
  const cap = Math.min(Math.floor(maxBaths), MAX_BATHS_ENUMERATED);
  if (cap < 0) return { id: { in: [] } };
  const OR: Prisma.ListingWhereInput[] = [];
  for (let full = 0; full <= cap; full++) {
    const halvesAllowed = Math.floor((maxBaths - full) * 2);
    OR.push({ AND: [{ bathrooms_full: full }, halfAtMost(halvesAllowed)] });
  }
  return { OR };
}

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
    .map((type) => PROPERTY_SUB_TYPE_MAP[type])
    // Drop anything not on the live enum rather than passing it through. An
    // unmapped literal reaching the provider is an HTTP 400, and reaching the
    // DB it silently matches nothing.
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

  const minBaths = numberParam(params, "minBaths");
  const maxBaths = numberParam(params, "maxBaths");
  if (minBaths !== null) appendAnd(where, minBathsCondition(minBaths));
  if (maxBaths !== null) appendAnd(where, maxBathsCondition(maxBaths));

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

  const requestedStatuses = csv(params.get("statuses"));
  const statuses = requestedStatuses.filter((status) => ALLOWED_PUBLIC_STATUSES.includes(status));
  if (requestedStatuses.length > 0 && statuses.length === 0) {
    // Every requested status was non-public (e.g. `statuses=Closed`). Dropping
    // the constraint entirely made the search FAIL OPEN — it answered a request
    // for Closed listings with the full Active corpus. Return nothing instead:
    // no publicly displayable listing satisfies the request, and that is the
    // honest answer. (Closed rows are gated elsewhere too, so this is a
    // correctness fix, not a display-leak fix.)
    appendAnd(where, { id: { in: [] } });
  }
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
      // `NewConstruction` is NOT a live `PropertySubType` member, so the old
      // predicate matched nothing. New development is a provider BOOLEAN:
      // `NewConstructionYN` is true on 950 live Active listings.
      appendAnd(where, {
        OR: [
          { features: { path: ["NewConstructionYN"], equals: true } },
          { raw_data: { path: ["NewConstructionYN"], equals: true } },
        ],
      });
      orderBy = { modification_timestamp: "desc" };
      break;
  }

  appendAndMany(where, addressConditions(params.get("address")));

  // Corpus-wide jsonb predicates. These MUST stay in the Prisma `where` so
  // that `count()` and the page share one predicate; moving any of them back
  // into a post-filter reintroduces the "filters a page, not the corpus" bug
  // and a `total` that lies to the user.
  appendAndMany(where, jsonbFilterConditions(params));
  appendAndMany(where, amenityConditions(params));

  return { where, orderBy };
}

// Retained for the route's call signature. `featuresById` is no longer read —
// filtering happens in SQL — but the shape is kept so the seam stays explicit.
export interface PublicPostFilterListing {
  id: string;
  propertyType?: string | null;
  yearBuilt?: number | null;
  furnished?: string | null;
  petsAllowed?: string | null;
  publicRemarks?: string | null;
}

/**
 * DTO post-filters — now EMPTY BY DESIGN.
 *
 * Every filter that used to run here (`ownershipTypes`, `yearBuilt`,
 * `furnished`, `amenities`, `keywords`) moved into the Prisma `where` built by
 * `buildPublicListingDbSearch`, because running them here filtered only the
 * rows already fetched for the current page while `total` kept reporting the
 * unfiltered count. See the block comment above `jsonbFilterConditions`.
 *
 * This function is deliberately retained as an identity pass rather than
 * deleted: the route calls it at the exact point where a genuinely
 * page-scoped concern would belong, and keeping the seam documented stops the
 * next change from quietly reintroducing corpus-level filtering here.
 *
 * DO NOT add a corpus-level predicate to this function. If a filter can be
 * expressed against a column or a jsonb path, it belongs in the `where` so
 * that `count()` and the returned page agree. The only thing that legitimately
 * belongs here is a predicate that cannot be evaluated in SQL at all — e.g. one
 * needing an external resource lookup per row.
 */
export function applyPublicListingPostFilters<T extends PublicPostFilterListing>(
  listings: T[],
  _featuresById: Map<string, Record<string, unknown>>,
  _params: URLSearchParams,
): T[] {
  return listings;
}
