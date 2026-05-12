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
