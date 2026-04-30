/**
 * lib/scanner/pluto-filter.ts
 *
 * Pure filter functions for PLUTO rows. No I/O. Streamable from any
 * row source (CSV reader, S3, a test fixture).
 *
 * PLUTO field reference: NYC Department of City Planning
 *   https://www.nyc.gov/site/planning/data-maps/open-data/dwn-pluto-mappluto.page
 * Latest version reference (header may vary slightly by year): PLUTO 24v3.
 *
 * Source-of-truth columns we care about for the corridor scanner:
 *   BoroCode    "1" = Manhattan
 *   BBL         Borough-Block-Lot, primary key (10 digits)
 *   Address     Building street address
 *   OwnerName   Owner of record (often LLC/Trust — needs ACRIS join for real owner)
 *   OwnerType   "P"=Private | "X"=Mixed | "C"=City | "O"=Other gov | "M"=Mixed/Misc
 *   LandUse     "01" One-fam, "02" Two-fam, "03" Walk-up, "04" Elev, "05" Mixed Res+Com,
 *               "06" Commercial, "07" Industrial, "08" Transp/Utility, "09" Public,
 *               "10" Parking, "11" Vacant
 *   BldgClass   Granular DOF building classification (e.g. R4 condo, S0 1-fam mixed)
 *   UnitsRes    Number of residential units
 *   UnitsTotal  Total units
 *   YearBuilt   Year of construction
 *   AssessTot   Total assessed value (DOF)
 *   ExemptTot   Total tax exemption (abatements live here — 421-a, J-51, etc.)
 *   Latitude    Centroid lat (WGS84)
 *   Longitude   Centroid lng (WGS84)
 *   BuiltFAR    Built floor-area-ratio (used for LL97 exposure calc later)
 *   CondoNo     Condo number if applicable
 */
import { isInCorridor } from "@/lib/geo/manhattan-corridor";

export type PlutoRow = Record<string, string>;

