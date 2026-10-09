/// <reference types="jest" />
/**
 * The REBNY rule tables name only fields the live Cotality Property resource has.
 *
 * Found 2026-10-08 (an adversarial audit, then a run of the real Add forms through the create gate): 23 of the 50 conditional rules, and two of the unconditionally required fields,
 * named a field that is not in the live Cotality $metadata (ElevatorsTotal, NewDevelopmentYN, MaximumFinancingPercent, NumberOfShares, PercentOfCommonElements, TaxMonthlyAmount, MinLeaseMonths,
 * FurnishedListPrice, SponsorUnitYN, CoOwnershipInterest ...). Cotality cannot be sent a field it does not have, so a rule that requires one cannot be met by any form: the create gate (POST
 * /api/crm/listings: validateListing, then assertRlsCompliantPayload, on the body as the form sent it) answered 422 for every listing the rule applied to. The file's own policy said so already
 * ("Phantom fields cannot be mandatory (authority = live $metadata)", and MOVEIN-001 and VIEW-001 were corrected for it in May); these were the ones the May sweep missed.
 *
 * data/cotality-enums.live.json is the committed copy of the live $metadata (`npm run cotality:pull`). This test reads the table against it, so a field that is not Cotality's cannot come back.
 *
 * Two keys are the exception, by the table's own header ("an NYC fact the provider carries inside CustomProperty.CustomFields (e.g. SponsorUnitYN) ... Classify a key before removing it"): SponsorUnitYN and
 * NewDevelopmentYN. An independent review (2026-10-09) found the first trim removed SPONSOR-001 and SPONSOR-002 without classifying them: the Sale form sends both keys as booleans, so those two rules can
 * be met, and removing them only weakened the gate. They are back, and these two keys are the only non-Property keys any rule may name, and only the SPONSOR rules do.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { REBNY_FIELD_TABLES } from '../rebny-field-tables';
import { assertRlsCompliantPayload } from '../rls-enforcement';

const live = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-enums.live.json'), 'utf-8')) as { entities: { Property: Record<string, string> } };
const PROPERTY_FIELDS = new Set(Object.keys(live.entities.Property));
const rules = REBNY_FIELD_TABLES.conditionalRules as ReadonlyArray<{ code: string; appliesWhen: Record<string, unknown>; requireFields: readonly string[] }>;
/** NYC facts the table's header classifies (not top-level Property fields): the only non-Property keys a rule may name, and only the SPONSOR rules do. */
const NYC_FACTS = new Set(['SponsorUnitYN', 'NewDevelopmentYN']);
const ALLOWED_FOR = (rule: { code: string }, field: string) => PROPERTY_FIELDS.has(field) || (NYC_FACTS.has(field) && rule.code.startsWith('SPONSOR-'));

