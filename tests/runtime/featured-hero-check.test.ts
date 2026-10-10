/// <reference types="jest" />
/**
 * Homepage Featured Listings prefer the listings whose photo can be shown (lib/featured/featured-hero-check.ts).
 *
 * Cotality answers 404 for the photos of some listings (the hero's address is a signed Cotality media link behind our /api/media/proxy, which relays the 404), so a Featured
 * card could be a grey placeholder while listings with a working photo were in the feed. These tests pin the three parts of the fix: which photo a card would show
 * (featuredHeroUrl), the question put to the photo (checkHeroUrl), and which listings are drawn once the answers are in (selectFeaturedWithWorkingHeroes).
 */

import {
  checkHeroUrl,
  featuredHeroUrl,
  selectFeaturedWithWorkingHeroes,
  HERO_CHECK_TIMEOUT_MS,
  type HeroCheck,
} from '@/lib/featured/featured-hero-check';

const PROXY = (n: number | string) => `/api/media/proxy?url=${encodeURIComponent(`https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/11780${n}/1/A/B/C`)}`;
const R2 = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/RLS20118923/2006093222853.jpg';
const FLOORPLAN = 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/117801999/1/A/B/C';
const photo = (url: string, order = 0) => ({ url, mediaType: 'Photo', order });

describe('featuredHeroUrl: the photo a Featured card would show', () => {
  it('is the first usable photo of the listing', () => {
    expect(featuredHeroUrl({ media: [photo(PROXY(1), 0), photo(PROXY(2), 1)] })).toBe(PROXY(1));
  });

  it('skips what is not a photo (a floor plan) and what is not an address, and follows the photos\' order', () => {
    const media = [
      { url: FLOORPLAN, mediaType: 'FloorPlan', order: 0 },
      { url: 'not an address', mediaType: 'Photo', order: 1 },
      { url: '', mediaType: 'Photo', order: 2 },
      photo(PROXY(3), 5),
      photo(PROXY(4), 3),
    ];
    expect(featuredHeroUrl({ media })).toBe(PROXY(4));
  });

  it('is null when the listing has no usable photo', () => {
    expect(featuredHeroUrl({ media: [] })).toBeNull();
    expect(featuredHeroUrl({ media: null })).toBeNull();
    expect(featuredHeroUrl({})).toBeNull();
    expect(featuredHeroUrl({ media: [{ url: FLOORPLAN, mediaType: 'FloorPlan', order: 0 }] })).toBeNull();
  });
});

