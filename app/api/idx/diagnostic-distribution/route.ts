// GET /api/idx/diagnostic-distribution
//
// TEMPORARY DIAGNOSTIC ENDPOINT — Bug A8 investigation, round 2.
//
// Round 1 (commit b0cf2a39) used OData `$apply=filter(...)/groupby(...)` to
// get distributions in one query. Trestle 5.0 rejected those calls with
// HTTP 400 ("Field named 'filterPropertyTypene'ResidentialLease'and..." —
// Trestle parses the entire filter expression as a field name when wrapped
// in $apply). The OData v4.01 aggregation extension is OPTIONAL per the
// spec and Trestle 5.0 does not implement it.
//
// Round 2 fix: drop $apply entirely, replace with parallel `$top=1&$count`
// queries — one per distinct value of each enumerated field. Slower but
// reliable. Each query returns just the count for a (BASE filter AND field
// eq value) tuple. Total queries for the requested distributions:
//
//   PropertySubType (15 NYC values)  = 15
//   MlsStatus (17 enum values)       = 17
//   CommonInterest (8 NYC values)    =  8
//   InternetEntireListingDisplayYN   =  3 (true/false/null)
//   InternetAddressDisplayYN         =  3 (true/false/null)
//   Time-on-market age buckets       =  4
//   ─────────────────────────────────────
//   TOTAL                            = 50 distribution queries + 3 base
//                                    + paginated fetch (~11 calls)
//                                    = ~64 Trestle calls
//
// Trestle rate limit: 180/min (3/sec). Comfortably under cap.
//
// Compliance gate aggregation: fetches all matching records (paginated,
// top=200 per page) and runs checkDistributionGates() on each. Reports
// pass/fail counts and pass-by-reason histogram. This is what
// /api/idx/search would actually return to the user — the prior round's
// telemetry showed gate_passed=200/200 on the FIRST 200, but didn't
// quantify the remaining 1,902.
//
// AUTH: requireAgentOrBroker — same as /api/idx/search.
// PII: none. Aggregate counts only — no addresses, no agents, no listing
// IDs, no media URLs, no tokens, no cookies. Records fetched for the gate
// check are processed in-memory and discarded; only counts persist.
// SCOPE: removable in the same cleanup commit that drops the broker-only
// button at public/crm/js/init/init-diagnostic-bug-a8.js.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getAccessToken, hasCredentials } from "@/lib/idx/auth";
import { checkDistributionGates } from "@/lib/idx/trestle-mapper";

const TRESTLE_API_URL = (
  process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle"
).replace(/\/$/, "");

interface CountResult {
  filter: string;
  count: number;
  ms: number;
  error?: string;
}

interface GateAggregate {
  records_scanned: number;
  pages_fetched: number;
  gate_passed: number;
  gate_blocked: number;
  blocked_by_reason: Record<string, number>;
  display_yn_distribution: {
    internet_entire_listing: { true: number; false: number; null: number };
    internet_address: { true: number; false: number; null: number };
  };
  ms: number;
  error?: string;
}

