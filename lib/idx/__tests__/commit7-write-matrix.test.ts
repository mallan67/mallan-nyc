/**
 * COMMIT 7 — WRITE / INVALIDATION MATRIX (7B-3).
 *
 * The core of commit 7 is that THREE cases stay distinct and are not collapsed:
 *
 *   CASE 1  PCT only + complete UNCHANGED media
 *             -> Listing write 0, media write 0, invalidation 0
 *   CASE 2  PCT only + complete AUTHORITATIVE zero media
 *             -> Listing content write 0, media CLEAR yes, invalidation yes
 *                (cause = the media change, NOT the PCT movement)
 *   CASE 3  PCT + a real Listing content change
 *             -> Listing material write yes
 *
 * Case 2 is the one that makes case 1 safe: suppressing the PCT write is only
 * acceptable because an emptied gallery is now reconciled by a different, proven
 * mechanism (7B-1 completeness + pre-seed, 7B-2A shared invalidation).
 *
 * These assert the DECISION FUNCTIONS directly, deterministically and without a
 * database. The end-to-end integration through `syncListings` is proven in
 * tests/runtime/sync-change-attribution-behavior.test.ts.
 *
 * WAL / dead-tuple production effect = PENDING INTEGRATED MEASUREMENT. No
 * disposable-Postgres numbers are fabricated here.
 */

import {
  listingUpdateMateriallyUnchanged,
  rawDataMateriallyEqual,
  mediaArraysMateriallyEqual,
  changedRawDataMaterialKeys,
} from '../write-suppression';
import { classifyListingChangeReasons } from '../write-suppression';
import { publicListingChangeTags } from '@/lib/cache/public-listing-change-tags';

const ADDR = {
  StreetNumber: '519', StreetName: 'Monroe Street', City: 'New York City',
  StateOrProvince: 'NY', PostalCode: '11221',
};

const RAW = {
  ListingId: 'RLS20105333',
  StandardStatus: 'Active',
  ListPrice: 2295000,
  PublicRemarks: 'A home.',
  ModificationTimestamp: '2026-07-01T00:00:00Z',
  PhotosChangeTimestamp: '2026-07-10T00:00:00Z',
};

const photo = (n: number, sig = 'AAA') => ({
  url: `https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/117801${n}/1/A/B/C?sig=${sig}`,
  mediaType: 'photo',
  order: n,
});
const SIXTY_SEVEN = Array.from({ length: 67 }, (_, i) => photo(i));

/** Compact record of one matrix row. */
interface Row {
  listingWrite: boolean;
  rawDataWrite: boolean;
  legacyMediaWrite: boolean;
  invalidations: number;
}

function evaluate(
  existingRaw: Record<string, unknown>,
  incomingRaw: Record<string, unknown>,
  storedMedia: unknown,
  authoritativeMedia: unknown | null, // null = incomplete fetch
): Row {
  const listingUnchanged = listingUpdateMateriallyUnchanged(
    { raw_data: incomingRaw },
    { raw_data: existingRaw },
  );
  // Incomplete fetch => the batch performs NO reconciliation at all (7B-1).
  const mediaChanged =
    authoritativeMedia !== null &&
    !mediaArraysMateriallyEqual(storedMedia as never, authoritativeMedia as never);
  const listingWrite = !listingUnchanged;
  const invalidations =
    listingWrite || mediaChanged
      ? publicListingChangeTags('RLS20105333', ADDR, ADDR).tags.length
      : 0;
  return {
    listingWrite,
    rawDataWrite: listingWrite, // raw_data rides the Listing upsert
    legacyMediaWrite: mediaChanged,
    invalidations,
  };
}

describe('CASE 1 — PCT only + complete UNCHANGED media', () => {
  const r = evaluate(
    RAW,
    { ...RAW, PhotosChangeTimestamp: '2026-07-20T00:00:00Z' },
    SIXTY_SEVEN,
    SIXTY_SEVEN,
  );

  it('Listing write = 0', () => expect(r.listingWrite).toBe(false));
  it('raw_data write = 0', () => expect(r.rawDataWrite).toBe(false));
  it('legacy media write = 0', () => expect(r.legacyMediaWrite).toBe(false));
  it('listing/building/manifest invalidations = 0', () => expect(r.invalidations).toBe(0));
  it('no change reason is attributed', () => {
    expect(
      classifyListingChangeReasons(
        { raw_data: { ...RAW, PhotosChangeTimestamp: '2026-07-20T00:00:00Z' } },
        { raw_data: RAW },
      ),
    ).toEqual([]);
  });
});

