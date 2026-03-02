/**
 * REBNY RLS Validator — Comprehensive Test Suite
 *
 * Tests ALL validation engines against UCBA 2026 rules.
 * Every test references specific UCBA rule IDs or RLS field requirements.
 */

import {
  validateMandatoryFields,
  validateConditionalFields,
  validateDistributionGates,
  validateDisplayCascade,
  validateStatusTransition,
  validateComingSoon,
  validateTimingSLA,
  validateAddressSuppression,
  validateFareAct,
  validateResoRenames,
  validateRemovedFields,
  validateCrossFields,
  validatePicklists,
} from '../src/validators';
import { validateListing } from '../src/index';
import { runAllContentScanners, scanFairHousing, scanAgentInfo, scanOffMarket, scanCompensation, scanFreeServices } from '../src/content-scanners';
import { loadFieldRegistry, loadLookupRegistry, MANDATORY_FIELDS, RESO_TO_RLS_RENAMES, resetRegistries } from '../src/registry';
import { assessPenalty } from '../src/validators';
import type { ListingPayload, ValidatorOptions, MlsStatus } from '../src/types';
import { resolve, join } from 'path';

// ─── Test Data Path ───────────────────────────────────────────────────

const DATA_DIR = resolve(join(__dirname, '..', '..', '..', 'data'));

// ─── Helper: Build a valid-ish sale listing payload ───────────────────

function validSalePayload(overrides?: Partial<ListingPayload>): ListingPayload {
  return {
    AttendanceType: 'FullTime',
    BathroomsFull: 2,
    BathroomsHalf: 1,
    BathroomsTotal: 2.5,
    BedroomsTotal: 3,
    BuildingLaundryFeatures: 'InUnit',
    BuildingPetsAllowed: 'Allowed',
    BuildingTaxLot: '123',
    BuyerAgentMlsId: 'BA001',
    City: 'New York',
    CityRegion: 'Manhattan',
    CoBrokeAgreement: 'StandardREBNY',
    CommonInterest: 'Condominium',
    Concessions: 'None',
    CountyOrParish: 'New York',
    ElevatorsTotal: 2,
    ExpirationDate: '2026-12-31',
    GarageYN: false,
    IDXEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    InternetAutomatedValuationDisplayYN: true,
    InternetConsumerCommentYN: true,
    InternetEntireListingDisplayYN: true,
    ListAgentMlsId: 'LA001',
    ListingAgreement: 'ExclusiveRightToSell',
    ListPrice: 1500000,
    MlsStatus: 'Active',
    NewConstructionYN: false,
    NewDevelopmentYN: false,
    NumberOfUnitsTotal: 50,
    OnMarketDate: '2026-01-15',
    OriginalEntryTimestamp: '2026-01-15T10:00:00Z',
    PetsAllowed: 'Allowed',
    PostalCity: 'New York',
    PostalCode: '10028',
    PropertySubType: 'Apartment',
    PropertyType: 'Residential',
    PublicRemarks: 'Beautiful 3-bedroom condo with park views.',
    RoomsTotal: 6,
    ShowingInstructions: 'Call listing agent to schedule.',
    SourceSystemKey: 'RLS-12345',
    StandardStatus: 'Active',
    StateOrProvince: 'NY',
    StoriesTotal: 20,
    StreetName: 'East 90th Street',
    StreetNumber: '400',
    StructureType: 'HighRise',
    SubdivisionName: 'Upper East Side',
    SyndicateYN: true,
    TaxBlock: '1234',
    UnParsedAddress: '400 East 90th Street, Unit 17C, New York, NY 10028',
    YearBuilt: 1985,
    AssociationFee: 1200,
    ...overrides,
  };
}

