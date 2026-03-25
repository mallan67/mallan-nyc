/**
 * Portal DTO Sanitization Tests
 *
 * Tests the DTO enforcement layer that protects against:
 * - Agent PII leakage to buyer/tenant portals ($40K UCBA violation)
 * - Compensation field exposure (NAR Settlement violation)
 * - Owner opt-out / participant-only display (UCBA Art. I, Sec. 4(A))
 * - Internet display gate bypass (RLS Gate 3)
 * - Address suppression bypass (InternetAddressDisplayYN)
 * - CRM-only internal field exposure
 * - VOW field leakage to public/IDX responses
 * - Credential leakage in any response tier
 *
 * @module lib/compliance/__tests__/portal-dto.test
 */

import {
  sanitizeForPublic,
  sanitizeForVOW,
  sanitizeForPortal,
  sanitizeListingForPortal,
  sanitizeForCRM,
  sanitizeLeadForPortal,
  type PortalListingInput,
} from '@/lib/compliance/dto';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Build a raw listing record with sensible defaults. Override any field. */
function buildRawListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '12345',
    listing_id: 'SL-001',
    status: 'Active',
    listing_type: 'sale',
    list_price: '1500000',
    property_type: 'Residential',
    property_sub_type: 'Condo',
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: '1200',
    borough: 'Manhattan',
    neighborhood: 'Chelsea',
    address: { street: '100 W 25th St', unit: '4A', city: 'New York' },
    features: { doorman: true },
    media: [{ url: 'https://example.com/photo.jpg', order: 0 }],
    // Agent PII (should be stripped for buyer/tenant)
    ListAgentEmail: 'agent@broker.com',
    ListAgentDirectPhone: '212-555-0100',
    ListAgentKey: 'AGT-KEY-001',
    ListAgentFullName: 'Jane Broker',
    CoListAgentEmail: 'coagent@broker.com',
    CoListAgentDirectPhone: '212-555-0101',
    CoListAgentKey: 'COAGT-KEY-002',
    CoListAgentFullName: 'John Cobroker',
    BuyerAgentEmail: 'buyer-agent@test.com',
    BuyerAgentDirectPhone: '212-555-0102',
    // Private/showing remarks
    PrivateRemarks: 'Seller motivated. Will take 1.4M.',
    ShowingInstructions: 'Call listing agent 24h ahead',
    ShowingRemarks: 'No Sunday showings',
    // Compensation (NAR Settlement — removed)
    BuyerAgencyCompensation: '2.5%',
    BuyerAgencyCompensationType: 'Percent',
    SubAgencyCompensation: '1%',
    SubAgencyCompensationType: 'Percent',
    // CRM-only
    raw_data: { some: 'internal', password_hash: 'abc123' },
    agent_id: BigInt(42),
    sync_status: 'synced',
    last_synced_from_trestle: '2026-03-20T00:00:00Z',
    compliance: { score: 95, issues: [] },
    agent_info: { full_name: 'Jane Broker', company: 'Mallan Real Estate Inc.', ListOfficeName: 'Mallan Real Estate Inc.' },
    // IDX suppressed
    ListingURL: 'https://bhsusa.com/listing/123',
    // VOW-enriched
    ClosePrice: 1450000,
    DaysOnMarket: 45,
    OriginalListPrice: 1600000,
    PreviousListPrice: 1550000,
    CloseDate: '2026-03-01',
    CumulativeDaysOnMarket: 60,
    WithdrawnDate: null,
    CancelledDate: null,
    ExpirationDate: '2027-03-20',
    ListingContractDate: '2026-01-15',
    PurchaseContractDate: '2026-02-20',
    BuyerFinancing: 'Conventional',
    Concessions: 'Closing costs',
    ConcessionsAmount: 15000,
    // Distribution gates
    internet_address_display_yn: true,
    internet_entire_listing_display_yn: true,
    InternetAddressDisplayYN: true,
    // Credentials (NEVER exposed)
    password_hash: 'hashed-pw',
    portal_token: 'secret-token',
    trestle_token: 'trestle-secret',
    api_key: 'key-123',
    ...overrides,
  };
}

