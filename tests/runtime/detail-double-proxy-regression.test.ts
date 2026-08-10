/**
 * PROVEN PRODUCTION DEFECT — double-proxied media URLs on the listing detail page.
 *
 * `resolveDbListingMedia` ALREADY converts a Cotality source URL into
 * `/api/media/proxy?url=<encoded absolute source>`. The detail page then ran every
 * URL through its own `proxyDetailMediaUrl()`, which tested the WHOLE string for
 * `cotality.com` / `corelogic.com`. That hostname is still visible inside the
 * encoded `url=` parameter, so an already-proxied RELATIVE url matched and was
 * wrapped a SECOND time:
 *
 *   /api/media/proxy?url=%2Fapi%2Fmedia%2Fproxy%3Furl%3Dhttps%253A%252F%252F...
 *
 * The proxy accepts only an ABSOLUTE url on an EXACT approved host. The nested
 * value is relative, so `new URL()` throws, the allowlist rejects it, and the
 * route returns 403 before Cotality is ever contacted.
 *
 * LIVE PRODUCTION EVIDENCE (2026-08-06):
 *   nested / double-proxied  -> HTTP 403
 *   correctly single-proxied -> HTTP 200, 1,356,147 bytes
 *
 * NOT truncation. The complete gallery resolves correctly and then its delivery
 * URLs are corrupted — which is why no slice/take/cap exists anywhere, and why
 * the page still reported the full photo count while only the R2 hero rendered
 * (the R2 URL carries no `cotality.com` substring, so it alone was untouched).
 *
 * Post-policy listings (MAX_FEED_MIRROR_PHOTOS_PER_LISTING = 1 since 2026-07-24)
 * are 6.3% mirrored, so nearly every photo takes the broken path. Pre-policy
 * listings are 99.7% mirrored and still work — exactly the era split observed.
 *
 * TEST DISCIPLINE: this suite imports the PRODUCTION policy
 * (`lib/media/proxy-url-policy.ts`, which the proxy route itself imports). It
 * does NOT re-declare its own allowlist. An earlier version of this file did,
 * using a suffix regex that was WIDER than production's exact-host Set — such a
 * test can pass while production regresses, and would have accepted
 * `evil.cotality.com`.
 */

import { resolveDbListingMedia } from '@/lib/media/listing-media-resolver';
import {
  toPublicMediaUrl,
  isAllowedMediaUrl,
  isProxiedMediaUrl,
  isNestedOrInvalidProxyUrl,
  unwrapProxiedMediaUrl,
  ALLOWED_MEDIA_HOSTS,
} from '@/lib/media/proxy-url-policy';

const COTALITY = (n: number) =>
  `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/117801399${n}/1/AAA/BBB/CCC${n}`;
const R2_HERO = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/photos/RLS20105333/1.jpg';

/** Verbatim copy of the DELETED `proxyDetailMediaUrl` from page.tsx:87 — kept
 *  ONLY to prove the historical defect still fails the production allowlist. */
function deletedSubstringMapper(rawUrl: string): string {
  return rawUrl.includes('cotality.com') || rawUrl.includes('corelogic.com')
    ? `/api/media/proxy?url=${encodeURIComponent(rawUrl)}`
    : rawUrl;
}

/** Real post-policy shape: ONE R2-cached hero + N Cotality-only rows. */
function postPolicyRows(cotalityCount: number) {
  const rows: Record<string, unknown>[] = [{
    media_url_original: COTALITY(0), media_url_cached: R2_HERO,
    media_type: 'Photo', media_category: 'Photo', media_classification: null,
    order: 0, preferred_photo_yn: true, status: 'active',
  }];
  for (let i = 1; i <= cotalityCount; i++) {
    rows.push({
      media_url_original: COTALITY(i), media_url_cached: null, // post-policy: no R2 copy
      media_type: 'Photo', media_category: 'Photo', media_classification: null,
      order: i, preferred_photo_yn: false, status: 'active',
    });
  }
  return rows;
}

const resolve = (rows: unknown[]) =>
  resolveDbListingMedia(rows as never, null,
    { listingId: 'RLS20105333', rlsEligible: true } as never,
    { hadRelationalRows: true, legacyMapUrl: (u: string) => u });

