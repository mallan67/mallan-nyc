// lib/idx/fetch.ts
// OData v4 listing fetch from Trestle/REBNY RLS.
// Handles pagination via @odata.nextLink. Selects all 448 fields.

import { getAccessToken, invalidateToken } from "./auth";
import { IDX_PLUS_SELECT_FIELDS } from "./trestle-mapper";

// Derive Trestle property endpoint from centralized TRESTLE_API_URL.
// Env validation is deferred to call-time — no top-level throws (Vercel serverless safety).
function getPropertyEndpoint(): string {
  const base = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || "https://api.cotality.com/trestle";
  return `${base}/odata/Property`;
}
const MAX_PAGE_SIZE = 200;

export interface TrestleFetchOptions {
  /** OData $filter expression (e.g., "StandardStatus eq 'Active'") */
  filter?: string;
  /** Override $select (defaults to all 448 fields) */
  select?: string[];
  /** Max records per page (default 200) */
  top?: number;
  /** Skip N records */
  skip?: number;
  /** OData $orderby (default "ModificationTimestamp desc") */
  orderby?: string;
  /** Max total records to fetch across all pages (default 1000) */
  maxTotal?: number;
}

export interface TrestleFetchResult {
  records: Record<string, unknown>[];
  totalFetched: number;
  hasMore: boolean;
  nextLink?: string;
}

/**
 * Fetch listings from Trestle OData v4 API.
 * Automatically handles pagination via @odata.nextLink.
 */
export async function fetchFromTrestle(
  options: TrestleFetchOptions = {}
): Promise<TrestleFetchResult> {
  const token = await getAccessToken();

  const selectFields =
    options.select?.join(",") || IDX_PLUS_SELECT_FIELDS.join(",");

  function buildUrl(withMediaExpand: boolean): string {
    const params = new URLSearchParams();
    if (options.filter) params.set("$filter", options.filter);
    params.set("$select", selectFields);
    // Media is a navigation property — try $expand=Media for photo URLs
    if (withMediaExpand) params.set("$expand", "Media");
    params.set("$top", String(options.top || MAX_PAGE_SIZE));
    if (options.skip) params.set("$skip", String(options.skip));
    params.set("$orderby", options.orderby || "ModificationTimestamp desc");
    return `${getPropertyEndpoint()}?${params.toString()}`;
  }

  // Try with $expand=Media first; if Trestle rejects it (400), retry without
  let url = buildUrl(true);
  const firstResponse = await fetchPage(url, token);
  if (firstResponse.status === 400) {
    console.warn("[IDX Fetch] $expand=Media not supported — retrying without");
    url = buildUrl(false);
  } else if (firstResponse.status === 401) {
    // Token expired — will be handled in the pagination loop
    url = buildUrl(true);
  } else if (!firstResponse.ok) {
    // Other error with expand — try without
    console.warn(`[IDX Fetch] Error ${firstResponse.status} with $expand=Media — retrying without`);
    url = buildUrl(false);
  }

  const maxTotal = options.maxTotal || 1000;
  const allRecords: Record<string, unknown>[] = [];
  let currentUrl: string | null = url;
  let hasMore = false;
  let isFirstRequest = true;

  while (currentUrl && allRecords.length < maxTotal) {
    // Reuse the first response if we haven't retried
    let response: Response;
    if (isFirstRequest && firstResponse.ok) {
      response = firstResponse;
      isFirstRequest = false;
    } else {
      response = await fetchPage(currentUrl, token);
      isFirstRequest = false;
    }

    if (response.status === 401) {
      // Token expired — invalidate and retry once
      invalidateToken();
      const newToken = await getAccessToken();
      const retryResponse = await fetchPage(currentUrl, newToken);
      if (!retryResponse.ok) {
        throw new Error(
          `[IDX Fetch] Trestle API error after token refresh (${retryResponse.status})`
        );
      }
      const retryData = await retryResponse.json();
      allRecords.push(...(retryData.value || []));
      currentUrl = retryData["@odata.nextLink"] || null;
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown");
      throw new Error(
        `[IDX Fetch] Trestle API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();
    const records = data.value || [];
    allRecords.push(...records);

    // Check for next page
    currentUrl = data["@odata.nextLink"] || null;
    hasMore = currentUrl !== null;

    // Safety: stop if no records returned (prevent infinite loop)
    if (records.length === 0) break;
  }

  return {
    records: allRecords.slice(0, maxTotal),
    totalFetched: allRecords.length,
    hasMore: hasMore || allRecords.length >= maxTotal,
    nextLink: currentUrl || undefined,
  };
}

/**
 * Fetch a single listing by ListingId from Trestle.
 * Uses $filter (not OData key syntax) since ListingId != entity key.
 * Tries $expand=Media for photos; falls back without if rejected.
 */
export async function fetchSingleListing(
  listingId: string
): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  const selectFields = IDX_PLUS_SELECT_FIELDS.join(",");
  const escapedId = listingId.replace(/'/g, "''");

  function buildUrl(withMedia: boolean): string {
    const params = new URLSearchParams();
    params.set("$filter", `ListingId eq '${escapedId}'`);
    params.set("$select", selectFields);
    if (withMedia) params.set("$expand", "Media");
    params.set("$top", "1");
    return `${getPropertyEndpoint()}?${params.toString()}`;
  }

  // Try with $expand=Media first
  let url = buildUrl(true);
  let response = await fetchPage(url, token);

  if (response.status === 400) {
    // $expand=Media not supported — retry without
    url = buildUrl(false);
    response = await fetchPage(url, token);
  }

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired — refresh and retry
      invalidateToken();
      const newToken = await getAccessToken();
      response = await fetchPage(url, newToken);
      if (!response.ok) return null;
    } else {
      const errorText = await response.text().catch(() => "Unknown");
      throw new Error(
        `[IDX Fetch] Single listing error (${response.status}): ${errorText}`
      );
    }
  }

  const data = await response.json();
  const records = data.value || [];
  return records.length > 0 ? records[0] : null;
}

/**
 * Build an OData $filter for incremental sync based on modification timestamp.
 */
export function buildIncrementalFilter(
  since: Date,
  listingType?: "sale" | "rent"
): string {
  const timestamp = since.toISOString();
  const parts = [`ModificationTimestamp gt ${timestamp}`];

  if (listingType === "sale") {
    parts.push("PropertyType ne 'ResidentialLease'");
  } else if (listingType === "rent") {
    parts.push("PropertyType eq 'ResidentialLease'");
  }

  return parts.join(" and ");
}

/**
 * Build an OData $filter for active listings only.
 */
export function buildActiveFilter(
  listingType?: "sale" | "rent"
): string {
  const parts = [
    "StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract'",
  ];

  if (listingType === "sale") {
    parts.push("PropertyType ne 'ResidentialLease'");
  } else if (listingType === "rent") {
    parts.push("PropertyType eq 'ResidentialLease'");
  }

  return parts.map((p) => `(${p})`).join(" and ");
}

/** Internal: make a single HTTP request to Trestle. */
async function fetchPage(
  url: string,
  token: string
): Promise<Response> {
  return fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}
