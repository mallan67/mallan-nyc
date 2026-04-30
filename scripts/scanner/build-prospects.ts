#!/usr/bin/env -S npx tsx
/**
 * scripts/scanner/build-prospects.ts
 *
 * End-to-end runner. Loads:
 *   - data/scanner/pluto-corridor.csv     (PLUTO ingest output)
 *   - data/scanner/acris-corridor-signals.csv (ACRIS distress ingest)
 *   - data/scanner/dos-corp-corridor.csv  (DOS Corp ingest)
 *   - data/scanner/dof-tax-corridor.csv   (DOF lien-sale ingest)
 *   - data/scanner/ownership-duration.csv (deed-history derived)
 *
 * Optionally fetches off-market signals from Prisma (Listing model) and
 * computes per-BBL relist counts from the same data.
 *
 * Pipes everything through buildProspects() → scoreProspects() and
 * writes:
 *   - data/scanner/scored-prospects.json (full per-prospect detail with
 *     reasons + audit trail — what the API endpoint serves)
 *   - data/scanner/scored-prospects.csv  (flat row-per-prospect for
 *     spreadsheet review)
 *   - data/scanner/build-prospects-manifest.json (run stats)
 *
 * Usage:
 *   npx tsx scripts/scanner/build-prospects.ts
 *   npx tsx scripts/scanner/build-prospects.ts --no-prisma   # skip DB read
 *   npx tsx scripts/scanner/build-prospects.ts --top 100     # only top N
 *   npx tsx scripts/scanner/build-prospects.ts --surface-all # include below-threshold
 *
 * Designed to be idempotent + safe to re-run.
 */
import { promises as fs, createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import path from "path";
import { buildProspects, summarizeAggregator, type AcrisOutputRow, type AggregatorInput, type OffMarketInputRow } from "@/lib/scanner/aggregator/build-prospects";
import { scoreProspects } from "@/lib/scanner/scoring/scorer";
import type { ScoringConfig } from "@/lib/scanner/scoring/types";
import type { PlutoProjected } from "@/lib/scanner/pluto-filter";
import type { DosCorpProjected } from "@/lib/scanner/dos-corp-filter";
import type { DofTaxLienSignalRef } from "@/lib/scanner/scoring/types";

const REPO_ROOT = process.cwd();
const D = (p: string) => path.join(REPO_ROOT, "data", "scanner", p);

const PLUTO_PATH = D("pluto-corridor.csv");
const ACRIS_PATH = D("acris-corridor-signals.csv");
const DOS_PATH = D("dos-corp-corridor.csv");
const DOF_PATH = D("dof-tax-corridor.csv");
const DURATION_PATH = D("ownership-duration.csv");
const OUTPUT_JSON = D("scored-prospects.json");
const OUTPUT_CSV = D("scored-prospects.csv");
const MANIFEST = D("build-prospects-manifest.json");

interface Args {
  noPrisma: boolean;
  top: number;
  surfaceAll: boolean;
  quiet: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { noPrisma: false, top: 0, surfaceAll: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-prisma") args.noPrisma = true;
    else if (a === "--top") args.top = Number(argv[++i] || 0);
    else if (a === "--surface-all") args.surfaceAll = true;
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

async function loadCsvAsRows<T extends Record<string, string>>(filePath: string): Promise<T[]> {
  const out: T[] = [];
  try { await fs.stat(filePath); } catch { return out; }
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "utf-8" }), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const raw of rl) {
    if (!header) { header = splitCsvLine(raw).map((h) => h.trim()); continue; }
    const cells = splitCsvLine(raw);
    if (cells.length === 1 && cells[0] === "") continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    out.push(row as T);
  }
  return out;
}

async function loadOwnershipDuration(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  try { await fs.stat(DURATION_PATH); } catch { return out; }
  const rl = createInterface({ input: createReadStream(DURATION_PATH, { encoding: "utf-8" }), crlfDelay: Infinity });
  let header: string[] | null = null;
  let bblCol = 0;
  let yearsCol = 1;
  for await (const raw of rl) {
    if (!header) {
      header = splitCsvLine(raw).map((h) => h.trim());
      bblCol = header.indexOf("bbl");
      yearsCol = header.indexOf("years_since_last_deed");
      continue;
    }
    const cells = splitCsvLine(raw);
    const bbl = (cells[bblCol] || "").trim();
    const years = Number(cells[yearsCol] || "");
    if (bbl && Number.isFinite(years)) out.set(bbl, years);
  }
  return out;
}

interface OffMarketSlice {
  signals: OffMarketInputRow[];
  relistCounts: Map<string, number>;
}

