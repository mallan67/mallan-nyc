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
 * 2x DPR. Deliberately excludes 1920/2048 — the widest card need is
 * 1232 device px, which 1200 covers. See the JSON's $comment keys.
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
   * GridCard. Serves TWO layouts, so this must cover the wider one:
   *   all-listings — max-w-6xl, 2 col : measured 564-616px
   *   grid view    — max-w-7xl, 3 col : measured 385-437px
   * Declaring the narrower one would under-resolve every all-listings
   * card by ~1.6x, so the wider layout wins.
   *
   * 600px, not 620px, is deliberate — it is tuned to the candidate
   * ladder. At 2x DPR, 620 asks for 1240 and the smallest candidate at
   * or above that is 1920, so cards fetched 361 KB instead of ~153 KB.
   * 600 asks for exactly 1200 and lands on that candidate.
   */
  grid: '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 600px',
  /** ListCard: w-48 / sm:w-64 rail — measured 209-283px. */
  list: '(max-width: 640px) 12rem, 18rem',
  /**
   * SplitCard: 2 col inside the ~55% listings panel. Measured 376-405px
   * at 1440 and 508-544px at 1920, so no fixed px is right at both ends.
   */
  split: '(max-width: 768px) 50vw, 30vw',
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
