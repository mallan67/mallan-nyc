/// <reference types="jest" />
/**
 * Responsive card image delivery.
 *
 * DEFECT THIS PINS (measured on production 2026-07-31): a search card
 * renders at ~343-356 CSS px but downloaded the untouched R2 original —
 * 1,437,336 bytes for a single card photo. The same photo through the
 * Next optimizer at w=384 is 19,145 bytes (~75x smaller). The DTO's
 * `thumbUrl` is byte-identical to `url`, so there was no smaller stored
 * variant to switch to; the optimizer is the only working lever.
 *
 * These tests pin the two properties that make the fix real rather than
 * cosmetic:
 *   1. card-sized candidates are actually requested (not just a `sizes`
 *      hint on a single full-resolution source), and
 *   2. hosts the optimizer cannot serve are passed through untouched, so
 *      the placeholder and any non-allow-listed CDN keep rendering.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  buildImageSources,
  isOptimizableSource,
  optimizedUrl,
  unwrapProxiedMediaUrl,
  CARD_IMAGE_WIDTHS,
  CARD_IMAGE_QUALITY,
  CARD_SIZES,
  OPTIMIZER_TRUSTED_HOSTS,
} from '../../lib/media/responsive-image';

// The only two media hosts observed across 120 production listings.
const R2 = 'https://pub-c05d6bb7575841e88a1f634081aaf714.r2.dev/listings/SL-0004/hero.webp';
const TRESTLE = 'https://api.cotality.com/trestle/Media/1234.jpg';

describe('isOptimizableSource — EXACT host trust, no wildcards', () => {
  it('accepts exactly the two hosts observed in production', () => {
    expect(isOptimizableSource(R2)).toBe(true);
    expect(isOptimizableSource(TRESTLE)).toBe(true);
    expect(OPTIMIZER_TRUSTED_HOSTS).toHaveLength(2);
  });

  it('rejects arbitrary R2 public buckets', () => {
    // *.r2.dev is a shared Cloudflare suffix, not a Mallan namespace —
    // a wildcard here would admit any stranger's public bucket.
    expect(isOptimizableSource('https://pub-deadbeef.r2.dev/photo.jpg')).toBe(false);
    expect(isOptimizableSource('https://pub-xyz.r2.dev/photos/x.jpg')).toBe(false);
    expect(isOptimizableSource('https://r2.dev/photo.jpg')).toBe(false);
  });

  it('rejects Cotality lookalikes and subdomain confusion', () => {
    expect(isOptimizableSource('https://api.cotality.com.evil.com/x.jpg')).toBe(false);
    expect(isOptimizableSource('https://evil.api.cotality.com/x.jpg')).toBe(false);
    expect(isOptimizableSource('https://apicotality.com/x.jpg')).toBe(false);
    expect(isOptimizableSource('https://api-cotality.com/x.jpg')).toBe(false);
    // The dropped wildcard must stay dropped.
    expect(isOptimizableSource('https://cdn.trestle.com/x.jpg')).toBe(false);
  });

  it('rejects URLs carrying credentials', () => {
    // These would otherwise be re-emitted inside a browser-visible
    // /_next/image?url=… value.
    expect(isOptimizableSource(`https://user:pass@api.cotality.com/x.jpg`)).toBe(false);
    expect(isOptimizableSource(`https://token@api.cotality.com/x.jpg`)).toBe(false);
  });

  it('rejects non-HTTPS', () => {
    expect(isOptimizableSource('http://api.cotality.com/x.jpg')).toBe(false);
    expect(isOptimizableSource('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
    expect(isOptimizableSource('javascript:alert(1)')).toBe(false);
  });

  it('rejects relative paths — placeholder and media proxy are never optimized', () => {
    expect(isOptimizableSource('/images/listing-placeholder.svg')).toBe(false);
    expect(isOptimizableSource('/api/media/proxy?url=x')).toBe(false);
  });

  it('rejects empty / malformed input instead of throwing', () => {
    expect(isOptimizableSource('')).toBe(false);
    expect(isOptimizableSource(null)).toBe(false);
    expect(isOptimizableSource(undefined)).toBe(false);
    expect(isOptimizableSource('not a url')).toBe(false);
  });

  it('is case-insensitive on the host, as DNS is', () => {
    expect(isOptimizableSource('https://API.COTALITY.COM/x.jpg')).toBe(true);
  });
});

describe('config drift — helper vs next.config must agree', () => {
  // The helper used to carry its own host regex and assume Next's
  // built-in size defaults. A host the helper approved but Next rejected
  // would 400 EVERY card photo; a width outside Next's ladder does the
  // same. Both now read config/image-optimization.json, and these tests
  // prove next.config.js actually consumes it.
  const nextConfigSrc = readFileSync(
    resolve(__dirname, '../../next.config.js'),
    'utf8',
  );
  const cfg = require('../../config/image-optimization.json');

  it('next.config.js reads the shared file rather than duplicating values', () => {
    expect(nextConfigSrc).toMatch(/require\(["']\.\/config\/image-optimization\.json["']\)/);
    expect(nextConfigSrc).toMatch(/deviceSizes: IMAGE_CONFIG\.deviceSizes/);
    expect(nextConfigSrc).toMatch(/imageSizes: IMAGE_CONFIG\.imageSizes/);
    expect(nextConfigSrc).toMatch(/qualities: IMAGE_CONFIG\.qualities/);
    expect(nextConfigSrc).toMatch(/minimumCacheTTL: IMAGE_CONFIG\.minimumCacheTTL/);
    expect(nextConfigSrc).toMatch(/IMAGE_CONFIG\.optimizerTrustedHosts/);
  });

  it('every host the helper trusts is admitted by next.config remotePatterns', () => {
    for (const host of OPTIMIZER_TRUSTED_HOSTS) {
      expect(cfg.optimizerTrustedHosts).toContain(host);
    }
  });

  it('no wildcard survives in the configured remote hosts', () => {
    for (const host of [...cfg.optimizerTrustedHosts, ...cfg.otherRemoteHosts]) {
      expect(host).not.toContain('*');
    }
    // And the old broad patterns are gone from next.config entirely.
    expect(nextConfigSrc).not.toMatch(/'\*\.r2\.dev'/);
    expect(nextConfigSrc).not.toMatch(/'\*\.trestle\.com'/);
  });

  it('every card width is servable by the configured ladder', () => {
    const servable = new Set([...cfg.deviceSizes, ...cfg.imageSizes]);
    for (const w of CARD_IMAGE_WIDTHS) {
      expect(servable.has(w)).toBe(true);
    }
  });

  it('the requested card quality is in the configured allow-list', () => {
    // Next 400s a quality outside images.qualities.
    expect(cfg.qualities).toContain(CARD_IMAGE_QUALITY);
  });

  it('the non-default quality values other surfaces use are allowed too', () => {
    // HeroSearch uses 85; the buy/sell landing heroes use 90.
    expect(cfg.qualities).toEqual(expect.arrayContaining([75, 85, 90]));
  });

  it('cache TTL is explicit and long, which the URL scheme makes safe', () => {
    // Both media hosts mint a NEW url when a photo changes (R2 embeds an
    // epoch-ms stamp; Cotality embeds a Unix timestamp + signature), and
    // the optimizer cache key is the source URL — so a stale transform is
    // unreachable rather than served.
    expect(cfg.minimumCacheTTL).toBeGreaterThanOrEqual(60 * 60 * 24 * 7);
  });
});

describe('buildImageSources — cards must request card-sized bytes', () => {
  it('emits a srcSet of optimizer candidates for an R2 original', () => {
    const { src, srcSet } = buildImageSources(R2);
    expect(srcSet).toBeDefined();
    const entries = srcSet!.split(', ');
    expect(entries).toHaveLength(CARD_IMAGE_WIDTHS.length);
    for (const w of CARD_IMAGE_WIDTHS) {
      expect(srcSet).toContain(`&w=${w}&q=${CARD_IMAGE_QUALITY} ${w}w`);
    }
    // The default candidate is card-sized, NOT the original — browsers
    // that ignore srcSet must still avoid the 1.4 MB download.
    expect(src).toContain('/_next/image?url=');
    expect(src).toContain('&w=640');
  });

  it('spans the measured card range at 1x through 2x DPR', () => {
    // Narrowest declared slot is the 288px list rail (1x -> 384);
    // widest is the ~616px all-listings card (2x -> 1232, covered by
    // 1200). A ladder that stops short at either end trades one defect
    // for another.
    expect(Math.min(...CARD_IMAGE_WIDTHS)).toBeLessThanOrEqual(384);
    expect(Math.max(...CARD_IMAGE_WIDTHS)).toBeGreaterThanOrEqual(1200);
  });

  it('tops out at the tightest rung covering a full-width tablet card', () => {
    // Full width applies up to 767px, so the largest card need is
    // 767 x 2 = 1534. 1600 covers it at 1.04x; 1920 covers it at 1.25x
    // and downloads 25% more for nothing.
    expect(CARD_IMAGE_WIDTHS).toContain(1600);
    expect(CARD_IMAGE_WIDTHS).not.toContain(1920);
    expect(CARD_IMAGE_WIDTHS).not.toContain(2048);
    expect(Math.max(...CARD_IMAGE_WIDTHS)).toBeGreaterThanOrEqual(767 * 2);
  });

  it('1600 is admitted by the Next config, not just by the card ladder', () => {
    // cardImageWidths is NOT the optimizer allowlist — Next validates `w`
    // against deviceSizes + imageSizes and 400s anything else. 1600 is
    // not a Next default, so it had to be added explicitly.
    const cfg = require('../../config/image-optimization.json');
    expect([...cfg.deviceSizes, ...cfg.imageSizes]).toContain(1600);
  });

  it('every sizes breakpoint is COMPLEMENTARY to Tailwind, never equal', () => {
    // Tailwind breakpoints are min-width rules, so `md` applies AT
    // 768px. A `sizes` branch of `(max-width: 768px)` is inclusive and
    // overlaps md by one pixel-width. Both failure directions were
    // measured on preview:
    //   (max-width: 640px) -> 641-767px UNDER-resolved  (700@1x = 0.55x)
    //   (max-width: 768px) -> exactly 768px OVER-downloaded (1920 for a
    //                         369px card needing 738)
    // The branch must therefore end one pixel BELOW the breakpoint.
    const TAILWIND = [640, 768, 1024, 1280, 1536];
    const COMPLEMENTARY = new Set(TAILWIND.map((b) => b - 1));

    // Collect every offender first so the failure message names them all
    // rather than stopping at the first.
    const overlapping: string[] = [];
    const misaligned: string[] = [];
    for (const [name, profile] of Object.entries(CARD_SIZES)) {
      if (name === 'hero') continue;
      for (const m of profile.matchAll(/max-width:\s*(\d+)px/g)) {
        const px = Number(m[1]);
        if (TAILWIND.includes(px)) {
          overlapping.push(`${name}: (max-width: ${px}px) overlaps Tailwind ${px} — use ${px - 1}`);
        } else if (!COMPLEMENTARY.has(px)) {
          misaligned.push(`${name}: (max-width: ${px}px) is not one below any Tailwind breakpoint`);
        }
      }
    }
    expect(overlapping).toEqual([]);
    expect(misaligned).toEqual([]);

    // GridCard is one column until md(768) -> branch ends at 767.
    expect(CARD_SIZES.grid).toMatch(/^\(max-width: 767px\) 100vw/);
    // ListCard's rail widens at sm(640) -> branch ends at 639.
    expect(CARD_SIZES.list).toMatch(/^\(max-width: 639px\)/);
    // SplitCard only goes two-up at lg(1024) -> branch ends at 1023.
    expect(CARD_SIZES.split).toMatch(/^\(max-width: 1023px\) 100vw/);
  });

  it('never emits the raw original as a srcSet candidate', () => {
    const { srcSet } = buildImageSources(R2);
    for (const entry of srcSet!.split(', ')) {
      expect(entry.startsWith('/_next/image?url=')).toBe(true);
    }
  });

  it('percent-encodes the source URL so query strings survive', () => {
    const withQuery = `${R2}?v=2&x=1`;
    const { src } = buildImageSources(withQuery);
    expect(src).toContain(encodeURIComponent(withQuery));
  });

  it('passes non-optimizable sources through untouched, with no srcSet', () => {
    const placeholder = '/images/listing-placeholder.svg';
    expect(buildImageSources(placeholder)).toEqual({ src: placeholder });
    expect(buildImageSources('https://example.com/p.jpg')).toEqual({
      src: 'https://example.com/p.jpg',
    });
  });

  it('handles null/undefined without producing an "undefined" URL', () => {
    expect(buildImageSources(null)).toEqual({ src: '' });
    expect(buildImageSources(undefined)).toEqual({ src: '' });
  });
});

describe('unwrapProxiedMediaUrl — the path every real card photo takes', () => {
  // Measured on the preview 2026-07-31: 612 of 612 sampled card photos
  // were `/api/media/proxy?url=…`, zero were direct R2. Without this
  // unwrap the whole sizing change applies to nothing.
  const PROXIED = `/api/media/proxy?url=${encodeURIComponent(TRESTLE)}`;

  it('extracts the inner absolute URL from a proxied photo', () => {
    expect(unwrapProxiedMediaUrl(PROXIED)).toBe(TRESTLE);
  });

  it('makes a proxied photo optimizable end-to-end', () => {
    const { src, srcSet } = buildImageSources(PROXIED);
    expect(srcSet).toBeDefined();
    expect(src).toContain(encodeURIComponent(TRESTLE));
    expect(src).not.toContain('media%2Fproxy');
  });

  it('refuses to unwrap to a host the optimizer does not allow', () => {
    const evil = `/api/media/proxy?url=${encodeURIComponent('https://example.com/x.jpg')}`;
    expect(unwrapProxiedMediaUrl(evil)).toBe(evil);
    expect(buildImageSources(evil)).toEqual({ src: evil });
  });

  it('leaves non-proxy sources alone', () => {
    expect(unwrapProxiedMediaUrl(R2)).toBe(R2);
    expect(unwrapProxiedMediaUrl('/images/listing-placeholder.svg')).toBe(
      '/images/listing-placeholder.svg',
    );
  });

  it('survives a malformed proxy URL without throwing', () => {
    expect(unwrapProxiedMediaUrl('/api/media/proxy?url=')).toBe('/api/media/proxy?url=');
    expect(unwrapProxiedMediaUrl('/api/media/proxy?nourl=1')).toBe('/api/media/proxy?nourl=1');
  });

  it('keeps the ORIGINAL proxy URL as the fallback src', () => {
    // IDXImage falls back to `src` (the authenticated proxy) when an
    // optimized candidate fails, so the unwrap can never strand a photo.
    const card = readFileSync(
      resolve(__dirname, '../../app/components/IDXImage.tsx'),
      'utf8',
    );
    expect(card).toMatch(
      /const sources = shouldOptimize \? buildImageSources\(src\) : \{ src, srcSet: undefined \}/,
    );
  });
});

describe('optimizedUrl', () => {
  it('builds a well-formed optimizer request', () => {
    expect(optimizedUrl(R2, 384)).toBe(
      `/_next/image?url=${encodeURIComponent(R2)}&w=384&q=${CARD_IMAGE_QUALITY}`,
    );
  });
});

describe('CARD_SIZES — the hint must describe the REAL rendered width', () => {
  // Widths measured on the preview 2026-07-31 at 1440 and 1920:
  //   all-listings 564-610 · grid 400-433 · split 376-544 · list 256-275
  it('gives each GridCard layout its own measured profile', () => {
    // One profile could not serve both: all-listings renders 501px at
    // 1024 while the 3-col grid view renders 326px there. Sharing
    // over-declared the narrower one by up to 1.67x.
    expect(CARD_SIZES.grid).toMatch(/600px$/);       // all-listings, capped
    expect(CARD_SIZES.gridTight).toMatch(/414px$/);  // 3-col, capped
    expect(CARD_SIZES.grid).not.toBe(CARD_SIZES.gridTight);
    expect(CARD_SIZES.grid).not.toBe('100vw');
  });

  it('PREMIUM: every card profile reaches a true 2x candidate', () => {
    // Premium standard — a card must never receive fewer pixels than
    // its rendered width x DPR. Declared x 2 must itself be a candidate,
    // so the browser lands exactly rather than rounding down.
    //   grid 640 -> 1280 ✓   (was 600 -> 1200, 2.6% short of a 616px card)
    //   list 224 ->  448 ✓   (was 192 ->  384, 7% short of a 207px card)
    // The ladder must COVER 2x every profile's capped declaration.
    // Not "declared x 2 must itself be a rung" — that was over-strict:
    // grid declares 600 for a 584px card, and 1200 is not a rung, but
    // both 1168 (real need) and 1200 (declared) select 1280, so the
    // selection is exact anyway.
    const declaredPx = (v: string) => Number(v.match(/(\d+)px$/)?.[1] ?? 0);
    for (const profile of [CARD_SIZES.grid, CARD_SIZES.gridTight]) {
      const need = declaredPx(profile) * 2;
      expect(CARD_IMAGE_WIDTHS.some((w) => w >= need)).toBe(true);
    }
    // list declares rem; 14rem = 224px.
    const listRem = Number(CARD_SIZES.list.match(/(\d+)rem/)![1]);
    expect(CARD_IMAGE_WIDTHS).toContain(listRem * 16 * 2);
  });

  it('PREMIUM: quality is 85, not the default 75', () => {
    // Luxury-market photography — compression artefacts in brickwork,
    // mullions and fabric are visible at 75 and unacceptable.
    expect(CARD_IMAGE_QUALITY).toBe(85);
  });

  it('covers the measured list rail, including its 275px maximum', () => {
    // 16rem = 256px would under-declare the observed 275px.
    expect(CARD_SIZES.list).toContain('18rem');
  });

  it('scales the split card with the viewport instead of pinning a px', () => {
    // Split cards measured 405px at 1440 and 544px at 1920 — no single
    // px value is right at both ends.
    expect(CARD_SIZES.split).toMatch(/vw$/);
  });

  it('keeps the full-bleed hero at 100vw', () => {
    expect(CARD_SIZES.hero).toBe('100vw');
  });
});

describe('optimization is OPT-IN — only audited surfaces change', () => {
  const idx = readFileSync(
    resolve(__dirname, '../../app/components/IDXImage.tsx'),
    'utf8',
  );

  it('optimizes only when an explicit sizeProfile is passed', () => {
    // Without this gate, buildImageSources() runs for EVERY IDXImage
    // surface — including any future one — silently changing image
    // delivery well beyond the cards audited in this PR.
    expect(idx).toMatch(/const shouldOptimize = Boolean\(sizeProfile\) && !useRaw/);
    expect(idx).toMatch(
      /const sources = shouldOptimize \? buildImageSources\(src\) : \{ src, srcSet: undefined \}/,
    );
  });

  it('emits no srcSet and no sizes when sizeProfile is absent', () => {
    // `sizes` must never fall back to a guessed 100vw: on a 350px card
    // that would pick a candidate ~3x too large, and on an unaudited
    // surface we do not know the rendered width at all.
    expect(idx).toMatch(/const sizesAttr = sizeProfile \? CARD_SIZES\[sizeProfile\] : undefined/);
    expect(idx).not.toMatch(/sizeProfile \? CARD_SIZES\[sizeProfile\] : '100vw'/);
    expect(idx).toMatch(/sizes=\{imgSrcSet \? sizesAttr : undefined\}/);
    expect(idx).toMatch(/srcSet=\{imgSrcSet\}/);
  });

  it('every IDXImage call site in the repo is accounted for', () => {
    // Inventory pin. If a new IDXImage surface appears, this fails and
    // forces an explicit decision about whether it should be optimized.
    const files = [
      'app/components/SearchListingCard.tsx',
      'app/components/FeaturedListings.tsx',
      'app/components/CompareProperties.tsx',
    ];
    const found: Array<{ file: string; hasProfile: boolean }> = [];
    for (const f of files) {
      const body = readFileSync(resolve(__dirname, '../../', f), 'utf8');
      for (const block of body.match(/<IDXImage\b[\s\S]*?\/>/g) ?? []) {
        found.push({ file: f, hasProfile: /sizeProfile=/.test(block) });
      }
    }
    // 3 search cards + 1 featured gallery + 1 compare tile = 5.
    expect(found).toHaveLength(5);
    // All five are audited card surfaces, so all five opt in.
    expect(found.filter((f) => !f.hasProfile)).toEqual([]);
  });

  it('the detail viewer and lightbox are never routed through the optimizer', () => {
    // Precise claim: they render the UNOPTIMIZED highest-available
    // display URL. Not "original camera resolution" — the resolver picks
    // per row between the Cotality asset, an R2 mirror and a generated
    // hero variant. What this pins is that the CARD optimizer never
    // downsizes them.
    // Strip comments first — the file explains in prose that it is NOT
    // routed through the optimizer, and that explanation must not itself
    // trip the assertion.
    const gallery = readFileSync(
      resolve(__dirname, '../../app/components/ListingMediaGallery.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(gallery).not.toMatch(/_next\/image/);
    expect(gallery).not.toMatch(/buildImageSources|sizeProfile/);
    // The lightbox renders the resolver's URL directly.
    expect(gallery).toMatch(/src=\{currentImage\.url\}/);
  });

  it('the listing-detail hero and gallery do NOT use IDXImage at all', () => {
    // They render via ListingMediaGallery (next/image for the
    // placeholder, raw <img> for photos), so this PR cannot have
    // changed them. Pinned so a future move into IDXImage is a
    // deliberate, reviewed act rather than an accident.
    const gallery = readFileSync(
      resolve(__dirname, '../../app/components/ListingMediaGallery.tsx'),
      'utf8',
    );
    expect(gallery).not.toMatch(/IDXImage/);
    const detail = readFileSync(
      resolve(__dirname, '../../app/listing/[...slug]/page.tsx'),
      'utf8',
    );
    expect(detail).not.toMatch(/IDXImage/);
  });
});

describe('IDXImage wiring', () => {
  const src = readFileSync(
    resolve(__dirname, '../../app/components/IDXImage.tsx'),
    'utf8',
  );

  it('retries the RAW source when an optimized candidate fails', () => {
    // Sizing must never be able to blank a photo that would otherwise
    // have rendered. Only a raw-source failure is terminal.
    expect(src).toMatch(/setRawFallbackFor\(src\)/);
    expect(src).toMatch(/const useRaw = rawFallbackFor === src/);
  });

  it('keeps lazy loading below the fold and eager loading for priority images', () => {
    expect(src).toMatch(/loading=\{priority \? 'eager' : 'lazy'\}/);
  });
});
