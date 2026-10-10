/// <reference types="jest" />
/**
 * The listing page's Pet Policy section, RENDERED from a database row (the real route function, as tests/runtime/return-copy-redirect-route-boundary.test.ts drives it).
 *
 * Found 2026-10-09 by running the old page code on all 31 live PetsAllowed members: the page ran every answer through a helper that strips a trailing "Yes" / "No", so Yes, BuildingYes, No and BuildingNo
 * printed no Pet Policy section at all and NoDogs printed "Dogs Ok". The page now reads the answer through lib/search/pet-policy.ts (petPolicyView): the section says what the answer says, with a check
 * for an answer that lets pets in and a cross for No / BuildingNo, and is absent when there is no answer worth showing.
 *
 * The page function returns a React element tree; this test walks it (host elements only: it never calls a child component) and reads the section whose heading is "Pet Policy".
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

jest.mock('next/cache', () => ({
  __esModule: true,
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => undefined,
}));
jest.mock('@/lib/cache/public-cache', () => ({
  __esModule: true,
  attachListingCacheTags: async () => undefined,
  publicListingChangeTags: () => ({ tags: [] }),
  safeRevalidateTags: () => undefined,
  listingCacheTag: () => 't',
  buildingAndManifestInvalidationTags: () => [],
  SEARCH_CACHE_TAG: 's',
}));
jest.mock('@/lib/geo/geocode', () => ({
  __esModule: true,
  ZIP_CENTROIDS: {},
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

/** a third-party RLS listing (another firm's office), so the page renders it as itself */
const row = (features: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: 1n,
  listing_id: 'RLS20000001',
  mls_id: 'RLS20000001',
  rls_eligible: true,
  list_office_mls_id: '9999',
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
  features,
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
  ...extra,
});

type El = { type?: unknown; props?: { children?: unknown; d?: string } };
const kids = (node: unknown): unknown[] => {
  const children = (node as El | null)?.props?.children;
  return Array.isArray(children) ? children.flat(Infinity as 1) : children === undefined ? [] : [children];
};
const textOf = (node: unknown): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  return kids(node).map(textOf).join('');
};
const walk = (node: unknown, visit: (el: El) => void): void => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return; }
  visit(node as El);
  kids(node).forEach((child) => walk(child, visit));
};
/** the <section> whose <h2> says "Pet Policy" */
const petSection = (tree: unknown): El | null => {
  let found: El | null = null;
  walk(tree, (el) => {
    if (el.type !== 'section' || found) return;
    kids(el).forEach((child) => {
      if ((child as El | null)?.type === 'h2' && textOf(child) === 'Pet Policy') found = el;
    });
  });
  return found;
};
const CHECK = 'M5 13l4 4L19 7';
const CROSS = 'M6 18L18 6M6 6l12 12';
const iconOf = (section: El): string | null => {
  let d: string | null = null;
  walk(section, (el) => { if (el.type === 'path' && typeof el.props?.d === 'string' && !d) d = el.props.d; });
  return d;
};

type PageFn = (p: unknown) => Promise<unknown>;
const render = async (features: Record<string, unknown>, extra: Record<string, unknown> = {}) => {
  const listing = row(features, extra);
  mockFindUnique.mockResolvedValue(listing);
  mockFindMany.mockResolvedValue([]);
  const { buildCanonicalListingPath } = await import('@/lib/listing-canonical-url');
  const { buildListingSlugFromDbRow } = await import('@/lib/listing-slug');
  const canonical = buildCanonicalListingPath({ slug: buildListingSlugFromDbRow(listing as never), id: listing.listing_id });
  const parts = canonical.replace(/^\/listing\//, '').split('/');
  const mod = await import('@/app/listing/[...slug]/page');
  return (mod.default as PageFn)({ params: Promise.resolve({ slug: parts }) });
};

beforeEach(() => { jest.clearAllMocks(); });

describe('the Pet Policy section of the listing page, from the stored PetsAllowed answer', () => {
  it.each([
    ['Yes', 'Pets Allowed', CHECK],
    ['BuildingYes', 'Pets Allowed', CHECK],
    ['No', 'No Pets', CROSS],
    ['BuildingNo', 'No Pets', CROSS],
    ['NoDogs', 'No Dogs', CHECK],
    ['NoPetRestrictions', 'No Pet Restrictions', CHECK],
    ['CatsOk,DogsOk', 'Cats Ok, Dogs Ok', CHECK],
    ['SizeLimit', 'Size Limit', CHECK],
  ])('%s: the section says %j with the right icon', async (answer, label, icon) => {
    const section = petSection(await render({ PetsAllowed: answer }));
    expect(section).not.toBeNull();
    expect(textOf(section)).toBe(`Pet Policy${label}`);
    expect(iconOf(section as El)).toBe(icon);
  });

  it('a list stored in the features is read the same way as the comma-joined string', async () => {
    const section = petSection(await render({ PetsAllowed: ['Yes', 'CatsOk'] }));
    expect(textOf(section)).toBe('Pet PolicyPets Allowed, Cats Ok');
    expect(iconOf(section as El)).toBe(CHECK);
  });

  it.each([[{}], [{ PetsAllowed: '' }], [{ PetsAllowed: 'Other' }], [{ PetsAllowed: 'None,Other' }]])('%j: there is no section to show', async (features) => {
    expect(petSection(await render(features))).toBeNull();
  });

  it('the section is the same for a rental, and the Rental Details list carries the same words', async () => {
    const tree = await render({ PetsAllowed: 'BuildingNo' }, { listing_type: 'rent', property_type: 'Residential Lease', list_price: 5500 });
    const section = petSection(tree);
    expect(textOf(section)).toBe('Pet PolicyNo Pets');
    let petsRow = '';
    walk(tree, (el) => {
      if (el.type === 'div' && kids(el).length === 2 && textOf(kids(el)[0]) === 'Pets') petsRow = textOf(kids(el)[1]);
    });
    expect(petsRow).toBe('No Pets');
  });
});
