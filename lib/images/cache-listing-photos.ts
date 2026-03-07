/**
 * Cache Trestle listing photos to Cloudflare R2.
 *
 * Called during ISR revalidation. Downloads photos from Trestle
 * (server-side with Bearer auth) and uploads to R2 for permanent,
 * publicly accessible URLs that never expire.
 *
 * Flow:
 *   1. HeadObject check — skip photos already in R2
 *   2. Download from Trestle (Bearer auth, server-side only)
 *   3. Upload to R2 (immutable, 1-year cache)
 *   4. Replace media URL in-place on the listing object
 *
 * Falls back silently — if R2 is unavailable or a photo fails,
 * the original Trestle URL stays and the proxy handles it.
 */

import { uploadToR2, existsInR2, getR2PublicUrl, hasR2Config } from './r2';
import { getAccessToken } from '@/lib/idx/auth';

const MAX_CONCURRENT = 10;

function photoKey(listingId: string, order: number): string {
  const safe = listingId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `photos/${safe}/${order}.jpg`;
}

interface MediaItem {
  url: string;
  mediaType: 'Photo' | 'Video' | 'VirtualTour' | 'FloorPlan';
  order: number;
}

interface ListingWithMedia {
  listingId: string;
  media: MediaItem[];
}

/**
 * Cache listing photos to R2. Mutates media URLs in-place
 * from Trestle URLs to permanent R2 public URLs.
 */
export async function cacheListingPhotosToR2(
  listings: ListingWithMedia[],
): Promise<void> {
  if (!hasR2Config()) return;

  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return;
  }

  // Collect photos that need caching (Trestle URLs only)
  const tasks: { listing: ListingWithMedia; idx: number; key: string }[] = [];
  for (const listing of listings) {
    for (let i = 0; i < listing.media.length; i++) {
      const m = listing.media[i];
      if (!m.url || m.mediaType !== 'Photo') continue;
      // Skip URLs already on R2 or our own domain
      if (m.url.includes('r2.dev') || m.url.includes('mallan.nyc')) continue;
      tasks.push({ listing, idx: i, key: photoKey(listing.listingId, m.order) });
    }
  }

  if (tasks.length === 0) return;

  // Phase 1: Check which photos are already cached in R2
  const uncached: typeof tasks = [];
  for (let i = 0; i < tasks.length; i += MAX_CONCURRENT) {
    const batch = tasks.slice(i, i + MAX_CONCURRENT);
    await Promise.allSettled(
      batch.map(async (task) => {
        if (await existsInR2(task.key)) {
          // Already cached — swap to R2 URL
          task.listing.media[task.idx] = {
            ...task.listing.media[task.idx],
            url: getR2PublicUrl(task.key),
          };
        } else {
          uncached.push(task);
        }
      }),
    );
  }

  if (uncached.length === 0) return;

  // Phase 2: Download from Trestle + upload to R2
  for (let i = 0; i < uncached.length; i += MAX_CONCURRENT) {
    const batch = uncached.slice(i, i + MAX_CONCURRENT);
    await Promise.allSettled(
      batch.map(async ({ listing, idx, key }) => {
        const item = listing.media[idx];
        const resp = await fetch(item.url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'image/*' },
        });
        if (!resp.ok) return; // Keep original URL — proxy fallback

        const buffer = Buffer.from(await resp.arrayBuffer());
        const contentType = resp.headers.get('content-type') || 'image/jpeg';

        await uploadToR2(key, buffer, contentType);

        // Swap to permanent R2 URL
        listing.media[idx] = { ...item, url: getR2PublicUrl(key) };
      }),
    );
  }
}
