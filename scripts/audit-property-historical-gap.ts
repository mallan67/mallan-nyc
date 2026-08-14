/**
 * HISTORICAL PROPERTY GAP CENSUS — provider side.
 *
 * The `ge` bootstrap in PR #608 prevents a NEW boundary loss. It does NOT prove
 * the OLD regime (DESC ordering + a 500-record cap + a scalar max-seen cursor)
 * did not already punch holes below today's DB max. Under DESC+cap the newest
 * 500 rows were processed and the cursor jumped to the newest MT, so any older
 * eligible row that never got processed became unreachable on every subsequent
 * capped run. This measures whether that happened.
 *
 * WHY THIS SCRIPT IS PROVIDER-ONLY
 *
 * It deliberately does NOT open a Postgres connection. Pulling a production
 * write-credential into the agent context to count rows would be a needless
 * exposure when read-only SQL is already available out-of-band. So this emits a
 * provider census artifact, and the local side is compared with read-only
 * SELECTs against the same windows.
 *
 * IDENTITY: ListingId, NOT ListingKey.
 * `raw_data.ListingKey` survives on only 1,010 of 24,970 production rows (it is
 * not in the raw_data keep-list and was shed for storage), whereas
 * `listings.listing_id` carries the provider ListingId on 24,963. Joining on
 * ListingKey would report ~96% of the catalogue as "missing" — an artifact of
 * shedding, not a gap. (The CURSOR still orders by ListingKey; different
 * concern, unaffected.)
 *
 * READ-ONLY. HTTP GET only. Mutates nothing, at the provider or locally.
 *
 * USAGE
 *   npm run idx:gap-census                       # monthly counts, 2024-10 →
 *   npm run idx:gap-census -- --window 2026-07   # dump ListingIds for one month
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle";
const PROPERTY = `${BASE}/odata/Property`;

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function token(): Promise<string> {
  const id = process.env.IDX_CLIENT_ID || process.env.IDX_API_KEY;
  const secret = process.env.IDX_CLIENT_SECRET || process.env.IDX_API_SECRET;
  if (!id || !secret) throw new Error("Missing IDX_CLIENT_ID / IDX_CLIENT_SECRET");
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
  if (!j.access_token) throw new Error("no access_token");
  return j.access_token;
}

/** `$count=true` with `$top=0` — the cheapest exact count the feed offers. */
async function countIn(bearer: string, fromIso: string, toIso: string): Promise<number> {
  const url =
    `${PROPERTY}?` +
    new URLSearchParams({
      $filter: `ModificationTimestamp ge ${fromIso} and ModificationTimestamp lt ${toIso}`,
      $count: "true",
      $top: "0",
    }).toString();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`count ${fromIso}..${toIso} failed: HTTP ${res.status}`);
  const body = (await res.json()) as Record<string, unknown>;
  return Number(body["@odata.count"] ?? 0);
}

/** Every ListingId in one window, following nextLink. */
async function idsIn(bearer: string, fromIso: string, toIso: string): Promise<
  { ListingId: string; ModificationTimestamp: string; StandardStatus: string; PropertyType: string; display: boolean }[]
> {
  const out: { ListingId: string; ModificationTimestamp: string; StandardStatus: string; PropertyType: string; display: boolean }[] = [];
  let url =
    `${PROPERTY}?` +
    new URLSearchParams({
      $select: "ListingId,ModificationTimestamp,StandardStatus,PropertyType,InternetEntireListingDisplayYN",
      $filter: `ModificationTimestamp ge ${fromIso} and ModificationTimestamp lt ${toIso}`,
      $orderby: "ModificationTimestamp asc,ListingKey asc",
      $top: "500",
    }).toString();
  let guard = 0;
  while (url && guard++ < 500) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`page failed: HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    for (const r of (body.value as Record<string, unknown>[]) ?? []) {
      if (!r.ListingId) continue;
      out.push({
        ListingId: String(r.ListingId),
        ModificationTimestamp: String(r.ModificationTimestamp ?? ""),
        StandardStatus: String(r.StandardStatus ?? ""),
        PropertyType: String(r.PropertyType ?? ""),
        display: r.InternetEntireListingDisplayYN !== false,
      });
    }
    url = (body["@odata.nextLink"] as string | undefined) ?? "";
  }
  return out;
}

function monthsFrom(startYear: number, startMonth: number): { label: string; from: string; to: string }[] {
  const out: { label: string; from: string; to: string }[] = [];
  const now = new Date();
  let y = startYear;
  let m = startMonth;
  while (y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1)) {
    const from = `${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    out.push({
      label: `${y}-${String(m).padStart(2, "0")}`,
      from,
      to: `${ny}-${String(nm).padStart(2, "0")}-01T00:00:00Z`,
    });
    y = ny;
    m = nm;
  }
  return out;
}

async function main() {
  const bearer = await token();
  const outDir = path.resolve(process.cwd(), "artifacts");
  mkdirSync(outDir, { recursive: true });

  const single = arg("window");
  if (single) {
    const [y, m] = single.split("-").map(Number);
    const from = `${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const to = `${ny}-${String(nm).padStart(2, "0")}-01T00:00:00Z`;
    const rows = await idsIn(bearer, from, to);
    const out = path.join(outDir, `property-window-${single}.json`);
    writeFileSync(out, JSON.stringify({ window: single, from, to, count: rows.length, rows }, null, 2));
    console.log(`${single}: ${rows.length} provider ListingIds -> ${out}`);
    return;
  }

  // Whole-catalogue count first — the single most useful number.
  const total = await countIn(bearer, "1970-01-01T00:00:00Z", "2100-01-01T00:00:00Z");
  console.log(`provider Property total (all time, unfiltered): ${total}`);

  const windows = monthsFrom(2024, 10);
  const rows: { month: string; providerCount: number }[] = [];
  for (const w of windows) {
    const n = await countIn(bearer, w.from, w.to);
    rows.push({ month: w.label, providerCount: n });
    console.log(`${w.label}  provider=${n}`);
  }

  const out = path.join(outDir, "property-provider-window-census.json");
  writeFileSync(
    out,
    JSON.stringify({ capturedAt: new Date().toISOString(), providerTotalAllTime: total, windows: rows }, null, 2),
  );
  console.log(`\nEvidence written: ${out}`);
  console.log("Compare each providerCount against the local per-month count (read-only SELECT).");
}

main().catch((err) => {
  console.error("census failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
