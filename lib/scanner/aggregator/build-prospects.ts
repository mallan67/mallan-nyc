/**
 * lib/scanner/aggregator/build-prospects.ts
 *
 * Pure assembly: takes already-loaded outputs of the upstream filters
 * (PLUTO, ACRIS, DOS Corp, optional off-market) and produces an array
 * of `BblProspect` bundles ready to feed into the scoring engine.
 *
 * No I/O. No Prisma. No file reads. Everything in-memory.
 *
 * Joins:
 *   - ACRIS signals → BBL match (ACRIS output rows carry their bbl)
 *   - DOS Corp → owner-name match. Tries exact normalized first, falls
 *     back to stripped normalization (without LLC/Inc/Corp suffix).
 *   - Off-market signals → BBL match (when caller supplies them)
 *
 * Derived flags:
 *   - `is_dissolved_llc`: any matched DOS Corp record is non-active
 *   - `is_absentee`: DOS Corp process address ≠ PLUTO property address
 *     (only computable for LLC-owned properties; null otherwise)
 *   - `ownership_duration_years`: PENDING — ACRIS ingest currently
 *     filters to distress docs only, not deed history. Tracked as null
 *     until a separate deed ingest lands.
 */
import type {
  AcrisDistressSignal,
  BblProspect,
  DosCorpMatch,
  OffMarketSignalRef,
  PlutoContext,
} from "@/lib/scanner/scoring/types";
import type { PlutoProjected } from "@/lib/scanner/pluto-filter";
import type { DosCorpProjected } from "@/lib/scanner/dos-corp-filter";
import {
  normalizeEntityName,
  normalizeEntityNameStripped,
} from "@/lib/scanner/dos-corp-filter";

/** Already-loaded ACRIS ingest output row (from acris-corridor-signals.csv). */
export interface AcrisOutputRow {
  doc_id: string;
  doc_type: string;
  category: string; // lis_pendens | foreclosure | tax_lien | estate
  document_date: string;
  recorded_datetime: string;
  document_amt: string;
  bbl: string;
  street_number: string;
  street_name: string;
  unit: string;
  property_type: string;
  party_name: string;
  party_address_1: string;
  party_address_2: string;
  party_city: string;
  party_state: string;
  party_zip: string;
  party_country: string;
}

/** Optional off-market signal input — caller supplies these from Prisma or another source. */
export interface OffMarketInputRow {
  bbl: string;
  signal: OffMarketSignalRef;
}

/** Input bundle for the aggregator. */
export interface AggregatorInput {
  pluto: PlutoProjected[];
  acris: AcrisOutputRow[];
  dosCorp: DosCorpProjected[];
  offMarket?: OffMarketInputRow[];
  /** Pre-computed relist counts per BBL (24-month window). Caller computes. */
  offMarketRelistCounts?: Map<string, number>;
  /** Optional: ACRIS deed history per BBL (years since most recent deed). */
  ownershipDurationYearsByBbl?: Map<string, number>;
}

/** Per-BBL aggregation, returned in the same order as the input PLUTO array. */
export type AggregateOutput = BblProspect[];

const ACRIS_VALID_CATEGORIES = new Set(["lis_pendens", "foreclosure", "tax_lien", "estate"]);

function plutoToContext(row: PlutoProjected): PlutoContext {
  const lat = parseFloat(row.Latitude);
  const lng = parseFloat(row.Longitude);
  const yearBuilt = row.YearBuilt ? Number(row.YearBuilt) : null;
  return {
    bbl: row.BBL,
    owner_name: row.OwnerName || "",
    owner_type: row.OwnerType || undefined,
    address: row.Address || "",
    zip: row.ZipCode || undefined,
    year_built: yearBuilt && Number.isFinite(yearBuilt) ? yearBuilt : null,
    units_res: row.UnitsRes ? Number(row.UnitsRes) : null,
    units_total: row.UnitsTotal ? Number(row.UnitsTotal) : null,
    built_far: row.BuiltFAR ? Number(row.BuiltFAR) : null,
    assess_tot: row.AssessTot ? Number(row.AssessTot) : null,
    exempt_tot: row.ExemptTot ? Number(row.ExemptTot) : null,
    property_address: row.Address && row.ZipCode ? `${row.Address}, NEW YORK NY ${row.ZipCode}` : (row.Address || ""),
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lng) ? lng : undefined,
  };
}

function acrisToDistress(row: AcrisOutputRow): AcrisDistressSignal | null {
  if (!ACRIS_VALID_CATEGORIES.has(row.category)) return null;
  return {
    doc_id: row.doc_id,
    doc_type: row.doc_type,
    category: row.category as AcrisDistressSignal["category"],
    document_date: row.document_date || undefined,
    recorded_datetime: row.recorded_datetime,
    document_amt: row.document_amt || undefined,
    party_name: row.party_name || undefined,
  };
}

