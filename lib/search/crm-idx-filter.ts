import { standardStatusOData } from "@/lib/search/canonical/status-token-contract";
import { boroughOData, neighborhoodOData } from "@/lib/search/canonical/geography";
import { propertyTypeUniverseOData } from "@/lib/search/canonical/property-type-universe";
import {
  parsePropertySubTypeCriterion,
  propertySubTypeOData,
} from "@/lib/search/canonical/property-subtype-contract";

/**
 * A broker criterion that Mallan cannot currently express using the verified
 * live Cotality contract. It is a request error, never a reason to drop the
 * criterion or substitute a different provider field.
 */
export class UnsupportedSearchCriterionError extends Error {
  readonly criterion: string;
  readonly unsupportedValues: readonly string[];

  constructor(criterion: string, unsupportedValues: readonly string[] = []) {
    super(
      `Unsupported search criterion '${criterion}'` +
        (unsupportedValues.length ? `: ${unsupportedValues.join(", ")}` : "") +
        ". Mallan will not silently drop it or substitute another Cotality field.",
    );
    this.name = "UnsupportedSearchCriterionError";
    this.criterion = criterion;
    this.unsupportedValues = unsupportedValues;
  }
}

/**
 * Retained only for old callers while geography is being re-contracted.
 * It no longer reads any legacy provider alias file. The authenticated provider
 * path must use only live Cotality facts.
 */
export function expandCrmIdxNeighborhood(canonical: string): string[] {
  return [canonical];
}

export function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

function stripStreetSuffix(value: string): string {
  return value
    .replace(/\s+(STREET|ST|AVENUE|AVE|BOULEVARD|BLVD|PLACE|PL|DRIVE|DR|ROAD|RD|LANE|LN|COURT|CT|WAY|TERRACE|TER|CIRCLE|CIR|PARKWAY|PKWY|PLAZA)\s*$/i, "")
    .trim();
}

