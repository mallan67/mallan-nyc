import { propertyTypeUniverseOData } from "@/lib/search/canonical/property-type-universe";
import neighborhoodAliases from "@/data/rls/geo/neighborhood-aliases.json";
import {
  parsePropertySubTypeCriterion,
  propertySubTypeOData,
} from "@/lib/search/canonical/property-subtype-contract";

/**
 * Expand a canonical neighborhood name into all SubdivisionName variants
 * found in the RLS feed. E.g. "Kips Bay" -> ["Kips Bay","KIPS",...].
 */
export function expandCrmIdxNeighborhood(canonical: string): string[] {
  const aliases = (neighborhoodAliases as Record<string, unknown>).aliases as
    | Record<string, string | string[] | null>
    | undefined;
  if (!aliases) return [canonical];

  const variants = new Set<string>([canonical]);
  const canonLower = canonical.toLowerCase();

  for (const [raw, target] of Object.entries(aliases)) {
    if (target === null) continue;
    if (typeof target === "string") {
      if (target.toLowerCase() === canonLower) variants.add(raw);
    } else if (Array.isArray(target)) {
      if (target.some((value) => value.toLowerCase() === canonLower)) variants.add(raw);
    }
  }

  return [...variants];
}

export function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function stripStreetSuffix(value: string): string {
  return value
    .replace(/\s+(STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|PLACE|PL|DRIVE|DR|ROAD|RD|LANE|LN|COURT|CT|WAY|TERRACE|TER|CIRCLE|CIR|PARKWAY|PKWY|PLAZA)\s*$/i, "")
    .trim();
}

