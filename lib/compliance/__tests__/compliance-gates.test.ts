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

import { checkDistributionGates, validateRequiredFields, mapTrestleToPrisma } from '@/lib/idx/trestle-mapper';
import { cotalityRecordToPublicDTO } from '@/lib/idx/cotality-public-dto';
import { filterDisplayableDbListings } from '@/lib/idx/db-to-public-dto';
import type { DbListing } from '@/lib/idx/db-to-public-dto';
import { evaluateDisplayGate } from '@/lib/compliance/gates';
import { assertRlsCompliantPayload } from '@/lib/compliance/rls-enforcement';
import { escapeHtml } from '@/lib/sanitize';

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    // Permission enum (live Trestle 2026-04-19) replaces the legacy
    // ParticipantOnlyYN / IDXParticipationYN / IDXEntireListingDisplayYN booleans.
    Permission: 'IDX',
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
  // NOTE: Dead-field tests removed to match Trestle reality —
  //   `IDXEntireListingDisplayYN`, `ParticipantOnlyYN`, `IDXParticipationYN`
  // do NOT exist on the Trestle $metadata schema (verified live 2026-04-19).
  // They were transcribed from the REBNY English-language checklist, not the
  // OData schema. The live schema uses:
  //   - `Permission` enum (values: OwnerOptOut, Private, ...) — see Gates 1 & 2
  //   - `InternetEntireListingDisplayYN` boolean — see Gate 3
  // See `lib/idx/trestle-mapper.ts:745-810` (checkDistributionGates) and
  // `compliance/IDX-VOW-DISPLAY-RULES.md:31,41` for authoritative mapping.

  it('blocks owner opt-out listings (Permission = "OwnerOptOut")', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ Permission: 'OwnerOptOut' })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('Owner opted out');
  });

  it('blocks participant-only listings (Permission = "Private")', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ Permission: 'Private' })
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

  it('passes active listing with all gates open', () => {
    const result = checkDistributionGates(buildRawTrestle());
    expect(result.displayable).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('passes Coming Soon listings (flagged, not blocked)', () => {
    // Trestle sends StandardStatus as 'ComingSoon' (canonical, no space).
    // normalizeStatus accepts the spaced form too for defensive parsing.
    const result = checkDistributionGates(
      buildRawTrestle({ StandardStatus: 'ComingSoon' })
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
// 2. PUBLIC DTO (the canonical chain: cotalityRecordToPublicDTO)
// ═══════════════════════════════════════════════════════════════════════════

describe('public DTO through THE canonical chain (cotalityRecordToPublicDTO)', () => {
  const dtoOf = (overrides: Record<string, unknown> = {}) =>
    cotalityRecordToPublicDTO(buildRawTrestle({ Latitude: 40.7, Longitude: -74.0, UnitNumber: '5A', ...overrides }), { alreadyGated: true })!;

  it('suppresses address when InternetAddressDisplayYN = false', () => {
    const dto = dtoOf({ InternetAddressDisplayYN: false });
    expect(dto.address.streetName).toBe('Address Undisclosed');
    expect(dto.address.streetNumber).toBe('');
    expect(dto.address.latitude).toBeUndefined();
    expect(dto.address.longitude).toBeUndefined();
  });

  it('includes full address when InternetAddressDisplayYN = true', () => {
    const dto = dtoOf({ InternetAddressDisplayYN: true });
    expect(dto.address.streetName).toBe('Main St');
    expect(dto.address.streetNumber).toBe('100');
    expect(dto.address.latitude).toBe(40.7);
    expect(dto.address.longitude).toBe(-74.0);
  });

  it('strips agent PII — no email, no MLS IDs in output', () => {
    const dto = dtoOf({
      ListAgentEmail: 'secret@brokerage.com',
      ListAgentMlsId: 'AGENT-SECRET-001',
      ListOfficeMlsId: 'OFFICE-SECRET-789',
    });
    const json = JSON.stringify(dto);
    expect(dto.listOfficeName).toBe('Test Brokerage');
    expect(json).not.toContain('listAgentFullName');
    expect(json).not.toContain('secret@brokerage.com');
    expect(json).not.toContain('AGENT-SECRET-001');
    expect(json).not.toContain('OFFICE-SECRET-789');
    expect(json).not.toContain('listAgentEmail');
    expect(json).not.toContain('listAgentMlsId');
    expect(json).not.toContain('listOfficeMlsId');
  });

  it('never includes private remarks', () => {
    const dto = dtoOf({ PrivateRemarks: 'TOP SECRET: Seller desperate, will take lowball.' });
    const json = JSON.stringify(dto);
    expect(json).not.toContain('TOP SECRET');
    expect(json).not.toContain('privateRemarks');
    expect(json).not.toContain('Seller desperate');
  });

  it('proxies Cotality media URLs through /api/media/proxy', () => {
    const dto = dtoOf({
      Media: [
        { MediaURL: 'https://api.cotality.com/trestle/media/photo1.jpg', MediaCategory: 'Photo', Order: 0 },
        { MediaURL: 'https://cdn.example.com/photo2.jpg', MediaCategory: 'Photo', Order: 1 },
      ],
    });
    expect(dto.media[0].url).toContain('/api/media/proxy');
    expect(dto.media[0].url).toContain(encodeURIComponent('https://api.cotality.com/trestle/media/photo1.jpg'));
    expect(dto.media[1].url).toBe('https://cdn.example.com/photo2.jpg');
  });

  it('sets comingSoon flag in _displayCompliance for Coming Soon listings', () => {
    const dto = dtoOf({ StandardStatus: 'ComingSoon', MlsStatus: 'ComingSoon' });
    expect(dto._displayCompliance.comingSoon).toBe(true);
  });

  it('does not set comingSoon flag for Active listings', () => {
    expect(dtoOf({ StandardStatus: 'Active' })._displayCompliance.comingSoon).toBeUndefined();
  });

  it('includes REBNY attribution in _displayCompliance', () => {
    const dto = dtoOf();
    expect(dto._displayCompliance.requiresAttribution).toBe(true);
    expect(dto._displayCompliance.attributionText).toBeTruthy();
    expect(dto._displayCompliance.disclaimerRequired).toBe(true);
    expect(dto._source).toBe('idx');
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
      // the Mallan business status under the Mallan key (a Mallan-authored payload carries no provider status)
      _mallanStatus: 'Active',
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
      UnparsedAddress: '400 Main St, New York, NY 10001',
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
      // Distribution gates — IDXEntireListingDisplayYN and SyndicateYN removed
      // (do not exist on live Trestle, verified 2026-04-19). SyndicateTo is the
      // multi-select picker that replaces the legacy SyndicateYN boolean.
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      InternetAutomatedValuationDisplayYN: true,
      InternetConsumerCommentYN: true,
      SyndicateTo: 'AllOptedIn',
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
      _mallanStatus: 'ComingSoon',
      ActivationDate: '2026-02-01',
    });
    const result = assertRlsCompliantPayload(payload, rentCtx);

    expect(result.passed).toBe(false);
    expect(result.blockers.some(b => b.code === 'CS-001')).toBe(true);
  });

  it('blocks Coming Soon period exceeding 14 days (UCBA D2)', () => {
    const payload = buildValidPayload({
      _mallanStatus: 'ComingSoon',
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

  // ── Auction enforcement (Workstream C3b) ─────────────────────────────
  describe('auction listing enforcement (UCBA Art. I exception)', () => {
    it('blocks auction_yn=true without auction_type', () => {
      const payload = buildValidPayload({
        auction_yn: true,
        auction_end_date: '2026-06-15T18:00:00Z',
      });
      const result = assertRlsCompliantPayload(payload, saleCtx);

      expect(result.passed).toBe(false);
      expect(result.blockers.some(b => b.code === 'AU-001')).toBe(true);
    });

    it('blocks auction_yn=true with invalid auction_type', () => {
      const payload = buildValidPayload({
        auction_yn: true,
        auction_type: 'OnlineOnly',
        auction_end_date: '2026-06-15T18:00:00Z',
      });
      const result = assertRlsCompliantPayload(payload, saleCtx);

      expect(result.passed).toBe(false);
      expect(result.blockers.some(b => b.code === 'AU-002')).toBe(true);
    });

    it('blocks auction_yn=true without auction_end_date', () => {
      const payload = buildValidPayload({
        auction_yn: true,
        auction_type: 'Absolute',
      });
      const result = assertRlsCompliantPayload(payload, saleCtx);

      expect(result.passed).toBe(false);
      expect(result.blockers.some(b => b.code === 'AU-003')).toBe(true);
    });

    it('warns when auction_terms_url is missing (does not block)', () => {
      const payload = buildValidPayload({
        auction_yn: true,
        auction_type: 'Absolute',
        auction_end_date: '2026-06-15T18:00:00Z',
      });
      const result = assertRlsCompliantPayload(payload, saleCtx);

      expect(result.passed).toBe(true);
      expect(result.warnings.some(w => w.code === 'AU-004W')).toBe(true);
    });

    it('passes when auction_yn=true with all required fields', () => {
      const payload = buildValidPayload({
        auction_yn: true,
        auction_type: 'WithReserve',
        auction_end_date: '2026-06-15T18:00:00Z',
        auction_terms_url: 'https://mallan.nyc/auctions/123/terms.pdf',
      });
      const result = assertRlsCompliantPayload(payload, saleCtx);

      expect(result.passed).toBe(true);
      expect(result.blockers).toHaveLength(0);
      expect(result.warnings.some(w => w.code === 'AU-004W')).toBe(false);
    });

    it('does not require auction fields when auction_yn=false', () => {
      const payload = buildValidPayload({ auction_yn: false });
      const result = assertRlsCompliantPayload(payload, saleCtx);

      expect(result.passed).toBe(true);
      expect(result.blockers.some(b => b.code?.startsWith('AU-'))).toBe(false);
    });

    it('does not require auction fields when auction_yn is omitted entirely', () => {
      const payload = buildValidPayload();
      const result = assertRlsCompliantPayload(payload, saleCtx);

      expect(result.passed).toBe(true);
      expect(result.blockers.some(b => b.code?.startsWith('AU-'))).toBe(false);
    });

    it('blocks non-boolean garbage in auction_yn', () => {
      const payload = buildValidPayload({
        auction_yn: 'maybe' as unknown as boolean,
      });
      const result = assertRlsCompliantPayload(payload, saleCtx);

      expect(result.passed).toBe(false);
      expect(result.blockers.some(b => b.code === 'AU-005')).toBe(true);
    });

    it('accepts string "true" coercion (legacy form data)', () => {
      const payload = buildValidPayload({
        auction_yn: 'true' as unknown as boolean,
        auction_type: 'Minimum',
        auction_end_date: '2026-06-15T18:00:00Z',
        auction_terms_url: 'https://mallan.nyc/auctions/456/terms.pdf',
      });
      const result = assertRlsCompliantPayload(payload, saleCtx);

      expect(result.passed).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    // ── AU-006: terms URL must be http(s) (XSS defence) ─────────────────
    // Auction listings render `auction_terms_url` as <a href> on the
    // public listing page. Without this gate a `javascript:` (or `data:`,
    // `vbscript:`, etc.) URL would become a clickable XSS vector for
    // every visitor.

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
      it(`blocks unsafe auction_terms_url scheme via AU-006: ${unsafe.slice(0, 40)}`, () => {
        const payload = buildValidPayload({
          auction_yn: true,
          auction_type: 'Absolute',
          auction_end_date: '2026-06-15T18:00:00Z',
          auction_terms_url: unsafe,
        });
        const result = assertRlsCompliantPayload(payload, saleCtx);

        expect(result.passed).toBe(false);
        expect(result.blockers.some(b => b.code === 'AU-006')).toBe(true);
      });
    }

    for (const safe of [
      'http://example.com/terms.pdf',
      'https://example.com/terms.pdf',
      'HTTPS://EXAMPLE.COM/TERMS.PDF',
      '  https://example.com/terms.pdf  ',
    ]) {
      it(`allows safe http(s) auction_terms_url: ${safe.slice(0, 40)}`, () => {
        const payload = buildValidPayload({
          auction_yn: true,
          auction_type: 'Absolute',
          auction_end_date: '2026-06-15T18:00:00Z',
          auction_terms_url: safe,
        });
        const result = assertRlsCompliantPayload(payload, saleCtx);

        expect(result.passed).toBe(true);
        expect(result.blockers.some(b => b.code === 'AU-006')).toBe(false);
      });
    }
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

// ═══════════════════════════════════════════════════════════════════════════
// 6. FAIL-CLOSED PERMISSION HELPERS
//    Added by PR 1 of master refactor (memory/REFACTOR-2026-04-25.md).
//    Locks in fail-closed behavior at every public-display call site so a
//    null/undefined permission flag from Trestle or our DB never produces a
//    displayable result. UCBA Art. III §2(C) requires this direction.
// ═══════════════════════════════════════════════════════════════════════════

describe('filterDisplayableDbListings — fail-closed on null permission flags', () => {
  function buildDbListing(overrides: Partial<DbListing> = {}): DbListing {
    return {
      id: 'db-test-1',
      listing_id: 'TEST-DB-1',
      status: 'Active',
      listing_type: 'sale',
      property_type: 'Residential',
      property_sub_type: null,
      list_price: '1000000',
      bedrooms_total: 1,
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: '800',
      borough: 'Manhattan',
      neighborhood: 'Chelsea',
      address: {},
      features: {},
      media: [],
      agent_info: {},
      rls_eligible: true,
      idx_display_yn: true,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
      owner_opt_out: false,
      participant_only: false,
      listing_contract_date: '2026-01-01',
      modification_timestamp: '2026-03-01T00:00:00Z',
      created_at: '2026-01-01',
      updated_at: '2026-03-01',
      ...overrides,
    };
  }

  it('excludes when idx_display_yn is null (was passing before fix)', () => {
    const result = filterDisplayableDbListings([
      buildDbListing({ idx_display_yn: null as unknown as boolean }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('excludes when idx_display_yn is undefined', () => {
    const listing = buildDbListing();
    delete (listing as Record<string, unknown>).idx_display_yn;
    const result = filterDisplayableDbListings([listing as DbListing]);
    expect(result).toHaveLength(0);
  });

  it('excludes when internet_entire_listing_display_yn is null', () => {
    const result = filterDisplayableDbListings([
      buildDbListing({
        internet_entire_listing_display_yn: null as unknown as boolean,
      }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('excludes when internet_entire_listing_display_yn is undefined', () => {
    const listing = buildDbListing();
    delete (listing as Record<string, unknown>).internet_entire_listing_display_yn;
    const result = filterDisplayableDbListings([listing as DbListing]);
    expect(result).toHaveLength(0);
  });

  it('includes valid Active listing with all permissions=true', () => {
    const result = filterDisplayableDbListings([buildDbListing()]);
    expect(result).toHaveLength(1);
  });

  it('still includes website-only commercial (rls_eligible=false) regardless of permissions', () => {
    const result = filterDisplayableDbListings([
      buildDbListing({
        rls_eligible: false,
        idx_display_yn: null as unknown as boolean,
        internet_entire_listing_display_yn: null as unknown as boolean,
      }),
    ]);
    expect(result).toHaveLength(1);
  });
});

describe('mapTrestleToPrisma — fail-closed on missing AVM/consumer-comment flags', () => {
  function buildMinimalRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ListingKey: 'TEST-MAP-1',
      ListingId: 'TEST-MAP-1',
      ListPrice: 1000000,
      StandardStatus: 'Active',
      MlsStatus: 'Active',
      PropertyType: 'Residential',
      ListingContractDate: '2026-01-01',
      ModificationTimestamp: '2026-03-01T00:00:00Z',
      InternetEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      ...overrides,
    };
  }

  it('sets internet_automated_valuation_display_yn=false when flag is null (was fail-OPEN before fix)', () => {
    const result = mapTrestleToPrisma(buildMinimalRaw({
      InternetAutomatedValuationDisplayYN: null,
    }));
    expect(result.internet_automated_valuation_display_yn).toBe(false);
  });

  it('sets internet_automated_valuation_display_yn=false when flag is missing entirely', () => {
    const result = mapTrestleToPrisma(buildMinimalRaw());
    expect(result.internet_automated_valuation_display_yn).toBe(false);
  });

  it('sets internet_consumer_comment_yn=false when flag is null (was fail-OPEN before fix)', () => {
    const result = mapTrestleToPrisma(buildMinimalRaw({
      InternetConsumerCommentYN: null,
    }));
    expect(result.internet_consumer_comment_yn).toBe(false);
  });

  it('sets internet_consumer_comment_yn=false when flag is missing entirely', () => {
    const result = mapTrestleToPrisma(buildMinimalRaw());
    expect(result.internet_consumer_comment_yn).toBe(false);
  });

  it('preserves true when AVM and consumer-comment flags are explicitly true', () => {
    const result = mapTrestleToPrisma(buildMinimalRaw({
      InternetAutomatedValuationDisplayYN: true,
      InternetConsumerCommentYN: true,
    }));
    expect(result.internet_automated_valuation_display_yn).toBe(true);
    expect(result.internet_consumer_comment_yn).toBe(true);
  });

  it('treats string "true" as true (defensive against Trestle string-bool quirk)', () => {
    const result = mapTrestleToPrisma(buildMinimalRaw({
      InternetAutomatedValuationDisplayYN: 'true',
      InternetConsumerCommentYN: 'TRUE',
    }));
    expect(result.internet_automated_valuation_display_yn).toBe(true);
    expect(result.internet_consumer_comment_yn).toBe(true);
  });
});

describe('canonical chain address suppression — live-record flags', () => {
  // A LIVE record's null display flags mean "REBNY pre-filtered this row in" (displayable); only
  // an explicit false suppresses. The former second builder was fail-closed on null at the DTO
  // layer because its input was already a mapped object; that layer no longer exists. The
  // fail-closed-on-null contract for PERSISTED rows is pinned by
  // 'filterDisplayableDbListings — fail-closed on null permission flags' above.
  const dtoOf = (overrides: Record<string, unknown>) =>
    cotalityRecordToPublicDTO(buildRawTrestle({ Latitude: 40.7, Longitude: -74.0, ...overrides }), { alreadyGated: true })!;

  it('null InternetAddressDisplayYN on a live record is displayable (IDX Plus pre-filter)', () => {
    const dto = dtoOf({ InternetAddressDisplayYN: null });
    expect(dto.address.streetName).toBe('Main St');
    expect(dto.address.latitude).toBe(40.7);
  });

  it('explicit false InternetAddressDisplayYN suppresses address and coordinates', () => {
    const dto = dtoOf({ InternetAddressDisplayYN: false });
    expect(dto.address.streetName).toBe('Address Undisclosed');
    expect(dto.address.streetNumber).toBe('');
    expect(dto.address.latitude).toBeUndefined();
  });

  it('explicit false InternetEntireListingDisplayYN is refused by the distribution gate', () => {
    expect(cotalityRecordToPublicDTO(buildRawTrestle({ InternetEntireListingDisplayYN: false }))).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. WRITER-SIDE GATE COERCION (mapTrestleToPrisma) — IDX Plus pre-filter
// ═══════════════════════════════════════════════════════════════════════════
//
// IDX Plus convention (verified 2026-04-30 against live Trestle metadata + DB):
//   InternetEntireListingDisplayYN / InternetAddressDisplayYN return null for
//   the majority of records and are NOT OData-filterable (provider returns
//   400 "Results from 'RLS' has been suppressed (provider Level)"). REBNY/
//   Cotality pre-filter non-displayable rows out of the IDX Plus feed at the
//   provider level. Therefore null on these fields means "upstream already
//   gated this row in" — the writer must treat null as displayable.
//
//   InternetAutomatedValuationDisplayYN / InternetConsumerCommentYN are per-
//   row opt-out flags carried at row level (~97% true / ~3% false in the
//   live feed). The writer must treat null as fail-CLOSED for these.
//
// This describe block locks in that asymmetry.

describe('mapTrestleToPrisma — writer-side gate coercion', () => {
  describe('InternetEntireListingDisplayYN / InternetAddressDisplayYN — IDX Plus pre-filtered', () => {
    it('treats null InternetEntireListingDisplayYN as displayable (REBNY/Cotality pre-filter)', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({ InternetEntireListingDisplayYN: null })
      );
      expect(mapped.internet_entire_listing_display_yn).toBe(true);
    });

    it('treats undefined InternetEntireListingDisplayYN as displayable', () => {
      const raw = buildRawTrestle();
      delete raw.InternetEntireListingDisplayYN;
      const mapped = mapTrestleToPrisma(raw);
      expect(mapped.internet_entire_listing_display_yn).toBe(true);
    });

    it('treats null InternetAddressDisplayYN as displayable', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({ InternetAddressDisplayYN: null })
      );
      expect(mapped.internet_address_display_yn).toBe(true);
    });

    it('treats undefined InternetAddressDisplayYN as displayable', () => {
      const raw = buildRawTrestle();
      delete raw.InternetAddressDisplayYN;
      const mapped = mapTrestleToPrisma(raw);
      expect(mapped.internet_address_display_yn).toBe(true);
    });

    it('honors explicit false on InternetEntireListingDisplayYN', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({ InternetEntireListingDisplayYN: false })
      );
      expect(mapped.internet_entire_listing_display_yn).toBe(false);
    });

    it('honors explicit false on InternetAddressDisplayYN', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({ InternetAddressDisplayYN: false })
      );
      expect(mapped.internet_address_display_yn).toBe(false);
    });

    it('honors explicit true on InternetEntireListingDisplayYN', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({ InternetEntireListingDisplayYN: true })
      );
      expect(mapped.internet_entire_listing_display_yn).toBe(true);
    });

    it('honors explicit true on InternetAddressDisplayYN', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({ InternetAddressDisplayYN: true })
      );
      expect(mapped.internet_address_display_yn).toBe(true);
    });
  });

  describe('InternetAutomatedValuationDisplayYN / InternetConsumerCommentYN — per-row opt-out, fail-closed', () => {
    it('treats null InternetAutomatedValuationDisplayYN as NOT displayable (fail-closed)', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({ InternetAutomatedValuationDisplayYN: null })
      );
      expect(mapped.internet_automated_valuation_display_yn).toBe(false);
    });

    it('treats undefined InternetAutomatedValuationDisplayYN as NOT displayable', () => {
      const raw = buildRawTrestle();
      delete raw.InternetAutomatedValuationDisplayYN;
      const mapped = mapTrestleToPrisma(raw);
      expect(mapped.internet_automated_valuation_display_yn).toBe(false);
    });

    it('treats null InternetConsumerCommentYN as NOT displayable (fail-closed)', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({ InternetConsumerCommentYN: null })
      );
      expect(mapped.internet_consumer_comment_yn).toBe(false);
    });

    it('treats undefined InternetConsumerCommentYN as NOT displayable', () => {
      const raw = buildRawTrestle();
      delete raw.InternetConsumerCommentYN;
      const mapped = mapTrestleToPrisma(raw);
      expect(mapped.internet_consumer_comment_yn).toBe(false);
    });

    it('honors explicit true on AVM and consumer-comment', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({
          InternetAutomatedValuationDisplayYN: true,
          InternetConsumerCommentYN: true,
        })
      );
      expect(mapped.internet_automated_valuation_display_yn).toBe(true);
      expect(mapped.internet_consumer_comment_yn).toBe(true);
    });

    it('honors explicit false on AVM and consumer-comment', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({
          InternetAutomatedValuationDisplayYN: false,
          InternetConsumerCommentYN: false,
        })
      );
      expect(mapped.internet_automated_valuation_display_yn).toBe(false);
      expect(mapped.internet_consumer_comment_yn).toBe(false);
    });
  });

  describe('idx_display_yn derivation — null entire/address with no upstream block', () => {
    it('idx_display_yn is true when entire/address are null and Permission is IDX', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({
          InternetEntireListingDisplayYN: null,
          InternetAddressDisplayYN: null,
          Permission: 'IDX',
        })
      );
      expect(mapped.idx_display_yn).toBe(true);
      expect(mapped.participant_only).toBe(false);
      expect(mapped.owner_opt_out).toBe(false);
    });

    it('idx_display_yn is false when InternetEntireListingDisplayYN is explicitly false', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({
          InternetEntireListingDisplayYN: false,
          Permission: 'IDX',
        })
      );
      expect(mapped.idx_display_yn).toBe(false);
    });

    it('idx_display_yn is false when Permission is Private (participant-only) — even with null entire/address', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({
          InternetEntireListingDisplayYN: null,
          InternetAddressDisplayYN: null,
          Permission: 'Private',
        })
      );
      expect(mapped.idx_display_yn).toBe(false);
      expect(mapped.participant_only).toBe(true);
    });

    it('idx_display_yn is false when Permission is OwnerOptOut — even with null entire/address', () => {
      const mapped = mapTrestleToPrisma(
        buildRawTrestle({
          InternetEntireListingDisplayYN: null,
          InternetAddressDisplayYN: null,
          Permission: 'OwnerOptOut',
        })
      );
      expect(mapped.idx_display_yn).toBe(false);
      expect(mapped.owner_opt_out).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. READER-SIDE GATE COERCION (checkDistributionGates / evaluateDisplayGate)
//    IDX Plus reader-side semantics — Phase 0a (2026-05-01).
//
//    Locks in the same convention as the writer-side fix at
//    lib/idx/trestle-mapper.ts:705-706 (commit 0309875b 2026-04-30):
//      - null/undefined InternetEntireListingDisplayYN → displayable (REBNY
//        pre-filters non-displayable rows out of the IDX Plus feed)
//      - null/undefined InternetAddressDisplayYN → displayable (same reason)
//      - explicit false on either still blocks
//      - AVM / ConsumerComment / owner_opt_out / participant_only / closed-24h
//        all unchanged (per-row signals, not pre-filtered)
//
//    Trestle-live records pass through `checkDistributionGates()` which
//    forwards `idxPlusPreFiltered: true` to `evaluateDisplayGate()`. DB-row
//    callers (db-to-public-dto, sitemap, listing-access-decision) keep the
//    default fail-closed semantics — covered by the
//    "filterDisplayableDbListings — fail-closed on null permission flags"
//    block above.
// ═══════════════════════════════════════════════════════════════════════════

describe('checkDistributionGates — Trestle-live IDX Plus pre-filter semantics', () => {
  it('passes when InternetEntireListingDisplayYN is null (REBNY/Cotality pre-filter)', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ InternetEntireListingDisplayYN: null })
    );
    expect(result.displayable).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('passes when InternetEntireListingDisplayYN is undefined (key absent)', () => {
    const raw = buildRawTrestle();
    delete raw.InternetEntireListingDisplayYN;
    const result = checkDistributionGates(raw);
    expect(result.displayable).toBe(true);
  });

  it('passes when InternetAddressDisplayYN is null (sub-gate IDX Plus pre-filter)', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ InternetAddressDisplayYN: null })
    );
    expect(result.displayable).toBe(true);
  });

  it('still blocks when InternetEntireListingDisplayYN is explicitly false', () => {
    const result = checkDistributionGates(
      buildRawTrestle({ InternetEntireListingDisplayYN: false })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('Internet display disabled');
  });

  it('still blocks when Permission = OwnerOptOut, even with null entire-listing flag', () => {
    const result = checkDistributionGates(
      buildRawTrestle({
        InternetEntireListingDisplayYN: null,
        Permission: 'OwnerOptOut',
      })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('Owner opted out');
  });

  it('still blocks when Permission = Private (participant-only), even with null entire-listing flag', () => {
    const result = checkDistributionGates(
      buildRawTrestle({
        InternetEntireListingDisplayYN: null,
        Permission: 'Private',
      })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('Participant-only');
  });

  it('still blocks closed listings > 24 hours, even with null entire-listing flag', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const result = checkDistributionGates(
      buildRawTrestle({
        InternetEntireListingDisplayYN: null,
        StandardStatus: 'Closed',
        CloseDate: twoDaysAgo,
      })
    );
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('Closed listing > 24 hours');
  });
});

