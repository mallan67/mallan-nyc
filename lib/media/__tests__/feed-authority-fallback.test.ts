/**
 * FEED-authority fallback — the seven locked acceptance cases plus the batching proofs.
 *
 * DEFECT: `shouldFallbackToLegacyMedia` let EVERY third-party listing replay its legacy
 * `Listing.media` JSON, on the premise that Cotality-sourced JSON is always safe. Provenance is
 * not current truth: when the provider deletes the photos, the canonical lane tombstones the
 * relational rows and the reader then republishes the stale gallery. Verified live on RLS20082303
 * (2026-08-15): provider PhotosCount 0, Media count 0 even unfiltered, 20 `listing_media` rows all
 * `deleted`, 20 stale legacy items still rendering.
 *
 * THE REJECTED SHORTCUT: `hadRelationalRows !== true`. That signal counts `crm:` supplemental
 * history together with feed history, so a third-party listing whose Cotality gallery lives only in
 * the legacy JSON, and which once had since-deleted CRM rows, would lose a valid gallery. Case 3
 * below is that exact scenario and fails under the shortcut.
 */
import {
  shouldFallbackToLegacyMedia,
  resolveDbListingMedia,
  type MediaFallbackContext,
} from '@/lib/media/listing-media-resolver';
import {
  needsFeedAuthorityLookup,
  fetchFeedMediaAuthority,
  resolveFeedAuthorityForPage,
  FEED_MEDIA_WHERE,
  type FeedAuthorityDb,
} from '@/lib/media/feed-media-authority';

const THIRD_PARTY: MediaFallbackContext = { listingId: 'RLS20082303', rlsEligible: true };
const MALLAN: MediaFallbackContext = { listingId: 'SL-0001', rlsEligible: false };

const feedRow = (status: string, i = 0) => ({
  media_key: `200567983492${i}`,
  status,
  media_url_original: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1157003490/${i}/A/B/C`,
  media_url_cached: null,
  media_type: 'Photo',
  media_category: 'Photo',
  media_classification: null,
  order: i,
  preferred_photo_yn: false,
});
const crmRow = (status: string, i = 0) => ({ ...feedRow(status, i), media_key: `crm:upload-${i}` });
const legacyJson = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    url: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1157003490/${i}/A/B/STALE`,
    mediaType: 'Photo',
    order: i,
  }));

// ─── The seven locked cases ────────────────────────────────────────────────────────────────────

describe('feed authority — locked acceptance cases', () => {
  it('1. third-party + deleted historical FEED rows + stale legacy => EMPTY (no resurrection)', () => {
    const rows = [feedRow('deleted', 0), feedRow('deleted', 1)];
    const out = resolveDbListingMedia(rows as never, legacyJson(20), THIRD_PARTY, {
      hadRelationalRows: true,
      hadFeedRelationalRows: true,
    });
    expect(out).toHaveLength(0);
    expect(shouldFallbackToLegacyMedia(true, THIRD_PARTY, true)).toBe(false);
  });

  it('2. third-party + NEVER-imported feed + legacy => legacy IS shown (the 134 residuals)', () => {
    const out = resolveDbListingMedia([] as never, legacyJson(5), THIRD_PARTY, {
      hadRelationalRows: false,
      hadFeedRelationalRows: false,
    });
    expect(out).toHaveLength(5);
    expect(shouldFallbackToLegacyMedia(false, THIRD_PARTY, false)).toBe(true);
  });

  it('3. third-party + historical CRM-ONLY rows (no feed ever) + legacy => legacy STILL shown', () => {
    // THE CASE THE ONE-LINE `hadRelationalRows !== true` FIX WOULD HAVE BROKEN:
    // relational history exists (crm:), but no feed row was ever materialized.
    const rows = [crmRow('deleted', 0)];
    const out = resolveDbListingMedia(rows as never, legacyJson(7), THIRD_PARTY, {
      hadRelationalRows: true, // rows DID exist...
      hadFeedRelationalRows: false, // ...but none of them were feed rows
    });
    expect(out).toHaveLength(7);
    expect(shouldFallbackToLegacyMedia(true, THIRD_PARTY, false)).toBe(true);
  });

  it('4. third-party + ACTIVE crm: supplement + legacy feed gallery => MERGED, unchanged', () => {
    const rows = [crmRow('active', 0)];
    const out = resolveDbListingMedia(rows as never, legacyJson(3), THIRD_PARTY, {
      hadRelationalRows: true,
      hadFeedRelationalRows: false,
    });
    // 3 legacy + 1 CRM supplement — the supplement must not hide the Cotality gallery.
    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBe(4);
  });

  it('5. Mallan-owned + all-deleted rows => EMPTY (existing rule UNCHANGED)', () => {
    const rows = [crmRow('deleted', 0)];
    const out = resolveDbListingMedia(rows as never, legacyJson(4), MALLAN, {
      hadRelationalRows: true,
    });
    expect(out).toHaveLength(0);
    // Mallan behaviour must not consult the feed signal at all.
    expect(shouldFallbackToLegacyMedia(true, MALLAN, undefined)).toBe(false);
    expect(shouldFallbackToLegacyMedia(true, MALLAN, false)).toBe(false);
    expect(shouldFallbackToLegacyMedia(false, MALLAN, true)).toBe(true);
  });

  it('6. the RLS20082303 shape specifically: 20 deleted feed rows + 20 stale legacy => EMPTY', () => {
    const rows = Array.from({ length: 20 }, (_, i) => feedRow('deleted', i));
    const out = resolveDbListingMedia(rows as never, legacyJson(20), THIRD_PARTY, {
      hadRelationalRows: true,
      hadFeedRelationalRows: true,
    });
    expect(out).toHaveLength(0);
  });

  it('7. third-party + deleted FEED rows + ACTIVE crm: supplement => supplement ONLY, no legacy replay', () => {
    const rows = [feedRow('deleted', 0), feedRow('deleted', 1), crmRow('active', 2)];
    const out = resolveDbListingMedia(rows as never, legacyJson(20), THIRD_PARTY, {
      hadRelationalRows: true,
      hadFeedRelationalRows: true,
    });
    // Exactly the CRM supplement — the 20 stale Cotality photos must NOT come back.
    expect(out).toHaveLength(1);
  });
});

