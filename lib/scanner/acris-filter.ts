/**
 * lib/scanner/acris-filter.ts
 *
 * Pure filter functions for NYC ACRIS bulk data. Three datasets to join:
 *   - Real Property Master  (one row per recorded document)
 *   - Real Property Legals  (one row per affected BBL on a document)
 *   - Real Property Parties (one row per party on a document)
 *
 * Source: NYC OpenData (Socrata)
 *   Master:  https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Master/bnx9-e6tj
 *   Legals:  https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Legals/8h5j-fqxa
 *   Parties: https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Parties/636b-3b5g
 *
 * Join key: `document_id`. Pass 1 streams Master, keeps doc_ids of
 * interest. Pass 2 streams Legals, joins to corridor BBLs. Pass 3 streams
 * Parties, joins to grantors of those documents (the owner being affected).
 *
 * What this module is NOT:
 *   - Not a Socrata client. This is bulk-CSV-streaming aware. The existing
 *     `lib/seller-readiness/signals/acris.ts` does live per-BBL Socrata
 *     queries for deeds + mortgages — keep using that for hot-path scoring.
 *   - Not focused on deeds / mortgages. Those are already covered. This
 *     module focuses on **distress and disposition signals** that are
 *     stronger sell predictors:
 *
 *       LP, LIS, LPND, LISPD  — lis pendens (pre-foreclosure litigation)
 *       FORE, JDF             — foreclosure judgment
 *       TAX, NOTL             — tax liens
 *       EATR                  — estate transfer (heir wants out)
 *       EXECUTOR, ADMIN, LBADM — letters of testamentary / administration
 */

/** Doc-type codes for property transfers (deeds). Used by deed-history ingest. */
export const DEED_DOC_TYPES = new Set<string>([
  "DEED", "DEEDS", "DEEDO", "DEED, RP", "DEED, RC", "DEED, TS", "DEEDR",
  "BARGAIN AND SALE DEED", "BARGAIN", "QUIT CLAIM", "QUITCLAIM", "QC", "QCD",
]);

/** Returns true if the doc type is a deed/transfer record. */
export function isDeedDocType(docType: string | null | undefined): boolean {
  const dt = String(docType || "").trim().toUpperCase();
  if (!dt) return false;
  if (DEED_DOC_TYPES.has(dt)) return true;
  // Common substring match for variations like "DEED, RP" → contains "DEED"
  if (dt.startsWith("DEED")) return true;
  return false;
}

/** Doc-type codes treated as high-signal seller-intent indicators. */
export const SELLER_INTENT_DOC_TYPES = new Set<string>([
  // Lis pendens — pre-foreclosure litigation notice. STRONGEST single signal.
  "LP", "LIS", "LPND", "LISPD", "LISPENDENS",
  // Foreclosure judgment — bank has won. Still time for a workout sale.
  "FORE", "JDF", "JDGMT_F",
  // Tax liens — NYS or NYC tax delinquency formalized.
  "TAX", "NOTL", "NTOFL", "NYSTAX",
  // Estate / probate signals.
  "EATR", "EXECUTOR", "ADMIN", "LBADM", "ESTATE",
]);

/** Granular categorization for downstream scoring. */
export const DOC_TYPE_CATEGORIES = {
  lis_pendens: new Set<string>(["LP", "LIS", "LPND", "LISPD", "LISPENDENS"]),
  foreclosure: new Set<string>(["FORE", "JDF", "JDGMT_F"]),
  tax_lien: new Set<string>(["TAX", "NOTL", "NTOFL", "NYSTAX"]),
  estate: new Set<string>(["EATR", "EXECUTOR", "ADMIN", "LBADM", "ESTATE"]),
} as const;

export type AcrisCategory = keyof typeof DOC_TYPE_CATEGORIES;

export type AcrisRow = Record<string, string>;

