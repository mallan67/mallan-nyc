/**
 * VOW Tier Separation Tests
 *
 * Verifies that PublicListingDTO (IDX tier) does NOT include VOW-restricted fields,
 * and that VOWListingDTO correctly extends PublicListingDTO with those fields.
 *
 * COMPLIANCE:
 * - VOW fields (ClosePrice, OriginalListPrice, PreviousListPrice, DaysOnMarket,
 *   CumulativeDaysOnMarket) must ONLY be shown to authenticated portal users.
 * - Public/IDX display must NOT include these fields.
 * - Violation = $40,000 UCBA damages + potential license suspension.
 *
 * @module lib/compliance/__tests__/vow-tier-separation.test
 */

import { toPublicDTO, type PublicListingDTO } from '@/lib/idx/public-dto';
import { toVOWDTO, type VOWListingDTO } from '@/lib/idx/vow-dto';
import type { IDXListing } from '@/lib/idx/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a complete IDXListing with sensible defaults. Override any field via partial. */
function buildMockListing(overrides: Partial<IDXListing> = {}): IDXListing {
  return {
    listingId: 'VOW-TEST-001',
    mlsId: 'MLS-VOW-001',
    standardStatus: 'Sold',
    listingType: 'sale',
    listPrice: 1500000,
    originalListPrice: 1600000,
    previousListPrice: 1550000,
    closePrice: 1450000,
    bedroomsTotal: 2,
    bathroomsFull: 2,
    bathroomsHalf: 0,
    livingArea: 1200,
    lotSizeArea: null,
    yearBuilt: 2020,
    propertyType: 'Residential',
    propertySubType: null,
    commonInterest: 'Condominium',
    listOfficeName: 'Test Brokerage',
    listOfficeMlsId: 'OFFICE-789',
    listAgentFullName: 'Test Agent',
    listAgentMlsId: 'AGENT-001',
    listAgentEmail: 'agent@test.com',
    media: [
      { url: 'https://api.cotality.com/trestle/media/123.jpg', mediaType: 'Photo', order: 0 },
    ],
    photosCount: 1,
    publicRemarks: 'Beautiful apartment with park views.',
    listingContractDate: '2026-01-01',
    modificationTimestamp: '2026-03-01T00:00:00Z',
    onMarketDate: '2026-01-15',
    closeDate: '2026-03-01',
    address: {
      streetNumber: '200',
      streetName: 'Park Ave',
      unitNumber: '10B',
      city: 'New York',
      stateOrProvince: 'NY',
      postalCode: '10017',
      county: 'New York',
      latitude: 40.75,
      longitude: -73.97,
      cityRegion: 'Midtown',
    },
    internetAddressDisplayYN: true,
    idxEntireListingDisplayYN: true,
    internetEntireListingDisplayYN: true,
    participantOnlyYN: false,
    daysOnMarket: 45,
    cumulativeDaysOnMarket: 60,
    _source: 'idx',
    _lastFetched: '2026-03-01T00:00:00Z',
    _displayCompliance: {
      requiresAttribution: true,
      attributionText: 'Listing courtesy of REBNY RLS',
      disclaimerRequired: true,
    },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PUBLIC DTO — VOW fields MUST NOT be present
// ═══════════════════════════════════════════════════════════════════════════

describe('toPublicDTO — VOW field exclusion', () => {
  it('must NOT include closePrice', () => {
    const listing = buildMockListing({ closePrice: 1450000 });
    const dto = toPublicDTO(listing);
    expect((dto as Record<string, unknown>).closePrice).toBeUndefined();
  });

  it('must NOT include originalListPrice', () => {
    const listing = buildMockListing({ originalListPrice: 1600000 });
    const dto = toPublicDTO(listing);
    expect((dto as Record<string, unknown>).originalListPrice).toBeUndefined();
  });

  it('must NOT include previousListPrice', () => {
    const listing = buildMockListing({ previousListPrice: 1550000 });
    const dto = toPublicDTO(listing);
    expect((dto as Record<string, unknown>).previousListPrice).toBeUndefined();
  });

  it('must NOT include daysOnMarket', () => {
    const listing = buildMockListing({ daysOnMarket: 45 });
    const dto = toPublicDTO(listing);
    expect((dto as Record<string, unknown>).daysOnMarket).toBeUndefined();
  });

  it('must NOT include cumulativeDaysOnMarket', () => {
    const listing = buildMockListing({ cumulativeDaysOnMarket: 60 });
    const dto = toPublicDTO(listing);
    expect((dto as Record<string, unknown>).cumulativeDaysOnMarket).toBeUndefined();
  });

  it('MUST include listPrice (IDX-safe)', () => {
    const listing = buildMockListing({ listPrice: 1500000 });
    const dto = toPublicDTO(listing);
    expect(dto.listPrice).toBe(1500000);
  });

  it('MUST include status (IDX-safe)', () => {
    const listing = buildMockListing({ standardStatus: 'Active' });
    const dto = toPublicDTO(listing);
    expect(dto.status).toBe('Active');
  });

  it('MUST include closeDate (used for status display, not a price field)', () => {
    const listing = buildMockListing({ closeDate: '2026-03-01' });
    const dto = toPublicDTO(listing);
    expect(dto.closeDate).toBe('2026-03-01');
  });

  it('VOW fields must not appear anywhere in serialized public DTO', () => {
    const listing = buildMockListing();
    const dto = toPublicDTO(listing);
    const json = JSON.stringify(dto);

    // These VOW field names must not appear as keys in the JSON
    expect(json).not.toContain('"closePrice"');
    expect(json).not.toContain('"originalListPrice"');
    expect(json).not.toContain('"previousListPrice"');
    expect(json).not.toContain('"daysOnMarket"');
    expect(json).not.toContain('"cumulativeDaysOnMarket"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. VOW DTO — MUST include VOW-enriched fields
// ═══════════════════════════════════════════════════════════════════════════

describe('toVOWDTO — VOW-enriched fields for authenticated portal users', () => {
  it('includes closePrice from source listing', () => {
    const listing = buildMockListing({ closePrice: 1450000 });
    const dto = toVOWDTO(listing);
    expect(dto.closePrice).toBe(1450000);
  });

  it('includes originalListPrice from source listing', () => {
    const listing = buildMockListing({ originalListPrice: 1600000 });
    const dto = toVOWDTO(listing);
    expect(dto.originalListPrice).toBe(1600000);
  });

  it('includes previousListPrice from source listing', () => {
    const listing = buildMockListing({ previousListPrice: 1550000 });
    const dto = toVOWDTO(listing);
    expect(dto.previousListPrice).toBe(1550000);
  });

  it('includes closeDate from source listing', () => {
    const listing = buildMockListing({ closeDate: '2026-03-01' });
    const dto = toVOWDTO(listing);
    expect(dto.closeDate).toBe('2026-03-01');
  });

  it('includes daysOnMarket from source listing', () => {
    const listing = buildMockListing({ daysOnMarket: 45 });
    const dto = toVOWDTO(listing);
    expect(dto.daysOnMarket).toBe(45);
  });

  it('includes cumulativeDaysOnMarket from source listing', () => {
    const listing = buildMockListing({ cumulativeDaysOnMarket: 60 });
    const dto = toVOWDTO(listing);
    expect(dto.cumulativeDaysOnMarket).toBe(60);
  });

  it('still includes all IDX-safe fields from PublicListingDTO', () => {
    const listing = buildMockListing();
    const dto = toVOWDTO(listing);

    // PublicListingDTO base fields
    expect(dto.id).toBe('VOW-TEST-001');
    expect(dto.mlsId).toBe('MLS-VOW-001');
    expect(dto.listPrice).toBe(1500000);
    expect(dto.status).toBeTruthy();
    expect(dto.address).toBeTruthy();
    expect(dto.listOfficeName).toBe('Test Brokerage');
    expect(dto._displayCompliance.requiresAttribution).toBe(true);
  });

  it('still strips agent PII (inherits from toPublicDTO)', () => {
    const listing = buildMockListing({
      listAgentEmail: 'secret@broker.com',
      listAgentMlsId: 'AGENT-SECRET',
    });
    const dto = toVOWDTO(listing);
    const json = JSON.stringify(dto);

    expect(json).not.toContain('secret@broker.com');
    expect(json).not.toContain('AGENT-SECRET');
    expect(json).not.toContain('listAgentEmail');
    expect(json).not.toContain('listAgentMlsId');
  });

  it('handles null/undefined VOW fields gracefully', () => {
    const listing = buildMockListing({
      closePrice: null,
      previousListPrice: undefined,
      closeDate: undefined,
      daysOnMarket: undefined,
      cumulativeDaysOnMarket: undefined,
    });
    const dto = toVOWDTO(listing);

    expect(dto.closePrice).toBeNull();
    expect(dto.previousListPrice).toBeUndefined();
    expect(dto.closeDate).toBeUndefined();
    expect(dto.daysOnMarket).toBeUndefined();
    expect(dto.cumulativeDaysOnMarket).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. TIER SEPARATION — public is strictly a subset of VOW
// ═══════════════════════════════════════════════════════════════════════════

describe('tier separation — PublicListingDTO vs VOWListingDTO', () => {
  it('VOW DTO has strictly more fields than Public DTO', () => {
    const listing = buildMockListing();
    const publicDTO = toPublicDTO(listing);
    const vowDTO = toVOWDTO(listing);

    const publicKeys = Object.keys(publicDTO);
    const vowKeys = Object.keys(vowDTO);

    // VOW should have more keys than public (the VOW-enriched fields)
    expect(vowKeys.length).toBeGreaterThan(publicKeys.length);

    // Every public key should exist in VOW
    for (const key of publicKeys) {
      expect(vowKeys).toContain(key);
    }
  });

  it('VOW-only fields are exactly the expected set', () => {
    const listing = buildMockListing();
    const publicDTO = toPublicDTO(listing);
    const vowDTO = toVOWDTO(listing);

    const publicKeys = new Set(Object.keys(publicDTO));
    const vowOnlyKeys = Object.keys(vowDTO).filter(k => !publicKeys.has(k));

    // The VOW-only keys should be exactly these
    expect(vowOnlyKeys.sort()).toEqual([
      'closePrice',
      'cumulativeDaysOnMarket',
      'daysOnMarket',
      'originalListPrice',
      'previousListPrice',
    ]);
  });
});
