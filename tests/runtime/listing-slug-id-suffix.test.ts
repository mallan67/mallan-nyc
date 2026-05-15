/// <reference types="jest" />
/**
 * PR-FE.2 Option D (2026-05-15) — listing_id-suffixed slugs + backward compat.
 *
 * Background: REBNY allows multiple brokerages to publish their own
 * RLS listing for the SAME physical apartment (typical NYC luxury
 * new-development scenario — e.g. 50 W 66th St #62 was simultaneously
 * Active from Extell Marketing, Corcoran, and Douglas Elliman). The
 * pre-fix slug generator produced the SAME address-only slug for all
 * three, so:
 *   - 3 distinct listing_id rows existed in the API response
 *   - All 3 cards in /search?tab=buy-residential linked to the same
 *     `/listing/{address-slug}` URL
 *   - Whichever listing the address-fallback lookup matched FIRST
 *     was the one users always landed on regardless of which card
 *     they clicked
 *
 * Fix: append `-{slugified(listing_id)}` to the address slug, so each
 * card now has a unique URL like
 *   /listing/50-w-66th-street-apt-62-new-york-city-ny-10023-rls20061539
 *
 * Backward compat requirement: pre-existing indexed URLs WITHOUT the
 * id suffix must keep resolving. The detail route's Strategy 2
 * (address parse + DB findFirst) provides that — but only if
 * `parseAddressSlug` correctly strips the id suffix when it IS present
 * on incoming URLs (otherwise the trailing `-rlsXXX` leaks into the
 * city / street parse and returns wrong addresses on new-style URLs).
 *
 * This spec pins:
 *   1. `generateListingSlug` appends `-{slugified-id}` when address +
 *      id are both supplied
 *   2. Compliance gate untouched — address-suppressed listings still
 *      fall back to MLS-ID slug (no leak via URL)
 *   3. Empty-address fallback untouched
 *   4. `extractListingIdFromSlug` round-trips the id (lowercase →
 *      uppercase)
 *   5. `extractListingIdFromSlug` returns null on legacy address-only
 *      slugs so callers can fall through to address-parse strategy
 *   6. `stripListingIdSuffix` removes the id suffix for canonical
 *      address-key grouping in `annotateCoListedSiblings`
 *   7. `parseAddressSlug` works correctly on BOTH legacy and new-style
 *      slugs (id suffix stripped before address parse)
 */
import {
  generateListingSlug,
  extractListingIdFromSlug,
  stripListingIdSuffix,
  isMlsIdSlug,
  extractMlsIdFromSlug,
  parseAddressSlug,
} from '@/lib/listing-slug';