describe('CASE 2 — PCT only + complete AUTHORITATIVE zero media', () => {
  const r = evaluate(
    RAW,
    { ...RAW, PhotosChangeTimestamp: '2026-07-20T00:00:00Z' },
    SIXTY_SEVEN,
    [], // proven-complete empty (7B-1 pre-seed)
  );

  it('Listing content write = 0 — PCT alone still writes nothing', () => {
    expect(r.listingWrite).toBe(false);
  });

  it('legacy media CLEAR happens — the emptied gallery IS reconciled', () => {
    expect(r.legacyMediaWrite).toBe(true);
  });

  it('invalidation FIRES, caused by the MEDIA change and not the PCT movement', () => {
    expect(r.invalidations).toBeGreaterThan(1); // listing + shard, not listing alone
  });

  it('this is what makes CASE 1 safe', () => {
    // If this were false, suppressing the PCT write in CASE 1 would have removed
    // the only reconciliation signal for an emptied gallery.
    expect(r.legacyMediaWrite).toBe(true);
  });
});

describe('CASE 3 — PCT + a real Listing content change', () => {
  it('ListPrice alongside PCT => material write', () => {
    const r = evaluate(
      RAW,
      { ...RAW, PhotosChangeTimestamp: '2026-07-20T00:00:00Z', ListPrice: 1995000 },
      SIXTY_SEVEN,
      SIXTY_SEVEN,
    );
    expect(r.listingWrite).toBe(true);
    expect(r.invalidations).toBeGreaterThan(0);
  });

  it('PublicRemarks alongside PCT => material write, attributed correctly', () => {
    const incoming = { ...RAW, PhotosChangeTimestamp: '2026-07-20T00:00:00Z', PublicRemarks: 'New roof' };
    expect(evaluate(RAW, incoming, SIXTY_SEVEN, SIXTY_SEVEN).listingWrite).toBe(true);
    expect(changedRawDataMaterialKeys(RAW, incoming)).toEqual(['PublicRemarks']);
  });

  it('StandardStatus alongside PCT => material write', () => {
    const incoming = { ...RAW, PhotosChangeTimestamp: '2026-07-20T00:00:00Z', StandardStatus: 'Closed' };
    expect(evaluate(RAW, incoming, SIXTY_SEVEN, SIXTY_SEVEN).listingWrite).toBe(true);
  });
});

describe('CASE 10 — INCOMPLETE fetch that LOOKS empty', () => {
  const r = evaluate(
    RAW,
    { ...RAW, PhotosChangeTimestamp: '2026-07-20T00:00:00Z' },
    SIXTY_SEVEN,
    null, // completeness NOT proven
  );

  it('NO media clear', () => expect(r.legacyMediaWrite).toBe(false));
  it('NO Listing write', () => expect(r.listingWrite).toBe(false));
  it('NO destructive invalidation', () => expect(r.invalidations).toBe(0));
  it('differs from CASE 2 purely by proven completeness', () => {
    const complete = evaluate(RAW, { ...RAW, PhotosChangeTimestamp: 'X' }, SIXTY_SEVEN, []);
    expect(complete.legacyMediaWrite).toBe(true);
    expect(r.legacyMediaWrite).toBe(false);
  });
});

describe('CASES 6/7/11/12/13 — media identity semantics', () => {
  it('6. one photo ADDED => material', () => {
    expect(mediaArraysMateriallyEqual(SIXTY_SEVEN, [...SIXTY_SEVEN, photo(67)])).toBe(false);
  });

  it('7. one photo REMOVED => material', () => {
    expect(mediaArraysMateriallyEqual(SIXTY_SEVEN, SIXTY_SEVEN.slice(0, 66))).toBe(false);
  });

  it('11. signed locator rotation ONLY => NOT material, no duplicate asset', () => {
    const rotated = SIXTY_SEVEN.map((_, i) => photo(i, 'ZZZ'));
    expect(mediaArraysMateriallyEqual(SIXTY_SEVEN, rotated)).toBe(true);
  });

  it('11b. rotation inside raw_data is likewise NOT material', () => {
    const a = { ...RAW, Media: [{ MediaURL: 'https://api.cotality.com/x.jpg?sig=AAA', Order: 0 }] };
    const b = { ...RAW, Media: [{ MediaURL: 'https://api.cotality.com/x.jpg?sig=ZZZ', Order: 0 }] };
    expect(rawDataMateriallyEqual(a, b)).toBe(true);
  });

  it('13. a real MediaKey/path change => material', () => {
    const a = { ...RAW, Media: [{ MediaURL: 'https://api.cotality.com/A.jpg?sig=AAA', Order: 0 }] };
    const b = { ...RAW, Media: [{ MediaURL: 'https://api.cotality.com/B.jpg?sig=AAA', Order: 0 }] };
    expect(rawDataMateriallyEqual(a, b)).toBe(false);
  });
});

describe('CASE 2b — second identical cycle after any of the above', () => {
  it('re-running an unchanged cycle writes nothing', () => {
    const r = evaluate(RAW, { ...RAW }, SIXTY_SEVEN, SIXTY_SEVEN);
    expect(r.listingWrite).toBe(false);
    expect(r.legacyMediaWrite).toBe(false);
    expect(r.invalidations).toBe(0);
  });

  it('after an authoritative clear, the NEXT complete-empty cycle writes nothing', () => {
    const r = evaluate(RAW, { ...RAW }, [], []);
    expect(r.legacyMediaWrite).toBe(false);
    expect(r.invalidations).toBe(0);
  });
});
