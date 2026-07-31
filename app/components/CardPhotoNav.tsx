'use client';

import type { CardPhotoCarousel } from '@/lib/hooks/useCardPhotoCarousel';

/**
 * CardPhotoNav / CardPhotoCounter — the ONE set of carousel controls
 * rendered by GridCard, ListCard and SplitCard.
 *
 * Paired with `useCardPhotoCarousel` (the state half), this is the
 * presentation half. Both exist so the three cards cannot drift apart
 * again: before 2026-07-31 only SplitCard had a carousel, so grid and
 * list cards showed a photo-count badge advertising photos the user had
 * no way to reach.
 *
 * Visibility rule: the arrows are ALWAYS in the DOM when there is more
 * than one photo. On pointer devices (md+) they fade in on card hover —
 * matching the previous SplitCard behavior — and on touch viewports they
 * stay visible, because `:hover` never fires there and swipe alone is not
 * discoverable. Keyboard users get them via `focus-visible`.
 *
 * The parent MUST carry Tailwind's `group` class for the hover reveal.
 */

interface CardPhotoNavProps {
  carousel: CardPhotoCarousel;
  /** `sm` for the compact split/list rails, `md` for the full-width grid card. */
  size?: 'sm' | 'md';
}

const NAV_SIZES = {
  sm: { button: 'w-6 h-6', icon: 'w-3 h-3', left: 'left-1', right: 'right-1' },
  md: { button: 'w-8 h-8', icon: 'w-4 h-4', left: 'left-2', right: 'right-2' },
} as const;

export function CardPhotoNav({ carousel, size = 'sm' }: CardPhotoNavProps) {
  if (!carousel.hasMultiple) return null;
  const s = NAV_SIZES[size];
  // Hidden-until-hover on pointer devices only. `opacity` (not
  // conditional rendering) keeps the controls mounted so assistive tech
  // and tests can find them, and so the fade is animatable.
  const reveal =
    'opacity-100 md:opacity-0 md:group-hover:opacity-100 focus-visible:opacity-100 motion-safe:transition-opacity motion-safe:duration-200';

  return (
    <>
      <button
        type="button"
        onClick={carousel.prev}
        className={`absolute ${s.left} top-1/2 -translate-y-1/2 ${s.button} ${reveal} rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white z-20`}
        aria-label="Previous photo"
      >
        <svg className={`${s.icon} text-brand-dark`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <button
        type="button"
        onClick={carousel.next}
        className={`absolute ${s.right} top-1/2 -translate-y-1/2 ${s.button} ${reveal} rounded-full bg-white/90 flex items-center justify-center shadow-sm hover:bg-white z-20`}
        aria-label="Next photo"
      >
        <svg className={`${s.icon} text-brand-dark`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {/* Dot indicators — capped at 5 so a 40-photo listing doesn't
          render a dot strip wider than the card. */}
      <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex gap-0.5 z-10" aria-hidden="true">
        {carousel.photos.slice(0, 5).map((_, i) => (
          <span
            key={i}
            className={`w-1 h-1 rounded-full transition-colors ${i === carousel.photoIdx ? 'bg-white' : 'bg-white/40'}`}
          />
        ))}
      </div>
    </>
  );
}

interface CardPhotoCounterProps {
  carousel: CardPhotoCarousel;
  /** Render the camera glyph alongside the count (grid card badge style). */
  withIcon?: boolean;
  /**
   * Show the badge even when the listing has exactly one photo.
   *
   * GridCard's badge historically displayed a total photo count for any
   * count > 0, so it opts in to preserve that. List and split cards
   * showed nothing for single-photo listings and keep that behavior — a
   * lone "1" badge is noise, not information.
   */
  showSingle?: boolean;
  className?: string;
}

/**
 * "n/N" position readout. Placement differs per card, so the caller owns
 * the positioning classes; only the content contract lives here.
 *
 * `aria-live="polite"` announces the advance to screen-reader users, who
 * otherwise get no feedback that the arrow did anything.
 */
export function CardPhotoCounter({
  carousel,
  withIcon = false,
  showSingle = false,
  className = '',
}: CardPhotoCounterProps) {
  if (carousel.count === 0) return null;
  if (!carousel.hasMultiple && !showSingle) return null;
  return (
    <span
      className={`flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white rounded-md ${className}`}
      aria-live="polite"
    >
      {withIcon && (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
      {carousel.hasMultiple ? `${carousel.photoIdx + 1}/${carousel.count}` : carousel.count}
    </span>
  );
}