/** Strict in-corridor check: must be Manhattan AND inside the polygon. */
export function isManhattanCorridorRow(row: PlutoRow): boolean {
  if (row.BoroCode !== "1") return false;
  const lat = Number(row.Latitude);
  const lng = Number(row.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return isInCorridor(lat, lng);
}

/** Land use codes that are at all relevant to a sale-prospect scanner. */
const RES_OR_MIXED_LAND_USE = new Set(["01", "02", "03", "04", "05", "06"]);

/**
 * Filter to property types worth scanning: residential (01-04), mixed-use
 * residential+commercial (05), and commercial (06). Excludes industrial,
 * transp/utility, public facilities, parking, vacant.
 */
export function isResidentialOrMixed(row: PlutoRow): boolean {
  const lu = (row.LandUse || "").trim().padStart(2, "0");
  return RES_OR_MIXED_LAND_USE.has(lu);
}

/**
 * Owner types worth scanning: private + mixed. Skip city/government/other
 * because those aren't sale-prospect candidates.
 */
export function isProspectableOwnerType(row: PlutoRow): boolean {
  const t = (row.OwnerType || "").trim().toUpperCase();
  return t === "P" || t === "X" || t === "M" || t === "";
}

/**
 * Composite filter: Manhattan corridor + residential-or-mixed +
 * prospectable owner. Returns true only if ALL three pass.
 */
export function isScannableProspect(row: PlutoRow): boolean {
  return (
    isManhattanCorridorRow(row) &&
    isResidentialOrMixed(row) &&
    isProspectableOwnerType(row)
  );
}

/**
 * Project a PLUTO row down to the columns we actually need downstream.
 * Keeps the corridor-clipped CSV ~5x smaller than the full PLUTO width.
 */
export const PLUTO_PROJECTION_COLUMNS = [
  "BBL",
  "BoroCode",
  "Block",
  "Lot",
  "Address",
  "ZipCode",
  "OwnerName",
  "OwnerType",
  "LandUse",
  "BldgClass",
  "UnitsRes",
  "UnitsTotal",
  "YearBuilt",
  "YearAlter1",
  "YearAlter2",
  "AssessLand",
  "AssessTot",
  "ExemptLand",
  "ExemptTot",
  "BuiltFAR",
  "ResidFAR",
  "CommFAR",
  "Latitude",
  "Longitude",
  "CondoNo",
  "HistDist",
  "Landmark",
  "LotArea",
  "BldgArea",
  "NumFloors",
  "ZoneDist1",
] as const;

export type PlutoProjected = Record<(typeof PLUTO_PROJECTION_COLUMNS)[number], string>;

export function projectPlutoRow(row: PlutoRow): PlutoProjected {
  const out = {} as PlutoProjected;
  for (const col of PLUTO_PROJECTION_COLUMNS) {
    out[col] = (row[col] ?? "").trim();
  }
  return out;
}

/** Stats accumulator for the ingest run's manifest. */
export interface PlutoIngestStats {
  rows_seen: number;
  rows_manhattan: number;
  rows_corridor: number;
  rows_residential_or_mixed: number;
  rows_prospectable_owner: number;
  rows_kept: number;
  rows_dropped_bad_geo: number;
  rows_dropped_outside_manhattan: number;
  rows_dropped_outside_corridor: number;
  rows_dropped_non_residential: number;
  rows_dropped_government_owner: number;
  by_land_use: Record<string, number>;
  by_owner_type: Record<string, number>;
  unique_owners_estimated: number;
  unique_addresses_estimated: number;
  date_started: string;
  date_finished: string | null;
  source: string | null;
}

export function emptyStats(source?: string): PlutoIngestStats {
  return {
    rows_seen: 0,
    rows_manhattan: 0,
    rows_corridor: 0,
    rows_residential_or_mixed: 0,
    rows_prospectable_owner: 0,
    rows_kept: 0,
    rows_dropped_bad_geo: 0,
    rows_dropped_outside_manhattan: 0,
    rows_dropped_outside_corridor: 0,
    rows_dropped_non_residential: 0,
    rows_dropped_government_owner: 0,
    by_land_use: {},
    by_owner_type: {},
    unique_owners_estimated: 0,
    unique_addresses_estimated: 0,
    date_started: new Date().toISOString(),
    date_finished: null,
    source: source || null,
  };
}

export interface ProcessRowResult {
  kept: boolean;
  reason: string;
  projected: PlutoProjected | null;
}

/**
 * Process one row, mutating stats in place. Returns the projected row if
 * kept, plus a verdict reason for the dropped/kept reason.
 */
export function processRow(row: PlutoRow, stats: PlutoIngestStats): ProcessRowResult {
  stats.rows_seen += 1;

  const lu = (row.LandUse || "").trim().padStart(2, "0");
  stats.by_land_use[lu] = (stats.by_land_use[lu] || 0) + 1;

  const ot = (row.OwnerType || "").trim().toUpperCase() || "_blank_";
  stats.by_owner_type[ot] = (stats.by_owner_type[ot] || 0) + 1;

  // 1. Manhattan check
  if (row.BoroCode !== "1") {
    stats.rows_dropped_outside_manhattan += 1;
    return { kept: false, reason: "outside_manhattan", projected: null };
  }
  stats.rows_manhattan += 1;

  // 2. Geo validity. Empty strings parse to 0, which is "valid" but
  // useless (off the African coast); treat empty/whitespace/NaN as bad_geo.
  const latRaw = (row.Latitude || "").trim();
  const lngRaw = (row.Longitude || "").trim();
  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    stats.rows_dropped_bad_geo += 1;
    return { kept: false, reason: "bad_geo", projected: null };
  }

  // 3. Corridor check
  if (!isInCorridor(lat, lng)) {
    stats.rows_dropped_outside_corridor += 1;
    return { kept: false, reason: "outside_corridor", projected: null };
  }
  stats.rows_corridor += 1;

  // 4. Residential / mixed check
  if (!isResidentialOrMixed(row)) {
    stats.rows_dropped_non_residential += 1;
    return { kept: false, reason: "non_residential", projected: null };
  }
  stats.rows_residential_or_mixed += 1;

  // 5. Owner type
  if (!isProspectableOwnerType(row)) {
    stats.rows_dropped_government_owner += 1;
    return { kept: false, reason: "government_owner", projected: null };
  }
  stats.rows_prospectable_owner += 1;

  // KEEP
  stats.rows_kept += 1;
  return { kept: true, reason: "kept", projected: projectPlutoRow(row) };
}