function finiteNumber(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Exact live Cotality CommonInterest vocabulary, read from Property metadata. */
const COMMON_INTEREST = new Set([
  "BareLandCondominium",
  "CommunityApartment",
  "Condominium",
  "Condop",
  "CoOwnership",
  "Freehold",
  "Leasehold",
  "None",
  "Other",
  "PlannedDevelopment",
  "RentalBuilding",
  "StockCooperative",
  "Timeshare",
]);

function renderExactEnum(field: string, raw: string, allowed: ReadonlySet<string>, criterion: string): string {
  const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
  const bad = values.filter((v) => !allowed.has(v));
  if (bad.length) throw new UnsupportedSearchCriterionError(criterion, bad);
  const clauses = [...new Set(values)].map((v) => `${field} eq '${escapeOData(v)}'`);
  if (clauses.length === 0) return "";
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(" or ")})`;
}

export function buildCrmIdxODataFilter(params: URLSearchParams): string {
  const parts: string[] = [];

  // Sale/Rental is a Mallan business universe rendered from the exact Cotality
  // PropertyType members by one canonical contract.
  const type = params.get("type");
  if (type === "sale") parts.push(propertyTypeUniverseOData("sale"));
  else if (type === "rent" || type === "rental") parts.push(propertyTypeUniverseOData("rental"));

  const numeric: Array<[string, string, "ge" | "le", boolean]> = [
    ["minPrice", "ListPrice", "ge", false],
    ["maxPrice", "ListPrice", "le", false],
    ["minBeds", "BedroomsTotal", "ge", true],
    ["maxBeds", "BedroomsTotal", "le", true],
    ["minBaths", "BathroomsTotalInteger", "ge", false],
    ["maxBaths", "BathroomsTotalInteger", "le", false],
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
  for (const [param, field, op, allowZero] of numeric) {
    const raw = param === "minBeds" ? (params.get(param) ?? params.get("beds")) : params.get(param);
    const value = finiteNumber(raw);
    if (value !== null && (allowZero ? value >= 0 : value > 0)) parts.push(`${field} ${op} ${value}`);
  }

  // GEOGRAPHY — released from hold 2026-08-26 against live evidence.
  //
  // The hold existed because the equivalence between Cotality's several
  // geography facts and the Mallan concepts was unproven. It is now proven:
  // CityRegion is filterable with a closed five-member vocabulary covering
  // 591,293 of 591,303 rows, and SubdivisionName is filterable and 100%
  // populated on sampled active rows. See lib/search/canonical/geography.ts for
  // the probe record, including the `StatenIsland` spelling trap.
  //
  // Both still FAIL CLOSED on a value with no live counterpart: a dropped
  // geographic criterion widens the search while returning HTTP 200.
  const neighborhood = params.get("neighborhood");
  if (neighborhood) {
    const clause = neighborhoodOData(
      neighborhood.split(",").map((v) => v.trim()).filter(Boolean),
    );
    if (clause) parts.push(clause);
  }
  const borough = params.get("borough");
  if (borough) {
    // Comma-separated so a multi-borough selection becomes one disjunction.
    // It previously could not be expressed at all, so the browser dropped it
    // and silently answered all of NYC.
    const clause = boroughOData(borough.split(",").map((v) => v.trim()).filter(Boolean));
    if (clause) parts.push(clause);
  }

  const status = params.get("status");
  if (status === "*") {
    // Explicit all-status request.
  } else if (status) {
    const { filter } = standardStatusOData(status.split(","));
    if (filter) parts.push(filter);
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
      if (numMatch?.[1]) {
        const streetNum = numMatch[1];
        const streetPart = stripStreetSuffix(numMatch[2] || "");
        if (streetPart) {
          const stripped = streetPart.replace(/(ST|ND|RD|TH)\b/gi, "").trim();
          const nameFilters = [`contains(StreetName,'${escapeOData(streetPart)}')`];
          if (stripped !== streetPart) nameFilters.push(`contains(StreetName,'${escapeOData(stripped)}')`);
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
  if (zip) parts.push(`PostalCode eq '${escapeOData(zip)}'`);

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

  // Cotality does not declare a ManagementCompany Property field. Listing office
  // is a different fact and must never be substituted for management company.
  const managementCompany = params.get("managementCompany");
  if (managementCompany) throw new UnsupportedSearchCriterionError("managementCompany", [managementCompany]);

  const subType = params.get("propertySubType");
  if (subType) {
    const rendered = propertySubTypeOData(parsePropertySubTypeCriterion(subType));
    if (rendered) parts.push(rendered);
  }

  const ownership = params.get("ownership");
  if (ownership) {
    const rendered = renderExactEnum("CommonInterest", ownership, COMMON_INTEREST, "ownership");
    if (rendered) parts.push(rendered);
  }

  // The old generic checkbox engine silently dropped unknown controls and sent
  // Cotality multi-enums through scalar `eq`. Both are unsafe. Until each exact
  // field/operator/value contract is promoted, retain only simple booleans that
  // are declared directly on live Property; reject every other requested box.
  const cbRaw = params.get("checkboxFilters");
  if (cbRaw) {
    let cbFilters: Record<string, string[]>;
    try {
      cbFilters = JSON.parse(cbRaw) as Record<string, string[]>;
    } catch {
      throw new UnsupportedSearchCriterionError("checkboxFilters", ["invalid JSON"]);
    }

    const booleanFields = new Set(["LandLeaseYN", "CoolingYN", "GarageYN", "NewConstructionYN"]);
    const aliases: Record<string, string> = { NewConstruction: "NewConstructionYN" };

    for (const [htmlField, values] of Object.entries(cbFilters)) {
      if (!Array.isArray(values) || values.length === 0) continue;
      const field = aliases[htmlField] || htmlField;
      if (!booleanFields.has(field)) {
        throw new UnsupportedSearchCriterionError(`checkboxFilters.${htmlField}`, values.map(String));
      }
      const normalized = values.map((v) => String(v));
      const trueRequested = normalized.some((v) => v === "true" || v === "Yes");
      const falseRequested = normalized.some((v) => v === "false" || v === "No");
      if (trueRequested === falseRequested) {
        throw new UnsupportedSearchCriterionError(`checkboxFilters.${htmlField}`, normalized);
      }
      parts.push(`${field} eq ${trueRequested ? "true" : "false"}`);
    }
  }

  // Coordinates are map support, not a canonical Search axis. Do not accept a
  // raw caller-supplied coordinate predicate as a provider criterion.
  const gridFilter = params.get("gridFilter");
  if (gridFilter) throw new UnsupportedSearchCriterionError("gridFilter", [gridFilter]);

  const listingId = params.get("listingId");
  if (listingId) {
    const ids = listingId.split(",").map((s) => s.trim()).filter(Boolean);
    const clauses = ids.map((id) => `ListingId eq '${escapeOData(id)}'`);
    if (clauses.length === 1) parts.push(clauses[0]);
    else if (clauses.length > 1) parts.push(`(${clauses.join(" or ")})`);
  }

  return parts.join(" and ");
}
