/**
 * Live Cotality geography for the agent CRM: boroughs (CityRegion) and neighborhoods
 * (SubdivisionName) are free-text fields in Cotality — no picklist, no Lookup — filled by the
 * listing broker in RLS. Verified live 2026-10-26: Field catalogue shows both as plain strings
 * with LookupName null; Lookup?$filter=LookupName eq 'SubdivisionName' returns 0 rows.
 *
 * So the ONLY inventory of selectable boroughs and neighborhoods is the set of distinct values
 * Cotality returns right now, read live here and cached briefly in memory. Nothing is typed into
 * code and no Mallan code is ever written into a Cotality field.
 *
 * Human input is forgiving, provider queries are exact:
 *   - typed input is normalised locally (case and punctuation ignored, "Bed-Stuy" = "BEDSTUY");
 *   - a short alias table translates shorthand (UES, LIC, FiDi …) to a normalised key;
 *   - each key resolves to EVERY live spelling Cotality currently carries for it
 *     ("Soho", "SOHO", "SoHo" → three exact `SubdivisionName eq` clauses);
 *   - anything that does not resolve to a live value is refused visibly, never guessed.
 *
 * One resolver for Basic, Advanced and Building search, Comparable Reports and CMA.
 */
import { getAccessToken } from "./auth";
import { recordPropertyRequest } from "./cotality-telemetry";

export interface GeoBorough { value: string; display: string }
export interface GeoPair { borough: string; name: string; key: string; onMarketSale: number; onMarketRental: number }
export interface GeoCatalogEntry {
  /** The live spelling shown to the agent (most listed, mixed case preferred). */
  name: string;
  key: string;
  /** Live CityRegion value the name is mostly filed under. */
  borough: string;
  boroughDisplay: string;
  onMarketSale: number;
  onMarketRental: number;
  /** Every live spelling that shares the key (all are sent to Cotality). */
  spellings: string[];
}
export interface GeoInventory {
  pulledAt: string;
  /** Distinct live CityRegion values. */
  boroughs: GeoBorough[];
  /** Distinct live (CityRegion, SubdivisionName) pairs with on-market counts. */
  pairs: GeoPair[];
  /** Normalised key → every live spelling. */
  byKey: Record<string, string[]>;
  /** One entry per key for pickers and trees. */
  catalog: GeoCatalogEntry[];
  /** Typed shorthand → normalised key (search conveniences only; never data). */
  aliases: Record<string, string>;
  /** Typed borough shorthand → normalised key of the live CityRegion value. */
  boroughAliases: Record<string, string>;
  /** False when the on-market tally could not be completed (names still complete). */
  countsComplete: boolean;
}

const ON_MARKET = "(StandardStatus eq 'Active' or StandardStatus eq 'Pending' or StandardStatus eq 'ComingSoon')";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PAGE = 1000;
const CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 20_000;

/** How Cotality's live CityRegion values are shown. Anything else is shown as delivered. */
const BOROUGH_DISPLAY: Record<string, string> = {
  Manhattan: "Manhattan", Brooklyn: "Brooklyn", Queens: "Queens", Bronx: "Bronx", StatenIsland: "Staten Island",
};
/** Typed borough shorthand → the live CityRegion value's key. */
const BOROUGH_ALIASES: Record<string, string> = {
  bk: "brooklyn", bklyn: "brooklyn", kings: "brooklyn", si: "statenisland", richmond: "statenisland",
  bx: "bronx", thebronx: "bronx", qns: "queens", mnh: "manhattan", manh: "manhattan", newyork: "manhattan", nyc: "manhattan",
};
/**
 * Neighborhood shorthand → normalised key of the live name. A convenience for typing only: an
 * alias whose key is not currently in Cotality resolves to nothing.
 */
export const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  ues: "uppereastside", uws: "upperwestside", lic: "longislandcity", fidi: "financialdistrict",
  bedstuy: "bedfordstuyvesant", bpc: "batteryparkcity", les: "lowereastside", ev: "eastvillage",
  wv: "westvillage", gv: "greenwichvillage", hk: "hellskitchen", clinton: "hellskitchen",
  wburg: "williamsburg", williamsburgh: "williamsburg", bkheights: "brooklynheights", bklynheights: "brooklynheights",
  mtown: "midtown", midtowne: "midtowneast", midtownw: "midtownwest", gramercy: "gramercypark",
  wash: "washingtonheights", washheights: "washingtonheights", cpw: "upperwestside", pcv: "petercoopervillage",
  stuytown: "stuyvesanttown", dtbk: "downtownbrooklyn", downtownbk: "downtownbrooklyn", rego: "regopark",
  fhills: "foresthills", sohotribeca: "soho",
};
/** SubdivisionName values that are not neighborhoods (a borough, the city, a placeholder). */
const NOT_A_NEIGHBORHOOD = new Set(["other", "others", "null", "none", "na", "outoftown", "newyork", "newyorkcity", "nyc", "xbother",
  "manhattan", "brooklyn", "queens", "bronx", "thebronx", "statenisland"]);

