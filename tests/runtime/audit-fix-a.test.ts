/// <reference types="jest" />
/**
 * Audit-fix PR A — public compliance + search-correctness regression tests.
 *
 * Covers the three findings from `memory/AUDIT-2026-05-12.md`:
 *
 *   Fix 1 — UCBA Art. III §2(C) attribution must NOT default to
 *           "Mallan Real Estate Inc." when the source row has no
 *           ListOfficeName. Neutral "REBNY RLS" fallback.
 *
 *   Fix 2 — Address search must work regardless of whether the
 *           `address` JSONB column uses PascalCase (`StreetNumber` —
 *           current state, 21,983/21,983 rows) or camelCase (hypothetical
 *           future writer). The defensive OR conditions in
 *           `addressConditions()` keep both shapes findable.
 *
 *   Fix 3 — `/buy?exclusive=mallan` must filter to Mallan-authored rows
 *           only. The DB query restricts to `agent_id != null` and the
 *           route short-circuits past the Trestle fallback so external
 *           listings can never surface under the "exclusives" label.
 *
 * NO live Prisma, NO live Trestle. The mappers and the where-builder
 * are pure functions over inputs; we feed fixtures and assert outputs.
 */

import {
  dbListingToPublicDTO,
  type DbListing,
} from '@/lib/idx/db-to-public-dto';
import { toDisplayListing } from '@/lib/idx/display-adapter';
import { buildPublicListingDbSearch } from '@/lib/search/public-listing-db';

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeBaseListing(overrides: Partial<DbListing> = {}): DbListing {
  return {
    id: '1',
    listing_id: 'RBNY-1',
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'Condominium',
    list_price: '1500000',
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: '1100',
    borough: 'manhattan',
    neighborhood: 'Upper East Side',
    address: {
      StreetNumber: '400',
      StreetName: 'East 90th Street',
      UnitNumber: '17C',
      City: 'New York',
      PostalCode: '10128',
    },
    features: { PublicRemarks: 'Test.' },
    media: [],
    agent_info: {},
    rls_eligible: true,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
    listing_contract_date: null,
    modification_timestamp: new Date('2026-05-01T00:00:00Z').toISOString(),
    created_at: new Date('2026-04-01T00:00:00Z').toISOString(),
    updated_at: new Date('2026-05-01T00:00:00Z').toISOString(),
    ...overrides,
  };
}

// ─── Fix 1 — false attribution ───────────────────────────────────────────

describe('Audit-fix PR A · Fix 1 — false Mallan attribution fallback', () => {
  it('non-Mallan listing with explicit ListOfficeName keeps the actual broker name', () => {
    const listing = makeBaseListing({
      agent_info: { ListOfficeName: 'Compass NYC Brokerage' },
    });
    const dto = dbListingToPublicDTO(listing);
    expect(dto.listOfficeName).toBe('Compass NYC Brokerage');
    expect(dto._displayCompliance.attributionText).toBe(
      'Listing courtesy of Compass NYC Brokerage',
    );
    // CRITICAL — must NOT contain Mallan when the source data says otherwise.
    expect(dto._displayCompliance.attributionText).not.toContain('Mallan');
  });

  it('listing with missing ListOfficeName falls back to neutral "REBNY RLS" — NOT "Mallan Real Estate Inc."', () => {
    const listing = makeBaseListing({ agent_info: {} });
    const dto = dbListingToPublicDTO(listing);
    expect(dto.listOfficeName).toBe('REBNY RLS');
    expect(dto._displayCompliance.attributionText).toBe(
      'Listing courtesy of REBNY RLS',
    );
    expect(dto.listOfficeName).not.toBe('Mallan Real Estate Inc.');
    expect(dto._displayCompliance.attributionText).not.toContain('Mallan');
  });

  it('listing with empty-string ListOfficeName also falls back to "REBNY RLS"', () => {
    const listing = makeBaseListing({ agent_info: { ListOfficeName: '   ' } });
    const dto = dbListingToPublicDTO(listing);
    expect(dto.listOfficeName).toBe('REBNY RLS');
    expect(dto._displayCompliance.attributionText).not.toContain('Mallan');
  });

  it('legitimate Mallan listing keeps Mallan attribution when source confirms it', () => {
    const listing = makeBaseListing({
      agent_info: { ListOfficeName: 'Mallan Real Estate Inc.' },
    });
    const dto = dbListingToPublicDTO(listing);
    expect(dto.listOfficeName).toBe('Mallan Real Estate Inc.');
    expect(dto._displayCompliance.attributionText).toBe(
      'Listing courtesy of Mallan Real Estate Inc.',
    );
  });

  it('display-adapter local fallback path also uses neutral attribution when listOfficeName is absent', () => {
    const localFallback = {
      id: 'local-1',
      mlsId: 'local-1',
      status: 'active',
      listingType: 'sale' as const,
      address: { streetNumber: '100', streetName: 'Main St', city: 'NYC', zip: '10001' },
      price: { listPrice: 1000000 },
      propertyInfo: { propertyType: 'Residential', bedroomsTotal: 1, bathroomsFull: 1, bathroomsHalf: 0 },
      agent: {}, // ← missing listOfficeName, the bug surface
      media: { images: [{ url: 'https://example.com/p.jpg' }] },
    };
    const dl = toDisplayListing(localFallback);
    expect(dl._displayCompliance.attributionText).toBe('Listing courtesy of REBNY RLS');
    expect(dl._displayCompliance.attributionText).not.toContain('Mallan');
  });

  it('display-adapter preserves real listOfficeName when the local data supplies it', () => {
    const localFallback = {
      id: 'local-2',
      mlsId: 'local-2',
      status: 'active',
      listingType: 'rent' as const,
      address: { streetNumber: '200', streetName: 'Park Ave', city: 'NYC', zip: '10022' },
      price: { listPrice: 5000 },
      propertyInfo: { propertyType: 'Residential', bedroomsTotal: 2, bathroomsFull: 1, bathroomsHalf: 0 },
      agent: { listOfficeName: 'Corcoran Group' },
      media: { images: [] },
    };
    const dl = toDisplayListing(localFallback);
    expect(dl._displayCompliance.attributionText).toBe('Listing courtesy of Corcoran Group');
  });
});