function escapeOData(value: string): string {
  return value.replace(/'/g, "''");
}

async function fetchCount(filter: string, token: string): Promise<CountResult> {
  const url =
    `${TRESTLE_API_URL}/odata/Property?` +
    `$filter=${encodeURIComponent(filter)}` +
    `&$top=1` +
    `&$count=true` +
    `&$select=ListingId`;
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        filter,
        count: -1,
        ms: Date.now() - start,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = await res.json();
    return {
      filter,
      count: Number(data["@odata.count"] ?? -1),
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      filter,
      count: -1,
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// PropertySubType values that show up in Manhattan residential. From
// metadata.xml lines 8905-9182 and CRM SearchControlMap. Top-15-ish.
const PROPERTY_SUBTYPE_NYC = [
  "Apartment",
  "Condominium",
  "StockCooperative",
  "Condop",
  "SingleFamilyResidence",
  "Townhouse",
  "MultiFamily",
  "Duplex",
  "Triplex",
  "Loft",
  "Cluster",
  "Cabin",
  "Detached",
  "Attached",
  "HalfDuplex",
];

// MlsStatus values per metadata.xml lines 8723-8792. All 17 — we want
// to see whether any active rows have MlsStatus values different from
// 'Active' (e.g., REBNY may file sub-statuses like Contingent or
// AttorneyReview that RealPlus filters out of Active).
const MLS_STATUS_ENUM = [
  "Active",
  "ActiveUnderContract",
  "AttorneyReview",
  "Canceled",
  "Closed",
  "ComingSoon",
  "CompSold",
  "Contingent",
  "Delete",
  "Expired",
  "Hold",
  "Incomplete",
  "Leased",
  "OptionPeriod",
  "Pending",
  "Terminated",
  "Withdrawn",
];

// CommonInterest values likely to appear in NYC. Per metadata.xml
// lines 7489-7530 and additional values verified via grep.
const COMMON_INTEREST_NYC = [
  "Condominium",
  "Condop",
  "StockCooperative",
  "CommunityApartment",
  "PlannedDevelopment",
  "RentalBuilding",
  "None",
  "Other",
];

const SEARCH_FIELDS_FOR_GATE = [
  "ListingId",
  "StandardStatus",
  "MlsStatus",
  "Permissions",
  "InternetEntireListingDisplayYN",
  "InternetAddressDisplayYN",
  "InternetAutomatedValuationDisplayYN",
  "InternetConsumerCommentYN",
  "CloseDate",
  "ListAgentMlsId",
  "PropertyType",
  "PropertySubType",
  "CommonInterest",
  "BedroomsTotal",
  "CityRegion",
  "PostalCode",
  "ListingContractDate",
];

async function fetchAndGateAggregate(
  baseFilter: string,
  token: string,
): Promise<GateAggregate> {
  const start = Date.now();
  const aggregate: GateAggregate = {
    records_scanned: 0,
    pages_fetched: 0,
    gate_passed: 0,
    gate_blocked: 0,
    blocked_by_reason: {},
    display_yn_distribution: {
      internet_entire_listing: { true: 0, false: 0, null: 0 },
      internet_address: { true: 0, false: 0, null: 0 },
    },
    ms: 0,
  };
  const PAGE = 200;
  const MAX_PAGES = 15; // ~3,000 records max (covers our 2,102 with margin)
  let skip = 0;
  let nextLink: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url: string =
      nextLink ||
      `${TRESTLE_API_URL}/odata/Property?` +
        `$filter=${encodeURIComponent(baseFilter)}` +
        `&$select=${SEARCH_FIELDS_FOR_GATE.join(",")}` +
        `&$top=${PAGE}` +
        `&$skip=${skip}` +
        `&$orderby=ModificationTimestamp desc`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);
    try {
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        aggregate.error = `HTTP ${res.status} on page ${page}: ${text.slice(0, 200)}`;
        break;
      }
      const data: { value?: Array<Record<string, unknown>>; "@odata.nextLink"?: string } = await res.json();
      const records: Array<Record<string, unknown>> = data.value || [];
      if (records.length === 0) break;
      aggregate.pages_fetched++;
      for (const record of records) {
        aggregate.records_scanned++;
        const gate = checkDistributionGates(record);
        if (gate.displayable) {
          aggregate.gate_passed++;
        } else {
          aggregate.gate_blocked++;
          const reason = gate.reason || "unknown";
          aggregate.blocked_by_reason[reason] =
            (aggregate.blocked_by_reason[reason] || 0) + 1;
        }
        const ie = record.InternetEntireListingDisplayYN;
        if (ie === true) aggregate.display_yn_distribution.internet_entire_listing.true++;
        else if (ie === false) aggregate.display_yn_distribution.internet_entire_listing.false++;
        else aggregate.display_yn_distribution.internet_entire_listing.null++;
        const ia = record.InternetAddressDisplayYN;
        if (ia === true) aggregate.display_yn_distribution.internet_address.true++;
        else if (ia === false) aggregate.display_yn_distribution.internet_address.false++;
        else aggregate.display_yn_distribution.internet_address.null++;
      }
      nextLink = data["@odata.nextLink"] || null;
      skip += records.length;
      if (!nextLink && records.length < PAGE) break;
    } catch (err) {
      aggregate.error = err instanceof Error ? err.message : String(err);
      break;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  aggregate.ms = Date.now() - start;
  return aggregate;
}

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "Trestle credentials not configured" },
      { status: 503 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") || "sale").toLowerCase();
  const status = sp.get("status") || "Active";
  const borough = sp.get("borough") || "Manhattan";
  const minBedsRaw = sp.get("minBeds");
  const maxBedsRaw = sp.get("maxBeds");

  if (type !== "sale" && type !== "rental") {
    return NextResponse.json(
      { error: "type must be 'sale' or 'rental'" },
      { status: 400 },
    );
  }

  const minBeds = minBedsRaw != null && minBedsRaw !== "" ? Number(minBedsRaw) : null;
  const maxBeds = maxBedsRaw != null && maxBedsRaw !== "" ? Number(maxBedsRaw) : null;

  if (minBeds != null && !Number.isFinite(minBeds)) {
    return NextResponse.json({ error: "minBeds must be numeric" }, { status: 400 });
  }
  if (maxBeds != null && !Number.isFinite(maxBeds)) {
    return NextResponse.json({ error: "maxBeds must be numeric" }, { status: 400 });
  }

  // Mirror the production sale filter (PropertyType ne 'ResidentialLease')
  // so the diagnostic operates on the same row set the user actually sees.
  const propertyTypeClause =
    type === "sale"
      ? "PropertyType ne 'ResidentialLease'"
      : "PropertyType eq 'ResidentialLease'";

  const baseFilters: string[] = [propertyTypeClause];
  baseFilters.push(`CityRegion eq '${escapeOData(borough)}'`);
  if (minBeds != null) baseFilters.push(`BedroomsTotal ge ${minBeds}`);
  if (maxBeds != null) baseFilters.push(`BedroomsTotal le ${maxBeds}`);
  if (status && status !== "*") {
    baseFilters.push(`StandardStatus eq '${escapeOData(status)}'`);
  }
  const BASE = baseFilters.join(" and ");

  const token = await getAccessToken();

  // Total count for the BASE — sanity-checks against earlier 2,102.
  const totalCount = await fetchCount(BASE, token);

  // Per-value distributions. Issue all in parallel — Trestle handles ~50
  // concurrent reads fine within a single client-credential's burst budget.
  const [
    propertySubtypeResults,
    mlsStatusResults,
    commonInterestResults,
    ieDisplayResults,
    iaDisplayResults,
    ageBucketResults,
  ] = await Promise.all([
    Promise.all(
      PROPERTY_SUBTYPE_NYC.map(async (value) => {
        const filter = `${BASE} and PropertySubType eq '${escapeOData(value)}'`;
        const r = await fetchCount(filter, token);
        return { value, count: r.count, error: r.error };
      }),
    ),
    Promise.all(
      MLS_STATUS_ENUM.map(async (value) => {
        const filter = `${BASE} and MlsStatus eq '${escapeOData(value)}'`;
        const r = await fetchCount(filter, token);
        return { value, count: r.count, error: r.error };
      }),
    ),
    Promise.all(
      COMMON_INTEREST_NYC.map(async (value) => {
        const filter = `${BASE} and CommonInterest eq '${escapeOData(value)}'`;
        const r = await fetchCount(filter, token);
        return { value, count: r.count, error: r.error };
      }),
    ),
    Promise.all([
      fetchCount(`${BASE} and InternetEntireListingDisplayYN eq true`, token).then((r) => ({ bucket: "true", count: r.count, error: r.error })),
      fetchCount(`${BASE} and InternetEntireListingDisplayYN eq false`, token).then((r) => ({ bucket: "false", count: r.count, error: r.error })),
      fetchCount(`${BASE} and InternetEntireListingDisplayYN eq null`, token).then((r) => ({ bucket: "null", count: r.count, error: r.error })),
    ]),
    Promise.all([
      fetchCount(`${BASE} and InternetAddressDisplayYN eq true`, token).then((r) => ({ bucket: "true", count: r.count, error: r.error })),
      fetchCount(`${BASE} and InternetAddressDisplayYN eq false`, token).then((r) => ({ bucket: "false", count: r.count, error: r.error })),
      fetchCount(`${BASE} and InternetAddressDisplayYN eq null`, token).then((r) => ({ bucket: "null", count: r.count, error: r.error })),
    ]),
    (async () => {
      const now = new Date();
      const iso = (d: Date) => d.toISOString().split("T")[0];
      const day30 = new Date(now); day30.setDate(now.getDate() - 30);
      const day90 = new Date(now); day90.setDate(now.getDate() - 90);
      const day180 = new Date(now); day180.setDate(now.getDate() - 180);
      return [
        { bucket: "<= 30d", filter: `${BASE} and ListingContractDate ge ${iso(day30)}` },
        { bucket: "31-90d", filter: `${BASE} and ListingContractDate ge ${iso(day90)} and ListingContractDate lt ${iso(day30)}` },
        { bucket: "91-180d", filter: `${BASE} and ListingContractDate ge ${iso(day180)} and ListingContractDate lt ${iso(day90)}` },
        { bucket: "> 180d or null", filter: `${BASE} and (ListingContractDate lt ${iso(day180)} or ListingContractDate eq null)` },
      ];
    })().then(async (buckets) => {
      const results = await Promise.all(
        buckets.map(async (b) => {
          const r = await fetchCount(b.filter, token);
          return { bucket: b.bucket, count: r.count, error: r.error };
        }),
      );
      return results;
    }),
  ]);

  // Compliance gate aggregation — fetch every matching record and run
  // checkDistributionGates against each. Reports what /api/idx/search
  // would actually surface to the user (post-gate).
  const gate = await fetchAndGateAggregate(BASE, token);

  // Filter out zero-count buckets to keep the response readable.
  const nonZero = <T extends { count: number }>(items: T[]) => items.filter((i) => i.count > 0);

  const summary = {
    evt: "idx_diagnostic_distribution",
    round: 2,
    ts: new Date().toISOString(),
    inputs: { type, status, borough, minBeds, maxBeds },
    base_filter: BASE,
    total_count: totalCount.count,
    property_subtype_distribution: nonZero(propertySubtypeResults),
    mls_status_distribution: nonZero(mlsStatusResults),
    common_interest_distribution: nonZero(commonInterestResults),
    internet_entire_listing_display_yn: ieDisplayResults,
    internet_address_display_yn: iaDisplayResults,
    listing_contract_date_age_buckets: ageBucketResults,
    compliance_gate_aggregate: gate,
  };

  console.log(JSON.stringify(summary));

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
