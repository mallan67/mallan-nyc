// lib/idx/fetch.ts
// OData v4 listing fetch from Trestle/REBNY RLS.
// Handles pagination via @odata.nextLink. Selects IDX Plus Property fields.

import { getAccessToken, invalidateToken } from "./auth";
import { IDX_PLUS_SELECT_FIELDS } from "./trestle-mapper";

// Derive Trestle property endpoint from centralized TRESTLE_API_URL.
// Env validation is deferred to call-time — no top-level throws (Vercel serverless safety).
function getPropertyEndpoint(): string {
  const base = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || "https://api.cotality.com/trestle";
  return `${base}/odata/Property`;
}
const MAX_PAGE_SIZE = 500;

export interface TrestleFetchOptions {
  /** OData $filter expression (e.g., "StandardStatus eq 'Active'") */
  filter?: string;
  /** Override $select (defaults to IDX Plus Property fields) */
  select?: string[];
  /** Max records per page (default 200) */
  top?: number;
  /** Skip N records */
  skip?: number;
  /** OData $orderby (default "ModificationTimestamp desc") */
  orderby?: string;
  /** Max total records to fetch across all pages (default 1000) */
  maxTotal?: number;
  /** Include $count=true to get total count from OData */
  count?: boolean;
  /** Whether to try $expand=Media (default true). Set false for bulk queries to avoid slow responses. */
  expandMedia?: boolean;
}

export interface TrestleFetchResult {
  records: Record<string, unknown>[];
  totalFetched: number;
  hasMore: boolean;
  nextLink?: string;
  /** Total count from @odata.count (only when count=true) */
  odataCount?: number;
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

  function buildUrl(): string {
    const params = new URLSearchParams();
    if (options.filter) params.set("$filter", options.filter);
    params.set("$select", selectFields);
    // $expand=Media works for result sets under ~200 records (verified against Trestle docs).
    // For bulk queries (500+), set expandMedia: false and batch-fetch photos separately.
    if (options.expandMedia !== false) {
      // $expand=Media for photos + CustomProperty for DPA fields (Trestle 6.17)
      // Trestle guidance (2026-04-07): include ModificationTimestamp for change tracking
      params.set("$expand", "Media($select=MediaURL,MediaCategory,Order,PreferredPhotoYN,ShortDescription,ModificationTimestamp,ResourceRecordKey;$top=8;$orderby=Order),CustomProperty($select=DownPaymentAssistanceAmount,DownPaymentAssistanceCount)");
    } else {
      // Even without media, still expand CustomProperty for DPA fields
      params.set("$expand", "CustomProperty($select=DownPaymentAssistanceAmount,DownPaymentAssistanceCount)");
    }
    if (options.count) params.set("$count", "true");
    params.set("$top", String(options.top || MAX_PAGE_SIZE));
    if (options.skip) params.set("$skip", String(options.skip));
    params.set("$orderby", options.orderby || "ModificationTimestamp desc");
    return `${getPropertyEndpoint()}?${params.toString()}`;
  }

  const url = buildUrl();
  const firstResponse = await fetchPage(url, token);

  const maxTotal = options.maxTotal || 1000;
  const allRecords: Record<string, unknown>[] = [];
  let currentUrl: string | null = url;
  let hasMore = false;
  let isFirstRequest = true;
  let odataCount: number | undefined;

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

    // Capture @odata.count from first response
    if (odataCount === undefined && data["@odata.count"] != null) {
      odataCount = Number(data["@odata.count"]);
    }

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
    odataCount,
  };
}

/**
 * Fetch a single listing by ListingId or ListingKey from Trestle.
 *
 * REBNY's Trestle feed exposes two distinct identifiers per record:
 *   - ListingId  = human "RLS20059088" (Edm.String, MaxLength 255)
 *   - ListingKey = numeric-as-string "1146011469" (Edm.String, MaxLength 20,
 *                  the primary key; this is what joins to Media.ResourceRecordKey)
 * Callers and URLs in the wild use both forms. Filter on whichever one looks
 * like it could match — cheap to OR both — so the resolver stops 404'ing when
 * the DB (which normally resolves either form via `listing_id`) is unreachable.
 */