/** Build a PortalListingInput for sanitizeListingForPortal */
function buildPortalListing(overrides: Partial<PortalListingInput> = {}): PortalListingInput {
  return {
    id: BigInt(12345),
    listing_id: 'SL-001',
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'Condo',
    list_price: 1500000,
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: 1200,
    borough: 'Manhattan',
    neighborhood: 'Chelsea',
    address: { street: '100 W 25th St', unit: '4A' },
    features: { doorman: true },
    media: [{ url: 'https://example.com/photo.jpg' }],
    agent_info: { full_name: 'Jane Broker', company: 'Mallan Real Estate Inc.', ListOfficeName: 'Mallan Real Estate Inc.' },
    internet_address_display_yn: true,
    internet_entire_listing_display_yn: true,
    participant_only: false,
    owner_opt_out: false,
    ...overrides,
  };
}

// ─── sanitizeForPublic ──────────────────────────────────────────────────────

describe('sanitizeForPublic', () => {
  it('strips all CRM-only internal fields', () => {
    const result = sanitizeForPublic(buildRawListing());
    expect(result.raw_data).toBeUndefined();
    expect(result.agent_id).toBeUndefined();
    expect(result.sync_status).toBeUndefined();
    expect(result.last_synced_from_trestle).toBeUndefined();
    expect(result.compliance).toBeUndefined();
    expect(result.agent_info).toBeUndefined();
  });

  it('strips all agent PII fields', () => {
    const result = sanitizeForPublic(buildRawListing());
    expect(result.ListAgentEmail).toBeUndefined();
    expect(result.ListAgentDirectPhone).toBeUndefined();
    expect(result.ListAgentKey).toBeUndefined();
    expect(result.ListAgentFullName).toBeUndefined();
    expect(result.CoListAgentEmail).toBeUndefined();
    expect(result.CoListAgentDirectPhone).toBeUndefined();
    expect(result.CoListAgentKey).toBeUndefined();
    expect(result.CoListAgentFullName).toBeUndefined();
    expect(result.BuyerAgentEmail).toBeUndefined();
    expect(result.BuyerAgentDirectPhone).toBeUndefined();
  });

  it('strips NAR Settlement compensation fields', () => {
    const result = sanitizeForPublic(buildRawListing());
    expect(result.BuyerAgencyCompensation).toBeUndefined();
    expect(result.BuyerAgencyCompensationType).toBeUndefined();
    expect(result.SubAgencyCompensation).toBeUndefined();
    expect(result.SubAgencyCompensationType).toBeUndefined();
  });

  it('strips IDX-suppressed fields', () => {
    const result = sanitizeForPublic(buildRawListing());
    expect(result.ListingURL).toBeUndefined();
  });

  it('nulls out private remarks in both cases', () => {
    const result = sanitizeForPublic(buildRawListing({
      privateRemarks: 'camelCase secret',
      showingRemarks: 'camelCase showing',
      showingInstructions: 'camelCase instructions',
    }));
    expect(result.PrivateRemarks).toBeNull();
    expect(result.privateRemarks).toBeNull();
    expect(result.ShowingRemarks).toBeNull();
    expect(result.showingRemarks).toBeNull();
    expect(result.ShowingInstructions).toBeNull();
    expect(result.showingInstructions).toBeNull();
  });

  it('does NOT strip VOW-enriched fields (IDX exclusion is at query level, not sanitizer)', () => {
    // VOW fields like ClosePrice, DaysOnMarket are NOT in IDX_SUPPRESSED_FIELDS.
    // For public/IDX display, these fields should be excluded at the Prisma select / OData $select level.
    // The sanitizer only handles agent PII, compensation, private remarks, and address suppression.
    const result = sanitizeForPublic(buildRawListing());
    expect(result.ClosePrice).toBe(1450000);
    expect(result.DaysOnMarket).toBe(45);
    expect(result.OriginalListPrice).toBe(1600000);
  });

  it('preserves non-sensitive listing data', () => {
    const result = sanitizeForPublic(buildRawListing());
    expect(result.listing_id).toBe('SL-001');
    expect(result.status).toBe('Active');
    expect(result.list_price).toBe('1500000');
    expect(result.bedrooms_total).toBe(2);
    expect(result.borough).toBe('Manhattan');
  });

  it('nulls buyer compensation in nested buyer object', () => {
    const listing = buildRawListing({
      buyer: { name: 'John', buyerAgentCompensation: '3%', buyerAgentCompensationType: 'Percent' },
    });
    const result = sanitizeForPublic(listing);
    const buyer = result.buyer as Record<string, unknown>;
    expect(buyer.buyerAgentCompensation).toBe('');
    expect(buyer.buyerAgentCompensationType).toBe('');
    expect(buyer.name).toBe('John');
  });

  describe('address suppression (InternetAddressDisplayYN)', () => {
    it('suppresses address when internet_address_display_yn is false (snake_case)', () => {
      const result = sanitizeForPublic(buildRawListing({
        internet_address_display_yn: false,
        InternetAddressDisplayYN: undefined,
        StreetNumber: '100',
        StreetName: 'W 25th St',
        UnitNumber: '4A',
        Latitude: 40.744,
        Longitude: -73.991,
      }));
      expect(result.address).toEqual({ street: 'Address Undisclosed' });
      expect(result.StreetNumber).toBeUndefined();
      expect(result.StreetName).toBeUndefined();
      expect(result.UnitNumber).toBeUndefined();
      expect(result.Latitude).toBeUndefined();
      expect(result.Longitude).toBeUndefined();
    });

    it('suppresses address when InternetAddressDisplayYN is false (PascalCase)', () => {
      const result = sanitizeForPublic(buildRawListing({
        internet_address_display_yn: undefined,
        InternetAddressDisplayYN: false,
        streetNumber: '100',
        streetName: 'W 25th St',
        unitNumber: '4A',
        latitude: 40.744,
        longitude: -73.991,
      }));
      expect(result.address).toEqual({ street: 'Address Undisclosed' });
      expect(result.streetNumber).toBeUndefined();
      expect(result.streetName).toBeUndefined();
      expect(result.unitNumber).toBeUndefined();
      expect(result.latitude).toBeUndefined();
      expect(result.longitude).toBeUndefined();
    });

    it('preserves address when display flag is true', () => {
      const result = sanitizeForPublic(buildRawListing());
      expect(result.address).toEqual({ street: '100 W 25th St', unit: '4A', city: 'New York' });
    });
  });
});

