/**
 * Phase 1A — shared complete-response contract for the LEGACY `listings.media`
 * batch-media fetch used by `lib/idx/sync.ts`.
 *
 * WHY THIS EXISTS
 * ---------------
 * All three legacy writers in sync.ts previously built their grouping map ONLY
 * from ResourceRecordKeys that returned rows, then iterated only those entries.
 * A listing whose Cotality gallery is authoritatively empty therefore never
 * entered the map and its stale `listings.media` array was never cleared — the
 * public reader could later resurrect it whenever normalized `listing_media`
 * rows were empty. None of the three writers followed `@odata.nextLink`, so a
 * response that spilled past one page was written as if authoritative.
 *
 * LIVE PROBE (read-only, 2026-07-29, api.cotality.com/trestle)
 * -----------------------------------------------------------
 * Contrary to the OData standard — where `$top` is a total ceiling — Trestle
 * treats `$top` as the PAGE SIZE:
 *   • single listing (33 photos): $top=1 → 34 pages → 33 rows; $top=5 → 7 pages
 *     → 33 rows; no $top → 4 pages → 33 rows. All matched `@odata.count`=33.
 *   • production shape (6 listings OR'd, sum(PhotosCount)=140): $top=180 → 1
 *     page → 140 rows; $top=3 → 47 pages → 140 rows. Both matched
 *     `@odata.count`=140, 6/6 distinct keys, 0 duplicate MediaKeys.
 *   • every nextLink was an absolute URL on https://api.cotality.com.
 * So an explicit page size is kept (fewer round-trips) and completeness is
 * proven by `@odata.count`, NEVER by the mere absence of another nextLink.
 *
 * FAIL-CLOSED CONTRACT
 * --------------------
 * `incomplete` deliberately carries NO map. A partially accumulated page set is
 * unrepresentable as a writable result, so no caller can consume it. On
 * `incomplete` the caller must preserve every stored `listings.media` value for
 * the whole batch — a later-page failure yields zero writes even when page one
 * held valid rows.
 */

export interface LegacyMediaItem {
  url: string;
  mediaType: string;
  order: number;
}

/**
 * One requested logical listing. `filterKey` is what goes into the OData
 * `$filter` (always Media.ResourceRecordKey, per Trestle guidance 2026-04-07).
 * `altKeys` preserves the backfill path's ResourceRecordID fallback: a response
 * row may identify itself by either, and both resolve to the same `listingId`.
 */
export interface LegacyMediaRequestedListing {
  listingId: string;
  filterKey: string;
  /**
   * Which Media field `filterKey` is matched against. The backfill path queries
   * by ResourceRecordID when a listing has no mls_id (ListingKey); every other
   * caller uses ResourceRecordKey per Trestle guidance 2026-04-07. Defaults to
   * ResourceRecordKey so existing callers are unchanged.
   */
  filterField?: "ResourceRecordKey" | "ResourceRecordID";
  altKeys?: string[];
}

export type LegacyMediaIncompleteReason =
  | "http_error"
  | "timeout"
  | "fetch_error"
  | "malformed_response"
  | "missing_count"
  | "count_mismatch"
  | "count_disagreement"
  | "off_origin_next_link"
  | "malformed_next_link"
  | "pagination_cycle"
  | "pagination_limit"
  | "row_limit"
  | "byte_limit"
  | "unmapped_row"
  | "ambiguous_mapping"
  | "missing_media_key"
  | "duplicate_media_key";

export type LegacyMediaBatchResult =
  | {
      outcome: "complete";
      /** Contains EVERY requested listingId — a listing with no media maps to []. */
      mediaByListingId: Map<string, LegacyMediaItem[]>;
      pagesFetched: number;
      rowsFetched: number;
      odataCount: number;
    }
  | {
      outcome: "incomplete";
      reason: LegacyMediaIncompleteReason;
      pagesFetched: number;
      /** Free-text diagnostic; never carries writable rows. */
      detail?: string;
    };

export interface LegacyMediaBatchOptions {
  /** e.g. https://api.cotality.com/trestle — also the nextLink origin allowlist. */
  baseUrl: string;
  token: string;
  requested: LegacyMediaRequestedListing[];
  /** Page size (`$top`). Proven per-page, not a ceiling. */
  pageSize: number;
  maxPages?: number;
  maxRows?: number;
  maxBytes?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  classifyMediaType: (category: string | null | undefined) => string;
}

const DEFAULT_MAX_PAGES = 200;
const DEFAULT_MAX_ROWS = 100_000;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;

function isFiniteNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && Number.isFinite(v) && v >= 0;
}