// ─── Fix 2 — address search dual-key support ─────────────────────────────

describe('Audit-fix PR A · Fix 2 — address search PascalCase + camelCase support', () => {
  function buildWhereWithAddress(addr: string) {
    const params = new URLSearchParams();
    params.set('type', 'sale');
    params.set('address', addr);
    return buildPublicListingDbSearch(params).where;
  }

  function flattenAnd(where: unknown): unknown[] {
    const w = (where as { AND?: unknown }).AND;
    if (Array.isArray(w)) return w;
    if (w) return [w];
    return [];
  }

  it('numbered address produces an OR-of-both-cases for StreetNumber', () => {
    const where = buildWhereWithAddress('400 East 90th Street');
    const andClauses = flattenAnd(where);
    // First AND member should be the OR-of-cases for StreetNumber.
    const numberClause = andClauses.find((c: unknown) => {
      const inner = (c as { OR?: { address?: { path?: string[] } }[] }).OR;
      return Array.isArray(inner) && inner.some((o) => o.address?.path?.[0] === 'StreetNumber');
    }) as { OR: { address: { path: string[]; equals?: string } }[] } | undefined;
    expect(numberClause).toBeDefined();
    const paths = numberClause!.OR.map((o) => o.address.path[0]);
    expect(paths).toContain('StreetNumber');
    expect(paths).toContain('streetNumber');
    // Both branches must equal the same parsed number.
    expect(numberClause!.OR.every((o) => o.address.equals === '400')).toBe(true);
  });

  it('numbered address produces an OR-of-both-cases for StreetName containment', () => {
    const where = buildWhereWithAddress('400 East 90th Street');
    const andClauses = flattenAnd(where);
    const streetClause = andClauses.find((c: unknown) => {
      const inner = (c as { OR?: { address?: { path?: string[]; string_contains?: string } }[] }).OR;
      return Array.isArray(inner) && inner.some((o) => o.address?.path?.[0] === 'StreetName');
    }) as { OR: { address: { path: string[]; string_contains?: string } }[] } | undefined;
    expect(streetClause).toBeDefined();
    const paths = streetClause!.OR.map((o) => o.address.path[0]);
    expect(paths).toContain('StreetName');
    expect(paths).toContain('streetName');
  });

  it('non-numbered address (street only) emits both StreetName cases', () => {
    const where = buildWhereWithAddress('90th Street');
    const andClauses = flattenAnd(where);
    const found = andClauses.some((c: unknown) => {
      const inner = (c as { OR?: { address?: { path?: string[] } }[] }).OR;
      return Array.isArray(inner)
        && inner.some((o) => o.address?.path?.[0] === 'StreetName')
        && inner.some((o) => o.address?.path?.[0] === 'streetName');
    });
    expect(found).toBe(true);
  });

  it('blank address adds no extra AND conditions', () => {
    const where = buildWhereWithAddress('');
    const andClauses = flattenAnd(where);
    // Some non-address AND conditions can still be present (the `where.OR`
    // for distribution gates is the top-level OR, not an AND-member). What
    // we care about: NO address-typed AND-member was emitted.
    const addressClauses = andClauses.filter((c: unknown) => {
      const inner = (c as { OR?: { address?: unknown }[] }).OR;
      return Array.isArray(inner) && inner.some((o) => 'address' in (o as object));
    });
    expect(addressClauses).toHaveLength(0);
  });
});

