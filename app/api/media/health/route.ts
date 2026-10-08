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
// SECURITY: the exact-host allowlist of the media proxy (lib/media/proxy-url-policy.ts) decides what may be asked about; no redirect is followed; at most MAX_CONCURRENT questions are in flight
// per instance (a busy instance says it does not know); only the status and Cotality's one-line reason are returned: never a body, never a header.

import { NextRequest, NextResponse } from 'next/server';
import { isAllowedMediaUrl } from '@/lib/media/proxy-url-policy';
import { cacheControlFor, judgeMediaResponse, reasonFromBody, UNKNOWN_MEDIA_HEALTH, type MediaHealth } from '@/lib/media/media-health';

// Cotality answers a media request in well under a second; a photo that takes longer than this is not asked about any more (nothing is known)
const TIMEOUT_MS = 3000;
// questions in flight at once, per instance
const MAX_CONCURRENT = 10;
// how much of an error body is read: Cotality's are one line of JSON
const MAX_BODY_BYTES = 2048;

let inFlight = 0;

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
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!isAllowedMediaUrl(url)) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (inFlight >= MAX_CONCURRENT) {
    // not cached: the next question may find the instance quiet
    return NextResponse.json(UNKNOWN_MEDIA_HEALTH, { headers: { 'Cache-Control': 'no-store' } });
  }

  inFlight++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // no-store: the answer is cached at the CDN (below), not in Next's data cache, and a photo that works would otherwise be kept whole there
    const response = await fetch(url, { signal: controller.signal, redirect: 'manual', cache: 'no-store', headers: { Accept: 'image/*' } });
    const reason = response.status >= 400 && response.status < 500 ? reasonFromBody(await readSnippet(response)) : null;
    return answer(judgeMediaResponse(response.status, response.headers.get('content-type'), reason));
  } catch {
    // no answer in time, or no network: nothing is known (and nothing is logged with the address: it is a signed link)
    return answer(UNKNOWN_MEDIA_HEALTH);
  } finally {
    clearTimeout(timer);
    controller.abort();                                // stops a body that is still coming (a photo that works: only its status was wanted)
    inFlight--;
  }
}
