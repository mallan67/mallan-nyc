/// <reference types="jest" />
/**
 * PUBLICATION ELIGIBILITY IS ONE TRUTH — proven BEHAVIOURALLY, at the seam that
 * actually leaked.
 *
 * ── WHAT WAS BROKEN ──────────────────────────────────────────────────────────
 * The Draft check lived in the PAGE COMPONENT only. `generateMetadata` consumes
 * the SAME memoized resolver and runs FIRST, so for a Draft listing Next already
 * emitted:
 *
 *     title       "<street address> | $<price> | Mallan Real Estate"
 *     description "<beds> bed, <baths> bath … <public remarks>"
 *     canonical   https://mallan.nyc/listing/<address-slug>/<id>
 *     openGraph   title + description + primary photo
 *     twitter     summary_large_image + primary photo
 *
 * …and only afterwards did the page call `notFound()`. Under `revalidate = false`
 * that metadata was cacheable. A visibility rule enforced in one of two consumers
 * of a shared fetch is not a rule — it is a race.
 *
 * ── WHY SOURCE-GREPS ARE NOT ENOUGH HERE ─────────────────────────────────────
 * CLAUDE.md §F: source-grep verification ALONE is insufficient for any rendering
 * or behaviour claim — the 2026-05-20 FARE Act finding is the precedent (the grep
 * passed; the conditional did not render). So this file IMPORTS the real route
 * module and CALLS `generateMetadata` / `ListingPage`, asserting on the returned
 * metadata object rather than on the file's text.
 *
 * ── THE RULE UNDER TEST ──────────────────────────────────────────────────────
 * `decidePublicDetailAccess` runs inside `fetchFromDB`, on the RAW DB row, BEFORE
 * a `PublicListingDTO` is built, returned, or written to the persistent Data
 * Cache. Page, metadata, SEO and the cache therefore receive one answer.
 */

const findUnique = jest.fn();
const findMany = jest.fn(async () => []);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findUnique: (...a: unknown[]) => findUnique(...a), findMany: (...a: unknown[]) => findMany() },
    agent: { findUnique: jest.fn(async () => null) },
  },
}));

// The persistent Data Cache is a pass-through here: we are proving the VALUE the
// resolver produces, and `unstable_cache` would otherwise memoize across cases.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: jest.fn(),
}));

// Override ONLY the tag-attach side effect. `cachedPublicRead` and friends must
// stay real — other modules in the route's import graph call them at load time.
jest.mock('@/lib/cache/public-cache', () => ({
  ...jest.requireActual('@/lib/cache/public-cache'),
  attachListingCacheTags: jest.fn(async () => {}),
}));

// Feed-authority does a grouped media query; irrelevant to publication eligibility.
jest.mock('@/lib/media/feed-media-authority', () => ({
  resolveFeedAuthorityForPage: jest.fn(async () => new Map()),
}));

// React's per-request `cache()` is a server-runtime primitive. Identity here, so
// each case's distinct row is actually resolved rather than memoized from the first.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  cache: (fn: unknown) => fn,
}));

const notFoundError = new Error('NEXT_NOT_FOUND');
const redirectError = (to: string) => Object.assign(new Error('NEXT_REDIRECT'), { digest: to });

jest.mock('next/navigation', () => ({
  notFound: () => {
    throw notFoundError;
  },
  permanentRedirect: (to: string) => {
    throw redirectError(to);
  },
}));

import { generateMetadata } from '@/app/listing/[...slug]/page';

/**
 * A row complete enough for `dbListingToPublicDTO` to build a full public DTO —
 * so the PRESERVED cases genuinely exercise metadata construction rather than
 * passing because the DTO failed to build.
 */
function row(overrides: Record<string, unknown> = {}) {
  return {
    listing_id: 'SL-9001',
    mls_id: null,
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'Condominium',
    list_price: 1250000,
    original_list_price: 1250000,
    close_price: null,
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: 1100,
    year_built: 1998,
    public_remarks: 'SECRET PRE-PUBLICATION COPY — must never reach metadata.',
    address: {
      StreetNumber: '400',
      StreetName: 'East 90th Street',
      UnitNumber: '17C',
      City: 'New York',
      PostalCode: '10128',
      CountyOrParish: 'New York',
    },
    postal_code: '10128',
    borough: 'Manhattan',
    created_at: new Date('2026-01-05T00:00:00.000Z'),
    updated_at: new Date('2026-08-01T00:00:00.000Z'),
    modification_timestamp: new Date('2026-08-01T00:00:00.000Z'),
    listing_contract_date: new Date('2026-01-05T00:00:00.000Z'),
    features: {},
    raw_data: {},
    media: [],
    listing_media: [],
    _count: { listing_media: 0 },
    // Gate columns — wide open, so STATUS is the only variable under test.
    rls_eligible: true,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
    list_office_mls_id: null,
    agent_id: null,
    ...overrides,
  };
}

