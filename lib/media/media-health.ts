/**
 * Whether a listing photo can be had from Cotality right now — the answer of GET /api/media/health (app/api/media/health/route.ts), and what the pages do with it.
 *
 * Cotality answers 404 for the photos of some listings: `{"code":"404","message":"ERROR - External media was not downloaded."}` is the answer for the stored link of RLS20119888 (read 2026-10-08
 * straight from the signed link, which needs no credentials), and the same links answer 404 through our media proxy and our image optimizer. A photo that exists is answered with a 302 to the
 * media CDN (media-cdn-v2.corelogic.com), which the route does not follow. Those answers cannot be cached where they are given (the proxy and the optimizer rightly refuse to cache an error), so a
 * page that asks about a photo from every visitor's browser reaches Cotality once per visitor per photo, and Cotality meters media requests per minute and per hour for the whole account. The route
 * asks once and says so for a few minutes (a CDN cache), in a plain 200 answer that is safe to cache.
 *
 * Pure: no I/O. The route does the request; this says what its answer means.
 *
 * @module lib/media/media-health
 */

/** The public path of the route. */
export const MEDIA_HEALTH_PATH = '/api/media/health';

/**
 * What is known about a photo: `ok` is true when Cotality has it (it answered with an image, or sent us on to its media CDN), false when Cotality said it does not (`status` is its HTTP status and
 * `reason` its one-line message), and null when nothing is known (no answer in time, an answer that says nothing lasting, a route that was too busy to ask).
 */
export interface MediaHealth {
  ok: boolean | null;
  status: number | null;
  reason: string | null;
}

/** Nothing is known. */
export const UNKNOWN_MEDIA_HEALTH: MediaHealth = { ok: null, status: null, reason: null };

/** How long the CDN may keep an answer (seconds), and how long a browser may: an answer that says "can be had" is kept for five minutes, and may be served a while longer while it is renewed. */
export const ANSWERED_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';
/** An answer that says "cannot be had" is kept for five minutes, and never served stale: a photo that has been fixed must not be passed over for a quarter of an hour. */
export const BROKEN_CACHE_CONTROL = 'public, max-age=60, s-maxage=300';
/** An answer that says nothing is known is kept for half a minute at the CDN, and not at all by a browser. */
export const UNKNOWN_CACHE_CONTROL = 'public, max-age=0, s-maxage=30';

/** The Cache-Control of an answer. */
export function cacheControlFor(health: MediaHealth): string {
  if (health.ok === null) return UNKNOWN_CACHE_CONTROL;
  return health.ok ? ANSWERED_CACHE_CONTROL : BROKEN_CACHE_CONTROL;
}

/** The longest reason kept (characters). */
export const MAX_REASON_LENGTH = 200;

/**
 * The one-line `message` of a Cotality JSON error body, e.g. `{"code":"404","message":"ERROR - External media was not downloaded.","target":null,...}`; null when the body is not JSON, has no
 * text message, or the message is blank. Only the message is taken: never the body, never a header.
 */
export function reasonFromBody(body: string | null | undefined): string | null {
  try {
    const message = (JSON.parse(body ?? '') as { message?: unknown }).message;     // (a body that is not JSON, or is JSON null, throws: no reason)
    if (typeof message !== 'string') return null;
    const line = message.replace(/\s+/g, ' ').trim();
    return line ? line.slice(0, MAX_REASON_LENGTH) : null;
  } catch {
    return null;
  }
}

/** The hosts Cotality's media API sends a photo that exists on to. */
export const MEDIA_CDN_HOSTS: readonly string[] = ['media-cdn-v2.corelogic.com'];

/** Whether `location` (the Location header of a redirect) is an https address on the media CDN: the only place the media API sends a photo that exists. */
export function isMediaCdnAddress(location: string | null | undefined): boolean {
  if (!location) return false;
  try {
    const address = new URL(location);
    return address.protocol === 'https:' && MEDIA_CDN_HOSTS.includes(address.hostname);
  } catch {
    return false;                                      // (a relative address, or text that is not an address)
  }
}

/**
 * What an answer of Cotality means for a photo. The photo can be had when Cotality answers 2xx with an image, or answers a redirect (3xx) to its media CDN: the media API only sends a photo it has
 * on. It cannot be had when Cotality says so itself: a 404 or a 410 with the one-line JSON message of its own error (`reason`: "External media was not downloaded.", "Media record not found!").
 * Everything else says nothing lasting about the photo, and nothing is known: a 404 without such a message (a firewall's page is not Cotality's word), a 401 or a 403 (a firewall may be answering
 * for Cotality, and a photo is not passed over because of it), a redirect anywhere else, a timeout (408), a limit reached (429), a failure of Cotality's own (5xx), and a 2xx that is not an image
 * (a challenge page is a page, not a verdict on the photo). A photo that is wrongly passed over costs a listing its place for five minutes; a photo that is wrongly kept is the card the section
 * always showed.
 */
export function judgeMediaResponse(
  status: number,
  contentType: string | null | undefined,
  reason: string | null,
  location?: string | null,
): MediaHealth {
  if (status >= 200 && status < 300) {
    const type = (contentType || '').trim().toLowerCase();
    return type.startsWith('image/')
      ? { ok: true, status, reason: null }
      : { ok: null, status, reason: `not an image (${type || 'no content type'})`.slice(0, MAX_REASON_LENGTH) };
  }
  if (status >= 300 && status < 400 && isMediaCdnAddress(location)) return { ok: true, status, reason: null };
  if ((status === 404 || status === 410) && reason) return { ok: false, status, reason };
  return { ok: null, status, reason: null };
}
