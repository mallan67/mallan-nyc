/**
 * Bridge CRM-entered VIDEO / 3D-TOUR URLs into the listing media array.
 *
 * The sale form collects a video URL (YouTube/Vimeo) and a 3D / virtual-tour
 * URL (Matterport / unbranded tour) and stores them on the listing's `raw_data`
 * JSON — NOT in the `listing_media` table (those are external URLs, not R2
 * files). The public listing-detail gallery renders Video / 3D tabs by looking
 * for `media` entries whose mediaType is "video" / "virtualtour", so without
 * this bridge a saved video silently never appears. This helper turns the
 * stored raw_data URLs into the media entries the gallery expects.
 *
 * Pure + generic: no hardcoded listing. Returns [] when nothing is stored.
 *
 * @module lib/media/listing-video-media
 */

export interface VideoMediaEntry {
  url: string;
  /** "Video" → gallery Video tab; "VirtualTour" → gallery 3D tab. */
  mediaType: 'Video' | 'VirtualTour';
}

function str(rd: Record<string, unknown>, key: string): string {
  const v = rd[key];
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Extract video + 3D-tour media entries from a listing's raw_data JSON.
 * Checks the sale-form keys first, then the RESO/IDX field names.
 */
export function extractListingVideoMedia(
  rawData: Record<string, unknown> | null | undefined,
): VideoMediaEntry[] {
  const rd = rawData && typeof rawData === 'object' ? rawData : {};
  const out: VideoMediaEntry[] = [];

  const video = str(rd, 'saleVideoUrl') || str(rd, 'VideoURL') || str(rd, 'VideosUrl');
  const tour =
    str(rd, 'saleMatterportUrl') ||
    str(rd, 'saleVideoTourUrl') ||
    str(rd, 'VirtualTourURLUnbranded') ||
    str(rd, 'saleVirtualTourUnbranded');

  if (video) out.push({ url: video, mediaType: 'Video' });
  if (tour) out.push({ url: tour, mediaType: 'VirtualTour' });
  return out;
}