describe('checkHeroUrl: asking whether the photo can be had (through GET /api/media/health, which asks Cotality once and says so for a few minutes)', () => {
  const COTALITY = (n: number | string) => `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/11780${n}/1/A/B/C`;
  const HEALTH = (n: number | string) => `/api/media/health?url=${encodeURIComponent(COTALITY(n))}`;
  const says = (body: unknown, init: ResponseInit = {}) => jest.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init }));
  // (run(fetch) asks about the first photo; run(fetch, url) about the address it is given, undefined included)
  const run = (fetchFn: unknown, ...rest: [url?: string | null | undefined, timeoutMs?: number]) => checkHeroUrl(rest.length ? rest[0] : PROXY(1), { fetchFn: fetchFn as typeof fetch, timeoutMs: rest[1] });

  it.each([
    ['can be had', { ok: true, status: 200, reason: null }, 'ok'],
    ['cannot be had: Cotality does not have the file', { ok: false, status: 404, reason: 'ERROR - External media was not downloaded.' }, 'broken'],
    ['cannot be had, with no reason', { ok: false, status: 403, reason: null }, 'broken'],
    ['not known (the route could not tell)', { ok: null, status: null, reason: null }, 'unknown'],
    ['an answer with no verdict', {}, 'unknown'],
    ['an answer whose verdict is not a boolean', { ok: 'yes' }, 'unknown'],
    ['an answer whose verdict is 1', { ok: 1 }, 'unknown'],
    ['an answer that is JSON null', null, 'unknown'],
  ] as const)('a photo that %s is %s', async (_name, body, expected) => {
    expect(await run(says(body))).toBe(expected);
  });

  it('asks the route about the Cotality link inside the proxy address, with a signal it can stop the question with', async () => {
    const fetchFn = says({ ok: true });
    await run(fetchFn, PROXY(7));
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, { signal: AbortSignal }];
    expect(url).toBe(HEALTH(7));
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['capitals in the scheme and the host', 'HTTPS://API.COTALITY.COM/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
    ['the default port spelled out', 'https://api.cotality.com:443/trestle/Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
    ['a dot segment in the path', 'https://api.cotality.com/trestle/Media/../Media/Property/PHOTO-Jpeg/1/1/A/B/C'],
  ] as const)('asks about a link with %s in the one spelling the route answers (the CDN keys its cache on the address, so one photo is one key)', async (_name, link) => {
    const fetchFn = says({ ok: true });
    await run(fetchFn, `/api/media/proxy?url=${encodeURIComponent(link)}`);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe(`/api/media/health?url=${encodeURIComponent(new URL(link).href)}`);
  });

  it.each([
    ['500', 500],
    ['502', 502],
    ['404 (a deploy that has no such route)', 404],
    ['403', 403],
    ['429', 429],
  ] as const)('does not take the route\'s own failure (%s) for a broken photo: nothing is known', async (_name, status) => {
    expect(await run(says({ ok: false }, { status }))).toBe('unknown');
  });

  it.each([
    ['nothing', null],
    ['nothing (undefined)', undefined],
    ['an empty address', ''],
    ['a copy in our own storage', R2],
    ['a Cotality link that is not behind the proxy', COTALITY(1)],
    ['another path of our own origin', '/api/media/batch?ids=1'],
    ['the proxy without a query', '/api/media/proxy'],
    ['the proxy of a host that is not allowed', `/api/media/proxy?url=${encodeURIComponent('https://evil.example/a.jpg')}`],
    ['a proxy address nested in another', `/api/media/proxy?url=${encodeURIComponent(PROXY(1))}`],
    ['an address that only contains the proxy path', 'https://elsewhere.example/api/media/proxy?url=x'],
  ] as const)('does not ask about %s: nothing is known (and it is not taken as broken)', async (_name, url) => {
    const fetchFn = says({ ok: false });
    expect(await run(fetchFn, url)).toBe('unknown');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('takes a failed request (no network) as no answer, not as a broken photo', async () => {
    expect(await run(jest.fn(async () => { throw new TypeError('Failed to fetch'); }))).toBe('unknown');
  });

  it('takes an answer that is not JSON as no answer', async () => {
    expect(await run(jest.fn(async () => new Response('<html>gateway</html>', { status: 200 })))).toBe('unknown');
  });

  describe('when the answer is slow', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });
    const hang = () => jest.fn((_url: string, init: { signal: AbortSignal }) => new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
    }));

    it('waits exactly the timeout (4 seconds), then stops asking and knows nothing', async () => {
      expect(HERO_CHECK_TIMEOUT_MS).toBe(4000);
      let result: HeroCheck | undefined;
      const pending = run(hang()).then((r) => { result = r; });
      await jest.advanceTimersByTimeAsync(3999);
      expect(result).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1);
      await pending;
      expect(result).toBe('unknown');
    });

    it('waits as long as it is told to', async () => {
      let result: HeroCheck | undefined;
      const pending = run(hang(), PROXY(1), 250).then((r) => { result = r; });
      await jest.advanceTimersByTimeAsync(249);
      expect(result).toBeUndefined();
      await jest.advanceTimersByTimeAsync(1);
      await pending;
      expect(result).toBe('unknown');
    });

    it('leaves no timer behind once the photo has been judged', async () => {
      expect(await run(says({ ok: false }))).toBe('broken');
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});

