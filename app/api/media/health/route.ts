// GET /api/media/health?url=<cotality-media-url>
// Whether a listing photo can be had from Cotality right now: { ok: true | false | null, status, reason }. The Featured Listings section asks before it draws a card, so that a listing whose
// photo Cotality answers 404 for ("ERROR - External media was not downloaded.") does not take a place from a listing whose photo works (lib/featured/featured-hero-check.ts).
//
// Why a route, and not a request from every browser: the answers that matter here are errors, and the media proxy and the image optimizer rightly refuse to cache an error, so a question put
// from every visitor's browser reaches Cotality once per visitor per photo, and Cotality meters media requests per minute and per hour for the whole account (the sync shares it). Here the answer
// is a plain 200 that the CDN keeps for five minutes (lib/media/media-health.ts), so Cotality is asked about a photo once per cache window, whoever is looking.
//
// The request is the one the browser's own image request makes (unauthenticated: the media links are signed), so the answer is the answer the card will get.
//
// SECURITY: the exact-host allowlist of the media proxy (lib/media/proxy-url-policy.ts) decides what may be asked about, and only the one spelling of a link that the pages send is answered (https,
// no port, no query, no fragment, no credentials, nothing else in the query of the request): the CDN keys its cache on the whole address, so every other spelling of the same photo would be another
// key, and another question to Cotality. A visitor may put 60 questions a minute that the cache does not answer, and all visitors together 300 (the Upstash limiters of lib/middleware/rate-limiter.ts;
// an instance without Redis counts for itself): past that the answer is "unknown", not cached. No redirect is followed; at most MAX_CONCURRENT questions are in flight per instance (a busy instance
// says it does not know); only the status and Cotality's one-line reason are returned: never a body, never a header.

import { NextRequest, NextResponse } from 'next/server';
import { isAllowedMediaUrl } from '@/lib/media/proxy-url-policy';
import { cacheControlFor, judgeMediaResponse, reasonFromBody, UNKNOWN_MEDIA_HEALTH, type MediaHealth } from '@/lib/media/media-health';
import { checkRouteRateLimit, extractClientIp } from '@/lib/middleware/rate-limiter';

// Cotality answers a media request in well under a second; a photo that takes longer than this is not asked about any more (nothing is known)
const TIMEOUT_MS = 3000;
// questions in flight at once, per instance
const MAX_CONCURRENT = 10;
// how much of an error body is read: Cotality's are one line of JSON
const MAX_BODY_BYTES = 2048;
// questions per minute that the cache did not answer: from one visitor, and from all of them (a fraction of the 1,120 media requests a minute Cotality allows the account, which the sync shares)
const PER_VISITOR_PER_MINUTE = 60;
const ALL_VISITORS_PER_MINUTE = 300;

let inFlight = 0;

/**
 * Whether `url` is the one spelling of a Cotality media link that the pages send: https, no port, under /trestle/, and written exactly as a URL parser writes its origin and path (so no capitals in
 * the host, no default port spelled out, no dot segments, no spaces, no credentials, and no query or fragment, not even an empty one). Called after isAllowedMediaUrl, which has parsed the address.
 */
function isCanonicalMediaUrl(url: string): boolean {
  const address = new URL(url);
  return address.protocol === 'https:'
    && address.port === ''
    && address.pathname.startsWith('/trestle/')
    && url === `${address.origin}${address.pathname}`;
}

/** Up to MAX_BODY_BYTES of a response body as text (the body is stopped there). */
async function readSnippet(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.length < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
  return text.slice(0, MAX_BODY_BYTES);
}

const answer = (health: MediaHealth) => NextResponse.json(health, { headers: { 'Cache-Control': cacheControlFor(health) } });

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const url = params.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!isAllowedMediaUrl(url)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!isCanonicalMediaUrl(url) || params.getAll('url').length !== 1 || [...params.keys()].some((key) => key !== 'url')) {
    return NextResponse.json({ error: 'URL not canonical' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  // (both limits are asked before the counter below is looked at, so that the check and the increment of the counter stay together, with nothing awaited between them)
  const withinLimits = await checkRouteRateLimit(extractClientIp(req.headers), 'media_health', PER_VISITOR_PER_MINUTE, 60)
    && await checkRouteRateLimit('all-visitors', 'media_health_global', ALL_VISITORS_PER_MINUTE, 60);
  if (!withinLimits || inFlight >= MAX_CONCURRENT) {
    // not cached: the next question may find the instance quiet
    return NextResponse.json(UNKNOWN_MEDIA_HEALTH, { headers: { 'Cache-Control': 'no-store' } });
  }

  inFlight++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // no-store: the answer is cached at the CDN (below), not in Next's data cache, and a photo that works would otherwise be kept whole there
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual', cache: 'no-store', headers: { Accept: 'image/*' } });
    // only a 404 or a 410 can say that the photo cannot be had, and only with Cotality's own words: nothing else has its body read
    const reason = response.status === 404 || response.status === 410 ? reasonFromBody(await readSnippet(response)) : null;
    return answer(judgeMediaResponse(response.status, response.headers.get('content-type'), reason, response.headers.get('location')));
  } catch {
    // no answer in time, or no network: nothing is known (and nothing is logged with the address: it is a signed link)
    return answer(UNKNOWN_MEDIA_HEALTH);
  } finally {
    clearTimeout(timer);
    controller.abort();                                // stops a body that is still coming (a photo that works: only its status was wanted)
    inFlight--;
  }
}