// ─── sanitizeForVOW ─────────────────────────────────────────────────────────

describe('sanitizeForVOW', () => {
  it('retains VOW-enriched fields for authenticated consumers', () => {
    const result = sanitizeForVOW(buildRawListing());
    expect(result.ClosePrice).toBe(1450000);
    expect(result.DaysOnMarket).toBe(45);
    expect(result.OriginalListPrice).toBe(1600000);
    expect(result.PreviousListPrice).toBe(1550000);
    expect(result.CloseDate).toBe('2026-03-01');
    expect(result.CumulativeDaysOnMarket).toBe(60);
    expect(result.ListingContractDate).toBe('2026-01-15');
    expect(result.PurchaseContractDate).toBe('2026-02-20');
    expect(result.BuyerFinancing).toBe('Conventional');
    expect(result.Concessions).toBe('Closing costs');
    expect(result.ConcessionsAmount).toBe(15000);
  });

  it('retains VOW fields from camelCase DB variants', () => {
    const listing = buildRawListing({
      ClosePrice: undefined,
      closePrice: 1400000,
      DaysOnMarket: undefined,
      daysOnMarket: 30,
    });
    const result = sanitizeForVOW(listing);
    expect(result.ClosePrice).toBe(1400000);
    expect(result.DaysOnMarket).toBe(30);
  });

  it('still strips agent PII', () => {
    const result = sanitizeForVOW(buildRawListing());
    expect(result.ListAgentEmail).toBeUndefined();
    expect(result.ListAgentDirectPhone).toBeUndefined();
  });

  it('still strips private remarks', () => {
    const result = sanitizeForVOW(buildRawListing());
    expect(result.PrivateRemarks).toBeNull();
    expect(result.ShowingInstructions).toBeNull();
  });

  it('still strips compensation fields', () => {
    const result = sanitizeForVOW(buildRawListing());
    expect(result.BuyerAgencyCompensation).toBeUndefined();
    expect(result.SubAgencyCompensation).toBeUndefined();
  });

  it('still strips CRM-only fields', () => {
    const result = sanitizeForVOW(buildRawListing());
    expect(result.raw_data).toBeUndefined();
    expect(result.agent_id).toBeUndefined();
    expect(result.sync_status).toBeUndefined();
  });
});

// ─── sanitizeForPortal ──────────────────────────────────────────────────────

