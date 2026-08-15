/// <reference types="jest" />
/**
 * RETURN-COPY REDIRECT — proven at the REAL route boundary.
 *
 * PRODUCTION REGRESSION (merged SHA 881182f9): a direct request for a Mallan RLS
 * return-copy that has exactly one proven local twin returned HTTP 500.
 *
 * `fetchFromDB` signalled the redirect by fabricating a listing:
 *     listing: { id: dbListing.listing_id } as unknown as PublicListingDTO
 * `ListingPage` handled it, but `generateMetadata` consumes the SAME cached
 * result and dereferences `listing.listPrice`, `listing.address` and
 * `listing.media` before any redirect can run — so it threw first.
 *
 * WHY THE OLD SUITE STAYED GREEN: it proved the pure resolver
 * (`resolveReturnCopyCanonicalTarget`) and read the route as a SOURCE STRING.
 * No test imported the route and drove its two real consumers, so a valid
 * redirect DECISION could still crash at the boundary. This test closes that
 * gap by importing the actual route module.
 */

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return { ...actual, cache: (fn: unknown) => fn };
});

const mockNotFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
const mockRedirect = jest.fn((_u?: string) => { throw new Error('NEXT_REDIRECT'); });
const mockPermanentRedirect = jest.fn((_u?: string) => { throw new Error('NEXT_PERMANENT_REDIRECT'); });
jest.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
  redirect: (u: string) => mockRedirect(u),
  permanentRedirect: (u: string) => mockPermanentRedirect(u),
}));

const mockFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (a: unknown) => mockFindUnique(a),
      findMany: (a: unknown) => mockFindMany(a),
    },
    listingMedia: { findMany: async () => [] },
    agent: { findUnique: async () => null },
  },
}));

const mockAttachTags = jest.fn(async (..._a: unknown[]) => undefined);
// The listing-detail persistent Data Cache wraps fetchFromDB in `unstable_cache`. Outside a Next
// render there is no incrementalCache, so the real implementation throws
// "Invariant: incrementalCache missing". That is an ENVIRONMENT limit of running the page's
// functions directly under Jest — not page behaviour — so unstable_cache passes through here and
// the tests below still exercise the real fetch/redirect/tag logic.
jest.mock('next/cache', () => ({
  __esModule: true,
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => undefined,
}));

jest.mock('@/lib/cache/public-cache', () => ({
  __esModule: true,
  attachListingCacheTags: (...a: unknown[]) => mockAttachTags(...a),
  publicListingChangeTags: () => ({ tags: [] }),
  safeRevalidateTags: () => undefined,
  listingCacheTag: () => 't',
  buildingAndManifestInvalidationTags: () => [],
  SEARCH_CACHE_TAG: 's',
}));
jest.mock('@/lib/geo/geocode', () => ({
  __esModule: true,
  geocodeListings: async (x: unknown) => x,
  getGeocodeManifest: async () => ({}),
  buildGeocodeManifest: async () => ({}),
}));

const ADDRESS = {
  StreetNumber: '333',
  StreetDirPrefix: 'E',
  StreetName: '46th',
  StreetSuffix: 'Street',
  UnitNumber: '2G',
  City: 'New York',
  PostalCode: '10017',
};

/** Mallan RLS return-copy: RLS id + verified Mallan list-office identity. */
const RETURN_COPY = {
  id: 1n,
  listing_id: 'RLS20000001',
  mls_id: 'RLS20000001',
  rls_eligible: true,
  list_office_mls_id: '7041',
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Residential',
  property_sub_type: null,
  list_price: 1000000,
  bedrooms_total: 1,
  bathrooms_full: 1,
  bathrooms_half: null,
  living_area: 800,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  address: ADDRESS,
  features: {},
  media: [],
  raw_data: {},
  agent_info: {},
  borough: 'Manhattan',
  neighborhood: 'Turtle Bay',
  agent_id: null,
  owner_client_id: null,
  listing_media: [],
  _count: { listing_media: 0 },
  created_at: new Date('2026-07-01T00:00:00Z'),
  updated_at: new Date('2026-08-01T00:00:00Z'),
  modification_timestamp: new Date('2026-08-01T00:00:00Z'),
};

/** Exactly one proven local physical-unit twin (address-variant spelling). */
const LOCAL_TWIN = {
  listing_id: 'SL-0999',
  rls_eligible: false,
  list_office_mls_id: null,
  address: { ...ADDRESS, StreetDirPrefix: 'East' },
  borough: 'Manhattan',
  internet_address_display_yn: true,
  internet_entire_listing_display_yn: true,
  idx_display_yn: false,
  status: 'Active',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindUnique.mockResolvedValue(RETURN_COPY);
  mockFindMany.mockResolvedValue([LOCAL_TWIN]);
});

