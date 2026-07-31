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
 * `imageSizes` (16-384) and `deviceSizes` (640-3840) — next.config sets
 * neither, so the defaults apply and every width below is valid. Cards
 * render ~350 CSS px, so 384 covers 1x and 750 covers 2x DPR; the larger
 * entries serve the wide/hero aspects and 3x displays.
 */
export const CARD_IMAGE_WIDTHS = [256, 384, 640, 750, 1080] as const;

/** Quality matching Next's default. Kept explicit so it is reviewable. */
export const CARD_IMAGE_QUALITY = 75;

/**
 * `sizes` values per card aspect. These MUST describe the real rendered
 * width or the browser will pick a candidate that is too large (which is
 * the bug this module exists to fix).
 */
export const CARD_SIZES = {
  /** Grid: 1 col mobile, 2 col md, 3 col xl — ~350px at desktop. */
  grid: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px',
  /** List: fixed 12rem / 16rem rail. */
  list: '(max-width: 640px) 12rem, 16rem',
  /** Split view: 2-col inside a narrow panel. */
  split: '(max-width: 768px) 50vw, 320px',
  /** Full-bleed detail hero. */
  hero: '100vw',
} as const;

export type CardSizeKey = keyof typeof CARD_SIZES;

/** Hosts the Next optimizer is configured to accept (next.config images.remotePatterns). */
const OPTIMIZABLE_HOST = /(^|\.)r2\.dev$|(^|\.)trestle\.com$|^api\.cotality\.com$|^images\.mallan\.nyc$/i;

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
  if (!isOptimizableSource(raw)) return { src: raw };
  return {
    // Default candidate for browsers that ignore srcSet — deliberately a
    // card-sized width, never the original.
    src: optimizedUrl(raw, 640),
    srcSet: widths.map((w) => `${optimizedUrl(raw, w)} ${w}w`).join(', '),
  };
}
