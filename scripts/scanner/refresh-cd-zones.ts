#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/refresh-cd-zones.ts
 *
 * Fetches the currently-active NY DOS Cease & Desist Real Estate
 * Solicitation Zones and updates `data/scanner/compliance/nyc-dos-cease-desist-zones.json`.
 *
 * NY DOS does not publish a clean GeoJSON feed for these zones — they're
 * announced as PDF rulings + ZIP-code lists per renewal cycle. This script:
 *   1. Logs the current source URL + last captured_at
 *   2. Prompts the operator to manually download the latest list
 *   3. Provides a converter from the operator's input (CSV or hand-entered
 *      ZIP codes) into a GeoJSON FeatureCollection compatible with the
 *      existing data file shape
 *
 * Until NY DOS exposes machine-readable data, this is a human-in-the-loop
 * process. The script's job is to make the human's job repeatable and to
 * version-control the results.
 *
 * Usage:
 *   npx tsx scripts/scanner/refresh-cd-zones.ts
 *   npx tsx scripts/scanner/refresh-cd-zones.ts --import path/to/zips.csv
 *   npx tsx scripts/scanner/refresh-cd-zones.ts --check
 */
import { promises as fs } from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), "data", "scanner", "compliance", "nyc-dos-cease-desist-zones.json");
const SOURCE_URL = "https://dos.ny.gov/real-estate-cease-and-desist-zones";

async function readFile() {
  const raw = await fs.readFile(FILE_PATH, "utf-8");
  return JSON.parse(raw);
}

async function checkCmd() {
  const f = await readFile();
  console.log(`\n── NY DOS C&D Zones cache ──`);
  console.log(`File:           ${path.relative(process.cwd(), FILE_PATH)}`);
  console.log(`Source URL:     ${SOURCE_URL}`);
  console.log(`Captured at:    ${f.captured_at}`);
  console.log(`Active through: ${f.active_through}`);
  console.log(`Active zones:   ${(f.features || []).length}`);
  if ((f.features || []).length > 0) {
    console.log(`\nLoaded zones:`);
    for (const z of f.features) {
      console.log(`  - ${z.properties?.name} (${z.properties?.boro || "boro?"}, id=${z.id})`);
    }
  } else {
    console.log(`\nNo zones loaded. Refresh by visiting ${SOURCE_URL} and running with --import.`);
  }
  console.log("");
}

async function importCmd(_csvPath: string) {
  console.log(`\n── Import not yet implemented ──`);
  console.log(`The CSV → GeoJSON converter is a stub. To wire it up:`);
  console.log(`  1. Visit ${SOURCE_URL}`);
  console.log(`  2. Download the latest zone definition (PDF or ZIP-code list)`);
  console.log(`  3. For each zone: collect (zone_name, boro, ZIP codes OR neighborhood polygon)`);
  console.log(`  4. Convert ZIP codes → polygon by joining against NYC ZIP-code GeoJSON`);
  console.log(`     (data/manhattan-neighborhoods.json + sibling files have building polygons;`);
  console.log(`      ZIP-level polygons need a separate dataset like NYC OpenData "ZIP Code Boundaries")`);
  console.log(`  5. Write the resulting FeatureCollection to ${FILE_PATH}`);
  console.log(`\nCurrent best practice: edit the JSON file by hand, commit the diff, run --check.\n`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--check") || argv.length === 0) {
    await checkCmd();
    return;
  }
  const importIdx = argv.indexOf("--import");
  if (importIdx >= 0 && argv[importIdx + 1]) {
    await importCmd(argv[importIdx + 1]);
    return;
  }
  console.error(`Usage:`);
  console.error(`  npx tsx scripts/scanner/refresh-cd-zones.ts [--check]`);
  console.error(`  npx tsx scripts/scanner/refresh-cd-zones.ts --import <csv-path>`);
  process.exit(1);
}

main().catch((err) => {
  console.error("[refresh-cd-zones] fatal:", err);
  process.exit(1);
});
