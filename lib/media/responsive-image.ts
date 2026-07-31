/**
 * responsive-image — correctly sized card/gallery photos.
 *
 * MEASURED PROBLEM (production, 2026-07-31): search cards render at
 * ~343-356 CSS px but download the untouched R2 original. One card photo
 * measured 3239 x ... at 1,437,336 bytes. The DTO's `thumbUrl` is byte-
 * identical to `url` (verified against /api/listings), so there is no
 * pre-generated small variant to switch to, and `/cdn-cgi/image/...` is
 * not available on the `pub-*.r2.dev` host (404).
 *
 * The one working lever on this deployment is the Next.js image
 * optimizer, which IS enabled and already allow-lists the photo hosts in
 * next.config (`*.r2.dev`, `*.trestle.com`, `api.cotality.com`,
 * `images.mallan.nyc`). Measured on production:
 *
 *     direct R2 original          1,437,336 bytes
 *     /_next/image?w=384&q=75        19,145 bytes   (~75x smaller)
 *
 * COST NOTE — this reverses a documented decision. IDXImage's header
 * states that next/image was avoided to dodge Vercel Image Optimization
 * charges ($5 per 1000 source images beyond the free monthly tier).
 * That trade is now explicit and must be reviewed, not assumed: the
 * optimizer bills per SOURCE image (then caches transforms), whereas the
 * status quo ships ~1.4 MB per card to every visitor on every cold
 * cache — a 100-card search page transfers on the order of 140 MB.
 * If the billing is judged worse than the bandwidth, revert to the raw
 * URL by having buildImageSources() return `{ src, srcSet: undefined }`.
 *
 * SAFETY: callers keep the ORIGINAL url as a fallback. If an optimized
 * request fails for any reason (optimizer disabled, host removed from
 * remotePatterns, transform error) IDXImage retries the raw source once
 * before showing its error state, so images can never go blank because
 * of this module.
 */

/**
 * Widths requested for the srcset. All are drawn from Next's default
 * `imageSizes` (16-384) and `deviceSizes` (640/750/828/1080/1200/1920/
 * 2048/3840) — next.config sets neither, so the defaults apply and every
 * width below is valid.
 *
 * The range is driven by MEASURED card widths (preview, 2026-07-31, see
 * CARD_SIZES): the smallest slot is the 256px list rail and the largest
 * is the ~610px all-listings card, which needs ~1220px at 2x DPR. Hence
 * the top entries — without them a retina all-listings card would be
 * served an under-resolved image, which is its own quality regression.
 */
export const CARD_IMAGE_WIDTHS = [256, 384, 640, 828, 1080, 1200, 1920] as const;

/** Quality matching Next's default. Kept explicit so it is reviewable. */
export const CARD_IMAGE_QUALITY = 75;

/**
 * `sizes` values per card aspect. These MUST describe the real rendered
 * width or the browser will pick a candidate that is too large (which is
 * the bug this module exists to fix).
 */
export const CARD_SIZES = {
  /**
   * GridCard. Serves TWO layouts, so this must cover the wider one:
   *   all-listings — max-w-6xl, 2 col : measured 564-610px (1440 & 1920)
   *   grid view    — max-w-7xl, 3 col : measured 400-433px
   * Declaring the 3-col width would under-resolve every all-listings card
   * by ~1.6x, so the wider layout wins. 620px slightly over-declares the
   * grid view, which costs a little bandwidth and never costs sharpness.
   */
  grid: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 620px',
  /** ListCard: w-48 / sm:w-64 rail — measured 256-275px. */
  list: '(max-width: 640px) 12rem, 18rem',
  /**
   * SplitCard: 2 col inside the ~55% listings panel. Measured 376-405px
   * at 1440 and 508-544px at 1920, so a fixed px value is wrong at one
   * end or the other — this scales with the viewport instead.
   */
  split: '(max-width: 768px) 50vw, 30vw',
  /** Full-bleed detail hero. */
  hero: '100vw',
} as const;

export type CardSizeKey = keyof typeof CARD_SIZES;

