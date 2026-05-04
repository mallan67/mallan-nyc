// GET /api/idx/diagnostic-distribution
//
// TEMPORARY DIAGNOSTIC ENDPOINT — Bug A8 investigation.
// Compares CRM sale-search PropertyType filter variants against RealPlus
// counts to identify whether `PropertyType ne 'ResidentialLease'` is too
// permissive (admits MultiFamily/CommercialSale/Land/etc.).
//
// AUTH: agent-or-broker session — mirrors /api/idx/search exactly so the
// same CRM cookie that authorizes the search UI authorizes this diagnostic.
// Matches the user's CRM session role (broker portal logins resolve as
// AGENT-tier for the IDX search context; requireBroker would 401 even
// for the principal broker because the session role does not match).
// No public access.
// PII: none. Counts and category breakdowns only — no addresses, no agents,
// no listing IDs, no media URLs, no tokens, no cookies.
// SCOPE: this file is removable in a follow-up cleanup commit once the
// distribution evidence is logged. See memory/REFACTOR-2026-04-25.md and
// docs/architecture/REPO-SOURCE-OF-TRUTH-CHARTER.md — diagnostic-only
// surface, not part of the long-lived API surface.
//
// Request:
//   GET /api/idx/diagnostic-distribution?type=sale&status=Active&borough=Manhattan&minBeds=1&maxBeds=1
//
// Response:
//   {
//     evt: "idx_diagnostic_distribution",
//     inputs: {...},
//     base_filter: "...",
//     counts: { A_current_ne_ResidentialLease: {filter,count,ms}, B_residential_only: {...}, C_residential_plus_income: {...} },
//     distribution_by_property_type: { filter, rows: [{PropertyType,Count}, ...] },
//     distribution_by_property_subtype: { filter, rows: [{PropertySubType,Count}, ...] }
//   }
//
// The same JSON is also logged via console.log so it can be pulled from
// Vercel logs without screen-scraping the response body.

import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getAccessToken, hasCredentials } from "@/lib/idx/auth";

const TRESTLE_API_URL = (
  process.env.TRESTLE_API_URL || "https://api.cotality.com/trestle"
).replace(/\/$/, "");

interface CountResult {
  filter: string;
  count: number;
  ms: number;
  error?: string;
}

interface GroupByResult {
  filter: string;
  groupby: string;
  rows: Array<Record<string, unknown>>;
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

async function fetchGroupBy(
  filter: string,
  groupBy: string,
  token: string,
): Promise<GroupByResult> {
  const apply = `filter(${filter})/groupby((${groupBy}),aggregate($count as Count))`;
  const url = `${TRESTLE_API_URL}/odata/Property?$apply=${encodeURIComponent(apply)}`;
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        filter,
        groupby: groupBy,
        rows: [],
        ms: Date.now() - start,
        error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = await res.json();
    return {
      filter,
      groupby: groupBy,
      rows: data.value || [],
      ms: Date.now() - start,
    };
  } catch (err) {
    return {
      filter,
      groupby: groupBy,
      rows: [],
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(req: NextRequest) {
  // Same auth helper as /api/idx/search — agent or broker session cookie
  // required. Clients/portal users cannot hit this.
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

  // Build base filter (everything except PropertyType — variants below tack PropertyType on the front).
  const baseFilters: string[] = [];
  baseFilters.push(`CityRegion eq '${escapeOData(borough)}'`);
  if (minBeds != null) baseFilters.push(`BedroomsTotal ge ${minBeds}`);
  if (maxBeds != null) baseFilters.push(`BedroomsTotal le ${maxBeds}`);
  if (status && status !== "*") {
    baseFilters.push(`StandardStatus eq '${escapeOData(status)}'`);
  }
  const BASE = baseFilters.join(" and ");

  const variants =
    type === "sale"
      ? {
          A_current_ne_ResidentialLease: `PropertyType ne 'ResidentialLease' and ${BASE}`,
          B_residential_only: `PropertyType eq 'Residential' and ${BASE}`,
          C_residential_plus_income: `(PropertyType eq 'Residential' or PropertyType eq 'ResidentialIncome') and ${BASE}`,
        }
      : {
          rental_eq_ResidentialLease: `PropertyType eq 'ResidentialLease' and ${BASE}`,
        };

  const token = await getAccessToken();

  // Run count queries in parallel.
  const countEntries = await Promise.all(
    Object.entries(variants).map(async ([key, filter]) => {
      const result = await fetchCount(filter, token);
      return [key, result] as const;
    }),
  );
  const counts: Record<string, CountResult> = Object.fromEntries(countEntries);

  // Distribution by PropertyType — uses the broadest sale-side base
  // (PropertyType ne 'ResidentialLease') so we see which categories the
  // CURRENT filter admits.
  const groupByPropertyType = await fetchGroupBy(
    type === "sale"
      ? `PropertyType ne 'ResidentialLease' and ${BASE}`
      : `PropertyType eq 'ResidentialLease' and ${BASE}`,
    "PropertyType",
    token,
  );

  // Distribution by PropertySubType — uses Residential-only so we see the
  // breakdown of the residential-sale slice (Condominium, StockCooperative,
  // SingleFamilyResidence, Townhouse, etc.).
  const groupByPropertySubType = await fetchGroupBy(
    `PropertyType eq 'Residential' and ${BASE}`,
    "PropertySubType",
    token,
  );

  const summary = {
    evt: "idx_diagnostic_distribution",
    ts: new Date().toISOString(),
    inputs: { type, status, borough, minBeds, maxBeds },
    base_filter: BASE,
    counts,
    distribution_by_property_type: {
      filter: groupByPropertyType.filter,
      ms: groupByPropertyType.ms,
      error: groupByPropertyType.error,
      rows: groupByPropertyType.rows,
    },
    distribution_by_property_subtype: {
      filter: groupByPropertySubType.filter,
      ms: groupByPropertySubType.ms,
      error: groupByPropertySubType.error,
      rows: groupByPropertySubType.rows,
    },
  };

  // Log to Vercel so we can pull via `vercel logs` without screen-scraping.
  console.log(JSON.stringify(summary));

  return NextResponse.json(summary, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