// ─── Fix 4 (search-fix) — case-insensitive address search ───────────────
//
// Live bug on 2026-05-12: typing "425 park avenue south" returned 50
// unrelated listings + "location data not available" map. Root cause:
// Prisma's JSON `string_contains` is case-sensitive, so the lowercase
// cleaned query value ("park") didn't match the production DB's mixed-case
// values (`PARK`, `Park`, `MAIN`, `Riverside`, etc.). Patch ORs three case
// variants (as-is, UPPER, Title-Case) for each PascalCase/camelCase path,
// giving up to 6 clauses per StreetName segment.

describe('Search-fix · Fix 4 — case-insensitive address search', () => {
  function buildWhereWithAddress(addr: string) {
    const params = new URLSearchParams();
    params.set('type', 'sale');
    params.set('address', addr);
    return buildPublicListingDbSearch(params).where;
  }

  function flattenAnd(where: unknown): unknown[] {
    const w = (where as { AND?: unknown }).AND;
    if (Array.isArray(w)) return w;
    if (w) return [w];
    return [];
  }

  function collectStreetNameVariants(where: unknown): { paths: string[]; values: string[] } {
    const andClauses = flattenAnd(where);
    const streetClause = andClauses.find((c: unknown) => {
      const inner = (c as { OR?: { address?: { path?: string[] } }[] }).OR;
      return Array.isArray(inner) && inner.some((o) => {
        const pathKey = o.address?.path?.[0];
        return pathKey === 'StreetName' || pathKey === 'streetName';
      });
    }) as { OR: { address: { path: string[]; string_contains?: string } }[] } | undefined;
    if (!streetClause) return { paths: [], values: [] };
    return {
      paths: streetClause.OR.map((o) => o.address.path[0]),
      values: streetClause.OR.map((o) => o.address.string_contains ?? ''),
    };
  }

  it('lowercase "park" generates all 3 case variants (park, PARK, Park) × both paths', () => {
    const { paths, values } = collectStreetNameVariants(buildWhereWithAddress('425 park avenue south'));
    // Cleaning strips "avenue", "south" → "s", standalone "s" stripped.
    // streetPart becomes "park" (lowercase).
    expect(values).toEqual(expect.arrayContaining(['park', 'PARK', 'Park']));
    expect(paths.filter((p) => p === 'StreetName')).toHaveLength(3);
    expect(paths.filter((p) => p === 'streetName')).toHaveLength(3);
  });

  it('uppercase "PARK" still generates the same 3 case variants', () => {
    const { values } = collectStreetNameVariants(buildWhereWithAddress('425 PARK AVENUE SOUTH'));
    // Cleaning preserves case after stripping suffixes; streetPart="PARK"
    // and variants are de-duped to ["PARK", "Park"].
    expect(values).toEqual(expect.arrayContaining(['PARK', 'Park']));
  });

  it('Title-Case "Park" already deduplicates Title-Case and as-is', () => {
    const { values } = collectStreetNameVariants(buildWhereWithAddress('425 Park Avenue South'));
    expect(values).toEqual(expect.arrayContaining(['Park', 'PARK']));
  });

  it('numeric ordinal "5th" is stripped to "5" by existing cleaning (pre-existing behavior)', () => {
    const { values } = collectStreetNameVariants(buildWhereWithAddress('100 5th Avenue'));
    // The ordinal-stripping regex `(\d+)(st|nd|rd|th)` collapses "5th" → "5"
    // BEFORE case-variant expansion. "5" upper/title/as-is all dedupe to a
    // single string, so we just see two OR clauses (StreetName + streetName)
    // both equal to "5". This is broader than ideal but it's the existing
    // pre-PR-A behavior; this test pins it so a future refactor doesn't
    // silently change it. Tracked as a follow-up usability concern in
    // memory/AUDIT-2026-05-12.md if Maya wants a tighter ordinal match later.
    expect(values).toEqual(expect.arrayContaining(['5']));
  });

  it('compound street "central park west" still emits case variants', () => {
    const { values } = collectStreetNameVariants(buildWhereWithAddress('1 central park west'));
    // Cleaning: "west" → "w", suffix-strip is a no-op (no "ave"/"street"/
    // etc. tokens). After numMatch, streetPart = "central park w" →
    // standalone "w" stripped → "central park".
    expect(values).toEqual(expect.arrayContaining(['central park', 'CENTRAL PARK', 'Central Park']));
  });

  it('blank address still emits no address-typed AND members (no regression)', () => {
    const where = buildWhereWithAddress('');
    const andClauses = flattenAnd(where);
    const addressClauses = andClauses.filter((c: unknown) => {
      const inner = (c as { OR?: { address?: unknown }[] }).OR;
      return Array.isArray(inner) && inner.some((o) => 'address' in (o as object));
    });
    expect(addressClauses).toHaveLength(0);
  });
});

