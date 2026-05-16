'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { detectWhiteBorder } from '@/lib/media/white-border-detector';

/**
 * IDXImage — native <img> for all listing photos (IDX + R2).
 *
 * Uses <img> instead of next/image so photos load directly from
 * their source CDN without Vercel Image Optimization charges
 * ($5/1000 after the free 5000/mo tier).
 *
 * Two image sources:
 *   - Exclusive listings → IDX/Trestle CDN (*.trestle.com)
 *   - All other photos   → Cloudflare R2 (*.r2.dev / images.mallan.nyc)
 *
 * Both sources serve pre-optimized images, so Vercel re-optimization
 * is unnecessary. R2 images are Sharp-processed WebP at upload time.
 *
 * Optional `autoCropWhiteBorder` (added 2026-05-16): when true, the
 * loaded image is analyzed for baked-in white canvas borders. If
 * detected, a `transform: scale(1.10)` is applied to the existing
 * <img> element to crop the border via `object-fit: cover`. Clean
 * photos are NOT scaled — the transform stays `undefined`. Detection
 * is fully synchronous post-load and guarded against canvas/CORS
 * failures (no-op on any error). See
 * `lib/media/white-border-detector.ts` for the detection thresholds
 * and false-positive guards.
 */

const ASPECT_CLASSES = {
  hero: 'aspect-[16/9] md:aspect-[21/9]',
  card: 'aspect-[4/3]',
  wide: 'aspect-[3/2]',
  thumb: 'aspect-square',
} as const;

/**
 * Static-scale value applied to images detected as having baked-in
 * white canvas borders. 1.10 = 10% extra crop on each axis. This is
 * enough to absorb most observed Trestle white-canvas borders
 * (~9–10% of image width) without dramatically zooming clean photos
 * that might still trigger detection on a borderline ratio.
 *
 * Exported so tests can pin the value and a future audit can find it.
 */
export const WHITE_BORDER_CROP_SCALE = 1.1;

interface IDXImageProps {
  src: string;
  alt: string;
  aspect?: keyof typeof ASPECT_CLASSES;
  priority?: boolean;
  className?: string;
  onError?: () => void;
  /**
   * Opt-in white-border detection (default: false).
   *
   * When true, after the image successfully loads, IDXImage samples
   * the four edge bands of the loaded image data via canvas and
   * checks them against the thresholds in
   * `lib/media/white-border-detector.ts`. If a baked-in white canvas
   * border is detected, IDXImage applies `transform: scale(1.10)` to
   * the existing <img> element to crop the border. Clean images are
   * unaffected — no scale is applied.
   *
   * Pass `true` ONLY on hero/card photos where the extra crop
   * improves visual quality. The detail-page gallery and other
   * inline photos should keep the default `false` so the operator
   * sees the original framing.
   */
  autoCropWhiteBorder?: boolean;
}

