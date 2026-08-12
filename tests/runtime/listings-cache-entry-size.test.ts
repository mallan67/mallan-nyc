/**
 * CACHE ENTRY SIZE — the cached fallback response must fit Vercel's 2 MB
 * data-cache item limit with real margin.
 *
 * This is not hypothetical: cachedPublicRead carries a recorded production
 * failure at 2 MB (the oversized-entry shape its per-invocation capture guard
 * exists to survive). An entry that exceeds the limit fails to STORE, so every
 * request becomes an outer cache miss.
 *
 * An outer miss is NOT automatically an outbound Cotality request. fetchPage
 * sets `next: { revalidate: 300 }` (lib/idx/fetch.ts:657), so Next's own fetch
 * cache can absorb the call underneath. The quota exposure is therefore real
 * but bounded by that inner layer — it is not "every miss becomes provider
 * traffic", and this file no longer claims that.
 *
 * Worst case is the route's own ceiling: `limit` is clamped to 200
 * (app/api/listings/route.ts), and toPublicListingSummary spreads `...dto` —
 * it keeps EVERY field and only contracts the gallery to a single hero. So the
 * cached payload is an envelope containing 200 complete DTO summaries plus
 * the small audit fields used by the per-request served event.
 */
import { toPublicListingSummaries } from '@/lib/idx/public-listing-summary';
import { CARD_SELECT_FIELDS } from '@/lib/idx/card-fields';
import type { PublicListingDTO } from '@/lib/idx/public-dto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_PAGE = 200; // route clamp: Math.min(parseInt(limit ?? '50'), 200)
const VERCEL_ITEM_LIMIT = 2 * 1024 * 1024;
/** Refuse to ship closer than this to the cliff. */
const SAFETY_CEILING = Math.floor(VERCEL_ITEM_LIMIT * 0.6);

/** A deliberately pessimistic listing: long remarks, long URLs, every field populated. */
function worstCaseListing(i: number): PublicListingDTO {
  const longUrl =
    'https://api.cotality.com/trestle/Media/Property/PROP-' +
    String(i).padStart(8, '0') +
    '/' +
    'x'.repeat(120) +
    '.jpg';
  return {
    id: `RLS${String(10000000 + i)}`,
    mlsId: `${20000000 + i}`,
    slug: `1234-east-ninety-sixth-street-ph-12b-${i}`,
    url: `/listing/1234-east-ninety-sixth-street-ph-12b-${i}/rls${10000000 + i}`,
    listPrice: 12500000,
    previousListPrice: 13750000,
    originalListPrice: 13750000,
    closePrice: null,
    status: 'Active',
    listingType: 'sale',
    bedroomsTotal: 4,
    bathroomsFull: 3,
    bathroomsHalf: 1,
    roomsTotal: 8,
    livingArea: 3200,
    lotSizeArea: null,
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
      county: 'New York',
      latitude: 40.7816,
      longitude: -73.95,
    },
    associationFee: 4250,
    associationFeeFrequency: 'Monthly',
    taxAnnualAmount: 38400,
    videoUrl: 'https://www.youtube.com/watch?v=' + 'v'.repeat(40),
    virtualTourURL: 'https://my.matterport.com/show/?m=' + 'm'.repeat(40),
    photosCount: 67,
    listOfficeName: 'Mallan Real Estate Inc. — Upper East Side Office',
    // Contraction keeps exactly one hero, so one media entry is the real shape.
    media: [
      {
        url: longUrl,
        thumbUrl: `${longUrl}?width=640&description=${'B'.repeat(120)}`,
        mediaType: 'Photo',
        order: 0,
        isPrimary: true,
      },
    ],
    listingContractDate: '2025-01-01T00:00:00.000Z',
    modificationTimestamp: '2026-08-12T00:00:00.000Z',
    auction: null,
    _source: 'idx',
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: 'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.',
      disclaimerRequired: true,
    },
  } satisfies PublicListingDTO;
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
    listings: toPublicListingSummaries(listings),
    _compliance: {
      source: 'idx+exclusive',
      idxEnabled: true,
      attribution: 'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.',
      disclaimer:
        'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service. Information deemed reliable but not guaranteed.',
      totalFetched: 800,
    },
    _pagination: { totalAccuracy: 'estimated' },
  };
}

function buildCachedOriginValue(count: number) {
  return {
    responseBody: buildResponseBody(count),
    audit: {
      filter: 'StandardStatus eq Active and OriginatingSystemName eq Cotality'.padEnd(200, 'x'),
      recordCount: count,
      gateFilteredCount: 600,
    },
  };
}

function utf8Bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

