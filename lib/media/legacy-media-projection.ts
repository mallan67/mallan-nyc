/**
 * LEGACY `listings.media` COMPATIBILITY PROJECTION — pure, shared.
 *
 * `listings.media` is NOT an authority. Canonical media state lives in
 * `listing_media`, reconciled by media-sync. This JSON column survives only as
 * a read fallback for third-party Cotality listings that have no canonical rows
 * yet, and is scheduled for retirement.
 *
 * WHY THIS MODULE EXISTS
 *
 * The transformation currently lives inline in Property sync's batch-media
 * block (lib/idx/sync.ts). The Property incremental query is moving to
 * ModificationTimestamp-only, which means a photo-only change (PhotosChangeTimestamp
 * moves, MT does not) will no longer fetch the listing there — so the refill
 * must move to the Media/PCT path that already owns photo freshness.
 *
 * Extracting it FIRST, unchanged, means both call sites run the identical
 * transformation during the transition. A second, subtly-different mapping is
 * exactly how the two representations would drift.
 */
import { classifyTrestleMediaCategory } from '@/lib/media/media-sync-service';

/** One entry of the legacy `listings.media` JSON array. */
export interface LegacyMediaEntry {
  url: string;
  mediaType: string;
  order: number;
}

/** The provider fields this projection reads. Deliberately narrow. */
export interface ProviderMediaRow {
  MediaURL?: string | null;
  MediaCategory?: string | null;
  Order?: number | string | null;
  PreferredPhotoYN?: boolean | string | null;
  MediaKey?: string | null;
  MediaStatus?: string | null;
}

/**
 * Project a COMPLETE provider media set to the legacy JSON shape.
 *
 * Byte-for-byte the mapping from sync.ts's batch-media block:
 *   - `classifyTrestleMediaCategory` for the type (the shared classifier that
 *     fixed floor-plans-rendered-as-photos)
 *   - PreferredPhotoYN sorts to -1 so the hero leads, matching the reader
 *   - rows without a MediaURL are dropped, as before
 *
 * The caller MUST guarantee the input is the complete authoritative set. In
 * media-sync that is the post-`fetchMedia`-resolve position, where pagination
 * has followed every @odata.nextLink and an incomplete response has already
 * thrown. An empty array from a resolved fetch is an authoritative empty set;
 * an incomplete fetch never reaches here.
 */
export function projectLegacyMedia(rows: readonly ProviderMediaRow[]): LegacyMediaEntry[] {
  const out: LegacyMediaEntry[] = [];
  for (const m of rows) {
    if (!m.MediaURL) continue;
    const mediaType = classifyTrestleMediaCategory(m.MediaCategory ?? undefined);
    const isPreferred = m.PreferredPhotoYN === true || m.PreferredPhotoYN === 'true';
    out.push({
      url: String(m.MediaURL),
      mediaType,
      order: isPreferred ? -1 : Number(m.Order ?? 0),
    });
  }
  return out;
}

/**
 * Rows a Cotality-sourced projection may consider.
 *
 * `crm:`-namespaced media is agent-uploaded and Cotality never emits it, so a
 * feed-derived projection must not carry it. This is a filter over PROVIDER
 * input only — it is NOT the ownership decision. Whether the LISTING may have
 * its compatibility JSON rewritten at all is a separate check at the write
 * site, because a Mallan-owned listing must be protected even when the provider
 * rows themselves look ordinary.
 */
export function providerRowsOnly<T extends ProviderMediaRow>(
  rows: readonly T[],
  isCrmMediaKey: (key: string) => boolean,
): T[] {
  return rows.filter((r) => !(r.MediaKey && isCrmMediaKey(String(r.MediaKey))));
}
