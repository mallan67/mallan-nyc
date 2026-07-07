import { classifyMediaItem } from './listing-media-resolver';

export const LISTING_PLACEHOLDER_IMAGE = '/images/listing-placeholder.svg';

export interface ListingPhotoMedia {
  url?: string | null;
  mediaType?: string | null;
  order?: number | null;
}

export interface ValidPhotoMedia extends ListingPhotoMedia {
  url: string;
}

export function isValidPublicImageUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;

  if (trimmed.startsWith('/')) {
    return !trimmed.startsWith('//');
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isPhotoMedia(media: ListingPhotoMedia): boolean {
  // Delegate to the canonical classifier — this catches null/empty-category
  // floorplans by URL shape (Trestle DOCUMENT-/.pdf), which the prior
  // mediaType-string-only check missed (floorplan-leak guard).
  return classifyMediaItem(media) === 'photo';
}

export function getValidPhotoMedia(media: readonly ListingPhotoMedia[] | null | undefined): ValidPhotoMedia[] {
  if (!Array.isArray(media)) return [];
  return media
    .filter((item): item is ValidPhotoMedia => isPhotoMedia(item) && isValidPublicImageUrl(item.url))
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
}

export function getHeroPhoto(
  media: readonly ListingPhotoMedia[] | null | undefined,
  failedUrls: ReadonlySet<string> = new Set(),
): string {
  const photo = getValidPhotoMedia(media).find((item) => {
    const url = String(item.url);
    return !failedUrls.has(url);
  });
  return photo?.url ?? LISTING_PLACEHOLDER_IMAGE;
}

export function countPhotoMedia(media: readonly ListingPhotoMedia[] | null | undefined): number {
  return getValidPhotoMedia(media).length;
}

/**
 * Whether a listing card should run IDXImage's white-border auto-crop.
 *
 * White-border auto-crop forces a cross-origin image fetch
 * (`crossOrigin="anonymous"` — the canvas detector needs an untainted
 * image). For CRM/Mallan exclusive listings (`_source === 'exclusive'`,
 * i.e. SL-/RL- rows) the hero is a clean Sharp-processed R2 WebP that needs
 * no crop, and forcing `crossOrigin` BREAKS it: the `pub-*.r2.dev` endpoint
 * omits `Vary: Origin` on its non-CORS response, so a browser that already
 * cached the hero via a plain (non-`crossOrigin`) fetch — which Featured and
 * the agent page do — reuses that no-`Access-Control-Allow-Origin`,
 * `immutable` cached response for the search card's `crossOrigin` request,
 * fails the CORS check, and falls back to the placeholder. (Verified live:
 * non-CORS-then-CORS on the same URL → the CORS load errors; CORS-first →
 * loads.) Disabling auto-crop here makes the search card fetch the hero the
 * SAME way as Featured/agent (no `crossOrigin`), so the cache stays coherent
 * and the CRM hero renders.
 *
 * Third-party IDX / RLS photos are served same-origin via
 * `/api/media/proxy`, where `crossOrigin` is harmless, so they KEEP
 * white-border auto-crop (`_source` is `'db+idx'` / undefined → returns
 * true) and their behavior is unchanged.
 */
export function shouldAutoCropWhiteBorder(source: string | null | undefined): boolean {
  return source !== 'exclusive';
}
