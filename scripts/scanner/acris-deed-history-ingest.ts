#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/acris-deed-history-ingest.ts
 *
 * Two-pass streaming join: ACRIS Master + Legals filtered to DEED doc
 * types. Output: one row per (deed-doc, BBL) tuple. Then a derived
 * `ownership-duration.csv` with the most-recent deed per BBL converted
 * into years-since-last-transfer, ready to feed into the aggregator.
 *
 * Source: NYC OpenData ACRIS Master + Legals (same datasets as acris-ingest.ts)
 *
 * Usage:
 *   npx tsx scripts/scanner/acris-deed-history-ingest.ts \
 *     --master <master.csv> --legals <legals.csv> \
 *     [--corridor-bbls data/scanner/pluto-corridor.csv] \
 *     [--window-years 50]
 */
import { promises as fs, createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import {
  emptyDeedHistoryStats,
  processDeedMasterRow,
  bblFromLegals,
  computeOwnershipDuration,
  type AcrisRow,
  type DeedHistoryEntry,
} from "@/lib/scanner/acris-filter";

const REPO_ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data", "scanner", "acris-deed-history.csv");
const DEFAULT_DURATION = path.join(REPO_ROOT, "data", "scanner", "ownership-duration.csv");
const DEFAULT_MANIFEST = path.join(REPO_ROOT, "data", "scanner", "acris-deed-history-manifest.json");
const DEFAULT_CORRIDOR = path.join(REPO_ROOT, "data", "scanner", "pluto-corridor.csv");

interface Args {
  master: string;
  legals: string;
  output: string;
  durationOutput: string;
  manifest: string;
  corridorBbls: string;
  windowYears: number;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    master: "", legals: "",
    output: DEFAULT_OUTPUT, durationOutput: DEFAULT_DURATION,
    manifest: DEFAULT_MANIFEST, corridorBbls: DEFAULT_CORRIDOR,
    windowYears: 50, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--master") args.master = argv[++i] || "";
    else if (a === "--legals") args.legals = argv[++i] || "";
    else if (a === "--output") args.output = argv[++i] || args.output;
    else if (a === "--duration-output") args.durationOutput = argv[++i] || args.durationOutput;
    else if (a === "--manifest") args.manifest = argv[++i] || args.manifest;
    else if (a === "--corridor-bbls") args.corridorBbls = argv[++i] || args.corridorBbls;
    else if (a === "--window-years") args.windowYears = Number(argv[++i] || 50);
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
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
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

async function streamCsv(filePath: string, onRow: (row: AcrisRow) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf-8" }), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const raw of rl) {
    if (!header) { header = splitCsvLine(raw).map((h) => h.trim()); continue; }
    const cells = splitCsvLine(raw);
    if (cells.length === 1 && cells[0] === "") continue;
    const row: AcrisRow = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    onRow(row);
  }
}

async function loadCorridorBbls(filePath: string, log: (m: string) => void): Promise<Set<string> | null> {
  try { await fs.stat(filePath); } catch {
    log(`[deed-history] corridor-bbls not found — accepting all Manhattan BBLs`);
    return null;
  }
  const bbls = new Set<string>();
  await streamCsv(filePath, (row) => {
    const bbl = (row.BBL || row.bbl || "").trim();
    if (bbl) bbls.add(bbl);
  });
  log(`[deed-history] corridor BBL set loaded (${bbls.size.toLocaleString()})`);
  return bbls;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = args.quiet ? () => undefined : (m: string) => console.log(m);
  if (!args.master || !args.legals) {
    console.error("Usage: npx tsx scripts/scanner/acris-deed-history-ingest.ts --master <master.csv> --legals <legals.csv>");
    process.exit(1);
  }
  for (const p of [args.master, args.legals]) {
    try { await fs.stat(path.resolve(p)); }
    catch { console.error(`[deed-history] input not found: ${p}`); process.exit(1); }
  }

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.mkdir(path.dirname(args.durationOutput), { recursive: true });
  await fs.mkdir(path.dirname(args.manifest), { recursive: true });

  const corridor = await loadCorridorBbls(path.resolve(args.corridorBbls), log);
  const windowDays = args.windowYears * 365;
  const stats = emptyDeedHistoryStats(windowDays);

  // Pass 1: Master
  log("[deed-history] Pass 1: streaming Master");
  const watchedDocs = new Map<string, { recorded_datetime: string; document_amt: string; doc_type: string }>();
  await streamCsv(path.resolve(args.master), (row) => {
    const r = processDeedMasterRow(row, stats, windowDays);
    if (r.kept) watchedDocs.set(r.doc_id, { recorded_datetime: r.recorded_datetime, document_amt: r.document_amt, doc_type: r.doc_type });
  });
  log(`[deed-history] Pass 1 complete: ${watchedDocs.size.toLocaleString()} watched deeds of ${stats.master_rows_seen.toLocaleString()} master rows`);

  // Pass 2: Legals — emit (doc, BBL) entries when both BBL is corridor + doc is watched
  log("[deed-history] Pass 2: streaming Legals");
  const out = createWriteStream(args.output, { encoding: "utf-8" });
  const HEADER = ["bbl", "doc_id", "doc_type", "recorded_datetime", "document_amt"];
  out.write(HEADER.join(",") + "\n");
  const entries: DeedHistoryEntry[] = [];

  await streamCsv(path.resolve(args.legals), (row) => {
    stats.legals_rows_seen += 1;
    const docId = (row.document_id || row.DOCUMENT_ID || "").trim();
    if (!docId) return;
    const watched = watchedDocs.get(docId);
    if (!watched) return;
    const bbl = bblFromLegals(row);
    if (!bbl) return;
    if (corridor && !corridor.has(bbl)) return;
    stats.legals_rows_kept += 1;
    const entry: DeedHistoryEntry = {
      bbl,
      doc_id: docId,
      doc_type: watched.doc_type,
      recorded_datetime: watched.recorded_datetime,
      document_amt: watched.document_amt,
    };
    entries.push(entry);
    out.write([entry.bbl, entry.doc_id, entry.doc_type, entry.recorded_datetime, entry.document_amt].map(escapeCsv).join(",") + "\n");
  });
  out.end();
  await new Promise((r) => out.on("finish", r));

  // Pass 3: derive ownership_duration_years per BBL
  const dur = computeOwnershipDuration(entries);
  stats.unique_bbls = dur.size;
  const durOut = createWriteStream(args.durationOutput, { encoding: "utf-8" });
  durOut.write("bbl,years_since_last_deed\n");
  for (const [bbl, years] of dur) {
    durOut.write(`${bbl},${years}\n`);
  }
  durOut.end();
  await new Promise((r) => durOut.on("finish", r));

  stats.date_finished = new Date().toISOString();
  await fs.writeFile(args.manifest, JSON.stringify(stats, null, 2));

  log("");
  log("── ACRIS deed-history ingest complete ──");
  log(`  master rows seen:           ${stats.master_rows_seen.toLocaleString()}`);
  log(`  Manhattan deeds:            ${stats.master_rows_manhattan_deeds.toLocaleString()}`);
  log(`  in ${args.windowYears}y window:           ${stats.master_rows_in_window.toLocaleString()}`);
  log(`  legals rows seen:           ${stats.legals_rows_seen.toLocaleString()}`);
  log(`  legals rows kept:           ${stats.legals_rows_kept.toLocaleString()}`);
  log(`  unique BBLs with duration:  ${stats.unique_bbls.toLocaleString()}`);
  log(`  deed history:               ${path.relative(REPO_ROOT, args.output)}`);
  log(`  ownership duration:         ${path.relative(REPO_ROOT, args.durationOutput)}`);
}

main().catch((err) => {
  console.error("[deed-history] fatal:", err);
  process.exit(1);
});