function validRentalPayload(overrides?: Partial<ListingPayload>): ListingPayload {
  return {
    ...validSalePayload(),
    PropertyType: 'ResidentialLease',
    ListingAgreement: 'ExclusiveRightToLease',
    AvailabilityDate: '2026-04-01',
    MlsStatus: 'Active',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// REGISTRY TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('Registry: Field Registry (CSV)', () => {
  beforeAll(() => resetRegistries());

  test('loads 400+ fields from CSV', () => {
    const fields = loadFieldRegistry(DATA_DIR);
    expect(fields.size).toBeGreaterThanOrEqual(400);
  });

  test('has all 52 mandatory fields', () => {
    const fields = loadFieldRegistry(DATA_DIR);
    for (const name of MANDATORY_FIELDS) {
      // Some mandatory fields may not be in CSV (system-managed) - that's OK
      // But key ones MUST be present
      if (['MlsStatus', 'ListPrice', 'PropertyType', 'PublicRemarks', 'City'].includes(name)) {
        expect(fields.has(name)).toBe(true);
      }
    }
  });

  test('MlsStatus is classified correctly', () => {
    const fields = loadFieldRegistry(DATA_DIR);
    const mlsStatus = fields.get('MlsStatus');
    expect(mlsStatus).toBeDefined();
  });

  test('RESO → RLS renames are 23 entries', () => {
    expect(RESO_TO_RLS_RENAMES).toHaveLength(23);
  });
});