function indexAcrisByBbl(rows: AcrisOutputRow[]): Map<string, AcrisDistressSignal[]> {
  const out = new Map<string, AcrisDistressSignal[]>();
  for (const row of rows) {
    const sig = acrisToDistress(row);
    if (!sig) continue;
    if (!row.bbl) continue;
    const list = out.get(row.bbl) || [];
    list.push(sig);
    out.set(row.bbl, list);
  }
  return out;
}

interface DosIndex {
  /** Exact-normalized name → DOS records. */
  byName: Map<string, DosCorpProjected[]>;
  /** Stripped-name (sans LLC/Inc suffix) → DOS records. */
  byStripped: Map<string, DosCorpProjected[]>;
}

function indexDosCorp(rows: DosCorpProjected[]): DosIndex {
  const byName = new Map<string, DosCorpProjected[]>();
  const byStripped = new Map<string, DosCorpProjected[]>();
  for (const row of rows) {
    const name = row.normalized_name || normalizeEntityName(row.current_entity_name);
    if (name) {
      const list = byName.get(name) || [];
      list.push(row);
      byName.set(name, list);
    }
    const stripped = row.normalized_name_stripped || normalizeEntityNameStripped(row.current_entity_name);
    if (stripped) {
      const list = byStripped.get(stripped) || [];
      list.push(row);
      byStripped.set(stripped, list);
    }
  }
  return { byName, byStripped };
}

function indexOffMarketByBbl(rows: OffMarketInputRow[] = []): Map<string, OffMarketSignalRef[]> {
  const out = new Map<string, OffMarketSignalRef[]>();
  for (const r of rows) {
    if (!r.bbl) continue;
    const list = out.get(r.bbl) || [];
    list.push(r.signal);
    out.set(r.bbl, list);
  }
  return out;
}

function formatProcessAddress(row: DosCorpProjected): string {
  const parts: string[] = [];
  if (row.process_address_1) parts.push(row.process_address_1);
  if (row.process_address_2) parts.push(row.process_address_2);
  const cityStateZip = [row.process_city, row.process_state, row.process_zip].filter(Boolean).join(" ");
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(", ");
}

function dosRowToMatch(row: DosCorpProjected, kind: DosCorpMatch["match_kind"]): DosCorpMatch {
  return {
    dos_id: row.dos_id,
    current_entity_name: row.current_entity_name,
    status: row.status || "ACTIVE",
    initial_filing_date: row.initial_filing_date || undefined,
    process_name: row.process_name || undefined,
    process_address_full: formatProcessAddress(row) || undefined,
    match_kind: kind,
  };
}

function lookupDosMatches(ownerName: string, dos: DosIndex): DosCorpMatch[] {
  if (!ownerName) return [];
  const norm = normalizeEntityName(ownerName);
  const exact = dos.byName.get(norm);
  if (exact && exact.length > 0) {
    return exact.map((r) => dosRowToMatch(r, "exact_normalized"));
  }
  const stripped = normalizeEntityNameStripped(ownerName);
  if (stripped) {
    const fuzzy = dos.byStripped.get(stripped);
    if (fuzzy && fuzzy.length > 0) {
      return fuzzy.map((r) => dosRowToMatch(r, "stripped_match"));
    }
  }
  return [];
}

function deriveDissolvedLlc(matches: DosCorpMatch[]): boolean {
  if (matches.length === 0) return false;
  return matches.some((m) => {
    const s = (m.status || "").toUpperCase();
    return s !== "" && s !== "ACTIVE";
  });
}

/** Extract the leading street-address portion (before any comma), then normalize. */
function streetLead(value: string | null | undefined): string {
  if (!value) return "";
  const lead = String(value).split(",")[0];
  return lead.trim().toUpperCase().replace(/\./g, "").replace(/\s+/g, " ");
}

/**
 * Absentee detection — true when the LLC's filed process address differs
 * from the PLUTO property address. Returns null if no DOS match exists
 * (we can't determine absentee for individual owners without DOF
 * tax-bill mailing data).
 */
function deriveAbsentee(
  pluto: PlutoContext,
  matches: DosCorpMatch[],
): boolean | null {
  if (matches.length === 0) return null;
  const propLead = streetLead(pluto.property_address || pluto.address);
  if (!propLead) return null;
  for (const m of matches) {
    const procLead = streetLead(m.process_address_full);
    if (!procLead) continue;
    if (procLead !== propLead && !procLead.startsWith(propLead) && !propLead.startsWith(procLead)) {
      return true;
    }
  }
  return false;
}