/** Lowercase + trim — NYC OpenData CSV mixes case across fields. */
function lc(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

/** Normalize a field name so we can read either "doc_type" or "DOC_TYPE". */
function getField(row: AcrisRow, ...names: string[]): string {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null) return row[n];
    const upper = n.toUpperCase();
    if (row[upper] !== undefined && row[upper] !== null) return row[upper];
    const lower = n.toLowerCase();
    if (row[lower] !== undefined && row[lower] !== null) return row[lower];
  }
  return "";
}

/** Returns the canonical seller-intent category for a doc_type, or null. */
export function categorizeDocType(docType: string | null | undefined): AcrisCategory | null {
  const dt = String(docType || "").trim().toUpperCase();
  if (!dt) return null;
  for (const [cat, set] of Object.entries(DOC_TYPE_CATEGORIES) as [AcrisCategory, Set<string>][]) {
    if (set.has(dt)) return cat;
  }
  return null;
}

/** Borough code "1" check (Manhattan). Both Master (recorded_borough) and Legals (borough) carry this. */
export function isManhattanRecord(row: AcrisRow): boolean {
  const b = (
    getField(row, "recorded_borough", "borough") || ""
  ).trim();
  return b === "1";
}

/** Build a 10-digit BBL from a Legals row. */
export function bblFromLegals(row: AcrisRow): string | null {
  const b = (getField(row, "borough") || "").trim();
  const block = (getField(row, "block") || "").trim();
  const lot = (getField(row, "lot") || "").trim();
  if (!b || !block || !lot) return null;
  if (!/^\d{1,1}$/.test(b)) return null;
  const blockPad = block.padStart(5, "0");
  const lotPad = lot.padStart(4, "0");
  if (blockPad.length !== 5 || lotPad.length !== 4) return null;
  return b + blockPad + lotPad;
}

/** Master-row check: doc_type is on the seller-intent watchlist. */
export function isSellerIntentDoc(row: AcrisRow): boolean {
  const dt = (getField(row, "doc_type") || "").trim().toUpperCase();
  return SELLER_INTENT_DOC_TYPES.has(dt);
}

/** Master-row check: recorded within the cutoff window. */
export function isWithinWindow(row: AcrisRow, windowDays: number, now: Date = new Date()): boolean {
  const raw = getField(row, "recorded_datetime", "document_date", "modified_date");
  if (!raw) return false;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return false;
  const ageMs = now.getTime() - t;
  if (ageMs < 0) return false; // future-dated doc — treat as out of window
  return ageMs <= windowDays * 86400000;
}

/** Composite Master-row predicate. */
export function isWatchedMasterRow(row: AcrisRow, windowDays: number = 730, now: Date = new Date()): boolean {
  return isManhattanRecord(row) && isSellerIntentDoc(row) && isWithinWindow(row, windowDays, now);
}

/** Party-row check: party_type "1" = grantor (seller / borrower / debtor — the affected owner). */
export function isGrantorParty(row: AcrisRow): boolean {
  const pt = (getField(row, "party_type") || "").trim();
  return pt === "1";
}

/** Stats accumulator for the ingest run's manifest. */
export interface AcrisIngestStats {
  master_rows_seen: number;
  master_rows_manhattan: number;
  master_rows_seller_intent: number;
  master_rows_in_window: number;
  master_rows_kept: number;
  master_by_category: Record<AcrisCategory, number>;
  master_by_doc_type: Record<string, number>;

  legals_rows_seen: number;
  legals_rows_joined_doc_id: number;
  legals_rows_in_corridor: number;

  parties_rows_seen: number;
  parties_rows_joined_doc_id: number;
  parties_rows_grantor: number;

  output_records: number;
  unique_bbls: number;
  unique_owners: number;

  date_started: string;
  date_finished: string | null;
  source_master: string | null;
  source_legals: string | null;
  source_parties: string | null;
  window_days: number;
}