describe('selectFeaturedWithWorkingHeroes: the listings drawn once the photos have answered', () => {
  type L = { id: string; exempt?: boolean };
  /**
   * The candidates as a list that ends the test, with a name, when the draw takes more waves from it than a draw can have: each wave takes at least one candidate, so there are never
   * more waves than candidates. A draw that went round for ever would otherwise hold the whole run up (it awaits only answers that have already come, so no timer could stop it).
   */
  const guarded = (items: L[]): L[] => {
    let waves = 0;
    return new Proxy(items, {
      get(target, prop, receiver) {
        if (prop !== 'slice') return Reflect.get(target, prop, receiver);
        return (...range: [number?, number?]) => {
          if (++waves > target.length + 1) throw new Error('the draw went round again without taking another candidate');
          return target.slice(...range);
        };
      },
    });
  };
  const make = (ids: string) => guarded(ids.split('').map((id): L => ({ id })));
  const ids = (ls: readonly L[]) => ls.map((l) => l.id).join('');
  /** A check that answers from a table (anything not in it works) and records whom it was asked about, in order. */
  const table = (answers: Record<string, HeroCheck>) => {
    const asked: string[] = [];
    const check = jest.fn(async (l: L): Promise<HeroCheck> => { asked.push(l.id); return answers[l.id] ?? 'ok'; });
    return { check, asked };
  };
  const exempt = (l: L) => l.exempt === true;

  it('draws the first `limit` candidates, in order, when their photos work, and asks about no others', async () => {
    const { check, asked } = table({});
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abcdefgh'), 4, check, exempt))).toBe('abcd');
    expect(asked.join('')).toBe('abcd');
  });

  it('gives the place of a listing whose photo is broken to the next candidate, keeping the order of the rest', async () => {
    const { check, asked } = table({ b: 'broken' });
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abcdefgh'), 4, check, exempt))).toBe('acde');
    expect(asked.join('')).toBe('abcde');
  });

  it('keeps looking, wave after wave, until the places are filled', async () => {
    const { check, asked } = table({ a: 'broken', c: 'broken', d: 'broken', f: 'broken', g: 'broken' });
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abcdefghij'), 3, check, exempt))).toBe('beh');
    expect(asked.join('')).toBe('abcdefgh');                                            // waves: abc (b), de (e), f, g, h (h): never i
  });

  it('asks about a wave as large as the places still to fill, all at once', async () => {
    const started: string[] = [];
    const releases: Array<() => void> = [];
    const check = jest.fn((l: L) => new Promise<HeroCheck>((resolve) => { started.push(l.id); releases.push(() => resolve(l.id === 'b' ? 'broken' : 'ok')); }));
    const result = selectFeaturedWithWorkingHeroes(make('abcdefgh'), 3, check, exempt);
    await Promise.resolve();
    expect(started.join('')).toBe('abc');                                                  // the first wave: three places, three questions at once
    releases.splice(0).forEach((release) => release());
    await new Promise((r) => setTimeout(r, 0));
    expect(started.join('')).toBe('abcd');                                                 // the second wave: one place left (b gave its place up)
    releases.splice(0).forEach((release) => release());
    expect(ids(await result)).toBe('acd');
    expect(started.join('')).toBe('abcd');
  });

  it('leaves out a listing whose photo is broken, and draws fewer than the places when there are not enough of the others (no placeholder card takes the place)', async () => {
    const { check } = table({ b: 'broken', d: 'broken' });
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abcd'), 4, check, exempt))).toBe('ac');
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abc'), 5, check, exempt))).toBe('ac');
  });

  it('draws nothing when every photo is broken (the section is then not drawn)', async () => {
    const { check } = table({ a: 'broken', b: 'broken', c: 'broken', d: 'broken' });
    expect(await selectFeaturedWithWorkingHeroes(make('abcd'), 3, check, exempt)).toEqual([]);
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abcde'), 3, check, exempt))).toBe('e');
  });

  it('draws every listing whose photo is not known to be broken, whatever the others do, up to the places', async () => {
    const { check } = table({ a: 'broken', b: 'unknown', c: 'ok', d: 'broken', e: 'ok', f: 'ok', g: 'ok' });
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abcdefg'), 4, check, exempt))).toBe('bcef');
  });

  it('never asks about a listing that is exempt (Mallan-owned, pinned), and never passes it over', async () => {
    const { check, asked } = table({ x: 'broken', y: 'broken', a: 'broken' });
    const candidates = guarded([{ id: 'x', exempt: true }, { id: 'a' }, { id: 'y', exempt: true }, { id: 'b' }, { id: 'c' }]);
    expect(ids(await selectFeaturedWithWorkingHeroes(candidates, 3, check, exempt))).toBe('xyb');
    expect(asked).not.toContain('x');
    expect(asked).not.toContain('y');
    expect(asked.join('')).toBe('ab');                                                     // waves: x a y (a passed over), then b
  });

  it('draws only exempt listings without asking about anything', async () => {
    const { check } = table({});
    const candidates = guarded([{ id: 'x', exempt: true }, { id: 'y', exempt: true }]);
    expect(ids(await selectFeaturedWithWorkingHeroes(candidates, 4, check, exempt))).toBe('xy');
    expect(check).not.toHaveBeenCalled();
  });

  it('does not take "unknown" for broken (a slow network must not empty the section)', async () => {
    const { check } = table({ a: 'unknown', b: 'unknown', c: 'unknown' });
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abcde'), 3, check, exempt))).toBe('abc');
  });

  it('takes a check that fails (it rejects, or throws at the call) for "unknown"', async () => {
    const rejecting = jest.fn(async (l: L): Promise<HeroCheck> => { if (l.id === 'a') throw new Error('boom'); return 'ok'; });
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abc'), 2, rejecting, exempt))).toBe('ab');
    const throwing = jest.fn((l: L): Promise<HeroCheck> => { if (l.id === 'a') throw new Error('boom'); return Promise.resolve('ok'); });
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abc'), 2, throwing, exempt))).toBe('ab');
  });

  it('has no places to fill when `limit` is zero, negative or not a number, and asks about nothing', async () => {
    const { check } = table({});
    for (const limit of [0, -3, Number.NaN]) expect(await selectFeaturedWithWorkingHeroes(make('abc'), limit, check, exempt)).toEqual([]);
    expect(check).not.toHaveBeenCalled();
  });

  it('draws what there is when the candidates are fewer than the places', async () => {
    const { check } = table({});
    expect(ids(await selectFeaturedWithWorkingHeroes(make('ab'), 6, check, exempt))).toBe('ab');
    expect(await selectFeaturedWithWorkingHeroes(guarded([]), 6, check, exempt)).toEqual([]);
  });

  it('rounds the places down', async () => {
    const { check } = table({});
    expect(ids(await selectFeaturedWithWorkingHeroes(make('abcde'), 2.9, check, exempt))).toBe('ab');
  });

  it('leaves the candidates it was given alone', async () => {
    const candidates = make('abcdef');
    const copy = [...candidates];
    const { check } = table({ a: 'broken' });
    await selectFeaturedWithWorkingHeroes(candidates, 3, check, exempt);
    expect(candidates).toEqual(copy);
  });
});