export async function fetchSingleListing(
  listingId: string
): Promise<Record<string, unknown> | null> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.warn('[IDX Fetch] Token acquisition failed for single listing:', err);
    return null;
  }
  const selectFields = IDX_PLUS_SELECT_FIELDS.join(",");
  const escapedId = listingId.replace(/'/g, "''");
  const isNumericKey = /^\d+$/.test(listingId);

  function buildUrl(): string {
    const params = new URLSearchParams();
    // If the caller handed us a numeric-looking string, it's almost certainly
    // ListingKey (REBNY ListingKey is always numeric). Otherwise try ListingId
    // first but also OR ListingKey for safety (listings imported from other
    // pipelines may have swapped fields).
    const filter = isNumericKey
      ? `ListingKey eq '${escapedId}' or ListingId eq '${escapedId}'`
      : `ListingId eq '${escapedId}' or ListingKey eq '${escapedId}'`;
    params.set("$filter", filter);
    params.set("$select", selectFields);
    // Skip $expand=Media — fetch photos separately via fetchListingMedia() to avoid
    // the extra 400→retry round trip that Trestle consistently rejects.
    params.set("$top", "1");
    return `${getPropertyEndpoint()}?${params.toString()}`;
  }

  const url = buildUrl();
  let response = await fetchWithRetry(url, token);

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired — refresh and retry
      invalidateToken();
      const newToken = await getAccessToken();
      response = await fetchWithRetry(url, newToken);
      if (!response.ok) return null;
    } else if (response.status === 429) {
      // Rate limited — do not retry, return null
      console.warn(`[IDX Fetch] Rate limited (429) for listing ${listingId}`);
      return null;
    } else {
      const errorText = await response.text().catch(() => "Unknown");
      console.warn(
        `[IDX Fetch] Single listing error (${response.status}): ${errorText}`
      );
      return null;
    }
  }

  const data = await response.json();
  const records = data.value || [];
  return records.length > 0 ? records[0] : null;
}

/**
 * Fetch a single listing by address components from Trestle.
 * Used for address-based slug resolution (no-?key= URLs, sitemap, share links).
 * Filters on StreetNumber + PostalCode + Active-ish status; narrows by composed
 * street name and unit number in JS (see comment in the filter builder below).
 * Returns the freshest active match or null.
 */