/**
 * Main aggregator: walk PLUTO and, for each BBL, attach ACRIS distress
 * signals + DOS Corp matches + off-market signals. Returns one
 * `BblProspect` per PLUTO row in the same order.
 */
export function buildProspects(input: AggregatorInput): AggregateOutput {
  const acrisByBbl = indexAcrisByBbl(input.acris);
  const dos = indexDosCorp(input.dosCorp);
  const offMarketByBbl = indexOffMarketByBbl(input.offMarket);

  const out: BblProspect[] = [];
  for (const plutoRow of input.pluto) {
    if (!plutoRow.BBL) continue;
    const ctx = plutoToContext(plutoRow);
    const acris = acrisByBbl.get(plutoRow.BBL) || [];
    const dosMatches = lookupDosMatches(ctx.owner_name, dos);
    const offMarket = offMarketByBbl.get(plutoRow.BBL) || [];
    const dissolved = deriveDissolvedLlc(dosMatches);
    const absentee = deriveAbsentee(ctx, dosMatches);

    const prospect: BblProspect = {
      bbl: plutoRow.BBL,
      pluto: ctx,
      acris_signals: acris.length > 0 ? acris : undefined,
      off_market_signals: offMarket.length > 0 ? offMarket : undefined,
      off_market_relist_count_24mo: input.offMarketRelistCounts?.get(plutoRow.BBL) ?? undefined,
      dos_matches: dosMatches.length > 0 ? dosMatches : undefined,
      ownership_duration_years: input.ownershipDurationYearsByBbl?.get(plutoRow.BBL) ?? null,
      // Only attach the flag when truthy — keeps the prospect lean and
      // matches the convention that signals are surfaced, non-signals omitted.
      is_absentee: absentee === true ? true : undefined,
      is_dissolved_llc: dissolved || undefined,
    };
    out.push(prospect);
  }
  return out;
}

/** Aggregator stats — useful for the operator-side wrapper script. */
export interface AggregatorStats {
  pluto_in: number;
  prospects_built: number;
  prospects_with_any_signal: number;
  prospects_with_acris: number;
  prospects_with_off_market: number;
  prospects_with_dos_match: number;
  prospects_dissolved_llc: number;
  prospects_absentee: number;
  acris_in: number;
  acris_unmatched_bbl: number;
  dos_in: number;
  dos_unmatched: number;
}

export function summarizeAggregator(input: AggregatorInput, output: AggregateOutput): AggregatorStats {
  const acrisByBbl = indexAcrisByBbl(input.acris);
  const dos = indexDosCorp(input.dosCorp);

  let withAcris = 0;
  let withOff = 0;
  let withDos = 0;
  let dissolvedCount = 0;
  let absenteeCount = 0;
  let withAnySignal = 0;

  for (const p of output) {
    const hasAcris = !!(p.acris_signals && p.acris_signals.length > 0);
    const hasOff = !!(p.off_market_signals && p.off_market_signals.length > 0);
    const hasDos = !!(p.dos_matches && p.dos_matches.length > 0);
    if (hasAcris) withAcris++;
    if (hasOff) withOff++;
    if (hasDos) withDos++;
    if (p.is_dissolved_llc) dissolvedCount++;
    if (p.is_absentee) absenteeCount++;
    if (hasAcris || hasOff || hasDos) withAnySignal++;
  }

  // ACRIS rows whose BBL doesn't appear in PLUTO — possibly out-of-corridor or stale
  const plutoBblSet = new Set(input.pluto.map((p) => p.BBL).filter(Boolean));
  let acrisUnmatched = 0;
  for (const r of input.acris) {
    if (r.bbl && !plutoBblSet.has(r.bbl)) acrisUnmatched++;
  }

  // DOS rows whose normalized name doesn't match any PLUTO owner
  const ownerNames = new Set<string>();
  for (const p of input.pluto) {
    if (p.OwnerName) ownerNames.add(normalizeEntityName(p.OwnerName));
  }
  let dosUnmatched = 0;
  for (const [name] of dos.byName) {
    if (!ownerNames.has(name)) dosUnmatched++;
  }

  return {
    pluto_in: input.pluto.length,
    prospects_built: output.length,
    prospects_with_any_signal: withAnySignal,
    prospects_with_acris: withAcris,
    prospects_with_off_market: withOff,
    prospects_with_dos_match: withDos,
    prospects_dissolved_llc: dissolvedCount,
    prospects_absentee: absenteeCount,
    acris_in: input.acris.length,
    acris_unmatched_bbl: acrisUnmatched,
    dos_in: input.dosCorp.length,
    dos_unmatched: dosUnmatched,
  };
}
