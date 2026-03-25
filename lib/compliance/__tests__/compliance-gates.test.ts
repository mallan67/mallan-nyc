/**
 * Compliance Gate Tests — Distribution, PublicDTO, Validation, RLS Enforcement, Sanitization
 *
 * Tests the critical compliance pipeline that protects against:
 * - $40,000 UCBA violations (unauthorized display, data leakage)
 * - Fair Housing violations ($250/$500 + termination)
 * - NAR Settlement field violations
 * - Address/PII leakage
 *
 * @module lib/compliance/__tests__/compliance-gates.test
 */

import { checkDistributionGates, validateRequiredFields } from '@/lib/idx/trestle-mapper';
import { toPublicDTO } from '@/lib/idx/public-dto';
import { assertRlsCompliantPayload } from '@/lib/compliance/rls-enforcement';
import { escapeHtml } from '@/lib/sanitize';
import type { IDXListing } from '@/lib/idx/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a complete IDXListing with sensible defaults. Override any field via partial. */
function buildMockListing(overrides: Partial<IDXListing> = {}): IDXListing {
  return {
    listingId: 'TEST-123',
    mlsId: 'MLS-456',
    standardStatus: 'Active',
    listingType: 'sale',
    listPrice: 1500000,
    originalListPrice: 1600000,
    closePrice: null,
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
    publicRemarks: 'Beautiful apartment in the heart of Chelsea.',
    privateRemarks: 'Seller motivated. Will accept 1.4M.',
    listingContractDate: '2026-01-01',
    modificationTimestamp: '2026-03-01T00:00:00Z',
    onMarketDate: '2026-01-15',
    closeDate: undefined,
    address: {
      streetNumber: '100',
      streetName: 'Main St',
      unitNumber: '5A',
      city: 'New York',
      stateOrProvince: 'NY',
      postalCode: '10001',
      county: 'New York',
      latitude: 40.7,
      longitude: -74.0,
      cityRegion: 'Chelsea',
    },
    internetAddressDisplayYN: true,
    idxEntireListingDisplayYN: true,
    internetEntireListingDisplayYN: true,
    participantOnlyYN: false,
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

/** Build a raw Trestle record for distribution gate / validation tests. */
function buildRawTrestle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ListingId: 'TEST-123',
    PropertyType: 'Residential',
    ListPrice: 1500000,
    StandardStatus: 'Active',
    StreetNumber: '100',
    StreetName: 'Main St',
    City: 'New York',
    StateOrProvince: 'NY',
    PostalCode: '10001',
    CountyOrParish: 'New York',
    BedroomsTotal: 2,
    BathroomsFull: 2,
    BathroomsHalf: 0,
    BathroomsTotal: 2,
    ListAgentMlsId: 'AGENT-001',
    ListAgentFullName: 'Test Agent',
    ListOfficeMlsId: 'OFFICE-789',
    ListOfficeName: 'Test Brokerage',
    ListingContractDate: '2026-01-01',
    ModificationTimestamp: '2026-03-01T00:00:00Z',
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    IDXEntireListingDisplayYN: true,
    IDXParticipationYN: true,
    ParticipantOnlyYN: false,
    PublicRemarks: 'Beautiful apartment',
    PhotosCount: 1,
    LivingArea: 1200,
    StoriesTotal: 10,
    YearBuilt: 2020,
    AssociationFee: 800,
    AssociationFeeFrequency: 'Monthly',
    TaxAnnualAmount: 12000,
    TaxYear: 2025,
    MlsStatus: 'Active',
    OriginalEntryTimestamp: '2026-01-01T00:00:00Z',
    ActivationDate: '2026-01-15',
    OnMarketDate: '2026-01-15',
    ListingAgreement: 'ExclusiveRightToSell',
    AttendanceType: 'Full-Time',
    StructureType: 'Multi-Story',
    CommonInterest: 'Condominium',
    OwnershipType: 'Fee Simple',
    NewConstructionYN: false,
    OriginalListPrice: 1600000,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DISTRIBUTION GATES (checkDistributionGates)
// ═══════════════════════════════════════════════════════════════════════════

describe('checkDistributionGates', () => {
  it('blocks IDX display disabled (IDXEntireListingDisplayYN = false)', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ IDXEntireListingDisplayYN: false })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('IDX display disabled');
  });

  it('blocks participant-only listings (ParticipantOnlyYN = true)', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ ParticipantOnlyYN: true })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('Participant-only');
  });

  it('blocks when internet display is disabled (InternetEntireListingDisplayYN = false)', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ InternetEntireListingDisplayYN: false })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('Internet display disabled');
  });

  it('blocks when IDX participation is disabled (IDXParticipationYN = false)', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ IDXParticipationYN: false })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('IDX participation disabled');
  });

  it('passes active listing with all gates open', () => {
    const result = checkDistributionGates(buildRawTrestle());
    expect(result.displayable).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('passes Coming Soon listings (flagged, not blocked)', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ StandardStatus: 'Coming Soon' })
    );
    expect(result.displayable).toBe(true);
  });

  it('blocks closed listing > 24 hours old', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = checkDistributionGates(
      buildRawTrestle({ StandardStatus: 'Closed', CloseDate: twoDaysAgo })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('Closed listing > 24 hours');
  });

  it('passes closed listing < 24 hours old', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const result = checkDistributionGates(
      buildRawTrestle({ StandardStatus: 'Closed', CloseDate: twoHoursAgo })
    );
    expect(result.displayable).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. PUBLIC DTO (toPublicDTO)
// ═══════════════════════════════════════════════════════════════════════════

describe('toPublicDTO', () => {
  it('suppresses address when internetAddressDisplayYN = false', () => {
    const listing = buildMockListing({ internetAddressDisplayYN: false });
    const dto = toPublicDTO(listing);

    expect(dto.address.streetName).toBe('Address Undisclosed');
    expect(dto.address.streetNumber).toBe('');
    expect(dto.address.latitude).toBeUndefined();
    expect(dto.address.longitude).toBeUndefined();
  });

  it('includes full address when internetAddressDisplayYN = true', () => {
    const listing = buildMockListing({ internetAddressDisplayYN: true });
    const dto = toPublicDTO(listing);

    expect(dto.address.streetName).toBe('Main St');
    expect(dto.address.streetNumber).toBe('100');
    expect(dto.address.latitude).toBe(40.7);
    expect(dto.address.longitude).toBe(-74.0);
  });

  it('strips agent PII — no email, no MLS IDs in output', () => {
    const listing = buildMockListing({
      listAgentEmail: 'secret@brokerage.com',
      listAgentMlsId: 'AGENT-SECRET-001',
      listOfficeMlsId: 'OFFICE-SECRET-789',
    });
    const dto = toPublicDTO(listing);
    const json = JSON.stringify(dto);

    // Office name IS included (public attribution = broker/office only)
    expect(dto.listOfficeName).toBe('Test Brokerage');
    // Agent name must NOT be in public DTO (REBNY: public attribution = office only)
    expect(json).not.toContain('listAgentFullName');

    // PII must NOT be present anywhere in the DTO
    expect(json).not.toContain('secret@brokerage.com');
    expect(json).not.toContain('AGENT-SECRET-001');
    expect(json).not.toContain('OFFICE-SECRET-789');
    expect(json).not.toContain('listAgentEmail');
    expect(json).not.toContain('listAgentMlsId');
    expect(json).not.toContain('listOfficeMlsId');
  });

  it('never includes private remarks', () => {
    const listing = buildMockListing({
      privateRemarks: 'TOP SECRET: Seller desperate, will take lowball.',
    });
    const dto = toPublicDTO(listing);
    const json = JSON.stringify(dto);

    expect(json).not.toContain('TOP SECRET');
    expect(json).not.toContain('privateRemarks');
    expect(json).not.toContain('Seller desperate');
  });

  it('proxies Trestle media URLs through /api/media/proxy', () => {
    const listing = buildMockListing({
      media: [
        { url: 'https://api.cotality.com/trestle/media/photo1.jpg', mediaType: 'Photo', order: 0 },
        { url: 'https://cdn.example.com/photo2.jpg', mediaType: 'Photo', order: 1 },
      ],
    });
    const dto = toPublicDTO(listing);

    // Trestle URL should be proxied
    expect(dto.media[0].url).toContain('/api/media/proxy');
    expect(dto.media[0].url).toContain(encodeURIComponent('https://api.cotality.com/trestle/media/photo1.jpg'));

    // Non-Trestle URL should pass through unchanged
    expect(dto.media[1].url).toBe('https://cdn.example.com/photo2.jpg');
  });

  it('sets comingSoon flag in _displayCompliance for Coming Soon listings', () => {
    const listing = buildMockListing({ standardStatus: 'Coming Soon' });
    const dto = toPublicDTO(listing);

    expect(dto._displayCompliance.comingSoon).toBe(true);
  });

  it('does not set comingSoon flag for Active listings', () => {
    const listing = buildMockListing({ standardStatus: 'Active' });
    const dto = toPublicDTO(listing);

    expect(dto._displayCompliance.comingSoon).toBeUndefined();
  });

  it('includes REBNY attribution in _displayCompliance', () => {
    const listing = buildMockListing();
    const dto = toPublicDTO(listing);

    expect(dto._displayCompliance.requiresAttribution).toBe(true);
    expect(dto._displayCompliance.attributionText).toBeTruthy();
    expect(dto._displayCompliance.disclaimerRequired).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. REQUIRED FIELDS VALIDATOR (validateRequiredFields)
// ═══════════════════════════════════════════════════════════════════════════

describe('validateRequiredFields', () => {
  it('passes a complete record', () => {
    const result = validateRequiredFields(buildRawTrestle());
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  it('fails when ListingId is missing', () => {
    const raw = buildRawTrestle();
    delete raw.ListingId;
    const result = validateRequiredFields(raw);

    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('ListingId');
  });

  it('fails when ListPrice is missing', () => {
    const raw = buildRawTrestle();
    delete raw.ListPrice;
    const result = validateRequiredFields(raw);

    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('ListPrice');
  });

  it('reports all missing fields, not just the first', () => {
    const raw = buildRawTrestle();
    delete raw.ListingId;
    delete raw.ListPrice;
    delete raw.PropertyType;
    const result = validateRequiredFields(raw);

    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('ListingId');
    expect(result.missingFields).toContain('ListPrice');
    expect(result.missingFields).toContain('PropertyType');
    expect(result.missingFields.length).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. RLS ENFORCEMENT (assertRlsCompliantPayload)
// ═══════════════════════════════════════════════════════════════════════════

describe('assertRlsCompliantPayload', () => {
  /** Minimal valid payload for enforcement tests. */
  function buildValidPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      // Property identification
      PropertyType: 'Residential',
      PropertySubType: 'Apartment',
      StructureType: 'HighRise',
      CommonInterest: 'Condominium',
      ListPrice: 1500000,
      MlsStatus: 'Active',
      StandardStatus: 'Active',
      // Agent / Office / Agreement
      ListAgentMlsId: 'AGENT-001',
      ListingAgreement: 'ExclusiveRightToSell',
      CoBrokeAgreement: 'Ucba',
      Concessions: 'No',
      // Address
      StreetNumber: '400',
      StreetName: 'Main St',
      City: 'NewYorkCity',
      CityRegion: 'Manhattan',
      StateOrProvince: 'NY',
      PostalCode: '10001',
      PostalCity: 'New York',
      CountyOrParish: 'NewYork',
      SubdivisionName: 'Midtown',
      UnParsedAddress: '400 Main St, New York, NY 10001',
      // Building info
      AttendanceType: 'DoormanFullTime',
      BuildingLaundryFeatures: 'InUnit',
      BuildingPetsAllowed: 'BuildingYes',
      PetsAllowed: 'UnitYes',
      BuildingTaxLot: '1234',
      TaxBlock: '567',
      ElevatorsTotal: 2,
      GarageYN: false,
      NumberOfUnitsTotal: 100,
      StoriesTotal: 20,
      NewConstructionYN: false,
      NewDevelopmentYN: false,
      YearBuilt: 2005,
      // Unit info
      BathroomsFull: 2,
      BathroomsHalf: 1,
      BathroomsTotal: 3,
      BedroomsTotal: 2,
      RoomsTotal: 6,
      // Distribution gates
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      InternetAutomatedValuationDisplayYN: true,
      InternetConsumerCommentYN: true,
      IDXEntireListingDisplayYN: true,
      SyndicateYN: true,
      // Content / Dates
      PublicRemarks: 'Spacious 2BR with great natural light.',
      ShowingInstructions: 'Call listing agent to schedule',
      ExpirationDate: '2027-01-15',
      ListingContractDate: '2026-01-01',
      // System-generated (set by backend, included for completeness)
      OriginalEntryTimestamp: '2026-01-01T00:00:00Z',
      OnMarketDate: '2026-01-15',
      SourceSystemKey: 'SYS-123',
      // Condo conditional fields (required since CommonInterest=Condominium)
      AssociationFee: 1200,
      AssociationFeeFrequency: 'Monthly',
      FlipTax: 0,
      MaximumFinancingPercent: 90,
      MaximumFinancingRemarks: 'Standard financing',
      TaxAbatementYN: false,
      SpecialListingConditions: 'Standard',
      PercentOfCommonElements: 1.5,
      TaxMonthlyAmount: 800,
      LivingArea: 1200,
      LivingAreaUnits: 'SquareFeet',
      TaxLot: '1234',
      PropertyCondition: 'Good',
      UnitNumber: '17C',
      ...overrides,
    };
  }

  const saleCtx = { listingType: 'sale' as const };
  const rentCtx = { listingType: 'rent' as const };

  it('blocks Fair Housing violations in PublicRemarks', () => {
    const payload = buildValidPayload({
      PublicRemarks: 'Perfect for whites only family.',
    });
    const result = assertRlsCompliantPayload(payload, saleCtx);

    expect(result.passed).toBe(false);
    expect(result.blockers.some(b => b.code === 'FH-001')).toBe(true);
  });

  it('blocks agent contact info in PublicRemarks', () => {
    const payload = buildValidPayload({
      PublicRemarks: 'Call me at 212-555-1234 for a showing.',
    });
    const result = assertRlsCompliantPayload(payload, saleCtx);

    expect(result.passed).toBe(false);
    expect(result.blockers.some(b => b.code === 'AI-001')).toBe(true);
  });

  it('blocks off-market language in PublicRemarks', () => {
    const payload = buildValidPayload({
      PublicRemarks: 'This is a pocket listing, very exclusive.',
    });
    const result = assertRlsCompliantPayload(payload, saleCtx);

    expect(result.passed).toBe(false);
    expect(result.blockers.some(b => b.code === 'OM-001')).toBe(true);
  });

  it('blocks compensation language in PublicRemarks', () => {
    const payload = buildValidPayload({
      PublicRemarks: 'Offering 3% commission co-broke to buyer agents.',
    });
    const result = assertRlsCompliantPayload(payload, saleCtx);

    expect(result.passed).toBe(false);
    expect(result.blockers.some(b => b.code === 'CL-001')).toBe(true);
  });

  it('blocks removed NAR Settlement fields', () => {
    const payload = buildValidPayload({
      BuyerAgencyCompensation: '2.5%',
    });
    const result = assertRlsCompliantPayload(payload, saleCtx);

    expect(result.passed).toBe(false);
    expect(result.blockers.some(b => b.code === 'RF-001')).toBe(true);
    expect(result.blockers.some(b => b.field === 'BuyerAgencyCompensation')).toBe(true);
  });

  it('blocks Coming Soon status on rental listings (UCBA D1)', () => {
    const payload = buildValidPayload({
      MlsStatus: 'ComingSoon',
      ActivationDate: '2026-02-01',
    });
    const result = assertRlsCompliantPayload(payload, rentCtx);

    expect(result.passed).toBe(false);
    expect(result.blockers.some(b => b.code === 'CS-001')).toBe(true);
  });

  it('blocks Coming Soon period exceeding 14 days (UCBA D2)', () => {
    const payload = buildValidPayload({
      MlsStatus: 'ComingSoon',
      ActivationDate: '2026-02-20',
      OnMarketDate: '2026-01-01', // 50 days gap
    });
    const result = assertRlsCompliantPayload(payload, saleCtx);

    expect(result.passed).toBe(false);
    expect(result.blockers.some(b => b.code === 'CS-003')).toBe(true);
  });

  it('passes a fully compliant sale payload', () => {
    const payload = buildValidPayload();
    const result = assertRlsCompliantPayload(payload, saleCtx);

    expect(result.passed).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. SANITIZATION (escapeHtml)
// ═══════════════════════════════════════════════════════════════════════════

describe('escapeHtml', () => {
  it('escapes ampersand (&)', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('escapes less-than (<)', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than (>)', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes (")', () => {
    expect(escapeHtml('She said "hello"')).toBe('She said &quot;hello&quot;');
  });

  it("escapes single quotes (')", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it('handles all 5 characters in one string', () => {
    const input = `<div class="test" data-name='A & B'>`;
    const expected = '&lt;div class=&quot;test&quot; data-name=&#39;A &amp; B&#39;&gt;';
    expect(escapeHtml(input)).toBe(expected);
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('returns safe string unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});
