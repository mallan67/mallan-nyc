// GET /api/idx/search
// Backend Agent Search against live Cotality (REBNY RLS via Trestle), read-only.
// Auth: agent or broker session cookie required.
// Returns listings in CRM flat shape for the search UI.
//
// AUDIENCE: signed-in agents only — never public. The public website display gate
// (closed >24h, terminal statuses, internet-display flags) is NOT applied here
// (Maya 2026-10-23: "this is an agent backend search not public facing so it does not
// apply"). Agents see every listing and status the licence delivers, which CMA/BPO comps
// require. Public search and client-facing output keep their own gates in their own code.
//
// MAPPING: every criterion goes through lib/search/crm-idx-filter.ts against the live
// sale / rental contract in data/cotality-enums.live.json — executed by Cotality, applied
// by Mallan after retrieval, or refused with HTTP 422 naming the criterion. Never dropped.
//
// COMPLIANCE: server-side only, no public caching, REBNY attribution included, audit logged.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { hasCredentials } from "@/lib/idx/auth";
import { fetchFromTrestle } from "@/lib/idx/fetch";
import { getLiveGeography, type GeoInventory } from "@/lib/idx/geography";
import { generateAttributionText } from "@/lib/idx/mapping";
import { logFetchAttempt } from "@/lib/idx/logger";
import { upsertBuildingFromSearchResult } from "@/lib/buildings/upsert";
import {
  applyLocalCriteria,
  buildCrmIdxQuery,
  carriedOn,
  SEARCH_CONTRACT,
  type JoinCriterion,
  type LocalCriterion,
  type SearchSide,
} from "@/lib/search/crm-idx-filter";
import { mapTrestleToCrmListing, type AgentContact } from "@/lib/search/crm-idx-mapper";
import prisma from "@/lib/prisma";

// Property fields the CRM result shape reads. Each request carries only those that live
// Cotality records of the searched side(s) actually return (see selectFor) — suppressed and
// empty fields (Latitude/Longitude, MlsStatus, DaysOnMarket, SourceSystemKey, …) are never
// requested.
export const SEARCH_SELECT_FIELDS = [
  // Identity — ListingKey joins Media (ResourceRecordKey); TaxBlock + TaxLot are building identity
  "ListingKey", "ListingId", "TaxBlock", "TaxLot", "BuildingName", "BuildingKeyNumeric",
  // Address
  "StreetNumber", "StreetName", "StreetDirPrefix", "StreetDirSuffix",
  "StreetSuffix", "UnitNumber", "City", "CityRegion", "SubdivisionName", "PostalCity",
  "PostalCode", "StateOrProvince", "CountyOrParish", "CrossStreet",
  // Classification
  "PropertyType", "PropertySubType", "CommonInterest", "NewConstructionYN",
  // Status & dates
  "StandardStatus", "ModificationTimestamp", "ListingContractDate", "OnMarketDate",
  "PurchaseContractDate", "CloseDate", "OffMarketDate", "ContractStatusChangeDate",
  "ActivationDate", "AvailabilityDate", "PriceChangeTimestamp",
  // Pricing — ListPrice is the asking price on sales and the monthly rent on rentals
  "ListPrice", "ClosePrice", "OriginalListPrice", "PreviousListPrice",
  // Rooms & size
  "BedroomsTotal", "BathroomsFull", "BathroomsHalf", "BathroomsTotalInteger",
  "LivingArea", "LotSizeArea", "YearBuilt", "RoomsTotal", "StoriesTotal", "NumberOfUnitsTotal",
  "EntryLevel", "Exposures",
  // Financial (DownPaymentAssistance* are Property fields — Codex #352)
  "AssociationFee", "AssociationFeeFrequency", "TaxAnnualAmount",
  "DownPaymentAssistanceAmount", "DownPaymentAssistanceCount",
  // Agent / office
  "ListAgentMlsId", "ListAgentFullName", "ListAgentEmail",
  "ListAgentDirectPhone", "ListOfficeMlsId", "ListOfficeName",
  "ListAgentPreferredPhone", "ListAgentMobilePhone", "ListAgentURL", "ListAgentStateLicense",
  "ListOfficePhone", "ListOfficeEmail", "ListOfficeURL",
  // Co-listing agents and offices — teams list here (live 2026-10-24: ListTeamName is empty)
  ...["CoListAgent", "CoListAgent2", "CoListAgent3"].flatMap((p) => ["MlsId", "FullName", "Email", "DirectPhone", "PreferredPhone", "MobilePhone", "URL", "StateLicense"].map((f) => p + f)),
  ...["CoListOffice", "CoListOffice2"].flatMap((p) => ["MlsId", "Name", "Phone", "Email", "URL"].map((f) => p + f)),
  // Media — photos/floor plans come from the Media resource; video and 3D links live on Property
  "PhotosCount", "VideosCount",
  "VirtualTourURLUnbranded", "VirtualTourURLUnbranded2", "VirtualTourURLUnbranded3",
  "VirtualTourURLBranded", "VirtualTourURLBranded2", "VirtualTourURLBranded3",
  // Remarks & display flag
  "PublicRemarks", "InternetEntireListingDisplayYN",
  "Permission", "InternetConsumerCommentYN", "InternetAutomatedValuationDisplayYN",
  // Rental + FARE Act fee transparency
  "PetsAllowed", "Furnished", "MoveInCosts", "MoveInCostsComments", "OngoingFees", "TenantPays",
  "TenantPaysDescription", "OwnerPays", "SecurityDeposit",
  // Listing history shown on the detail page and the Sales / Rental Tools viewers (live 2026-10-26)
  "OriginalEntryTimestamp",
  // Feature fields shown in results and detail
  "ListingAgreement", "LandLeaseYN", "CoolingYN", "GarageYN", "DirectionFaces", "View",
  "ArchitecturalStyle", "StructureType", "AccessibilityFeatures", "ExteriorFeatures",
  "BuildingFeatures", "LaundryFeatures", "SecurityFeatures", "PoolFeatures",
  "AvailableLeaseType", "ExistingLeaseType", "ConstructionMaterials",
  "PatioAndPorchFeatures", "CurrentFinancing",
];

