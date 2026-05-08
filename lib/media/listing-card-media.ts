export const LISTING_PLACEHOLDER_IMAGE = '/images/listing-placeholder.svg';

export interface ListingPhotoMedia {
  url?: string | null;
  mediaType?: string | null;
  order?: number | null;
}

export interface ValidPhotoMedia extends ListingPhotoMedia {
  url: string;
}

const REJECTED_MEDIA_TYPES = new Set(['floorplan', 'floor plan', 'floor_plan', 'video', 'virtualtour', 'virtual tour', 'virtual_tour']);

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
  const mediaType = String(media.mediaType ?? '').trim().toLowerCase();
  if (REJECTED_MEDIA_TYPES.has(mediaType)) return false;
  return mediaType === '' || mediaType === 'photo' || mediaType === 'image';
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