export async function fetchListingByAddress(address: {
  streetNumber: string;
  streetName: string;
  city: string;
  postalCode: string;
  unitNumber?: string;
}): Promise<Record<string, unknown> | null> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.warn('[IDX Fetch] Token acquisition failed for address lookup:', err);
    return null;
  }
  const selectFields = IDX_PLUS_SELECT_FIELDS.join(",");

  // SECURITY: Strict allowlist sanitization to prevent OData injection.
  // Address components from slug parsing could contain attacker-controlled input.
  // Only allow alphanumeric, spaces, hyphens, periods (covers all NYC addresses).
  function sanitizeOData(value: string, maxLength: number): string {
    return value
      .replace(/[^a-zA-Z0-9 .\-]/g, '')
      .slice(0, maxLength);
  }

  // Build OData filter from address components.
  //
  // We deliberately do NOT filter on StreetName via contains() any more.
  // REBNY's Trestle feed splits the street name into four fields:
  //   StreetDirPrefix + StreetName + StreetSuffix + StreetDirSuffix
  // (e.g. "W" + "57th" + "Street" + "") which we compose into "W 57th Street"
  // in the DTO and in the URL slug. A contains(tolower(StreetName), 'w 57th street')
  // filter on the bare StreetName field ("57th") will never match the composed
  // slug, so the old filter dropped every address-slug lookup with a directional
  // or a suffix. StreetNumber + PostalCode is unique enough for NYC — even at
  // the same ZIP, the same StreetNumber on two different streets is vanishingly
  // rare, and when it does happen we narrow with the JS composed-name check
  // and unit match below.
  const filterParts: string[] = [];

  if (address.streetNumber) {
    const safe = sanitizeOData(address.streetNumber, 10);
    if (safe) filterParts.push(`StreetNumber eq '${safe}'`);
  }
  if (address.postalCode) {
    const safe = sanitizeOData(address.postalCode, 10);
    if (safe) filterParts.push(`PostalCode eq '${safe}'`);
  }
  // Unit number is NOT included in the OData query — slug generation strips
  // hyphens (Trestle "2-F" → slug "2f") and OData replace() isn't universally
  // supported. Instead, fetch by street/zip, then match unit in JavaScript.

  // Only active listings
  filterParts.push("(StandardStatus eq 'Active' or StandardStatus eq 'ComingSoon' or StandardStatus eq 'ActiveUnderContract')");

  const params = new URLSearchParams();
  params.set("$filter", filterParts.join(" and "));
  params.set("$select", selectFields);
  // Fetch up to 25 results so we can narrow by composed street name + unit in
  // JS. 25 covers every ZIP × street-number bucket REBNY has in practice (a
  // single luxury tower at e.g. 217 W 57th maxes out around 10 unique units
  // listed concurrently).
  params.set("$top", "25");
  params.set("$orderby", "ModificationTimestamp desc");
  const url = `${getPropertyEndpoint()}?${params.toString()}`;

  let response = await fetchWithRetry(url, token);

  if (!response.ok) {
    if (response.status === 401) {
      invalidateToken();
      const newToken = await getAccessToken();
      response = await fetchWithRetry(url, newToken);
      if (!response.ok) return null;
    } else {
      return null;
    }
  }

  const data = await response.json();
  const records: Record<string, unknown>[] = data.value || [];
  if (records.length === 0) return null;

  // Normalize helpers — match the slug generator's behaviour. The slugifier
  // collapses every non-alphanumeric run to a hyphen and then the unit token
  // is re-joined without separators, so a DB unit "127/128" becomes slug-token
  // "127128" and a DB unit "17/C" becomes slug-token "17c". The old regex
  // preserved "/" and therefore never matched slash-bearing units.
  const normalize = (u: string) => u.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Compose the full street name the same way mapRESOToInternal / the slug
  // generator do, so we can narrow multi-record results (same street number
  // in the same ZIP on two different streets, or multi-unit buildings).
  const composeStreetName = (r: Record<string, unknown>): string =>
    [r.StreetDirPrefix, r.StreetName, r.StreetSuffix, r.StreetDirSuffix]
      .filter(Boolean).map(String).join(' ').toLowerCase();

  // Narrow to street-name match when the parsed slug gave us one. This handles
  // the rare cross-street collision at the same ZIP and StreetNumber without
  // requiring Trestle to do a contains() on a composed field it does not have.
  let filtered = records;
  if (address.streetName) {
    const targetName = address.streetName.toLowerCase();
    const nameMatches = records.filter(r => composeStreetName(r).includes(targetName));
    if (nameMatches.length > 0) filtered = nameMatches;
  }

  // If no unit number requested, return the freshest match.
  if (!address.unitNumber) return filtered[0];

  // Unit number JS match — exact normalized equality wins, fallback to first.
  const targetUnit = normalize(address.unitNumber);
  const unitMatch = filtered.find(r => {
    const unit = r.UnitNumber ? normalize(String(r.UnitNumber)) : '';
    return unit === targetUnit;
  });
  return unitMatch || filtered[0];
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

/**
 * Build an OData $filter for an agent's historical listings (Closed, Expired, Hold, Withdrawn).
 * Uses ListAgentMlsId (REBNY member ID assigned by Trestle — NOT the NY state license number).
 * @param agentMlsId - The agent's REBNY MLS ID (e.g. "39361")
 * @param listingType - Optional filter by sale/rent
 */