describe('REBNY_FIELD_TABLES against the live Cotality Property resource', () => {
  it('knows which fields are Cotality\'s (the guard is not vacuous)', () => {
    expect(PROPERTY_FIELDS.size).toBeGreaterThan(500);
    for (const live of ['ListPrice', 'AssociationFee', 'SpecialListingConditions', 'LivingAreaUnits', 'PropertyCondition', 'SyndicateTo']) expect(PROPERTY_FIELDS.has(live)).toBe(true);
    for (const phantom of ['ElevatorsTotal', 'NewDevelopmentYN', 'MaximumFinancingPercent', 'NumberOfShares', 'MinLeaseMonths', 'FurnishedListPrice', 'SponsorUnitYN']) expect(PROPERTY_FIELDS.has(phantom)).toBe(false);
  });

  it('every unconditionally required field (agentSubmitted) is a live Property field', () => {
    const notLive = REBNY_FIELD_TABLES.requiredFields.agentSubmitted.filter((field) => !PROPERTY_FIELDS.has(field));
    expect(notLive).toEqual([]);
  });

  it('every field a conditional rule requires is a live Property field (or one of the two NYC facts, in the SPONSOR rules only)', () => {
    const notLive = rules.flatMap((rule) => rule.requireFields.filter((field) => !ALLOWED_FOR(rule, field)).map((field) => `${rule.code} requires ${field}`));
    expect(notLive).toEqual([]);
  });

  it('every field a conditional rule is triggered by is a live Property field (a trigger Cotality cannot send never fires), or one of the two NYC facts the Sale form sends', () => {
    const notLive = rules.flatMap((rule) => Object.keys(rule.appliesWhen).filter((field) => !ALLOWED_FOR(rule, field)).map((field) => `${rule.code} is triggered by ${field}`));
    expect(notLive).toEqual([]);
  });

  it('the NYC facts are named by exactly the SPONSOR rules, and the table does not make SponsorUnitYN or NewDevelopmentYN mandatory for every listing', () => {
    const naming = (field: string) => rules.filter((rule) => rule.requireFields.includes(field) || field in rule.appliesWhen).map((rule) => rule.code).sort();
    expect(naming('SponsorUnitYN')).toEqual(['SPONSOR-001', 'SPONSOR-002']);
    expect(naming('NewDevelopmentYN')).toEqual(['SPONSOR-001']);
    expect(REBNY_FIELD_TABLES.requiredFields.agentSubmitted).not.toContain('SponsorUnitYN');
    expect(REBNY_FIELD_TABLES.requiredFields.agentSubmitted).not.toContain('NewDevelopmentYN');
  });

  it('the rules that were removed for naming only fields Cotality does not have are gone, and the ones that kept their live fields still require them', () => {
    const codes = new Set(rules.map((rule) => rule.code));
    for (const removed of ['COOP-001', 'RENTAL-002', 'BUYER-NONRLS-001', 'TAXABATE-001', 'FLIPTAX-001', 'FURNISHED-001', 'COOWN-001', 'BLDGPETS-001', 'UNITPETS-001', 'GARAGE-001', 'COBUYER-RLS-001', 'COBUYER-NONRLS-001', 'ALTSTREET-001', 'CEILING-001', 'CEILING-002', 'PRICECHANGE-001', 'OUTDOOR-001']) {
      expect(codes.has(removed)).toBe(false);
    }
    const byCode = (code: string) => rules.find((rule) => rule.code === code);
    expect(byCode('CONDO-COOP-001')?.requireFields).toEqual(['AssociationFee', 'SpecialListingConditions']);
    expect(byCode('CONDO-001')?.requireFields).toEqual(['LivingArea', 'TaxLot', 'TaxAnnualAmount']);       // the live annual tax stands in for the phantom TaxMonthlyAmount: a condo is not left without a tax figure
    expect(byCode('RENTAL-001')?.requireFields).toEqual(['AvailabilityDate', 'Furnished']);
    expect(byCode('CLOSED-001')?.requireFields).toEqual(['CloseDate', 'ClosePrice']);
    expect(byCode('SPONSOR-001')?.requireFields).toEqual(['SponsorUnitYN']);
    expect(byCode('SPONSOR-002')?.requireFields).toEqual(['SponsorUnitYN']);
    expect(rules.length).toBe(33);
  });

  describe('the gate applies the rules that were restored', () => {
    const blockers = (payload: Record<string, unknown>) => assertRlsCompliantPayload({ PropertyType: 'Residential', ...payload }, { listingType: 'sale', rlsEligible: true }).blockers;
    const codes = (payload: Record<string, unknown>) => blockers(payload).map((b) => b.code);

    it('SPONSOR-001 and SPONSOR-002: a new development / new construction that does not say whether it is a sponsor unit is refused; either answer (true or false) meets the rule', () => {
      expect(codes({ NewDevelopmentYN: true })).toContain('CF-SPONSOR-001');
      expect(codes({ NewConstructionYN: true })).toContain('CF-SPONSOR-002');
      for (const answer of [true, false]) {
        expect(codes({ NewDevelopmentYN: true, SponsorUnitYN: answer })).not.toContain('CF-SPONSOR-001');
        expect(codes({ NewConstructionYN: true, SponsorUnitYN: answer })).not.toContain('CF-SPONSOR-002');
      }
      expect(codes({ NewDevelopmentYN: false })).not.toContain('CF-SPONSOR-001');
      expect(codes({ NewConstructionYN: false })).not.toContain('CF-SPONSOR-002');
    });

    it('CONDO-001: a condo with no annual tax is refused, naming TaxAnnualAmount; with it, the rule is met', () => {
      const bad = blockers({ CommonInterest: 'Condominium' }).filter((b) => b.code === 'CF-CONDO-001').map((b) => b.field);
      expect(bad).toContain('TaxAnnualAmount');
      expect(blockers({ CommonInterest: 'Condominium', TaxAnnualAmount: 12000, LivingArea: 800, TaxLot: '1-1' }).filter((b) => b.code === 'CF-CONDO-001' && b.field === 'TaxAnnualAmount')).toEqual([]);
      expect(blockers({ CommonInterest: 'StockCooperative' }).filter((b) => b.code === 'CF-CONDO-001')).toEqual([]);    // a co-op has no CONDO-001 rule
    });
  });
});
