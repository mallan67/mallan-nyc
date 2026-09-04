/**
 * responsive-image — correctly sized card photos.
 *
 * MEASURED PROBLEM (2026-07-31): search cards render at 209-616 CSS px
 * but downloaded the untouched source. One card photo measured
 * 3239x2160 at 1,443,781 bytes. The DTO's `thumbUrl` is byte-identical
 * to `url`, so there is no pre-generated small variant to switch to, and
 * `/cdn-cgi/image/...` is not available on the R2 host (404).
 *
 * The one working lever is the Next.js image optimizer. Measured:
 *
 *     raw source                     1,443,781 bytes
 *     /_next/image?w=384&q=75           19,509 bytes   (~74x smaller)
 *
 * OPT-IN ONLY. `buildImageSources` is called by IDXImage exclusively
 * when the caller passes an explicit `sizeProfile`. A surface with no
 * profile keeps byte-for-byte the pre-existing raw-source behavior. This
 * matters because `sizes` is meaningless without a known rendered width:
 * optimizing an un-audited surface under a guessed `sizes` would trade
 * an oversized download for a blurry image. See IDXImage's `shouldOptimize`.
 *
 * COST NOTE — this reverses a documented decision. IDXImage's header
 * previously stated that next/image was avoided to dodge Vercel Image
 * Optimization charges at "$5 per 1,000 after 5,000 free". That figure
 * is obsolete: it describes legacy source-image pricing, which this
 * account is not on.
 *
 * Verified 2026-07-31 and re-verified 2026-08-01 against the team's own
 * billing object — Pro, billingVersion 2, with exactly three image line
 * items (transformation, cache read, cache write) and NO legacy
 * source-image item. Captured evidence, method, and the limits of what
 * it proves:
 *   docs/operations/vercel-image-optimization-billing-evidence-2026-08-01.md
 *
 * Two honest caveats, because they change the conclusion if wrong:
 *   - The $20/month included credit is SHARED across functions, data
 *     transfer, ISR and other metered products. It is not reserved for
 *     images, so "inside the allocation" holds only if total account
 *     usage leaves room.
 *   - Current usage counters could not be retrieved via the API and
 *     must be read from the dashboard before relying on any headroom.
 *
 * To revert, have buildImageSources() return `{ src, srcSet: undefined }`.
 *
 * SAFETY: callers keep the ORIGINAL url as a fallback. If an optimized
 * request fails for any reason (optimizer disabled, host removed from
 * remotePatterns, upstream 401/403/404, non-image body, timeout),
 * IDXImage retries the raw source exactly once before showing its error
 * state, so images can never go blank because of this module.
 */
import IMAGE_CONFIG from '@/config/image-optimization.json';

/**
 * Minimal candidate ladder covering every measured card width at 1x and
 * 2x DPR. Tops out at 1600: with the full-width branch ending at 767px,
 * the largest card need is 767 x 2 = 1534 device px, which 1600 covers
 * at 1.04x. 1920 would cover it at 1.25x and download 25% more for no
 * visible gain. See the JSON's $comment keys.
 */
export const CARD_IMAGE_WIDTHS: readonly number[] = IMAGE_CONFIG.cardImageWidths;

/** Quality requested for card transforms. Must be in `images.qualities`. */
export const CARD_IMAGE_QUALITY: number = IMAGE_CONFIG.cardImageQuality;

/**
 * EXACT hosts the optimizer may be handed. Shared with next.config.js via
 * config/image-optimization.json so the two cannot drift; a helper-approved
 * host that Next rejects would 400 every card photo.
 *
 * No wildcards, by design — `*.r2.dev` is a shared Cloudflare suffix, not
 * a Mallan namespace, so it would admit any stranger's public bucket.
 */
export const OPTIMIZER_TRUSTED_HOSTS: readonly string[] =
  IMAGE_CONFIG.optimizerTrustedHosts;

/**
 * `sizes` values per card profile. These MUST describe the real rendered
 * width or the browser picks a wrong candidate — too large (the original
 * defect) or too small (a blurriness defect). Widths measured on preview
 * across Grid/List/Split at 390/1440/1920 viewports.
 */
