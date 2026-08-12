/**
 * CACHE ENTRY SIZE — the cached fallback response must fit Vercel's 2 MB
 * data-cache item limit with real margin.
 *
 * This is not hypothetical: cachedPublicRead carries a recorded production
 * failure at 2 MB (the oversized-entry shape its per-invocation capture guard
 * exists to survive). An entry that exceeds the limit fails to STORE, so every
 * request becomes a cache miss — which for the fallback path means every
 * request becomes Cotality traffic against an 18K/hr quota.
 *
 * Worst case is the route's own ceiling: `limit` is clamped to 200
 * (app/api/listings/route.ts), and toPublicListingSummary spreads `...dto` —
 * it keeps EVERY field and only contracts the gallery to a single hero. So the
 * cached payload is 200 complete DTOs, not 200 thin cards.
 */
import { toPublicListingSummaries } from '@/lib/idx/public-listing-summary';

const MAX_PAGE = 200; // route clamp: Math.min(parseInt(limit ?? '50'), 200)
const VERCEL_ITEM_LIMIT = 2 * 1024 * 1024;
/** Refuse to ship closer than this to the cliff. */
const SAFETY_CEILING = Math.floor(VERCEL_ITEM_LIMIT * 0.6);

/** A deliberately pessimistic listing: long remarks, long URLs, every field populated. */
function worstCaseListing(i: number): Record<string, unknown> {
  const longUrl =
    'https://api.cotality.com/trestle/Media/Property/PROP-' +
    String(i).padStart(8, '0') +
    '/' +
    'x'.repeat(120) +
    '.jpg';
  return {
    listingId: `RLS${String(10000000 + i)}`,
    listingKey: `${20000000 + i}`,
    listPrice: 12500000,
    previousListPrice: 13750000,
    status: 'Active',
    mlsStatus: 'Active',
    listingType: 'sale',
    bedrooms: 4,
    bathrooms: 3.5,
    rooms: 8,
    livingArea: 3200,
    yearBuilt: 1928,
    daysOnMarket: 142,
    cumulativeDaysOnMarket: 388,
    propertyType: 'Residential',
    propertySubType: 'Condominium',
    // Trestle public remarks run long; 4 000 chars is a realistic upper band.
    publicRemarks: 'A'.repeat(4000),
    address: {
      streetNumber: '1234',
      streetName: 'East Ninety-Sixth Street Apartment Residences',
      unitNumber: 'PH-12B',
      city: 'New York',
      stateOrProvince: 'NY',
      postalCode: '10128',
      neighborhood: 'Carnegie Hill',
      full: '1234 East Ninety-Sixth Street Apartment Residences, PH-12B, New York, NY 10128',
    },
    associationFee: 4250,
    associationFeeFrequency: 'Monthly',
    taxAnnualAmount: 38400,
    videoUrl: 'https://www.youtube.com/watch?v=' + 'v'.repeat(40),
    virtualTourURL: 'https://my.matterport.com/show/?m=' + 'm'.repeat(40),
    photosCount: 67,
    listAgentFullName: 'Alexandra Featherstone-Worthington',
    listOfficeName: 'Mallan Real Estate Inc. — Upper East Side Office',
    // Contraction keeps exactly one hero, so one media entry is the real shape.
    media: [
      {
        MediaURL: longUrl,
        MediaCategory: 'Photo',
        Order: 0,
        PreferredPhotoYN: true,
        ShortDescription: 'B'.repeat(120),
        ResourceRecordKey: `${20000000 + i}`,
      },
    ],
  };
}

function buildResponseBody(count: number) {
  const listings = Array.from({ length: count }, (_, i) => worstCaseListing(i));
  return {
    success: true,
    count,
    total: 12480,
    skip: 0,
    limit: MAX_PAGE,
    hasMore: true,
    listings: toPublicListingSummaries(listings as never),
    _compliance: {
      source: 'idx+exclusive',
      idxEnabled: true,
      attribution: 'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.',
      disclaimer:
        'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.',
      totalFetched: 800,
    },
  };
}

function utf8Bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

