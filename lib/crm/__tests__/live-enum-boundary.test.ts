/// <reference types="jest" />
/**
 * THE LIVE-ENUM BOUNDARY on the CRM write path (Packet 2 closure, correction round).
 *
 * Every provider enum field the write contract accepts — whether a client supplies it directly or the
 * server derives it from a Mallan form fact — is validated against the live Cotality contract
 * (lib/cotality/live-contract.ts). No per-field special case: the boundary is generic.
 */
import {
  applyServerFormMapping,
  MALLAN_FACT_DERIVATIONS,
  BUILDING_FEATURE_LABEL_TO_LIVE,
} from '../listing-form-mapping';
import { liveEnumMembers, liveEnumViolations, enumValueTokens, LIVE_PROPERTY_FIELDS } from '@/lib/cotality/live-contract';
import { MALLAN_FORM_CONTRACT } from '@/lib/listings/mallan-form-contract';

const HOSTILE = '__NOT_A_LIVE_MEMBER__';

/** Every live enum field the Mallan storage model persists (the write contract's provider enum surface). */
function persistedEnumFields(): string[] {
  return Object.keys(MALLAN_FORM_CONTRACT.persistenceMap).filter((k) => liveEnumMembers(k) !== null);
}

describe('hostile direct provider enum input is refused (the exact review payload)', () => {
  it('{ PropertyType: Residential, PropertySubType: SingleFamilyTownhouse, CommonInterest: None } fails on PropertySubType', () => {
    const r = applyServerFormMapping({ PropertyType: 'Residential', PropertySubType: 'SingleFamilyTownhouse', CommonInterest: 'None' }, 'sale');
    expect(r.errors).toEqual([expect.stringMatching(/^PropertySubType "SingleFamilyTownhouse" is not a live Cotality PropertySubType member$/)]);
    expect(liveEnumMembers('PropertySubType')).toContain('Townhouse');
    expect(liveEnumMembers('PropertySubType')).not.toContain('SingleFamilyTownhouse');
  });

  it.each([
    ['PropertyType', 'Commercial'],
    ['PropertySubType', 'MultiFamilyTownhouse'],
    ['CommonInterest', 'Cooperative'],
    ['ListingAgreement', 'Exclusive'],
    ['StructureType', 'WalkUp'],
    ['Furnished', 'Yes'],
    ['PetsAllowed', 'Dogs'],
    ['StreetSuffix', 'Str'],
    ['Concessions', 'Maybe'],
    ['SyndicateTo', 'AllOptedIn'],
    ['LotSizeUnits', 'SqFt'],
  ])('%s "%s" is refused by name', (field, value) => {
    const r = applyServerFormMapping({ [field]: value }, 'sale');
    expect(r.errors).toContain(`${field} "${value}" is not a live Cotality ${field} member`);
  });

  it('every persisted provider enum field refuses a non-live value (generic — no field is exempt)', () => {
    const fields = persistedEnumFields();
    expect(fields.length).toBeGreaterThan(15);
    for (const field of fields) {
      const r = applyServerFormMapping({ [field]: HOSTILE }, 'rent');
      expect({ field, errors: r.errors }).toEqual({ field, errors: [`${field} "${HOSTILE}" is not a live Cotality ${field} member`] });
    }
  });

  it('multi-select values are checked token by token (arrays and comma lists)', () => {
    expect(applyServerFormMapping({ View: ['City', 'Park'] }, 'sale').errors).toEqual(['View "Park" is not a live Cotality View member']);
    expect(applyServerFormMapping({ Heating: 'Steam, Radiant Floor' }, 'sale').errors).toEqual(['Heating "Radiant Floor" is not a live Cotality Heating member']);
    expect(applyServerFormMapping({ View: ['City', 'Bridges'] }, 'sale').errors).toEqual([]);
    expect(enumValueTokens('View', 'City,Bridges')).toEqual(['City', 'Bridges']);
    expect(enumValueTokens('View', null)).toEqual([]);
  });

  it('a live value passes, and an unknown Mallan form value is still refused (nothing is defaulted)', () => {
    const ok = applyServerFormMapping({ PropertyType: 'Residential', PropertySubType: 'Townhouse', CommonInterest: 'None', StructureType: 'Townhouse', ListingAgreement: 'ExclusiveRightToSell' }, 'sale');
    expect(ok.errors).toEqual([]);
    expect(applyServerFormMapping({ salePropertyType: 'Castle' }, 'sale').errors).toEqual(['salePropertyType "Castle" is not a recognized Mallan property type']);
  });
});

describe('Mallan form value aliases are accepted and stored as live members', () => {
  it('legacy unit-level pet values, the CoExclusive radio value and street-type abbreviations', () => {
    const r = applyServerFormMapping({ PetsAllowed: ['UnitYes', 'UnitCatsOK'], ListingAgreement: 'CoExclusive', StreetSuffix: 'St' }, 'sale');
    expect(r.errors).toEqual([]);
    expect(r.body.PetsAllowed).toEqual(['Yes', 'CatsOk']);
    expect(r.body.ListingAgreement).toBe('CoExclusiveAgency');
    expect(r.body.StreetSuffix).toBe('Street');
  });
  it('every alias target under a provider enum field is a live member', () => {
    for (const [field, table] of Object.entries(MALLAN_FORM_CONTRACT.valueAliases as Record<string, Record<string, string>>)) {
      const members = liveEnumMembers(field);
      if (!members) continue; // Mallan-internal or non-enum keys
      for (const [from, to] of Object.entries(table)) expect({ field, from, to, live: members.includes(to) }).toEqual({ field, from, to, live: true });
    }
  });
});

