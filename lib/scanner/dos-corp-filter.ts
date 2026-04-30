/**
 * lib/scanner/dos-corp-filter.ts
 *
 * Pure filter functions for NY State Department of State Corporation database.
 *
 * Source: NY Open Data
 *   Active Corporations: https://data.ny.gov/Economic-Development/Active-Corporations-Beginning-1800/n9v6-gdxe
 *   (Inactive / dissolved is a separate dataset; same column shape.)
 *
 * Why this matters for the off-market scanner: ACRIS often shows the
 * grantor as "ACME 90 LLC" — the LLC name without contact info. NY DOS
 * Corp gives the registered agent + process address for that LLC, plus
 * status (active / dissolved / forfeited — dissolved+still-owns-property
 * is itself a strong sell signal).
 *
 * What this is NOT:
 *   - Not the LLC Transparency Act beneficial-owner database. That data
 *     was made confidential by 2024 amendment; only law enforcement can
 *     query. Same with FinCEN CTA. We use the public DOS Corp DB only.
 *
 * Filter strategy:
 *   - Keep all NYC-county entities (Manhattan/Brooklyn/Queens/Bronx/SI),
 *     since an LLC's filed county doesn't always match where its property
 *     is. We aggregate by entity name later when joining to ACRIS.
 *   - Optionally keep non-NYC counties whose process address falls in NYC.
 *   - Status is preserved on the output (active vs dissolved is the
 *     scanner-relevant distinction, not a filter criterion).
 *   - Entity type filter to LLC/CORP/INC/NFP/LP/LLP — skip individual
 *     "DBA" assumed-name filings (different signal).
 */

export type DosCorpRow = Record<string, string>;

const NYC_COUNTIES = new Set<string>([
  "NEW YORK",   // Manhattan
  "KINGS",      // Brooklyn
  "QUEENS",
  "BRONX",
  "RICHMOND",   // Staten Island
]);

const RELEVANT_ENTITY_TYPES = new Set<string>([
  "DOMESTIC LIMITED LIABILITY COMPANY",
  "FOREIGN LIMITED LIABILITY COMPANY",
  "DOMESTIC BUSINESS CORPORATION",
  "FOREIGN BUSINESS CORPORATION",
  "DOMESTIC NOT-FOR-PROFIT CORPORATION",
  "FOREIGN NOT-FOR-PROFIT CORPORATION",
  "DOMESTIC PROFESSIONAL CORPORATION",
  "FOREIGN PROFESSIONAL CORPORATION",
  "DOMESTIC PROFESSIONAL SERVICE CORPORATION",
  "DOMESTIC LIMITED PARTNERSHIP",
  "FOREIGN LIMITED PARTNERSHIP",
  "DOMESTIC LIMITED LIABILITY PARTNERSHIP",
  "FOREIGN LIMITED LIABILITY PARTNERSHIP",
  // Short forms occasionally appearing
  "LLC", "DLLC", "FLLC", "CORP", "DCORP", "FCORP",
]);

const NYC_ZIP_PREFIXES = ["100", "101", "102", "103", "104", "111", "112", "113", "114", "116"];

/** Normalize header field-name lookup — DOS data uses "Current Entity Name" with spaces or snake_case in different exports. */
function getField(row: DosCorpRow, ...candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c];
    const upper = c.toUpperCase();
    if (row[upper] !== undefined) return row[upper];
    const lower = c.toLowerCase();
    if (row[lower] !== undefined) return row[lower];
  }
  return "";
}

