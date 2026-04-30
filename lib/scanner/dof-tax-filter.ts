/**
 * lib/scanner/dof-tax-filter.ts
 *
 * NYC Department of Finance Property Tax Lien Sale list ingest.
 *
 * Source: NYC OpenData
 *   Annual lien-sale lists: https://data.cityofnewyork.us/browse?q=tax+lien+sale
 *
 * The lien-sale list is published annually (typically around April–May).
 * Properties on the list are at imminent risk of having their tax debt
 * sold to a third-party servicer with foreclosure rights — the strongest
 * tax-distress signal short of an actual foreclosure judgment.
 *
 * This is one notch BEYOND the ACRIS tax_lien category (which covers
 * recorded tax liens). A property can have a recorded tax lien (ACRIS)
 * and not yet be on the lien-sale list; or it can be on the lien-sale
 * list because of an aggregate of unpaid charges that doesn't show up
 * as a single ACRIS document.
 *
 * Filter strategy:
 *   1. Borough = 1 (Manhattan)
 *   2. Lien type filter (water/sewer alone is a different signal —
 *      property tax + emergency-repair is the one we care about)
 *   3. Corridor BBL clip via the optional pluto-corridor.csv whitelist
 */
import type { PlutoRow } from "@/lib/scanner/pluto-filter";

export type DofTaxRow = Record<string, string>;

const NORMALIZE_FIELD_MAP: Record<string, string[]> = {
  borough:      ["borough", "Borough", "BORO", "boro"],
  block:        ["block", "Block", "BLOCK"],
  lot:          ["lot", "Lot", "LOT"],
  bbl:          ["bbl", "BBL"],
  address:      ["address", "Address", "house_number_street", "property_address"],
  owner_name:   ["owner_name", "Owner Name", "OWNER", "owner", "ownername"],
  lien_type:    ["lien_type", "Lien Type", "type", "tax_class"],
  lien_amount:  ["lien_amount", "Lien Amount", "amount", "total_amount", "amount_due"],
  sale_date:    ["sale_date", "Sale Date", "lien_sale_date"],
  list_date:    ["list_date", "List Date", "publication_date"],
  status:       ["status", "Status"],
};

function getField(row: DofTaxRow, key: keyof typeof NORMALIZE_FIELD_MAP): string {
  for (const candidate of NORMALIZE_FIELD_MAP[key] || [key]) {
    if (row[candidate] !== undefined) return row[candidate];
    const upper = candidate.toUpperCase();
    if (row[upper] !== undefined) return row[upper];
    const lower = candidate.toLowerCase();
    if (row[lower] !== undefined) return row[lower];
  }
  return "";
}

/** Build a 10-digit BBL from the row (borough/block/lot or direct bbl). */
export function bblFromDofRow(row: DofTaxRow): string | null {
  const direct = (getField(row, "bbl") || "").trim().replace(/\D/g, "");
  if (direct.length === 10) return direct;
  if (direct.length === 9) return "0" + direct;
  const boro = (getField(row, "borough") || "").trim();
  const block = (getField(row, "block") || "").trim();
  const lot = (getField(row, "lot") || "").trim();
  if (!boro || !block || !lot) return null;
  if (!/^\d{1,1}$/.test(boro)) return null;
  const blockPad = block.padStart(5, "0");
  const lotPad = lot.padStart(4, "0");
  if (blockPad.length !== 5 || lotPad.length !== 4) return null;
  return boro + blockPad + lotPad;
}

/** Manhattan check: borough 1 OR BBL prefix 1. */
export function isManhattanRow(row: DofTaxRow): boolean {
  const boro = (getField(row, "borough") || "").trim();
  if (boro === "1") return true;
  const bbl = bblFromDofRow(row);
  return !!bbl && bbl.startsWith("1");
}

/** Lien-type categorization for downstream scoring. */
export type DofLienCategory = "property_tax" | "water_sewer" | "emergency_repair" | "other";

export function categorizeLienType(value: string | null | undefined): DofLienCategory {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "other";
  if (v.includes("tax") || v.includes("class")) return "property_tax";
  if (v.includes("water") || v.includes("sewer") || v.includes("dep")) return "water_sewer";
  if (v.includes("emergency") || v.includes("erp") || v.includes("repair")) return "emergency_repair";
  return "other";
}

/** Stats accumulator. */
export interface DofTaxIngestStats {
  rows_seen: number;
  rows_dropped_bad_bbl: number;
  rows_dropped_non_manhattan: number;
  rows_dropped_outside_corridor: number;
  rows_kept: number;
  by_lien_category: Record<DofLienCategory, number>;
  unique_bbls: number;
  date_started: string;
  date_finished: string | null;
  source: string | null;
  corridor_bbl_set_size: number | null;
}

export function emptyDofTaxStats(opts?: { source?: string; corridorSize?: number }): DofTaxIngestStats {
  return {
    rows_seen: 0,
    rows_dropped_bad_bbl: 0,
    rows_dropped_non_manhattan: 0,
    rows_dropped_outside_corridor: 0,
    rows_kept: 0,
    by_lien_category: { property_tax: 0, water_sewer: 0, emergency_repair: 0, other: 0 },
    unique_bbls: 0,
    date_started: new Date().toISOString(),
    date_finished: null,
    source: opts?.source || null,
    corridor_bbl_set_size: opts?.corridorSize ?? null,
  };
}

export interface DofTaxLienSignal {
  bbl: string;
  address: string;
  owner_name: string;
  lien_type: string;
  lien_category: DofLienCategory;
  lien_amount: string;
  sale_date: string;
  list_date: string;
  status: string;
}

export function projectDofRow(row: DofTaxRow, bbl: string): DofTaxLienSignal {
  const lienType = (getField(row, "lien_type") || "").trim();
  return {
    bbl,
    address: (getField(row, "address") || "").trim(),
    owner_name: (getField(row, "owner_name") || "").trim(),
    lien_type: lienType,
    lien_category: categorizeLienType(lienType),
    lien_amount: (getField(row, "lien_amount") || "").trim(),
    sale_date: (getField(row, "sale_date") || "").trim(),
    list_date: (getField(row, "list_date") || "").trim(),
    status: (getField(row, "status") || "").trim() || "ACTIVE",
  };
}

export interface ProcessRowResult {
  kept: boolean;
  reason: string;
  signal: DofTaxLienSignal | null;
}

export function processRow(
  row: DofTaxRow,
  stats: DofTaxIngestStats,
  corridorBbls?: Set<string> | null,
): ProcessRowResult {
  stats.rows_seen += 1;

  const bbl = bblFromDofRow(row);
  if (!bbl) {
    stats.rows_dropped_bad_bbl += 1;
    return { kept: false, reason: "bad_bbl", signal: null };
  }

  if (!isManhattanRow(row) && !bbl.startsWith("1")) {
    stats.rows_dropped_non_manhattan += 1;
    return { kept: false, reason: "non_manhattan", signal: null };
  }

  if (corridorBbls && !corridorBbls.has(bbl)) {
    stats.rows_dropped_outside_corridor += 1;
    return { kept: false, reason: "outside_corridor", signal: null };
  }

  const signal = projectDofRow(row, bbl);
  stats.by_lien_category[signal.lien_category] += 1;
  stats.rows_kept += 1;
  return { kept: true, reason: "kept", signal };
}

// Re-export for tests
export { getField as _getField };
// Avoid unused-import lint
export type { PlutoRow as _PlutoRow };