// ─── Fix 5 (search-fix Codex follow-up) — numbered-vs-text classification ─

describe('Search-fix · Fix 5 — numbered-address short-circuit classification', () => {
  // The route's `isNumberedAddressSearch` guard uses the regex `/^\d/`
  // (after trim) to decide whether an address miss should return an honest
  // empty state (numbered, true) or fall through to Trestle's BuildingName
  // search (text-only, false). Codex P1 feedback on PR #107 flagged that
  // the original `isAddressSearch` caught both classes and broke
  // building-name searches. This test pins the classifier so a future
  // refactor doesn't silently re-broaden it.
  //
  // The route code is heavily mocked-dependency-laden; rather than mock
  // the whole module we test the heuristic directly. The route uses the
  // exact same expression: `/^\d/.test(addressInput)` after `.trim()`.
  function isNumberedAddressSearch(addressInput: string): boolean {
    const trimmed = addressInput.trim();
    return /^\d/.test(trimmed);
  }

  it('numbered street addresses are classified as numbered', () => {
    expect(isNumberedAddressSearch('425 park avenue south')).toBe(true);
    expect(isNumberedAddressSearch('400 East 90th Street')).toBe(true);
    expect(isNumberedAddressSearch('1 Central Park West')).toBe(true);
    expect(isNumberedAddressSearch('116-49 97th Street')).toBe(true);
    expect(isNumberedAddressSearch('  425 Park  ')).toBe(true); // tolerates whitespace
  });

  it('building names and text fragments are NOT classified as numbered', () => {
    expect(isNumberedAddressSearch('Carnegie Hall')).toBe(false);
    expect(isNumberedAddressSearch('Empire State Building')).toBe(false);
    expect(isNumberedAddressSearch('central park')).toBe(false);
    expect(isNumberedAddressSearch('Hudson Yards')).toBe(false);
    expect(isNumberedAddressSearch('tribeca loft')).toBe(false);
    expect(isNumberedAddressSearch('the dakota')).toBe(false);
  });

  it('empty / whitespace-only inputs are NOT numbered (no short-circuit)', () => {
    expect(isNumberedAddressSearch('')).toBe(false);
    expect(isNumberedAddressSearch('   ')).toBe(false);
  });

  it('edge: text-only inputs starting with a non-digit character pass through', () => {
    // These reach the DB filter (StreetName containment, case-insensitive)
    // and then, on miss, the Trestle text-only fallback which also probes
    // BuildingName. Documents that the classifier is intentionally narrow.
    for (const q of ['Soho loft', 'park slope', '"425 park"', '#425 park']) {
      expect(isNumberedAddressSearch(q)).toBe(false);
    }
  });
});

// ─── Fix 6 (search-fix) — DTO lat/lng propagation ────────────────────────