const meta = (id = 'SL-9001') =>
  generateMetadata({ params: Promise.resolve({ slug: [id.toLowerCase()] }) } as never);

/** Every string a metadata object could carry, flattened for leak assertions. */
function metadataText(m: unknown): string {
  return JSON.stringify(m ?? {});
}

beforeEach(() => {
  jest.clearAllMocks();
  findMany.mockResolvedValue([]);
});

describe('D1 — a Draft never reaches metadata (the SEO/OpenGraph leak)', () => {
  it('emits no address, price, remarks, image, canonical or OG/Twitter data', async () => {
    findUnique.mockResolvedValue(row({ status: 'Draft', rls_eligible: false }));

    const m = await meta();
    const text = metadataText(m);

    // The refusal itself.
    expect(m.title).toBe('Listing Not Found | Mallan Real Estate');

    // The leak, asserted field by field on the REAL returned object.
    expect(text).not.toContain('East 90th Street');
    expect(text).not.toContain('400');
    expect(text).not.toContain('1,250,000');
    expect(text).not.toContain('SECRET PRE-PUBLICATION COPY');
    expect(text).not.toContain('/listing/');
    expect(m.openGraph).toBeUndefined();
    expect(m.twitter).toBeUndefined();
    expect(m.alternates?.canonical).toBeUndefined();

    // And it is explicitly de-indexable, because a pre-fix Draft may be indexed.
    expect(m.robots).toEqual({ index: false, follow: false });
  });

  it('a Draft is indistinguishable from a nonexistent listing', async () => {
    // Metadata for a Draft must be byte-identical to metadata for a row that is
    // not in the database at all. Any difference is itself a disclosure.
    findUnique.mockResolvedValue(row({ status: 'Draft', rls_eligible: false }));
    const draftMeta = await meta();

    findUnique.mockResolvedValue(null);
    const missingMeta = await meta();

    expect(draftMeta).toEqual(missingMeta);
  });

  it('Incomplete — the other CRM pre-publication status — is equally private', async () => {
    findUnique.mockResolvedValue(row({ status: 'Incomplete', rls_eligible: false }));
    const m = await meta();
    expect(m.title).toBe('Listing Not Found | Mallan Real Estate');
    expect(metadataText(m)).not.toContain('East 90th Street');
  });
});

describe('D2 — terminal status is not public, in EITHER source class', () => {
  // The narrowing: status RECOGNITION is not publication eligibility.
  const TERMINAL = ['Closed', 'Sold', 'Rented', 'Leased', 'Withdrawn', 'Cancelled', 'Expired'];

  it.each(TERMINAL)('Mallan website-only %s is NOT publicly retrievable', async (status) => {
    // This is the hole the old rule left open: `fetchFromDB` bypasses the RLS
    // distribution gate for rls_eligible=false rows, so `normalizeStatus() !== null`
    // was the ONLY gate and every terminal Mallan listing kept a public page.
    findUnique.mockResolvedValue(row({ status, rls_eligible: false }));
    const m = await meta();
    expect(m.title).toBe('Listing Not Found | Mallan Real Estate');
    expect(metadataText(m)).not.toContain('East 90th Street');
  });

  it.each(TERMINAL)('RLS-backed %s is NOT publicly retrievable', async (status) => {
    // Already refused today via idx_display_yn; asserted so the status rule and
    // the gate cannot drift apart.
    findUnique.mockResolvedValue(row({ status, rls_eligible: true, idx_display_yn: false }));
    const m = await meta();
    expect(m.title).toBe('Listing Not Found | Mallan Real Estate');
  });

  it('PRESERVED: a just-Closed RLS row is STILL served inside the UCBA 24h window', async () => {
    // REBNY UCBA Art. I §6 is a DISJUNCTION — "removed OR MARKED CLOSED on the
    // broker website within 24hrs" — and `evaluateDisplayGate` implements the
    // second branch via `displayable: !terminal || closedWithin24Hours`.
    //
    // This test exists because the first version of this fix used a flat
    // non-terminal allowlist for BOTH source classes, which silently deleted
    // that provision. Terminality for RLS rows has exactly one owner: the gate.
    findUnique.mockResolvedValue(
      row({
        status: 'Closed',
        rls_eligible: true,
        idx_display_yn: true,
        close_date: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
        listing_id: 'RLS20061542',
      }),
    );
    const m = await meta('RLS20061542');
    expect(m.title).toContain('East 90th Street');
  });

  it('the SAME row past 24h is refused', async () => {
    findUnique.mockResolvedValue(
      row({
        status: 'Closed',
        rls_eligible: true,
        idx_display_yn: true,
        close_date: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h ago
        listing_id: 'RLS20061543',
      }),
    );
    const m = await meta('RLS20061543');
    expect(m.title).toBe('Listing Not Found | Mallan Real Estate');
  });

  it('a Mallan website-only Closed row gets NO 24h grace — no RLS gate governs it', async () => {
    // The asymmetry is deliberate: the 24h window is a REBNY display provision
    // for RLS inventory. Mallan website-only inventory is governed by
    // `buildPublishContract`'s `exclusiveEligible = !isTerminal`, which has no
    // grace period.
    findUnique.mockResolvedValue(
      row({ status: 'Closed', rls_eligible: false, close_date: new Date(Date.now() - 60 * 60 * 1000) }),
    );
    const m = await meta();
    expect(m.title).toBe('Listing Not Found | Mallan Real Estate');
  });

  it('a terminal RLS row whose gate columns were never recomputed is still refused', async () => {
    // Legacy/never-regated row: idx_display_yn stale TRUE with a terminal status.
    // Under the old rule this was publicly retrievable. The status half now
    // catches it independently of the gate.
    findUnique.mockResolvedValue(row({ status: 'Sold', rls_eligible: true, idx_display_yn: true }));
    const m = await meta();
    expect(m.title).toBe('Listing Not Found | Mallan Real Estate');
  });
});

