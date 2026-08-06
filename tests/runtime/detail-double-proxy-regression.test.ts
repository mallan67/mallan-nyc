/**
 * PROVEN PRODUCTION DEFECT — double-proxied media URLs on the listing detail page.
 *
 * The relational resolver ALREADY converts a Cotality source URL into
 * `/api/media/proxy?url=<encoded absolute source>`. The detail page then runs
 * every URL through its own `proxyDetailMediaUrl()`, which tests the WHOLE
 * string for `cotality.com` / `corelogic.com`. That hostname is still visible
 * inside the encoded `url=` parameter, so an already-proxied relative URL
 * matches and is wrapped a SECOND time:
 *
 *   /api/media/proxy?url=%2Fapi%2Fmedia%2Fproxy%3Furl%3Dhttps%253A%252F%252F...
 *
 * The proxy route accepts only an ABSOLUTE URL on an approved host. The nested
 * value is relative, so `new URL()` throws, the allowlist rejects it, and the
 * route returns 403 before Cotality is ever contacted.
 *
 * LIVE PRODUCTION EVIDENCE (2026-08-06):
 *   nested/double-proxied URL  -> HTTP 403
 *   correctly single-proxied   -> HTTP 200, 1,356,147 bytes
 *
 * This is NOT truncation. The complete gallery is resolved correctly and then
 * its delivery URLs are corrupted. That is why no `slice`/`take`/cap exists
 * anywhere in the chain, and why the page still reports the full photo count
 * while only the R2 hero renders — the R2 URL contains no `cotality.com`
 * substring, so it is the one URL left untouched.
 *
 * Post-policy listings (after MAX_FEED_MIRROR_PHOTOS_PER_LISTING = 1 on
 * 2026-07-24) are 6.3% mirrored, so almost every photo takes the broken path.
 * Pre-policy listings are 99.7% mirrored and still work — which is exactly the
 * era split observed in production.
 */

import { resolveDbListingMedia } from '@/lib/media/listing-media-resolver';

const COTALITY = (n: number) =>
  `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/117801399${n}/1/AAA/BBB/CCC${n}`;
const R2_HERO =
  'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/RLS20105333/1.jpg';