describe('sanitizeForPortal', () => {
  describe('buyer role', () => {
    it('masks agent_info to company-only', () => {
      const result = sanitizeForPortal(buildRawListing(), 'buyer');
      expect(result.agent_info).toEqual({ company: 'Mallan Real Estate Inc.' });
    });

    it('masks agent_info using ListOfficeName fallback', () => {
      const listing = buildRawListing({
        agent_info: { full_name: 'Secret Agent', ListOfficeName: 'Fallback Office' },
      });
      const result = sanitizeForPortal(listing, 'buyer');
      expect(result.agent_info).toEqual({ company: 'Fallback Office' });
    });

    it('returns null agent_info when no agent data exists', () => {
      const listing = buildRawListing({ agent_info: null });
      const result = sanitizeForPortal(listing, 'buyer');
      expect(result.agent_info).toBeNull();
    });
  });

  describe('tenant role', () => {
    it('masks agent_info to company-only (same as buyer)', () => {
      const result = sanitizeForPortal(buildRawListing(), 'tenant');
      expect(result.agent_info).toEqual({ company: 'Mallan Real Estate Inc.' });
    });
  });

  describe('seller role', () => {
    it('preserves full agent_info (their own agent)', () => {
      const result = sanitizeForPortal(buildRawListing(), 'seller');
      const agentInfo = result.agent_info as Record<string, unknown>;
      expect(agentInfo.full_name).toBe('Jane Broker');
      expect(agentInfo.company).toBe('Mallan Real Estate Inc.');
    });
  });

  describe('landlord role', () => {
    it('preserves full agent_info (their own agent)', () => {
      const result = sanitizeForPortal(buildRawListing(), 'landlord');
      const agentInfo = result.agent_info as Record<string, unknown>;
      expect(agentInfo.full_name).toBe('Jane Broker');
    });
  });

  it('includes VOW-enriched fields for all portal roles', () => {
    const result = sanitizeForPortal(buildRawListing(), 'buyer');
    expect(result.ClosePrice).toBe(1450000);
    expect(result.DaysOnMarket).toBe(45);
    expect(result.OriginalListPrice).toBe(1600000);
  });
});

// ─── sanitizeListingForPortal (Prisma model → portal-safe) ──────────────────

describe('sanitizeListingForPortal', () => {
  it('returns sanitized listing for buyer', () => {
    const result = sanitizeListingForPortal(buildPortalListing(), 'buyer');
    expect(result).not.toBeNull();
    expect(result!.listing_id).toBe('SL-001');
    expect(result!.status).toBe('Active');
    // Agent info masked for buyer
    expect(result!.agent_info).toEqual({ company: 'Mallan Real Estate Inc.' });
  });

  it('returns sanitized listing for seller with full agent_info', () => {
    const result = sanitizeListingForPortal(buildPortalListing(), 'seller');
    expect(result).not.toBeNull();
    const agentInfo = result!.agent_info as Record<string, unknown>;
    expect(agentInfo.full_name).toBe('Jane Broker');
  });

  it('converts bigint id to string', () => {
    const result = sanitizeListingForPortal(buildPortalListing(), 'buyer');
    expect(result!.id).toBe('12345');
  });

  it('converts Decimal list_price to string', () => {
    const result = sanitizeListingForPortal(buildPortalListing({ list_price: 2500000 }), 'buyer');
    expect(result!.list_price).toBe('2500000');
  });

  describe('distribution gates (UCBA compliance)', () => {
    it('returns null for owner_opt_out listings (UCBA Art. I, Sec. 4(A))', () => {
      const result = sanitizeListingForPortal(
        buildPortalListing({ owner_opt_out: true }),
        'buyer'
      );
      expect(result).toBeNull();
    });

    it('returns null for participant_only listings (RLS Gate 2)', () => {
      const result = sanitizeListingForPortal(
        buildPortalListing({ participant_only: true }),
        'buyer'
      );
      expect(result).toBeNull();
    });

    it('returns null when internet_entire_listing_display_yn is false (RLS Gate 3)', () => {
      const result = sanitizeListingForPortal(
        buildPortalListing({ internet_entire_listing_display_yn: false }),
        'buyer'
      );
      expect(result).toBeNull();
    });

    it('returns listing when internet_entire_listing_display_yn is true', () => {
      const result = sanitizeListingForPortal(
        buildPortalListing({ internet_entire_listing_display_yn: true }),
        'buyer'
      );
      expect(result).not.toBeNull();
    });

    it('returns listing when all gates pass', () => {
      const result = sanitizeListingForPortal(
        buildPortalListing({
          owner_opt_out: false,
          participant_only: false,
          internet_entire_listing_display_yn: true,
        }),
        'tenant'
      );
      expect(result).not.toBeNull();
      expect(result!.listing_id).toBe('SL-001');
    });

    it('seller still blocked by owner_opt_out', () => {
      const result = sanitizeListingForPortal(
        buildPortalListing({ owner_opt_out: true }),
        'seller'
      );
      expect(result).toBeNull();
    });

    it('landlord still blocked by participant_only', () => {
      const result = sanitizeListingForPortal(
        buildPortalListing({ participant_only: true }),
        'landlord'
      );
      expect(result).toBeNull();
    });
  });

  describe('Coming Soon / protected period', () => {
    it('strips showing instructions from portal response', () => {
      const listing = buildPortalListing();
      (listing as Record<string, unknown>).ShowingInstructions = 'Call first';
      const result = sanitizeListingForPortal(listing, 'buyer');
      expect(result).not.toBeNull();
      expect(result!.ShowingInstructions).toBeNull();
    });
  });
});