const PARAMS = { params: Promise.resolve({ slug: ['rls20000001'] }) } as never;
const EXPECTED_TARGET = '/listing/333-east-46th-street-apt-2g-new-york-ny-10017/sl-0999';

type PageFn = (p: unknown) => Promise<unknown>;

describe('generateMetadata on a return-copy URL', () => {
  it('DOES NOT THROW (this is the exact production 500)', async () => {
    const { generateMetadata } = await import('@/app/listing/[...slug]/page');
    await expect(generateMetadata(PARAMS)).resolves.toBeDefined();
  });

  it('emits only safe canonical metadata — no fabricated listing fields', async () => {
    const { generateMetadata } = await import('@/app/listing/[...slug]/page');
    const meta = await generateMetadata(PARAMS);
    const json = JSON.stringify(meta);
    // Points at the LOCAL canonical target, never the return-copy.
    expect(json).toContain(EXPECTED_TARGET);
    expect(json).not.toContain('RLS20000001');
    // No price invented from a DTO that does not exist.
    expect(json).not.toMatch(/1,000,000|1000000/);
  });
});

describe('ListingPage on a return-copy URL', () => {
  it('issues a PERMANENT redirect to the local canonical URL', async () => {
    const mod = await import('@/app/listing/[...slug]/page');
    await expect((mod.default as PageFn)(PARAMS)).rejects.toThrow(/NEXT_PERMANENT_REDIRECT/);
    expect(mockPermanentRedirect).toHaveBeenCalledWith(EXPECTED_TARGET);
    // A 307 would leave the return-copy URL canonical for crawlers.
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('still attaches the SOURCE return-copy cache tag', async () => {
    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)(PARAMS).catch(() => undefined);
    expect(mockAttachTags).toHaveBeenCalled();
    expect(String(mockAttachTags.mock.calls[0]?.[0])).toBe('RLS20000001');
  });
});

describe('fail-closed: no unique local twin', () => {
  it('zero twins -> notFound, never a redirect', async () => {
    mockFindMany.mockResolvedValue([]);
    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)(PARAMS).catch(() => undefined);
    expect(mockPermanentRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('two twins -> notFound (ambiguity is never resolved by guessing)', async () => {
    mockFindMany.mockResolvedValue([LOCAL_TWIN, { ...LOCAL_TWIN, listing_id: 'RL-0888' }]);
    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)(PARAMS).catch(() => undefined);
    expect(mockPermanentRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).toHaveBeenCalled();
  });

  it('different unit -> notFound', async () => {
    mockFindMany.mockResolvedValue([{ ...LOCAL_TWIN, address: { ...ADDRESS, UnitNumber: '9Z' } }]);
    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)(PARAMS).catch(() => undefined);
    expect(mockPermanentRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).toHaveBeenCalled();
  });
});

describe('non-return-copy rows are untouched', () => {
  /**
   * These rows are requested at an ID-ONLY URL, so they legitimately take the
   * GENERIC canonical normalization (proven separately below). What must never
   * happen is the RETURN-COPY canonicalization: being sent to some other row's
   * local twin. Asserting "no redirect at all" would have been wrong — it would
   * conflate the two mechanisms.
   */
  it('third-party RLS row is never redirected to a local twin', async () => {
    mockFindUnique.mockResolvedValue({ ...RETURN_COPY, list_office_mls_id: '9999' });
    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)(PARAMS).catch(() => undefined);
    const target = String(mockPermanentRedirect.mock.calls[0]?.[0] ?? '');
    expect(target).not.toContain('sl-0999');
    expect(target).toContain('rls20000001');
  });

  it('unknown provenance (no office id) is never redirected to a local twin', async () => {
    mockFindUnique.mockResolvedValue({ ...RETURN_COPY, list_office_mls_id: null });
    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)(PARAMS).catch(() => undefined);
    const target = String(mockPermanentRedirect.mock.calls[0]?.[0] ?? '');
    expect(target).not.toContain('sl-0999');
  });

  it('metadata for a third-party row still builds full listing metadata', async () => {
    mockFindUnique.mockResolvedValue({ ...RETURN_COPY, list_office_mls_id: '9999' });
    const { generateMetadata } = await import('@/app/listing/[...slug]/page');
    const meta = await generateMetadata(PARAMS);
    expect(JSON.stringify(meta)).toMatch(/46th|Turtle Bay|bed/i);
  });
});