export function emptyAcrisStats(opts?: {
  master?: string;
  legals?: string;
  parties?: string;
  windowDays?: number;
}): AcrisIngestStats {
  return {
    master_rows_seen: 0,
    master_rows_manhattan: 0,
    master_rows_seller_intent: 0,
    master_rows_in_window: 0,
    master_rows_kept: 0,
    master_by_category: { lis_pendens: 0, foreclosure: 0, tax_lien: 0, estate: 0 },
    master_by_doc_type: {},
    legals_rows_seen: 0,
    legals_rows_joined_doc_id: 0,
    legals_rows_in_corridor: 0,
    parties_rows_seen: 0,
    parties_rows_joined_doc_id: 0,
    parties_rows_grantor: 0,
    output_records: 0,
    unique_bbls: 0,
    unique_owners: 0,
    date_started: new Date().toISOString(),
    date_finished: null,
    source_master: opts?.master || null,
    source_legals: opts?.legals || null,
    source_parties: opts?.parties || null,
    window_days: opts?.windowDays ?? 730,
  };
}

/** Process one Master row in pass 1. Returns true if the doc_id should be kept. */
export function processMasterRow(
  row: AcrisRow,
  stats: AcrisIngestStats,
  windowDays: number = 730,
  now: Date = new Date(),
): { kept: boolean; doc_id: string; doc_type: string; category: AcrisCategory | null } {
  stats.master_rows_seen += 1;
  const docId = (getField(row, "document_id") || "").trim();
  const docType = (getField(row, "doc_type") || "").trim().toUpperCase();
  const category = categorizeDocType(docType);

  stats.master_by_doc_type[docType] = (stats.master_by_doc_type[docType] || 0) + 1;

  if (!isManhattanRecord(row)) return { kept: false, doc_id: docId, doc_type: docType, category };
  stats.master_rows_manhattan += 1;

  if (!category) return { kept: false, doc_id: docId, doc_type: docType, category: null };
  stats.master_rows_seller_intent += 1;

  if (!isWithinWindow(row, windowDays, now)) return { kept: false, doc_id: docId, doc_type: docType, category };
  stats.master_rows_in_window += 1;

  if (!docId) return { kept: false, doc_id: docId, doc_type: docType, category };

  stats.master_rows_kept += 1;
  stats.master_by_category[category] += 1;
  return { kept: true, doc_id: docId, doc_type: docType, category };
}

export interface MasterDocSummary {
  doc_id: string;
  doc_type: string;
  category: AcrisCategory;
  document_date: string;
  recorded_datetime: string;
  document_amt: string;
}

/** Extract just the fields we want to persist from a Master row. */
export function projectMasterRow(row: AcrisRow, category: AcrisCategory): MasterDocSummary {
  return {
    doc_id: (getField(row, "document_id") || "").trim(),
    doc_type: (getField(row, "doc_type") || "").trim().toUpperCase(),
    category,
    document_date: (getField(row, "document_date") || "").trim(),
    recorded_datetime: (getField(row, "recorded_datetime") || "").trim(),
    document_amt: (getField(row, "document_amt") || "").trim(),
  };
}

export interface LegalsRowSummary {
  doc_id: string;
  bbl: string;
  street_number: string;
  street_name: string;
  unit: string;
  property_type: string;
}

/** Project a Legals row down to what we want to keep. */
export function projectLegalsRow(row: AcrisRow): LegalsRowSummary | null {
  const bbl = bblFromLegals(row);
  if (!bbl) return null;
  return {
    doc_id: (getField(row, "document_id") || "").trim(),
    bbl,
    street_number: (getField(row, "street_number") || "").trim(),
    street_name: (getField(row, "street_name") || "").trim(),
    unit: (getField(row, "unit") || "").trim(),
    property_type: (getField(row, "property_type") || "").trim(),
  };
}

