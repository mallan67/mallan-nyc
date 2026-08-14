/**
 * COMMIT 7B-2B — `raw_data.PhotosChangeTimestamp` is deprecated provenance.
 *
 * WHY IT COULD BE DEPRECATED
 * --------------------------
 * Its last stored-value consumer was the SQL eligibility predicate in
 * `backfillEmptyMedia()`, which is UNREACHABLE legacy code — its only caller,
 * `/api/cron/media-backfill`, was removed by PR #176 on 2026-05-21 (pinned by
 * tests/runtime/backfill-empty-media-reachability.test.ts).
 *
 * PCT freshness is owned end-to-end by the canonical chain:
 *   Property.PhotosChangeTimestamp
 *     -> incremental source trigger (fetch.ts:391 — MT gt T OR PCT gt T)
 *     -> complete, pre-seeded batch media reconciliation (7B-1)
 *     -> media-sync PCT keyset cursor (media_sync_state.last_photos_change)
 *
 * THE MIGRATION HAZARD THIS PREVENTS
 * ----------------------------------
 * Historical rows still physically contain the key and NO cleanup backfill is
 * authorised. If a legacy row did not compare EQUAL to a canonical slim row,
 * the first deployment would rewrite the entire table purely to drop a key.
 * So the key is canonicalized away on BOTH sides.
 *
 * SCOPE DISCIPLINE
 * ----------------
 * This is ONE named key — not "timestamps are non-material". Every other clock
 * stays fully material, asserted below.
 */

import {
  rawDataMateriallyEqual,
  listingUpdateMateriallyUnchanged,
  changedMaterialListingFields,
  changedRawDataMaterialKeys,
} from '../write-suppression';
import { RAW_DATA_KEEP_FIELDS } from '@/lib/compliance/raw-data-keep-fields';

const BASE = {
  ListingId: 'RLS20105333',
  ListPrice: 2295000,
  StandardStatus: 'Active',
  PublicRemarks: 'A home.',
  ModificationTimestamp: '2026-07-01T00:00:00Z',
};

describe('the deprecated key is canonicalized away on BOTH sides', () => {
  it('legacy row WITH the key equals a canonical slim row WITHOUT it', () => {
    expect(
      rawDataMateriallyEqual(
        { ...BASE, PhotosChangeTimestamp: '2026-07-10T00:00:00Z' },
        { ...BASE },
      ),
    ).toBe(true);
  });

  it('the reverse direction is also equal (order must not matter)', () => {
    expect(
      rawDataMateriallyEqual(
        { ...BASE },
        { ...BASE, PhotosChangeTimestamp: '2026-07-10T00:00:00Z' },
      ),
    ).toBe(true);
  });

  it('PCT moving T1 -> T2 with all else unchanged is NOT a material change', () => {
    expect(
      rawDataMateriallyEqual(
        { ...BASE, PhotosChangeTimestamp: '2026-07-10T00:00:00Z' },
        { ...BASE, PhotosChangeTimestamp: '2026-07-20T00:00:00Z' },
      ),
    ).toBe(true);
  });

  it('works when the row carries NO Media array (the early-return path)', () => {
    // canonicalizeRawDataMedia returns early when Media is absent; the key must
    // still be stripped, or rows without media would never compare equal.
    const a = { ListingId: 'X', PhotosChangeTimestamp: 'T1' };
    const b = { ListingId: 'X' };
    expect(rawDataMateriallyEqual(a, b)).toBe(true);
  });
});

describe('SCOPE — nothing else became non-material', () => {
  it('ModificationTimestamp is STILL material', () => {
    expect(
      rawDataMateriallyEqual(
        { ...BASE, ModificationTimestamp: '2026-07-01T00:00:00Z' },
        { ...BASE, ModificationTimestamp: '2026-07-02T00:00:00Z' },
      ),
    ).toBe(false);
  });

  it('a real content change is STILL material alongside a PCT move', () => {
    expect(
      rawDataMateriallyEqual(
        { ...BASE, PublicRemarks: 'A home.', PhotosChangeTimestamp: 'T1' },
        { ...BASE, PublicRemarks: 'A LOVELY home.', PhotosChangeTimestamp: 'T2' },
      ),
    ).toBe(false);
  });

  it('price / status remain material', () => {
    expect(rawDataMateriallyEqual({ ...BASE }, { ...BASE, ListPrice: 1 })).toBe(false);
    expect(rawDataMateriallyEqual({ ...BASE }, { ...BASE, StandardStatus: 'Closed' })).toBe(false);
  });

  it('only ONE key is deprecated — other *ChangeTimestamp fields stay material', () => {
    expect(
      rawDataMateriallyEqual(
        { ...BASE, DocumentsChangeTimestamp: 'T1' },
        { ...BASE, DocumentsChangeTimestamp: 'T2' },
      ),
    ).toBe(false);
  });
});