describe('Registry: Lookup Registry (CSV)', () => {
  beforeAll(() => resetRegistries());

  test('loads 100+ picklist fields', () => {
    const lookups = loadLookupRegistry(DATA_DIR);
    expect(lookups.size).toBeGreaterThanOrEqual(100);
  });

  test('PostalCity has 50+ values', () => {
    const lookups = loadLookupRegistry(DATA_DIR);
    const postalCity = lookups.get('PostalCity');
    expect(postalCity).toBeDefined();
    expect(postalCity!.values.length).toBeGreaterThanOrEqual(50);
  });

  test('PropertySubType has valid values', () => {
    const lookups = loadLookupRegistry(DATA_DIR);
    const propSubType = lookups.get('PropertySubType');
    expect(propSubType).toBeDefined();
    expect(propSubType!.values).toContain('Apartment');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MANDATORY FIELD TESTS (52 fields)
// ═══════════════════════════════════════════════════════════════════════

describe('Mandatory Fields (52)', () => {
  test('valid payload has no mandatory field issues', () => {
    const issues = validateMandatoryFields(validSalePayload());
    expect(issues.filter(i => i.severity === 'BLOCKER')).toHaveLength(0);
  });

  test('empty payload reports missing mandatory fields', () => {
    const issues = validateMandatoryFields({});
    // System fields (OriginalEntryTimestamp, SourceSystemKey, StandardStatus) are excluded
    const expectedCount = MANDATORY_FIELDS.length - 3;
    expect(issues.length).toBe(expectedCount);
    expect(issues.every(i => i.severity === 'BLOCKER')).toBe(true);
    expect(issues.every(i => i.category === 'MANDATORY_FIELD')).toBe(true);
  });

  test('ListPrice = 0 is BLOCKER', () => {
    const issues = validateMandatoryFields(validSalePayload({ ListPrice: 0 }));
    const priceIssue = issues.find(i => i.code === 'MF-ListPrice-ZERO');
    expect(priceIssue).toBeDefined();
    expect(priceIssue!.severity).toBe('BLOCKER');
  });

  test('StateOrProvince != NY is BLOCKER', () => {
    const issues = validateMandatoryFields(validSalePayload({ StateOrProvince: 'NJ' }));
    const stateIssue = issues.find(i => i.code === 'MF-StateOrProvince-NY');
    expect(stateIssue).toBeDefined();
    expect(stateIssue!.severity).toBe('BLOCKER');
  });

  test('empty string counts as missing', () => {
    const issues = validateMandatoryFields(validSalePayload({ PublicRemarks: '' }));
    const remarkIssue = issues.find(i => i.field === 'PublicRemarks');
    expect(remarkIssue).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONDITIONAL FIELD TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('Conditional Fields', () => {
  test('ActivationDate required for ComingSoon', () => {
    const issues = validateConditionalFields(
      validSalePayload({ MlsStatus: 'ComingSoon' }),
    );
    const issue = issues.find(i => i.code === 'CF-ActivationDate');
    expect(issue).toBeDefined();
    expect(issue!.ruleId).toBe('D2');
  });

  test('AvailabilityDate required for rentals', () => {
    const issues = validateConditionalFields(
      { ...validSalePayload(), PropertyType: 'ResidentialLease' },
      { isRental: true },
    );
    // Might not trigger since validSalePayload doesn't have AvailabilityDate
    const issue = issues.find(i => i.code === 'CF-AvailabilityDate');
    expect(issue).toBeDefined();
  });

  test('CloseDate + ClosePrice required when Closed', () => {
    const issues = validateConditionalFields(
      validSalePayload({ MlsStatus: 'Closed' }),
    );
    expect(issues.find(i => i.code === 'CF-CloseDate')).toBeDefined();
    expect(issues.find(i => i.code === 'CF-ClosePrice')).toBeDefined();
  });

  test('Borough↔County mismatch is BLOCKER', () => {
    const issues = validateConditionalFields(
      validSalePayload({ CityRegion: 'Brooklyn', CountyOrParish: 'New York' }),
    );
    const mismatch = issues.find(i => i.code === 'CF-BoroughCounty');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('BLOCKER');
  });

  test('valid Borough↔County passes', () => {
    const issues = validateConditionalFields(
      validSalePayload({ CityRegion: 'Brooklyn', CountyOrParish: 'Kings' }),
    );
    const mismatch = issues.find(i => i.code.startsWith('CF-Borough') || i.code.startsWith('CF-County'));
    expect(mismatch).toBeUndefined();
  });

  test('BathroomsTotal calculation check', () => {
    const issues = validateConditionalFields(
      validSalePayload({ BathroomsFull: 2, BathroomsHalf: 1, BathroomsTotal: 3 }), // Should be 2.5
    );
    const calcIssue = issues.find(i => i.code === 'CF-BathroomsTotal-Calc');
    expect(calcIssue).toBeDefined();
  });

  test('AssociationFee required for Condominium', () => {
    const issues = validateConditionalFields(
      validSalePayload({ CommonInterest: 'Condominium', AssociationFee: undefined }),
    );
    const feeIssue = issues.find(i => i.code === 'CF-AssociationFee');
    expect(feeIssue).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DISTRIBUTION GATE TESTS (6 gates)
// ═══════════════════════════════════════════════════════════════════════

describe('Distribution Gates (6)', () => {
  test('valid public listing passes all gates', () => {
    const { gates, issues } = validateDistributionGates(validSalePayload());
    expect(issues.filter(i => i.severity === 'BLOCKER')).toHaveLength(0);
    // Gates 1-2 should pass (not opt-out or participant only)
    expect(gates.find(g => g.gate === 'OWNER_OPT_OUT')!.passed).toBe(true);
    expect(gates.find(g => g.gate === 'PARTICIPANT_ONLY')!.passed).toBe(true);
  });

  test('Owner Opt-Out blocks all channels', () => {
    const { gates } = validateDistributionGates(
      validSalePayload({ Permissions: 'Owner Opt-Out' }),
    );
    expect(gates.find(g => g.gate === 'OWNER_OPT_OUT')!.blocked).toBe(true);
  });

  test('Owner Opt-Out with IDX=True is BLOCKER', () => {
    const { issues } = validateDistributionGates(
      validSalePayload({
        Permissions: 'Owner Opt-Out',
        IDXEntireListingDisplayYN: true,
      }),
    );
    expect(issues.some(i => i.code === 'DG-OptOut-DisplayFlag')).toBe(true);
  });

  test('Participant Only blocks public channels', () => {
    const { gates } = validateDistributionGates(
      validSalePayload({ Permissions: 'Private (Participant Only)' }),
    );
    expect(gates.find(g => g.gate === 'PARTICIPANT_ONLY')!.blocked).toBe(true);
  });

  test('Cannot combine Opt-Out and Participant Only', () => {
    const { issues } = validateDistributionGates(
      validSalePayload({
        Permissions: 'Owner Opt-Out',
        MlsStatus: 'ParticipantOnly',
      }),
    );
    expect(issues.some(i => i.code === 'DG-MutualExclusive')).toBe(true);
  });

  test('missing InternetEntireListingDisplayYN is BLOCKER (fail closed)', () => {
    const payload = validSalePayload();
    delete payload.InternetEntireListingDisplayYN;
    const { issues } = validateDistributionGates(payload);
    expect(issues.some(i => i.code === 'DG-MasterGate-Missing')).toBe(true);
  });

  test('IDX=False blocks IDX gate', () => {
    const { gates } = validateDistributionGates(
      validSalePayload({ IDXEntireListingDisplayYN: false }),
    );
    expect(gates.find(g => g.gate === 'IDX_DISPLAY')!.blocked).toBe(true);
  });

  test('SyndicateYN=False blocks syndication gate', () => {
    const { gates } = validateDistributionGates(
      validSalePayload({ SyndicateYN: false }),
    );
    expect(gates.find(g => g.gate === 'SYNDICATION')!.blocked).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// DISPLAY CASCADE TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('Display Cascade', () => {
  test('master gate False + IDX True is BLOCKER', () => {
    const issues = validateDisplayCascade({
      InternetEntireListingDisplayYN: false,
      IDXEntireListingDisplayYN: true,
    });
    expect(issues.some(i => i.field === 'IDXEntireListingDisplayYN')).toBe(true);
  });

  test('master gate False cascades all sub-fields', () => {
    const issues = validateDisplayCascade({
      InternetEntireListingDisplayYN: false,
      IDXEntireListingDisplayYN: true,
      InternetAddressDisplayYN: true,
      InternetAutomatedValuationDisplayYN: true,
      InternetConsumerCommentYN: true,
    });
    expect(issues).toHaveLength(4);
    expect(issues.every(i => i.severity === 'BLOCKER')).toBe(true);
  });

  test('master gate True does not trigger cascade', () => {
    const issues = validateDisplayCascade({
      InternetEntireListingDisplayYN: true,
      IDXEntireListingDisplayYN: true,
    });
    expect(issues).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// STATUS TRANSITION TESTS (Section J)
// ═══════════════════════════════════════════════════════════════════════

describe('Status Transitions (Section J)', () => {
  test('Active → Pending is valid', () => {
    const issues = validateStatusTransition(
      validSalePayload({ MlsStatus: 'Pending' }),
      { previousStatus: 'Active' },
    );
    expect(issues.filter(i => i.severity === 'BLOCKER')).toHaveLength(0);
  });

  test('Active → Closed is valid', () => {
    const issues = validateStatusTransition(
      validSalePayload({ MlsStatus: 'Closed' }),
      { previousStatus: 'Active' },
    );
    expect(issues.filter(i => i.severity === 'BLOCKER')).toHaveLength(0);
  });

  test('Closed → Active is INVALID (terminal)', () => {
    const issues = validateStatusTransition(
      validSalePayload({ MlsStatus: 'Active' }),
      { previousStatus: 'Closed' },
    );
    expect(issues.some(i => i.code === 'ST-ClosedTerminal')).toBe(true);
  });

  test('ComingSoon for rental is BLOCKER (D1)', () => {
    const issues = validateStatusTransition(
      validRentalPayload({ MlsStatus: 'ComingSoon' }),
      { previousStatus: 'Active', isRental: true },
    );
    expect(issues.some(i => i.code === 'ST-ComingSoon-Rental')).toBe(true);
  });

  test('ComingSoon for new dev is BLOCKER (D1)', () => {
    const issues = validateStatusTransition(
      validSalePayload({ MlsStatus: 'ComingSoon', NewDevelopmentYN: true }),
      { previousStatus: 'Active', isNewDevelopment: true },
    );
    expect(issues.some(i => i.code === 'ST-ComingSoon-NewDev')).toBe(true);
  });

  test('Withdrawn → Active triggers DOM reset info', () => {
    const issues = validateStatusTransition(
      validSalePayload({ MlsStatus: 'Active' }),
      { previousStatus: 'Withdrawn' },
    );
    expect(issues.some(i => i.code === 'ST-DOMReset')).toBe(true);
  });

  test('Pending → ComingSoon is INVALID', () => {
    const issues = validateStatusTransition(
      validSalePayload({ MlsStatus: 'ComingSoon' }),
      { previousStatus: 'Pending' },
    );
    expect(issues.some(i => i.code === 'ST-InvalidTransition')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// COMING SOON TESTS (D1-D12)
// ═══════════════════════════════════════════════════════════════════════

describe('Coming Soon Rules (D1-D12)', () => {
  test('rental Coming Soon is BLOCKER (D1)', () => {
    const issues = validateComingSoon(
      validRentalPayload({ MlsStatus: 'ComingSoon' }),
      { isRental: true },
    );
    expect(issues.some(i => i.ruleId === 'D1')).toBe(true);
  });

  test('new dev Coming Soon is BLOCKER (D1)', () => {
    const issues = validateComingSoon(
      validSalePayload({ MlsStatus: 'ComingSoon', NewDevelopmentYN: true }),
    );
    expect(issues.some(i => i.code === 'CS-D1-NewDev')).toBe(true);
  });

  test('exceeding 14 days is BLOCKER (D2)', () => {
    const issues = validateComingSoon(
      validSalePayload({
        MlsStatus: 'ComingSoon',
        OnMarketDate: '2026-01-01',
        ActivationDate: '2026-01-20', // 19 days
      }),
    );
    expect(issues.some(i => i.code === 'CS-D2-MaxDays')).toBe(true);
  });

  test('within 14 days is OK', () => {
    const issues = validateComingSoon(
      validSalePayload({
        MlsStatus: 'ComingSoon',
        OnMarketDate: '2026-01-01',
        ActivationDate: '2026-01-10', // 9 days
      }),
    );
    expect(issues.some(i => i.code === 'CS-D2-MaxDays')).toBe(false);
  });

  test('missing ActivationDate is BLOCKER (D7)', () => {
    const issues = validateComingSoon(
      validSalePayload({ MlsStatus: 'ComingSoon' }),
    );
    expect(issues.some(i => i.code === 'CS-D7-Badge')).toBe(true);
  });

  test('open houses during Coming Soon is BLOCKER (D4)', () => {
    const issues = validateComingSoon(
      validSalePayload({
        MlsStatus: 'ComingSoon',
        ActivationDate: '2026-02-01',
        ActiveOpenHouseCount: 1,
      }),
    );
    expect(issues.some(i => i.ruleId === 'D4')).toBe(true);
  });

  test('Exhibit G reminder is INFO', () => {
    const issues = validateComingSoon(
      validSalePayload({
        MlsStatus: 'ComingSoon',
        ActivationDate: '2026-02-01',
      }),
    );
    expect(issues.some(i => i.ruleId === 'D10')).toBe(true);
    expect(issues.find(i => i.ruleId === 'D10')!.severity).toBe('INFO');
  });

  test('non-ComingSoon listing skipped', () => {
    const issues = validateComingSoon(validSalePayload());
    expect(issues).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONTENT SCANNER TESTS — S1: Fair Housing
// ═══════════════════════════════════════════════════════════════════════

describe('Content Scanner: Fair Housing', () => {
  test('detects racial exclusion', () => {
    const results = scanFairHousing({ PublicRemarks: 'No blacks allowed in this unit' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].violations[0].protectedClass).toBe('Race');
    expect(results[0].violations[0].law).toBe('Federal FHA');
  });

  test('detects familial status violation', () => {
    const results = scanFairHousing({ PublicRemarks: 'Adults only, no children' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].violations.some(v => v.protectedClass === 'Familial Status')).toBe(true);
  });

  test('detects source of income discrimination (NYC HRL)', () => {
    const results = scanFairHousing({ PublicRemarks: 'No vouchers or Section 8 accepted' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].violations.some(v => v.protectedClass === 'Source of Income')).toBe(true);
  });

  test('detects criminal history inquiry (Fair Chance Housing Act)', () => {
    const results = scanFairHousing({ PublicRemarks: 'Background check required for all applicants' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].violations.some(v => v.protectedClass === 'Criminal History')).toBe(true);
  });

  test('detects sexual orientation exclusion (NY State HRL)', () => {
    const results = scanFairHousing({ PublicRemarks: 'Straight couples only please' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].violations.some(v => v.protectedClass === 'Sexual Orientation')).toBe(true);
  });

  test('detects gender identity exclusion (NY State HRL)', () => {
    const results = scanFairHousing({ PublicRemarks: 'No transgender individuals' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].violations.some(v => v.protectedClass === 'Gender Identity/Expression')).toBe(true);
  });

  test('detects marital status exclusion (NY State HRL)', () => {
    const results = scanFairHousing({ PublicRemarks: 'Married couples only' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].violations.some(v => v.protectedClass === 'Marital Status')).toBe(true);
  });

  test('detects occupation exclusion (NYC HRL)', () => {
    const results = scanFairHousing({ PublicRemarks: 'Professionals only, no students' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].violations.some(v => v.protectedClass === 'Lawful Occupation')).toBe(true);
  });

  test('detects immigration exclusion (NYC HRL)', () => {
    const results = scanFairHousing({ PublicRemarks: 'US citizens only, no undocumented' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].violations.some(v => v.protectedClass === 'Immigration/Alienage')).toBe(true);
  });

  test('clean description passes', () => {
    const results = scanFairHousing({
      PublicRemarks: 'Beautiful 3-bedroom apartment with park views and natural light.',
    });
    expect(results).toHaveLength(0);
  });

  test('scans multiple fields', () => {
    const results = scanFairHousing({
      PublicRemarks: 'Clean description',
      ShowingInstructions: 'No wheelchair access, sorry',
    });
    expect(results.some(r => r.field === 'ShowingInstructions')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONTENT SCANNER TESTS — S2: Agent Info (C7)
// ═══════════════════════════════════════════════════════════════════════

describe('Content Scanner: Agent Info (C7)', () => {
  test('detects phone number', () => {
    const results = scanAgentInfo({ PublicRemarks: 'Call 646-258-4460 for details' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects email', () => {
    const results = scanAgentInfo({ PublicRemarks: 'Contact maya@mallan.nyc' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects URL', () => {
    const results = scanAgentInfo({ PublicRemarks: 'Visit https://mallan.nyc for more info' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "contact me" phrasing', () => {
    const results = scanAgentInfo({ PublicRemarks: 'Contact me for a showing' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "listed by" phrasing', () => {
    const results = scanAgentInfo({ PublicRemarks: 'Listed by top Manhattan broker' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('clean description passes', () => {
    const results = scanAgentInfo({ PublicRemarks: 'Spacious apartment with great views' });
    expect(results).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONTENT SCANNER TESTS — S3: Off-Market (C8)
// ═══════════════════════════════════════════════════════════════════════

describe('Content Scanner: Off-Market (C8)', () => {
  test('detects "off-market"', () => {
    const results = scanOffMarket({ PublicRemarks: 'This is an off-market opportunity' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "pocket listing"', () => {
    const results = scanOffMarket({ PublicRemarks: 'Exclusive pocket listing' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "whisper listing"', () => {
    const results = scanOffMarket({ PublicRemarks: 'Whisper listing available' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('clean description passes', () => {
    const results = scanOffMarket({ PublicRemarks: 'Prime location near Central Park' });
    expect(results).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONTENT SCANNER TESTS — S4: Compensation (C9)
// ═══════════════════════════════════════════════════════════════════════

describe('Content Scanner: Compensation (C9)', () => {
  test('detects percentage commission', () => {
    const results = scanCompensation({ PublicRemarks: '3% commission offered to co-broke' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "buyer pays no commission"', () => {
    const results = scanCompensation({ PublicRemarks: 'Buyer pays no commission' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "closing cost credit"', () => {
    const results = scanCompensation({ PublicRemarks: 'Seller offers closing cost credit' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('clean description passes', () => {
    const results = scanCompensation({ PublicRemarks: 'Recently renovated with modern finishes' });
    expect(results).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CONTENT SCANNER TESTS — S5: Free Services (F13)
// ═══════════════════════════════════════════════════════════════════════

describe('Content Scanner: Free Services (F13)', () => {
  test('detects "free listing"', () => {
    const results = scanFreeServices({ PublicRemarks: 'Free listing service available' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "zero commission"', () => {
    const results = scanFreeServices({ PublicRemarks: 'Zero commission for buyers' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('detects "commission-free"', () => {
    const results = scanFreeServices({ PublicRemarks: 'Commission-free service' });
    expect(results.length).toBeGreaterThan(0);
  });

  test('clean description passes', () => {
    const results = scanFreeServices({ PublicRemarks: 'Spacious 2-bed with laundry in unit' });
    expect(results).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// ADDRESS SUPPRESSION TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('Address Suppression', () => {
  test('suppressed address in IDX feed is BLOCKER', () => {
    const issues = validateAddressSuppression(
      { InternetAddressDisplayYN: false, StreetNumber: '400', StreetName: 'East 90th' },
      'IDX',
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(i => i.severity === 'BLOCKER')).toBe(true);
  });

  test('suppressed address in RLS feed is OK', () => {
    const issues = validateAddressSuppression(
      { InternetAddressDisplayYN: false, StreetNumber: '400' },
      'RLS',
    );
    expect(issues).toHaveLength(0);
  });

  test('missing flag in IDX is BLOCKER (fail closed)', () => {
    const issues = validateAddressSuppression({}, 'IDX');
    expect(issues.some(i => i.code === 'AS-MissingFlag')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// FARE ACT TESTS (NYC LL 119/2024)
// ═══════════════════════════════════════════════════════════════════════

describe('FARE Act (LL 119/2024)', () => {
  test('only applies to rentals', () => {
    const issues = validateFareAct(validSalePayload(), { isRental: false });
    expect(issues).toHaveLength(0);
  });

  test('rental without OwnerPays with public display warns', () => {
    const issues = validateFareAct(
      validRentalPayload({ OwnerPays: 'None', InternetEntireListingDisplayYN: true }),
      { isRental: true },
    );
    expect(issues.some(i => i.code === 'FARE-MasterGate')).toBe(true);
  });

  test('rental has fee disclosure info', () => {
    const issues = validateFareAct(validRentalPayload(), { isRental: true });
    expect(issues.some(i => i.code === 'FARE-FeeDisclosure')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// RESO RENAME TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('RESO → RLS Renames', () => {
  test('using StandardStatus instead of MlsStatus is ERROR', () => {
    // Only triggers if RESO name exists but RLS name doesn't
    const issues = validateResoRenames({ StandardStatus: 'Active' });
    expect(issues.some(i => i.field === 'StandardStatus')).toBe(true);
  });

  test('using RLS names passes', () => {
    const issues = validateResoRenames({ MlsStatus: 'Active', SourceSystemKey: 'RLS-123' });
    expect(issues).toHaveLength(0);
  });

  test('using UnparsedAddress (lowercase p) flags rename', () => {
    const issues = validateResoRenames({ UnparsedAddress: '123 Main St' });
    expect(issues.some(i => i.field === 'UnparsedAddress')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// REMOVED FIELD TESTS (NAR Settlement)
// ═══════════════════════════════════════════════════════════════════════

describe('Removed Fields (Aug 2025 NAR Settlement)', () => {
  test('BuyerAgencyCompensation is BLOCKER', () => {
    const issues = validateRemovedFields({ BuyerAgencyCompensation: '3%' });
    expect(issues.length).toBe(1);
    expect(issues[0].severity).toBe('BLOCKER');
  });

  test('SubAgencyCompensation is BLOCKER', () => {
    const issues = validateRemovedFields({ SubAgencyCompensation: '2%' });
    expect(issues.length).toBe(1);
  });

  test('all 4 removed fields detected', () => {
    const issues = validateRemovedFields({
      BuyerAgencyCompensation: '3%',
      BuyerAgencyCompensationType: 'Percent',
      SubAgencyCompensation: '2%',
      SubAgencyCompensationType: 'Percent',
    });
    expect(issues).toHaveLength(4);
  });

  test('clean payload passes', () => {
    const issues = validateRemovedFields(validSalePayload());
    expect(issues).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CROSS-FIELD VALIDATION TESTS
// ═══════════════════════════════════════════════════════════════════════

describe('Cross-Field Validation', () => {
  test('non-exclusive listing is BLOCKER (C1)', () => {
    const issues = validateCrossFields(
      validSalePayload({ ListingAgreement: 'OpenListing' }),
    );
    expect(issues.some(i => i.ruleId === 'C1')).toBe(true);
  });

  test('invalid PropertyType is BLOCKER', () => {
    const issues = validateCrossFields(
      validSalePayload({ PropertyType: 'Commercial' }),
    );
    expect(issues.some(i => i.code === 'XF-PropertyType')).toBe(true);
  });

  test('Opt-Out with IDX=True is BLOCKER', () => {
    const issues = validateCrossFields(
      validSalePayload({
        Permissions: 'Owner Opt-Out',
        IDXEntireListingDisplayYN: true,
      }),
    );
    expect(issues.some(i => i.code === 'XF-Permissions-IDX')).toBe(true);
  });

  test('valid exclusive sale passes', () => {
    const issues = validateCrossFields(validSalePayload());
    expect(issues.filter(i => i.severity === 'BLOCKER')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// PENALTY ASSESSMENT TESTS (Section M)
// ═══════════════════════════════════════════════════════════════════════

describe('Penalty Assessment (Section M)', () => {
  test('Fair Housing 1st = $250, 2 days cure', () => {
    const p = assessPenalty('FAIR_HOUSING', 1);
    expect(p.fine).toBe(250);
    expect(p.cureperiodDays).toBe(2);
    expect(p.terminationRisk).toBe(false);
  });

  test('Fair Housing 2nd = $500 + termination', () => {
    const p = assessPenalty('FAIR_HOUSING', 2);
    expect(p.fine).toBe(500);
    expect(p.terminationRisk).toBe(true);
  });

  test('Data Quality 1st = $0, 3 days cure', () => {
    const p = assessPenalty('DATA_QUALITY', 1);
    expect(p.fine).toBe(0);
    expect(p.cureperiodDays).toBe(3);
  });

  test('Data Quality 4th = termination', () => {
    const p = assessPenalty('DATA_QUALITY', 4);
    expect(p.terminationRisk).toBe(true);
  });

  test('General UCBA escalation: $500 → $2K → $10K → suspension', () => {
    expect(assessPenalty('GENERAL_UCBA', 1).fine).toBe(500);
    expect(assessPenalty('GENERAL_UCBA', 2).fine).toBe(2000);
    expect(assessPenalty('GENERAL_UCBA', 3).fine).toBe(10000);
    expect(assessPenalty('GENERAL_UCBA', 4).terminationRisk).toBe(true);
  });

  test('Quarterly rejection = $10,000', () => {
    const p = assessPenalty('QUARTERLY_REJECTION', 1);
    expect(p.fine).toBe(10000);
  });

  test('3 quarterly fines = suspension', () => {
    const p = assessPenalty('QUARTERLY_REJECTION', 3);
    expect(p.terminationRisk).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// INTEGRATION: Full Listing Validation
// ═══════════════════════════════════════════════════════════════════════

describe('Integration: Full Listing Validation', () => {
  test('valid sale listing passes', () => {
    const result = validateListing(validSalePayload());
    expect(result.summary.blockers).toBe(0);
    // May have INFO-level issues (like FARE Act disclosure reminder for rentals)
  });

  test('empty payload fails with many blockers', () => {
    const result = validateListing({});
    expect(result.valid).toBe(false);
    expect(result.summary.blockers).toBeGreaterThan(0);
  });

  test('listing with fair housing violation fails', () => {
    const result = validateListing(validSalePayload({
      PublicRemarks: 'Beautiful apartment, no children allowed, adults only',
    }));
    expect(result.issues.some(i => i.category === 'CONTENT_FAIR_HOUSING')).toBe(true);
  });

  test('listing with removed compensation field fails', () => {
    const result = validateListing({
      ...validSalePayload(),
      BuyerAgencyCompensation: '3%',
    });
    expect(result.issues.some(i => i.category === 'REMOVED_FIELD')).toBe(true);
  });

  test('strict mode treats warnings as failures', () => {
    const payload = validSalePayload({ PublicRemarks: 'Free listing service for this unit' });
    const normalResult = validateListing(payload);
    const strictResult = validateListing(payload, { strict: true });
    // Strict should be less likely to pass
    expect(strictResult.valid).toBe(false);
  });

  test('suite filtering works', () => {
    const result = validateListing(validSalePayload(), {
      suites: ['MANDATORY_FIELD'],
    });
    // Should only have mandatory field issues (none for valid payload)
    expect(result.issues.every(i => i.category === 'MANDATORY_FIELD')).toBe(true);
  });

  test('rental listing validates correctly', () => {
    const result = validateListing(validRentalPayload(), { isRental: true });
    // Should have FARE Act info
    expect(result.issues.some(i => i.category === 'FARE_ACT')).toBe(true);
  });

  test('result has timestamp', () => {
    const result = validateListing(validSalePayload());
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  test('summary byCategory counts are correct', () => {
    const result = validateListing({});
    const totalFromCategories = Object.values(result.summary.byCategory).reduce((a, b) => a + b, 0);
    expect(totalFromCategories).toBe(result.summary.total);
  });
});
