/**
 * FEED-media authority lookup — the all-status "did a Cotality feed row ever exist" signal.
 *
 * WHY THIS EXISTS
 * ---------------
 * `shouldFallbackToLegacyMedia` let every THIRD-PARTY listing replay its legacy `Listing.media`
 * JSON unconditionally, on the premise that "the legacy JSON is Cotality-sourced → always safe".
 * That premise conflates PROVENANCE with CURRENT TRUTH. When the provider deletes a listing's
 * photos, the canonical lane tombstones the relational rows correctly — and the reader then falls
 * back to the stale JSON and republishes photos the source no longer has. Verified live on
 * RLS20082303 (2026-08-15): provider `PhotosCount = 0`, Media count 0 even UNFILTERED, 20
 * `listing_media` rows all `status='deleted'`, and 20 stale legacy items still rendering.
 *
 * WHY NOT THE OBVIOUS ONE-LINER
 * -----------------------------
 * `hadRelationalRows !== true` is WRONG. That signal counts CRM supplemental history together with
 * feed history. A third-party listing whose Cotality gallery lives only in the legacy JSON, and
 * which once had `crm:` supplemental rows since deleted, would read as "feed materialized then
 * deleted" and LOSE a valid gallery. The resolver already separates these for ACTIVE rows
 * (`listing-media-resolver.ts`: `status === 'active' && !isCrmMediaKey(media_key)`); this module
 * supplies the missing ALL-STATUS half of that same distinction.
 *
 * WHY A QUERY AND NOT A COLUMN
 * ----------------------------
 * A denormalized flag would have to be maintained correctly by every feed insert, tombstone,
 * recovery, deletion and future repair path — duplicated derived state, in a codebase that has
 * already produced several write-path drift defects. Authority is derived from canonical
 * `listing_media` instead. Read shape follows `hydrateSearchListingMedia` (lib/search/core.ts:295):
 * ONE opt-in batched query per page, never N per-listing reads.
 *
 * FAIL-CLOSED CONTRACT
 * --------------------
 * A failed lookup MUST propagate. It must NEVER be coerced to `false`, because `false` means
 * "the feed was provably never materialized" and PERMITS the legacy fallback — i.e. a transient
 * database error would silently republish source-deleted photos. Callers that cannot tolerate a
 * throw must pass `undefined` (unknown), which preserves today's fallback behaviour.
 */
import { CRM_MEDIA_KEY_PREFIX, isCrmMediaKey } from "@/lib/media/crm-media";
import { isMallanOwnedListing, type MediaFallbackContext } from "@/lib/media/listing-media-resolver";

/**
 * FEED rows = rows that are NOT CRM-owned, matching `isCrmMediaKey` EXACTLY.
 *
 * `ListingMedia.media_key` is `String?` (nullable, prisma/schema.prisma:2382) and
 * `isCrmMediaKey(null) === false` — a null key is treated as a FEED row by the resolver. A bare
 * `NOT: { media_key: { startsWith: 'crm:' } }` would drop those rows: in SQL three-valued logic
 * `NULL LIKE 'crm:%'` is NULL, not FALSE, so `NOT (...)` does not match them. The database
 * predicate would then disagree with the in-memory predicate.
 *
 * Measured 2026-08-15 on canonical production: 348,254 rows, 0 with a null `media_key`, so the two
 * forms agree on TODAY's population. The explicit null arm is kept regardless — the schema permits
 * null and correctness here must not depend on a population fact that any future writer can change.
 */
export const FEED_MEDIA_WHERE = {
  OR: [{ media_key: null }, { NOT: { media_key: { startsWith: CRM_MEDIA_KEY_PREFIX } } }],
} as const;

/** Minimal structural DB surface — keeps this unit testable without a live Prisma client. */
export interface FeedAuthorityDb {
  listingMedia: {
    findMany(args: {
      where: unknown;
      select: { listing: { select: { listing_id: true } } };
      distinct?: unknown;
    }): Promise<Array<{ listing: { listing_id: string } | null }>>;
  };
}

export interface FeedAuthorityRow {
  status?: string | null;
  media_key?: string | null;
}

/**
 * Is a lookup actually needed for this listing? Three ways the answer is already known:
 *
 *   1. Mallan-owned → NO. Their authority is the existing total-history rule
 *      (`hadRelationalRows === false`), which this change deliberately does not touch.
 *   2. An ACTIVE feed row is already in hand → NO. Feed existence is already PROVEN true;
 *      querying again would be a pointless read.
 *   3. Otherwise → YES: the row array cannot answer an all-status question, because the public
 *      readers deliberately fetch ACTIVE rows only.
 */
export function needsFeedAuthorityLookup(
  ctx: MediaFallbackContext,
  tableRows: ReadonlyArray<FeedAuthorityRow>,
): boolean {
  if (isMallanOwnedListing(ctx)) return false;
  const hasActiveFeedRow = tableRows.some((r) => r && r.status === "active" && !isCrmMediaKey(r.media_key));
  return !hasActiveFeedRow;
}

/**
 * ONE batched query answering "did any feed row EVER exist" for the given listing ids.
 *
 * @returns a Set of listing ids that HAVE feed history. An id absent from the Set was queried and
 *          provably has none (`hadFeedRelationalRows = false`). An id never passed in is UNKNOWN
 *          and callers must send `undefined`, not `false`.
 * @throws  propagates any database error — never degrades to "no feed history", which would permit
 *          the stale legacy fallback this module exists to close.
 */
export async function fetchFeedMediaAuthority(
  db: FeedAuthorityDb,
  listingIds: readonly string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = [...new Set(listingIds)].filter((id) => typeof id === "string" && id !== "");
  if (ids.length === 0) return out; // no query at all when nothing is ambiguous

  const rows = await db.listingMedia.findMany({
    where: { listing: { listing_id: { in: ids } }, ...FEED_MEDIA_WHERE },
    select: { listing: { select: { listing_id: true } } },
    distinct: ["listing_id"],
  });

  for (const r of rows) {
    const id = r?.listing?.listing_id;
    if (typeof id === "string" && id !== "") out.add(id);
  }
  return out;
}

/**
 * Convenience wrapper: decide ambiguity for a page of listings, run at most ONE query, and return
 * a per-listing resolver signal.
 *
 * `undefined` for a listing means "not looked up" (Mallan-owned, or already proven by an active
 * feed row) — and `undefined` is exactly what the resolver treats as unknown, preserving current
 * behaviour rather than inventing an answer.
 */
export async function resolveFeedAuthorityForPage(
  db: FeedAuthorityDb,
  listings: ReadonlyArray<{ ctx: MediaFallbackContext; tableRows: ReadonlyArray<FeedAuthorityRow> }>,
): Promise<Map<string, boolean | undefined>> {
  const result = new Map<string, boolean | undefined>();
  const ambiguous: string[] = [];

  for (const l of listings) {
    const id = String(l.ctx?.listingId ?? "");
    if (!id) continue;
    if (isMallanOwnedListing(l.ctx)) {
      result.set(id, undefined); // Mallan authority is unchanged; never queried.
      continue;
    }
    if (!needsFeedAuthorityLookup(l.ctx, l.tableRows)) {
      result.set(id, true); // an ACTIVE feed row proves feed history without a read
      continue;
    }
    ambiguous.push(id);
  }

  if (ambiguous.length === 0) return result; // ZERO extra queries on a fully-active page
  const withFeedHistory = await fetchFeedMediaAuthority(db, ambiguous);
  for (const id of ambiguous) result.set(id, withFeedHistory.has(id));
  return result;
}
