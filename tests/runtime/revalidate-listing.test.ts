/// <reference types="jest" />
/**
 * Crawl-cache P0 — change-driven revalidation helper.
 *
 * Proves it targets ONLY the changed listing's canonical path, de-dupes, and is
 * best-effort (a revalidatePath failure never throws into the sync/reconcile write).
 */

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

import { revalidatePath } from 'next/cache';
import {
  revalidateListingCanonical,
  revalidateListingsCanonical,
} from '@/lib/listings/revalidate-listing';

const mockRevalidate = revalidatePath as unknown as jest.Mock;

const row = {
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
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
};

beforeEach(() => mockRevalidate.mockReset());

describe('revalidateListingCanonical', () => {
  it('revalidates exactly the listing’s canonical path', () => {
    const path = revalidateListingCanonical(row);
    expect(path).toMatch(/^\/listing\/237-madison[a-z0-9-]*\/rls20102994$/);
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
    expect(mockRevalidate).toHaveBeenCalledWith(path);
  });

  it('revalidates the address-FREE path for a suppressed listing', () => {
    const path = revalidateListingCanonical({ ...row, internet_address_display_yn: false });
    expect(path).toBe('/listing/listing-rls20102994');
    expect(mockRevalidate).toHaveBeenCalledWith('/listing/listing-rls20102994');
  });

  it('BEST-EFFORT: a revalidatePath failure is swallowed (never throws into the caller)', () => {
    mockRevalidate.mockImplementation(() => {
      throw new Error('revalidatePath called outside a request scope');
    });
    expect(() => revalidateListingCanonical(row)).not.toThrow();
    expect(revalidateListingCanonical(row)).toBeNull();
  });
});

describe('revalidateListingsCanonical (batch)', () => {
  it('de-dupes so each canonical path is revalidated once', () => {
    const count = revalidateListingsCanonical([row, { ...row }, row]);
    expect(count).toBe(1);
  });

  it('counts distinct changed listings', () => {
    const other = { ...row, listing_id: 'RLS20080154', mls_id: 'RLS20080154' };
    const count = revalidateListingsCanonical([row, other]);
    expect(count).toBe(2);
  });
});