describe('Mallan form facts → the live members among them (server-derived provider fields)', () => {
  it('every derivation targets a live enum field and every label-table target is a live member', () => {
    for (const d of MALLAN_FACT_DERIVATIONS) {
      expect({ form: d.form, field: d.field, live: LIVE_PROPERTY_FIELDS.has(d.field) && liveEnumMembers(d.field) !== null }).toEqual({ form: d.form, field: d.field, live: true });
      expect(liveEnumMembers(d.form)).toBeNull(); // the Mallan key is never itself a provider enum field
    }
    for (const [label, member] of Object.entries(BUILDING_FEATURE_LABEL_TO_LIVE)) {
      expect({ label, member, live: liveEnumMembers('BuildingFeatures')!.includes(member) }).toEqual({ label, member, live: true });
    }
  });

  it('building type: a live choice is written; "Walk-Up" / "Loft" / "Commercial" stay Mallan facts and the provider field is cleared', () => {
    const live = applyServerFormMapping({ saleBldgType: 'HighRise' }, 'sale');
    expect(live.errors).toEqual([]);
    expect(live.body.StructureType).toBe('HighRise');
    const walkUp = applyServerFormMapping({ saleBldgType: 'WalkUp', StructureType: 'WalkUp' }, 'sale');
    expect(walkUp.errors).toEqual([]);
    expect(walkUp.body.StructureType).toBeNull();
    expect(walkUp.body.saleBldgType).toBe('WalkUp');
    expect(walkUp.retained).toEqual([expect.stringContaining('saleBldgType: "WalkUp" kept as Mallan fact')]);
    // the unit-level select resolves it when the building profile has no live member
    const both = applyServerFormMapping({ saleBldgType: 'WalkUp', saleStructureType: 'MidRise' }, 'sale');
    expect(both.body.StructureType).toBe('MidRise');
    const rent = applyServerFormMapping({ bldgType: 'Loft', rentalStructureType: 'LowRise' }, 'rent');
    expect(rent.body.StructureType).toBe('LowRise');
  });

  it('views and amenity labels: the live subset is written; the Mallan selection is kept whole', () => {
    const r = applyServerFormMapping({ saleViewList: ['City', 'Park', 'Bridges'], saleBuildingFeaturesInternal: ['Elevator', 'Roof Deck', 'Bike Room'] }, 'sale');
    expect(r.errors).toEqual([]);
    expect(r.body.View).toEqual(['City', 'Bridges']);
    expect(r.body.saleViewList).toEqual(['City', 'Park', 'Bridges']);
    expect(r.body.BuildingFeatures).toEqual(['Elevators', 'BikeStorage']);
    expect(r.body.saleBuildingFeaturesInternal).toEqual(['Elevator', 'Roof Deck', 'Bike Room']);
    expect(r.retained.join('\n')).toMatch(/saleViewList: "Park" kept as Mallan fact/);
    expect(r.retained.join('\n')).toMatch(/saleBuildingFeaturesInternal: "Roof Deck" kept as Mallan fact/);
    const rent = applyServerFormMapping({ rentalBuildingFeaturesInternal: ['Gym/Fitness Center', 'Pool'] }, 'rent');
    expect(rent.body.BuildingFeatures).toEqual(['FitnessCenter']);
  });

  it('FARE fee lists: the free text is a Mallan fact; the live multi-select receives only live members', () => {
    const typed = applyServerFormMapping({ MoveInCostsDescription: 'Application Fee, Move-In Fee, Credit Check', OngoingFeesDescription: 'Storage, Parking', TenantPaysList: 'Electric, Gas' }, 'rent');
    expect(typed.errors).toEqual([]);
    expect(typed.body.MoveInCosts).toEqual([]);
    expect(typed.body.OngoingFees).toEqual([]);
    expect(typed.body.TenantPays).toEqual(['Gas']);
    expect(typed.body.MoveInCostsDescription).toBe('Application Fee, Move-In Fee, Credit Check');
    const members = applyServerFormMapping({ MoveInCostsDescription: 'ApplicationFee, CreditCheck', OngoingFeesDescription: 'ParkingFee', TenantPaysList: 'Electricity, Gas' }, 'rent');
    expect(members.body.MoveInCosts).toEqual(['ApplicationFee', 'CreditCheck']);
    expect(members.body.OngoingFees).toEqual(['ParkingFee']);
    expect(members.body.TenantPays).toEqual(['Electricity', 'Gas']);
  });

  it('when a Mallan fact key is present the client-supplied provider value is not consulted', () => {
    const r = applyServerFormMapping({ saleViewList: ['City'], View: ['Park'] }, 'sale');
    expect(r.errors).toEqual([]);
    expect(r.body.View).toEqual(['City']);
  });

  it('the derived output never carries a non-live provider enum value (liveEnumViolations on the result is empty)', () => {
    const r = applyServerFormMapping({
      salePropertyType: 'SingleFamilyTownhouse', saleStatus: 'Active', saleBldgType: 'WalkUp', saleViewList: ['Park', 'City'],
      saleBuildingFeaturesInternal: ['Elevator', 'Spa'], PetsAllowed: ['UnitYes'], StreetSuffix: 'Ave', ListingAgreement: 'CoExclusive',
    }, 'sale');
    expect(r.errors).toEqual([]);
    expect(liveEnumViolations(r.body)).toEqual([]);
    expect(r.body.PropertySubType).toBe('Townhouse');
  });
});
