/// <reference types="jest" />
/**
 * Search engines may fetch listing photos; nobody else gets more than before.
 *
 * Owner decision (Maya Allan, 2026-10-30): "get the photos indexed". Search Console (2026-10-29) reported 10,189
 * photo addresses (/api/media/proxy?url=...) as "Blocked by robots.txt", because /api/ is blocked for every crawler.
 *
 * What this pins:
 *   1. robots.txt: Googlebot, Googlebot-Image and Bingbot may fetch /api/media/proxy and nothing else under /api/;
 *      their other blocks match the default group's (a crawler obeys only the most specific group that names it).
 *      The default group and every AI crawler group still block /api/ entirely.
 *   2. The proxy puts search-engine crawlers on a shared per-minute budget before it spends a slot or a Cotality
 *      request (the Cotality media quota is shared with the media sync). Over budget it answers 429 + Retry-After.
 *      Ordinary visitors are never counted.
 *
 * The matcher below applies the rule both Google and Bing document: the longest matching pattern wins, and an
 * allow beats a disallow of the same length.
 */
import { NextRequest } from 'next/server';
import robots from '@/app/robots';

jest.mock('@/lib/idx/auth', () => ({ __esModule: true, getAccessToken: async () => 'test-token' }));
const checkRouteRateLimit = jest.fn();
jest.mock('@/lib/middleware/rate-limiter', () => ({
  __esModule: true,
  checkRouteRateLimit: (...args: unknown[]) => checkRouteRateLimit(...args),
}));

import { GET } from '@/app/api/media/proxy/route';

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] };
const asList = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const rules = (): Rule[] => robots().rules as Rule[];

function groupFor(userAgent: string): Rule {
  const all = rules();
  const named = all.find((r) => asList(r.userAgent).some((u) => u.toLowerCase() === userAgent.toLowerCase()));
  return named ?? (all.find((r) => asList(r.userAgent).includes('*')) as Rule);
}

/** Longest matching pattern wins; allow wins a tie; no match means allowed. */
function allowed(userAgent: string, pathAndQuery: string): boolean {
  const g = groupFor(userAgent);
  let best = { len: -1, allow: true };
  for (const p of asList(g.allow)) if (pathAndQuery.startsWith(p) && p.length >= best.len) best = { len: p.length, allow: true };
  for (const p of asList(g.disallow)) if (pathAndQuery.startsWith(p) && p.length > best.len) best = { len: p.length, allow: false };
  return best.allow;
}

const PHOTO = '/api/media/proxy?url=https%3A%2F%2Fapi.cotality.com%2Ftrestle%2FMedia%2FProperty%2FPHOTO-Jpeg%2F1157646647%2F2%2Fabc';

describe('robots.txt: listing photos for search engines', () => {
  it.each(['Googlebot', 'Googlebot-Image', 'Bingbot'])('%s may fetch a listing photo', (ua) => {
    expect(allowed(ua, PHOTO)).toBe(true);
  });

  it.each(['Googlebot', 'Googlebot-Image', 'Bingbot'])('%s is still blocked from every other /api/ path and the private areas', (ua) => {
    for (const p of ['/api/crm/leads', '/api/listings?limit=5', '/api/media/batch', '/api/media/health?id=1', '/api/idx/search', '/crm/login.html', '/admin', '/portal', '/search?q=x']) {
      expect(`${ua} ${p} ${allowed(ua, p)}`).toBe(`${ua} ${p} false`);
    }
  });

  it.each(['Googlebot', 'Googlebot-Image', 'Bingbot'])('%s can still crawl listing pages and the sitemap', (ua) => {
    expect(allowed(ua, '/listing/434-w-20th-street-apt-7-new-york-city-ny-10011/rls20084568')).toBe(true);
    expect(allowed(ua, '/sitemap.xml')).toBe(true);
    expect(allowed(ua, '/')).toBe(true);
  });

  it('keeps the default group and every AI crawler group closed to the photo proxy', () => {
    for (const ua of ['SomeOtherBot', 'DuckDuckBot', 'GPTBot', 'ClaudeBot', 'ChatGPT-User', 'PerplexityBot', 'Applebot-Extended', 'Amazonbot', 'CCBot']) {
      expect(`${ua} ${allowed(ua, PHOTO)}`).toBe(`${ua} false`);
    }
  });

  it('names the three search engines in one group, with the proxy as the only /api/ path it allows', () => {
    const g = groupFor('Googlebot');
    expect(asList(g.userAgent)).toEqual(['Googlebot', 'Googlebot-Image', 'Bingbot']);
    expect(asList(g.allow)).toEqual(['/', '/api/media/proxy']);
  });
});

describe('/api/media/proxy: search-engine crawlers share a per-minute budget', () => {
  const MEDIA = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1103557105/25/abc';
  const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00]);
  const realFetch = global.fetch;
  let fetchMock: jest.Mock;
  const ask = (ua: string) =>
    GET(new NextRequest(`http://localhost/api/media/proxy?url=${encodeURIComponent(MEDIA)}`, { headers: { 'user-agent': ua } }));

  beforeEach(() => {
    checkRouteRateLimit.mockReset();
    fetchMock = jest.fn().mockImplementation(async () => new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => { global.fetch = realFetch; });

  it.each([
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['Googlebot-Image', 'Googlebot-Image/1.0'],
    ['Bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
  ])('answers %s with 429 and Retry-After once the shared budget is spent, and does not call Cotality', async (_n, ua) => {
    checkRouteRateLimit.mockResolvedValue(false);
    const res = await ask(ua);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(checkRouteRateLimit).toHaveBeenCalledWith('all-search-crawlers', 'media_proxy_crawler_global', 60, 60);
  });

  it('serves a crawler while the budget lasts', async () => {
    checkRouteRateLimit.mockResolvedValue(true);
    const res = await ask('Googlebot-Image/1.0');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never counts an ordinary visitor against the crawler budget', async () => {
    checkRouteRateLimit.mockResolvedValue(false); // would block a crawler; must not matter here
    const res = await ask('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36');
    expect(res.status).toBe(200);
    expect(checkRouteRateLimit).not.toHaveBeenCalled();
  });
});