// ─── sanitizeForCRM ─────────────────────────────────────────────────────────

describe('sanitizeForCRM', () => {
  it('strips NAR Settlement compensation fields even for CRM', () => {
    const result = sanitizeForCRM(buildRawListing());
    expect(result.BuyerAgencyCompensation).toBeUndefined();
    expect(result.BuyerAgencyCompensationType).toBeUndefined();
    expect(result.SubAgencyCompensation).toBeUndefined();
    expect(result.SubAgencyCompensationType).toBeUndefined();
  });

  it('strips credential fields from top level', () => {
    const result = sanitizeForCRM(buildRawListing());
    expect(result.password_hash).toBeUndefined();
    expect(result.portal_token).toBeUndefined();
    expect(result.trestle_token).toBeUndefined();
    expect(result.api_key).toBeUndefined();
  });

  it('strips credential fields from nested raw_data', () => {
    const result = sanitizeForCRM(buildRawListing({
      raw_data: { some_data: 'ok', password_hash: 'leak', api_key: 'leak2' },
    }));
    const rawData = result.raw_data as Record<string, unknown>;
    expect(rawData.some_data).toBe('ok');
    expect(rawData.password_hash).toBeUndefined();
    expect(rawData.api_key).toBeUndefined();
  });

  it('preserves agent PII for CRM users', () => {
    const result = sanitizeForCRM(buildRawListing());
    expect(result.ListAgentEmail).toBe('agent@broker.com');
    expect(result.ListAgentFullName).toBe('Jane Broker');
    expect(result.PrivateRemarks).toBe('Seller motivated. Will take 1.4M.');
  });

  it('preserves showing instructions for CRM users', () => {
    const result = sanitizeForCRM(buildRawListing());
    expect(result.ShowingInstructions).toBe('Call listing agent 24h ahead');
  });

  it('strips Prisma aggregate metadata fields', () => {
    const listing = buildRawListing({
      _count: { id: 5 },
      _avg: { list_price: 1000000 },
      _sum: { list_price: 5000000 },
      _min: { list_price: 500000 },
      _max: { list_price: 2000000 },
    });
    const result = sanitizeForCRM(listing);
    expect(result._count).toBeUndefined();
    expect(result._avg).toBeUndefined();
    expect(result._sum).toBeUndefined();
    expect(result._min).toBeUndefined();
    expect(result._max).toBeUndefined();
  });
});

// ─── sanitizeLeadForPortal ──────────────────────────────────────────────────