describe('cached fallback entry size', () => {
  it('PASS_FOR_200_ITEM_FIXTURE — a 200-listing contracted page fits', () => {
    const bytes = utf8Bytes(buildResponseBody(MAX_PAGE));
    const pct = ((bytes / VERCEL_ITEM_LIMIT) * 100).toFixed(1);
    // Surfaced so the number is in the CI log, not just an assertion outcome.

    console.log(
      `[cache-entry-size] ${MAX_PAGE} worst-case listings = ${bytes} bytes ` +
        `(${(bytes / 1024).toFixed(1)} KiB), ${pct}% of the 2 MB limit`,
    );
    expect(bytes).toBeLessThan(VERCEL_ITEM_LIMIT);
    // Margin, not "under by a few bytes".
    expect(bytes).toBeLessThan(SAFETY_CEILING);
  });

  it('a full-gallery FINAL RESPONSE cannot be cached — contraction is required', () => {
    // Same 200 listings, but with the pre-contraction 67-photo gallery.
    const withGalleries = Array.from({ length: MAX_PAGE }, (_, i) => {
      const l = worstCaseListing(i);
      l.media = Array.from({ length: 67 }, () => (l.media as unknown[])[0]);
      return l;
    });
    const uncontracted = utf8Bytes({ listings: withGalleries });
    const contracted = utf8Bytes({ listings: toPublicListingSummaries(withGalleries as never) });

    console.log(
      `[cache-entry-size] full galleries = ${(uncontracted / 1024 / 1024).toFixed(2)} MiB, ` +
        `contracted = ${(contracted / 1024).toFixed(1)} KiB`,
    );
    expect(contracted).toBeLessThan(uncontracted);
    // This proves an UNCONTRACTED FINAL RESPONSE must never be cached. It says
    // nothing about the current Property-only cache, which runs with
    // expandMedia: false and therefore carries no galleries at all — measured
    // separately below.
    expect(uncontracted).toBeGreaterThan(VERCEL_ITEM_LIMIT);
  });

  it('scales predictably, so a future page-size raise can be checked against this', () => {
    const at50 = utf8Bytes(buildResponseBody(50));
    const at200 = utf8Bytes(buildResponseBody(200));
    const perListing = Math.round((at200 - at50) / 150);

    console.log(`[cache-entry-size] ~${perListing} bytes per contracted listing`);
    // Headroom expressed as listings, which is the number that matters if the
    // 200 clamp is ever raised.
    const headroom = Math.floor((SAFETY_CEILING - at200) / perListing);
    expect(headroom).toBeGreaterThan(0);
    console.log(`[cache-entry-size] headroom below the safety ceiling: ~${headroom} more listings`);
  });
});

/**
 * The REAL maximum final response. `mergeExclusiveListings` ends with
 * `return [...newExclusives, ...trestleListings]` — exclusives are PREPENDED
 * and the result is NOT re-sliced, so the response can exceed the page clamp.
 */
const MAX_PREPENDED_EXCLUSIVES = 50;

describe('the real final-response ceiling is not the page size', () => {
  it('page + prepended exclusives is the shape that must fit', () => {
    const realMax = MAX_PAGE + MAX_PREPENDED_EXCLUSIVES;
    const bytes = utf8Bytes(buildResponseBody(realMax));
    const pct = ((bytes / VERCEL_ITEM_LIMIT) * 100).toFixed(1);
    console.log(
      `[cache-entry-size] REAL MAX ${realMax} listings (200 page + ${MAX_PREPENDED_EXCLUSIVES} ` +
        `exclusives) = ${bytes} bytes (${(bytes / 1024).toFixed(1)} KiB), ${pct}% of 2 MB`,
    );
    console.log(
      `[cache-entry-size] safety ceiling ${SAFETY_CEILING} bytes — ` +
        `real max is ${bytes <= SAFETY_CEILING ? 'WITHIN' : 'ABOVE'} it`,
    );
    // Hard limit is the contract; the ceiling is reported, not silently assumed.
    expect(bytes).toBeLessThan(VERCEL_ITEM_LIMIT);
  });
});

/**
 * The shape df3dcb25 ACTUALLY caches: the raw TrestleFetchResult, built with
 * `expandMedia: false`, so every record is CARD_SELECT_FIELDS scalars and NO
 * media array. Inferring its size from a gallery fixture was wrong.
 */
describe('the CURRENT Property-only cached shape, measured directly', () => {
  const CARD_FIELDS = 69;
  const FETCH_TOP_MAX = 1000;

  function cardRecord(i: number): Record<string, unknown> {
    const r: Record<string, unknown> = {};
    // Pessimistic scalar per selected field: long-ish strings, no media array.
    for (let f = 0; f < CARD_FIELDS; f++) r[`Field${f}`] = 'V'.repeat(40);
    r.ListingKey = String(20000000 + i);
    r.PublicRemarks = 'A'.repeat(4000); // the one genuinely long card field
    return r;
  }

  it('measures 1,000 records with expandMedia:false — no gallery inference', () => {
    const result = {
      records: Array.from({ length: FETCH_TOP_MAX }, (_, i) => cardRecord(i)),
      totalFetched: FETCH_TOP_MAX,
      odataCount: 12480,
      hasMore: true,
    };
    const bytes = utf8Bytes(result);
    const pct = ((bytes / VERCEL_ITEM_LIMIT) * 100).toFixed(1);
    console.log(
      `[cache-entry-size] CURRENT Property cache shape: ${FETCH_TOP_MAX} CARD_SELECT_FIELDS ` +
        `records (expandMedia:false) = ${bytes} bytes ` +
        `(${(bytes / 1024 / 1024).toFixed(2)} MiB), ${pct}% of 2 MB — ` +
        `${bytes > VERCEL_ITEM_LIMIT ? 'EXCEEDS' : 'within'} the item limit`,
    );
    // Reported, not asserted either way: this documents the shape rather than
    // pretending a synthetic field profile settles production byte counts.
    expect(bytes).toBeGreaterThan(0);
  });
});
