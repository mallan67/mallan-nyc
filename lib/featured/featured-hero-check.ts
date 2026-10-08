/**
 * Homepage "Featured Listings": prefer the listings whose photo can be shown.
 *
 * Reported 2026-10-08: some Featured cards showed the grey placeholder (with "12 photos" over it). The list endpoint ships ONE hero per listing, and Cotality answers 404 for the
 * photos of some listings (`{"code":"404","message":"ERROR - External media was not downloaded."}`: the hero's address is a signed Cotality media link, and our media proxy and image optimizer
 * relay the 404). `filterFeaturedDisplayable` (featured-ordering.ts) already drops a listing that has no usable photo ADDRESS; it cannot know that the address answers 404. A section that
 * headlines the home page should not lead with grey boxes while listings with a working photo are in the feed, so the section looks at its candidates' photos before it draws them:
 *
 *   - candidates arrive in the section's own order (Mallan-owned exclusives, then pinned listings, then the rest), and the first `limit` that can be shown are drawn, in that
 *     order; a candidate whose photo answered 404 gives its place to the next one;
 *   - a Mallan-owned listing (its photos are our own copies) and a pinned listing (the broker chose it for the section) are never asked about or passed over;
 *   - a photo that did not answer in time, or whose address cannot be asked about, is NOT taken as broken (a slow network must not empty the section);
 *   - when there are fewer working listings than places, the ones passed over fill the rest, in their order (the card then shows the placeholder, without a photo count).
 *
 * The question is put to GET /api/media/health (app/api/media/health/route.ts), which asks Cotality once and says so for a few minutes at the CDN: a question put from every visitor's
 * browser would reach Cotality once per visitor per photo (an error is not cached by the proxy or the image optimizer, and Cotality meters media requests for the whole account).
 *
 * Pure apart from the injected `check`; `checkHeroUrl` is the check the page uses.
 *
 * @module lib/featured/featured-hero-check
 */

import { getValidPhotoMedia, type ListingPhotoMedia } from '@/lib/media/listing-card-media';
import { MEDIA_HEALTH_PATH } from '@/lib/media/media-health';
import { unwrapProxiedMediaUrl } from '@/lib/media/proxy-url-policy';

/** What asking about a listing's photo told: it can be had ('ok'), it cannot ('broken'), or nothing is known ('unknown'). */
export type HeroCheck = 'ok' | 'broken' | 'unknown';

/** The address of the photo a Featured card shows: the first usable photo of the listing (the same one the card's own helper picks), or null when it has none. */
export function featuredHeroUrl(listing: { media?: readonly ListingPhotoMedia[] | null }): string | null {
  const hero = getValidPhotoMedia(listing.media ?? null)[0];
  return hero?.url || null;
}

/** How long the page waits for the answer before it stops asking (a photo that is slow is not a photo that is broken). */
export const HERO_CHECK_TIMEOUT_MS = 4000;

export interface HeroCheckDeps {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Asks whether the photo at `url` can be had. Only photos behind our media proxy (`/api/media/proxy?url=<Cotality media link>`) are asked about: they are the ones that can answer 404
 * (a Cotality media link whose file Cotality does not have). Any other address (a copy in our own storage, a relative or nested proxy address) is not asked about: nothing is known
 * ('unknown'), which is never taken as broken. An answer that cannot be had (the route is missing, it failed, it did not answer in time, it said it does not know) is 'unknown' as well.
 */
export async function checkHeroUrl(url: string | null | undefined, deps: HeroCheckDeps = {}): Promise<HeroCheck> {
  const source = url ? unwrapProxiedMediaUrl(url) : null;
  if (!source) return 'unknown';
  const fetchFn = deps.fetchFn ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? HERO_CHECK_TIMEOUT_MS);
  try {
    const response = await fetchFn(`${MEDIA_HEALTH_PATH}?url=${encodeURIComponent(source)}`, { signal: controller.signal });
    if (!response.ok) return 'unknown';
    const health = (await response.json()) as { ok?: unknown } | null;
    return health?.ok === true ? 'ok' : health?.ok === false ? 'broken' : 'unknown';
  } catch {
    return 'unknown';                                  // no answer in time, or no network, or not JSON: not proof that the photo is broken
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The listings to draw: the first `limit` of `ordered` whose photo is not known to be broken, in their order, then (when there are not enough) the ones passed over, in their order.
 * Candidates are asked about in waves of as many as there are places left, so a feed whose first `limit` all work is asked about once.
 *
 * `isExempt` listings (Mallan-owned, pinned) are taken as they come, without asking. A `check` that throws counts as 'unknown'.
 */
export async function selectFeaturedWithWorkingHeroes<T>(
  ordered: readonly T[],
  limit: number,
  check: (listing: T) => Promise<HeroCheck>,
  isExempt: (listing: T) => boolean,
): Promise<T[]> {
  const places = Math.floor(limit);
  const ask = async (listing: T): Promise<HeroCheck> => {
    if (isExempt(listing)) return 'ok';
    try {
      return await check(listing);
    } catch {
      return 'unknown';
    }
  };
  const shown: T[] = [];
  const passedOver: T[] = [];
  let next = 0;
  while (shown.length < places && next < ordered.length) {
    const wave = ordered.slice(next, next + (places - shown.length));
    next += wave.length;
    const answers = await Promise.all(wave.map(ask));
    wave.forEach((listing, i) => (answers[i] === 'broken' ? passedOver : shown).push(listing));
  }
  return shown.concat(passedOver.slice(0, places - shown.length));
}
