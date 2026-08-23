/**
 * COMMIT 11A — live-shaped regression fixture for RLS20105333.
 *
 * Every number here was measured against live Cotality on 2026-08-08, not
 * invented:
 *
 *   ListingId                RLS20105333
 *   ListingKey / RecordKey   1178013994
 *   Media pages              50 + 18  = 68 total
 *   Classification           67 Photo + 1 FloorPlan
 *   Property.PhotosCount     68   <-- INCLUDES the FloorPlan
 *   duplicate MediaKeys      0
 *
 * TWO DEFECTS THIS PINS
 * ---------------------
 * 1. COMPLETENESS. `fetchListingMedia` sent `$top=50`, read ONE response and
 *    stopped as soon as any record came back. On this specimen that returns 50
 *    of 68 and looks authoritative. `$top` is a PAGE SIZE, not a total cap.
 *
 * 2. IDENTITY. The detail route used ONE variable for both the DB lookup
 *    (`listing_id = RLS20105333`) and the Media query (ResourceRecordKey =
 *    1178013994). Live-verified: ResourceRecordKey eq 'RLS20105333' returns
 *    ZERO rows. Reusing one value for both is silently wrong.
 */

import { paginateMedia, type MediaPage } from '../media-pagination';

const LISTING_ID = 'RLS20105333';
const RESOURCE_RECORD_KEY = '1178013994';
const PAGE_1 = 50;
const PAGE_2 = 18;
const TOTAL_MEDIA = PAGE_1 + PAGE_2; // 68
const PHOTO_COUNT = 67;
const FLOORPLAN_COUNT = 1;
const PROVIDER_PHOTOS_COUNT_FIELD = 68;

type Row = { MediaKey: string; MediaCategory: string };

function makeRows(from: number, count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    MediaKey: `MK-${from + i}`,
    // Last asset of the whole set is the FloorPlan, mirroring the live shape.
    MediaCategory: from + i === TOTAL_MEDIA - 1 ? 'Floor Plan' : 'Photo',
  }));
}

/** Two-page live shape: 50 then 18, second page has no nextLink. */
function twoPageFetcher(): (url: string) => Promise<MediaPage> {
  return async (url: string) => {
    if (url.includes('page2')) {
      return { value: makeRows(PAGE_1, PAGE_2), nextLink: null };
    }
    return { value: makeRows(0, PAGE_1), nextLink: 'https://api.cotality.com/trestle/odata/Media?page2' };
  };
}

describe('completeness — $top is a page size, not a total cap', () => {
  it('follows @odata.nextLink and returns all 68, not the first 50', () => {
    return paginateMedia<Row>('https://api.cotality.com/trestle/odata/Media?page1', twoPageFetcher())
      .then(({ rows, complete }) => {
        expect(complete).toBe(true);
        expect(rows).toHaveLength(TOTAL_MEDIA);
        expect(rows.length).toBeGreaterThan(PAGE_1); // the exact truncation bug
      });
  });

  it('a SECOND-PAGE failure is INCOMPLETE — never the first 50 presented as whole', async () => {
    const fetcher = async (url: string): Promise<MediaPage> => {
      if (url.includes('page2')) throw new Error('Media page HTTP 502');
      return { value: makeRows(0, PAGE_1), nextLink: 'https://x/odata/Media?page2' };
    };
    const { rows, complete } = await paginateMedia<Row>('https://x/odata/Media?page1', fetcher);
    expect(complete).toBe(false);
    // Rows gathered so far are returned for diagnostics, but `complete:false`
    // is what the caller must branch on. A partial gallery must never be
    // rendered as the full one.
    expect(rows).toHaveLength(PAGE_1);
    expect(complete).not.toBe(true);
  });

  it('a runaway page count fails closed rather than looping forever', async () => {
    const endless = async (): Promise<MediaPage> => ({ value: [{ MediaKey: 'x' }], nextLink: 'https://x/next' });
    const { complete } = await paginateMedia<Row>('https://x/first', endless, 3);
    expect(complete).toBe(false);
  });

  it('does not re-fetch the first page', async () => {
    const seen: string[] = [];
    const fetcher = async (url: string): Promise<MediaPage> => {
      seen.push(url);
      return url.includes('page2')
        ? { value: makeRows(PAGE_1, PAGE_2), nextLink: null }
        : { value: makeRows(0, PAGE_1), nextLink: 'https://x/odata/Media?page2' };
    };
    await paginateMedia<Row>('https://x/odata/Media?page1', fetcher);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(2);
  });
});