export default function IDXImage({
  src,
  alt,
  aspect = 'card',
  priority = false,
  className = '',
  onError,
  autoCropWhiteBorder = false,
}: IDXImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  // White-border verdict is keyed on the src it was computed for, not
  // a bare boolean. When `src` changes (e.g. SplitCard carousel
  // advance), `borderedSrc` continues to point at the OLD src and the
  // derived `hasWhiteBorder` flips to false automatically — no reset
  // useEffect required, which avoids the
  // `react-hooks/set-state-in-effect` lint rule and keeps the state
  // model purely derived from load events.
  const [borderedSrc, setBorderedSrc] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const failed = failedSrc === src;
  const loaded = loadedSrc === src;
  const hasWhiteBorder = borderedSrc === src;

  // Only animate when the card is in the viewport — saves GPU layers for off-screen cards
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '100px' }  // start animation slightly before card scrolls in
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Load handler: mark loaded + (opt-in) run the white-border detector.
  // The detector is fully guarded — any failure (canvas tainted, no 2D
  // context, OOM, detached image) returns false and we no-op.
  const handleLoad = useCallback(() => {
    setLoadedSrc(src);
    if (!autoCropWhiteBorder) return;
    const el = imgRef.current;
    if (!el || el.naturalWidth === 0) return;
    // Defer to the next frame so we don't block paint with canvas work.
    // requestAnimationFrame keeps the detector off the load tick while
    // still running before the user sees the final pixels.
    requestAnimationFrame(() => {
      try {
        if (detectWhiteBorder(el)) {
          // Tag THIS src as bordered. The derived `hasWhiteBorder`
          // flag (computed against `src` in the render body) auto-
          // invalidates when src later changes — no separate reset.
          //
          // Note: the detector returns false (silently) for cross-
          // origin images served WITHOUT CORS headers — getImageData()
          // throws a SecurityError on a tainted canvas, which our
          // wrapper catches. Cloudflare R2 public buckets without a
          // CORS policy fall into this bucket. Same-origin images
          // (`/api/media/proxy?url=…`) work correctly. See
          // `lib/media/white-border-detector.ts` for the per-failure
          // mode documentation.
          setBorderedSrc(src);
        }
      } catch {
        // Detector itself wraps in try/catch; defensive double-wrap so
        // a rare React-tree edge case can't surface as an unhandled
        // promise rejection or render error.
      }
    });
  }, [src, autoCropWhiteBorder]);

  // SSR-load race fix (2026-05-16): the <img> ships in the SSR HTML with
  // `src` set, so the browser starts loading it before React hydrates.
  // For images that finish loading BEFORE the onLoad handler is attached
  // during hydration, the handler never fires — and our detector never
  // runs, leaving baked-white-border photos un-cropped.
  //
  // After mount, check whether the <img> is already complete. If so,
  // synthesize the same load behavior (mark loaded + run detector for
  // opt-in cards). Idempotent — the regular onLoad path remains the
  // primary trigger for images that load after hydration.
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete && el.naturalWidth > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-shot post-mount catch-up for the SSR-load race (img.onLoad never fires when the bytes finish before hydration). The setState inside handleLoad runs at most once per src, not on a continuous external signal.
      handleLoad();
    }
    // Re-run when src or the opt-in flag changes so a SplitCard
    // carousel advance is re-evaluated on the new src.
  }, [src, autoCropWhiteBorder, handleLoad]);

  // translate="no" + class="notranslate" tell Google Translate (and other
  // browser-level translators) to skip this subtree. Without this, Translate
  // wraps text nodes inside the wrapper in <font> tags and forces a reflow
  // that bumps `aspect-ratio` containers off the parent's pixel grid — cards
  // that share the same component end up rendering at slightly different
  // sizes depending on the surrounding text content (price, unit number).
  // Verified 2026-05-01 via Maya's incognito vs default-browser comparison
  // on /search?tab=rent-residential. Public-site images only — no effect on
  // text translation elsewhere on the page.
  if (!src || failed) {
    return (
      <div
        translate="no"
        className={`notranslate relative overflow-hidden bg-gray-100 flex items-center justify-center ${ASPECT_CLASSES[aspect]} ${className}`}
        role="img"
        aria-label={alt}
      >
        <svg
          className="w-12 h-12 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
          />
        </svg>
      </div>
    );
  }

  const shouldAnimate = loaded && visible;

  return (
    <div
      ref={wrapperRef}
      translate="no"
      className={`notranslate relative overflow-hidden ${ASPECT_CLASSES[aspect]} ${className}`}
    >
      {/* Shimmer skeleton while loading */}
      {!loaded && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        onLoad={handleLoad}
        onError={() => {
          setFailedSrc(src);
          onError?.();
        }}
        translate="no"
        className={`notranslate absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{
          // When a baked-in white canvas border is detected we apply a
          // static scale crop and DISABLE the liquidMotion animation —
          // the animation would otherwise override the static scale
          // during keyframes, intermittently re-exposing the border.
          // Clean photos keep their normal animation and unscaled
          // transform-origin (50% 60%, Ken Burns sweet spot).
          animation: shouldAnimate && !hasWhiteBorder
            ? 'liquidMotion 10s ease-in-out infinite'
            : undefined,
          transformOrigin: hasWhiteBorder ? '50% 50%' : '50% 60%',
          transform: hasWhiteBorder ? `scale(${WHITE_BORDER_CROP_SCALE})` : undefined,
        }}
      />
    </div>
  );
}
