import neighborhoodAliases from "@/data/rls/geo/neighborhood-aliases.json";

/**
 * Expand a canonical neighborhood name into all SubdivisionName variants
 * found in a Cotality feed snapshot (SubdivisionName, 2026-03-03). E.g. "Kips Bay" -> ["Kips Bay","KIPS",...].
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

// Agent / office search. The primary side (ListAgent*, ListOffice*) and the co-list side (CoListAgent{,2,3}*, CoListOffice{,2}*)
// are separate filters and are never merged; "anyAgent" is a convenience that spans both and does not replace either.
// Every id/name field below filters without error on live Cotality Property (verified 2026-10-06, api.cotality.com/trestle/odata).
// A token of digits is an exact MLS ID; anything else is a name match (every word must appear, case-insensitive).
const AGENT_PRIMARY_IDS = ["ListAgentMlsId"];
const AGENT_PRIMARY_NAMES = ["ListAgentFullName"];
const AGENT_COLIST_IDS = ["CoListAgentMlsId", "CoListAgent2MlsId", "CoListAgent3MlsId"];
const AGENT_COLIST_NAMES = ["CoListAgentFullName", "CoListAgent2FullName", "CoListAgent3FullName"];

export const CRM_AGENT_OFFICE_FILTERS: Record<string, { ids: string[]; names: string[] }> = {
  listAgent: { ids: AGENT_PRIMARY_IDS, names: AGENT_PRIMARY_NAMES },
  coListAgent: { ids: AGENT_COLIST_IDS, names: AGENT_COLIST_NAMES },
  anyAgent: { ids: [...AGENT_PRIMARY_IDS, ...AGENT_COLIST_IDS], names: [...AGENT_PRIMARY_NAMES, ...AGENT_COLIST_NAMES] },
  listOffice: { ids: ["ListOfficeMlsId"], names: ["ListOfficeName"] },
  coListOffice: { ids: ["CoListOfficeMlsId", "CoListOffice2MlsId"], names: ["CoListOfficeName", "CoListOffice2Name"] },
};

const AGENT_OFFICE_MAX_TOKENS = 5;
const AGENT_OFFICE_MAX_WORDS = 4;

function joinOr(terms: string[]): string {
  return terms.length === 1 ? terms[0] : `(${terms.join(" or ")})`;
}

function agentOfficeClause(spec: { ids: string[]; names: string[] }, token: string): string {
  if (/^\d{1,12}$/.test(token)) {
    return joinOr(spec.ids.map((field) => `${field} eq '${token}'`));
  }
  const words = token.split(/\s+/).filter(Boolean).slice(0, AGENT_OFFICE_MAX_WORDS);
  return joinOr(
    spec.names.map((field) => {
      const matches = words.map((word) => `contains(${field},'${escapeOData(word)}')`);
      return matches.length === 1 ? matches[0] : `(${matches.join(" and ")})`;
    }),
  );
}

export function buildAgentOfficeFilterParts(params: URLSearchParams): string[] {
  const parts: string[] = [];
  for (const [param, spec] of Object.entries(CRM_AGENT_OFFICE_FILTERS)) {
    const tokens = (params.get(param) || "")
      .split(",")
      .map((token) => token.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, AGENT_OFFICE_MAX_TOKENS);
    const clauses = tokens.map((token) => agentOfficeClause(spec, token));
    if (clauses.length === 1) parts.push(clauses[0]);
    else if (clauses.length > 1) parts.push(`(${clauses.join(" or ")})`);
  }
  return parts;
}

// Legacy input aliases, mapped to the live Cotality enumeration members (live $metadata, 2026-10-06). Saved searches written before the cutover
// stored the non-live ListingAgreement value "CoExclusive" (live: CoExclusiveAgency) and DirectionFaces as N/S/E/W/NE/NW/SE/SW
// (live: North, South, East, West, Northeast, Northwest, Southeast, Southwest). Cotality answers HTTP 400 to any other string.
const LEGACY_DIRECTION_FACES: Record<string, string> = {
  N: "North", S: "South", E: "East", W: "West", NE: "Northeast", NW: "Northwest", SE: "Southeast", SW: "Southwest",
};

function legacyCriterionValue(field: string, value: string): string {
  if (field === "ListingAgreement" && value === "CoExclusive") return "CoExclusiveAgency";
  if (field === "DirectionFaces" && LEGACY_DIRECTION_FACES[value]) return LEGACY_DIRECTION_FACES[value];
  return value;
}

export function buildCrmIdxODataFilter(params: URLSearchParams): string {
  const parts: string[] = [];

  const type = params.get("type");
  if (type === "sale") {
    parts.push("PropertyType ne 'ResidentialLease'");
  } else if (type === "rent" || type === "rental") {
    parts.push("PropertyType eq 'ResidentialLease'");
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
    // Intentionally no status filter; the CRM listing tracker (public/crm/js/init/init-tracker.js) uses it for the total count.
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

  parts.push(...buildAgentOfficeFilterParts(params));

  const subType = params.get("propertySubType");
  if (subType) {
    const subTypes = subType.split(",").map((value) => value.trim()).filter(Boolean);
    if (subTypes.length === 1) {
      parts.push(`contains(PropertySubType,'${escapeOData(subTypes[0])}')`);
    } else if (subTypes.length > 1) {
      const stParts = subTypes.map((value) => `contains(PropertySubType,'${escapeOData(value)}')`);
      parts.push(`(${stParts.join(" or ")})`);
    }
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
      const crmCheckboxToCotalityField: Record<string, string> = {
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
      for (const [htmlField, rawValues] of Object.entries(cbFilters)) {
        if (!rawValues || rawValues.length === 0) continue;
        // A checkbox can carry several comma-joined values (the "Exclusive" box does). Cotality compares these fields as enumerations, so a
        // joined string is rejected (HTTP 400): split it into one comparison per value, mapping legacy saved values to live members.
        const values = [...new Set(rawValues.flatMap((v) => String(v).split(",")).map((v) => v.trim()).filter(Boolean).map((v) => legacyCriterionValue(htmlField, v)))];
        if (values.length === 0) continue;
        const cotalityField = crmCheckboxToCotalityField[htmlField] || htmlField;
        if (!odataSafe.has(cotalityField)) continue;
        if (cotalityField.endsWith("YN")) {
          const wantTrue = values.includes("true") || values.includes("Yes");
          parts.push(`${cotalityField} eq ${wantTrue ? "true" : "false"}`);
        } else if (values.length === 1) {
          parts.push(`${cotalityField} eq '${escapeOData(values[0])}'`);
        } else {
          const orParts = values.map((value) => `${cotalityField} eq '${escapeOData(value)}'`);
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
    // Live Cotality contract (Master §0 IDENTIFIER): Property.ListingId is the RLS ID
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
