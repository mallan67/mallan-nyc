/// <reference types="jest" />
/**
 * GET /api/media/health: whether a listing photo can be had from Cotality right now (app/api/media/health/route.ts, lib/media/media-health.ts).
 *
 * Cotality answers 404 for the photos of some listings (`{"code":"404","message":"ERROR - External media was not downloaded."}`, read 2026-10-08 straight from the signed link of RLS20119888, which
 * needs no credentials), and a photo that exists with a 302 to its media CDN. The Featured Listings section asks before it draws a card; the route asks Cotality once and says so for five minutes at
 * the CDN, because an error answer is not cached by the media proxy or the image optimizer, and a question put from every visitor's browser would reach Cotality once per visitor per photo (Cotality
 * meters media requests for the whole account). Only the one spelling of a link that the pages send is answered, and the questions the cache does not answer are limited per visitor and in all.
 *
 * These tests drive the real route handler with a Cotality that answers as told.
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/media/health/route';
import {
  ANSWERED_CACHE_CONTROL,
  BROKEN_CACHE_CONTROL,
  MAX_REASON_LENGTH,
  MEDIA_CDN_HOSTS,
  MEDIA_HEALTH_PATH,
  UNKNOWN_CACHE_CONTROL,
  UNKNOWN_MEDIA_HEALTH,
  cacheControlFor,
  isMediaCdnAddress,
  judgeMediaResponse,
  reasonFromBody,
} from '@/lib/media/media-health';

// The rate limiter (Upstash, shared by every route) is replaced: these tests say what it answers, and read what the route asks it.
const mockLimit = jest.fn(async (_ip: string, _route: string, _count: number, _seconds: number) => true);
jest.mock('@/lib/middleware/rate-limiter', () => ({
  __esModule: true,
  checkRouteRateLimit: (ip: string, route: string, count: number, seconds: number) => mockLimit(ip, route, count, seconds),
  extractClientIp: (headers: Headers) => headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'unknown',
}));

const PHOTO = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1192566511/1/NjA0My8xMTM3MS8yMA/MjAvMjE1MjYvMTc5MTQzNTAyMA/VFkx0jK4sdXvH4kKBiBWZ-dYYE3dnIFJfTN2X-pLAeU';
const CDN = 'https://media-cdn-v2.corelogic.com/photos/1192571904/2/abc.jpg?Expires=1&Signature=x';
const NOT_DOWNLOADED = '{"code":"404","message":"ERROR - External media was not downloaded.","target":null,"details":null,"innerError":null,"instanceAnnotations":[],"typeAnnotation":null}';
const ask = (url: string | null, headers?: Record<string, string>) => new NextRequest(`https://mallan.nyc${MEDIA_HEALTH_PATH}${url === null ? '' : `?url=${encodeURIComponent(url)}`}`, { headers });
const askRaw = (search: string) => new NextRequest(`https://mallan.nyc${MEDIA_HEALTH_PATH}${search}`);

describe('judgeMediaResponse: what an answer of Cotality means for a photo', () => {
  it.each([
    ['200 with an image', 200, 'image/jpeg', null, null, { ok: true, status: 200, reason: null }],
    ['200 with an image, in capitals and with a parameter', 200, 'IMAGE/WEBP; charset=binary', null, null, { ok: true, status: 200, reason: null }],
    ['204 with an image', 204, 'image/png', null, null, { ok: true, status: 204, reason: null }],
    ['299 with an image (the last answer of 2xx)', 299, 'image/jpeg', null, null, { ok: true, status: 299, reason: null }],
    ['300 with an image (not a 2xx: a choice of places, not a photo)', 300, 'image/jpeg', null, null, { ok: null, status: 300, reason: null }],
    ['200 whose content type only mentions an image later (a page, not a photo): nothing is known', 200, 'text/html; profile=image/png', null, null, { ok: null, status: 200, reason: 'not an image (text/html; profile=image/png)' }],
    ['200 whose content type has image/ inside another type: nothing is known', 200, 'application/x-image/jpeg', null, null, { ok: null, status: 200, reason: 'not an image (application/x-image/jpeg)' }],
    ['200 with a PDF: nothing is known (a browser would not draw it, but a firewall may be answering)', 200, 'application/pdf', null, null, { ok: null, status: 200, reason: 'not an image (application/pdf)' }],
    ['200 with an HTML page (a firewall\'s challenge is a page, not a verdict on the photo)', 200, 'text/html; charset=utf-8', null, null, { ok: null, status: 200, reason: 'not an image (text/html; charset=utf-8)' }],
    ['200 with no content type', 200, null, null, null, { ok: null, status: 200, reason: 'not an image (no content type)' }],
    ['200 with an empty content type', 200, '  ', null, null, { ok: null, status: 200, reason: 'not an image (no content type)' }],
    ['404 with Cotality\'s own reason: the photo cannot be had', 404, 'application/json', 'ERROR - External media was not downloaded.', null, { ok: false, status: 404, reason: 'ERROR - External media was not downloaded.' }],
    ['410 with Cotality\'s own reason: the photo cannot be had', 410, 'application/json', 'Media record not found!', null, { ok: false, status: 410, reason: 'Media record not found!' }],
    ['404 with no reason (a page of a firewall is not Cotality\'s word): nothing is known', 404, null, null, null, { ok: null, status: 404, reason: null }],
    ['410 with no reason', 410, null, null, null, { ok: null, status: 410, reason: null }],
    ['403 (a firewall may be answering for Cotality)', 403, null, 'ignored', null, { ok: null, status: 403, reason: null }],
    ['401', 401, null, 'ignored', null, { ok: null, status: 401, reason: null }],
    ['400', 400, null, 'ignored', null, { ok: null, status: 400, reason: null }],
    ['405 (with words: only a 404 and a 410 say the photo cannot be had)', 405, null, 'Method not allowed', null, { ok: null, status: 405, reason: null }],
    ['409', 409, null, 'Conflict', null, { ok: null, status: 409, reason: null }],
    ['422', 422, null, 'ignored', null, { ok: null, status: 422, reason: null }],
    ['499', 499, null, 'ignored', null, { ok: null, status: 499, reason: null }],
    ['408 (a timeout says nothing lasting)', 408, null, 'ignored', null, { ok: null, status: 408, reason: null }],
    ['429 (a limit reached says nothing lasting)', 429, null, 'ignored', null, { ok: null, status: 429, reason: null }],
    ['500 (an outage of Cotality must not pass over every listing)', 500, null, 'ignored', null, { ok: null, status: 500, reason: null }],
    ['503', 503, null, null, null, { ok: null, status: 503, reason: null }],
    ['a redirect to the media CDN: the photo exists', 302, null, null, 'https://media-cdn-v2.corelogic.com/photos/1/abc.jpg', { ok: true, status: 302, reason: null }],
    ['a 300 to the media CDN (the first 3xx)', 300, null, null, 'https://media-cdn-v2.corelogic.com/a.jpg', { ok: true, status: 300, reason: null }],
    ['a 301 to the media CDN', 301, null, null, 'https://media-cdn-v2.corelogic.com/a.jpg', { ok: true, status: 301, reason: null }],
    ['a 308 to the media CDN', 308, null, null, 'https://media-cdn-v2.corelogic.com/a.jpg', { ok: true, status: 308, reason: null }],
    ['a 399 to the media CDN (the last 3xx)', 399, null, null, 'https://media-cdn-v2.corelogic.com/a.jpg', { ok: true, status: 399, reason: null }],
    ['a 400 that carries a Location of the media CDN is not a redirect', 400, null, null, 'https://media-cdn-v2.corelogic.com/a.jpg', { ok: null, status: 400, reason: null }],
    ['a redirect to another place: nothing is known', 302, null, null, 'https://elsewhere.example/a.jpg', { ok: null, status: 302, reason: null }],
    ['a redirect with no Location', 302, null, null, null, { ok: null, status: 302, reason: null }],
    ['a redirect to a relative address', 302, null, null, '/photos/a.jpg', { ok: null, status: 302, reason: null }],
    ['a 304', 304, null, null, null, { ok: null, status: 304, reason: null }],
    ['an informational answer', 199, null, null, null, { ok: null, status: 199, reason: null }],
  ] as const)('%s', (_name, status, type, reason, location, expected) => {
    expect(judgeMediaResponse(status, type, reason, location)).toEqual(expected);
  });

  it('asks nothing about the address when it is not given one (the older callers)', () => {
    expect(judgeMediaResponse(302, null, null)).toEqual({ ok: null, status: 302, reason: null });
  });

  it('keeps no more than 200 characters of the content type of a page that is not an image', () => {
    const health = judgeMediaResponse(200, `text/${'x'.repeat(500)}`, null);
    expect(health.ok).toBeNull();
    expect(health.reason).toBe(`not an image (text/${'x'.repeat(500)})`.slice(0, MAX_REASON_LENGTH));
    expect(health.reason).toHaveLength(MAX_REASON_LENGTH);
  });
});

describe('isMediaCdnAddress: where the media API sends a photo that exists', () => {
  it('is an https address on the media CDN', () => {
    expect(MEDIA_CDN_HOSTS).toEqual(['media-cdn-v2.corelogic.com']);
    expect(isMediaCdnAddress(CDN)).toBe(true);
    expect(isMediaCdnAddress('https://media-cdn-v2.corelogic.com/a.jpg')).toBe(true);
    expect(isMediaCdnAddress('HTTPS://MEDIA-CDN-V2.CORELOGIC.COM/a.jpg')).toBe(true);
  });

  it.each([
    ['nothing', null],
    ['undefined', undefined],
    ['an empty address', ''],
    ['another host', 'https://elsewhere.example/a.jpg'],
    ['the media API itself', 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
    ['an address that is not https', 'http://media-cdn-v2.corelogic.com/a.jpg'],
    ['a host that only starts with the CDN\'s name', 'https://media-cdn-v2.corelogic.com.evil.example/a.jpg'],
    ['a host that only ends with the CDN\'s name', 'https://evil-media-cdn-v2.corelogic.com/a.jpg'],
    ['a sub-domain of the CDN', 'https://x.media-cdn-v2.corelogic.com/a.jpg'],
    ['an address whose user name is the CDN', 'https://media-cdn-v2.corelogic.com@evil.example/a.jpg'],
    ['a relative address', '/photos/a.jpg'],
    ['text that is not an address', 'not an address'],
  ] as const)('is not %s', (_name, location) => {
    expect(isMediaCdnAddress(location)).toBe(false);
  });
});

describe('reasonFromBody: the one-line message of Cotality\'s error', () => {
  it('is the message of the error Cotality answers for a photo it never downloaded', () => {
    expect(reasonFromBody(NOT_DOWNLOADED)).toBe('ERROR - External media was not downloaded.');
    expect(reasonFromBody('{"code":"404","message":"Media record not found!","target":null}')).toBe('Media record not found!');
  });

  it.each([
    ['nothing', null],
    ['undefined', undefined],
    ['an empty body', ''],
    ['a body that is not JSON', '<html>Not Found</html>'],
    ['JSON that is null', 'null'],
    ['JSON that is a number', '42'],
    ['JSON with no message', '{"code":"404"}'],
    ['JSON whose message is not text', '{"message":{"text":"no"}}'],
    ['JSON whose message is blank', '{"message":"   \\n "}'],
  ] as const)('is null for %s', (_name, body) => {
    expect(reasonFromBody(body)).toBeNull();
  });

  it('is one line: whitespace is collapsed and the ends are trimmed', () => {
    expect(reasonFromBody('{"message":"  ERROR -\\n   not   downloaded.\\t"}')).toBe('ERROR - not downloaded.');
  });

  it('is cut at 200 characters', () => {
    expect(MAX_REASON_LENGTH).toBe(200);
    const long = 'x'.repeat(500);
    expect(reasonFromBody(JSON.stringify({ message: long }))).toBe('x'.repeat(200));
    expect(reasonFromBody(JSON.stringify({ message: 'y'.repeat(200) }))).toBe('y'.repeat(200));
  });
});

describe('cacheControlFor: how long an answer is kept', () => {
  it('keeps an answer that says "can be had" for five minutes at the CDN, a minute in a browser, and may serve it a while longer while it is renewed', () => {
    expect(ANSWERED_CACHE_CONTROL).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    expect(cacheControlFor({ ok: true, status: 200, reason: null })).toBe(ANSWERED_CACHE_CONTROL);
  });

  it('keeps an answer that says "cannot be had" just as long, and never serves it stale (a photo that has been fixed must not stay passed over)', () => {
    expect(BROKEN_CACHE_CONTROL).toBe('public, max-age=60, s-maxage=300');
    expect(cacheControlFor({ ok: false, status: 404, reason: null })).toBe(BROKEN_CACHE_CONTROL);
    expect(BROKEN_CACHE_CONTROL).not.toContain('stale-while-revalidate');
  });

  it('keeps an answer that says nothing is known for half a minute at the CDN, and not at all in a browser', () => {
    expect(UNKNOWN_CACHE_CONTROL).toBe('public, max-age=0, s-maxage=30');
    expect(cacheControlFor(UNKNOWN_MEDIA_HEALTH)).toBe(UNKNOWN_CACHE_CONTROL);
    expect(cacheControlFor({ ok: null, status: 302, reason: null })).toBe(UNKNOWN_CACHE_CONTROL);
  });
});

describe('GET /api/media/health', () => {
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => { mockLimit.mockReset(); mockLimit.mockResolvedValue(true); });
  afterEach(() => { fetchSpy?.mockRestore(); jest.useRealTimers(); });
  const cotality = (impl: (url: string, init: RequestInit) => Promise<Response>) => { fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(impl as unknown as typeof fetch); return fetchSpy; };
  const json = async (res: Response) => ({ status: res.status, body: await res.json(), cache: res.headers.get('Cache-Control') });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  describe('what may be asked about', () => {
    it('says it needs an address when it is given none, and does not cache that', async () => {
      const spy = cotality(async () => new Response(null, { status: 200 }));
      const res = await GET(ask(null));
      expect(await json(res)).toEqual({ status: 400, body: { error: 'Missing url parameter' }, cache: 'no-store' });
      expect(spy).not.toHaveBeenCalled();
    });

    it.each([
      ['a host that is not allowed', 'https://evil.example/a.jpg'],
      ['a look-alike host (the allowlist is exact, not a suffix)', 'https://evil.cotality.com/a.jpg'],
      ['a host that only contains an allowed one', 'https://api.cotality.com.evil.example/a.jpg'],
      ['a relative address', '/api/media/proxy?url=x'],
      ['text that is not an address', 'not an address'],
      ['an address with no host', 'file:///etc/passwd'],
    ] as const)('refuses %s with a 403, asks Cotality nothing, and does not cache that', async (_name, url) => {
      const spy = cotality(async () => new Response(null, { status: 200 }));
      const res = await GET(ask(url));
      expect(await json(res)).toEqual({ status: 403, body: { error: 'URL not allowed' }, cache: 'no-store' });
      expect(spy).not.toHaveBeenCalled();
    });

    it('asks about the media hosts the proxy allows', async () => {
      for (const host of ['api.cotality.com', 'api-trestle.corelogic.com', 'api-prod.corelogic.com']) {
        const spy = cotality(async () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
        const res = await GET(ask(`https://${host}/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C`));
        expect((await json(res)).body.ok).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
      }
    });

    // The CDN keys its cache on the whole address of the request: every other spelling of the same photo would be another key, and another question to Cotality.
    it.each([
      ['capitals in the scheme and the host', 'HTTPS://API.COTALITY.COM/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
      ['the default port spelled out', 'https://api.cotality.com:443/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
      ['a port that is not the default', 'https://api.cotality.com:8443/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
      ['a scheme that is not https', 'http://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
      ['a query on the link', `${PHOTO}?cb=1`],
      ['a bare ? on the link', `${PHOTO}?`],
      ['a fragment on the link', `${PHOTO}#x`],
      ['a user name and a password', 'https://user:secret@api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
      ['a user name', 'https://user@api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
      ['a path that is not under /trestle/', 'https://api.cotality.com/other/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
      ['dot segments in the path', 'https://api.cotality.com/trestle/Media/../Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
      ['a character a parser would write another way', 'https://api.cotality.com/trestle/Media/Property/PHOTO Jpeg/1/1/A/B/C'],
    ] as const)('answers 400 and asks nothing for %s (a spelling of a link that the pages do not send)', async (_name, url) => {
      const spy = cotality(async () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
      const res = await GET(ask(url));
      expect(await json(res)).toEqual({ status: 400, body: { error: 'URL not canonical' }, cache: 'no-store' });
      expect(spy).not.toHaveBeenCalled();
      expect(mockLimit).not.toHaveBeenCalled();                                              // (a refused spelling costs the visitor none of the questions he may ask)
    });

    it.each([
      ['another parameter after the link', `?url=${encodeURIComponent(PHOTO)}&b=1`],
      ['another parameter before the link', `?b=1&url=${encodeURIComponent(PHOTO)}`],
      ['a parameter with no value', `?url=${encodeURIComponent(PHOTO)}&b`],
      ['another parameter that holds the same address', `?b=${encodeURIComponent(PHOTO)}&url=${encodeURIComponent(PHOTO)}`],
      ['the link given twice', `?url=${encodeURIComponent(PHOTO)}&url=${encodeURIComponent(PHOTO)}`],
      ['the link given twice, differently', `?url=${encodeURIComponent(PHOTO)}&url=${encodeURIComponent(`${PHOTO}x`)}`],
    ] as const)('answers 400 and asks nothing for %s (another key of the CDN\'s cache)', async (_name, search) => {
      const spy = cotality(async () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
      const res = await GET(askRaw(search));
      expect(await json(res)).toEqual({ status: 400, body: { error: 'URL not canonical' }, cache: 'no-store' });
      expect(spy).not.toHaveBeenCalled();
      expect(mockLimit).not.toHaveBeenCalled();
    });

    it('answers the link as the pages send it: a longer path, characters a parser leaves alone, and each of the three hosts', async () => {
      const links = [
        PHOTO,
        'https://api-trestle.corelogic.com/trestle/Media/Property/PHOTO-Jpeg/1192566511/1/NjA0My8xMTM3MS8yMA/MjAv-_/VFkx0jK4%3D',
        'https://api-prod.corelogic.com/trestle/Media/Property/PHOTO-Jpeg/9/9/a.b/c~d/e',
      ];
      for (const link of links) {
        const spy = cotality(async () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
        expect((await json(await GET(ask(link)))).body.ok).toBe(true);
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
      }
    });
  });

  describe('how many questions a visitor may put', () => {
    it('asks the limiter for the visitor (60 a minute, by the first address of X-Forwarded-For) and then for all visitors together (300 a minute), before it asks Cotality', async () => {
      const order: string[] = [];
      mockLimit.mockImplementation(async (_ip, route) => { order.push(`limit:${route}`); return true; });
      cotality(async () => { order.push('cotality'); return new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }); });
      expect((await json(await GET(ask(PHOTO, { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })))).body.ok).toBe(true);
      expect(mockLimit.mock.calls).toEqual([
        ['203.0.113.9', 'media_health', 60, 60],
        ['all-visitors', 'media_health_global', 300, 60],
      ]);
      expect(order).toEqual(['limit:media_health', 'limit:media_health_global', 'cotality']);
    });

    it('says it does not know, and asks Cotality nothing, when the visitor has put too many questions; the answer is not cached, and the limit for all visitors is not touched', async () => {
      mockLimit.mockImplementation(async (_ip, route) => route !== 'media_health');
      const spy = cotality(async () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
      expect(await json(await GET(ask(PHOTO)))).toEqual({ status: 200, body: { ok: null, status: null, reason: null }, cache: 'no-store' });
      expect(spy).not.toHaveBeenCalled();
      expect(mockLimit.mock.calls.map((c) => c[1])).toEqual(['media_health']);
    });

    it('says it does not know, and asks Cotality nothing, when all visitors together have put too many; the answer is not cached', async () => {
      mockLimit.mockImplementation(async (_ip, route) => route !== 'media_health_global');
      const spy = cotality(async () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
      expect(await json(await GET(ask(PHOTO)))).toEqual({ status: 200, body: { ok: null, status: null, reason: null }, cache: 'no-store' });
      expect(spy).not.toHaveBeenCalled();
      expect(mockLimit.mock.calls.map((c) => c[1])).toEqual(['media_health', 'media_health_global']);
    });

    it('does not keep a place in the busy counter for a question that was refused by a limit', async () => {
      mockLimit.mockResolvedValue(false);
      const spy = cotality(async () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
      for (let i = 0; i < 25; i++) expect((await json(await GET(ask(PHOTO)))).body.ok).toBeNull();
      mockLimit.mockResolvedValue(true);
      expect((await json(await GET(ask(PHOTO)))).body.ok).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('what Cotality answers', () => {
    it('a photo that works: ok, with its status, kept for five minutes; the request is the browser\'s own (unauthenticated, no redirect followed) and the body is stopped', async () => {
      let signal!: AbortSignal;
      let init!: RequestInit;
      const spy = cotality(async (_url, i) => { init = i; signal = i.signal as AbortSignal; return new Response('JPEGDATA', { status: 200, headers: { 'content-type': 'image/jpeg' } }); });
      const res = await GET(ask(PHOTO));
      expect(await json(res)).toEqual({ status: 200, body: { ok: true, status: 200, reason: null }, cache: ANSWERED_CACHE_CONTROL });
      expect(spy.mock.calls[0][0]).toBe(PHOTO);
      expect(init.redirect).toBe('manual');
      expect(init.cache).toBe('no-store');                                                   // (Next's data cache keeps nothing: the CDN keeps the answer)
      expect(init.headers).toEqual({ Accept: 'image/*' });
      expect(init.headers).not.toHaveProperty('Authorization');
      expect(signal.aborted).toBe(true);
    });

    it('a photo that exists is answered by Cotality with a redirect to its media CDN: ok, with the status, kept for five minutes (the redirect is not followed)', async () => {
      const spy = cotality(async () => new Response(null, { status: 302, headers: { Location: CDN, 'cache-control': 'public, max-age=10' } }));
      const res = await GET(ask(PHOTO));
      expect(await json(res)).toEqual({ status: 200, body: { ok: true, status: 302, reason: null }, cache: ANSWERED_CACHE_CONTROL });
      expect(spy).toHaveBeenCalledTimes(1);                                                  // (one question: the CDN is not asked)
    });

    it('a redirect to anywhere else says nothing is known, and is kept for half a minute only', async () => {
      cotality(async () => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example/a.jpg' } }));
      expect(await json(await GET(ask(PHOTO)))).toEqual({ status: 200, body: { ok: null, status: 302, reason: null }, cache: UNKNOWN_CACHE_CONTROL });
    });

    it('a photo Cotality never downloaded: not ok, with Cotality\'s own reason, kept for five minutes and never served stale (a plain 200 answer: it can be cached)', async () => {
      cotality(async () => new Response(NOT_DOWNLOADED, { status: 404, headers: { 'content-type': 'application/json; charset=utf-8' } }));
      const res = await GET(ask(PHOTO));
      expect(await json(res)).toEqual({ status: 200, body: { ok: false, status: 404, reason: 'ERROR - External media was not downloaded.' }, cache: BROKEN_CACHE_CONTROL });
    });

    it('a 410 with Cotality\'s words says the same', async () => {
      cotality(async () => new Response('{"code":"410","message":"Media record not found!"}', { status: 410 }));
      expect((await json(await GET(ask(PHOTO)))).body).toEqual({ ok: false, status: 410, reason: 'Media record not found!' });
    });

    it('a 404 whose body is not JSON (a firewall\'s page) says nothing is known', async () => {
      cotality(async () => new Response('<html>Not Found</html>', { status: 404 }));
      expect(await json(await GET(ask(PHOTO)))).toEqual({ status: 200, body: { ok: null, status: 404, reason: null }, cache: UNKNOWN_CACHE_CONTROL });
    });

    it('a 404 or a 410 with no body at all has no words of Cotality\'s to go by: nothing is known', async () => {
      for (const status of [404, 410]) {
        const spy = cotality(async () => new Response(null, { status }));
        expect((await json(await GET(ask(PHOTO)))).body).toEqual({ ok: null, status, reason: null });
        spy.mockRestore();
      }
    });

    it('a 403 with no body says nothing is known (a firewall may be answering for Cotality)', async () => {
      cotality(async () => new Response(null, { status: 403 }));
      expect(await json(await GET(ask(PHOTO)))).toEqual({ status: 200, body: { ok: null, status: 403, reason: null }, cache: UNKNOWN_CACHE_CONTROL });
    });

    it('a 200 that is not an image says nothing is known, and says what it is', async () => {
      cotality(async () => new Response('%PDF-1.6', { status: 200, headers: { 'content-type': 'application/pdf' } }));
      expect(await json(await GET(ask(PHOTO)))).toEqual({ status: 200, body: { ok: null, status: 200, reason: 'not an image (application/pdf)' }, cache: UNKNOWN_CACHE_CONTROL });
    });

    it.each([
      ['a 500', 500],
      ['a 503', 503],
      ['a 429', 429],
      ['a 408', 408],
      ['a redirect', 302],
    ] as const)('%s says nothing is known, and is kept for half a minute only', async (_name, status) => {
      cotality(async () => new Response(null, { status, headers: { Location: 'https://elsewhere.example/a.jpg' } }));
      const answer = await json(await GET(ask(PHOTO)));
      expect(answer.status).toBe(200);
      expect(answer.body).toEqual({ ok: null, status, reason: null });
      expect(answer.cache).toBe(UNKNOWN_CACHE_CONTROL);
    });

    it('a request that fails (no network) says nothing is known, and is kept for half a minute only', async () => {
      cotality(async () => { throw new TypeError('fetch failed'); });
      const answer = await json(await GET(ask(PHOTO)));
      expect(answer).toEqual({ status: 200, body: { ok: null, status: null, reason: null }, cache: UNKNOWN_CACHE_CONTROL });
    });

    it('says only the verdict, the status and the reason: never a body, never a header', async () => {
      cotality(async () => new Response(NOT_DOWNLOADED, { status: 404, headers: { 'x-vcap-request-id': 'secret-ish', 'content-type': 'application/json', 'quotatype': 'Media' } }));
      const res = await GET(ask(PHOTO));
      const text = await res.text();
      expect(Object.keys(JSON.parse(text)).sort()).toEqual(['ok', 'reason', 'status']);
      expect(text).not.toContain('instanceAnnotations');
      expect(text).not.toContain('secret-ish');
      expect(text).not.toContain('quota');
      expect(res.headers.get('x-vcap-request-id')).toBeNull();
    });

    it('does not repeat the address of a redirect, or any header of it', async () => {
      cotality(async () => new Response(null, { status: 302, headers: { Location: CDN, 'set-cookie': 'visid_incap=abc; path=/', 'quotatype': 'Media' } }));
      const res = await GET(ask(PHOTO));
      const text = await res.text();
      expect(Object.keys(JSON.parse(text)).sort()).toEqual(['ok', 'reason', 'status']);
      expect(text).not.toContain('corelogic');
      expect(text).not.toContain('Signature');
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('reads only the first 2 KB of an error body and stops the rest', async () => {
      let cancelled = false;
      let produced = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) { produced++; controller.enqueue(new TextEncoder().encode('x'.repeat(1024))); if (produced > 50) controller.close(); },
        cancel() { cancelled = true; },
      });
      cotality(async () => new Response(body, { status: 404 }));
      expect((await json(await GET(ask(PHOTO)))).body).toEqual({ ok: null, status: 404, reason: null });
      expect(cancelled).toBe(true);
      expect(produced).toBeLessThan(10);
    });

    it('reads an error body that arrives in pieces, as far as the 2 KB allow', async () => {
      const pieces = ['{"code":"404","mess', 'age":"ERROR - External media ', 'was not downloaded."}'];
      const body = new ReadableStream<Uint8Array>({ start(controller) { for (const piece of pieces) controller.enqueue(new TextEncoder().encode(piece)); controller.close(); } });
      cotality(async () => new Response(body, { status: 404 }));
      expect((await json(await GET(ask(PHOTO)))).body).toEqual({ ok: false, status: 404, reason: 'ERROR - External media was not downloaded.' });
    });

    it('cuts an error body at 2 KB: one longer than that is not the one-line error Cotality sends, so it has no reason', async () => {
      cotality(async () => new Response(JSON.stringify({ code: '404', message: 'x'.repeat(5000) }), { status: 404 }));
      expect((await json(await GET(ask(PHOTO)))).body).toEqual({ ok: null, status: 404, reason: null });
    });

    it('stops reading as soon as it has 2 KB: it does not ask for another piece, and lets the rest go', async () => {
      const piece = (letter: string) => ({ done: false, value: new TextEncoder().encode(letter.repeat(2048)) });
      const read = jest.fn().mockResolvedValueOnce(piece('x')).mockResolvedValue(piece('y'));
      const cancel = jest.fn(async () => undefined);
      cotality(async () => ({ status: 404, headers: new Headers(), body: { getReader: () => ({ read, cancel }) } }) as unknown as Response);
      expect((await json(await GET(ask(PHOTO)))).body).toEqual({ ok: null, status: 404, reason: null });
      expect(read).toHaveBeenCalledTimes(1);
      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('takes Cotality\'s words from a 404 and a 410 only: any other client error says nothing is known, whatever its body says', async () => {
      for (const status of [400, 401, 403, 408, 422, 429, 499]) {
        const spy = cotality(async () => new Response(NOT_DOWNLOADED, { status }));
        expect((await json(await GET(ask(PHOTO)))).body).toEqual({ ok: null, status, reason: null });
        spy.mockRestore();
      }
      for (const status of [404, 410]) {
        const spy = cotality(async () => new Response(NOT_DOWNLOADED, { status }));
        expect((await json(await GET(ask(PHOTO)))).body).toEqual({ ok: false, status, reason: 'ERROR - External media was not downloaded.' });
        spy.mockRestore();
      }
    });

    // The body of an answer is read for one purpose: Cotality's words in a 404 or a 410. The body of a photo that works is a whole photo, and nothing else has anything to say about it.
    it.each([200, 204, 206, 299, 300, 302, 304, 399, 400, 401, 403, 408, 422, 429, 499, 500, 503, 599] as const)('does not read the body of a %s', async (status) => {
      const withBody = status !== 204 && status !== 304;                                   // (an answer of these two statuses cannot have a body)
      const response = new Response(withBody ? NOT_DOWNLOADED : null, { status, headers: { 'content-type': 'image/jpeg' } });
      const real = response.body;
      let asked = 0;
      Object.defineProperty(response, 'body', { get: () => { asked++; return real; } });
      cotality(async () => response);
      const answer = (await json(await GET(ask(PHOTO)))).body;
      expect(asked).toBe(0);
      expect(answer.reason).toBeNull();
      expect(answer.status).toBe(status);
    });

    it.each([404, 410] as const)('reads the body of a %s, once', async (status) => {
      const response = new Response(NOT_DOWNLOADED, { status });
      const real = response.body;
      let asked = 0;
      Object.defineProperty(response, 'body', { get: () => { asked++; return real; } });
      cotality(async () => response);
      expect((await json(await GET(ask(PHOTO)))).body.reason).toBe('ERROR - External media was not downloaded.');
      expect(asked).toBe(1);
    });
  });

  describe('when Cotality is slow', () => {
    const hang = () => cotality((_url, init) => new Promise<Response>((_resolve, reject) => {
      (init.signal as AbortSignal).addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    }));

    it('stops asking after exactly 3 seconds and says nothing is known', async () => {
      jest.useFakeTimers();
      hang();
      let answer: Response | undefined;
      const pending = GET(ask(PHOTO)).then((r) => { answer = r; });
      await jest.advanceTimersByTimeAsync(2999);
      expect(answer).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1);
      await pending;
      expect(await json(answer!)).toEqual({ status: 200, body: { ok: null, status: null, reason: null }, cache: UNKNOWN_CACHE_CONTROL });
    });

    it('leaves no timer behind once Cotality has answered', async () => {
      jest.useFakeTimers();
      cotality(async () => new Response(null, { status: 404 }));
      await GET(ask(PHOTO));
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  describe('when many questions are in flight', () => {
    it('asks Cotality at most 10 at a time per instance: the 11th says it does not know, is not cached, and asks nothing; the instance asks again when it is quiet', async () => {
      const waiting: Array<(r: Response) => void> = [];
      const spy = cotality(() => new Promise<Response>((resolve) => { waiting.push(resolve); }));
      const first = Array.from({ length: 10 }, () => GET(ask(PHOTO)));
      await settle();
      expect(spy).toHaveBeenCalledTimes(10);
      const eleventh = await GET(ask(PHOTO));
      expect(await json(eleventh)).toEqual({ status: 200, body: { ok: null, status: null, reason: null }, cache: 'no-store' });
      expect(spy).toHaveBeenCalledTimes(10);
      waiting.splice(0).forEach((resolve) => resolve(new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })));
      const answers = await Promise.all(first);
      expect((await Promise.all(answers.map((a) => a.json()))).every((b) => b.ok === true)).toBe(true);
      spy.mockImplementation((async () => new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch);
      expect((await json(await GET(ask(PHOTO)))).body.ok).toBe(true);
      expect(spy).toHaveBeenCalledTimes(11);
    });

    it('does not let more than 10 through when a burst arrives together (the counter is looked at and raised with nothing awaited between)', async () => {
      const waiting: Array<(r: Response) => void> = [];
      const spy = cotality(() => new Promise<Response>((resolve) => { waiting.push(resolve); }));
      const burst = Array.from({ length: 30 }, () => GET(ask(PHOTO)));
      await settle();
      expect(spy).toHaveBeenCalledTimes(10);
      waiting.splice(0).forEach((resolve) => resolve(new Response(null, { status: 200, headers: { 'content-type': 'image/jpeg' } })));
      const answers = await Promise.all(burst);
      const bodies = await Promise.all(answers.map((a) => a.json()));
      expect(bodies.filter((b) => b.ok === true)).toHaveLength(10);
      expect(bodies.filter((b) => b.ok === null)).toHaveLength(20);
    });

    it('gives its place back when a question fails, however it fails (no place is lost for good)', async () => {
      const spy = cotality(async () => { throw new TypeError('fetch failed'); });
      for (let i = 0; i < 25; i++) expect((await json(await GET(ask(PHOTO)))).body.ok).toBeNull();
      expect(spy).toHaveBeenCalledTimes(25);
      spy.mockImplementation((async () => new Response(NOT_DOWNLOADED, { status: 404 })) as unknown as typeof fetch);
      for (let i = 0; i < 25; i++) expect((await json(await GET(ask(PHOTO)))).body.ok).toBe(false);
      expect(spy).toHaveBeenCalledTimes(50);
    });
  });
});
