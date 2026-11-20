/**
 * Hero photo fit on the listing page. The hero is a fixed box (about 1351x901 CSS px on a desktop). Filling it (object-cover) enlarges and crops the photo; for a small
 * or portrait source that is the visible blur (live 2026-11-20: a 768x433 file shown at 1351x901 is enlarged 2.08x, a 543x1000 file 2.49x and cropped to a band). Cotality's
 * own files run from 768x433 to 2500x1666 and Mallan copies them unchanged, so the source cannot be sharper than it is; what the page can do is not to magnify and crop
 * it past a limit.
 *
 *  - If filling the box needs at most HERO_MAX_COVER_SCALE times the photo's own size, it fills and crops, as before.
 *  - Otherwise the whole photo is shown, centered on a plain neutral backdrop (no copy of the photo is made), enlarged at most HERO_MAX_MAGNIFICATION times and never larger than the box.
 *
 * Sizes are CSS pixels (a phone's slot is small, so most photos still fill it). The caller measures the photo (naturalWidth/Height) and the box (ResizeObserver).
 */
export const HERO_MAX_COVER_SCALE = 1.3;
export const HERO_MAX_MAGNIFICATION = 1.6;

export type HeroFit = { mode: 'cover' } | { mode: 'contain'; width: number; height: number };

interface Size {
  w: number;
  h: number;
}

const usable = (n: number) => Number.isFinite(n) && n > 0;

export function heroFit(natural: Size, slot: Size): HeroFit {
  if (!usable(natural.w) || !usable(natural.h) || !usable(slot.w) || !usable(slot.h)) return { mode: 'cover' };
  const toFit = Math.min(slot.w / natural.w, slot.h / natural.h);
  const toFill = Math.max(slot.w / natural.w, slot.h / natural.h);
  if (toFill <= HERO_MAX_COVER_SCALE) return { mode: 'cover' };
  const scale = Math.min(toFit, HERO_MAX_MAGNIFICATION);
  return { mode: 'contain', width: Math.round(natural.w * scale), height: Math.round(natural.h * scale) };
}
