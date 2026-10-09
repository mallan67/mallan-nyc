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
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { REBNY_FIELD_TABLES } from '../rebny-field-tables';

const live = JSON.parse(readFileSync(resolve(__dirname, '../../../data/cotality-enums.live.json'), 'utf-8')) as { entities: { Property: Record<string, string> } };
const PROPERTY_FIELDS = new Set(Object.keys(live.entities.Property));
const rules = REBNY_FIELD_TABLES.conditionalRules as ReadonlyArray<{ code: string; appliesWhen: Record<string, unknown>; requireFields: readonly string[] }>;

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

  it('every field a conditional rule requires is a live Property field', () => {
    const notLive = rules.flatMap((rule) => rule.requireFields.filter((field) => !PROPERTY_FIELDS.has(field)).map((field) => `${rule.code} requires ${field}`));
    expect(notLive).toEqual([]);
  });

  it('every field a conditional rule is triggered by is a live Property field (a trigger Cotality cannot send never fires)', () => {
    const notLive = rules.flatMap((rule) => Object.keys(rule.appliesWhen).filter((field) => !PROPERTY_FIELDS.has(field)).map((field) => `${rule.code} is triggered by ${field}`));
    expect(notLive).toEqual([]);
  });

  it('the rules that were removed for naming only fields Cotality does not have are gone, and the ones that kept their live fields still require them', () => {
    const codes = new Set(rules.map((rule) => rule.code));
    for (const removed of ['COOP-001', 'RENTAL-002', 'BUYER-NONRLS-001', 'TAXABATE-001', 'FLIPTAX-001', 'FURNISHED-001', 'SPONSOR-001', 'SPONSOR-002', 'COOWN-001', 'BLDGPETS-001', 'UNITPETS-001', 'GARAGE-001', 'COBUYER-RLS-001', 'COBUYER-NONRLS-001', 'ALTSTREET-001', 'CEILING-001', 'CEILING-002', 'PRICECHANGE-001', 'OUTDOOR-001']) {
      expect(codes.has(removed)).toBe(false);
    }
    const byCode = (code: string) => rules.find((rule) => rule.code === code);
    expect(byCode('CONDO-COOP-001')?.requireFields).toEqual(['AssociationFee', 'SpecialListingConditions']);
    expect(byCode('CONDO-001')?.requireFields).toEqual(['LivingArea', 'TaxLot']);
    expect(byCode('RENTAL-001')?.requireFields).toEqual(['AvailabilityDate', 'Furnished']);
    expect(byCode('CLOSED-001')?.requireFields).toEqual(['CloseDate', 'ClosePrice']);
    expect(rules.length).toBe(31);
  });
});