/**
 * GENERIC CANONICAL-URL ENFORCEMENT — the route's second 307/308 contradiction.
 *
 * That block has always DOCUMENTED "308 to canonical" for id-only and legacy
 * hybrid URLs, but implemented `redirect()`, which is 307 Temporary outside
 * Server Actions. SEO consolidation — the block's stated purpose — needs a
 * permanent signal, so it now uses `permanentRedirect`.
 */
describe('generic canonical-URL normalization is permanent', () => {
  const THIRD_PARTY = { ...RETURN_COPY, list_office_mls_id: '9999' };

  it('B: an id-only URL permanently redirects to the canonical path', async () => {
    mockFindUnique.mockResolvedValue(THIRD_PARTY);
    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)(PARAMS).catch(() => undefined);
    expect(mockPermanentRedirect).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('F: the target is byte-identical to buildCanonicalListingPath()', async () => {
    mockFindUnique.mockResolvedValue(THIRD_PARTY);
    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)(PARAMS).catch(() => undefined);
    const target = String(mockPermanentRedirect.mock.calls[0]?.[0]);

    const { buildCanonicalListingPath } = await import('@/lib/listing-canonical-url');
    const { buildListingSlugFromDbRow } = await import('@/lib/listing-slug');
    const expected = buildCanonicalListingPath({
      slug: buildListingSlugFromDbRow(THIRD_PARTY as never),
      id: THIRD_PARTY.listing_id,
    });
    expect(target).toBe(expected);
  });

  it('C + E: requesting the canonical URL renders — no redirect, no loop', async () => {
    mockFindUnique.mockResolvedValue(THIRD_PARTY);
    const { buildCanonicalListingPath } = await import('@/lib/listing-canonical-url');
    const { buildListingSlugFromDbRow } = await import('@/lib/listing-slug');
    const canonical = buildCanonicalListingPath({
      slug: buildListingSlugFromDbRow(THIRD_PARTY as never),
      id: THIRD_PARTY.listing_id,
    });
    const parts = canonical.replace(/^\/listing\//, '').split('/');

    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)({ params: Promise.resolve({ slug: parts }) }).catch(() => undefined);
    // Redirecting here would send the canonical URL to itself — an infinite loop.
    expect(mockPermanentRedirect).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('D: a genuine miss is still notFound, never a redirect', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindMany.mockResolvedValue([]);
    const mod = await import('@/app/listing/[...slug]/page');
    await (mod.default as PageFn)(PARAMS).catch(() => undefined);
    expect(mockNotFound).toHaveBeenCalled();
    expect(mockPermanentRedirect).not.toHaveBeenCalled();
  });
});

describe('type-safety: a redirect can never masquerade as a listing again', () => {
  const SRC = require('fs').readFileSync(
    require('path').resolve(__dirname, '../../app/listing/[...slug]/page.tsx'),
    'utf8',
  ) as string;
  /** Comments legitimately NAME the removed defect; only code counts. */
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('the double-cast that created the fake DTO is gone from code', () => {
    expect(CODE).not.toMatch(/as unknown as PublicListingDTO/);
  });

  it('the result type is a discriminated union', () => {
    expect(CODE).toMatch(/type ListingFetchResult\s*=\s*ListingFetchListing\s*\|\s*ListingFetchRedirect/);
  });

  it('the redirect variant carries no listing and keeps the source id', () => {
    const start = CODE.indexOf('interface ListingFetchRedirect');
    const redirectVariant = CODE.slice(start, CODE.indexOf('}', start));
    expect(redirectVariant).toMatch(/kind:\s*'redirect'/);
    expect(redirectVariant).toMatch(/canonicalRedirect:\s*string/);
    expect(redirectVariant).toMatch(/sourceListingId:\s*string/);
    expect(redirectVariant).not.toMatch(/\blisting\s*:/);
  });

  it('both consumers narrow on `kind` before touching a DTO', () => {
    expect(CODE).toMatch(/if \(result\.kind === 'redirect'\)/);
    expect(CODE).toMatch(/permanentRedirect\(result\.canonicalRedirect\)/);
  });

  /**
   * The compiler is the PRIMARY guard: `tsc --noEmit` fails if either consumer
   * reads `.listing` before narrowing, because the redirect variant has no such
   * property. These source assertions are additional defense only.
   */
  it('the listing variant is the only one exposing a DTO', () => {
    expect(CODE).toMatch(/interface ListingFetchListing/);
    expect(CODE).toMatch(/kind:\s*'listing'/);
  });
});

export {};
