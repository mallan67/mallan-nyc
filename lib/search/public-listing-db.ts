import type { Prisma } from "@prisma/client";
import { lookupNeighborhoodZips } from "@/lib/geo/neighborhood-zips";
import {
  buildSearchDisplayWhere,
  SEARCH_DISPLAY_GATE,
} from "@/lib/search/listing-access-decision";

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

  const conditions: Prisma.ListingWhereInput[] = [];
  const numMatch = cleaned.match(/^(\d+[-\w]*)\s+(.*)/);
  if (numMatch) {
    conditions.push({ address: { path: ["StreetNumber"], equals: numMatch[1] } });
    const streetPart = numMatch[2].replace(/\b[ensw]\b/gi, "").trim();
    if (streetPart) {
      conditions.push({
        address: {
          path: ["StreetName"],
          string_contains: streetPart.replace(/(\d+)(st|nd|rd|th)/gi, "$1"),
        },
      });
    }
  } else if (cleaned) {
    conditions.push({
      address: {
        path: ["StreetName"],
        string_contains: cleaned.replace(/(\d+)(st|nd|rd|th)/gi, "$1"),
      },
    });
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
  if (minBaths !== null || maxBaths !== null) {
    where.bathrooms_full = {};
    if (minBaths !== null) {
      where.bathrooms_full.gte = Math.floor(minBaths);
      if (minBaths % 1 >= 0.5) where.bathrooms_half = { gte: 1 };
    }
    if (maxBaths !== null) where.bathrooms_full.lte = Math.floor(maxBaths);
  }

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
