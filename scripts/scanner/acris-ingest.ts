#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/acris-ingest.ts
 *
 * Three-pass streaming join of NYC ACRIS bulk data, filtered to seller-
 * intent doc types (lis pendens, foreclosure, tax liens, estate transfers),
 * recent-window, Manhattan, corridor-clipped.
 *
 * Output: one row per (document_id × bbl × party) tuple — i.e., one
 * affected-owner-on-an-affected-property record per scanner signal.
 *
 * Source datasets (download from NYC OpenData):
 *   Master:  https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Master/bnx9-e6tj
 *   Legals:  https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Legals/8h5j-fqxa
 *   Parties: https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Parties/636b-3b5g
 *
 * Each is published as a CSV with hundreds of millions of rows (Master is
 * ~50M rows, Legals/Parties similar). Use Socrata SoQL filters to narrow
 * the download — e.g., `?$where=recorded_borough=1 and recorded_datetime>'2024-01-01'`
 * cuts Master to ~500K rows for Manhattan.
 *
 * Usage:
 *   npx tsx scripts/scanner/acris-ingest.ts \
 *     --master <master.csv> \
 *     --legals <legals.csv> \
 *     --parties <parties.csv> \
 *     [--corridor-bbls data/scanner/pluto-corridor.csv] \
 *     [--window-days 730] \
 *     [--output data/scanner/acris-corridor-signals.csv] \
 *     [--manifest data/scanner/acris-manifest.json]
 *
 * Memory profile: streams each input. Builds an in-memory Set<doc_id>
 * after Pass 1 (~tens of thousands of doc_ids = a few MB) and a
 * Map<doc_id, MasterDocSummary> for the join.
 */
import { promises as fs, createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import {
  emptyAcrisStats,
  processMasterRow,
  projectMasterRow,
  projectLegalsRow,
  projectPartyRow,
  isGrantorParty,
  type AcrisRow,
  type AcrisIngestStats,
  type MasterDocSummary,
  type LegalsRowSummary,
} from "@/lib/scanner/acris-filter";

const REPO_ROOT = process.cwd();
const DEFAULT_CORRIDOR_BBLS = path.join(REPO_ROOT, "data", "scanner", "pluto-corridor.csv");
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data", "scanner", "acris-corridor-signals.csv");
const DEFAULT_MANIFEST = path.join(REPO_ROOT, "data", "scanner", "acris-manifest.json");

interface Args {
  master: string;
  legals: string;
  parties: string;
  corridorBbls: string;
  windowDays: number;
  output: string;
  manifest: string;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    master: "",
    legals: "",
    parties: "",
    corridorBbls: DEFAULT_CORRIDOR_BBLS,
    windowDays: 730,
    output: DEFAULT_OUTPUT,
    manifest: DEFAULT_MANIFEST,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--master") args.master = argv[++i] || "";
    else if (a === "--legals") args.legals = argv[++i] || "";
    else if (a === "--parties") args.parties = argv[++i] || "";
    else if (a === "--corridor-bbls") args.corridorBbls = argv[++i] || args.corridorBbls;
    else if (a === "--window-days") args.windowDays = Number(argv[++i] || 730);
    else if (a === "--output") args.output = argv[++i] || args.output;
    else if (a === "--manifest") args.manifest = argv[++i] || args.manifest;
    else if (a === "--quiet") args.quiet = true;
  }
  return args;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

async function ensureDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function streamCsv(
  filePath: string,
  onRow: (row: AcrisRow) => void,
  log: (msg: string) => void,
  label: string,
): Promise<{ headerCols: string[]; lineNum: number }> {
  const inStream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input: inStream, crlfDelay: Infinity });
  let headerCols: string[] | null = null;
  let lineNum = 0;
  for await (const rawLine of rl) {
    lineNum++;
    if (!headerCols) {
      headerCols = splitCsvLine(rawLine).map((h) => h.trim());
      continue;
    }
    const cells = splitCsvLine(rawLine);
    if (cells.length === 1 && cells[0] === "") continue;
    const row: AcrisRow = {};
    for (let i = 0; i < headerCols.length; i++) {
      row[headerCols[i]] = cells[i] ?? "";
    }
    onRow(row);
    if (lineNum % 200000 === 0) log(`[${label}] ${lineNum.toLocaleString()} lines processed`);
  }
  return { headerCols: headerCols || [], lineNum };
}

