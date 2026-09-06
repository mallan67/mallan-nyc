/// <reference types="jest" />
/**
 * BUILDING-001 fires on POST-MAPPING data (Packet 2 closure, correction round).
 *
 * Both Mallan townhouse form values map to the live PropertySubType member "Townhouse"
 * (lib/crm/listing-form-mapping.ts). The rule is evaluated on that value — never on the retired
 * pre-normalization spellings — by the ONE required / conditional evaluator (rls-enforcement).
 */
import { applyServerFormMapping } from '@/lib/crm/listing-form-mapping';
import { assertRlsCompliantPayload } from '../rls-enforcement';
import { validateListing } from '../rebny-validator';
import { REBNY_UCBA_RULES } from '../rebny-ucba-rules';
import { liveEnumMembers } from '@/lib/cotality/live-contract';

const BUILDING_FIELDS = ['BuildingAreaTotal', 'TaxAnnualAmount', 'LotSizeArea', 'LotSizeDimensions'] as const;
const CTX = { listingType: 'sale' as const, rlsEligible: true };

/** A complete Mallan sale-form payload for a townhouse (live values only). */
function townhouseForm(formValue: 'SingleFamilyTownhouse' | 'MultiFamilyTownhouse', overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    listing_type: 'sale',
    saleListingType: 'ExclusiveRightToSell',
    saleStatus: 'Active',
    salePropertyType: formValue,
    saleBldgType: 'Townhouse',
    ListPrice: 4500000,
    ListAgentMlsId: 'AGENT-001',
    ListingAgreement: 'ExclusiveRightToSell',
    CoBrokeAgreement: 'Ucba',
    Concessions: 'No',
    StreetNumber: '148',
    StreetName: 'East 78th',
    StreetSuffix: 'Street',
    City: 'New York',
    CityRegion: 'Manhattan',
    StateOrProvince: 'NY',
    PostalCode: '10075',
    PostalCity: 'New York',
    CountyOrParish: 'New York',
    SubdivisionName: 'Upper East Side',
    UnparsedAddress: '148 East 78th Street, New York, NY 10075',
    AttendanceType: 'None',
    BuildingLaundryFeatures: 'InUnit',
    BuildingPetsAllowed: 'BuildingYes',
    PetsAllowed: ['Yes'],
    TaxLot: '1234',
    TaxBlock: '567',
    ElevatorsTotal: 0,
    GarageYN: false,
    NumberOfUnitsTotal: 1,
    StoriesTotal: 4,
    NewConstructionYN: false,
    NewDevelopmentYN: false,
    YearBuilt: 1899,
    BathroomsFull: 3,
    BathroomsHalf: 1,
    BathroomsTotal: 3.5,
    BedroomsTotal: 4,
    RoomsTotal: 9,
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    InternetAutomatedValuationDisplayYN: true,
    InternetConsumerCommentYN: true,
    SyndicateTo: ['SyndicationAllowed'],
    PublicRemarks: 'Four-story townhouse with a south-facing garden.',
    ShowingInstructions: 'Call listing agent to schedule',
    ExpirationDate: '2027-01-15',
    ListingContractDate: '2026-01-01',
    LivingArea: 4200,
    LivingAreaUnits: 'SquareFeet',
    PropertyCondition: 'GoodCondition',
    SpecialListingConditions: 'Standard',
    ...overrides,
  };
}

function building001Blockers(payload: Record<string, unknown>) {
  return assertRlsCompliantPayload(payload, CTX).blockers.filter((b) => b.code === 'CF-BUILDING-001');
}

describe('BUILDING-001 evaluates the post-mapping Townhouse member', () => {
  it('the rule names the live member and no retired spelling', () => {
    const rule = REBNY_UCBA_RULES.conditionalRules.find((r) => r.code === 'BUILDING-001')!;
    const subtypes = (rule.appliesWhen as { PropertySubType: readonly string[] }).PropertySubType;
    expect(subtypes).toContain('Townhouse');
    expect(subtypes).not.toContain('SingleFamilyTownhouse');
    expect(subtypes).not.toContain('MultiFamilyTownhouse');
    for (const s of subtypes) expect({ s, live: liveEnumMembers('PropertySubType')!.includes(s) }).toEqual({ s, live: true });
    expect([...rule.requireFields]).toEqual([...BUILDING_FIELDS]);
  });

  it.each(['SingleFamilyTownhouse', 'MultiFamilyTownhouse'] as const)('%s → PropertySubType Townhouse → BUILDING-001 fires (all four fields blocked)', (formValue) => {
    const mapped = applyServerFormMapping(townhouseForm(formValue), 'sale');
    expect(mapped.errors).toEqual([]);
    expect(mapped.body.PropertyType).toBe('Residential');
    expect(mapped.body.PropertySubType).toBe('Townhouse');
    expect(mapped.body.salePropertyType).toBe(formValue); // the single / multi distinction stays a Mallan fact
    const blockers = building001Blockers(mapped.body);
    expect(blockers.map((b) => b.field).sort()).toEqual([...BUILDING_FIELDS].sort());
  });

  it('each missing building field is blocked on its own', () => {
    for (const missing of BUILDING_FIELDS) {
      const complete: Record<string, unknown> = { BuildingAreaTotal: 5200, TaxAnnualAmount: 48000, LotSizeArea: 2040, LotSizeDimensions: '20x102' };
      delete complete[missing];
      const mapped = applyServerFormMapping(townhouseForm('SingleFamilyTownhouse', complete), 'sale');
      expect(building001Blockers(mapped.body).map((b) => b.field)).toEqual([missing]);
    }
  });

  it('complete required fields → the gate passes', () => {
    const mapped = applyServerFormMapping(townhouseForm('MultiFamilyTownhouse', {
      BuildingAreaTotal: 5200, TaxAnnualAmount: 48000, LotSizeArea: 2040, LotSizeDimensions: '20x102', NumberOfUnitsTotal: 3,
      // the other conditional rules a complete Active townhouse satisfies (ACTIVE-001, AREA-UNITS-002/003)
      OnMarketDate: '2026-01-15', BuildingAreaUnits: 'SquareFeet', LotSizeUnits: 'SquareFeet',
    }), 'sale');
    expect(mapped.errors).toEqual([]);
    const gate = assertRlsCompliantPayload(mapped.body, CTX);
    expect(gate.blockers).toEqual([]);
    expect(gate.passed).toBe(true);
  });

  it('the reporting wrapper carries the same finding through the ONE evaluator', () => {
    const mapped = applyServerFormMapping(townhouseForm('SingleFamilyTownhouse'), 'sale');
    const report = validateListing(mapped.body, CTX);
    const fromWrapper = report.errors.filter((e) => e.includes('CF-BUILDING-001'));
    expect(fromWrapper).toHaveLength(BUILDING_FIELDS.length);
    expect(report.compliance.rebnyRls).toBe(false);
    expect(report.compliance.cotalityLiveContract).toBe(true);
  });
});