// REBNY CustomFields (sponsor, attendance, financing, flip tax, …) travel inside CustomProperty.
const CUSTOM_PROPERTY_SELECT = ["CustomFields", "ListingKey"] as const;

// When Mallan must apply criteria Cotality cannot filter, this many Cotality matches are
// checked (newest first). A larger match set is reported as incomplete, never as complete.
// A Property page with the CustomProperty expand holds 200 rows whatever $top says (live
// 2026-10-26), so this cap is 25 requests; without the expand a page holds 1,000 rows.
const LOCAL_SCAN_CAP = 5000;
const PLAIN_SCAN_CAP = 20_000;
// ── REBNY custom-field criteria (SponsorUnitYN, …) resolved to exact ListingKey sets ──
// Live 2026-10-26: Cotality does not search inside CustomProperty.CustomFields — contains() on it
// answers HTTP 200 with 0 rows for every needle, the key name included — and the expanded Property
// scan above reads 14,018 on-market sales in 71 requests (78 s). CustomProperty itself pages at
// 1,000 rows, so a REBNY key is resolved exactly by reading every CustomProperty row of this
// search's sides and statuses once (14,051 on-market sale rows: 15 requests, 12 s; 1,340 rental
// rows: 2 requests), keeping it briefly, and searching Property for the matching ListingKeys.
// A slice beyond CUSTOM_SLICE_MAX rows (closed listings: 205,776 sales) keeps the capped scan.
const CUSTOM_SLICE_MAX = 20_000;
// Up to this many Cotality matches are scanned directly (≤ 5 expanded requests) — a building or
// a small neighborhood — before the key path is used.
const SCAN_EXACT_MAX = 1000;
// Live text search (contains on PublicRemarks) takes 22–28s inside Cotality (2026-10-23);
// the route's maxDuration is raised to match in vercel.json.
const COTALITY_TIMEOUT_MS = 50_000;
// Rows read from a linked resource (OpenHouse, Member, …) for one search. More matching rows are
// reported as incomplete, never as complete.
const JOIN_ROW_CAP = 5000;
// Cotality answers HTTP 414 between 6 KB and 9 KB of URL-encoded $filter (400 ListingKeys in one
// `in` list pass, 600 fail — live 2026-10-24). Encoded $filter + $select stay under this.
const URL_BUDGET = 6000;