export function buildAgentHistoricalFilter(
  agentMlsId: string,
  listingType?: "sale" | "rent"
): string {
  const escapedId = agentMlsId.replace(/'/g, "''");

  // Agent identity: match on EITHER side of the deal
  // ListAgentMlsId = you were the listing agent (your exclusive)
  // BuyerAgentMlsId = you represented the buyer/tenant
  const agentFilter = `(ListAgentMlsId eq '${escapedId}' or BuyerAgentMlsId eq '${escapedId}')`;

  // Historical statuses: Closed (Sold/Rented), Expired, Hold (Temp Off), Withdrawn (Perm Off)
  const statusFilter =
    "StandardStatus eq 'Closed' or StandardStatus eq 'Expired' or StandardStatus eq 'Hold' or StandardStatus eq 'Withdrawn'";

  const parts = [agentFilter, `(${statusFilter})`];

  if (listingType === "sale") {
    parts.push("PropertyType ne 'ResidentialLease'");
  } else if (listingType === "rent") {
    parts.push("PropertyType eq 'ResidentialLease'");
  }

  return parts.join(" and ");
}

/**
 * Build an OData $filter for ALL of an agent's listings (any status).
 * Matches ListAgentMlsId OR BuyerAgentMlsId (both sides of deals).
 */
export function buildAgentAllFilter(
  agentMlsId: string,
  listingType?: "sale" | "rent"
): string {
  const escapedId = agentMlsId.replace(/'/g, "''");
  const parts = [`(ListAgentMlsId eq '${escapedId}' or BuyerAgentMlsId eq '${escapedId}')`];

  if (listingType === "sale") {
    parts.push("PropertyType ne 'ResidentialLease'");
  } else if (listingType === "rent") {
    parts.push("PropertyType eq 'ResidentialLease'");
  }

  return parts.join(" and ");
}

/**
 * Fetch media/photos for a single listing from Trestle's Media resource.
 * Trestle guidance (2026-04-07): use ResourceRecordKey (always unique across MLOs),
 * NOT ResourceRecordID (can duplicate). Property.ListingKey = Media.ResourceRecordKey.
 * Falls back through key fields in priority order until media is found.
 */
export async function fetchListingMedia(
  listingKey: string,
  options?: { listingKeyNumeric?: number | string }
): Promise<{ url: string; mediaType: string; order: number }[]> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.warn('[IDX Fetch] Token acquisition failed for media fetch:', err);
    return [];
  }
  const base = process.env.TRESTLE_API_URL || process.env.IDX_ENDPOINT || "https://api.cotality.com/trestle";

  // Priority order per Trestle guidance:
  // 1. ResourceRecordKeyNumeric (numeric, always unique)
  // 2. ResourceRecordKey (string, always unique — matches Property.ListingKey)
  // 3. ResourceRecordID (string, NOT unique across MLOs — last resort fallback)
  const isNumeric = /^\d+$/.test(listingKey);
  const escaped = listingKey.replace(/'/g, "''");
  const numKey = options?.listingKeyNumeric;
  const keyFieldsToTry = isNumeric
    ? [`ResourceRecordKeyNumeric eq ${listingKey}`]
    : [
        `ResourceRecordKey eq '${escaped}'`,
        // Numeric key preferred if available
        ...(numKey ? [`ResourceRecordKeyNumeric eq ${numKey}`] : []),
        // Last resort: ResourceRecordID (NOT unique across MLOs per Trestle guidance)
        `ResourceRecordID eq '${escaped}'`,
      ];

  let records: Record<string, unknown>[] = [];
  for (const keyFilter of keyFieldsToTry) {
    const params = new URLSearchParams();
    params.set("$filter", keyFilter);
    params.set("$select", "MediaURL,MediaType,MediaCategory,Order,ShortDescription,PreferredPhotoYN");
    params.set("$orderby", "Order asc");
    params.set("$top", "50");

    const url = `${base}/odata/Media?${params.toString()}`;
    let response = await fetchWithRetry(url, token);

    if (response.status === 401) {
      invalidateToken();
      const newToken = await getAccessToken();
      token = newToken;
      response = await fetchWithRetry(url, newToken);
    }

    if (!response.ok) continue;

    const data = await response.json();
    records = data.value || [];
    if (records.length > 0) break; // Found media — stop trying other keys
  }

  if (records.length === 0) {
    return [];
  }
  return records.map((m: Record<string, unknown>, i: number) => {
    // RESO DD: MediaCategory = content type (Photo, Floor Plan, Video, Virtual Tour)
    //          MediaType = file format (jpeg, png) — NOT content type
    const cat = String(m.MediaCategory || "").toLowerCase();
    const desc = String(m.ShortDescription || "").toLowerCase();
    const url = String(m.MediaURL || "");
    const urlLower = url.toLowerCase();

    let mediaType = "Photo";
    if (cat.includes("floor plan") || cat.includes("floorplan") || desc.includes("floor plan") || desc.includes("floorplan")) {
      mediaType = "FloorPlan";
    } else if (cat.includes("video") || desc.includes("video") || /\.(mp4|avi|mov|wmv|webm)(\?|$)/.test(urlLower) || /youtube\.com|youtu\.be|vimeo\.com|wistia\.com/.test(urlLower)) {
      mediaType = "Video";
    } else if (cat.includes("virtual tour") || cat.includes("virtualtour") || cat === "3d" || desc.includes("virtual tour") || desc.includes("3d tour") || desc.includes("matterport") || /matterport\.com|my\.matterport|iguide\.com|zillow\.com\/view/.test(urlLower)) {
      mediaType = "VirtualTour";
    }

    const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === "true";
    return {
      url,
      mediaType,
      order: isPreferred ? -1 : Number(m.Order || i),
    };
  }).filter((m: { url: string }) => m.url).sort((a: { mediaType: string; order: number }, b: { mediaType: string; order: number }) => {
    // Photos first, then videos/tours, then floorplans last
    const typeRank = (t: string) => t === 'Photo' ? 0 : t === 'FloorPlan' ? 2 : 1;
    const rankDiff = typeRank(a.mediaType) - typeRank(b.mediaType);
    return rankDiff !== 0 ? rankDiff : a.order - b.order;
  });
}

/**
 * Retry a fetch with exponential backoff on 5xx errors.
 * - Retries up to maxRetries times on 500/502/503/504 errors
 * - Does NOT retry on 4xx errors (except 401 handled by callers)
 * - Does NOT retry on 429 (rate limit)
 * - Delays: 500ms, 1000ms between retries
 */
async function fetchWithRetry(
  url: string,
  token: string,
  maxRetries: number = 1
): Promise<Response> {
  const delays = [500]; // ms between retries (1 retry max to avoid long hangs)
  let lastResponse: Response = await fetchPage(url, token);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (lastResponse.ok || lastResponse.status < 500) {
      // Success or 4xx — don't retry
      return lastResponse;
    }
    // 5xx error — wait and retry
    const delay = delays[attempt] || 1000;
    console.warn(
      `[IDX Fetch] Trestle ${lastResponse.status} error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
    lastResponse = await fetchPage(url, token);
  }

  return lastResponse;
}

/** Internal: make a single HTTP request to Trestle with timeout. */
async function fetchPage(
  url: string,
  token: string
): Promise<Response> {
  // 10-second timeout prevents hanging when Trestle is slow/down.
  // Without this, requests can hang for 60s+ and block page rendering.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
      // Cache Trestle responses for 5 minutes in Next.js Data Cache.
      // Without this, Next.js 15+ defaults to no-store and every request
      // hits Trestle live — causing 3-8s load times on cold starts.
      next: { revalidate: 300 },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