/** Verbatim copy of `proxyDetailMediaUrl` from app/listing/[...slug]/page.tsx:87. */
function proxyDetailMediaUrl_currentMain(rawUrl: string): string {
  return rawUrl.includes('cotality.com') || rawUrl.includes('corelogic.com')
    ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`
    : rawUrl;
}

/** Reproduces the proxy route's allowlist precondition: absolute + approved host. */
function proxyWouldAccept(proxiedUrl: string): boolean {
  const q = proxiedUrl.replace(/^\/api\/media\/proxy\?url=/, '');
  if (q === proxiedUrl) return false;
  let inner: string;
  try {
    inner = decodeURIComponent(q);
  } catch {
    return false;
  }
  try {
    const u = new URL(inner); // relative nested value THROWS here
    return /(^|\.)(cotality|corelogic)\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

/** Real post-policy shape: ONE R2-cached hero + N Cotality-only rows. */
function postPolicyRows(cotalityCount: number) {
  const rows: Record<string, unknown>[] = [
    {
      media_url_original: COTALITY(0),
      media_url_cached: R2_HERO,
      media_type: 'Photo',
      media_category: 'Photo',
      media_classification: null,
      order: 0,
      preferred_photo_yn: true,
      status: 'active',
    },
  ];
  for (let i = 1; i <= cotalityCount; i++) {
    rows.push({
      media_url_original: COTALITY(i),
      media_url_cached: null, // post-policy: no R2 copy
      media_type: 'Photo',
      media_category: 'Photo',
      media_classification: null,
      order: i,
      preferred_photo_yn: false,
      status: 'active',
    });
  }
  return rows;
}

const resolve = (rows: unknown[]) =>
  resolveDbListingMedia(
    rows as never,
    null,
    { listingId: 'RLS20105333', rlsEligible: true } as never,
    { hadRelationalRows: true, legacyMapUrl: (u: string) => u },
  );

describe('resolver output — the input the detail page receives', () => {
  it('already proxies Cotality rows and leaves R2 untouched', () => {
    const out = resolve(postPolicyRows(10));
    expect(out).toHaveLength(11);
    const urls = out.map((m) => String(m.url));
    expect(urls[0]).toBe(R2_HERO); // hero: not proxied
    const proxied = urls.filter((u) => u.startsWith('/api/media/proxy?url='));
    expect(proxied).toHaveLength(10); // every Cotality row: proxied ONCE, by the resolver
  });

  it('each single-proxied URL is accepted by the proxy allowlist', () => {
    const out = resolve(postPolicyRows(10));
    for (const m of out.map((x) => String(x.url))) {
      if (m.startsWith('/api/media/proxy')) expect(proxyWouldAccept(m)).toBe(true);
    }
  });
});

describe('CURRENT MAIN DEFECT — the detail page wraps them a second time', () => {
  it('re-wraps already-proxied URLs because the hostname survives encoding', () => {
    const single = `/api/media/proxy?url=${encodeURIComponent(COTALITY(1))}`;
    const after = proxyDetailMediaUrl_currentMain(single);
    expect(after).not.toBe(single); // defect: it should have been left alone
    expect(after).toContain('%2Fapi%2Fmedia%2Fproxy'); // nested
  });

  it('the nested URL is REJECTED by the proxy allowlist (-> 403 in production)', () => {
    const single = `/api/media/proxy?url=${encodeURIComponent(COTALITY(1))}`;
    const nested = proxyDetailMediaUrl_currentMain(single);
    expect(proxyWouldAccept(nested)).toBe(false);
  });

  it('CRITICAL: 1 R2 hero + 10 Cotality photos -> only the hero survives', () => {
    const resolved = resolve(postPolicyRows(10)).map((m) => String(m.url));
    const afterDetailMap = resolved.map(proxyDetailMediaUrl_currentMain);
    const usable = afterDetailMap.filter(
      (u) => !u.startsWith('/api/media/proxy') || proxyWouldAccept(u),
    );
    expect(resolved).toHaveLength(11);
    expect(usable).toHaveLength(1); // <-- the production one-photo symptom
    expect(usable[0]).toBe(R2_HERO);
  });
});

describe('REQUIRED behaviour after the correction', () => {
  /** Idempotent policy: wrap an absolute approved source once; pass anything else through. */
  function canonicalPublicMediaUrl(rawUrl: string): string {
    if (!rawUrl) return rawUrl;
    if (rawUrl.startsWith('/api/media/proxy?url=')) return rawUrl; // already canonical
    let host = '';
    try {
      host = new URL(rawUrl).hostname;
    } catch {
      return rawUrl; // relative/non-absolute: never wrap
    }
    return /(^|\.)(cotality|corelogic)\.com$/i.test(host)
      ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`
      : rawUrl;
  }

  it('is IDEMPOTENT — applying it twice equals applying it once', () => {
    for (const u of [COTALITY(3), R2_HERO, `/api/media/proxy?url=${encodeURIComponent(COTALITY(3))}`]) {
      const once = canonicalPublicMediaUrl(u);
      expect(canonicalPublicMediaUrl(once)).toBe(once);
    }
  });

  it('preserves ALL 11 photos through the full chain', () => {
    const resolved = resolve(postPolicyRows(10)).map((m) => String(m.url));
    const mapped = resolved.map(canonicalPublicMediaUrl);
    const usable = mapped.filter((u) => !u.startsWith('/api/media/proxy') || proxyWouldAccept(u));
    expect(usable).toHaveLength(11);
    expect(mapped.filter((u) => u.includes('%2Fapi%2Fmedia%2Fproxy'))).toHaveLength(0);
  });

  it('keeps 10 distinct Cotality photos distinct (no identity collapse)', () => {
    const resolved = resolve(postPolicyRows(10)).map((m) => String(m.url));
    expect(new Set(resolved.map(canonicalPublicMediaUrl)).size).toBe(11);
  });
});