/** Lower + strip punctuation + collapse whitespace. Used as join key with ACRIS grantor names. */
export function normalizeEntityName(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

/** A second normalizer that also strips common entity suffixes for fuzzier matching. */
export function normalizeEntityNameStripped(value: string | null | undefined): string {
  return normalizeEntityName(value)
    .replace(/\b(llc|l l c|l\.l\.c\.|inc|incorporated|corp|corporation|ltd|limited|lp|llp|pc|pllc)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getEntityName(row: DosCorpRow): string {
  return getField(row, "current_entity_name", "Current Entity Name", "entity_name").trim();
}

export function getDosId(row: DosCorpRow): string {
  return getField(row, "dos_id", "DOS ID", "dosid").trim();
}

export function getCounty(row: DosCorpRow): string {
  return getField(row, "county", "County").trim().toUpperCase();
}

export function getEntityType(row: DosCorpRow): string {
  return getField(row, "entity_type", "Entity Type").trim().toUpperCase();
}

export function getStatus(row: DosCorpRow): string {
  // Active dataset has no status column (everyone is "Active"); inactive
  // dataset has a status field. Default to "ACTIVE" if unspecified.
  const s = getField(row, "status", "Status", "current_status").trim().toUpperCase();
  return s || "ACTIVE";
}

export function getProcessName(row: DosCorpRow): string {
  return getField(row, "dos_process_name", "DOS Process Name").trim();
}

export function getProcessAddress1(row: DosCorpRow): string {
  return getField(row, "dos_process_address_1", "DOS Process Address 1", "process_address_1").trim();
}

export function getProcessAddress2(row: DosCorpRow): string {
  return getField(row, "dos_process_address_2", "DOS Process Address 2", "process_address_2").trim();
}

export function getProcessCity(row: DosCorpRow): string {
  return getField(row, "dos_process_city", "DOS Process City", "process_city").trim();
}

export function getProcessState(row: DosCorpRow): string {
  return getField(row, "dos_process_state", "DOS Process State", "process_state").trim().toUpperCase();
}

export function getProcessZip(row: DosCorpRow): string {
  return getField(row, "dos_process_zip", "DOS Process Zip", "process_zip", "DOS Process Zip Code").trim();
}

export function getInitialFilingDate(row: DosCorpRow): string {
  return getField(row, "initial_dos_filing_date", "Initial DOS Filing Date", "filing_date").trim();
}

export function getJurisdiction(row: DosCorpRow): string {
  return getField(row, "jurisdiction", "Jurisdiction").trim().toUpperCase();
}

/** Manhattan check by county — primary filter. */
export function isManhattanCounty(row: DosCorpRow): boolean {
  return getCounty(row) === "NEW YORK";
}

/** Any NYC borough by county. */
export function isNycCounty(row: DosCorpRow): boolean {
  return NYC_COUNTIES.has(getCounty(row));
}

/** Process address falls in NYC (zip prefix 100-116, NY state). */
export function hasNycProcessAddress(row: DosCorpRow): boolean {
  const state = getProcessState(row);
  if (state !== "NY") return false;
  const zip = getProcessZip(row);
  if (!zip) return false;
  const prefix = zip.slice(0, 3);
  return NYC_ZIP_PREFIXES.includes(prefix);
}

/** Composite check: NYC-relevant if either the county or the process address is NYC. */
export function isNycRelevant(row: DosCorpRow): boolean {
  return isNycCounty(row) || hasNycProcessAddress(row);
}

/** Entity type is one we care about (LLC / Corp / NFP / LP / LLP). */
export function isRelevantEntityType(row: DosCorpRow): boolean {
  const t = getEntityType(row);
  if (!t) return true; // missing type — let it through, agent will dedupe
  // Direct match
  if (RELEVANT_ENTITY_TYPES.has(t)) return true;
  // Fuzzy contains check for slightly different spellings
  if (/LIMITED LIABILITY/.test(t)) return true;
  if (/CORPORATION/.test(t)) return true;
  if (/PARTNERSHIP/.test(t)) return true;
  return false;
}

/** Stats accumulator. */
export interface DosCorpIngestStats {
  rows_seen: number;
  rows_dropped_non_nyc: number;
  rows_dropped_irrelevant_type: number;
  rows_kept: number;
  rows_kept_active: number;
  rows_kept_inactive: number;
  rows_kept_manhattan_county: number;
  rows_kept_other_nyc_county: number;
  rows_kept_nyc_process_only: number;
  by_entity_type: Record<string, number>;
  by_status: Record<string, number>;
  unique_entity_names_estimated: number;
  date_started: string;
  date_finished: string | null;
  source: string | null;
}

export function emptyDosCorpStats(source?: string): DosCorpIngestStats {
  return {
    rows_seen: 0,
    rows_dropped_non_nyc: 0,
    rows_dropped_irrelevant_type: 0,
    rows_kept: 0,
    rows_kept_active: 0,
    rows_kept_inactive: 0,
    rows_kept_manhattan_county: 0,
    rows_kept_other_nyc_county: 0,
    rows_kept_nyc_process_only: 0,
    by_entity_type: {},
    by_status: {},
    unique_entity_names_estimated: 0,
    date_started: new Date().toISOString(),
    date_finished: null,
    source: source || null,
  };
}

export interface DosCorpProjected {
  dos_id: string;
  current_entity_name: string;
  normalized_name: string;
  normalized_name_stripped: string;
  entity_type: string;
  status: string;
  initial_filing_date: string;
  jurisdiction: string;
  county: string;
  process_name: string;
  process_address_1: string;
  process_address_2: string;
  process_city: string;
  process_state: string;
  process_zip: string;
}

export const DOS_CORP_PROJECTION_COLUMNS: (keyof DosCorpProjected)[] = [
  "dos_id",
  "current_entity_name",
  "normalized_name",
  "normalized_name_stripped",
  "entity_type",
  "status",
  "initial_filing_date",
  "jurisdiction",
  "county",
  "process_name",
  "process_address_1",
  "process_address_2",
  "process_city",
  "process_state",
  "process_zip",
];

export function projectDosCorpRow(row: DosCorpRow): DosCorpProjected {
  const name = getEntityName(row);
  return {
    dos_id: getDosId(row),
    current_entity_name: name,
    normalized_name: normalizeEntityName(name),
    normalized_name_stripped: normalizeEntityNameStripped(name),
    entity_type: getEntityType(row),
    status: getStatus(row),
    initial_filing_date: getInitialFilingDate(row),
    jurisdiction: getJurisdiction(row),
    county: getCounty(row),
    process_name: getProcessName(row),
    process_address_1: getProcessAddress1(row),
    process_address_2: getProcessAddress2(row),
    process_city: getProcessCity(row),
    process_state: getProcessState(row),
    process_zip: getProcessZip(row),
  };
}

export interface ProcessRowResult {
  kept: boolean;
  reason: string;
  projected: DosCorpProjected | null;
}

/** Process one DOS Corp row, mutating stats. */
export function processRow(row: DosCorpRow, stats: DosCorpIngestStats): ProcessRowResult {
  stats.rows_seen += 1;
  const t = getEntityType(row);
  stats.by_entity_type[t || "_blank_"] = (stats.by_entity_type[t || "_blank_"] || 0) + 1;
  const s = getStatus(row);
  stats.by_status[s] = (stats.by_status[s] || 0) + 1;

  if (!isRelevantEntityType(row)) {
    stats.rows_dropped_irrelevant_type += 1;
    return { kept: false, reason: "irrelevant_entity_type", projected: null };
  }

  const inNycCounty = isNycCounty(row);
  const inNycByProcess = !inNycCounty && hasNycProcessAddress(row);
  if (!inNycCounty && !inNycByProcess) {
    stats.rows_dropped_non_nyc += 1;
    return { kept: false, reason: "non_nyc", projected: null };
  }

  stats.rows_kept += 1;
  if (s === "ACTIVE") stats.rows_kept_active += 1;
  else stats.rows_kept_inactive += 1;
  if (isManhattanCounty(row)) stats.rows_kept_manhattan_county += 1;
  else if (inNycCounty) stats.rows_kept_other_nyc_county += 1;
  else stats.rows_kept_nyc_process_only += 1;

  return { kept: true, reason: "kept", projected: projectDosCorpRow(row) };
}