function incomplete(
  reason: LegacyMediaIncompleteReason,
  pagesFetched: number,
  detail?: string,
): LegacyMediaBatchResult {
  return { outcome: "incomplete", reason, pagesFetched, detail };
}

/**
 * Fetch the complete Media collection for a batch of requested listings, or
 * return `incomplete` with no writable result.
 *
 * COMPLETE requires ALL of:
 *   1. first response carries a finite non-negative integer `@odata.count`
 *   2. every later `@odata.count` reports the same value
 *   3. every response has an array-valued `value`
 *   4. every nextLink is a valid absolute URL on the configured Cotality origin
 *   5. no nextLink repeats (cycle detection)
 *   6. page / row / byte guards not exceeded
 *   7. every row maps to exactly one requested listing
 *   8. every returned identity belongs to the requested batch
 *   9. every row carries a valid non-empty MediaKey
 *  10. each MediaKey appears at most once across the whole traversal
 *  11. pagination terminates with no remaining nextLink
 *  12. accumulated row count equals `@odata.count`
 *
 * A trailing empty page is legal (the $top=1 probe produced 34 pages for 33
 * rows), so emptiness alone is never treated as failure.
 */
export async function fetchLegacyMediaBatch(
  opts: LegacyMediaBatchOptions,
): Promise<LegacyMediaBatchResult> {
  const {
    baseUrl,
    token,
    requested,
    pageSize,
    maxPages = DEFAULT_MAX_PAGES,
    maxRows = DEFAULT_MAX_ROWS,
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = fetch,
    classifyMediaType,
  } = opts;

  let pages = 0;
  if (requested.length === 0) {
    return { outcome: "complete", mediaByListingId: new Map(), pagesFetched: 0, rowsFetched: 0, odataCount: 0 };
  }

  let approvedOrigin: string;
  try {
    approvedOrigin = new URL(baseUrl).origin;
  } catch {
    return incomplete("malformed_response", 0, "baseUrl is not a valid URL");
  }

  // ── Identity map: response identity → logical listing. Ambiguity is a hard
  // stop at BUILD time; we never guess which listing a shared key belongs to.
  const identityToListing = new Map<string, string>();
  for (const r of requested) {
    for (const identity of [r.filterKey, ...(r.altKeys ?? [])]) {
      if (!identity) continue;
      const prior = identityToListing.get(identity);
      if (prior !== undefined && prior !== r.listingId) {
        return incomplete("ambiguous_mapping", 0, `identity resolves to >1 listing`);
      }
      identityToListing.set(identity, r.listingId);
    }
  }

  // Every requested listing is initialized up front. This is the fix for the
  // stale-gallery defect: a listing that returns zero rows stays [] and is
  // therefore reconciled, instead of silently vanishing from the result.
  const mediaByListingId = new Map<string, LegacyMediaItem[]>();
  for (const r of requested) mediaByListingId.set(r.listingId, []);

  const idFilter = requested
    .map(
      (r) =>
        `${r.filterField ?? "ResourceRecordKey"} eq '${r.filterKey.replace(/'/g, "''")}'`,
    )
    .join(" or ");
  const params = new URLSearchParams();
  params.set("$filter", `(${idFilter}) and MediaStatus ne 'Deleted'`);
  // MediaKey is REQUIRED — it is the identity used for duplicate detection and
  // for the stable tiebreak across page boundaries.
  params.set("$select", "ResourceRecordKey,ResourceRecordID,MediaKey,MediaURL,MediaCategory,Order,PreferredPhotoYN,MediaStatus");
  params.set("$orderby", "ResourceRecordKey asc,Order asc,MediaKey asc");
  params.set("$top", String(pageSize));
  params.set("$count", "true");

  let url: string | null = `${baseUrl}/odata/Media?${params.toString()}`;
  const visited = new Set<string>([url]);
  const seenMediaKeys = new Set<string>();
  let odataCount: number | null = null;
  let rowsSeen = 0; // ALL returned rows — this is what @odata.count counts
  let bytesSeen = 0;

  while (url) {
    if (pages >= maxPages) return incomplete("pagination_limit", pages);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = (err as { name?: string } | null)?.name === "AbortError";
      return incomplete(aborted ? "timeout" : "fetch_error", pages);
    } finally {
      clearTimeout(timer);
    }
    pages++;

    if (!res.ok) return incomplete("http_error", pages, `HTTP ${res.status}`);

    let text: string;
    try {
      text = await res.text();
    } catch {
      return incomplete("malformed_response", pages, "body unreadable");
    }
    bytesSeen += text.length;
    if (bytesSeen > maxBytes) return incomplete("byte_limit", pages);

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return incomplete("malformed_response", pages, "body is not JSON");
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return incomplete("malformed_response", pages, "body is not an object");
    }

    const value = body["value"];
    if (!Array.isArray(value)) return incomplete("malformed_response", pages, "`value` is not an array");

    const rawCount = body["@odata.count"];
    if (pages === 1) {
      if (!isFiniteNonNegativeInt(rawCount)) return incomplete("missing_count", pages);
      odataCount = rawCount;
    } else if (rawCount !== undefined && rawCount !== null) {
      if (!isFiniteNonNegativeInt(rawCount) || rawCount !== odataCount) {
        return incomplete("count_disagreement", pages);
      }
    }

    for (const row of value as Record<string, unknown>[]) {
      rowsSeen++;
      if (rowsSeen > maxRows) return incomplete("row_limit", pages);

      const mediaKey = row["MediaKey"] == null ? "" : String(row["MediaKey"]).trim();
      if (!mediaKey) return incomplete("missing_media_key", pages);
      if (seenMediaKeys.has(mediaKey)) return incomplete("duplicate_media_key", pages);
      seenMediaKeys.add(mediaKey);

      const rrk = row["ResourceRecordKey"] == null ? "" : String(row["ResourceRecordKey"]);
      const rrid = row["ResourceRecordID"] == null ? "" : String(row["ResourceRecordID"]);
      const byRrk = rrk ? identityToListing.get(rrk) : undefined;
      const byRrid = rrid ? identityToListing.get(rrid) : undefined;
      if (byRrk === undefined && byRrid === undefined) return incomplete("unmapped_row", pages);
      if (byRrk !== undefined && byRrid !== undefined && byRrk !== byRrid) {
        return incomplete("ambiguous_mapping", pages);
      }
      const listingId = (byRrk ?? byRrid) as string;

      // URL-LESS SOURCE ROWS — two separate concerns, deliberately decoupled:
      //
      //   TRANSPORT completeness is measured in SOURCE rows, because that is
      //   what `@odata.count` counts. A row Trestle returns without a MediaURL
      //   is part of the matched collection. Excluding it from `rowsSeen` would
      //   make `rowsSeen !== @odata.count` for every such batch, converting a
      //   cosmetic source-data defect into a permanent reconciliation outage
      //   (count_mismatch) that preserves stale galleries forever.
      //
      //   The MATERIAL gallery is derived independently, from displayable URLs
      //   only. A URL-less row yields no item, so it cannot appear in
      //   `listings.media` and cannot change the array's material shape. It
      //   therefore cannot cause repeat physical writes on successive cycles —
      //   `mediaArraysMateriallyEqual` sees an identical array either way.
      //
      // A valid existing item is removed ONLY when a COMPLETE authoritative
      // response proves it is no longer present/displayable — never because a
      // sibling row was malformed, since malformation never shortens the array.
      const rawUrl = row["MediaURL"];
      if (rawUrl == null || String(rawUrl) === "") continue;

      const isPreferred = row["PreferredPhotoYN"] === true || row["PreferredPhotoYN"] === "true";
      const orderRaw = row["Order"];
      mediaByListingId.get(listingId)!.push({
        url: String(rawUrl),
        mediaType: classifyMediaType(row["MediaCategory"] as string | null | undefined),
        order: isPreferred ? -1 : Number(orderRaw ?? 0),
      });
    }

    const next = body["@odata.nextLink"];
    if (next === undefined || next === null || next === "") {
      url = null;
      break;
    }
    if (typeof next !== "string") return incomplete("malformed_next_link", pages, "nextLink is not a string");
    // Condition 4 requires a valid ABSOLUTE URL. Parsing relative-to-base would
    // silently promote a garbage string (e.g. "ht!tp://%%%") into a same-origin
    // URL and follow it. The 2026-07-29 probe confirmed Trestle always emits
    // absolute nextLinks, so relative is treated as malformed.
    let nextUrl: URL;
    try {
      nextUrl = new URL(next);
    } catch {
      return incomplete("malformed_next_link", pages);
    }
    if (nextUrl.origin !== approvedOrigin) return incomplete("off_origin_next_link", pages);
    const nextHref = nextUrl.href;
    if (visited.has(nextHref)) return incomplete("pagination_cycle", pages);
    visited.add(nextHref);
    url = nextHref;
  }

  // Condition 12 — the independent completeness proof. Absence of a nextLink
  // alone is NOT sufficient evidence that the collection was fully traversed.
  if (odataCount === null || rowsSeen !== odataCount) {
    return incomplete("count_mismatch", pages, `accumulated ${rowsSeen} vs @odata.count ${odataCount}`);
  }

  return { outcome: "complete", mediaByListingId, pagesFetched: pages, rowsFetched: rowsSeen, odataCount };
}