async function loadCorridorBbls(filePath: string, log: (msg: string) => void): Promise<Set<string> | null> {
  try {
    await fs.stat(filePath);
  } catch {
    log(`[acris-ingest] corridor-bbls file not found at ${path.relative(REPO_ROOT, filePath)} — passing all Manhattan BBLs through.`);
    log(`[acris-ingest]   to enable corridor clipping, run scanner:pluto-ingest first.`);
    return null;
  }
  const bbls = new Set<string>();
  const inStream = createReadStream(filePath, { encoding: "utf-8" });
  const rl = createInterface({ input: inStream, crlfDelay: Infinity });
  let header: string[] | null = null;
  let bblCol = -1;
  for await (const rawLine of rl) {
    if (!header) {
      header = splitCsvLine(rawLine).map((h) => h.trim());
      bblCol = header.indexOf("BBL");
      if (bblCol < 0) {
        log(`[acris-ingest] corridor-bbls file missing BBL column.`);
        return null;
      }
      continue;
    }
    const cells = splitCsvLine(rawLine);
    const bbl = (cells[bblCol] || "").trim();
    if (bbl) bbls.add(bbl);
  }
  log(`[acris-ingest] corridor BBL set: ${bbls.size.toLocaleString()} entries loaded`);
  return bbls;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = args.quiet ? () => undefined : (msg: string) => console.log(msg);
  if (!args.master || !args.legals || !args.parties) {
    console.error("Usage: npx tsx scripts/scanner/acris-ingest.ts --master <m.csv> --legals <l.csv> --parties <p.csv>");
    console.error("");
    console.error("ACRIS download pages:");
    console.error("  Master:  https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Master/bnx9-e6tj");
    console.error("  Legals:  https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Legals/8h5j-fqxa");
    console.error("  Parties: https://data.cityofnewyork.us/Government/ACRIS-Real-Property-Parties/636b-3b5g");
    console.error("");
    console.error("Tip: pre-filter with Socrata SoQL — e.g.,");
    console.error("  https://data.cityofnewyork.us/resource/bnx9-e6tj.csv?$where=recorded_borough=1%20and%20recorded_datetime>'2024-01-01'&$limit=2000000");
    process.exit(1);
  }

  for (const p of [args.master, args.legals, args.parties]) {
    try {
      await fs.stat(path.resolve(p));
    } catch {
      console.error(`[acris-ingest] input not found: ${p}`);
      process.exit(1);
    }
  }

  await ensureDir(args.output);
  await ensureDir(args.manifest);

  const stats: AcrisIngestStats = emptyAcrisStats({
    master: path.relative(REPO_ROOT, path.resolve(args.master)),
    legals: path.relative(REPO_ROOT, path.resolve(args.legals)),
    parties: path.relative(REPO_ROOT, path.resolve(args.parties)),
    windowDays: args.windowDays,
  });

  const tStart = Date.now();
  const NOW = new Date();

  // ── Pre: corridor BBL set ──────────────────────────────────
  const corridorBbls = await loadCorridorBbls(path.resolve(args.corridorBbls), log);

  // ── Pass 1: Master ─────────────────────────────────────────
  log(`[acris-ingest] Pass 1: streaming Master (${args.master})`);
  const watchedDocs = new Map<string, MasterDocSummary>();
  await streamCsv(path.resolve(args.master), (row) => {
    const r = processMasterRow(row, stats, args.windowDays, NOW);
    if (r.kept && r.category) {
      watchedDocs.set(r.doc_id, projectMasterRow(row, r.category));
    }
  }, log, "master");
  log(`[acris-ingest] Pass 1 complete: ${stats.master_rows_kept.toLocaleString()} watched docs of ${stats.master_rows_seen.toLocaleString()} master rows`);

  // ── Pass 2: Legals (filter to watched doc_ids + corridor BBLs) ──
  log(`[acris-ingest] Pass 2: streaming Legals (${args.legals})`);
  const watchedDocLegals = new Map<string, LegalsRowSummary[]>();
  const uniqueBbls = new Set<string>();
  await streamCsv(path.resolve(args.legals), (row) => {
    stats.legals_rows_seen += 1;
    const docId = (row.document_id || row.DOCUMENT_ID || "").trim();
    if (!docId || !watchedDocs.has(docId)) return;
    stats.legals_rows_joined_doc_id += 1;
    const proj = projectLegalsRow(row);
    if (!proj) return;
    if (corridorBbls && !corridorBbls.has(proj.bbl)) return;
    stats.legals_rows_in_corridor += 1;
    uniqueBbls.add(proj.bbl);
    const list = watchedDocLegals.get(docId) || [];
    list.push(proj);
    watchedDocLegals.set(docId, list);
  }, log, "legals");
  log(`[acris-ingest] Pass 2 complete: ${stats.legals_rows_in_corridor.toLocaleString()} corridor-Legals rows, ${uniqueBbls.size.toLocaleString()} unique BBLs`);

  if (watchedDocLegals.size === 0) {
    log(`[acris-ingest] no Legals rows joined — output will be empty. Check that --master and --legals are from the same date range.`);
  }

  // ── Pass 3: Parties (filter to watched doc_ids + grantors only) ──
  log(`[acris-ingest] Pass 3: streaming Parties (${args.parties})`);
  const outStream = createWriteStream(args.output, { encoding: "utf-8" });
  const OUT_HEADER = [
    "doc_id", "doc_type", "category", "document_date", "recorded_datetime", "document_amt",
    "bbl", "street_number", "street_name", "unit", "property_type",
    "party_name", "party_address_1", "party_address_2", "party_city", "party_state", "party_zip", "party_country",
  ];
  outStream.write(OUT_HEADER.join(",") + "\n");
  const uniqueOwners = new Set<string>();

  await streamCsv(path.resolve(args.parties), (row) => {
    stats.parties_rows_seen += 1;
    const docId = (row.document_id || row.DOCUMENT_ID || "").trim();
    if (!docId || !watchedDocs.has(docId)) return;
    stats.parties_rows_joined_doc_id += 1;
    if (!isGrantorParty(row)) return;
    stats.parties_rows_grantor += 1;
    const party = projectPartyRow(row);
    const master = watchedDocs.get(docId)!;
    const legals = watchedDocLegals.get(docId);
    if (!legals || legals.length === 0) return; // Doc had no corridor-BBL Legals, skip
    for (const leg of legals) {
      const out = [
        master.doc_id, master.doc_type, master.category, master.document_date, master.recorded_datetime, master.document_amt,
        leg.bbl, leg.street_number, leg.street_name, leg.unit, leg.property_type,
        party.name, party.address_1, party.address_2, party.city, party.state, party.zip, party.country,
      ].map(escapeCsv).join(",");
      outStream.write(out + "\n");
      stats.output_records += 1;
      uniqueOwners.add(party.name.toLowerCase());
    }
  }, log, "parties");

  outStream.end();
  await new Promise((resolve) => outStream.on("finish", resolve));

  stats.unique_bbls = uniqueBbls.size;
  stats.unique_owners = uniqueOwners.size;
  stats.date_finished = new Date().toISOString();
  await fs.writeFile(args.manifest, JSON.stringify(stats, null, 2));

  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  log("");
  log("── ACRIS corridor ingest complete ──");
  log(`  Master rows seen:           ${stats.master_rows_seen.toLocaleString()}`);
  log(`    in Manhattan:             ${stats.master_rows_manhattan.toLocaleString()}`);
  log(`    seller-intent doc type:   ${stats.master_rows_seller_intent.toLocaleString()}`);
  log(`    in window (${args.windowDays}d):       ${stats.master_rows_in_window.toLocaleString()}`);
  log(`    KEPT:                     ${stats.master_rows_kept.toLocaleString()}`);
  log(`      lis pendens:            ${stats.master_by_category.lis_pendens.toLocaleString()}`);
  log(`      foreclosure:            ${stats.master_by_category.foreclosure.toLocaleString()}`);
  log(`      tax lien:               ${stats.master_by_category.tax_lien.toLocaleString()}`);
  log(`      estate / probate:       ${stats.master_by_category.estate.toLocaleString()}`);
  log(`  Legals rows seen:           ${stats.legals_rows_seen.toLocaleString()}`);
  log(`    joined to watched doc:    ${stats.legals_rows_joined_doc_id.toLocaleString()}`);
  log(`    in corridor:              ${stats.legals_rows_in_corridor.toLocaleString()}`);
  log(`  Parties rows seen:          ${stats.parties_rows_seen.toLocaleString()}`);
  log(`    joined to watched doc:    ${stats.parties_rows_joined_doc_id.toLocaleString()}`);
  log(`    grantor (party_type=1):   ${stats.parties_rows_grantor.toLocaleString()}`);
  log(`  OUTPUT records:             ${stats.output_records.toLocaleString()}`);
  log(`    unique BBLs:              ${stats.unique_bbls.toLocaleString()}`);
  log(`    unique owners:            ${stats.unique_owners.toLocaleString()}`);
  log(`  output:                     ${path.relative(REPO_ROOT, args.output)}`);
  log(`  manifest:                   ${path.relative(REPO_ROOT, args.manifest)}`);
  log(`  elapsed:                    ${elapsed}s`);
  log("");
}

main().catch((err) => {
  console.error("[acris-ingest] fatal:", err);
  process.exit(1);
});