describe('production allowlist is EXACT, not a suffix match', () => {
  it('1. approved absolute Cotality URL is accepted and wrapped once', () => {
    const out = toPublicMediaUrl(COTALITY(1));
    expect(isProxiedMediaUrl(out)).toBe(true);
    expect(unwrapProxiedMediaUrl(out)).toBe(COTALITY(1));
  });

  it('4. unapproved absolute URL is rejected and never wrapped', () => {
    for (const bad of [
      'https://evil.cotality.com/x.jpg',        // suffix-lookalike: a regex would ACCEPT this
      'https://cotality.com.attacker.net/x.jpg',
      'https://example.com/x.jpg',
    ]) {
      expect(isAllowedMediaUrl(bad)).toBe(false);
      expect(toPublicMediaUrl(bad)).toBe(bad);
    }
  });

  it('the allowlist is the exact production set', () => {
    // The legacy CoreLogic hosts are written as LITERALS on purpose. This is a
    // regression test for the production allowlist, and `scripts/ci/guardrails.mjs`
    // already documents that "Test fixtures verify the proxy/resolver continues
    // to handle the legacy URLs correctly during the 2026 warranty period".
    //
    // An earlier revision of this test assembled the hostnames from string parts
    // so the lexical scanner could not see them. That was coding AROUND the
    // guardrail, not satisfying it — it hid a forbidden string rather than
    // reconciling the scanner with its own stated intent. Reverted deliberately.
    // The real defect was the scanner's path classification (it recognised only
    // `__tests__/`, not `tests/runtime/`); that is fixed in guardrails.mjs.
    expect([...ALLOWED_MEDIA_HOSTS].sort()).toEqual([
      'api-prod.corelogic.com',
      'api-trestle.corelogic.com',
      'api.cotality.com',
    ]);
  });

  it('5. an arbitrary relative URL is never mistaken for provider media', () => {
    for (const rel of ['/photos/1.jpg', '/api/media/proxy', '//evil.example.com/x.jpg']) {
      expect(isAllowedMediaUrl(rel)).toBe(false);
      expect(toPublicMediaUrl(rel)).toBe(rel);
    }
  });

  it('6. an R2 URL passes through unchanged', () => {
    expect(toPublicMediaUrl(R2_HERO)).toBe(R2_HERO);
  });
});

describe('idempotence — the property that prevents the defect', () => {
  it('2. an already-single-proxied URL is returned unchanged', () => {
    const once = toPublicMediaUrl(COTALITY(2));
    expect(toPublicMediaUrl(once)).toBe(once);
  });

  it('applying the policy twice always equals applying it once', () => {
    for (const u of [COTALITY(3), R2_HERO, '/photos/x.jpg', 'https://example.com/a.jpg']) {
      const once = toPublicMediaUrl(u);
      expect(toPublicMediaUrl(once)).toBe(once);
    }
  });

  it('3. a NESTED proxy URL is detected and rejected', () => {
    const nested = deletedSubstringMapper(toPublicMediaUrl(COTALITY(4)));
    expect(nested).toContain('%2Fapi%2Fmedia%2Fproxy');
    expect(isNestedOrInvalidProxyUrl(nested)).toBe(true);
    expect(unwrapProxiedMediaUrl(nested)).toBeNull(); // -> 403 in production
  });
});

describe('the historical defect, proven against the REAL allowlist', () => {
  it('the deleted substring mapper re-wraps already-proxied URLs', () => {
    const single = toPublicMediaUrl(COTALITY(5));
    expect(deletedSubstringMapper(single)).not.toBe(single);
  });

  it('CRITICAL: 1 R2 hero + 10 Cotality photos -> only the hero survived', () => {
    const resolved = resolve(postPolicyRows(10)).map((m) => String(m.url));
    const broken = resolved.map(deletedSubstringMapper);
    const usable = broken.filter((u) => !isProxiedMediaUrl(u) || !isNestedOrInvalidProxyUrl(u));
    expect(resolved).toHaveLength(11);
    expect(usable).toHaveLength(1); // <-- the production one-photo symptom
    expect(usable[0]).toBe(R2_HERO);
  });
});

describe('corrected behaviour', () => {
  it('resolver already proxies Cotality rows and leaves R2 untouched', () => {
    const urls = resolve(postPolicyRows(10)).map((m) => String(m.url));
    expect(urls[0]).toBe(R2_HERO);
    expect(urls.filter(isProxiedMediaUrl)).toHaveLength(10);
    for (const u of urls.filter(isProxiedMediaUrl)) {
      expect(isNestedOrInvalidProxyUrl(u)).toBe(false);
    }
  });

  it('7. ten distinct proxy URLs remain ten distinct identities', () => {
    const urls = resolve(postPolicyRows(10)).map((m) => toPublicMediaUrl(String(m.url)));
    expect(new Set(urls).size).toBe(11);
    // identity must come from the encoded SOURCE, never the shared proxy path
    const sources = urls.filter(isProxiedMediaUrl).map(unwrapProxiedMediaUrl);
    expect(new Set(sources).size).toBe(10);
  });

  it('8. one R2 + 66 Cotality rows remain 67 usable identities, zero nested', () => {
    const urls = resolve(postPolicyRows(66)).map((m) => toPublicMediaUrl(String(m.url)));
    expect(urls).toHaveLength(67);
    expect(urls.filter(isNestedOrInvalidProxyUrl)).toHaveLength(0);
    expect(new Set(urls).size).toBe(67);
  });
});
