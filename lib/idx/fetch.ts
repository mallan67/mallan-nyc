// lib/idx/fetch.ts
// OData v4 listing fetch from Trestle/REBNY RLS.
// Handles pagination via @odata.nextLink. Selects all 448 fields.

import { getAccessToken, invalidateToken } from "./auth";
import { ALL_RLS_FIELDS } from "./trestle-mapper";

const TRESTLE_BASE_URL =
  process.env.IDX_BASE_URL || "https://api.cotality.com";
const PROPERTY_ENDPOINT = `${TRESTLE_BASE_URL}/trestle/odata/Property`;
const MAX_PAGE_SIZE = 200;

export interface TrestleFetchOptions {
  /** OData $filter expression (e.g., "MlsStatus eq 'Active'") */
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
    options.select?.join(",") || ALL_RLS_FIELDS.join(",");

  const params = new URLSearchParams();
  if (options.filter) params.set("$filter", options.filter);
  params.set("$select", selectFields);
  params.set("$top", String(options.top || MAX_PAGE_SIZE));
  if (options.skip) params.set("$skip", String(options.skip));
  params.set("$orderby", options.orderby || "ModificationTimestamp desc");

  const url = `${PROPERTY_ENDPOINT}?${params.toString()}`;
  const maxTotal = options.maxTotal || 1000;

  const allRecords: Record<string, unknown>[] = [];
  let currentUrl: string | null = url;
  let hasMore = false;

  while (currentUrl && allRecords.length < maxTotal) {
    const response = await fetchPage(currentUrl, token);

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
 * Fetch a single listing by ListingKey from Trestle.
 */
export async function fetchSingleListing(
  listingKey: string
): Promise<Record<string, unknown> | null> {
  const token = await getAccessToken();
  const selectFields = ALL_RLS_FIELDS.join(",");
  const url = `${PROPERTY_ENDPOINT}('${encodeURIComponent(listingKey)}')?$select=${selectFields}`;

  const response = await fetchPage(url, token);

  if (response.status === 404) return null;

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown");
    throw new Error(
      `[IDX Fetch] Single listing error (${response.status}): ${errorText}`
    );
  }

  return response.json();
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
    "MlsStatus eq 'Active' or MlsStatus eq 'Coming Soon' or MlsStatus eq 'Active Under Contract'",
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