async function loadOffMarketFromPrisma(log: (m: string) => void): Promise<OffMarketSlice> {
  const empty: OffMarketSlice = { signals: [], relistCounts: new Map() };
  try {
    // Lazy-load Prisma so the script runs without DB available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const prismaMod = await import("@/lib/prisma");
    const prisma = prismaMod.default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const filterMod = await import("@/lib/scanner/trestle-off-market-filter");
    const { processListing, emptyOffMarketStats, DEFAULT_OFF_MARKET_CONFIG, aggregateByBbl } = filterMod;

    const since = new Date(Date.now() - 24 * 30 * 86400000); // 24 months
    const listings: Array<Record<string, unknown>> = await prisma.listing.findMany({
      where: {
        status_changed_at: { gte: since },
      },
      select: {
        listing_id: true, mls_id: true, status: true, status_changed_at: true,
        expiration_date: true, first_active_date: true, days_on_market: true,
        cumulative_days_on_market: true, list_price: true, agent_id: true,
        rls_eligible: true, address: true, latitude: true, longitude: true,
      },
      take: 50000,
    });
    log(`[build-prospects] off-market: ${listings.length} candidate listings from Prisma`);

    const stats = emptyOffMarketStats();
    const all: Array<{ bbl: string | null; signal: ReturnType<typeof processListing>["signal"] }> = [];
    const NOW = new Date();
    for (const l of listings) {
      const r = processListing(l as Parameters<typeof processListing>[0], stats, DEFAULT_OFF_MARKET_CONFIG, NOW);
      if (r.kept && r.signal) {
        // The Listing row probably doesn't carry a BBL directly — extract from address join later.
        all.push({ bbl: (l.address as { bbl?: string } | null)?.bbl ?? null, signal: r.signal });
      }
    }
    const signals: OffMarketInputRow[] = all
      .filter((x): x is { bbl: string; signal: NonNullable<typeof x.signal> } => Boolean(x.bbl) && Boolean(x.signal))
      .map((x) => ({ bbl: x.bbl, signal: x.signal as OffMarketInputRow["signal"] }));
    const aggregated = aggregateByBbl(signals.map((s) => ({ ...s.signal, bbl: s.bbl })), 730, NOW);
    const relistCounts = new Map<string, number>();
    for (const a of aggregated) relistCounts.set(a.bbl, a.count_24mo);
    return { signals, relistCounts };
  } catch (err) {
    log(`[build-prospects] off-market skip: Prisma not available (${(err as Error).message})`);
    return empty;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = args.quiet ? () => undefined : (m: string) => console.log(m);
  const tStart = Date.now();

  log("[build-prospects] loading inputs…");
  const [pluto, acrisRaw, dos, dofRaw, ownershipDuration] = await Promise.all([
    loadCsvAsRows<PlutoProjected>(PLUTO_PATH),
    loadCsvAsRows<AcrisOutputRow>(ACRIS_PATH),
    loadCsvAsRows<DosCorpProjected>(DOS_PATH),
    loadCsvAsRows<Record<string, string>>(DOF_PATH),
    loadOwnershipDuration(),
  ]);

  log(`  PLUTO:                ${pluto.length.toLocaleString()} rows`);
  log(`  ACRIS distress:       ${acrisRaw.length.toLocaleString()} rows`);
  log(`  DOS Corp:             ${dos.length.toLocaleString()} rows`);
  log(`  DOF tax-lien-sale:    ${dofRaw.length.toLocaleString()} rows`);
  log(`  ownership duration:   ${ownershipDuration.size.toLocaleString()} BBLs`);

  if (pluto.length === 0) {
    console.error("[build-prospects] PLUTO CSV is empty or missing — run scanner:pluto-ingest first.");
    process.exit(1);
  }

  // DOF rows → DofTaxLienSignalRef
  const dofTaxLiens: DofTaxLienSignalRef[] = dofRaw.map((row) => ({
    bbl: row.bbl,
    lien_category: (row.lien_category || "other") as DofTaxLienSignalRef["lien_category"],
    lien_amount: row.lien_amount || "",
    sale_date: row.sale_date || "",
    list_date: row.list_date || "",
  }));

  // Off-market from Prisma (optional)
  const offMarket = args.noPrisma
    ? { signals: [] as OffMarketInputRow[], relistCounts: new Map<string, number>() }
    : await loadOffMarketFromPrisma(log);
  log(`  off-market signals:   ${offMarket.signals.length.toLocaleString()} (${offMarket.relistCounts.size} unique BBLs)`);

  // Aggregate
  const input: AggregatorInput = {
    pluto,
    acris: acrisRaw,
    dosCorp: dos,
    offMarket: offMarket.signals,
    offMarketRelistCounts: offMarket.relistCounts,
    ownershipDurationYearsByBbl: ownershipDuration,
    dofTaxLiens,
  };
  const prospects = buildProspects(input);
  const aggregateStats = summarizeAggregator(input, prospects);
  log(`[build-prospects] aggregated: ${prospects.length.toLocaleString()} prospects`);

  // Score
  const scoringConfig: ScoringConfig | undefined = undefined;
  const scored = scoreProspects(prospects, scoringConfig, new Date(), {
    surface_below_threshold: args.surfaceAll,
  });
  const top = args.top > 0 ? scored.slice(0, args.top) : scored;

  // Write JSON (full audit trail)
  await fs.mkdir(path.dirname(OUTPUT_JSON), { recursive: true });
  await fs.writeFile(OUTPUT_JSON, JSON.stringify(top, null, 2));

  // Write CSV (flat — top per-prospect summary)
  const csvOut = createWriteStream(OUTPUT_CSV, { encoding: "utf-8" });
  const HEADER = [
    "rank", "score", "confidence", "bbl", "owner_name", "address",
    "signal_category_count", "most_recent_signal_at",
    "reason_signals", "suppressed",
  ];
  csvOut.write(HEADER.join(",") + "\n");
  top.forEach((s, idx) => {
    csvOut.write([
      String(idx + 1),
      String(s.score),
      s.confidence,
      s.bbl,
      // Find owner name from the matching prospect input
      escapeCsv(prospects.find((p) => p.bbl === s.bbl)?.pluto.owner_name || ""),
      escapeCsv(prospects.find((p) => p.bbl === s.bbl)?.pluto.address || ""),
      String(s.signal_category_count),
      s.most_recent_signal_at || "",
      escapeCsv(s.reasons.map((r) => r.signal).join("|")),
      String(s.suppressed),
    ].join(",") + "\n");
  });
  csvOut.end();
  await new Promise((r) => csvOut.on("finish", r));

  const manifest = {
    run_started: new Date(tStart).toISOString(),
    run_finished: new Date().toISOString(),
    elapsed_ms: Date.now() - tStart,
    inputs: {
      pluto_rows: pluto.length,
      acris_rows: acrisRaw.length,
      dos_corp_rows: dos.length,
      dof_tax_rows: dofRaw.length,
      ownership_duration_rows: ownershipDuration.size,
      off_market_signals: offMarket.signals.length,
    },
    aggregate: aggregateStats,
    output: {
      total_prospects: prospects.length,
      surfaced: top.length,
      surface_threshold_passed: scored.length,
      suppressed: scored.filter((s) => s.suppressed).length,
      by_confidence: {
        high: top.filter((s) => s.confidence === "high").length,
        medium: top.filter((s) => s.confidence === "medium").length,
        low: top.filter((s) => s.confidence === "low").length,
        below_threshold: top.filter((s) => s.confidence === "below_threshold").length,
      },
    },
  };
  await fs.writeFile(MANIFEST, JSON.stringify(manifest, null, 2));

  const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
  log("");
  log("── build-prospects complete ──");
  log(`  prospects assembled:        ${prospects.length.toLocaleString()}`);
  log(`  with any upstream signal:   ${aggregateStats.prospects_with_any_signal.toLocaleString()}`);
  log(`    ACRIS distress:           ${aggregateStats.prospects_with_acris.toLocaleString()}`);
  log(`    DOS Corp match:           ${aggregateStats.prospects_with_dos_match.toLocaleString()}`);
  log(`    off-market:               ${aggregateStats.prospects_with_off_market.toLocaleString()}`);
  log(`    dissolved LLC:            ${aggregateStats.prospects_dissolved_llc.toLocaleString()}`);
  log(`    absentee:                 ${aggregateStats.prospects_absentee.toLocaleString()}`);
  log(`  surfaced (≥${25} score):       ${scored.length.toLocaleString()}`);
  log(`  suppressed:                 ${scored.filter((s) => s.suppressed).length.toLocaleString()}`);
  log(`    high confidence:          ${top.filter((s) => s.confidence === "high").length.toLocaleString()}`);
  log(`    medium:                   ${top.filter((s) => s.confidence === "medium").length.toLocaleString()}`);
  log(`    low:                      ${top.filter((s) => s.confidence === "low").length.toLocaleString()}`);
  log(`  output JSON:                ${path.relative(REPO_ROOT, OUTPUT_JSON)}`);
  log(`  output CSV:                 ${path.relative(REPO_ROOT, OUTPUT_CSV)}`);
  log(`  manifest:                   ${path.relative(REPO_ROOT, MANIFEST)}`);
  log(`  elapsed:                    ${elapsed}s`);
}

main().catch((err) => {
  console.error("[build-prospects] fatal:", err);
  process.exit(1);
});