/** Normalised key: lower case, letters and digits only. "Bedford - Stuyvesant" → "bedfordstuyvesant". */
export function geoKey(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function boroughDisplay(cityRegion: string): string {
  const v = String(cityRegion || "");
  return BOROUGH_DISPLAY[v] || v;
}

function isNeighborhood(name: string): boolean {
  const key = geoKey(name);
  return key.length > 0 && !NOT_A_NEIGHBORHOOD.has(key) && !/[[\]_]/.test(name);
}

// ── Live pull ──────────────────────────────────────────────────────────────────────────────

async function odata(path: string): Promise<Record<string, unknown>> {
  const base = (process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle").replace(/\/+$/, "");
  const token = await getAccessToken();
  recordPropertyRequest();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/odata/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) throw new Error(`Cotality HTTP ${res.status} for ${path.slice(0, 80)}`);
    return (await res.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

/** Every distinct (CityRegion, SubdivisionName) pair Cotality holds — its own grouping, live. */
async function pullDistinctPairs(): Promise<Array<{ borough: string; name: string }>> {
  const rows: Array<{ borough: string; name: string }> = [];
  let path: string | null = `Property?$apply=${encodeURIComponent("groupby((CityRegion,SubdivisionName))")}`;
  while (path) {
    const page = await odata(path);
    for (const r of (page.value as Array<Record<string, unknown>>) || []) {
      rows.push({ borough: String(r.CityRegion || ""), name: String(r.SubdivisionName || "") });
    }
    const next = page["@odata.nextLink"] ? String(page["@odata.nextLink"]) : null;
    path = next ? next.replace(/^.*\/odata\//, "") : null;
  }
  return rows;
}

/** On-market listing counts per (CityRegion, SubdivisionName, side) — the rows themselves, tallied here. */
async function pullOnMarketCounts(): Promise<Map<string, { sale: number; rental: number }>> {
  const select = "CityRegion,SubdivisionName,PropertyType";
  const pagePath = (skip: number, count: boolean) =>
    `Property?$filter=${encodeURIComponent(ON_MARKET)}&$select=${select}&$orderby=ListingKey&$top=${PAGE}&$skip=${skip}${count ? "&$count=true" : ""}`;
  const tally = new Map<string, { sale: number; rental: number }>();
  const add = (rows: Array<Record<string, unknown>>) => {
    for (const r of rows) {
      const k = `${r.CityRegion || ""}\u0000${r.SubdivisionName || ""}`;
      const t = tally.get(k) || { sale: 0, rental: 0 };
      if (String(r.PropertyType || "").toLowerCase().includes("lease")) t.rental++; else t.sale++;
      tally.set(k, t);
    }
  };
  const first = await odata(pagePath(0, true));
  add((first.value as Array<Record<string, unknown>>) || []);
  const total = Number(first["@odata.count"]) || 0;
  const skips: number[] = [];
  for (let s = PAGE; s < total; s += PAGE) skips.push(s);
  for (let i = 0; i < skips.length; i += CONCURRENCY) {
    const pages = await Promise.all(skips.slice(i, i + CONCURRENCY).map((s) => odata(pagePath(s, false))));
    for (const p of pages) add((p.value as Array<Record<string, unknown>>) || []);
  }
  return tally;
}

function buildInventory(pairsRaw: Array<{ borough: string; name: string }>, counts: Map<string, { sale: number; rental: number }> | null): GeoInventory {
  const boroughValues = [...new Set(pairsRaw.map((p) => p.borough).filter(Boolean))].sort((a, b) => boroughDisplay(a).localeCompare(boroughDisplay(b)));
  const boroughs = boroughValues.map((value) => ({ value, display: boroughDisplay(value) }));
  const kept = pairsRaw.filter((p) => p.borough && isNeighborhood(p.name));
  // A live spelling that is itself shorthand ("BED-STUY") is filed with the place it stands for
  // when Cotality also carries that place, so one pick covers every live spelling.
  const rawKeys = new Set(kept.map((p) => geoKey(p.name)));
  const keyOf = (name: string) => {
    const k = geoKey(name);
    const target = NEIGHBORHOOD_ALIASES[k];
    return target && rawKeys.has(target) ? target : k;
  };
  const pairs: GeoPair[] = kept.map((p) => {
    const c = counts?.get(`${p.borough}\u0000${p.name}`) || { sale: 0, rental: 0 };
    return { borough: p.borough, name: p.name, key: keyOf(p.name), onMarketSale: c.sale, onMarketRental: c.rental };
  });
  const byKey: Record<string, string[]> = {};
  for (const p of pairs) {
    const list = (byKey[p.key] = byKey[p.key] || []);
    if (!list.includes(p.name)) list.push(p.name);
  }
  // One catalog entry per key: the most-listed spelling, filed under its most-listed borough.
  const perKey = new Map<string, GeoPair[]>();
  for (const p of pairs) (perKey.get(p.key) || perKey.set(p.key, []).get(p.key)!).push(p);
  const mixedCase = (s: string) => s !== s.toUpperCase();
  const catalog: GeoCatalogEntry[] = [...perKey.entries()].map(([key, list]) => {
    const total = (p: GeoPair) => p.onMarketSale + p.onMarketRental;
    const bySpelling = new Map<string, number>();
    const byBorough = new Map<string, number>();
    for (const p of list) {
      bySpelling.set(p.name, (bySpelling.get(p.name) || 0) + total(p));
      byBorough.set(p.borough, (byBorough.get(p.borough) || 0) + total(p));
    }
    const rank = (a: string, b: string) => (bySpelling.get(b)! - bySpelling.get(a)!) || (Number(mixedCase(b)) - Number(mixedCase(a))) || a.localeCompare(b);
    const name = [...bySpelling.keys()].sort(rank)[0];
    const borough = [...byBorough.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    return {
      name, key, borough, boroughDisplay: boroughDisplay(borough),
      onMarketSale: list.reduce((a, p) => a + p.onMarketSale, 0),
      onMarketRental: list.reduce((a, p) => a + p.onMarketRental, 0),
      spellings: byKey[key],
    };
  }).sort((a, b) => a.boroughDisplay.localeCompare(b.boroughDisplay) || a.name.localeCompare(b.name));
  return { pulledAt: new Date().toISOString(), boroughs, pairs, byKey, catalog, aliases: { ...NEIGHBORHOOD_ALIASES }, boroughAliases: { ...BOROUGH_ALIASES }, countsComplete: counts !== null };
}

let cache: { inventory: GeoInventory; at: number } | null = null;
let inflight: Promise<GeoInventory> | null = null;

/**
 * The live geography inventory, pulled from Cotality and cached in memory for six hours per
 * server instance (one grouping request plus the on-market rows, about seventeen requests).
 * Names are never served from anywhere else; if the count tally fails the names are still live.
 */
export async function getLiveGeography(options: { refresh?: boolean } = {}): Promise<GeoInventory> {
  if (!options.refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.inventory;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const pairs = await pullDistinctPairs();
      let counts: Map<string, { sale: number; rental: number }> | null = null;
      try {
        counts = await pullOnMarketCounts();
      } catch (err) {
        console.warn("[geography] on-market tally failed; serving live names without counts:", (err as Error).message);
      }
      const inventory = buildInventory(pairs, counts);
      cache = { inventory, at: Date.now() };
      return inventory;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** For tests and tools: an inventory from known pairs, no network. */
export function inventoryFromPairs(pairs: Array<{ borough: string; name: string; sale?: number; rental?: number }>): GeoInventory {
  const counts = new Map<string, { sale: number; rental: number }>();
  for (const p of pairs) counts.set(`${p.borough}\u0000${p.name}`, { sale: p.sale || 0, rental: p.rental || 0 });
  return buildInventory(pairs.map((p) => ({ borough: p.borough, name: p.name })), counts);
}

// ── Resolver ───────────────────────────────────────────────────────────────────────────────

export interface Resolution { exact: string[]; unresolved: string[] }

/**
 * Typed neighborhoods → the exact live SubdivisionName spellings to send. Input is split on
 * commas; each part is matched by normalised key, then by alias; a trailing ", Borough" is
 * ignored. Parts that match nothing live are reported, never guessed.
 */
export function resolveNeighborhoods(inventory: GeoInventory, inputs: string | string[]): Resolution {
  const parts = (Array.isArray(inputs) ? inputs : [inputs]).flatMap((s) => String(s).split(",")).map((s) => s.trim()).filter(Boolean);
  const exact: string[] = [];
  const unresolved: string[] = [];
  for (const part of parts) {
    const key = geoKey(part);
    // The typed key's own live spellings plus, when it is shorthand, the place it stands for
    const spellings = [...(inventory.byKey[key] || []), ...(inventory.byKey[inventory.aliases[key] || ""] || [])];
    if (spellings.length) { for (const s of spellings) if (!exact.includes(s)) exact.push(s); }
    else unresolved.push(part);
  }
  return { exact, unresolved };
}

/** Typed borough → the exact live CityRegion value ("Staten Island", "si" → "StatenIsland"), or null. */
export function resolveBorough(inventory: GeoInventory, input: string): string | null {
  const key = geoKey(input);
  if (!key) return null;
  const byKeyValue = new Map(inventory.boroughs.map((b) => [geoKey(b.value), b.value]));
  const byKeyDisplay = new Map(inventory.boroughs.map((b) => [geoKey(b.display), b.value]));
  return byKeyValue.get(key) || byKeyDisplay.get(key) || byKeyValue.get(BOROUGH_ALIASES[key] || "") || null;
}