describe('ALL FIVE SEMANTIC SURFACES AGREE (suppressor == diagnostics)', () => {
  const existing = { raw_data: { ...BASE, PhotosChangeTimestamp: 'T1' } };
  const incoming = { raw_data: { ...BASE, PhotosChangeTimestamp: 'T2' } };

  it('listingUpdateMateriallyUnchanged -> unchanged (write suppressed)', () => {
    expect(listingUpdateMateriallyUnchanged(incoming, existing)).toBe(true);
  });

  it('changedMaterialListingFields -> raw_data NOT reported as changed', () => {
    expect(changedMaterialListingFields(incoming, existing)).not.toContain('raw_data');
  });

  it('changedRawDataMaterialKeys -> PhotosChangeTimestamp NOT reported', () => {
    const keys = changedRawDataMaterialKeys(existing.raw_data, incoming.raw_data);
    expect(keys).not.toContain('PhotosChangeTimestamp');
    expect(keys).toEqual([]);
  });

  it('the diagnostic and the suppressor cannot disagree — a real change IS reported by both', () => {
    const changed = { raw_data: { ...BASE, PublicRemarks: 'Changed', PhotosChangeTimestamp: 'T2' } };
    expect(listingUpdateMateriallyUnchanged(changed, existing)).toBe(false);
    expect(changedRawDataMaterialKeys(existing.raw_data, changed.raw_data)).toContain('PublicRemarks');
  });
});

describe('the retention contract no longer persists it', () => {
  it('PhotosChangeTimestamp is not in RAW_DATA_KEEP_FIELDS', () => {
    expect([...RAW_DATA_KEEP_FIELDS]).not.toContain('PhotosChangeTimestamp');
  });

  it('the genuinely-named media consumers are still kept', () => {
    const keep = [...RAW_DATA_KEEP_FIELDS];
    expect(keep).toContain('Media'); // compliance audit photo count
    expect(keep).toContain('VirtualTourURLBranded'); // public DTO
    expect(keep).toContain('VirtualTourURLUnbranded');
  });
});

describe('the legacy SQL consumer is gone', () => {
  it('backfillEmptyMedia no longer selects on stored raw_data PCT', () => {
    const raw = require('fs')
      .readFileSync(require('path').resolve(__dirname, '../sync.ts'), 'utf8')
      .replace(/\r\n?/g, '\n');
    // Comment-stripped: the removal is DOCUMENTED in a comment that quotes the
    // old predicate, so a raw grep would match our own explanation rather than
    // live code.
    const code = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toContain("raw_data->>'PhotosChangeTimestamp'");
    expect(code).not.toContain("raw_data ? 'PhotosChangeTimestamp'");
  });

  it('the PCT source trigger now lives in the MEDIA lane, not the Property filter', () => {
    // SUPERSEDED 2026-08-13. This assertion used to read
    // `expect(fetchSrc).toContain('PhotosChangeTimestamp gt')` and was GREEN ON A
    // FALSE PREMISE: the Property filter had already dropped PCT, and the only
    // surviving occurrence of that string in fetch.ts is inside the block comment
    // explaining the removal. A source-text grep cannot tell code from the
    // comment describing its deletion.
    //
    // The real invariant is unchanged in substance — PCT must still drive media
    // freshness — but its OWNER moved. Property keeps the material clock; the
    // media lane keeps the photo clock. So assert against the owner, and assert
    // BEHAVIOURALLY on the Property side rather than by grepping prose.
    const {
      buildIncrementalFilter,
    } = require('../fetch') as typeof import('../fetch');

    // Property: PCT is gone from the actual emitted filter, in every arg shape.
    const since = new Date('2026-05-01T00:00:00.000Z');
    expect(buildIncrementalFilter(since)).not.toContain('PhotosChangeTimestamp');
    expect(buildIncrementalFilter(since, 'sale')).not.toContain('PhotosChangeTimestamp');
    expect(buildIncrementalFilter(since, 'rent', 'K1')).not.toContain('PhotosChangeTimestamp');

    // Media lane: PCT is still the source trigger, and still keyset-ordered.
    const mediaSrc = require('fs')
      .readFileSync(require('path').resolve(__dirname, '../media-sync.ts'), 'utf8');
    expect(mediaSrc).toContain('PhotosChangeTimestamp gt');
    expect(mediaSrc).toContain('PhotosChangeTimestamp asc,ListingKey asc');
  });
});
