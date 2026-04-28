/**
 * PublicListingDTO — auction field surface (C3c).
 *
 * UCBA Art. I auction exception path: when a listing is being sold via
 * auction, the system surfaces auction_type, auction_start_date,
 * auction_end_date, auction_terms_url to the public DTO so the listing
 * detail page can render an unmissable banner with the bidding deadline.
 *
 * The auction object is null on non-auction listings so the banner
 * component renders nothing (negative test enforced separately).
 *
 * @module lib/compliance/__tests__/auction-public-dto
 */

import { toPublicDTO } from '@/lib/idx/public-dto';
import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';
import type { IDXListing } from '@/lib/idx/types';

/** Minimal IDXListing skeleton for testing the DTO transform. */
function buildIdx(overrides: Partial<IDXListing> = {}): IDXListing {
  return {
    listingId: 'L-1',
    mlsId: 'RBNY-1',
    standardStatus: 'Active',
    listingType: 'sale',
    address: {
      streetNumber: '100',
      streetName: 'Main',
      unitNumber: null,
      city: 'New York',
      stateOrProvince: 'NY',
      postalCode: '10001',
      county: 'New York',
    },
    listPrice: 1_000_000,
    originalListPrice: 1_000_000,
    closePrice: null,
    propertyType: 'Residential',
    propertySubType: null,
    bedroomsTotal: 1,
    bathroomsFull: 1,
    bathroomsHalf: 0,
    livingArea: null,
    lotSizeArea: null,
    yearBuilt: null,
    listingContractDate: '2026-01-01',
    modificationTimestamp: '2026-01-02',
    listAgentMlsId: 'A-1',
    listAgentFullName: 'Test Agent',
    listOfficeMlsId: 'O-1',
    listOfficeName: 'Mallan Real Estate Inc.',
    media: [],
    internetAddressDisplayYN: true,
    internetEntireListingDisplayYN: true,
    _source: 'idx',
    _lastFetched: '2026-01-02',
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: 'REBNY RLS',
      disclaimerRequired: true,
    },
    ...overrides,
  };
}

/** Minimal DbListing skeleton for the DB → DTO transform. */
function buildDb(overrides: Partial<DbListing> = {}): DbListing {
  return {
    id: '1',
    listing_id: 'SL-1',
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'Condo',
    list_price: '1500000',
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: '1200',
    borough: 'Manhattan',
    neighborhood: 'Chelsea',
    address: { StreetNumber: '100', StreetName: 'Main', PostalCode: '10001' },
    features: {},
    media: [],
    agent_info: { ListOfficeName: 'Mallan Real Estate Inc.' },
    rls_eligible: true,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
    listing_contract_date: '2026-01-01',
    modification_timestamp: '2026-01-02',
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    raw_data: {},
    ...overrides,
  };
}

describe('toPublicDTO — auction surface (Trestle/IDX path)', () => {
  it('renders auction=null when auction_yn is undefined (default)', () => {
    const dto = toPublicDTO(buildIdx());
    // Cast — `auction` is the new field added in this PR
    expect((dto as { auction: unknown }).auction).toBeNull();
  });

  it('renders auction=null when auction_yn is explicitly false', () => {
    const dto = toPublicDTO(
      buildIdx({ auction_yn: false } as unknown as Partial<IDXListing>)
    );
    expect((dto as { auction: unknown }).auction).toBeNull();
  });

  it('exposes auction object when auction_yn=true', () => {
    const dto = toPublicDTO(
      buildIdx({
        auction_yn: true,
        auction_type: 'Absolute',
        auction_start_date: new Date('2026-06-01T17:00:00.000Z') as unknown as string,
        auction_end_date: new Date('2026-06-15T17:00:00.000Z') as unknown as string,
        auction_terms_url: 'https://example.com/terms.pdf',
      } as unknown as Partial<IDXListing>)
    );
    const auction = (dto as { auction: { type: string; startDate: string | null; endDate: string; termsUrl: string | null } | null }).auction;
    expect(auction).not.toBeNull();
    expect(auction!.type).toBe('Absolute');
    expect(auction!.startDate).toBe('2026-06-01T17:00:00.000Z');
    expect(auction!.endDate).toBe('2026-06-15T17:00:00.000Z');
    expect(auction!.termsUrl).toBe('https://example.com/terms.pdf');
  });

  it('handles missing termsUrl gracefully (null, not undefined-string)', () => {
    const dto = toPublicDTO(
      buildIdx({
        auction_yn: true,
        auction_type: 'WithReserve',
        auction_end_date: new Date('2026-07-15T20:00:00.000Z') as unknown as string,
      } as unknown as Partial<IDXListing>)
    );
    const auction = (dto as { auction: { termsUrl: string | null } | null }).auction;
    expect(auction).not.toBeNull();
    expect(auction!.termsUrl).toBeNull();
  });
});

