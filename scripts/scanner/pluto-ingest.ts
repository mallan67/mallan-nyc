#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/pluto-ingest.ts
 *
 * Streams a PLUTO CSV (NYC Department of City Planning), filters rows to
 * the Manhattan luxury corridor + residential/mixed land use + private
 * owner type, projects to ~30 useful columns, and writes the filtered set
 * to `data/scanner/pluto-corridor.csv` plus a manifest `pluto-manifest.json`.
 *
 * Source: https://www.nyc.gov/site/planning/data-maps/open-data/dwn-pluto-mappluto.page
 *   - Borough-level CSVs are available — Manhattan only is ~10% the size
 *     of the full city CSV. Use Manhattan-only when possible.
 *   - Latest version reference (header may vary slightly): PLUTO 24v3.
 *   - Naming convention: `MN_24v3_unclipped.csv` (Manhattan, version 24v3).
 *
 * Usage:
 *   npx tsx scripts/scanner/pluto-ingest.ts --input <path-to-pluto.csv>
 *   npx tsx scripts/scanner/pluto-ingest.ts --input <path> --sample 100
 *
 * Flags:
 *   --input <path>    Required. Path to a PLUTO CSV file (downloaded by hand).
 *   --output <path>   Optional. Default: data/scanner/pluto-corridor.csv
 *   --manifest <path> Optional. Default: data/scanner/pluto-manifest.json
 *   --sample <n>      Optional. After filtering, write first n rows to a
 *                     sibling `pluto-corridor.sample.csv` (committable).
 *   --quiet           Suppress per-100k progress chatter.
 *
 * Idempotent: re-running overwrites both output and manifest.
 *
 * Memory profile: streams line-by-line; constant memory regardless of input
 * size. PLUTO Manhattan CSV ~200MB, processes in 1-2 minutes on a laptop.
 */
import { promises as fs, createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import {
  emptyStats,
  processRow,
  PLUTO_PROJECTION_COLUMNS,
  type PlutoRow,
  type PlutoIngestStats,
  type ProcessRowResult,
} from "@/lib/scanner/pluto-filter";

const REPO_ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data", "scanner", "pluto-corridor.csv");
const DEFAULT_MANIFEST = path.join(REPO_ROOT, "data", "scanner", "pluto-manifest.json");

interface Args {
  input: string;
  output: string;
  manifest: string;
  sample: number;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    input: "",
    output: DEFAULT_OUTPUT,
    manifest: DEFAULT_MANIFEST,
    sample: 0,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") args.input = argv[++i] || "";
    else if (a === "--output") args.output = argv[++i] || args.output;
    else if (a === "--manifest") args.manifest = argv[++i] || args.manifest;
    else if (a === "--sample") args.sample = Number(argv[++i] || 0);
    else if (a === "--quiet") args.quiet = true;
  }
  return args;
}

