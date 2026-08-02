'use client';

import { useCallback, useState } from 'react';
import { useSwipe } from './useSwipe';
import {
  getValidPhotoMedia,
  LISTING_PLACEHOLDER_IMAGE,
  type ListingPhotoMedia,
} from '@/lib/media/listing-card-media';

/**
 * useCardPhotoCarousel — the single card photo-carousel contract.
 *
 * Extracted verbatim from the SplitCard implementation (2026-07-31) so
 * GridCard, ListCard and SplitCard share ONE behaviour instead of three
 * divergent ones. Before this hook, GridCard and ListCard called
 * `getHeroPhoto()` and rendered photo 1 with no index state, no arrows
 * and no swipe — they displayed a photo-count badge the user could not
 * act on. Browser-verified on production 2026-07-31: 100 cards,
 * 0 next/prev buttons, 1 image per listing.
 *
 * Contract (all three cards):
 *   - photo 1 is the initial hero (getValidPhotoMedia preserves order);
 *   - ONLY valid photo media — floor plans, video and 3D tours are
 *     excluded upstream by getValidPhotoMedia/isPhotoMedia, so they can
 *     never enter photo navigation;
 *   - a failed photo is dropped from the rotation and the index resets,
 *     so one broken URL never collapses the carousel to blank;
 *   - `prev`/`next` call preventDefault + stopPropagation so an arrow
 *     click never opens the listing, while any other click on the card
 *     still navigates;
 *   - touch swipe advances, and `swipe.cancelIfSwiping` suppresses the
 *     navigation click at the end of a swipe gesture.
 *
 * NOT handled here: the white-border crop opt-in. It is a function of
 * `listing._source`, not of the carousel, and
 * `tests/runtime/search-exclusive-card-hero.test.ts` pins the literal
 * `autoCropWhiteBorder={shouldAutoCropWhiteBorder(listing._source)}` at
 * all three call sites so the 2026-05-16 R2-CORS incident fix cannot be
 * refactored away silently. Hiding it behind this hook would defeat that
 * guardrail, so each card keeps passing it explicitly.
 */
/**
 * The navigable photo set: valid photo media (floor plans, videos and 3D
 * tours are already excluded by `getValidPhotoMedia`/`isPhotoMedia`),
 * minus any URL that has failed to load.
 *
 * Pure + exported so the "a broken photo is skipped, it does not blank
 * the card" contract is unit-testable without rendering React.
 */
export function selectNavigablePhotos(
  media: readonly ListingPhotoMedia[] | null | undefined,
  failedUrls: ReadonlySet<string>,
): ReturnType<typeof getValidPhotoMedia> {
  return getValidPhotoMedia(media).filter((m) => !failedUrls.has(String(m.url)));
}

/** Advance forward, wrapping past the last photo back to the first. */
export function nextPhotoIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return current < count - 1 ? current + 1 : 0;
}

/** Advance backward, wrapping before the first photo to the last. */
export function prevPhotoIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return current > 0 ? current - 1 : count - 1;
}

/**
 * Keep an index addressable after the photo set shrinks (a photo failed
 * to load). Without this the card would render `undefined` and blank.
 */
export function clampPhotoIndex(current: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(current, 0), count - 1);
}

export interface CardPhotoCarousel {
  /** Valid, non-failed photos in display order. */
  photos: ReturnType<typeof getValidPhotoMedia>;
  /** Clamped current index — always valid even after a photo fails. */
  photoIdx: number;
  /** URL to render, or the placeholder when no photo survives. */
  currentSrc: string;
  /** True when navigation controls should render. */
  hasMultiple: boolean;
  /** Count of navigable photos (drives the "n/N" counter). */
  count: number;
  /** Advance handlers safe to bind to a bare control. */
  goPrev: () => void;
  goNext: () => void;
  /** Click handlers that do NOT trigger the card's listing link. */
  prev: (e: React.MouseEvent) => void;
  next: (e: React.MouseEvent) => void;
  /** Touch handlers + the click suppressor for swipe gestures. */
  swipe: ReturnType<typeof useSwipe>;
  /** Pass to IDXImage.onError — drops the URL and re-anchors the index. */
  handlePhotoError: () => void;
}

export function useCardPhotoCarousel(
  media: readonly ListingPhotoMedia[] | null | undefined,
): CardPhotoCarousel {
  const [photoIdx, setPhotoIdx] = useState(0);
  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(new Set());

  const photos = selectNavigablePhotos(media, failedPhotoUrls);
  const safePhotoIdx = clampPhotoIndex(photoIdx, photos.length);
  const currentSrc = photos[safePhotoIdx]?.url || LISTING_PLACEHOLDER_IMAGE;
  const hasMultiple = photos.length > 1;

  const goPrev = useCallback(
    () => setPhotoIdx((i) => prevPhotoIndex(clampPhotoIndex(i, photos.length), photos.length)),
    [photos.length],
  );
  const goNext = useCallback(
    () => setPhotoIdx((i) => nextPhotoIndex(clampPhotoIndex(i, photos.length), photos.length)),
    [photos.length],
  );

  const swipe = useSwipe(goNext, goPrev);

  const handlePhotoError = useCallback(() => {
    if (currentSrc === LISTING_PLACEHOLDER_IMAGE) return;
    setFailedPhotoUrls((prev) => new Set(prev).add(currentSrc));
    setPhotoIdx(0);
  }, [currentSrc]);

  const prev = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      goPrev();
    },
    [goPrev],
  );

  const next = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      goNext();
    },
    [goNext],
  );

  return {
    photos,
    photoIdx: safePhotoIdx,
    currentSrc,
    hasMultiple,
    count: photos.length,
    goPrev,
    goNext,
    prev,
    next,
    swipe,
    handlePhotoError,
  };
}