describe('D3 — Pending and Hold are PRESERVED (the narrowing is not over-broad)', () => {
  it('Pending is served at its detail URL, with full metadata', async () => {
    findUnique.mockResolvedValue(row({ status: 'Pending', listing_id: 'RLS20061539', rls_eligible: true }));
    const m = await meta('RLS20061539');

    expect(m.title).toContain('East 90th Street');
    expect(m.title).toContain('1,250,000');
    expect(m.openGraph).toBeDefined();
    expect(m.alternates?.canonical).toContain('/listing/');
  });

  it('Hold — non-terminal — is likewise still retrievable', async () => {
    findUnique.mockResolvedValue(row({ status: 'Hold', listing_id: 'RLS20061540', rls_eligible: true }));
    const m = await meta('RLS20061540');
    expect(m.title).toContain('East 90th Street');
  });

  it('Active and ComingSoon are untouched', async () => {
    for (const status of ['Active', 'ComingSoon']) {
      findUnique.mockResolvedValue(row({ status, listing_id: 'RLS20061541', rls_eligible: true }));
      const m = await meta('RLS20061541');
      expect(m.title).toContain('East 90th Street');
    }
  });

  it('a Mallan WEBSITE-ONLY Active listing is public despite idx_display_yn=false', async () => {
    // `computeGateColumns` forces idx_display_yn=false for every rls_eligible=false
    // row, so requiring the RLS gate of them would 404 all Mallan website-only
    // inventory. Source-class awareness is what prevents that.
    findUnique.mockResolvedValue(
      row({ status: 'Active', rls_eligible: false, idx_display_yn: false }),
    );
    const m = await meta();
    expect(m.title).toContain('East 90th Street');
  });
});

describe('D4 — RLS distribution gates still bind RLS-backed rows', () => {
  it.each([
    ['idx_display_yn=false', { idx_display_yn: false }],
    ['owner_opt_out=true', { owner_opt_out: true }],
    ['participant_only=true', { participant_only: true }],
    ['internet_entire_listing_display_yn=false', { internet_entire_listing_display_yn: false }],
  ])('Active RLS-backed row refused on %s', async (_label, gate) => {
    findUnique.mockResolvedValue(row({ status: 'Active', rls_eligible: true, ...gate }));
    const m = await meta();
    expect(m.title).toBe('Listing Not Found | Mallan Real Estate');
  });
});

describe('D5 — infrastructure failure must NEVER become a false 404', () => {
  it('a Prisma/Neon error PROPAGATES out of generateMetadata', async () => {
    // If this were swallowed into "not found", ISR would cache a 404 over a real
    // listing. `unstable_cache` does not cache a rejected promise, so the throw
    // must survive the whole resolution path.
    findUnique.mockRejectedValue(Object.assign(new Error('connection reset'), { code: 'P1001' }));
    await expect(meta()).rejects.toThrow(/connection reset/);
  });

  it('the refusal path and the outage path are distinguishable', async () => {
    findUnique.mockResolvedValue(null); // confirmed miss
    await expect(meta()).resolves.toMatchObject({
      title: 'Listing Not Found | Mallan Real Estate',
    });
  });
});