export function buildCrmIdxODataFilter(params: URLSearchParams): string {
  const parts: string[] = [];

  // STEP 2 — the universe comes from the canonical contract, rendered as a
  // POSITIVE predicate on both sides.
  //
  // This emitted `PropertyType ne 'ResidentialLease'` for sale. Measured live on
  // 2026-08-22 that returns exactly the same 215,388 rows as
  // `eq 'Residential'`, so it looked correct — but only because the other
  // eleven PropertyType members are unpopulated. It silently absorbs Land,
  // CommercialSale, MultiFamily, ResidentialIncome, Farm and
  // BusinessOpportunity into residential SALE inventory the moment any one is
  // populated, with no code change and no warning.
  const type = params.get("type");
  if (type === "sale") {
    parts.push(propertyTypeUniverseOData("sale"));
  } else if (type === "rent" || type === "rental") {
    parts.push(propertyTypeUniverseOData("rental"));
  }

  const minPrice = params.get("minPrice");
  const maxPrice = params.get("maxPrice");
  if (minPrice && Number(minPrice) > 0) {
    parts.push(`ListPrice ge ${Number(minPrice)}`);
  }
  if (maxPrice && Number(maxPrice) > 0) {
    parts.push(`ListPrice le ${Number(maxPrice)}`);
  }

  const minBeds = params.get("minBeds") ?? params.get("beds");
  if (minBeds != null && minBeds !== "" && Number(minBeds) >= 0) {
    parts.push(`BedroomsTotal ge ${Number(minBeds)}`);
  }
  const maxBeds = params.get("maxBeds");
  if (maxBeds != null && maxBeds !== "" && Number(maxBeds) >= 0) {
    parts.push(`BedroomsTotal le ${Number(maxBeds)}`);
  }

  const minBaths = params.get("minBaths");
  if (minBaths != null && minBaths !== "" && Number(minBaths) > 0) {
    parts.push(`BathroomsTotalInteger ge ${Number(minBaths)}`);
  }
  const maxBaths = params.get("maxBaths");
  if (maxBaths != null && maxBaths !== "" && Number(maxBaths) > 0) {
    parts.push(`BathroomsTotalInteger le ${Number(maxBaths)}`);
  }

  const neighborhood = params.get("neighborhood");
  if (neighborhood) {
    const canonicals = neighborhood.split(",").map((name) => name.trim()).filter(Boolean);
    const allVariants = new Set<string>();
    for (const canon of canonicals) {
      for (const variant of expandCrmIdxNeighborhood(canon)) {
        allVariants.add(variant);
      }
    }
    const variants = [...allVariants];
    if (variants.length === 1) {
      parts.push(`SubdivisionName eq '${escapeOData(variants[0])}'`);
    } else if (variants.length > 1) {
      const nParts = variants.map((name) => `SubdivisionName eq '${escapeOData(name)}'`);
      parts.push(`(${nParts.join(" or ")})`);
    }
  }

  const borough = params.get("borough");
  if (borough) {
    parts.push(`CityRegion eq '${escapeOData(borough)}'`);
  }

  const status = params.get("status");
  if (status === "*") {
    // Intentionally no status filter; used by RLS tracker for total count.
  } else if (status) {
    const statuses = status.split(",").map((value) => {
      const normalized = value.trim().replace(/\s+/g, "");
      return `StandardStatus eq '${escapeOData(normalized)}'`;
    });
    parts.push(`(${statuses.join(" or ")})`);
  } else {
    parts.push("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");
  }

  const address = params.get("address");
  if (address) {
    const raw = address.trim().toUpperCase();
    const dirPattern = /^(\d+)\s+(E|W|N|S|EAST|WEST|NORTH|SOUTH)\.?\s+(.*)/i;
    const numOnlyPattern = /^(\d+)\s+(.*)/;
    const dirMatch = raw.match(dirPattern);

    if (dirMatch) {
      const streetNum = dirMatch[1];
      const direction = dirMatch[2].charAt(0);
      const rawStreet = stripStreetSuffix(dirMatch[3]);
      const streetPart = rawStreet.replace(/(ST|ND|RD|TH)\b/gi, "").trim();
      const streetPartFull = escapeOData(rawStreet);
      const conditions = [`startswith(StreetNumber,'${streetNum}')`, `StreetDirPrefix eq '${direction}'`];

      if (streetPart && streetPart !== streetPartFull) {
        conditions.push(`(contains(StreetName,'${escapeOData(streetPart)}') or contains(StreetName,'${streetPartFull}'))`);
      } else if (streetPart) {
        conditions.push(`contains(StreetName,'${escapeOData(streetPart)}')`);
      }
      parts.push(`(${conditions.join(" and ")})`);
    } else {
      const numMatch = raw.match(numOnlyPattern);
      if (numMatch && numMatch[1]) {
        const streetNum = numMatch[1];
        const streetPart = stripStreetSuffix(numMatch[2] || "");
        if (streetPart) {
          const stripped = streetPart.replace(/(ST|ND|RD|TH)\b/gi, "").trim();
          const nameFilters = [`contains(StreetName,'${escapeOData(streetPart)}')`];
          if (stripped !== streetPart) {
            nameFilters.push(`contains(StreetName,'${escapeOData(stripped)}')`);
          }
          parts.push(`(startswith(StreetNumber,'${streetNum}') and (${nameFilters.join(" or ")}))`);
        } else {
          parts.push(`(startswith(StreetNumber,'${streetNum}') or contains(BuildingName,'${escapeOData(raw)}'))`);
        }
      } else if (/^\d+$/.test(raw)) {
        parts.push(`(startswith(StreetNumber,'${escapeOData(raw)}') or contains(BuildingName,'${escapeOData(raw)}'))`);
      } else {
        const cleaned = stripStreetSuffix(raw);
        parts.push(`(contains(StreetName,'${escapeOData(cleaned || raw)}') or contains(BuildingName,'${escapeOData(raw)}'))`);
      }
    }
  }

  const zip = params.get("zip");
  if (zip) {
    parts.push(`PostalCode eq '${escapeOData(zip)}'`);
  }

  const numericFilters: Array<[string, string, "ge" | "le", boolean]> = [
    ["minRooms", "RoomsTotal", "ge", false],
    ["maxRooms", "RoomsTotal", "le", false],
    ["minSqft", "LivingArea", "ge", false],
    ["maxSqft", "LivingArea", "le", false],
    ["minYear", "YearBuilt", "ge", false],
    ["maxYear", "YearBuilt", "le", false],
    ["minFloors", "StoriesTotal", "ge", false],
    ["maxFloors", "StoriesTotal", "le", false],
    ["minUnits", "NumberOfUnitsTotal", "ge", false],
    ["maxUnits", "NumberOfUnitsTotal", "le", false],
  ];
  for (const [param, field, op] of numericFilters) {
    const value = params.get(param);
    if (value != null && value !== "" && Number(value) > 0) {
      parts.push(`${field} ${op} ${Number(value)}`);
    }
  }

  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  const dateType = params.get("dateType") || "Listed";
  if (dateFrom) {
    const field = dateType === "Updated" ? "ModificationTimestamp" : "ListingContractDate";
    const op = dateType === "Updated" ? "gt" : "ge";
    const val = dateType === "Updated" ? `${dateFrom}T00:00:00Z` : dateFrom;
    parts.push(`${field} ${op} ${val}`);
  }
  if (dateTo) {
    const field = dateType === "Updated" ? "ModificationTimestamp" : "ListingContractDate";
    const val = dateType === "Updated" ? `${dateTo}T23:59:59Z` : dateTo;
    parts.push(`${field} le ${val}`);
  }

  const closeDateFrom = params.get("closeDateFrom");
  const closeDateTo = params.get("closeDateTo");
  if (closeDateFrom) parts.push(`CloseDate ge ${closeDateFrom}`);
  if (closeDateTo) parts.push(`CloseDate le ${closeDateTo}`);

  const contractDateFrom = params.get("contractDateFrom");
  const contractDateTo = params.get("contractDateTo");
  if (contractDateFrom) parts.push(`ListingContractDate ge ${contractDateFrom}`);
  if (contractDateTo) parts.push(`ListingContractDate le ${contractDateTo}`);

  const unit = params.get("unit");
  if (unit) parts.push(`UnitNumber eq '${escapeOData(unit.toUpperCase())}'`);

  const keyword = params.get("keyword");
  if (keyword) parts.push(`contains(PublicRemarks,'${escapeOData(keyword)}')`);

  const buildingName = params.get("buildingName");
  if (buildingName) parts.push(`contains(BuildingName,'${escapeOData(buildingName)}')`);

  const mgmtCompany = params.get("managementCompany");
  if (mgmtCompany) parts.push(`contains(ListOfficeName,'${escapeOData(mgmtCompany)}')`);

  // PropertySubType — ONE canonical criterion, rendered here for the provider and
  // in `criteria-to-prisma.ts` for the projection. Both read the same contract, so
  // the two paths cannot answer the same broker question differently.
  //
  // This used to emit `contains(PropertySubType,'…')`. Probed live 2026-08-21:
  // that is HTTP 400 — `contains` takes strings and PropertySubType is a scalar
  // enum — so every authenticated search carrying a property-type box failed at
  // the provider and surfaced as this route's own 502. `eq` (and OR of `eq`) is
  // SUPPORTED. See `docs/idx/cotality-property-subtype-live-contract-2026-08-21.md`.
  //
  // Validation is Mallan-side and case-exact BY NECESSITY: the provider rejects an
  // unparseable literal with 400 but answers a MIS-CASED one with 200 and zero
  // rows, which is indistinguishable from a legitimate empty result.
  const subType = params.get("propertySubType");
  if (subType) {
    const rendered = propertySubTypeOData(parsePropertySubTypeCriterion(subType));
    if (rendered) parts.push(rendered);
  }

  const ownership = params.get("ownership");
  if (ownership) {
    const types = ownership.split(",").map((value) => value.trim()).filter(Boolean);
    if (types.length === 1) {
      parts.push(`CommonInterest eq '${escapeOData(types[0])}'`);
    } else if (types.length > 1) {
      const oParts = types.map((value) => `CommonInterest eq '${escapeOData(value)}'`);
      parts.push(`(${oParts.join(" or ")})`);
    }
  }

  const cbRaw = params.get("checkboxFilters");
  if (cbRaw) {
    try {
      const cbFilters: Record<string, string[]> = JSON.parse(cbRaw);
      const trestleFieldMap: Record<string, string> = {
        BuildingLaundryFeatures: "LaundryFeatures",
        BuildingSecurityFeatures: "SecurityFeatures",
        BuildingPoolFeatures: "PoolFeatures",
        BuildingPetsAllowed: "PetsAllowedYN",
        LeaseType: "AvailableLeaseType",
        ConstructionType: "ConstructionMaterials",
        NewConstruction: "NewConstructionYN",
      };
      const odataSafe = new Set([
        "ListingAgreement", "LandLeaseYN", "CoolingYN", "GarageYN",
        "DirectionFaces", "NewConstructionYN",
        "StructureType", "ArchitecturalStyle", "BusinessType",
        "PetsAllowedYN", "ConstructionMaterials",
        "View", "AccessibilityFeatures", "ExteriorFeatures",
        "BuildingFeatures", "LaundryFeatures", "SecurityFeatures",
      ]);
      for (const [htmlField, values] of Object.entries(cbFilters)) {
        if (!values || values.length === 0) continue;
        const trestleField = trestleFieldMap[htmlField] || htmlField;
        if (!odataSafe.has(trestleField)) continue;
        if (trestleField.endsWith("YN")) {
          const wantTrue = values.includes("true") || values.includes("Yes");
          parts.push(`${trestleField} eq ${wantTrue ? "true" : "false"}`);
        } else if (values.length === 1) {
          parts.push(`${trestleField} eq '${escapeOData(values[0])}'`);
        } else {
          const orParts = values.map((value) => `${trestleField} eq '${escapeOData(value)}'`);
          parts.push(`(${orParts.join(" or ")})`);
        }
      }
    } catch {
      // Invalid JSON; skip and let client-side filtering handle it.
    }
  }

  const gridFilter = params.get("gridFilter");
  if (gridFilter) {
    const safeGrid = /^[\s()]*(?:(?:Latitude|Longitude)\s+(?:ge|le|gt|lt)\s+-?\d+(?:\.\d+)?(?:\s+and\s+)?)+[\s()]*$/i.test(gridFilter);
    if (safeGrid) parts.push(gridFilter);
  }

  const listingId = params.get("listingId");
  if (listingId) {
    // Bug A13 (L2 patch) — accept comma-separated RLS IDs.
    // Trestle/REBNY contract: Property.ListingId is the canonical RLS ID
    // (e.g. RLS20078109). Single-value input remains the common case.
    // Comma-separated input lets agents look up multiple listings in one
    // shot — generates `(ListingId eq 'X' or ListingId eq 'Y')`.
    // Web ID (SourceSystemKey) and opaque ListingKey are intentionally
    // not multiplexed here — those would be separate params if added.
    const ids = listingId
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 1) {
      parts.push(`ListingId eq '${escapeOData(ids[0])}'`);
    } else if (ids.length > 1) {
      const orParts = ids.map((id) => `ListingId eq '${escapeOData(id)}'`);
      parts.push(`(${orParts.join(" or ")})`);
    }
  }

  return parts.join(" and ");
}
