/**
 * MEDIA PROVENANCE — the Cotality -> `crm:` contamination gate.
 *
 * PROVEN DEFECT. The Trestle sync writes Cotality image URLs into the legacy
 * `Listing.media` JSON (lib/idx/sync.ts:821 on every upsert, plus the media
 * backfills at :1173/:1699/:2394; :1756 literally selects rows whose
 * `media::text LIKE '%cotality.com%'`). `importJsonMediaToRows` then converted
 * EVERY item in that JSON into a `crm:`-keyed `listing_media` row, with no
 * provenance check, from three CRM write routes.
 *
 * Why that is not merely untidy: `tombstoneVanished` deliberately EXCLUDES the
 * `crm:` namespace (media-sync.ts:1347/1353) so the feed can never prune a
 * genuine Mallan upload. A Cotality photo wearing a `crm:` key inherits that
 * immunity — so when Cotality removes the photo, the clone survives forever and
 * the deleted feed image resurrects on the public site.
 *
 * The gate must be POSITIVE and ITEM-LEVEL. "This row is an RLS row, so assume
 * its JSON is feed media" would discard genuine historical CRM uploads that sit
 * on RLS rows; "this row has JSON, so assume CRM" is the current defect.
 */

import {
  classifyLegacyMediaItemProvenance,
  isProviderMediaHost,
  type MediaProvenance,
} from '@/lib/media/media-provenance';

const SYNCED = { listingIsTrestleSynced: true };
const LOCAL = { listingIsTrestleSynced: false };

describe('provider host matching is hostname-scoped', () => {
  it('matches the exact provider domain and dot-boundary subdomains', () => {
    expect(isProviderMediaHost('https://api.cotality.com/media/x.jpg')).toBe(true);
    expect(isProviderMediaHost('https://cotality.com/x.jpg')).toBe(true);
    expect(isProviderMediaHost('https://api-trestle.corelogic.com/x.jpg')).toBe(true);
  });

  it('does NOT match look-alike hosts', () => {
    // The whole point of hostname scoping: substring matching would call this
    // a provider URL and hand an attacker-controlled host feed authority.
    expect(isProviderMediaHost('https://notcotality.com/x.jpg')).toBe(false);
    expect(isProviderMediaHost('https://cotality.com.evil.test/x.jpg')).toBe(false);
  });

  it('does NOT match a provider token in the PATH or QUERY', () => {
    expect(isProviderMediaHost('https://cdn.example.test/trestle-building.jpg')).toBe(false);
    expect(isProviderMediaHost('https://cdn.example.test/x.jpg?redirect=api.cotality.com')).toBe(false);
  });

  it('a malformed URL is not a provider host', () => {
    expect(isProviderMediaHost('not-a-url')).toBe(false);
    expect(isProviderMediaHost('')).toBe(false);
    expect(isProviderMediaHost(null)).toBe(false);
  });
});

describe('item-level provenance on a SYNCED (Cotality) listing', () => {
  it('a Cotality-hosted item is FEED media, never CRM', () => {
    const p = classifyLegacyMediaItemProvenance(
      { url: 'https://api.cotality.com/media/abc.jpg' },
      SYNCED,
    );
    expect(p).toBe<MediaProvenance>('cotality-feed');
  });

  it('an item with CRM upload markers IS a genuine Mallan upload', () => {
    // `contentHash` / `uploadedAt` are written only by the CRM upload path;
    // the Trestle mapper emits { url, mediaType, order } and never these.
    expect(
      classifyLegacyMediaItemProvenance(
        { url: 'https://cdn.example.test/a.jpg', contentHash: 'deadbeef' },
        SYNCED,
      ),
    ).toBe('mallan-crm-upload');
    expect(
      classifyLegacyMediaItemProvenance(
        { url: 'https://cdn.example.test/a.jpg', uploadedAt: '2026-01-01T00:00:00Z' },
        SYNCED,
      ),
    ).toBe('mallan-crm-upload');
  });

  it('FAILS CLOSED on an unmarked, non-provider item', () => {
    // Cannot prove Mallan ownership -> must not enter the `crm:` namespace.
    expect(
      classifyLegacyMediaItemProvenance({ url: 'https://cdn.example.test/a.jpg' }, SYNCED),
    ).toBe('unknown');
  });

  it('a provider URL wins even when CRM markers are also present', () => {
    // Marker forgery must not launder a feed image into the CRM namespace.
    expect(
      classifyLegacyMediaItemProvenance(
        { url: 'https://api.cotality.com/media/abc.jpg', contentHash: 'deadbeef' },
        SYNCED,
      ),
    ).toBe('cotality-feed');
  });
});

describe('item-level provenance on a CRM-ONLY (never synced) listing', () => {
  it('an unmarked item is Mallan-owned by construction', () => {
    // The feed never wrote this row, so nothing in its JSON can be feed media.
    expect(
      classifyLegacyMediaItemProvenance({ url: 'https://cdn.example.test/a.jpg' }, LOCAL),
    ).toBe('mallan-crm-upload');
  });

  it('a Cotality-hosted item is STILL feed media even here', () => {
    // Ordering guard: the provider-host rule runs before the local-row rule.
    expect(
      classifyLegacyMediaItemProvenance({ url: 'https://api.cotality.com/x.jpg' }, LOCAL),
    ).toBe('cotality-feed');
  });
});

describe('degenerate items', () => {
  it('an item with no usable URL is unknown, not CRM', () => {
    expect(classifyLegacyMediaItemProvenance({}, LOCAL)).toBe('unknown');
    expect(classifyLegacyMediaItemProvenance({ url: '   ' }, LOCAL)).toBe('unknown');
  });
});
