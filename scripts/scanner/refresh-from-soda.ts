#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/refresh-from-soda.ts
 *
 * One-command refresh of every Socrata-sourced ingest. Pulls PLUTO +
 * ACRIS (Master + Legals + Parties for distress signals AND deed history)
 * straight from NYC OpenData via the existing lib/soda.ts helper, applies
 * the same filters as the *-ingest.ts scripts, and writes the same
 * corridor-clipped CSVs to data/scanner/.
 *
 * After this runs, `npm run scanner:build-prospects` produces the
 * scored ranked queue.
 *
 * Required env vars (already in Vercel per Maya's setup):
 *   SODA_DATASET_PLUTO              (PLUTO dataset id)
 *   SODA_DATASET_ACRIS_MASTER       (Real Property Master dataset id)
 *   SODA_DATASET_ACRIS_REALPROPERTY (Real Property Legals dataset id)
 *   SODA_DATASET_ACRIS_PARTIES      (Real Property Parties — optional, defaults to 636b-3b5g)
 *   NYC_SODA_APP_TOKEN              (any of the names lib/soda.ts checks)
 *
 * Usage:
 *   npm run scanner:refresh-from-soda                  # all ingests
 *   npm run scanner:refresh-from-soda -- --only=pluto  # just PLUTO
 *   npm run scanner:refresh-from-soda -- --window-days=730 --quiet
 */
import { promises as fs, createWriteStream, type WriteStream } from "fs";
import path from "path";
import { iterateSoda, resolveDatasetId } from "@/scripts/scanner/lib/soda-paginator";
import { processRow as plutoProcess, emptyStats as plutoEmptyStats, PLUTO_PROJECTION_COLUMNS, type PlutoIngestStats, type PlutoRow } from "@/lib/scanner/pluto-filter";
import {
  emptyAcrisStats, processMasterRow, projectMasterRow, projectLegalsRow, projectPartyRow, isGrantorParty,
  emptyDeedHistoryStats, processDeedMasterRow, bblFromLegals, computeOwnershipDuration,
  type AcrisIngestStats, type AcrisRow, type DeedHistoryStats, type DeedHistoryEntry,
  type MasterDocSummary, type LegalsRowSummary,
} from "@/lib/scanner/acris-filter";
import { sodaTokenMasked } from "@/lib/soda";

const REPO_ROOT = process.cwd();
const D = (p: string) => path.join(REPO_ROOT, "data", "scanner", p);

interface Args {
  only: Set<string>;
  windowDays: number;
  deedWindowYears: number;
  pageSize: number;
  maxRows: number;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    only: new Set(),
    windowDays: 730,
    deedWindowYears: 50,
    pageSize: 10000,
    maxRows: Number.POSITIVE_INFINITY,
    quiet: false,
  };
  for (const a of argv) {
    if (a.startsWith("--only=")) {
      a.slice("--only=".length).split(",").forEach((s) => args.only.add(s.trim()));
    } else if (a.startsWith("--window-days=")) args.windowDays = Number(a.slice("--window-days=".length));
    else if (a.startsWith("--deed-window-years=")) args.deedWindowYears = Number(a.slice("--deed-window-years=".length));
    else if (a.startsWith("--page-size=")) args.pageSize = Number(a.slice("--page-size=".length));
    else if (a.startsWith("--max-rows=")) args.maxRows = Number(a.slice("--max-rows=".length));
    else if (a === "--quiet") args.quiet = true;
  }
  return args;
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

async function ensureDir(p: string) { await fs.mkdir(path.dirname(p), { recursive: true }); }

function makeLogger(quiet: boolean) {
  return quiet ? () => undefined : (msg: string) => console.log(msg);
}

interface RunSection {
  shouldRun: boolean;
}
function shouldRun(args: Args, key: string): boolean {
  if (args.only.size === 0) return true;
  return args.only.has(key) || args.only.has("all");
}

// ─── PLUTO ───────────────────────────────────────────────────────
async function refreshPluto(args: Args, log: (m: string) => void): Promise<void> {
  if (!shouldRun(args, "pluto")) return;
  const dataset = resolveDatasetId(["SODA_DATASET_PLUTO"]);
  if (!dataset) {
    log("[refresh-from-soda] PLUTO skipped — SODA_DATASET_PLUTO not set");
    return;
  }
  log(`[refresh-from-soda] PLUTO from ${dataset.id} (env: ${dataset.from})`);

  const outPath = D("pluto-corridor.csv");
  const manifestPath = D("pluto-manifest.json");
  await ensureDir(outPath);
  const out = createWriteStream(outPath, { encoding: "utf-8" });
  out.write((PLUTO_PROJECTION_COLUMNS as readonly string[]).join(",") + "\n");

  const stats: PlutoIngestStats = plutoEmptyStats(`soda:${dataset.id}`);
  const uniqueOwners = new Set<string>();
  const uniqueAddresses = new Set<string>();

  // PLUTO field for borough varies — try numeric borocode first
  const where = `borocode='1' OR borough='MN'`;

  for await (const raw of iterateSoda<Record<string, unknown>>({
    resource: dataset.id,
    where,
    pageSize: args.pageSize,
    maxRows: args.maxRows === Number.POSITIVE_INFINITY ? undefined : args.maxRows,
    onPage: (i) => log(`  PLUTO page offset=${i.offset} (+${i.pageRows}) total=${i.totalSoFar.toLocaleString()}`),
  })) {
    // Socrata returns lowercase keys; map to the casing the filter expects
    const row: PlutoRow = mapPlutoFromSoda(raw);
    const r = plutoProcess(row, stats);
    if (r.kept && r.projected) {
      const csv = (PLUTO_PROJECTION_COLUMNS as readonly string[])
        .map((c) => escapeCsv(r.projected![c as keyof typeof r.projected] || ""))
        .join(",");
      out.write(csv + "\n");
      uniqueOwners.add(r.projected.OwnerName.toLowerCase());
      uniqueAddresses.add(r.projected.Address.toLowerCase());
    }
  }
  out.end();
  await new Promise((r) => out.on("finish", r));

  stats.unique_owners_estimated = uniqueOwners.size;
  stats.unique_addresses_estimated = uniqueAddresses.size;
  stats.date_finished = new Date().toISOString();
  await fs.writeFile(manifestPath, JSON.stringify(stats, null, 2));
  log(`  PLUTO done — kept=${stats.rows_kept.toLocaleString()} of ${stats.rows_seen.toLocaleString()} (${path.relative(REPO_ROOT, outPath)})`);
}

function mapPlutoFromSoda(raw: Record<string, unknown>): PlutoRow {
  // Socrata typically lower-cases column names. Map to the PascalCase
  // names PLUTO ingest expects.
  const get = (...names: string[]): string => {
    for (const n of names) {
      const v = raw[n];
      if (v !== undefined && v !== null) return String(v);
      const lc = n.toLowerCase();
      if (raw[lc] !== undefined && raw[lc] !== null) return String(raw[lc]);
    }
    return "";
  };
  return {
    BBL: get("bbl", "BBL"),
    BoroCode: get("borocode", "boro_code", "boro"),
    Block: get("block"),
    Lot: get("lot"),
    Address: get("address"),
    ZipCode: get("zipcode", "zip_code"),
    OwnerName: get("ownername", "owner_name"),
    OwnerType: get("ownertype", "owner_type"),
    LandUse: get("landuse", "land_use"),
    BldgClass: get("bldgclass", "bldg_class"),
    UnitsRes: get("unitsres", "units_res"),
    UnitsTotal: get("unitstotal", "units_total"),
    YearBuilt: get("yearbuilt", "year_built"),
    YearAlter1: get("yearalter1", "year_alter_1"),
    YearAlter2: get("yearalter2", "year_alter_2"),
    AssessLand: get("assessland"),
    AssessTot: get("assesstot"),
    ExemptLand: get("exemptland"),
    ExemptTot: get("exempttot"),
    BuiltFAR: get("builtfar"),
    ResidFAR: get("residfar"),
    CommFAR: get("commfar"),
    Latitude: get("latitude"),
    Longitude: get("longitude"),
    CondoNo: get("condono", "condo_no"),
    HistDist: get("histdist", "hist_dist"),
    Landmark: get("landmark"),
    LotArea: get("lotarea", "lot_area"),
    BldgArea: get("bldgarea", "bldg_area"),
    NumFloors: get("numfloors", "num_floors"),
    ZoneDist1: get("zonedist1", "zone_dist1"),
  };
}

// ─── ACRIS distress + parties ─────────────────────────────────────
async function refreshAcris(args: Args, log: (m: string) => void): Promise<void> {
  if (!shouldRun(args, "acris")) return;
  const masterDs = resolveDatasetId(["SODA_DATASET_ACRIS_MASTER"]);
  const legalsDs = resolveDatasetId(["SODA_DATASET_ACRIS_REALPROPERTY", "SODA_DATASET_ACRIS_LEGALS"]);
  const partiesDs = resolveDatasetId(["SODA_DATASET_ACRIS_PARTIES"], "636b-3b5g");
  if (!masterDs || !legalsDs || !partiesDs) {
    log("[refresh-from-soda] ACRIS skipped — required dataset env vars missing");
    return;
  }
  log(`[refresh-from-soda] ACRIS Master/Legals/Parties from ${masterDs.id}/${legalsDs.id}/${partiesDs.id}`);

  // Load corridor BBL set if it exists
  let corridorBbls: Set<string> | null = null;
  try {
    const text = await fs.readFile(D("pluto-corridor.csv"), "utf-8");
    const lines = text.split("\n").slice(1);
    corridorBbls = new Set();
    for (const line of lines) {
      const cells = line.split(",");
      const bbl = (cells[0] || "").trim();
      if (bbl) corridorBbls.add(bbl);
    }
    log(`  corridor BBL clip: ${corridorBbls.size.toLocaleString()} BBLs`);
  } catch { /* no clip */ }

  // Pass 1: Master — pull only Manhattan distress doc types in window
  const watchedDocTypes = "'LP','LIS','LPND','LISPD','LISPENDENS','FORE','JDF','JDGMT_F','TAX','NOTL','NTOFL','NYSTAX','EATR','EXECUTOR','ADMIN','LBADM','ESTATE'";
  const cutoff = new Date(Date.now() - args.windowDays * 86400000).toISOString();
  const masterWhere = `recorded_borough='1' AND doc_type IN (${watchedDocTypes}) AND recorded_datetime > '${cutoff}'`;

  const stats: AcrisIngestStats = emptyAcrisStats({
    master: `soda:${masterDs.id}`,
    legals: `soda:${legalsDs.id}`,
    parties: `soda:${partiesDs.id}`,
    windowDays: args.windowDays,
  });

  const watchedDocs = new Map<string, MasterDocSummary>();
  for await (const raw of iterateSoda<Record<string, unknown>>({
    resource: masterDs.id,
    where: masterWhere,
    pageSize: args.pageSize,
  })) {
    const row = raw as AcrisRow;
    const r = processMasterRow(row, stats, args.windowDays);
    if (r.kept && r.category) watchedDocs.set(r.doc_id, projectMasterRow(row, r.category));
  }
  log(`  ACRIS Pass 1: ${watchedDocs.size.toLocaleString()} watched docs`);

  if (watchedDocs.size === 0) return;

  // Pass 2: Legals — only watched doc_ids (server-side filter)
  const docIds = [...watchedDocs.keys()];
  const watchedLegals = new Map<string, LegalsRowSummary[]>();
  const uniqueBbls = new Set<string>();
  // Socrata $where with a long IN clause has limits; chunk into batches.
  const CHUNK = 200;
  for (let i = 0; i < docIds.length; i += CHUNK) {
    const slice = docIds.slice(i, i + CHUNK);
    const inClause = slice.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    for await (const raw of iterateSoda<Record<string, unknown>>({
      resource: legalsDs.id,
      where: `document_id IN (${inClause})`,
      pageSize: args.pageSize,
    })) {
      const row = raw as AcrisRow;
      stats.legals_rows_seen += 1;
      const docId = (row.document_id as string || "").trim();
      if (!docId || !watchedDocs.has(docId)) continue;
      stats.legals_rows_joined_doc_id += 1;
      const proj = projectLegalsRow(row);
      if (!proj) continue;
      if (corridorBbls && !corridorBbls.has(proj.bbl)) continue;
      stats.legals_rows_in_corridor += 1;
      uniqueBbls.add(proj.bbl);
      const list = watchedLegals.get(docId) || [];
      list.push(proj);
      watchedLegals.set(docId, list);
    }
  }
  log(`  ACRIS Pass 2: ${stats.legals_rows_in_corridor.toLocaleString()} corridor-Legals · ${uniqueBbls.size.toLocaleString()} unique BBLs`);

  // Pass 3: Parties (grantors only) — only for kept doc_ids
  const outPath = D("acris-corridor-signals.csv");
  await ensureDir(outPath);
  const out = createWriteStream(outPath, { encoding: "utf-8" });
  const HEADER = [
    "doc_id", "doc_type", "category", "document_date", "recorded_datetime", "document_amt",
    "bbl", "street_number", "street_name", "unit", "property_type",
    "party_name", "party_address_1", "party_address_2", "party_city", "party_state", "party_zip", "party_country",
  ];
  out.write(HEADER.join(",") + "\n");

  const keptDocIds = [...watchedLegals.keys()];
  const uniqueOwners = new Set<string>();
  for (let i = 0; i < keptDocIds.length; i += CHUNK) {
    const slice = keptDocIds.slice(i, i + CHUNK);
    const inClause = slice.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    for await (const raw of iterateSoda<Record<string, unknown>>({
      resource: partiesDs.id,
      where: `document_id IN (${inClause}) AND party_type='1'`,
      pageSize: args.pageSize,
    })) {
      const row = raw as AcrisRow;
      stats.parties_rows_seen += 1;
      stats.parties_rows_joined_doc_id += 1;
      if (!isGrantorParty(row)) continue;
      stats.parties_rows_grantor += 1;
      const party = projectPartyRow(row);
      const master = watchedDocs.get(party.doc_id);
      const legals = watchedLegals.get(party.doc_id);
      if (!master || !legals) continue;
      for (const leg of legals) {
        const cells = [
          master.doc_id, master.doc_type, master.category, master.document_date, master.recorded_datetime, master.document_amt,
          leg.bbl, leg.street_number, leg.street_name, leg.unit, leg.property_type,
          party.name, party.address_1, party.address_2, party.city, party.state, party.zip, party.country,
        ].map(escapeCsv).join(",");
        out.write(cells + "\n");
        stats.output_records += 1;
        uniqueOwners.add(party.name.toLowerCase());
      }
    }
  }
  out.end();
  await new Promise((r) => out.on("finish", r));

  stats.unique_bbls = uniqueBbls.size;
  stats.unique_owners = uniqueOwners.size;
  stats.date_finished = new Date().toISOString();
  await fs.writeFile(D("acris-manifest.json"), JSON.stringify(stats, null, 2));
  log(`  ACRIS done — output ${stats.output_records.toLocaleString()} records · ${stats.unique_bbls.toLocaleString()} BBLs · ${stats.unique_owners.toLocaleString()} owners`);
}

// ─── ACRIS deed history ───────────────────────────────────────────
async function refreshDeedHistory(args: Args, log: (m: string) => void): Promise<void> {
  if (!shouldRun(args, "deeds")) return;
  const masterDs = resolveDatasetId(["SODA_DATASET_ACRIS_MASTER"]);
  const legalsDs = resolveDatasetId(["SODA_DATASET_ACRIS_REALPROPERTY", "SODA_DATASET_ACRIS_LEGALS"]);
  if (!masterDs || !legalsDs) {
    log("[refresh-from-soda] deed-history skipped — ACRIS dataset env vars missing");
    return;
  }
  log(`[refresh-from-soda] ACRIS deed history (window=${args.deedWindowYears}y)`);

  let corridorBbls: Set<string> | null = null;
  try {
    const text = await fs.readFile(D("pluto-corridor.csv"), "utf-8");
    corridorBbls = new Set();
    for (const line of text.split("\n").slice(1)) {
      const bbl = (line.split(",")[0] || "").trim();
      if (bbl) corridorBbls.add(bbl);
    }
  } catch { /* no clip */ }

  const windowDays = args.deedWindowYears * 365;
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  const stats: DeedHistoryStats = emptyDeedHistoryStats(windowDays);

  // Pass 1: Master — Manhattan deeds in window
  const masterWhere = `recorded_borough='1' AND doc_type LIKE 'DEED%' AND recorded_datetime > '${cutoff}'`;
  const watchedDocs = new Map<string, { recorded_datetime: string; document_amt: string; doc_type: string }>();
  for await (const raw of iterateSoda<Record<string, unknown>>({
    resource: masterDs.id,
    where: masterWhere,
    pageSize: args.pageSize,
  })) {
    const row = raw as AcrisRow;
    const r = processDeedMasterRow(row, stats, windowDays);
    if (r.kept) watchedDocs.set(r.doc_id, { recorded_datetime: r.recorded_datetime, document_amt: r.document_amt, doc_type: r.doc_type });
  }
  log(`  deed-history Pass 1: ${watchedDocs.size.toLocaleString()} watched deeds`);

  if (watchedDocs.size === 0) return;

  // Pass 2: Legals — join doc_id + corridor clip
  const outPath = D("acris-deed-history.csv");
  const durPath = D("ownership-duration.csv");
  await ensureDir(outPath);
  const out = createWriteStream(outPath, { encoding: "utf-8" });
  out.write("bbl,doc_id,doc_type,recorded_datetime,document_amt\n");

  const entries: DeedHistoryEntry[] = [];
  const docIds = [...watchedDocs.keys()];
  const CHUNK = 200;
  for (let i = 0; i < docIds.length; i += CHUNK) {
    const slice = docIds.slice(i, i + CHUNK);
    const inClause = slice.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    for await (const raw of iterateSoda<Record<string, unknown>>({
      resource: legalsDs.id,
      where: `document_id IN (${inClause})`,
      pageSize: args.pageSize,
    })) {
      const row = raw as AcrisRow;
      stats.legals_rows_seen += 1;
      const docId = (row.document_id as string || "").trim();
      if (!docId) continue;
      const watched = watchedDocs.get(docId);
      if (!watched) continue;
      const bbl = bblFromLegals(row);
      if (!bbl) continue;
      if (corridorBbls && !corridorBbls.has(bbl)) continue;
      stats.legals_rows_kept += 1;
      const entry: DeedHistoryEntry = {
        bbl, doc_id: docId, doc_type: watched.doc_type,
        recorded_datetime: watched.recorded_datetime, document_amt: watched.document_amt,
      };
      entries.push(entry);
      out.write([entry.bbl, entry.doc_id, entry.doc_type, entry.recorded_datetime, entry.document_amt].map(escapeCsv).join(",") + "\n");
    }
  }
  out.end();
  await new Promise((r) => out.on("finish", r));

  // Derive duration
  const dur = computeOwnershipDuration(entries);
  stats.unique_bbls = dur.size;
  const durOut: WriteStream = createWriteStream(durPath, { encoding: "utf-8" });
  durOut.write("bbl,years_since_last_deed\n");
  for (const [bbl, years] of dur) durOut.write(`${bbl},${years}\n`);
  durOut.end();
  await new Promise((r) => durOut.on("finish", r));

  stats.date_finished = new Date().toISOString();
  await fs.writeFile(D("acris-deed-history-manifest.json"), JSON.stringify(stats, null, 2));
  log(`  deed-history done — ${stats.unique_bbls.toLocaleString()} BBLs with duration`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = makeLogger(args.quiet);
  const tStart = Date.now();

  log("[refresh-from-soda] starting NYC OpenData refresh");
  log(`  app token: ${sodaTokenMasked() || "(not configured — anonymous, throttled)"}`);
  log(`  window: ${args.windowDays}d (deeds: ${args.deedWindowYears}y)`);
  log(`  scope: ${args.only.size === 0 ? "all" : [...args.only].join(", ")}`);
  log("");

  // PLUTO must run first if ACRIS is downstream — it produces the corridor BBL set
  await refreshPluto(args, log);
  await refreshAcris(args, log);
  await refreshDeedHistory(args, log);

  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  log("");
  log(`[refresh-from-soda] complete in ${elapsed}s`);
  log(`  Next: npm run scanner:dof-tax-ingest -- --input <dof.csv>  (DOF lien-sale not on Socrata yet)`);
  log(`  Next: npm run scanner:dos-corp-ingest -- --input <dos.csv> (NY DOS not in NYC OpenData)`);
  log(`  Then: npm run scanner:build-prospects`);
}

main().catch((err) => {
  console.error("[refresh-from-soda] fatal:", err);
  process.exit(1);
});