export const CARD_SIZES = {
  /**
   * ALL-LISTINGS layout only (2-col within max-w-6xl).
   *
   * This profile used to serve the 3-column grid view as well. It no
   * longer does — that view has its own `gridTight` below. Do NOT
   * recombine them: sharing one profile over-declared the narrower
   * layout by up to 1.67x (a 326px card receiving 640).
   *
   * Measured: 367@768, 435@900, 501@1023, 501@1024, then fixed at 584
   * from 1280 up as max-w-6xl caps. So: a vw ratio until the container
   * caps, then a constant.
   *
   * TWO RULES THIS ENCODES, both learned from measured defects.
   *
   * 1. BREAKPOINTS MUST BE COMPLEMENTARY TO TAILWIND, NOT EQUAL TO IT.
   *    Tailwind breakpoints are `min-width`, so `md` applies AT 768px.
   *    An inclusive `(max-width: 768px)` overlaps it by one pixel-width.
   *    Both directions were measured on preview:
   *      (max-width: 640px) -> 641-767px UNDER-resolved, still one
   *        column but claiming 50vw: 700@1x rendered 693, got 384 =
   *        0.55x; 700@2x rendered 695, got 828 = 0.60x
   *      (max-width: 768px) -> AT 768px OVER-downloaded, md already
   *        two columns but still claiming 100vw: @2x rendered 369,
   *        needed 738, got 1920
   *    Hence 767 = md-1 and 1279 = xl-1.
   *
   * 2. USE THE MEASURED RATIO, NOT A ROUND ONE. The column is
   *    47.8-49.0vw once gap and padding are subtracted (367/768,
   *    435/900, 501/1023). A round 50vw selected 448 for a 383px card
   *    and 640 for a 436px card; 49vw still over-declared at 800 (392
   *    against a 383px render). 48vw satisfies every measured point.
   *
   * The 600px cap is likewise measured, not rounded: the card settles
   * at 584 once max-w-6xl binds. A flat 640px was one rung too high at
   * 1024@2x (502px card needs 1004, which 1080 covers; 640x2=1280 was
   * selected instead).
   */
  grid: '(max-width: 767px) 100vw, (max-width: 1279px) 48vw, 600px',

  /**
   * GridCard in the 3-COLUMN grid view (`md:grid-cols-2 lg:grid-cols-3`
   * within max-w-7xl). Split out from `grid` on 2026-08-02 because one
   * profile could not serve both layouts without waste.
   *
   * Measured: 369@768, 438@900, 500@1023 (still 2-col, same as
   * all-listings), then 326@1024, 413@1280, 416@1440, 414@1920 — it
   * drops at lg when the third column appears, then settles at ~415 as
   * max-w-7xl caps.
   *
   * 1279 is xl(1280) - 1, complementary like every other branch here.
   */
  gridTight: '(max-width: 767px) 100vw, (max-width: 1023px) 48vw, (max-width: 1279px) 32vw, 414px',
  /**
   * ListCard: `w-48 sm:w-64` rail — measured 199-283px.
   *
   * Two boundary fixes:
   *   12rem -> 14rem : 192px declared against a 207px render was 7%
   *     short, and at 2x received 384 for a 414px need.
   *   640 -> 639     : Tailwind `sm` is min-width 640, so `sm:w-64`
   *     (256px) applies AT 640px while an inclusive `(max-width: 640px)`
   *     still declared 14rem. Measured: 640px @2x rendered 265, needed
   *     530, received 448 = 0.85x. One pixel of overlap, visibly soft.
   */
  list: '(max-width: 639px) 14rem, 18rem',
  /**
   * SplitCard: 2 col inside the ~55% listings panel, measured 376-405px
   * at 1440 and 508-544px at 1920 — no fixed px is right at both ends.
   *
   * The split grid is `grid-cols-1 lg:grid-cols-2` and the map is
   * `hidden lg:block`, so SplitCard only ever renders two-up at >=1024px.
   * Below that the page renders GridCards instead — verified live at
   * 700/800/900/1000px, where the grid profile was the applied `sizes`.
   *
   * The branch ends at 1023, not 1024: `lg` is min-width 1024, so an
   * inclusive `(max-width: 1024px)` overlapped it. Measured at exactly
   * 1024px: rendered 274, needed 548, received 1920 — a 3.5x
   * over-download caused by one pixel of overlap.
   *
   * 28vw, not 30vw. Measured 394/1440 = 27.4vw and 531/1920 = 27.7vw;
   * the round 30vw pushed one rung too far (1080 where 828 fits, 1280
   * where 1080 fits).
   */
  split: '(max-width: 1023px) 100vw, 28vw',
  /** Full-bleed. Only for a surface genuinely rendered at viewport width. */
  hero: '100vw',
} as const;