/** Hosts the Next optimizer is configured to accept (next.config images.remotePatterns). */
const OPTIMIZABLE_HOST = /(^|\.)r2\.dev$|(^|\.)trestle\.com$|^api\.cotality\.com$|^images\.mallan\.nyc$/i;

/**
 * Unwrap `/api/media/proxy?url=<absolute>` to the absolute media URL.
 *
 * WHY THIS IS NECESSARY (measured on the preview, 2026-07-31): every
 * card photo on /search is a proxy URL — 612 of 612 sampled, zero direct
 * R2. Without unwrapping, the sizing work below applies to nothing.
 *
 * The proxy path itself CANNOT be optimized. Vercel's optimizer accepts
 * a relative `url` only when it resolves to a static build asset:
 *   /_next/image?url=/images/hero.jpg   → 200 (2,501,994 → 56,724 bytes)
 *   /_next/image?url=/api/health        → 400 INVALID_IMAGE_OPTIMIZE_REQUEST
 *   /_next/image?url=/api/media/proxy?… → 400 INVALID_IMAGE_OPTIMIZE_REQUEST
 * So neither the current proxy nor a path-segment variant of it is
 * addressable by the optimizer. Unwrapping to the inner absolute URL —
 * already allow-listed as `api.cotality.com` in next.config — is the
 * only route that works.
 *
 * RISK, stated plainly: `/api/media/proxy` exists because a browser
 * <img> cannot send the Trestle Bearer header. Optimizing the inner URL
 * means Vercel's optimizer fetches Cotality SERVER-SIDE instead. Live
 * verification on 2026-07-31: the signed media URL answers an
 * unauthenticated request with a 302 to a fetchable object, and
 * /_next/image returns a real 19,509-byte JPEG for it. That is observed
 * live-feed behavior, not a documented guarantee — if Trestle tightens
 * it, these requests start failing.
 *
 * MITIGATION: IDXImage retries the ORIGINAL src (the authenticated
 * proxy URL) once on any optimized-candidate failure. A Trestle change
 * therefore degrades to today's behavior — full-size photos that still
 * render — rather than breaking IDX imagery.
 */
export function unwrapProxiedMediaUrl(src: string): string {
  if (!src.startsWith('/api/media/proxy?')) return src;
  try {
    const inner = new URLSearchParams(src.slice(src.indexOf('?') + 1)).get('url');
    return inner && OPTIMIZABLE_HOST.test(new URL(inner).hostname) ? inner : src;
  } catch {
    return src;
  }
}

/**
 * True when `src` is an absolute URL on a host the optimizer allows.
 * Relative paths (the local placeholder SVG) and unknown hosts are left
 * untouched — optimizing them would 400 and blank the image.
 */
export function isOptimizableSource(src: string | null | undefined): boolean {
  if (!src || typeof src !== 'string') return false;
  if (!src.startsWith('http://') && !src.startsWith('https://')) return false;
  try {
    return OPTIMIZABLE_HOST.test(new URL(src).hostname);
  } catch {
    return false;
  }
}

/** One optimizer URL at a given width. */
export function optimizedUrl(src: string, width: number, quality = CARD_IMAGE_QUALITY): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

/**
 * Build the `src` + `srcSet` pair for a photo.
 *
 * Returns the raw source unchanged (and no srcSet) when the host is not
 * optimizable, so the placeholder SVG and any future CDN keep working.
 */
export function buildImageSources(
  src: string | null | undefined,
  widths: readonly number[] = CARD_IMAGE_WIDTHS,
): { src: string; srcSet?: string } {
  const raw = src || '';
  // Proxied Trestle photos must be unwrapped to their inner absolute URL
  // first — the proxy path is not addressable by the optimizer. R2 and
  // other allow-listed absolute URLs pass through unchanged.
  const target = unwrapProxiedMediaUrl(raw);
  if (!isOptimizableSource(target)) return { src: raw };
  return {
    // Default candidate for browsers that ignore srcSet — deliberately a
    // card-sized width, never the original.
    src: optimizedUrl(target, 640),
    srcSet: widths.map((w) => `${optimizedUrl(target, w)} ${w}w`).join(', '),
  };
}