const quoteKey = (k: string) => `'${k.replace(/'/g, "''")}'`;
const encodedLength = (filter: string, select: string[]) => encodeURIComponent(filter).length + encodeURIComponent(select.join(",")).length;

// Full records for these keys, in as many requests as the URL budget needs, keyed by ListingKey.
async function fetchByKeys(keys: string[], select: string[], orderby: string, expand: readonly string[]): Promise<Map<string, Record<string, unknown>>> {
  const chunks: string[][] = [];
  let chunk: string[] = [];
  for (const k of keys) {
    if (chunk.length && encodedLength(`ListingKey in (${[...chunk, k].map(quoteKey).join(",")})`, select) > URL_BUDGET) { chunks.push(chunk); chunk = []; }
    chunk.push(k);
  }
  if (chunk.length) chunks.push(chunk);
  const pages = await Promise.all(chunks.map((c) => fetchFromTrestle({
    filter: `ListingKey in (${c.map(quoteKey).join(",")})`, select, orderby, top: c.length, maxTotal: c.length,
    expandCustomProperty: expand, timeoutMs: COTALITY_TIMEOUT_MS,
  })));
  return new Map(pages.flatMap((pg) => pg.records).map((r) => [String(r.ListingKey), r]));
}

// Up to this many linked-resource keys are searched exactly, in several Property requests run
// a few at a time; a larger key set falls back to Mallan's capped scan (reported as incomplete).
const CHUNKED_KEYS_MAX = JOIN_ROW_CAP; // live 2026-10-24: 2,810 open-house keys searched exactly in 4.5s
const CHUNK_CONCURRENCY = 4;