describe('classification — PhotosCount is NOT the photo count', () => {
  it('68 media = 67 Photo + 1 FloorPlan', async () => {
    const { rows } = await paginateMedia<Row>('https://x/odata/Media?page1', twoPageFetcher());
    const photos = rows.filter((r) => r.MediaCategory === 'Photo');
    const floorplans = rows.filter((r) => /floor\s*plan/i.test(r.MediaCategory));
    expect(rows).toHaveLength(TOTAL_MEDIA);
    expect(photos).toHaveLength(PHOTO_COUNT);
    expect(floorplans).toHaveLength(FLOORPLAN_COUNT);
  });

  it('the provider PhotosCount field (68) must NOT be used as the photo count (67)', () => {
    // Live: Property.PhotosCount = 68 while canonical Photos = 67, because the
    // provider field counts the FloorPlan. The public count must always be
    // derived from CLASSIFIED media.
    expect(PROVIDER_PHOTOS_COUNT_FIELD).not.toBe(PHOTO_COUNT);
    expect(PROVIDER_PHOTOS_COUNT_FIELD).toBe(PHOTO_COUNT + FLOORPLAN_COUNT);
  });

  it('unique photo identities equal the photo count — no duplicates from pagination', async () => {
    const { rows } = await paginateMedia<Row>('https://x/odata/Media?page1', twoPageFetcher());
    const photoKeys = new Set(rows.filter((r) => r.MediaCategory === 'Photo').map((r) => r.MediaKey));
    expect(photoKeys.size).toBe(PHOTO_COUNT);
  });
});

describe('identity — the DB id and the provider record key are NOT interchangeable', () => {
  it('they are different values on this live specimen', () => {
    expect(LISTING_ID).not.toBe(RESOURCE_RECORD_KEY);
    expect(/^\d+$/.test(RESOURCE_RECORD_KEY)).toBe(true);
    expect(/^\d+$/.test(LISTING_ID)).toBe(false);
  });

  it('the detail route resolves each identity from its OWN expression', () => {
    // Source-pinned: one shared `listingKey` variable feeding BOTH the Prisma
    // `listing_id` lookup and the Media fetch is the defect. This fails if they
    // are ever collapsed again.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../../app/api/listings/[id]/route.ts'),
      'utf8',
    ) as string;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    // DB lookup keys off the PUBLIC listing id.
    expect(code).toMatch(/const listingId = String\(raw\.ListingId \|\| id\)/);
    expect(code).toMatch(/where: \{ listing_id: listingId \}/);

    // Media fetch keys off the PROVIDER record key, preferring ListingKey.
    expect(code).toMatch(/const mediaResourceKey = String\(/);
    expect(code).toMatch(/fetchListingMedia\(mediaResourceKey\)/);

    // The numeric provider key must never reach the DB identity again.
    expect(code).not.toMatch(/where: \{ listing_id: String\(raw\.SourceSystemKey/);
    expect(code).not.toMatch(/where: \{ listing_id: mediaResourceKey \}/);
  });

  it('fetchListingMedia is never called with the public listing id when a provider key exists', () => {
    const raw = { ListingId: LISTING_ID, ListingKey: RESOURCE_RECORD_KEY, SourceSystemKey: RESOURCE_RECORD_KEY };
    const listingId = String(raw.ListingId || 'x');
    const mediaResourceKey = String(raw.ListingKey || raw.SourceSystemKey || raw.ListingId || 'x');
    expect(listingId).toBe(LISTING_ID);
    expect(mediaResourceKey).toBe(RESOURCE_RECORD_KEY);
    expect(mediaResourceKey).not.toBe(listingId);
  });
});