describe('generateListingSlug · Option D id-suffix (PR-FE.2)', () => {
  const SAMPLE_ADDRESS = {
    streetNumber: '50',
    streetName: 'W 66th Street',
    unitNumber: '62',
    city: 'New York City',
    stateOrProvince: 'NY',
    postalCode: '10023',
  };

  it('appends listing_id when address + id are both provided', () => {
    const slug = generateListingSlug({
      address: SAMPLE_ADDRESS,
      id: 'RLS20061539',
      mlsId: '1147174284',
      internetAddressDisplayYN: true,
    });
    expect(slug).toBe('50-w-66th-street-apt-62-new-york-city-ny-10023-rls20061539');
  });

  it('produces distinct slugs for 3 brokerages co-listing the same address', () => {
    const a = generateListingSlug({ address: SAMPLE_ADDRESS, id: 'RLS20061539', mlsId: '1147174284', internetAddressDisplayYN: true });
    const b = generateListingSlug({ address: SAMPLE_ADDRESS, id: 'RLS10956475', mlsId: '1092341024', internetAddressDisplayYN: true });
    const c = generateListingSlug({ address: SAMPLE_ADDRESS, id: 'RLS10971329', mlsId: '1092304475', internetAddressDisplayYN: true });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('still falls back to MLS-ID slug when InternetAddressDisplayYN is false (compliance gate intact)', () => {
    const slug = generateListingSlug({
      address: SAMPLE_ADDRESS,
      id: 'RLS20061539',
      mlsId: '1147174284',
      internetAddressDisplayYN: false,
    });
    expect(slug).toBe('listing-1147174284');
    expect(isMlsIdSlug(slug)).toBe(true);
    expect(slug).not.toContain('66th');
    expect(slug).not.toContain('10023');
  });

  it('falls back to MLS-ID slug when streetName is empty or "Address Undisclosed"', () => {
    const a = generateListingSlug({
      address: { ...SAMPLE_ADDRESS, streetName: '' },
      id: 'RLS20061539',
      mlsId: '1147174284',
      internetAddressDisplayYN: true,
    });
    const b = generateListingSlug({
      address: { ...SAMPLE_ADDRESS, streetName: 'Address Undisclosed' },
      id: 'RLS20061539',
      mlsId: '1147174284',
      internetAddressDisplayYN: true,
    });
    expect(a).toBe('listing-1147174284');
    expect(b).toBe('listing-1147174284');
  });

  it('omits the id suffix when id is not provided (legacy callers)', () => {
    const slug = generateListingSlug({
      address: SAMPLE_ADDRESS,
      internetAddressDisplayYN: true,
    });
    expect(slug).toBe('50-w-66th-street-apt-62-new-york-city-ny-10023');
    expect(extractListingIdFromSlug(slug)).toBeNull();
  });
});

describe('extractListingIdFromSlug (PR-FE.2)', () => {
  it('extracts RLS-prefixed listing_id and uppercases it', () => {
    expect(extractListingIdFromSlug('50-w-66th-street-apt-62-new-york-city-ny-10023-rls20061539'))
      .toBe('RLS20061539');
  });

  it('extracts RBNY-prefixed legacy listing_id', () => {
    expect(extractListingIdFromSlug('foo-bar-rbny12345678'))
      .toBe('RBNY12345678');
  });

  it('returns null for legacy address-only slug (no id suffix) — callers should fall back to address parse', () => {
    expect(extractListingIdFromSlug('50-w-66th-street-apt-62-new-york-city-ny-10023'))
      .toBeNull();
  });

  it('returns null for MLS-ID fallback slug (handled by separate extractMlsIdFromSlug helper)', () => {
    const mlsSlug = 'listing-rls20061539';
    expect(isMlsIdSlug(mlsSlug)).toBe(true);
    expect(extractListingIdFromSlug(mlsSlug)).toBeNull();
    // Sanity: the MLS-ID-specific helper still works on it.
    expect(extractMlsIdFromSlug(mlsSlug)).toBe('rls20061539');
  });

  it('returns null when only an address with no recognizable id-pattern suffix', () => {
    expect(extractListingIdFromSlug('400-east-90th-street-apt-17c-new-york-ny-10128'))
      .toBeNull();
  });
});

describe('stripListingIdSuffix (PR-FE.2)', () => {
  it('strips an RLS id suffix from an address slug', () => {
    expect(stripListingIdSuffix('50-w-66th-street-apt-62-new-york-city-ny-10023-rls20061539'))
      .toBe('50-w-66th-street-apt-62-new-york-city-ny-10023');
  });

  it('returns unchanged when no id suffix is present', () => {
    expect(stripListingIdSuffix('400-east-90th-street-apt-17c-new-york-ny-10128'))
      .toBe('400-east-90th-street-apt-17c-new-york-ny-10128');
  });

  it('leaves MLS-ID fallback slugs unchanged (different format, different lookup path)', () => {
    expect(stripListingIdSuffix('listing-rls20061539')).toBe('listing-rls20061539');
  });

  it('3 co-listed slugs strip to the same canonical address key', () => {
    const slugs = [
      '50-w-66th-street-apt-62-new-york-city-ny-10023-rls20061539',
      '50-w-66th-street-apt-62-new-york-city-ny-10023-rls10956475',
      '50-w-66th-street-apt-62-new-york-city-ny-10023-rls10971329',
    ];
    const stripped = new Set(slugs.map(stripListingIdSuffix));
    expect(stripped.size).toBe(1);
    expect(stripped.has('50-w-66th-street-apt-62-new-york-city-ny-10023')).toBe(true);
  });
});

describe('parseAddressSlug · backward + forward compat (PR-FE.2)', () => {
  // Both the legacy address-only and the new Option D suffixed slugs
  // must yield the same address components. This is the property that
  // makes pre-PR-FE.2 indexed URLs still resolvable after deploy.
  const expected = {
    streetNumber: '50',
    postalCode: '10023',
    unitNumber: '62',
  };

  it('parses a legacy address-only slug', () => {
    const result = parseAddressSlug('50-w-66th-street-apt-62-new-york-city-ny-10023');
    expect(result).not.toBeNull();
    expect(result!.streetNumber).toBe(expected.streetNumber);
    expect(result!.postalCode).toBe(expected.postalCode);
    expect(result!.unitNumber).toBe(expected.unitNumber);
  });

  it('parses an Option D id-suffixed slug to the SAME address components', () => {
    const result = parseAddressSlug('50-w-66th-street-apt-62-new-york-city-ny-10023-rls20061539');
    expect(result).not.toBeNull();
    expect(result!.streetNumber).toBe(expected.streetNumber);
    expect(result!.postalCode).toBe(expected.postalCode);
    expect(result!.unitNumber).toBe(expected.unitNumber);
  });

  it('returns null for MLS-ID-only fallback slug (no address to parse)', () => {
    expect(parseAddressSlug('listing-rls20061539')).toBeNull();
  });
});
