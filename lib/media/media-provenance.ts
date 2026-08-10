/**
 * CANONICAL MEDIA PROVENANCE — who owns one legacy `Listing.media` JSON item.
 *
 * THE DEFECT THIS CLOSES. The Trestle sync writes Cotality image URLs into the
 * legacy `Listing.media` JSON (lib/idx/sync.ts:821 on every upsert, plus the
 * media backfills at :1173/:1699/:2394 — and :1756 selects rows whose
 * `media::text LIKE '%cotality.com%'`, which is direct evidence those URLs are
 * there). `importJsonMediaToRows` then converted EVERY item into a `crm:`-keyed
 * `listing_media` row with no provenance check.
 *
 * That matters because `tombstoneVanished` deliberately EXCLUDES the `crm:`
 * namespace (lib/idx/media-sync.ts:1347/1353) so the feed can never prune a
 * genuine Mallan upload. A Cotality photo wearing a `crm:` key inherits that
 * immunity: when Cotality deletes the photo, the clone survives and the deleted
 * feed image resurrects publicly, permanently un-prunable.
 *
 * THE RULE IS POSITIVE AND ITEM-LEVEL. Neither listing-wide shortcut is
 * acceptable: "RLS row, so all its JSON is feed media" would destroy genuine
 * historical CRM uploads that sit on RLS rows, and "it has JSON, so it is CRM"
 * is the defect itself. Only an item that can be PROVEN Mallan-owned may enter
 * the `crm:` namespace; anything unprovable fails closed.
 *
 * This module has no imports from `lib/idx/**` on purpose — `media-sync.ts`
 * already imports `CRM_MEDIA_KEY_PREFIX` from `lib/media/crm-media.ts`, so a
 * reverse import would be circular.
 */

/**
 * Provider domains whose media is FEED-OWNED.
 *
 * Grounding (same evidence as `ROTATING_SUMMARY_URL_PROVIDER_DOMAINS`):
 *   - `cotality.com` — LIVE-OBSERVED: the 2026-07-21 authenticated Phase-0
 *     probes contain exactly one media/API host, `api.cotality.com`.
 *   - `corelogic.com` — DEFENSIVE, not observed in those probes: the media
 *     proxy still allowlists the deprecated `api-trestle.corelogic.com` /
 *     `api-prod.corelogic.com`, so stored legacy URLs may carry it.
 */
export const PROVIDER_MEDIA_DOMAINS: ReadonlyArray<string> = ['cotality.com', 'corelogic.com'];

/**
 * TRUE when a URL's HOSTNAME is a provider media host.
 *
 * Hostname-scoped, never a substring over the whole URL. A stable URL whose
 * PATH contains a provider-looking token (`/trestle-building.jpg`), whose QUERY
 * smuggles one (`?redirect=api.cotality.com`), or whose host merely looks alike
 * (`notcotality.com`, `cotality.com.evil.test`) must NOT match — otherwise an
 * attacker-chosen host could claim feed authority.
 *
 * Fail-closed for provenance: a malformed URL is not a provider host, so it
 * cannot be *claimed* as feed media; it falls through to the `unknown` branch
 * rather than being treated as a Mallan upload.
 */
export function isProviderMediaHost(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || url.trim() === '') return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return PROVIDER_MEDIA_DOMAINS.some((d) => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * `mallan-crm-upload` Provably Mallan-owned. May hold a `crm:` key, may be
 *                     imported into `listing_media`, is CRM-editable, and is
 *                     protected from feed tombstoning.
 * `cotality-feed`     Provably feed-owned. Stays Cotality-owned: never enters
 *                     the `crm:` namespace, never CRM-editable.
 * `unknown`           Unprovable. Fails closed — treated as NOT importable and
 *                     NOT editable, but never deleted.
 */
export type MediaProvenance = 'mallan-crm-upload' | 'cotality-feed' | 'unknown';

/** The legacy JSON item fields that carry provenance evidence. */
export interface ProvenanceCandidateItem {
  url?: string;
  heroUrl?: string;
  thumbUrl?: string;
  /** SHA-256 of uploaded bytes — written ONLY by the CRM upload path. */
  contentHash?: string;
  /** Upload wall-clock — written ONLY by the CRM upload path. */
  uploadedAt?: string;
}

export interface ProvenanceContext {
  /**
   * TRUE when `Listing.last_synced_from_trestle` is non-null — i.e. the Trestle
   * sync has written this row, so its `Listing.media` JSON may contain feed
   * images. FALSE for a CRM-only row the feed has never touched.
   *
   * Pass the fail-closed value (`true`) when the column was not selected.
   */
  listingIsTrestleSynced: boolean;
}

/** First non-empty display URL on a legacy item. */
function candidateUrl(item: ProvenanceCandidateItem): string {
  return (item.heroUrl || item.url || item.thumbUrl || '').trim();
}

/**
 * Decide who owns ONE legacy media item.
 *
 * Rule order is load-bearing — the provider-host test runs FIRST so that a
 * Cotality URL is feed media even on a CRM-only row and even when CRM markers
 * are also present. Otherwise a forged `contentHash` would launder a feed image
 * into the protected `crm:` namespace.
 */
export function classifyLegacyMediaItemProvenance(
  item: ProvenanceCandidateItem,
  ctx: ProvenanceContext,
): MediaProvenance {
  const url = candidateUrl(item);
  if (!url) return 'unknown';

  // 1. Positively feed-owned.
  if (isProviderMediaHost(url)) return 'cotality-feed';

  // 2. Positively Mallan-owned: markers only the CRM upload path writes. The
  //    Trestle mapper emits { url, mediaType, order } and never these.
  if (typeof item.contentHash === 'string' && item.contentHash.trim() !== '') {
    return 'mallan-crm-upload';
  }
  if (typeof item.uploadedAt === 'string' && item.uploadedAt.trim() !== '') {
    return 'mallan-crm-upload';
  }

  // 3. The feed has never written this row, so nothing in its JSON can be feed
  //    media. This is a proof about the ROW's write history, not an assumption
  //    about what its items look like.
  if (!ctx.listingIsTrestleSynced) return 'mallan-crm-upload';

  // 4. Synced row, non-provider host, no CRM marker -> unprovable. Fail closed.
  return 'unknown';
}