// `ListingKey in (...)` clauses (or one per agent / office field) for these keys, each within the URL budget.
function keyClauses(fields: string[], keys: string[], baseFilter: string, select: string[]): string[] {
  const clause = (ks: string[]) => `(${fields.map((f) => `${f} in (${ks.map(quoteKey).join(",")})`).join(" or ")})`;
  const out: string[] = [];
  let chunk: string[] = [];
  for (const k of keys) {
    if (chunk.length && encodedLength(`${baseFilter} and ${clause([...chunk, k])}`, select) > URL_BUDGET) { out.push(clause(chunk)); chunk = []; }
    chunk.push(k);
  }
  if (chunk.length) out.push(clause(chunk));
  return out;
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// Records merged from several requests, in the order Cotality's $orderby would give them. Ties
// (equal prices, equal timestamps) fall back to ListingKey so every page boundary is the same on
// every request — the merge order of concurrent requests is not stable.
function byOrder(orderby: string) {
  const terms = orderby.split(",").map((t) => { const [field, dir] = t.trim().split(/\s+/); return { field, desc: /^desc$/i.test(dir || "") }; });
  return (a: Record<string, unknown>, b: Record<string, unknown>) => {
    for (const { field, desc } of terms) {
      const x = a[field], y = b[field];
      if (x === y || (x == null && y == null)) continue;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x) < String(y) ? -1 : 1;
      return desc ? -c : c;
    }
    const ka = String(a.ListingKey ?? ""), kb = String(b.ListingKey ?? "");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

// Mallan's own agents get their headshot and licence from Mallan's agent records, matched by REBNY
// MLS member id (Agent.trestle_mls_id). Cotality delivers no agent photos (Media has 0 Member rows,
// live 2026-10-24). Read-only; on any failure the cards show initials and the search is unaffected.
async function attachMallanAgents(listings: Array<{ agent?: AgentContact; coAgents?: AgentContact[]; agentLicense?: string | null; agentPhoto?: string | null }>) {
  const people = listings.flatMap((l) => [l.agent, ...(l.coAgents || [])]).filter((a): a is AgentContact => !!a && !!a.mlsId);
  const ids = [...new Set(people.map((a) => a.mlsId as string))];
  if (ids.length === 0) return;
  try {
    const rows = await prisma.agent.findMany({
      where: { trestle_mls_id: { in: ids }, status: "active" },
      select: { trestle_mls_id: true, photo: true, license_no: true },
    });
    const byId = new Map(rows.map((r) => [String(r.trestle_mls_id), r]));
    for (const a of people) {
      const m = byId.get(a.mlsId as string);
      if (!m) continue;
      a.photo = m.photo || null;
      if (!a.license && m.license_no) a.license = m.license_no;
    }
    for (const l of listings) { l.agentPhoto = l.agent?.photo ?? null; l.agentLicense = l.agent?.license ?? null; }
  } catch (err) {
    console.warn("[IDX Search] Mallan agent lookup failed:", err instanceof Error ? err.message : String(err));
  }
}

interface JoinReport { criterion: string; resource: string; matched: number; complete: boolean; execution: "cotality" | "local" }

// Step 1 of a linked-resource criterion: the keys of the resource rows that match it.
async function resolveJoin(j: JoinCriterion): Promise<{ keys: string[]; complete: boolean }> {
  const rows = await fetchFromTrestle({
    resource: j.resource, filter: j.filter, select: [j.key], orderby: "ModificationTimestamp desc",
    count: true, top: 1000, maxTotal: JOIN_ROW_CAP, timeoutMs: COTALITY_TIMEOUT_MS,
  });
  const keys = [...new Set(rows.records.map((r) => r[j.key]).filter((v) => v != null && v !== "").map(String))];
  return { keys, complete: rows.records.length >= (rows.odataCount ?? rows.records.length) };
}

const orClause = (clauses: string[]) => (clauses.length === 1 ? clauses[0] : `(${clauses.join(" or ")})`);

// Every CustomProperty row (ListingKey + the REBNY CustomFields JSON) of one sides/statuses slice,
// read completely and kept for CACHE_TTL_MS; null when the slice is larger than CUSTOM_SLICE_MAX.
interface CustomSlice { rows: Array<{ key: string; fields: Record<string, unknown> }>; complete: boolean }
const customSlices = new Map<string, { expiresAt: number; slice: CustomSlice | null }>();
const CUSTOM_SLICE_ENTRIES = 6;

async function readCustomSlice(filter: string): Promise<CustomSlice | null> {
  const hit = customSlices.get(filter);
  if (hit && hit.expiresAt > Date.now()) return hit.slice;
  const probe = await fetchFromTrestle({
    resource: "CustomProperty", filter, select: ["ListingKey"], orderby: "ListingKey", top: 1, maxTotal: 1, count: true,
    timeoutMs: COTALITY_TIMEOUT_MS,
  });
  const total = probe.odataCount ?? 0;
  let slice: CustomSlice | null = null;
  if (total <= CUSTOM_SLICE_MAX) {
    const rows = await fetchFromTrestle({
      resource: "CustomProperty", filter, select: ["ListingKey", "CustomFields"], orderby: "ListingKey", top: 1000,
      maxTotal: CUSTOM_SLICE_MAX, count: true, timeoutMs: COTALITY_TIMEOUT_MS,
    });
    const parse = (s: unknown): Record<string, unknown> => {
      if (typeof s !== "string" || s === "") return {};
      try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
    };
    slice = {
      rows: rows.records.map((r) => ({ key: String(r.ListingKey), fields: parse(r.CustomFields) })),
      complete: rows.records.length >= (rows.odataCount ?? total),
    };
  }
  if (customSlices.size >= CUSTOM_SLICE_ENTRIES) customSlices.delete(customSlices.keys().next().value as string);
  customSlices.set(filter, { expiresAt: Date.now() + CACHE_TTL_MS, slice });
  return slice;
}

const readsCustomFields = (c: LocalCriterion) => c.source === "customFields" || !!c.needsCustomFields || !!c.members?.some((m) => m.source === "customFields");

function selectFor(sides: SearchSide[], extra: string[]): string[] {
  return [...new Set([...SEARCH_SELECT_FIELDS, ...extra])].filter(
    (f) => SEARCH_CONTRACT.property[f]?.select !== "REJECTED" && sides.some((s) => carriedOn(f, s)),
  );
}

// $orderby accepts one or more "<Field> [asc|desc]" terms on fields Cotality filters/orders.
function validSort(sort: string): boolean {
  return sort.split(",").every((term) => {
    const m = /^\s*([A-Za-z0-9_]+)(\s+(asc|desc))?\s*$/.exec(term);
    return !!m && SEARCH_CONTRACT.property[m[1]]?.filter === "SUPPORTED";
  });
}

// ── In-memory cache ────────────────────────────────────────────────────
interface CacheEntry {
  data: unknown;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_ENTRIES = 100;

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: unknown): void {
  // Evict oldest if at capacity
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Route handler ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Auth: require agent or broker session
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const logger = logFetchAttempt("/api/idx/search");

  try {
    // Gate: IDX must be enabled with credentials
    const enabled = process.env.IDX_ENABLED === "true";
    if (!enabled || !hasCredentials()) {
      logger.complete("disabled", "IDX not enabled or missing credentials");
      return NextResponse.json(
        { error: "IDX search not available", code: "IDX_UNAVAILABLE" },
        {
          status: 503,
          headers: { "Cache-Control": "private, no-store" },
        }
      );
    }

    // Parse query params
    const params = req.nextUrl.searchParams;
    const limit = Math.min(Number(params.get("limit")) || 50, 500);
    const skip = Number(params.get("skip")) || 0;
    const sort = params.get("sort"); // OData $orderby value (e.g. "ListPrice desc")

    // Live Cotality geography: typed neighborhoods and boroughs resolve to the exact values
    // Cotality carries now (cached in memory a few hours). If the pull fails, typed values go as given.
    let geo: GeoInventory | null = null;
    try {
      geo = await getLiveGeography();
    } catch (err) {
      console.warn("[idx/search] live geography unavailable; sending typed location values as given:", (err as Error).message);
    }
    const query = buildCrmIdxQuery(params, geo);
    if (sort && !validSort(sort)) {
      query.refused.push({ criterion: "sort", reason: `Cotality cannot order by '${sort}'` });
    }
    if (query.refused.length > 0) {
      logger.complete("error", `refused ${query.refused.map((r) => r.criterion).join(",")}`);
      return NextResponse.json(
        {
          error: "Some search criteria are not available in Cotality",
          code: "CRITERIA_UNAVAILABLE",
          refused: query.refused,
        },
        { status: 422, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    // Cache key: the full criteria (local criteria are not part of the OData filter)
    const cacheKey = `idx:${[...params.entries()].sort().map(([k, v]) => `${k}=${v}`).join("&")}`;
    const cached = getCached(cacheKey);
    if (cached) {
      logger.complete("success");
      return NextResponse.json(cached, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // Fetch from Cotality (READ-ONLY GET). Photos are lazy-loaded by the UI through
    // /api/media/batch — Trestle rejects $expand=Media (PR-S.1c).
    const orderby = sort || "ModificationTimestamp desc";

    // Linked-resource criteria (open houses, rooms, agents, offices, CustomProperty columns):
    // step 1 reads the matching keys from that resource; step 2 searches Property for them — in
    // the Cotality filter when they fit one request, otherwise in Mallan's local scan below.
    const joins: JoinReport[] = [];
    const expand: string[] = [...CUSTOM_PROPERTY_SELECT];
    // One large key set is searched exactly in several Property requests (any others: local tests).
    let chunked: { fields: string[]; keys: string[] } | null = null;
    for (const j of query.joins) {
      const { keys, complete } = await resolveJoin(j);
      const inClause = `(${j.propertyFields.map((f) => `${f} in (${keys.map(quoteKey).join(",")})`).join(" or ")})`;
      const fits = encodedLength(`${query.filter} and ${inClause}`, selectFor(query.sides, query.select)) <= URL_BUDGET;
      if (keys.length === 0 || fits) {
        if (keys.length) query.filter = `${query.filter} and ${inClause}`;
        joins.push({ criterion: j.criterion, resource: j.resource, matched: keys.length, complete, execution: "cotality" });
      } else if (complete && keys.length <= CHUNKED_KEYS_MAX && !chunked) {
        // Too many keys for one request: the same Property search, in several requests.
        chunked = { fields: j.propertyFields, keys };
        query.select.push(...j.propertyFields);
        joins.push({ criterion: j.criterion, resource: j.resource, matched: keys.length, complete, execution: "cotality" });
      } else if (j.fallback) {
        // Too many keys even for several requests: Mallan applies the same criteria to each scanned listing.
        query.local.push(j.fallback.criterion);
        expand.push(...j.fallback.expand.filter((f) => !expand.includes(f)));
        joins.push({ criterion: j.criterion, resource: j.resource, matched: keys.length, complete: true, execution: "local" });
      } else {
        const wanted = new Set(keys);
        query.local.push({
          criterion: j.criterion, field: j.propertyFields[0], source: "record",
          test: (rec) => j.propertyFields.some((f) => wanted.has(String((rec as Record<string, unknown>)[f] ?? ""))),
        });
        query.select.push(...j.propertyFields);
        joins.push({ criterion: j.criterion, resource: j.resource, matched: keys.length, complete, execution: "local" });
      }
    }
    const noJoinMatch = joins.some((j) => j.matched === 0);
    const fullSelect = selectFor(query.sides, query.select);

    let records: Record<string, unknown>[];
    let total: number;
    let hasMore: boolean;
    let localScan: { checked: number; cotalityMatches: number; complete: boolean } | null = null;

    if (noJoinMatch) {
      // No open house / room / agent / office row matches: no listing can.
      records = [];
      total = 0;
      hasMore = false;
    } else if (query.local.length === 0 && !chunked) {
      const result = await fetchFromTrestle({
        filter: query.filter, select: fullSelect, orderby, count: true, top: limit, skip, maxTotal: limit,
        expandCustomProperty: expand, timeoutMs: COTALITY_TIMEOUT_MS,
      });
      records = result.records;
      total = result.odataCount ?? records.length;
      hasMore = skip + records.length < total;
    } else {
      // Criteria Cotality refuses to filter are applied here, in Mallan's layer, over the
      // Cotality matches for every criterion it does filter (Master §0.4, §5.0). Step 1 scans
      // the matches with only the fields those criteria read; step 2 loads the full records
      // for the requested page, in the same order.
      const orderFields = orderby.split(",").map((t) => t.trim().split(/\s+/)[0]);
      const scanSelect = [...new Set(["ListingKey", ...query.select, ...orderFields])];
      let scanned: Record<string, unknown>[];
      let cotalityMatches: number | null = null;
      let scanComplete: boolean;
      // Several Property requests whose rows are unioned: a linked-resource key set too large for
      // one request, or the key sets of REBNY custom-field criteria (below).
      let unionClauses: string[] | null = chunked ? keyClauses(chunked.fields, chunked.keys, query.filter, scanSelect) : null;

      if (!chunked && query.local.some(readsCustomFields)) {
        const probe = await fetchFromTrestle({
          filter: query.filter, select: ["ListingKey"], orderby, top: 1, maxTotal: 1, count: true, timeoutMs: COTALITY_TIMEOUT_MS,
        });
        cotalityMatches = probe.odataCount ?? 0;
        const sliceFilter = query.statuses.length === 0 ? null : [
          orClause(query.sides.map((s) => `PropertyType eq '${SEARCH_CONTRACT.types[s]}'`)),
          orClause(query.statuses.map((v) => `StandardStatus eq '${v}'`)),
        ].join(" and ");
        const slice = cotalityMatches > SCAN_EXACT_MAX && sliceFilter ? await readCustomSlice(sliceFilter) : null;
        if (slice) {
          // Each REBNY criterion becomes the set of ListingKeys whose CustomFields satisfy it; the
          // AND-ed criteria (intersected) or else the first mixed OR group drive the Property
          // requests, and every criterion is still applied to each row (exact, no expand needed).
          const keysWhere = (field: string, test: (v: unknown) => boolean) =>
            new Set(slice.rows.filter((r) => test(r.fields[field])).map((r) => r.key));
          let andKeys: Set<string> | null = null;
          let driver: { propClause: string | null; keys: Set<string> } | null = null;
          query.local = query.local.map((c): LocalCriterion => {
            if (c.source === "customFields") {
              const keys = keysWhere(c.field, c.test);
              andKeys = andKeys ? new Set([...andKeys].filter((k) => keys.has(k))) : keys;
              joins.push({ criterion: c.criterion, resource: "CustomProperty", matched: keys.size, complete: slice.complete, execution: "cotality" });
              return { criterion: c.criterion, field: c.field, source: "record", test: (rec) => keys.has(String((rec as Record<string, unknown>).ListingKey)) };
            }
            if (c.members && c.members.some((m) => m.source === "customFields")) {
              const custom = c.members.filter((m) => m.source === "customFields");
              const props = c.members.filter((m) => m.source === "property");
              const keys = new Set(custom.flatMap((m) => [...keysWhere(m.field, m.test)]));
              if (!driver && props.every((m) => m.execution === "cotality")) {
                driver = { propClause: props.length ? orClause(props.map((m) => m.clause)) : null, keys };
              }
              joins.push({ criterion: c.criterion, resource: "CustomProperty", matched: keys.size, complete: slice.complete, execution: "cotality" });
              return {
                criterion: c.criterion, field: c.field, source: "record",
                test: (rec) => { const r = rec as Record<string, unknown>; return props.some((m) => m.test(r[m.field])) || keys.has(String(r.ListingKey)); },
              };
            }
            return c;
          });
          const and = andKeys as Set<string> | null;
          const drv = driver as { propClause: string | null; keys: Set<string> } | null;
          if (and) unionClauses = keyClauses(["ListingKey"], [...and], query.filter, scanSelect);
          else if (drv) unionClauses = [...(drv.propClause ? [drv.propClause] : []), ...keyClauses(["ListingKey"], [...drv.keys], query.filter, scanSelect)];
        }
      }

      // The expand is read only when a remaining criterion reads the REBNY block (200 rows a page);
      // a plain scan pages at 1,000 (Cotality's $top ceiling for an ordered, counted query).
      const needsCustom = query.local.some(readsCustomFields) || expand.length > CUSTOM_PROPERTY_SELECT.length;
      const scanExpand = needsCustom ? expand : false;
      const scanCap = needsCustom ? LOCAL_SCAN_CAP : PLAIN_SCAN_CAP;
      if (unionClauses && unionClauses.length === 0) {
        // The key sets are empty: no listing can match.
        scanned = [];
        cotalityMatches = cotalityMatches ?? 0;
        scanComplete = true;
      } else if (unionClauses) {
        // Every request, merged (one row per ListingKey) and re-ordered.
        const pages = await inBatches(unionClauses, CHUNK_CONCURRENCY, (c) => fetchFromTrestle({
          filter: `${query.filter} and ${c}`, select: scanSelect, orderby, count: true,
          top: 1000, maxTotal: scanCap, expandCustomProperty: scanExpand, timeoutMs: COTALITY_TIMEOUT_MS,
        }));
        const unique = new Map(pages.flatMap((pg) => pg.records).map((r) => [String(r.ListingKey), r]));
        scanned = [...unique.values()].sort(byOrder(orderby));
        cotalityMatches = cotalityMatches ?? pages.reduce((sum, pg) => sum + (pg.odataCount ?? pg.records.length), 0);
        scanComplete = pages.every((pg) => pg.records.length >= (pg.odataCount ?? pg.records.length)) &&
          joins.every((j) => j.resource !== "CustomProperty" || j.complete);
      } else {
        const scan = await fetchFromTrestle({
          filter: query.filter, select: scanSelect, orderby, count: true,
          top: 1000, maxTotal: scanCap, expandCustomProperty: scanExpand, timeoutMs: COTALITY_TIMEOUT_MS,
        });
        scanned = scan.records;
        cotalityMatches = scan.odataCount ?? scan.records.length;
        scanComplete = scan.records.length >= cotalityMatches;
      }
      const matched = applyLocalCriteria(scanned, query.local);
      localScan = { checked: scanned.length, cotalityMatches, complete: scanComplete };
      const pageKeys = matched.slice(skip, skip + limit).map((r) => String(r.ListingKey));
      total = matched.length;
      hasMore = skip + limit < matched.length;
      if (pageKeys.length === 0) {
        records = [];
      } else {
        const byKey = await fetchByKeys(pageKeys, fullSelect, orderby, expand);
        records = pageKeys.map((k) => byKey.get(k)).filter((r): r is Record<string, unknown> => !!r);
      }
    }

    // Silent building upsert — populate building DB from search results
    const seenBuildingKeys = new Set<number>();
    for (const record of records) {
      const bk = record.BuildingKeyNumeric;
      if (bk != null && !seenBuildingKeys.has(Number(bk))) {
        seenBuildingKeys.add(Number(bk));
        upsertBuildingFromSearchResult(Number(bk), record).catch(() => {});
      }
    }

    // Map to CRM flat shape
    const listings = records.map((record, i) => mapTrestleToCrmListing(record, skip + i));
    await attachMallanAgents(listings);
    // The Tools viewers read an RLS listing LIVE (never a database copy): one exact-id request with raw=1 also carries the
    // Cotality row itself (every selected Property field and the expanded CustomProperty), so the read-only pages can show the
    // listing agent's listing with full information (Master 7.1). Agent-authenticated route; single listing only.
    if (params.get("raw") === "1" && (params.get("listingId") || params.get("listingKey"))) {
      listings.forEach((l, i) => { (l as unknown as Record<string, unknown>).raw = records[i]; });
    }

    const response = {
      listings,
      total,
      totalCount: total,
      hasMore,
      skip,
      limit,
      attribution: generateAttributionText(),
      // Photos are always lazy-loaded by the frontend (photo-loader.js → /api/media/batch)
      mediaMode: "lazy" as const,
      // Criteria applied by Mallan after retrieval; when incomplete the UI must say so
      localCriteria: query.local.map((c) => c.criterion),
      localScan,
      // Linked-resource criteria: rows matched in that resource; incomplete must be shown
      joins,
      _meta: {
        source: "cotality",
        audience: "agent",
        contractPulledAt: SEARCH_CONTRACT.pulled_at,
        fetchedAt: new Date().toISOString(),
        filter: query.filter,
        sides: query.sides,
      },
    };

    // Cache the response
    setCache(cacheKey, response);

    // ── Temporary count-only + safe-value telemetry (Phase 0a/incident triage) ──
    // No PII, no record content, no tokens, no auth. Counts, parameter keys,
    // and safe picklist/numeric param VALUES only. Free-text user input
    // (address, keyword, listingId, unit, building names) is logged as boolean
    // presence ONLY; the OData filter is not logged.
    const imagesWithMedia = listings.filter(
      (l) => Array.isArray((l as { images?: unknown[] }).images) && ((l as { images?: unknown[] }).images?.length ?? 0) > 0,
    ).length;
    console.log(
      JSON.stringify({
        evt: "idx_search_telemetry",
        ts: new Date().toISOString(),
        params_keys: Array.from(params.keys()).sort(),
        type_value: params.get("type") || null,
        status_value: params.get("status") || null,
        borough_value: params.get("borough") || null,
        neighborhood_value: params.get("neighborhood") || null,
        ownership_value: params.get("ownership") || null,
        propertySubType_value: params.get("propertySubType") || null,
        minBeds_value: params.get("minBeds") || params.get("beds") || null,
        maxBeds_value: params.get("maxBeds") || null,
        minPrice_value: params.get("minPrice") || null,
        maxPrice_value: params.get("maxPrice") || null,
        has_address: !!params.get("address"),
        has_keyword: !!params.get("keyword"),
        has_listing_id: !!params.get("listingId"),
        has_checkboxFilters: !!params.get("checkboxFilters"),
        limit,
        skip,
        filter_length: query.filter.length,
        cotality_total: total,
        local_criteria: query.local.length,
        local_scan_complete: localScan ? localScan.complete : null,
        joins: joins.map((j) => `${j.resource}:${j.matched}:${j.execution}${j.complete ? "" : ":incomplete"}`),
        mapper_returned: listings.length,
        listings_with_images: imagesWithMedia,
      }),
    );

    logger.complete("success");

    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    // Handle specific error types
    if (message.includes("429") || message.includes("rate limit")) {
      logger.complete("error", "Rate limited by Cotality");
      return NextResponse.json(
        { error: "Search temporarily unavailable. Please try again shortly." },
        {
          status: 503,
          headers: {
            "Cache-Control": "private, no-store",
            "Retry-After": "30",
          },
        }
      );
    }

    logger.complete("error", message);
    console.error("[IDX Search] Error:", message);

    return NextResponse.json(
      { error: "Search failed. Please try again later." },
      {
        status: 502,
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  }
}
