/// <reference types="jest" />
/**
 * A building's type comes from how Cotality describes ALL of its listings. The counts below are live Cotality (2026-10-16, listings of any status).
 */
import { classifyBuilding } from '@/lib/buildings/classify-building';

const many = (n: number, rec: Record<string, unknown>) => Array.from({ length: n }, () => rec);

describe('classifyBuilding on live Cotality counts', () => {
  it('333 E 46th Street: 130 StockCooperative and 70 Condop listings is a Condop, not a co-op', () => {
    const r = classifyBuilding([...many(130, { CommonInterest: 'StockCooperative' }), ...many(70, { CommonInterest: 'Condop' })]);
    expect(r.commonInterest).toBe('Condop');
    expect(r.kind).toBe('Condop');
    expect(r.votes).toEqual({ StockCooperative: 130, Condop: 70 });
  });
  it("ownership is read from the whole history: current listings that all say StockCooperative do not hide the Condop past", () => {
    const r = classifyBuilding([
      ...many(2, { StandardStatus: 'Active', CommonInterest: 'StockCooperative', PropertySubType: 'Apartment' }),
      ...many(60, { StandardStatus: 'Closed', CommonInterest: 'StockCooperative', PropertySubType: 'Apartment' }),
      ...many(40, { StandardStatus: 'Closed', CommonInterest: 'Condop', PropertySubType: 'Apartment' }),
    ]);
    expect(r.kind).toBe('Condop');
  });
  it('400 E 90th Street (Century Tower): 147 Condominium and 23 StockCooperative is a condo', () => {
    expect(classifyBuilding([...many(147, { CommonInterest: 'Condominium' }), ...many(23, { CommonInterest: 'StockCooperative' })]).kind).toBe('Condo');
  });
  it('200 E 66th Street (Manhattan House): 190 Condominium and 6 StockCooperative is a condo', () => {
    expect(classifyBuilding([...many(190, { CommonInterest: 'Condominium' }), ...many(6, { CommonInterest: 'StockCooperative' })]).kind).toBe('Condo');
  });
  it('a co-op with one stray Condop listing stays a co-op; with two but under a tenth of them it does too', () => {
    expect(classifyBuilding([...many(60, { CommonInterest: 'StockCooperative' }), { CommonInterest: 'Condop' }]).kind).toBe('Coop');
    expect(classifyBuilding([...many(60, { CommonInterest: 'StockCooperative' }), ...many(2, { CommonInterest: 'Condop' })]).kind).toBe('Coop');
    expect(classifyBuilding([...many(60, { CommonInterest: 'StockCooperative' }), ...many(7, { CommonInterest: 'Condop' })]).kind).toBe('Condop');
  });
  it('a building whose every tagged listing is Condop is a Condop, even a single listing (211 E 53rd Street)', () => {
    expect(classifyBuilding([{ CommonInterest: 'Condop' }]).kind).toBe('Condop');
  });
  it('listings with no ownership tag do not vote (None, null)', () => {
    expect(classifyBuilding([{ CommonInterest: 'None' }, { CommonInterest: null }, { CommonInterest: 'StockCooperative' }]).kind).toBe('Coop');
  });
});

describe('a building with no ownership tag is read from its structure', () => {
  it('Townhouse structure: one family (9 MacDougal Alley) and several (152 W 121st Street)', () => {
    expect(classifyBuilding([{ CommonInterest: 'None', PropertySubType: 'SingleFamilyResidence', StructureType: 'Townhouse', NumberOfUnitsTotal: 1 }]).kind).toBe('SingleFamilyTownhouse');
    expect(classifyBuilding([{ CommonInterest: 'None', PropertySubType: 'MultiFamily', StructureType: ['Townhouse'], NumberOfUnitsTotal: 3 }]).kind).toBe('MultiFamilyTownhouse');
  });
  it('current listings outweigh closed ones: 152 W 121st Street is a townhouse although a closed rental of one unit says Condominium (live)', () => {
    const r = classifyBuilding([
      { StandardStatus: 'Active', CommonInterest: 'None', PropertySubType: 'MultiFamily', StructureType: 'Townhouse', NumberOfUnitsTotal: 3 },
      { StandardStatus: 'Closed', CommonInterest: 'Condominium', PropertySubType: 'Apartment', StructureType: null, NumberOfUnitsTotal: 9 },
    ]);
    expect(r.kind).toBe('MultiFamilyTownhouse');
    // with nothing current, the history decides
    expect(classifyBuilding([{ StandardStatus: 'Closed', CommonInterest: 'Condominium', PropertySubType: 'Apartment' }]).kind).toBe('Condo');
  });
  it('a townhouse whose one listing carries a Condominium tag is still a townhouse (152 W 121st Street, live)', () => {
    expect(classifyBuilding([{ CommonInterest: 'Condominium', PropertySubType: 'MultiFamily', StructureType: 'Townhouse', NumberOfUnitsTotal: 3 }]).kind).toBe('MultiFamilyTownhouse');
    // ...but a tower of apartments stays what its tag says
    expect(classifyBuilding([{ CommonInterest: 'Condominium', PropertySubType: 'Apartment', StructureType: 'HighRise' }]).kind).toBe('Condo');
  });
  it('MultiFamily (55 W 85th Street), mixed use and single family', () => {
    expect(classifyBuilding([{ PropertySubType: 'MultiFamily', StructureType: 'MultiFamily', NumberOfUnitsTotal: 2 }]).kind).toBe('MultiFamily');
    expect(classifyBuilding([{ PropertySubType: 'Apartment', StructureType: 'HighRise,MixedUse' }]).kind).toBe('MixedUse');
    expect(classifyBuilding([{ PropertySubType: 'SingleFamilyResidence', StructureType: 'House' }]).kind).toBe('SingleFamily');
  });
  it('says nothing when Cotality does not', () => {
    expect(classifyBuilding([]).kind).toBeNull();
    expect(classifyBuilding([{ PropertySubType: 'Apartment', StructureType: null }]).kind).toBeNull();
  });
});
