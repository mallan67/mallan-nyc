'use client';

import { useState, useRef, useEffect } from 'react';

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
 */

const ASPECT_CLASSES = {
  hero: 'aspect-[16/9] md:aspect-[21/9]',
  card: 'aspect-[4/3]',
  wide: 'aspect-[3/2]',
  thumb: 'aspect-square',
} as const;

interface IDXImageProps {
  src: string;
  alt: string;
  aspect?: keyof typeof ASPECT_CLASSES;
  priority?: boolean;
  className?: string;
}

export default function IDXImage({
  src,
  alt,
  aspect = 'card',
  priority = false,
  className = '',
}: IDXImageProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

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
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        translate="no"
        className={`notranslate absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        style={{
          animation: shouldAnimate ? 'liquidMotion 10s ease-in-out infinite' : undefined,
          transformOrigin: '50% 60%',
        }}
      />
    </div>
  );
}
