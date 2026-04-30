#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/dof-tax-ingest.ts
 *
 * Streaming ingest of NYC DOF Property Tax Lien Sale list.
 * Filters to Manhattan + corridor BBLs, projects, writes flat CSV +
 * manifest.
 *
 * Source: NYC OpenData (look up the latest annual lien-sale list)
 *
 * Usage:
 *   npx tsx scripts/scanner/dof-tax-ingest.ts --input <dof.csv>
 *   npx tsx scripts/scanner/dof-tax-ingest.ts --input <dof.csv> --corridor-bbls data/scanner/pluto-corridor.csv
 */
import { promises as fs, createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import {
  emptyDofTaxStats,
  processRow,
  type DofTaxRow,
  type DofTaxIngestStats,
} from "@/lib/scanner/dof-tax-filter";

const REPO_ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data", "scanner", "dof-tax-corridor.csv");
const DEFAULT_MANIFEST = path.join(REPO_ROOT, "data", "scanner", "dof-tax-manifest.json");
const DEFAULT_CORRIDOR = path.join(REPO_ROOT, "data", "scanner", "pluto-corridor.csv");

interface Args {
  input: string;
  output: string;
  manifest: string;
  corridorBbls: string;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    input: "", output: DEFAULT_OUTPUT, manifest: DEFAULT_MANIFEST,
    corridorBbls: DEFAULT_CORRIDOR, quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") args.input = argv[++i] || "";
    else if (a === "--output") args.output = argv[++i] || args.output;
    else if (a === "--manifest") args.manifest = argv[++i] || args.manifest;
    else if (a === "--corridor-bbls") args.corridorBbls = argv[++i] || args.corridorBbls;
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

async function loadCorridorBbls(filePath: string, log: (m: string) => void): Promise<Set<string> | null> {
  try { await fs.stat(filePath); } catch {
    log(`[dof-tax-ingest] corridor-bbls not found at ${path.relative(REPO_ROOT, filePath)} — accepting all Manhattan BBLs`);
    return null;
  }
  const bbls = new Set<string>();
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf-8" }), crlfDelay: Infinity });
  let header: string[] | null = null;
  let bblCol = -1;
  for await (const raw of rl) {
    if (!header) {
      header = splitCsvLine(raw).map((h) => h.trim());
      bblCol = header.indexOf("BBL");
      if (bblCol < 0) return null;
      continue;
    }
    const cells = splitCsvLine(raw);
    const bbl = (cells[bblCol] || "").trim();
    if (bbl) bbls.add(bbl);
  }
  log(`[dof-tax-ingest] corridor BBL set loaded (${bbls.size.toLocaleString()})`);
  return bbls;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = args.quiet ? () => undefined : (m: string) => console.log(m);
  if (!args.input) {
    console.error("Usage: npx tsx scripts/scanner/dof-tax-ingest.ts --input <dof.csv>");
    console.error("  Look up the latest annual lien-sale list at https://data.cityofnewyork.us/browse?q=tax+lien+sale");
    process.exit(1);
  }
  const inputResolved = path.resolve(args.input);
  try { await fs.stat(inputResolved); } catch {
    console.error(`[dof-tax-ingest] input not found: ${inputResolved}`);
    process.exit(1);
  }

  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.mkdir(path.dirname(args.manifest), { recursive: true });

  const corridor = await loadCorridorBbls(path.resolve(args.corridorBbls), log);
  const stats: DofTaxIngestStats = emptyDofTaxStats({
    source: path.relative(REPO_ROOT, inputResolved),
    corridorSize: corridor?.size ?? null,
  });

  const out = createWriteStream(args.output, { encoding: "utf-8" });
  const HEADER = [
    "bbl","address","owner_name","lien_type","lien_category",
    "lien_amount","sale_date","list_date","status",
  ];
  out.write(HEADER.join(",") + "\n");

  const rl = createInterface({ input: createReadStream(inputResolved, { encoding: "utf-8" }), crlfDelay: Infinity });
  let header: string[] | null = null;
  let lineNum = 0;
  const tStart = Date.now();
  const uniqueBbls = new Set<string>();

  for await (const raw of rl) {
    lineNum++;
    if (!header) { header = splitCsvLine(raw).map((h) => h.trim()); continue; }
    const cells = splitCsvLine(raw);
    if (cells.length === 1 && cells[0] === "") continue;
    const row: DofTaxRow = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    const r = processRow(row, stats, corridor);
    if (r.kept && r.signal) {
      uniqueBbls.add(r.signal.bbl);
      out.write(HEADER.map((h) => escapeCsv((r.signal as Record<string, string>)[h] || "")).join(",") + "\n");
    }
  }

  out.end();
  await new Promise((r) => out.on("finish", r));
  stats.unique_bbls = uniqueBbls.size;
  stats.date_finished = new Date().toISOString();
  await fs.writeFile(args.manifest, JSON.stringify(stats, null, 2));

  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  log("");
  log("── DOF tax-lien-sale ingest complete ──");
  log(`  rows seen:           ${stats.rows_seen.toLocaleString()}`);
  log(`  rows kept:           ${stats.rows_kept.toLocaleString()}`);
  log(`    property_tax:      ${stats.by_lien_category.property_tax.toLocaleString()}`);
  log(`    water_sewer:       ${stats.by_lien_category.water_sewer.toLocaleString()}`);
  log(`    emergency_repair:  ${stats.by_lien_category.emergency_repair.toLocaleString()}`);
  log(`    other:             ${stats.by_lien_category.other.toLocaleString()}`);
  log(`  drops · bad_bbl:     ${stats.rows_dropped_bad_bbl.toLocaleString()}`);
  log(`  drops · non-MN:      ${stats.rows_dropped_non_manhattan.toLocaleString()}`);
  log(`  drops · corridor:    ${stats.rows_dropped_outside_corridor.toLocaleString()}`);
  log(`  unique BBLs:         ${stats.unique_bbls.toLocaleString()}`);
  log(`  elapsed:             ${elapsed}s`);
  log(`  output:              ${path.relative(REPO_ROOT, args.output)}`);
}

main().catch((err) => {
  console.error("[dof-tax-ingest] fatal:", err);
  process.exit(1);
});
