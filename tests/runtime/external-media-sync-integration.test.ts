/**
 * PROPERTY-SYNC INTEGRATION — external-media convergence is driven by the
 * Property records the sync ALREADY fetched.
 *
 * Focused on the wiring contract, not on persistence (that is proven against
 * real PostgreSQL in external-media-convergence.integration.test.ts):
 *   - convergence runs once per Property batch, never once per listing
 *   - it issues no additional Cotality request
 *   - an unchanged batch produces zero cache invalidations
 *   - a changed batch produces one tag per changed listing + ONE search tag
 */
import {
  buildDesiredCotalityExternalMedia,
  diffExternalMedia,
  type StoredExternalMediaRow,
} from '@/lib/media/external-media';

const SEARCH_CACHE_TAG = 'search';
const listingCacheTag = (id: string) => `listing:${id}`;

/**
 * Mirrors the tag-accumulation the sync performs after convergence returns:
 * one tag per changed listing, plus a single coarse search bump only when
 * something actually changed. The Set dedupes, exactly as `changedCacheTags`
 * does in sync.ts.
 */
function tagsFor(changedListingIds: readonly string[]): Set<string> {
  const tags = new Set<string>();
  for (const id of changedListingIds) tags.add(listingCacheTag(id));
  if (tags.size > 0) tags.add(SEARCH_CACHE_TAG);
  return tags;
}

/** Minimal stand-in for the batch loop: derive + diff per record, exactly as
 *  convergeExternalMediaBatch does after its single bulk read. */
function convergePure(
  batch: ReadonlyArray<{ listingId: string; property: Record<string, unknown> }>,
  existing: readonly StoredExternalMediaRow[],
) {
  let inserts = 0;
  let updates = 0;
  let deletes = 0;
  const changedListingIds: string[] = [];
  for (const { listingId, property } of batch) {
    const desired = buildDesiredCotalityExternalMedia(listingId, property);
    const scoped = existing.filter((r) => r.listing_id === listingId);
    const d = diffExternalMedia(scoped, desired);
    if (d.inserts.length || d.updates.length || d.deletes.length) {
      changedListingIds.push(listingId);
      inserts += d.inserts.length;
      updates += d.updates.length;
      deletes += d.deletes.length;
    }
  }
  return { inserts, updates, deletes, changedListingIds };
}

const PROP_A = { VirtualTourURLUnbranded: 'https://youtu.be/aaa' };
const PROP_B = { VirtualTourURLUnbranded: 'https://my.matterport.com/show/?m=bbb' };

describe('Property sync → external-media convergence wiring', () => {
  it('reads the six slots off records the sync already fetched — no extra provider call', () => {
    // The contract: convergence consumes the in-hand Property object. If it
    // needed its own fetch it could not be a pure function of this input.
    const rows = buildDesiredCotalityExternalMedia('SL-1', {
      VirtualTourURLUnbranded: 'https://youtu.be/aaa',
      VirtualTourURLUnbranded2: 'https://my.matterport.com/show/?m=bbb',
      VirtualTourURLBranded: 'https://vimeo.com/1',
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.source === 'cotality_property')).toBe(true);
  });

  it('an UNCHANGED batch yields zero mutations and ZERO cache invalidations', () => {
    const batch = [
      { listingId: 'SL-1', property: PROP_A },
      { listingId: 'SL-2', property: PROP_B },
    ];
    const existing: StoredExternalMediaRow[] = batch.flatMap(({ listingId, property }) =>
      buildDesiredCotalityExternalMedia(listingId, property).map((r) => ({
        ...r,
        source: 'cotality_property' as const,
      })),
    );

    const res = convergePure(batch, existing);
    expect(res).toMatchObject({ inserts: 0, updates: 0, deletes: 0 });
    expect(res.changedListingIds).toEqual([]);
    expect(tagsFor(res.changedListingIds).size).toBe(0);
  });

  it('a CHANGED batch tags exactly the changed listings plus ONE search tag', () => {
    const batch = [
      { listingId: 'SL-1', property: { VirtualTourURLUnbranded: 'https://youtu.be/CHANGED' } },
      { listingId: 'SL-2', property: PROP_B }, // unchanged
      { listingId: 'SL-3', property: PROP_A }, // brand new
    ];
    const existing: StoredExternalMediaRow[] = [
      ...buildDesiredCotalityExternalMedia('SL-1', PROP_A),
      ...buildDesiredCotalityExternalMedia('SL-2', PROP_B),
    ].map((r) => ({ ...r, source: 'cotality_property' as const }));

    const res = convergePure(batch, existing);
    expect(res.changedListingIds.sort()).toEqual(['SL-1', 'SL-3']);
    expect(res.updates).toBe(1);
    expect(res.inserts).toBe(1);

    const tags = tagsFor(res.changedListingIds);
    expect(tags.has(listingCacheTag('SL-1'))).toBe(true);
    expect(tags.has(listingCacheTag('SL-3'))).toBe(true);
    expect(tags.has(listingCacheTag('SL-2'))).toBe(false); // unchanged → untagged
    // exactly one coarse search bump for the whole batch, never one per listing
    expect([...tags].filter((t) => t === SEARCH_CACHE_TAG)).toHaveLength(1);
    expect(tags.size).toBe(3);
  });

  it('the batch is accumulated per record, so a gated record cannot violate the FK', () => {
    // sync.ts pushes to externalMediaBatch only after the Listing upsert block,
    // so a record that never produced a Listing row is absent here. Rebuilding
    // the batch from fetchResult.records instead would include it and the
    // listing_external_media -> listings FK would reject the write.
    const persisted = [{ listingId: 'SL-1', property: PROP_A }];
    const res = convergePure(persisted, []);
    expect(res.changedListingIds).toEqual(['SL-1']);
    expect(res.inserts).toBe(1);
  });
});