describe('evaluateDisplayGate — option flag preserves DB-row fail-closed default', () => {
  // DB-row callers (db-to-public-dto, sitemap, listing-access-decision) call
  // evaluateDisplayGate WITHOUT the idxPlusPreFiltered flag. Default behavior
  // must remain fail-closed on null InternetEntireListingDisplayYN. This block
  // pins that contract so Phase 0a does not regress the existing
  // filterDisplayableDbListings tests.

  it('default (no options): blocks when InternetEntireListingDisplayYN is null', () => {
    const result = evaluateDisplayGate(buildRawTrestle({
      InternetEntireListingDisplayYN: null,
    }));
    expect(result.displayable).toBe(false);
    expect(result.reason).toContain('Internet display disabled');
  });

  it('idxPlusPreFiltered: false (explicit): blocks when InternetEntireListingDisplayYN is null', () => {
    const result = evaluateDisplayGate(
      buildRawTrestle({ InternetEntireListingDisplayYN: null }),
      { idxPlusPreFiltered: false }
    );
    expect(result.displayable).toBe(false);
  });

  it('idxPlusPreFiltered: true: passes when InternetEntireListingDisplayYN is null', () => {
    const result = evaluateDisplayGate(
      buildRawTrestle({ InternetEntireListingDisplayYN: null }),
      { idxPlusPreFiltered: true }
    );
    expect(result.displayable).toBe(true);
  });

  it('idxPlusPreFiltered: true: passes when InternetAddressDisplayYN is null', () => {
    const result = evaluateDisplayGate(
      buildRawTrestle({ InternetAddressDisplayYN: null }),
      { idxPlusPreFiltered: true }
    );
    expect(result.displayable).toBe(true);
    expect(result.addressDisplayable).toBe(true);
  });

  it('idxPlusPreFiltered: true: still blocks explicit InternetEntireListingDisplayYN=false', () => {
    const result = evaluateDisplayGate(
      buildRawTrestle({ InternetEntireListingDisplayYN: false }),
      { idxPlusPreFiltered: true }
    );
    expect(result.displayable).toBe(false);
  });

  it('idxPlusPreFiltered: true: still blocks Permission=OwnerOptOut', () => {
    const result = evaluateDisplayGate(
      buildRawTrestle({
        InternetEntireListingDisplayYN: null,
        Permission: 'OwnerOptOut',
      }),
      { idxPlusPreFiltered: true }
    );
    expect(result.displayable).toBe(false);
  });

  it('idxPlusPreFiltered: true: still blocks Permission=Private', () => {
    const result = evaluateDisplayGate(
      buildRawTrestle({
        InternetEntireListingDisplayYN: null,
        Permission: 'Private',
      }),
      { idxPlusPreFiltered: true }
    );
    expect(result.displayable).toBe(false);
  });
});