// ─── Unknown must preserve today's behaviour ───────────────────────────────────────────────────

describe('unknown signal is fail-open to CURRENT behaviour, never invented', () => {
  it('third-party + undefined feed signal => fallback preserved (callers not yet adopted)', () => {
    expect(shouldFallbackToLegacyMedia(true, THIRD_PARTY, undefined)).toBe(true);
    expect(shouldFallbackToLegacyMedia(undefined, THIRD_PARTY, undefined)).toBe(true);
    const out = resolveDbListingMedia([] as never, legacyJson(6), THIRD_PARTY, {});
    expect(out).toHaveLength(6);
  });

  it('an ACTIVE feed row remains authoritative regardless of the signal', () => {
    const rows = [feedRow('active', 0), feedRow('active', 1)];
    const out = resolveDbListingMedia(rows as never, legacyJson(20), THIRD_PARTY, {
      hadRelationalRows: true,
      hadFeedRelationalRows: true,
    });
    expect(out).toHaveLength(2); // relational wins; legacy never replayed
  });
});

// ─── Batching / N+1 proofs ─────────────────────────────────────────────────────────────────────

function stubDb(idsWithFeedHistory: string[]) {
  const calls: Array<{ where: unknown }> = [];
  const db: FeedAuthorityDb = {
    listingMedia: {
      async findMany(args) {
        calls.push({ where: args.where });
        return idsWithFeedHistory.map((id) => ({ listing: { listing_id: id } }));
      },
    },
  };
  return { db, calls };
}

describe('batched authority lookup — one query per page, never N', () => {
  it('a page of ambiguous listings issues exactly ONE query', async () => {
    const { db, calls } = stubDb(['A', 'C']);
    const page = ['A', 'B', 'C', 'D', 'E'].map((id) => ({
      ctx: { listingId: id, rlsEligible: true } as MediaFallbackContext,
      tableRows: [] as Array<{ status?: string | null; media_key?: string | null }>,
    }));
    const map = await resolveFeedAuthorityForPage(db, page);
    expect(calls).toHaveLength(1);
    expect(map.get('A')).toBe(true);
    expect(map.get('B')).toBe(false);
    expect(map.get('C')).toBe(true);
    expect(map.get('E')).toBe(false);
  });

  it('ZERO queries when every listing already has an ACTIVE feed row', async () => {
    const { db, calls } = stubDb([]);
    const page = ['A', 'B'].map((id) => ({
      ctx: { listingId: id, rlsEligible: true } as MediaFallbackContext,
      tableRows: [{ status: 'active', media_key: '2005679834920' }],
    }));
    const map = await resolveFeedAuthorityForPage(db, page);
    expect(calls).toHaveLength(0);
    expect(map.get('A')).toBe(true); // proven without a read
  });

  it('Mallan-owned listings are NEVER queried and stay undefined', async () => {
    const { db, calls } = stubDb([]);
    const map = await resolveFeedAuthorityForPage(db, [
      { ctx: MALLAN, tableRows: [] },
    ]);
    expect(calls).toHaveLength(0);
    expect(map.get('SL-0001')).toBeUndefined();
    expect(needsFeedAuthorityLookup(MALLAN, [])).toBe(false);
  });

  it('no ids => no query at all', async () => {
    const { db, calls } = stubDb([]);
    expect((await fetchFeedMediaAuthority(db, [])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('a failed lookup PROPAGATES and is never coerced to false', async () => {
    const db: FeedAuthorityDb = {
      listingMedia: {
        async findMany() {
          throw new Error('connection terminated');
        },
      },
    };
    // `false` would mean "feed never materialized" and PERMIT the stale legacy fallback.
    await expect(fetchFeedMediaAuthority(db, ['A'])).rejects.toThrow(/connection terminated/);
    await expect(
      resolveFeedAuthorityForPage(db, [{ ctx: THIRD_PARTY, tableRows: [] }]),
    ).rejects.toThrow(/connection terminated/);
  });
});

// ─── The nullable media_key trap ───────────────────────────────────────────────────────────────

describe('FEED_MEDIA_WHERE matches isCrmMediaKey semantics, including NULL', () => {
  it('explicitly includes null media_key rows', () => {
    // `ListingMedia.media_key` is String? and isCrmMediaKey(null) === false → a null key is a FEED
    // row. A bare NOT startsWith would drop nulls (SQL three-valued logic: NULL LIKE 'crm:%' is
    // NULL, so NOT(...) does not match), making the DB disagree with the resolver.
    const clauses = JSON.stringify(FEED_MEDIA_WHERE);
    expect(clauses).toContain('"media_key":null');
    expect(clauses).toContain('crm:');
  });
});