describe('cached fallback entry size', () => {
  it('PASS_FOR_200_ITEM_FIXTURE — a 200-listing contracted page fits', () => {
    const bytes = utf8Bytes(buildCachedOriginValue(MAX_PAGE));
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
      l.media = Array.from({ length: 67 }, () => l.media[0]);
      return l;
    });
    const uncontracted = utf8Bytes({ listings: withGalleries });
    const contracted = utf8Bytes({ listings: toPublicListingSummaries(withGalleries) });

    console.log(
      `[cache-entry-size] full galleries = ${(uncontracted / 1024 / 1024).toFixed(2)} MiB, ` +
        `contracted = ${(contracted / 1024).toFixed(1)} KiB`,
    );
    expect(contracted).toBeLessThan(uncontracted);
    // This proves an UNCONTRACTED FINAL RESPONSE must never be cached. It says
    // nothing about the removed Property-only cache, which ran with
    // expandMedia: false and therefore carried no galleries at all — its
    // historical risk is measured separately below.
    expect(uncontracted).toBeGreaterThan(VERCEL_ITEM_LIMIT);
  });

  it('scales predictably, so a future page-size raise can be checked against this', () => {
    const at50 = utf8Bytes(buildCachedOriginValue(50));
    const at200 = utf8Bytes(buildCachedOriginValue(200));
    const perListing = Math.round((at200 - at50) / 150);

    console.log(`[cache-entry-size] ~${perListing} bytes per contracted listing`);
    // Headroom expressed as listings, which is the number that matters if the
    // 200 clamp is ever raised.
    const headroom = Math.floor((SAFETY_CEILING - at200) / perListing);
    expect(headroom).toBeGreaterThan(0);
    console.log(`[cache-entry-size] headroom below the safety ceiling: ~${headroom} more listings`);
  });
});

describe('the final response ceiling is the route page size', () => {
  it('regression: no source is prepended after the single combined slice', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/listings/route.ts'), 'utf8');
    expect(route).toContain('paginateFallbackCandidates(combinedCandidates');
    expect(route).not.toContain('return [...newExclusives, ...trestleListings]');
    expect(utf8Bytes(buildCachedOriginValue(MAX_PAGE))).toBeLessThan(SAFETY_CEILING);
  });
});

/**
 * The shape df3dcb25 cached before the final-origin boundary replaced it: the
 * raw TrestleFetchResult, built with `expandMedia: false`, so every record is
 * CARD_SELECT_FIELDS scalars and NO media array. Keeping this measurement is
 * a regression guard against reintroducing that oversized boundary.
 */
describe('REMOVED_PROPERTY_CACHE_SYNTHETIC_MAX — risk estimate, not a measurement', () => {
  const FETCH_TOP_MAX = 1000; // route: Math.min(..., 1000)

  /** Real selected keys. Values are still SYNTHETIC — pessimistic string
   *  lengths, not Cotality-verified maxima — so this bounds risk, not truth. */
  function cardRecord(i: number): Record<string, unknown> {
    const r: Record<string, unknown> = {};
    for (const key of CARD_SELECT_FIELDS) {
      r[key] = key === 'PublicRemarks' ? 'A'.repeat(4000) : 'V'.repeat(40);
    }
    r.ListingKey = String(20000000 + i);
    return r;
  }

  it('bounds the risk of caching the raw TrestleFetchResult at max fetchTop', () => {
    const result = {
      records: Array.from({ length: FETCH_TOP_MAX }, (_, i) => cardRecord(i)),
      totalFetched: FETCH_TOP_MAX,
      odataCount: 12480,
      hasMore: true,
    };
    const bytes = utf8Bytes(result);
    console.log(
      `[cache-entry-size] REMOVED_PROPERTY_CACHE_SYNTHETIC_MAX: ${FETCH_TOP_MAX} records over ` +
        `${CARD_SELECT_FIELDS.length} REAL CARD_SELECT_FIELDS keys (expandMedia:false) = ` +
        `${bytes} bytes (${(bytes / 1024 / 1024).toFixed(2)} MiB), ` +
        `${((bytes / VERCEL_ITEM_LIMIT) * 100).toFixed(1)}% of 2 MB`,
    );
    // fetchTop VARIES per request (limit, skip, post-filter multiplier), so the
    // cache is NOT universally non-functional: small searches may store fine
    // while large or post-filtered ones exceed the item limit and silently fail
    // to store. This asserts the RISK is real at the documented ceiling, not
    // that production entries are oversized.
    expect(bytes).toBeGreaterThan(VERCEL_ITEM_LIMIT);
    expect(CARD_SELECT_FIELDS.length).toBeGreaterThan(60);
    const route = readFileSync(resolve(process.cwd(), 'app/api/listings/route.ts'), 'utf8');
    expect(route).not.toContain('api-listings-trestle-fallback');
  });
});