describe('dbListingToPublicDTO — auction surface (DB path)', () => {
  it('renders auction=null when auction_yn is null/undefined on the DB row', () => {
    const dto = dbListingToPublicDTO(buildDb());
    expect((dto as { auction: unknown }).auction).toBeNull();
  });

  it('exposes auction object when auction_yn=true on the DB row', () => {
    const dto = dbListingToPublicDTO(
      buildDb({
        auction_yn: true,
        auction_type: 'Minimum',
        auction_start_date: '2026-06-01T17:00:00.000Z',
        auction_end_date: '2026-06-15T17:00:00.000Z',
        auction_terms_url: 'https://example.com/terms.pdf',
      } as unknown as Partial<DbListing>)
    );
    const auction = (dto as { auction: { type: string; startDate: string | null; endDate: string; termsUrl: string | null } | null }).auction;
    expect(auction).not.toBeNull();
    expect(auction!.type).toBe('Minimum');
    expect(auction!.endDate).toBe('2026-06-15T17:00:00.000Z');
    expect(auction!.termsUrl).toBe('https://example.com/terms.pdf');
  });
});

describe('buildAuctionPublic — terms URL scheme safety (XSS defence)', () => {
  // The DTO must NEVER pass a non-http(s) URL through to termsUrl. The
  // listing detail page renders termsUrl as <a href> — a `javascript:`
  // value would otherwise become a clickable XSS vector for every visitor.
  // AU-006 (validator) is the primary gate; this is the second layer.

  type AuctionShape = { termsUrl: string | null } | null;

  function buildAuctionDb(termsUrl: unknown) {
    return buildDb({
      auction_yn: true,
      auction_type: 'Absolute',
      auction_end_date: '2026-06-15T17:00:00.000Z',
      auction_terms_url: termsUrl,
    } as unknown as Partial<DbListing>);
  }

  for (const unsafe of [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)',
    '   javascript:alert(1)   ',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'about:blank',
    '/relative/path',
    'example.com/terms.pdf',
    'mailto:agent@mallan.nyc',
  ]) {
    it(`yields termsUrl=null for unsafe input: ${unsafe.slice(0, 40)}`, () => {
      const dto = dbListingToPublicDTO(buildAuctionDb(unsafe));
      const auction = (dto as { auction: AuctionShape }).auction;
      expect(auction).not.toBeNull();
      expect(auction!.termsUrl).toBeNull();
    });
  }

  for (const safe of [
    'http://example.com/terms.pdf',
    'https://example.com/terms.pdf',
    'HTTPS://EXAMPLE.COM/TERMS.PDF',
    '  https://example.com/terms.pdf  ',
  ]) {
    it(`preserves safe http(s) URL: ${safe.slice(0, 40)}`, () => {
      const dto = dbListingToPublicDTO(buildAuctionDb(safe));
      const auction = (dto as { auction: AuctionShape }).auction;
      expect(auction).not.toBeNull();
      expect(auction!.termsUrl).toBe(safe.trim());
    });
  }
});
