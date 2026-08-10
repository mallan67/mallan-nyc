// lib/idx/fetch.ts
// OData v4 listing fetch from Trestle/REBNY RLS.
// Handles pagination via @odata.nextLink. Selects IDX Plus Property fields.

import { getAccessToken, invalidateToken } from "./auth";
// THE single OData Media completeness owner (deliberately NOT defined in this
// module: this file is the provider-I/O MOCK BOUNDARY, and a pure algorithm
// behind that boundary would be silently stubbed by every provider mock).
import { paginateMedia } from "./media-pagination";
import { IDX_PLUS_SELECT_FIELDS } from "./trestle-mapper";
import {
  recordCotalityHttp,
  recordPropertyRequest,
  recordMediaRequest,
  recordRetry,
  parseRetryAfterSeconds,
} from "./cotality-telemetry";

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
  /**
   * Whether to include `$expand=Media` in the OData request.
   *
   * **Default is `false` (PR-S.1c, 2026-05-15).** Trestle rejected THIS
   * function's `$expand=Media` form with HTTP 400 — verified via production
   * Vercel logs after PR-S.1b. **Scope correction (P1C6, live-probed
   * 2026-06-11): the 400 is NOT universal to every expand shape** — the
   * inner-`$filter` form `Media($filter=MediaStatus ne 'Deleted';$orderby=Order)`
   * used by feed-reconcile returned HTTP 200 with populated Media arrays
   * against live Cotality (deep-review L13 REFUTED). Callers that genuinely
   * need inline media MUST opt in explicitly with `expandMedia: true` AND
   * verify their exact expand shape against current Trestle behavior.
   *
   * For most callers, prefer `fetchListingMedia()` for separate media fetch.
   */
  expandMedia?: boolean;
  /**
   * Whether to include `$expand=CustomProperty` in the OData request.
   *
   * **Default is `false` (PR-S.1e, 2026-05-15).** Production Vercel logs
   * showed Trestle rejects the previously-default
   * `$expand=CustomProperty($select=DownPaymentAssistanceAmount,DownPaymentAssistanceCount,CustomFields)`
   * with HTTP 400 — the OData server cannot resolve one or more of those
   * field names on the current CustomProperty schema. Until that schema is
   * audited via Trestle `$metadata`, CustomProperty expansion is opt-in
   * only.
   *
   * NOTE (2026-06-04): `DownPaymentAssistanceAmount` / `DownPaymentAssistanceCount`
   * migrated to the **Property** entity and are now fetched via the Property
   * `$select` (B15_FINANCIAL_UNIT → IDX_PLUS_SELECT_FIELDS) — they are no longer
   * a reason to expand CustomProperty. `crm-idx-mapper` reads them from Property
   * (with a legacy CustomProperty fallback for old `raw_data`).
   *
   * When this option is `true`, the expand is included as bare
   * `CustomProperty` (no inner `$select`) so Trestle returns whatever
   * fields currently exist on that entity. Callers reading
   * `raw.CustomProperty` should be defensive about missing fields.
   *
   * Most callers do not need this — DPA / FARE Act / REBNY-flag access can
   * be added later via a dedicated, schema-audited fetch helper.
   */
  expandCustomProperty?: boolean;
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
  recordPropertyRequest();
  const token = await getAccessToken();

  const selectFields =
    options.select?.join(",") || IDX_PLUS_SELECT_FIELDS.join(",");

  function buildUrl(): string {
    const params = new URLSearchParams();
    if (options.filter) params.set("$filter", options.filter);
    params.set("$select", selectFields);
    // PR-S.1c (2026-05-15) + PR-S.1e (2026-05-15): `$expand` is fully
    // opt-in. Trestle's IDX Plus endpoint rejects both `$expand=Media` and
    // `$expand=CustomProperty($select=DownPaymentAssistance…,CustomFields)`
    // with HTTP 400 — Media's rejection was documented for over a year in
    // `fetchSingleListing()` below; CustomProperty's was confirmed via
    // PR-S.1b production logs (error text contains "CustomProperty",
    // "DownPaymentAssistance", "Could not find"). Default is therefore
    // NO `$expand` at all. Callers that genuinely need expansion MUST opt
    // in explicitly (strict `=== true`) AND verify it works against
    // current Trestle behavior. Prefer `fetchListingMedia()` for separate
    // media fetch in almost all cases.
    const expandParts: string[] = [];
    if (options.expandMedia === true) {
      // Caller has explicitly opted in despite Trestle's known rejection
      // pattern. If a 400 fires here, fall back to `fetchListingMedia()`
      // rather than re-enabling this by default.
      expandParts.push("Media($select=MediaURL,MediaCategory,Order,PreferredPhotoYN,ShortDescription,ModificationTimestamp,ResourceRecordKey,MediaStatus;$filter=MediaStatus ne 'Deleted';$top=8;$orderby=Order)");
    }
    if (options.expandCustomProperty === true) {
      // Bare expand only — the previous inner `$select` (with
      // `DownPaymentAssistanceAmount,DownPaymentAssistanceCount,CustomFields`)
      // is the exact payload Trestle rejected with 400. Until the
      // CustomProperty schema is audited via Trestle `$metadata`, callers
      // get whatever fields Trestle currently includes on the entity.
      expandParts.push("CustomProperty");
    }
    if (expandParts.length > 0) {
      params.set("$expand", expandParts.join(","));
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
 * Fetch a single listing by ListingId from Trestle.
 * Uses $filter (not OData key syntax) since ListingId != entity key.
 * Media is fetched separately via fetchListingMedia().
 */
export async function fetchSingleListing(
  listingId: string
): Promise<Record<string, unknown> | null> {
  recordPropertyRequest();
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.warn('[IDX Fetch] Token acquisition failed for single listing:', err);
    return null;
  }
  const selectFields = IDX_PLUS_SELECT_FIELDS.join(",");
  const escapedId = listingId.replace(/'/g, "''");

  function buildUrl(): string {
    const params = new URLSearchParams();
    params.set("$filter", `ListingId eq '${escapedId}'`);
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
 * Used for address-based slug resolution.
 * Searches by StreetNumber + StreetName (contains) + City + PostalCode.
 * Returns the first active match or null.
 */
export async function fetchListingByAddress(address: {
  streetNumber: string;
  streetDirPrefix?: string;
  streetName: string;
  city: string;
  postalCode: string;
  unitNumber?: string;
}): Promise<Record<string, unknown> | null> {
  recordPropertyRequest();
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
  // Use tolower() for case-insensitive matching — slug parser lowercases all values,
  // but Trestle stores mixed case (e.g., "PH", "Broadway").
  const filterParts: string[] = [];

  if (address.streetNumber) {
    const safe = sanitizeOData(address.streetNumber, 10);
    if (safe) filterParts.push(`StreetNumber eq '${safe}'`);
  }
  if (address.streetDirPrefix) {
    const safe = sanitizeOData(address.streetDirPrefix, 2).toUpperCase();
    if (safe) filterParts.push(`(StreetDirPrefix eq '${safe}' or contains(tolower(StreetName), '${safe.toLowerCase()} '))`);
  }
  if (address.streetName) {
    const safe = sanitizeOData(address.streetName, 100).toLowerCase();
    if (safe) filterParts.push(`contains(tolower(StreetName), '${safe}')`);
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
  // Fetch up to 10 results when unit number needs JS matching, 1 otherwise
  params.set("$top", address.unitNumber ? "10" : "1");
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

  // If no unit number filter, return best match
  if (!address.unitNumber) return records[0];

  // Match unit number in JavaScript — normalize by stripping hyphens, spaces, dots
  const normalize = (u: string) => u.toLowerCase().replace(/[-\s.]/g, '');
  const targetUnit = normalize(address.unitNumber);
  const match = records.find(r => {
    const unit = r.UnitNumber ? normalize(String(r.UnitNumber)) : '';
    return unit === targetUnit;
  });

  // Return exact unit match, or first result as fallback (same address, different unit)
  return match || records[0];
}

/**
 * Build an OData $filter for incremental sync based on listing or photo
 * modification timestamps.
 *
 * Cotality vendor guidance (2026-04-07): photo-only edits may bump
 * `Property.PhotosChangeTimestamp` without bumping `Property.ModificationTimestamp`.
 * Empirical Layer 0 audit (2026-05-08): 18,411 of 21,307 rows in our DB had
 * raw_data.PhotosChangeTimestamp newer than modification_timestamp; 13,675 of
 * those were displayable active listings whose new photos were never re-pulled
 * because the MT-only cursor skipped over them. The OR-cursor here closes that
 * gap — both timestamp fields are already in IDX_PLUS_SELECT_FIELDS, so no
 * additional Trestle traffic is required for the change itself.
 */
export function buildIncrementalFilter(
  since: Date,
  listingType?: "sale" | "rent"
): string {
  const timestamp = since.toISOString();
  const parts = [
    `(ModificationTimestamp gt ${timestamp} or PhotosChangeTimestamp gt ${timestamp})`,
  ];

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
  recordMediaRequest();
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
    // MediaStatus filter: exclude tombstoned photos retained by Trestle as historical records.
    params.set("$filter", `${keyFilter} and MediaStatus ne 'Deleted'`);
    // MediaKey is selected so callers have a stable logical identity per asset
    // (duplicate detection cannot rely on a signed/ordered MediaURL).
    params.set("$select", "MediaKey,MediaURL,MediaType,MediaCategory,Order,ShortDescription,PreferredPhotoYN,MediaStatus");
    params.set("$orderby", "Order asc");
    // PER-PAGE size only — the rest is followed via @odata.nextLink below.
    params.set("$top", "50");

    const firstUrl = `${base}/odata/Media?${params.toString()}`;

    // COMPLETENESS via the SHARED follower — the same `paginateMedia` used by
    // media-sync and sync.ts batch-media. Previously this read ONE response and
    // stopped as soon as any record came back, so a listing with 68 media rows
    // silently returned its first 50 and looked authoritative. `$top` was being
    // treated as a total cap; it is a page size.
    const { rows, complete } = await paginateMedia<Record<string, unknown>>(
      firstUrl,
      async (url) => {
        let response = await fetchWithRetry(url, token);
        if (response.status === 401) {
          invalidateToken();
          token = await getAccessToken();
          response = await fetchWithRetry(url, token);
        }
        // A non-OK page is a FAILED page, not an empty one — throwing makes
        // paginateMedia report `complete: false` instead of silently short.
        if (!response.ok) throw new Error(`Media page HTTP ${response.status}`);
        const data = (await response.json()) as Record<string, unknown>;
        return {
          value: (data.value || []) as unknown[],
          nextLink: (data["@odata.nextLink"] as string | undefined) ?? null,
        };
      },
    );

    if (!complete) {
      // FAIL CLOSED. Returning the partial set would present a truncated
      // gallery as the whole gallery — a false green. The caller's existing
      // contract for "no media from this path" is an empty array, which is
      // non-destructive: it renders nothing rather than asserting a short set.
      console.warn(
        `[IDX Fetch] Media pagination INCOMPLETE for ${keyFilter} — returning empty rather than a partial gallery`,
      );
      return [];
    }

    records = rows;
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
    recordRetry();
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
  const t0 = Date.now();
  try {
    const response = await fetch(url, {
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
    // Telemetry only — no behavior change (endpoint/filters/auth untouched).
    recordCotalityHttp({
      url,
      durationMs: Date.now() - t0,
      status: response.status,
      retryAfterSeconds:
        response.status === 429
          ? parseRetryAfterSeconds(response.headers.get('retry-after'))
          : null,
    });
    return response;
  } catch (err) {
    // A call that THREW before returning a Response (network error / abort /
    // timeout) still counts as an attempted Cotality request + its latency.
    recordCotalityHttp({ url, durationMs: Date.now() - t0, status: 0 });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
