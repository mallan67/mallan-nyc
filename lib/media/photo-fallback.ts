/**
 * PR-E.1.a — bounded live media fallback for the DB-first `/api/listings` path.
 *
 * Why this exists:
 *
 *   The 2026-05-14 PR-E.1 investigation found that 8,597 of 10,500 active+
 *   displayable listings (81.9%) have zero rows in the relational
 *   `listing_media` table. Of those, 1,286 (12.2% of all active) also have
 *   zero photos in the legacy `media` JSON column. Public search rendered
 *   those as blank cards. The `/api/listings/[id]` detail endpoint already
 *   fetches media live from Trestle for the same listings — it works. This
 *   module brings the same fallback into the list endpoint, bounded.
 *
 * What this DOES:
 *
 *   - For each public listing with `media.length === 0`, call the provided
 *     `fetcher` (in production: `fetchListingMedia` from `lib/idx/fetch`).
 *   - If the fetcher returns photos, set `listing.media` to the proxied URLs.
 *   - If the fetcher rejects, throws, or hangs past `timeoutMs`, the listing
 *     remains in the response with empty media. The card renders a
 *     placeholder; the listing is never dropped or hidden.
 *
 * Strict bounds:
 *
 *   - `concurrency` (default 5): max parallel fetches in flight.
 *   - `timeoutMs` (default 1,500): top-level race; the whole operation never
 *     adds more than this to the response. Per-listing timeouts come from
 *     the underlying fetcher's own AbortController.
 *
 * What this DOES NOT do (PR-E.1.b / .c scope):
 *
 *   - Does not write to `listing_media`, the `media` JSON column, or R2.
 *   - Does not mutate any field other than `listing.media`. `_source`,
 *     `_compliance`, attribution, disclaimer, address-suppression, and
 *     every distribution-gate flag remain untouched.
 *   - Does not change the media-sync or media-backfill cron schedule.
 *   - Does not change listing_media schema or R2 mirror logic.
 *
 * Compliance posture: zero side effects on REBNY/RLS/UCBA/Fair Housing/
 * advertising rules. Photos are already authorized for IDX display by the
 * upstream distribution-gate filter (`filterDisplayableDbListings`) — this
 * module fetches images that the listing was already entitled to show.
 */

/**
 * Minimal shape this module needs from a public listing. Kept loose so the
 * route can pass `PublicListingDTO` (which has many more fields) and the
 * tests can pass minimal fixtures.
 */
export interface FillablePublicListing {
  id: string;
  media: Array<{ url: string; mediaType: string; order: number }>;
}

/**
 * Signature of the live-media fetcher. Production: `fetchListingMedia` from
 * `lib/idx/fetch.ts`. Tests: a Jest mock.
 */
export type MediaFetcher = (
  listingId: string,
) => Promise<Array<{ url: string; mediaType: string; order: number }>>;

export interface FillEmptyMediaOptions {
  /** Live fetcher (production: `fetchListingMedia`). */
  fetcher: MediaFetcher;
  /** Max concurrent fetches. Default 5. */
  concurrency?: number;
  /** Top-level timeout for the whole operation, milliseconds. Default 1,500. */
  timeoutMs?: number;
  /**
   * Substring match — URLs whose host contains any of these are routed
   * through `/api/media/proxy` (server-side Bearer auth needed). Default
   * matches Trestle/Cotality hosts.
   */
  proxyHosts?: ReadonlyArray<string>;
}

const DEFAULT_PROXY_HOSTS: ReadonlyArray<string> = ['cotality.com', 'corelogic.com'];
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_TIMEOUT_MS = 1500;

/**
 * Route a media URL through the auth proxy when the host requires server-
 * side Bearer credentials (Trestle / Cotality). Other hosts (R2, mallan.nyc
 * own CDN) are returned as-is.
 *
 * Exported so the route handler and tests share the same proxy-host policy.
 */
export function maybeProxyUrl(url: string, hosts: ReadonlyArray<string> = DEFAULT_PROXY_HOSTS): string {
  if (!url) return url;
  return hosts.some((h) => url.includes(h))
    ? `/api/media/proxy?url=${encodeURIComponent(url)}`
    : url;
}

/**
 * Fill empty `media` on public listings via a bounded live fetch.
 *
 * Mutates `listings[i].media` in place. Returns the same array reference for
 * call-site ergonomics. Resolves at or before `timeoutMs`; never rejects.
 */
export async function fillEmptyMediaWithLiveFallback<T extends FillablePublicListing>(
  listings: T[],
  opts: FillEmptyMediaOptions,
): Promise<T[]> {
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const proxyHosts = opts.proxyHosts ?? DEFAULT_PROXY_HOSTS;

  const needsPhotos = listings.filter((l) => l.media.length === 0);
  if (needsPhotos.length === 0) return listings;

  const work = (async () => {
    for (let i = 0; i < needsPhotos.length; i += concurrency) {
      const batch = needsPhotos.slice(i, i + concurrency);
      await Promise.allSettled(
        batch.map(async (listing) => {
          try {
            const media = await opts.fetcher(listing.id);
            if (!Array.isArray(media) || media.length === 0) return;
            // Mutate in place — the call site owns the listings array.
            listing.media = media.map((m) => ({
              ...m,
              url: maybeProxyUrl(m.url, proxyHosts),
            }));
          } catch {
            // Fail-soft per listing — keep it in the response with empty
            // media; the card renders a placeholder. No throw, no log.
          }
        }),
      );
    }
  })();

  await Promise.race([
    work,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);

  return listings;
}