/**
 * Tiny CSV parser tolerant of double-quoted fields containing commas.
 * PLUTO CSVs use this format. Returns the row's cells.
 */
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error("Usage: npx tsx scripts/scanner/pluto-ingest.ts --input <pluto.csv> [--output <out>] [--sample <n>]");
    console.error("");
    console.error("Get PLUTO CSV: https://www.nyc.gov/site/planning/data-maps/open-data/dwn-pluto-mappluto.page");
    console.error("Recommended: Manhattan-only borough CSV (smaller, faster).");
    process.exit(1);
  }

  const inputResolved = path.resolve(args.input);
  let inputStat;
  try {
    inputStat = await fs.stat(inputResolved);
  } catch {
    console.error(`[pluto-ingest] input not found: ${inputResolved}`);
    process.exit(1);
  }

  const log = args.quiet ? () => undefined : (msg: string) => console.log(msg);
  log(`[pluto-ingest] input: ${inputResolved} (${(inputStat.size / 1024 / 1024).toFixed(1)} MB)`);

  await ensureDir(args.output);
  await ensureDir(args.manifest);

  const stats: PlutoIngestStats = emptyStats(path.relative(REPO_ROOT, inputResolved));

  // Open output writer
  const outStream = createWriteStream(args.output, { encoding: "utf-8" });
  const sampleRows: string[] = [];

  // Write projected header
  const header = (PLUTO_PROJECTION_COLUMNS as readonly string[]).join(",") + "\n";
  outStream.write(header);
  if (args.sample > 0) sampleRows.push(header.trim());

  // Open input reader
  const inStream = createReadStream(inputResolved, { encoding: "utf-8" });
  const rl = createInterface({ input: inStream, crlfDelay: Infinity });

  let headerCols: string[] | null = null;
  let lineNum = 0;
  const tStart = Date.now();
  const uniqueOwners = new Set<string>();
  const uniqueAddresses = new Set<string>();

  for await (const rawLine of rl) {
    lineNum++;
    if (!headerCols) {
      headerCols = splitCsvLine(rawLine);
      // Verify we have the columns we need
      const required = ["BoroCode", "BBL", "Latitude", "Longitude", "OwnerName", "Address", "LandUse", "OwnerType"];
      const missing = required.filter((c) => !headerCols!.includes(c));
      if (missing.length > 0) {
        console.error(`[pluto-ingest] input CSV missing required columns: ${missing.join(", ")}`);
        outStream.end();
        process.exit(1);
      }
      log(`[pluto-ingest] CSV header has ${headerCols.length} columns`);
      continue;
    }

    const cells = splitCsvLine(rawLine);
    if (cells.length === 1 && cells[0] === "") continue;
    const row: PlutoRow = {};
    for (let i = 0; i < headerCols.length; i++) {
      row[headerCols[i]] = cells[i] ?? "";
    }

    const result: ProcessRowResult = processRow(row, stats);
    if (result.kept && result.projected) {
      const out = (PLUTO_PROJECTION_COLUMNS as readonly string[])
        .map((c) => escapeCsv(result.projected![c as keyof typeof result.projected] || ""))
        .join(",");
      outStream.write(out + "\n");
      uniqueOwners.add(result.projected.OwnerName.toLowerCase());
      uniqueAddresses.add(result.projected.Address.toLowerCase());
      if (args.sample > 0 && sampleRows.length <= args.sample) sampleRows.push(out);
    }

    if (!args.quiet && stats.rows_seen % 100000 === 0) {
      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
      log(`[pluto-ingest] ${stats.rows_seen.toLocaleString()} rows seen, ${stats.rows_kept.toLocaleString()} kept (${elapsed}s)`);
    }
  }

  outStream.end();
  await new Promise((resolve) => outStream.on("finish", resolve));

  stats.unique_owners_estimated = uniqueOwners.size;
  stats.unique_addresses_estimated = uniqueAddresses.size;
  stats.date_finished = new Date().toISOString();

  await fs.writeFile(args.manifest, JSON.stringify(stats, null, 2));

  if (args.sample > 0 && sampleRows.length > 1) {
    const sampleOut = path.join(path.dirname(args.output), "pluto-corridor.sample.csv");
    await fs.writeFile(sampleOut, sampleRows.join("\n") + "\n");
    log(`[pluto-ingest] sample (${sampleRows.length - 1} rows) → ${path.relative(REPO_ROOT, sampleOut)}`);
  }

  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  log("");
  log("── PLUTO ingest complete ──");
  log(`  source:                    ${path.relative(REPO_ROOT, inputResolved)}`);
  log(`  output:                    ${path.relative(REPO_ROOT, args.output)}`);
  log(`  manifest:                  ${path.relative(REPO_ROOT, args.manifest)}`);
  log(`  rows seen:                 ${stats.rows_seen.toLocaleString()}`);
  log(`  rows in Manhattan:         ${stats.rows_manhattan.toLocaleString()}`);
  log(`  rows in corridor:          ${stats.rows_corridor.toLocaleString()}`);
  log(`  rows residential/mixed:    ${stats.rows_residential_or_mixed.toLocaleString()}`);
  log(`  rows kept:                 ${stats.rows_kept.toLocaleString()}`);
  log(`  unique owners (est):       ${stats.unique_owners_estimated.toLocaleString()}`);
  log(`  unique addresses (est):    ${stats.unique_addresses_estimated.toLocaleString()}`);
  log(`  drops · outside Manhattan: ${stats.rows_dropped_outside_manhattan.toLocaleString()}`);
  log(`  drops · outside corridor:  ${stats.rows_dropped_outside_corridor.toLocaleString()}`);
  log(`  drops · non-residential:   ${stats.rows_dropped_non_residential.toLocaleString()}`);
  log(`  drops · gov/other owner:   ${stats.rows_dropped_government_owner.toLocaleString()}`);
  log(`  drops · bad geo:           ${stats.rows_dropped_bad_geo.toLocaleString()}`);
  log(`  elapsed:                   ${elapsed}s`);
  log("");
}

main().catch((err) => {
  console.error("[pluto-ingest] fatal:", err);
  process.exit(1);
});