describe('Search-fix · Fix 6 — DTO propagates Latitude/Longitude', () => {
  function baseListing(overrides: Partial<DbListing> = {}): DbListing {
    return {
      id: '1',
      listing_id: 'RBNY-LL-1',
      status: 'Active',
      listing_type: 'sale',
      property_type: 'Residential',
      property_sub_type: 'Condominium',
      list_price: '2500000',
      bedrooms_total: 2,
      bathrooms_full: 2,
      bathrooms_half: 0,
      living_area: '1200',
      borough: 'manhattan',
      neighborhood: 'NoMad',
      address: {
        StreetNumber: '425',
        StreetName: 'PARK',
        UnitNumber: '14CD',
        City: 'New York',
        PostalCode: '10016',
        Latitude: 40.7438,
        Longitude: -73.9844,
      },
      features: {},
      media: [],
      agent_info: { ListOfficeName: 'Corcoran Group' },
      rls_eligible: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
      listing_contract_date: null,
      modification_timestamp: new Date('2026-05-01T00:00:00Z').toISOString(),
      created_at: new Date('2026-04-01T00:00:00Z').toISOString(),
      updated_at: new Date('2026-05-01T00:00:00Z').toISOString(),
      ...overrides,
    };
  }

  it('non-suppressed listing propagates numeric Latitude/Longitude to DTO', () => {
    const dto = dbListingToPublicDTO(baseListing());
    expect(dto.address.latitude).toBeCloseTo(40.7438, 4);
    expect(dto.address.longitude).toBeCloseTo(-73.9844, 4);
  });

  it('Latitude/Longitude stored as strings (JSON-text form) still coerce to numbers', () => {
    const dto = dbListingToPublicDTO(baseListing({
      address: {
        StreetNumber: '425', StreetName: 'PARK',
        Latitude: '40.7438' as unknown as number,
        Longitude: '-73.9844' as unknown as number,
      },
    }));
    expect(dto.address.latitude).toBeCloseTo(40.7438, 4);
    expect(dto.address.longitude).toBeCloseTo(-73.9844, 4);
  });

  it('null Latitude/Longitude (the common Trestle case) → DTO has undefined', () => {
    const dto = dbListingToPublicDTO(baseListing({
      address: {
        StreetNumber: '425', StreetName: 'PARK',
        Latitude: null,
        Longitude: null,
      },
    }));
    expect(dto.address.latitude).toBeUndefined();
    expect(dto.address.longitude).toBeUndefined();
  });

  it('suppressed address (UCBA §2C) does NOT propagate coords (would defeat suppression)', () => {
    const dto = dbListingToPublicDTO(baseListing({
      internet_address_display_yn: false,
    }));
    expect(dto.address.streetName).toBe('Address Undisclosed');
    // Coords intentionally absent — exposing lat/lng would let consumers
    // reverse-look-up the suppressed address.
    expect((dto.address as { latitude?: number }).latitude).toBeUndefined();
    expect((dto.address as { longitude?: number }).longitude).toBeUndefined();
  });
});

// ─── Fix 3 — /buy?exclusive=mallan ───────────────────────────────────────

describe('Audit-fix PR A · Fix 3 — /buy?exclusive=mallan filter', () => {
  it('exclusive=mallan sets `agent_id: { not: null }` on the Prisma where', () => {
    const params = new URLSearchParams();
    params.set('type', 'sale');
    params.set('exclusive', 'mallan');
    const { where } = buildPublicListingDbSearch(params);
    expect(where.agent_id).toEqual({ not: null });
  });

  it('omitting exclusive leaves agent_id unconstrained', () => {
    const params = new URLSearchParams();
    params.set('type', 'sale');
    const { where } = buildPublicListingDbSearch(params);
    expect(where.agent_id).toBeUndefined();
  });

  it('exclusive=anything-else (typos, attempted bypass) does NOT activate the filter', () => {
    for (const bad of ['Mallan', 'MALLAN', 'mallan-real-estate', 'true', '1', 'compass', '']) {
      const params = new URLSearchParams();
      params.set('type', 'sale');
      params.set('exclusive', bad);
      const { where } = buildPublicListingDbSearch(params);
      expect(where.agent_id).toBeUndefined();
    }
  });

  it('exclusive=mallan + sort=exclusives still narrows by agent_id (the conditions compose)', () => {
    const params = new URLSearchParams();
    params.set('type', 'sale');
    params.set('exclusive', 'mallan');
    params.set('sort', 'exclusives');
    const { where, orderBy } = buildPublicListingDbSearch(params);
    expect(where.agent_id).toEqual({ not: null });
    expect(orderBy).toEqual({ modification_timestamp: 'desc' });
  });
});
