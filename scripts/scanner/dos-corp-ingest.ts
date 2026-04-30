#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/dos-corp-ingest.ts
 *
 * Streams a NY State DOS Corporation database CSV (Active or Inactive
 * dataset), filters to NYC-relevant entities (NYC county OR NYC process
 * address), and writes a flat CSV keyed by entity name plus a manifest.
 *
 * Source: NY Open Data
 *   Active:   https://data.ny.gov/Economic-Development/Active-Corporations-Beginning-1800/n9v6-gdxe
 *   Inactive: separate dataset, same column shape
 *
 * Output: data/scanner/dos-corp-corridor.csv (gitignored — runtime data).
 *
 * Usage:
 *   npx tsx scripts/scanner/dos-corp-ingest.ts --input <dos-corp.csv>
 *   npx tsx scripts/scanner/dos-corp-ingest.ts --input <path> --sample 100
 *
 * Idempotent — re-run overwrites output + manifest. Constant memory.
 *
 * Note: this dataset is ~1M rows total NYS. Pre-filter with Socrata SoQL
 * if download size is an issue:
 *   ?$where=county in('NEW YORK','KINGS','QUEENS','BRONX','RICHMOND')&$limit=2000000
 */
import { promises as fs, createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import {
  emptyDosCorpStats,
  processRow,
  DOS_CORP_PROJECTION_COLUMNS,
  type DosCorpRow,
  type DosCorpIngestStats,
} from "@/lib/scanner/dos-corp-filter";

const REPO_ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(REPO_ROOT, "data", "scanner", "dos-corp-corridor.csv");
const DEFAULT_MANIFEST = path.join(REPO_ROOT, "data", "scanner", "dos-corp-manifest.json");

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
  const log = args.quiet ? () => undefined : (msg: string) => console.log(msg);

  if (!args.input) {
    console.error("Usage: npx tsx scripts/scanner/dos-corp-ingest.ts --input <dos-corp.csv>");
    console.error("");
    console.error("Active corp dataset: https://data.ny.gov/Economic-Development/Active-Corporations-Beginning-1800/n9v6-gdxe");
    console.error("Pre-filter recommended:");
    console.error("  https://data.ny.gov/resource/n9v6-gdxe.csv?$where=county%20in('NEW YORK','KINGS','QUEENS','BRONX','RICHMOND')&$limit=2000000");
    process.exit(1);
  }

  const inputResolved = path.resolve(args.input);
  let inputStat;
  try {
    inputStat = await fs.stat(inputResolved);
  } catch {
    console.error(`[dos-corp-ingest] input not found: ${inputResolved}`);
    process.exit(1);
  }
  log(`[dos-corp-ingest] input: ${inputResolved} (${(inputStat.size / 1024 / 1024).toFixed(1)} MB)`);

  await ensureDir(args.output);
  await ensureDir(args.manifest);

  const stats: DosCorpIngestStats = emptyDosCorpStats(path.relative(REPO_ROOT, inputResolved));

  const outStream = createWriteStream(args.output, { encoding: "utf-8" });
  const sampleRows: string[] = [];
  const header = (DOS_CORP_PROJECTION_COLUMNS as readonly string[]).join(",") + "\n";
  outStream.write(header);
  if (args.sample > 0) sampleRows.push(header.trim());

  const inStream = createReadStream(inputResolved, { encoding: "utf-8" });
  const rl = createInterface({ input: inStream, crlfDelay: Infinity });
  let headerCols: string[] | null = null;
  let lineNum = 0;
  const tStart = Date.now();
  const uniqueNames = new Set<string>();

  for await (const rawLine of rl) {
    lineNum++;
    if (!headerCols) {
      headerCols = splitCsvLine(rawLine).map((h) => h.trim());
      const required = ["dos_id", "current_entity_name"];
      const found = headerCols.map((c) => c.toLowerCase().replace(/\s+/g, "_"));
      const missing = required.filter((r) => !found.some((f) => f === r || f === r.replace("_", "")));
      if (missing.length > 0) {
        // Allow missing — DOS data often uses Title Case headers like "DOS ID" / "Current Entity Name"
        log(`[dos-corp-ingest] note: required cols not found in canonical form (${missing.join(", ")}); falling through to title-case lookup`);
      }
      log(`[dos-corp-ingest] CSV header has ${headerCols.length} columns`);
      continue;
    }
    const cells = splitCsvLine(rawLine);
    if (cells.length === 1 && cells[0] === "") continue;
    const row: DosCorpRow = {};
    for (let i = 0; i < headerCols.length; i++) {
      row[headerCols[i]] = cells[i] ?? "";
    }
    const result = processRow(row, stats);
    if (result.kept && result.projected) {
      const out = (DOS_CORP_PROJECTION_COLUMNS as readonly string[])
        .map((c) => escapeCsv(result.projected![c as keyof typeof result.projected] || ""))
        .join(",");
      outStream.write(out + "\n");
      uniqueNames.add(result.projected.normalized_name);
      if (args.sample > 0 && sampleRows.length <= args.sample) sampleRows.push(out);
    }

    if (!args.quiet && stats.rows_seen % 100000 === 0) {
      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
      log(`[dos-corp-ingest] ${stats.rows_seen.toLocaleString()} rows seen, ${stats.rows_kept.toLocaleString()} kept (${elapsed}s)`);
    }
  }

  outStream.end();
  await new Promise((resolve) => outStream.on("finish", resolve));

  stats.unique_entity_names_estimated = uniqueNames.size;
  stats.date_finished = new Date().toISOString();
  await fs.writeFile(args.manifest, JSON.stringify(stats, null, 2));

  if (args.sample > 0 && sampleRows.length > 1) {
    const sampleOut = path.join(path.dirname(args.output), "dos-corp-corridor.sample.csv");
    await fs.writeFile(sampleOut, sampleRows.join("\n") + "\n");
    log(`[dos-corp-ingest] sample (${sampleRows.length - 1} rows) → ${path.relative(REPO_ROOT, sampleOut)}`);
  }

  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  log("");
  log("── DOS Corp ingest complete ──");
  log(`  source:                       ${path.relative(REPO_ROOT, inputResolved)}`);
  log(`  output:                       ${path.relative(REPO_ROOT, args.output)}`);
  log(`  manifest:                     ${path.relative(REPO_ROOT, args.manifest)}`);
  log(`  rows seen:                    ${stats.rows_seen.toLocaleString()}`);
  log(`  rows kept (NYC-relevant):     ${stats.rows_kept.toLocaleString()}`);
  log(`    Manhattan county:           ${stats.rows_kept_manhattan_county.toLocaleString()}`);
  log(`    other NYC county:           ${stats.rows_kept_other_nyc_county.toLocaleString()}`);
  log(`    NYC process address only:   ${stats.rows_kept_nyc_process_only.toLocaleString()}`);
  log(`    active:                     ${stats.rows_kept_active.toLocaleString()}`);
  log(`    inactive (dissolved/etc):   ${stats.rows_kept_inactive.toLocaleString()}`);
  log(`  drops · non-NYC:              ${stats.rows_dropped_non_nyc.toLocaleString()}`);
  log(`  drops · irrelevant type:      ${stats.rows_dropped_irrelevant_type.toLocaleString()}`);
  log(`  unique entity names (est):    ${stats.unique_entity_names_estimated.toLocaleString()}`);
  log(`  elapsed:                      ${elapsed}s`);
  log("");
}

main().catch((err) => {
  console.error("[dos-corp-ingest] fatal:", err);
  process.exit(1);
});
