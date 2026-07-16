/// <reference types="jest" />
/**
 * Crawl-cache P0 — the minimal canonical-redirect resolver.
 *
 * Proves the core of the fix: an ID-only or hybrid alias URL resolves its redirect target
 * with ONE narrow indexed read that uses a `select` (NO listing_media `include`, no DTO
 * build), display gates stay intact, address suppression never leaks into the redirect
 * target, and infrastructure errors propagate (never a silent null → cached 404).
 */

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { listing: { findUnique: jest.fn(), findMany: jest.fn() } },
}));

import prisma from '@/lib/prisma';
import {
  isAliasShape,
  canonicalPathForRow,
  resolveCanonicalTargetUncached,
} from '@/lib/listings/listing-canonical-target';

const mockPrisma = prisma as unknown as {
  listing: { findUnique: jest.Mock; findMany: jest.Mock };
};

// A real synced Cotality row shape (snake_case DB columns only — no invented fields).
const displayableRow = {
  listing_id: 'RLS20102994',
  mls_id: 'RLS20102994',
  address: {
    StreetNumber: '237',
    StreetName: 'Madison Avenue',
    UnitNumber: '804',
    City: 'New York City',
    StateOrProvince: 'NY',
    PostalCode: '10016',
  },
  postal_code: '10016',
  rls_eligible: true,
  status: 'Active',
  idx_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
};

beforeEach(() => {
  mockPrisma.listing.findUnique.mockReset();
  mockPrisma.listing.findMany.mockReset();
});

describe('isAliasShape — canonical vs alias URL classification', () => {
  it('two-segment {address}/{id} is CANONICAL (not an alias)', () => {
    expect(isAliasShape(['237-madison-avenue-apt-804-new-york-city-ny-10016', 'rls20102994'])).toBe(false);
  });
  it('single `listing-{id}` (address-suppressed canonical) is NOT an alias', () => {
    expect(isAliasShape(['listing-rls20102994'])).toBe(false);
  });
  it('bare id is an ALIAS', () => {
    expect(isAliasShape(['rls20102994'])).toBe(true);
  });
  it('hybrid {address}-{id} single segment is an ALIAS', () => {
    expect(isAliasShape(['237-madison-avenue-apt-804-new-york-city-ny-10016-rls20102994'])).toBe(true);
  });
  it('legacy address-only single segment is an ALIAS', () => {
    expect(isAliasShape(['400-east-90th-street-apt-17c-new-york-ny-10128'])).toBe(true);
  });
});

describe('resolveCanonicalTargetUncached — ID-only alias', () => {
  it('resolves via a SELECT query — no listing_media include, no findMany', async () => {
    mockPrisma.listing.findUnique.mockResolvedValue(displayableRow);
    const target = await resolveCanonicalTargetUncached('RLS20102994');

    expect(target).not.toBeNull();
    expect(target!.listingId).toBe('RLS20102994');
    expect(target!.canonicalPath).toMatch(/^\/listing\/237-madison[a-z0-9-]*\/rls20102994$/);

    // THE crux: the redirect decision used a narrow `select`, never the media `include`.
    const call = mockPrisma.listing.findUnique.mock.calls[0][0];
    expect(call.select).toBeDefined();
    expect(call.include).toBeUndefined();
    expect(call.select.listing_media).toBeUndefined();
    // And no address-scan / candidate findMany fired for an id lookup.
    expect(mockPrisma.listing.findMany).not.toHaveBeenCalled();
  });
});

describe('resolveCanonicalTargetUncached — legacy hybrid alias', () => {
  it('extracts the embedded id and resolves via a SELECT query (no media, no findMany)', async () => {
    mockPrisma.listing.findUnique.mockResolvedValue(displayableRow);
    const target = await resolveCanonicalTargetUncached(
      '237-madison-avenue-apt-804-new-york-city-ny-10016-rls20102994',
    );

    expect(target!.canonicalPath).toMatch(/^\/listing\/237-madison[a-z0-9-]*\/rls20102994$/);
    // Embedded-id strategy → findUnique by listing_id, SELECT only.
    expect(mockPrisma.listing.findUnique).toHaveBeenCalledTimes(1);
    const call = mockPrisma.listing.findUnique.mock.calls[0][0];
    expect(call.where.listing_id).toBe('RLS20102994');
    expect(call.select).toBeDefined();
    expect(call.include).toBeUndefined();
    expect(mockPrisma.listing.findMany).not.toHaveBeenCalled();
  });
});

describe('address suppression + display gates (compliance)', () => {
  it('an address-suppressed listing redirects to the address-FREE `listing-{id}` form', async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({
      ...displayableRow,
      internet_address_display_yn: false, // suppressed address, entire-listing still displayable
    });
    const target = await resolveCanonicalTargetUncached('RLS20102994');
    // No street address may appear in the redirect target.
    expect(target!.canonicalPath).toBe('/listing/listing-rls20102994');
    expect(target!.canonicalPath).not.toMatch(/madison/i);
  });

  it('a non-displayable listing (idx_display_yn=false) returns null → 404, not a redirect', async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({ ...displayableRow, idx_display_yn: false });
    expect(await resolveCanonicalTargetUncached('RLS20102994')).toBeNull();
  });

  it('an owner-opted-out listing returns null (gate intact)', async () => {
    mockPrisma.listing.findUnique.mockResolvedValue({ ...displayableRow, owner_opt_out: true });
    expect(await resolveCanonicalTargetUncached('RLS20102994')).toBeNull();
  });
});

describe('error semantics', () => {
  it('a confirmed miss returns null', async () => {
    mockPrisma.listing.findUnique.mockResolvedValue(null);
    mockPrisma.listing.findMany.mockResolvedValue([]);
    expect(await resolveCanonicalTargetUncached('RLS_DOES_NOT_EXIST')).toBeNull();
  });

  it('an infrastructure error PROPAGATES (never a silent null that would cache a 404)', async () => {
    mockPrisma.listing.findUnique.mockRejectedValue(new Error('Neon timeout'));
    await expect(resolveCanonicalTargetUncached('RLS20102994')).rejects.toThrow(/timeout/i);
  });
});

describe('canonicalPathForRow — matches the render’s canonical exactly', () => {
  it('displayable → two-segment address path', () => {
    expect(canonicalPathForRow(displayableRow)).toMatch(/^\/listing\/237-madison[a-z0-9-]*\/rls20102994$/);
  });
  it('suppressed → id-only path, no address', () => {
    const p = canonicalPathForRow({ ...displayableRow, internet_address_display_yn: false });
    expect(p).toBe('/listing/listing-rls20102994');
  });
});