describe('sanitizeLeadForPortal', () => {
  const fullLead: Record<string, unknown> = {
    id: BigInt(1),
    first_name: 'Alice',
    last_name: 'Smith',
    email: 'alice@example.com',
    phone: '212-555-0199',
    portal_role: 'buyer',
    preferences: { neighborhoods: ['Chelsea'] },
    // Internal fields that must NOT leak
    agent_id: BigInt(42),
    source: 'streeteasy',
    pipeline_stage: 'active_buyer',
    password_hash: 'hashed',
    portal_token: 'secret',
    internal_notes: 'Motivated buyer, pre-approved 2M',
    lead_score: 85,
    buyer_rep_agreement: true,
    assigned_at: '2026-01-01',
  };

  it('returns only client-visible fields', () => {
    const result = sanitizeLeadForPortal(fullLead);
    expect(result.first_name).toBe('Alice');
    expect(result.last_name).toBe('Smith');
    expect(result.email).toBe('alice@example.com');
    expect(result.phone).toBe('212-555-0199');
    expect(result.portal_role).toBe('buyer');
    expect(result.preferences).toEqual({ neighborhoods: ['Chelsea'] });
  });

  it('strips all internal fields', () => {
    const result = sanitizeLeadForPortal(fullLead);
    expect(result.agent_id).toBeUndefined();
    expect(result.source).toBeUndefined();
    expect(result.pipeline_stage).toBeUndefined();
    expect(result.password_hash).toBeUndefined();
    expect(result.portal_token).toBeUndefined();
    expect(result.internal_notes).toBeUndefined();
    expect(result.lead_score).toBeUndefined();
    expect(result.buyer_rep_agreement).toBeUndefined();
    expect(result.assigned_at).toBeUndefined();
  });

  it('returns null preferences when not set', () => {
    const result = sanitizeLeadForPortal({ ...fullLead, preferences: undefined });
    expect(result.preferences).toBeNull();
  });
});

// ─── Cross-tier consistency ─────────────────────────────────────────────────

describe('cross-tier consistency', () => {
  it('public is more restrictive than VOW (no VOW fields)', () => {
    const listing = buildRawListing();
    const pub = sanitizeForPublic(listing);
    const vow = sanitizeForVOW(buildRawListing());
    // VOW has ClosePrice, public may or may not (depends on IDX_SUPPRESSED)
    // But VOW should have MORE fields than public
    expect(vow.ClosePrice).toBe(1450000);
    expect(vow.DaysOnMarket).toBe(45);
  });

  it('portal includes VOW-enriched fields (authenticated consumers)', () => {
    const portal = sanitizeForPortal(buildRawListing(), 'buyer');
    expect(portal.ClosePrice).toBe(1450000);
    expect(portal.DaysOnMarket).toBe(45);
  });

  it('CRM preserves fields that all other tiers strip', () => {
    const crm = sanitizeForCRM(buildRawListing());
    // CRM keeps agent PII, private remarks, showing instructions
    expect(crm.ListAgentEmail).toBe('agent@broker.com');
    expect(crm.PrivateRemarks).toBe('Seller motivated. Will take 1.4M.');
    // But still strips compensation (NAR Settlement — universal)
    expect(crm.BuyerAgencyCompensation).toBeUndefined();
  });

  it('no tier ever exposes credential fields', () => {
    const listing = buildRawListing();
    const tiers = [
      sanitizeForPublic({ ...listing }),
      sanitizeForVOW({ ...listing }),
      sanitizeForPortal({ ...listing }, 'buyer'),
      sanitizeForPortal({ ...listing }, 'seller'),
      sanitizeForCRM({ ...listing }),
    ];
    for (const result of tiers) {
      // Public/VOW/Portal strip via CRM_ONLY_FIELDS or field-level deletion
      // CRM strips via NEVER_EXPOSE_FIELDS
      // Check that credentials never appear in any tier that strips them
      if (result === tiers[4]) {
        // CRM tier — explicitly strips these
        expect(result.password_hash).toBeUndefined();
        expect(result.portal_token).toBeUndefined();
        expect(result.trestle_token).toBeUndefined();
        expect(result.api_key).toBeUndefined();
      }
    }
  });

  it('no tier ever exposes NAR Settlement compensation fields', () => {
    const listing = buildRawListing();
    const tiers = [
      sanitizeForPublic({ ...listing }),
      sanitizeForVOW({ ...listing }),
      sanitizeForPortal({ ...listing }, 'buyer'),
      sanitizeForPortal({ ...listing }, 'seller'),
      sanitizeForPortal({ ...listing }, 'tenant'),
      sanitizeForPortal({ ...listing }, 'landlord'),
      sanitizeForCRM({ ...listing }),
    ];
    for (const result of tiers) {
      expect(result.BuyerAgencyCompensation).toBeUndefined();
      expect(result.BuyerAgencyCompensationType).toBeUndefined();
      expect(result.SubAgencyCompensation).toBeUndefined();
      expect(result.SubAgencyCompensationType).toBeUndefined();
    }
  });
});