export type CardSizeKey = keyof typeof CARD_SIZES;

/**
 * True when `src` is an absolute HTTPS URL on an exactly-approved host.
 *
 * Rejects, deliberately:
 *   - relative paths (the local placeholder, and the media proxy — the
 *     optimizer only accepts relative URLs that resolve to static build
 *     assets, verified: /api/health returns INVALID_IMAGE_OPTIMIZE_REQUEST)
 *   - http:// (downgrade)
 *   - embedded credentials (user:pass@host)
 *   - any host not byte-equal to an approved one, which covers
 *     lookalikes (`api.cotality.com.evil.com`), subdomain confusion
 *     (`evil.api.cotality.com`), and arbitrary R2 buckets
 */
export function isOptimizableSource(src: string | null | undefined): boolean {
  if (!src || typeof src !== 'string') return false;
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  // Never forward credentials into a browser-visible optimizer URL.
  if (u.username || u.password) return false;
  return OPTIMIZER_TRUSTED_HOSTS.includes(u.hostname.toLowerCase());
}

/**
 * Unwrap `/api/media/proxy?url=<absolute>` to the absolute media URL.
 *
 * WHY: Trestle photos reach the browser as proxy URLs. On production that
 * is ~13% of card photos (218 of 1638 sampled); on preview it is 100%,
 * because preview serves the un-mirrored feed. Either way the proxy path
 * itself CANNOT be optimized — Vercel's optimizer accepts a relative
 * `url` only when it resolves to a STATIC build asset:
 *
 *   /_next/image?url=/images/hero.jpg   -> 200 (2,501,994 -> 56,724 bytes)
 *   /_next/image?url=/api/health        -> 400 INVALID_IMAGE_OPTIMIZE_REQUEST
 *   /_next/image?url=/api/media/proxy?… -> 400 INVALID_IMAGE_OPTIMIZE_REQUEST
 *
 * so a path-segment variant of the proxy would not work either.
 * Unwrapping to the inner absolute URL is the only route that works.
 *
 * The inner URL is validated by `isOptimizableSource` before use, so an
 * untrusted inner host falls back to the proxy rather than being fetched.
 */
export function unwrapProxiedMediaUrl(src: string): string {
  if (!src.startsWith('/api/media/proxy?')) return src;
  try {
    const inner = new URLSearchParams(src.slice(src.indexOf('?') + 1)).get('url');
    return inner && isOptimizableSource(inner) ? inner : src;
  } catch {
    return src;
  }
}

/** One optimizer URL at a given width. */
export function optimizedUrl(src: string, width: number, quality = CARD_IMAGE_QUALITY): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
}

/**
 * Build the `src` + `srcSet` pair for a photo.
 *
 * Returns the raw source unchanged (and no srcSet) when the source is not
 * on the exact trust list, so the placeholder and any future CDN keep
 * working untouched.
 *
 * Only ever called for surfaces with an explicit `sizeProfile`.
 */
export function buildImageSources(
  src: string | null | undefined,
  widths: readonly number[] = CARD_IMAGE_WIDTHS,
): { src: string; srcSet?: string } {
  const raw = src || '';
  // Proxied Trestle photos must be unwrapped first; R2 and other
  // approved absolute URLs pass through unchanged.
  const target = unwrapProxiedMediaUrl(raw);
  if (!isOptimizableSource(target)) return { src: raw };
  return {
    // Default candidate for browsers that ignore srcSet — deliberately a
    // card-sized width, never the original.
    src: optimizedUrl(target, 640),
    srcSet: widths.map((w) => `${optimizedUrl(target, w)} ${w}w`).join(', '),
  };
}
