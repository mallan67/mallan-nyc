/**
 * HISTORICAL PROPERTY GAP CENSUS.
 *
 * The `ge` bootstrap in PR #608 prevents a NEW boundary loss. It does NOT prove
 * the OLD regime (DESC ordering + a 500-record cap + a scalar max-seen cursor)
 * did not already punch holes below today's DB max. Under DESC+cap the newest
 * 500 rows were processed and the cursor jumped to the newest MT, so any older
 * eligible row that never got processed became unreachable on every subsequent
 * capped run. This script measures whether that actually happened.
 *
 * METHOD — bounded, evidence-driven, READ-ONLY on both sides:
 *   1. Walk live Cotality Property ASC by (ModificationTimestamp, ListingKey)
 *      across a bounded window, collecting the provider's ListingId set.
 *   2. Compare against `listings.listing_id` in Neon.
 *   3. Report what is missing locally, with enough shape to size recovery.
 *
 * JOIN KEY IS `ListingId`, NOT `ListingKey` — deliberately.
 * A census must join on something we actually store. `raw_data.ListingKey` is
 * present on only 1,010 of 24,970 production rows (it is not in the raw_data
 * keep-list and was shed for storage), whereas `listings.listing_id` carries the
 * provider ListingId for 24,963 of them. Joining on ListingKey would report
 * ~96% of the catalogue as "missing" — an artifact of shedding, not a gap.
 * (The CURSOR still uses ListingKey for provider-side ordering; that is a
 * different concern and is unaffected.)
 *
 * MUTATES NOTHING. Read-only HTTP GET + read-only SELECT. Recovery is reported,
 * never executed.
 *
 * USAGE
 *   npm run idx:gap-census                 # default window: full catalogue
 *   npm run idx:gap-census -- --since 2026-01-01T00:00:00Z --max-pages 40
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma";

const BASE = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
const PAGE = 500;

function arg(name: string, fallback: string | null = null): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

type ProviderRow = {
  ListingId?: string;
  ListingKey?: string;
  ModificationTimestamp?: string;
  StandardStatus?: string;
  InternetEntireListingDisplayYN?: boolean;
};

async function token(): Promise<string> {
  const id = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
  const secret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
  if (!id || !secret) throw new Error("Missing IDX_CLIENT_ID / IDX_CLIENT_SECRET (put them in .env.local)");
  const res = await fetch(`${BASE}/oidc/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: id,
      client_secret: secret,
      scope: "api",
    }),
  });
  if (!res.ok) throw new Error(`token failed: HTTP ${res.status}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("no access_token in token response");
  return j.access_token;
}

async function main() {
  const since = arg("since", "2024-01-01T00:00:00Z")!;
  const maxPages = Number(arg("max-pages", "200"));
  const bearer = await token();

  // ── 1. Walk the provider ASC, bounded ────────────────────────────────────
  const provider = new Map<string, ProviderRow>();
  let url =
    `${BASE}/odata/Property?` +
    new URLSearchParams({
      $select: "ListingId,ListingKey,ModificationTimestamp,StandardStatus,InternetEntireListingDisplayYN",
      $filter: `ModificationTimestamp ge ${since}`,
      $orderby: "ModificationTimestamp asc,ListingKey asc",
      $top: String(PAGE),
    }).toString();

  let pages = 0;
  let truncated = false;
  while (url && pages < maxPages) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Property page ${pages + 1} failed: HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    for (const r of (body.value as ProviderRow[]) ?? []) {
      if (r.ListingId) provider.set(String(r.ListingId), r);
    }
    pages++;
    const next = body["@odata.nextLink"] as string | undefined;
    if (!next) { url = ""; break; }
    url = next;
    if (pages >= maxPages) truncated = true;
  }
  console.log(`provider: ${provider.size} ListingIds over ${pages} page(s)${truncated ? " (TRUNCATED — raise --max-pages)" : ""}`);

  // ── 2. Compare against local, in bounded chunks ──────────────────────────
  const ids = [...provider.keys()];
  const localFound = new Set<string>();
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const rows = await prisma.listing.findMany({
      where: { listing_id: { in: chunk } },
      select: { listing_id: true },
    });
    for (const r of rows) localFound.add(r.listing_id);
  }

  const missing = ids.filter((id) => !localFound.has(id)).map((id) => provider.get(id)!);

  // ── 3. Shape the gap ─────────────────────────────────────────────────────
  const byStatus = new Map<string, number>();
  let displayable = 0;
  let minTs: string | null = null;
  let maxTs: string | null = null;
  for (const m of missing) {
    const s = m.StandardStatus ?? "(null)";
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
    const isDisplayStatus = ["Active", "ActiveUnderContract", "ComingSoon"].includes(s);
    if (isDisplayStatus && m.InternetEntireListingDisplayYN !== false) displayable++;
    const t = m.ModificationTimestamp ?? null;
    if (t) {
      if (!minTs || t < minTs) minTs = t;
      if (!maxTs || t > maxTs) maxTs = t;
    }
  }

  const RECOVERY_BATCH = 500; // one scheduled run's cap
  const report = {
    capturedAt: new Date().toISOString(),
    window: { since, pagesWalked: pages, truncated },
    providerListingIds: provider.size,
    presentLocally: localFound.size,
    missingLocally: missing.length,
    missingDisplayable: displayable,
    missingTimestampRange: { min: minTs, max: maxTs },
    missingByStatus: Object.fromEntries([...byStatus.entries()].sort((a, b) => b[1] - a[1])),
    recoveryBatchesRequired: Math.ceil(missing.length / RECOVERY_BATCH),
    // Bounded sample only — never the whole set, and no listing content beyond
    // the identifiers needed to act on it.
    sampleMissing: missing.slice(0, 25).map((m) => ({
      ListingId: m.ListingId,
      ModificationTimestamp: m.ModificationTimestamp,
      StandardStatus: m.StandardStatus,
    })),
    verdict:
      missing.length === 0
        ? "ZERO GAP — every provider ListingId in the window is present locally."
        : `GAP: ${missing.length} provider ListingIds absent locally (${displayable} displayable).`,
  };

  const outDir = path.resolve(process.cwd(), "artifacts");
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, "property-historical-gap-census.json");
  writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(`\n${report.verdict}`);
  console.log(`timestamp range: ${minTs ?? "-"} .. ${maxTs ?? "-"}`);
  console.log(`recovery batches @${RECOVERY_BATCH}/run: ${report.recoveryBatchesRequired}`);
  if (truncated) console.log("WARNING: window truncated — the gap number is a LOWER BOUND.");
  console.log(`\nEvidence written: ${out}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("census failed:", err instanceof Error ? err.message : err);
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
