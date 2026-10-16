/**
 * Open House search on Cotality's own OpenHouse resource.
 *
 * Property has no open-house date field, so "open house between A and B" is answered the way Cotality models it: ask the OpenHouse resource for the
 * Public, Active events whose OpenHouseDate falls in the range, then ask Property for those ListingKeys. Live Cotality 2026-10-16: OpenHouse holds
 * 4,292 rows (OpenHouseDate, OpenHouseStartTime/EndTime, OpenHouseStatus, OpenHouseType Public, AppointmentRequiredYN); a few rows carry impossible dates
 * (year 2115, 3201), which any bounded range excludes.
 */
import { getAccessToken } from "@/lib/idx/auth";

export const OPEN_HOUSE_MAX_LISTINGS = 100;      // ListingKey values put into the Property $filter
const PAGE = 200;
const MAX_PAGES = 5;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface OpenHouseKeys {
  ok: boolean;
  keys: string[];
  /** more listings had an open house in the range than the search can carry; narrow the dates */
  capped: boolean;
  error?: string;
}

export function validDay(v: string | null | undefined): string | null {
  if (!v || !DAY.test(v)) return null;
  const t = Date.parse(v + "T00:00:00Z");
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : null;
}

/** The OpenHouse $filter for a date range (a lone start is "from then on to the same day", a lone end is "up to then from today"). */
export function openHouseFilter(from: string | null, to: string | null, today = new Date().toISOString().slice(0, 10)): string | null {
  const a = validDay(from); const b = validDay(to);
  if (!a && !b) return null;
  const lo = a ?? today; const hi = b ?? a!;
  return `OpenHouseDate ge ${lo} and OpenHouseDate le ${hi} and OpenHouseStatus eq 'Active' and OpenHouseType eq 'Public'`;
}

export function listingKeyClause(keys: string[]): string {
  return "(" + keys.map((k) => `ListingKey eq '${k.replace(/'/g, "''")}'`).join(" or ") + ")";
}

export async function fetchOpenHouseListingKeys(from: string | null, to: string | null, fetchImpl: typeof fetch = fetch): Promise<OpenHouseKeys> {
  const filter = openHouseFilter(from, to);
  if (!filter) return { ok: false, keys: [], capped: false, error: "openHouseDateFrom / openHouseDateTo must be YYYY-MM-DD" };
  try {
    const token = await getAccessToken();
    const base = (process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle").replace(/\/$/, "");
    const keys: string[] = []; const seen = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ $filter: filter, $select: "ListingKey", $orderby: "OpenHouseDate asc", $top: String(PAGE), $skip: String(page * PAGE) });
      const res = await fetchImpl(`${base}/odata/OpenHouse?${qs}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (!res.ok) return { ok: false, keys: [], capped: false, error: `OpenHouse HTTP ${res.status}` };
      const rows = ((await res.json()).value || []) as Array<Record<string, unknown>>;
      for (const r of rows) { const k = r.ListingKey ? String(r.ListingKey) : ""; if (k && !seen.has(k)) { seen.add(k); keys.push(k); } }
      if (rows.length < PAGE) break;
    }
    return { ok: true, keys: keys.slice(0, OPEN_HOUSE_MAX_LISTINGS), capped: keys.length > OPEN_HOUSE_MAX_LISTINGS };
  } catch (e) {
    return { ok: false, keys: [], capped: false, error: e instanceof Error ? e.message : "OpenHouse lookup failed" };
  }
}