export interface PartyRowSummary {
  doc_id: string;
  party_type: string;
  name: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

/** Project a Parties row down to what we want to keep. */
export function projectPartyRow(row: AcrisRow): PartyRowSummary {
  return {
    doc_id: (getField(row, "document_id") || "").trim(),
    party_type: (getField(row, "party_type") || "").trim(),
    name: (getField(row, "name") || "").trim(),
    address_1: (getField(row, "address_1") || "").trim(),
    address_2: (getField(row, "address_2") || "").trim(),
    city: (getField(row, "city") || "").trim(),
    state: (getField(row, "state") || "").trim(),
    zip: (getField(row, "zip") || "").trim(),
    country: (getField(row, "country") || "").trim(),
  };
}

// Re-export lc for testability of normalization
export { lc as _lc };

// ────────────────────────────────────────────────────────────
// Deed-history extension (ownership_duration_years computation)
// ────────────────────────────────────────────────────────────

export interface DeedHistoryEntry {
  bbl: string;
  doc_id: string;
  doc_type: string;
  recorded_datetime: string;
  document_amt: string;
}

export interface DeedHistoryStats {
  master_rows_seen: number;
  master_rows_manhattan_deeds: number;
  master_rows_in_window: number;
  legals_rows_seen: number;
  legals_rows_kept: number;
  unique_bbls: number;
  date_started: string;
  date_finished: string | null;
  window_days: number;
}

export function emptyDeedHistoryStats(windowDays: number): DeedHistoryStats {
  return {
    master_rows_seen: 0,
    master_rows_manhattan_deeds: 0,
    master_rows_in_window: 0,
    legals_rows_seen: 0,
    legals_rows_kept: 0,
    unique_bbls: 0,
    date_started: new Date().toISOString(),
    date_finished: null,
    window_days: windowDays,
  };
}

/**
 * Process a Master row in pass 1 of the deed-history ingest. Returns the
 * doc_id if it's a Manhattan deed within the window.
 */
export function processDeedMasterRow(
  row: AcrisRow,
  stats: DeedHistoryStats,
  windowDays: number,
  now: Date = new Date(),
): { kept: boolean; doc_id: string; recorded_datetime: string; document_amt: string; doc_type: string } {
  stats.master_rows_seen += 1;
  const docId = (getField(row, "document_id") || "").trim();
  const docType = (getField(row, "doc_type") || "").trim();
  const recorded = (getField(row, "recorded_datetime", "document_date", "modified_date") || "").trim();
  const amt = (getField(row, "document_amt") || "").trim();
  if (!isManhattanRecord(row)) return { kept: false, doc_id: docId, recorded_datetime: recorded, document_amt: amt, doc_type: docType };
  if (!isDeedDocType(docType)) return { kept: false, doc_id: docId, recorded_datetime: recorded, document_amt: amt, doc_type: docType };
  stats.master_rows_manhattan_deeds += 1;
  if (windowDays > 0 && !isWithinWindow(row, windowDays, now)) {
    return { kept: false, doc_id: docId, recorded_datetime: recorded, document_amt: amt, doc_type: docType };
  }
  stats.master_rows_in_window += 1;
  if (!docId) return { kept: false, doc_id: docId, recorded_datetime: recorded, document_amt: amt, doc_type: docType };
  return { kept: true, doc_id: docId, recorded_datetime: recorded, document_amt: amt, doc_type: docType };
}

/**
 * Given a list of deed-history entries (one row per (doc, BBL)), compute
 * the most-recent deed date per BBL, returning a Map<bbl, years-since>.
 *
 * `now` is used to compute years-since.
 */
export function computeOwnershipDuration(
  entries: DeedHistoryEntry[],
  now: Date = new Date(),
): Map<string, number> {
  const mostRecent = new Map<string, number>();
  for (const e of entries) {
    if (!e.bbl) continue;
    const t = Date.parse(e.recorded_datetime);
    if (!Number.isFinite(t)) continue;
    const prior = mostRecent.get(e.bbl);
    if (prior === undefined || t > prior) mostRecent.set(e.bbl, t);
  }
  const out = new Map<string, number>();
  for (const [bbl, t] of mostRecent) {
    const years = (now.getTime() - t) / (365.25 * 86400000);
    if (Number.isFinite(years) && years >= 0) {
      out.set(bbl, Math.round(years * 10) / 10);
    }
  }
  return out;
}
