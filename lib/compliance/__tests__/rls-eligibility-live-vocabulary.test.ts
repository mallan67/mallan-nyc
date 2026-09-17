/// <reference types="jest" />
/**
 * RLS eligibility classifier — live-vocabulary boundary and UCBA Art. I Sec. 5(F) behaviour.
 *
 * THE CHAIN THIS LOCKS
 *   COTALITY ACTUAL CONTRACT -> VERIFIED MAPPING -> MALLAN STORAGE
 *   -> MALLAN REBNY/UCBA BUSINESS RULE -> CRM CREATE/PATCH CONSUMER
 *
 * WHAT REACHES THE CLASSIFIER
 *   Both callers reassign `body = applyServerFormMapping(...).body` BEFORE calling it
 *   (app/api/crm/listings/route.ts:272 then :282; app/api/crm/listings/[id]/route.ts:142 then
 *   :146/:156). So `payload.PropertyType` / `PropertySubType` carry POST-MAPPING live Cotality
 *   vocabulary, and the mapping refuses unknown values rather than defaulting them.
 *
 * COTALITY FACTS (verified live 2026-09-07 against the authorized API, and re-asserted below
 * against the committed live contract so drift breaks this suite):
 *   - Property.PropertyType    — 13 published members. "Commercial" is NOT one of them;
 *                                "CommercialLease" and "CommercialSale" are.
 *   - Property.PropertySubType — 76 published members. "Commercial" IS one (a DIFFERENT field
 *                                from PropertyType). "Condo", "CommunityApartment",
 *                                "GardenApartment", "UnitDuplex", "UnitQuadruplex" and
 *                                "UnitTriplex" are NOT members.
 *   - Property.NumberOfUnitsTotal — a live Property field.
 *
 * MALLAN-OWNED FACTS (NOT Cotality): listings.rls_eligible, listings.commercial_sub_type,
 *   listings.commercial_ownership, and the InHouse listing types.
 *
 * REBNY/UCBA RULE: Art. I Sec. 5(F) — "These rules apply to professional/retail units within
 *   residential properties of 5 units or less" (verified in data/UCBA-2026-Requirements.md:57).
 */
import { classifyRlsEligibility } from '@/lib/compliance/rls-eligibility';
import { liveEnumMembers } from '@/lib/cotality/live-contract';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, '../rls-eligibility.ts'), 'utf8');

// ─── A. every provider-looking classification value must be a LIVE member ───────────────────
describe('live-vocabulary boundary — no invented Cotality classification survives', () => {
  it('every PropertySubType the classifier tests is a published live member', () => {
    const live = liveEnumMembers('PropertySubType');
    expect(live).not.toBeNull();
    const tested = [
      // RESIDENTIAL_SUBTYPES
      'Apartment', 'Condominium', 'CoOwnership', 'DeededParking', 'Duplex', 'Loft',
      'MultiFamily', 'Quadruplex', 'SingleFamilyResidence', 'Timeshare', 'Townhouse',
      'Triplex', 'UnimprovedLand',
      // MIXED_USE_SUBTYPES
      'MixedUse', 'Office', 'Retail',
    ];
    for (const v of tested) expect(live).toContain(v);
  });

  it('every PropertyType the classifier tests is a published live member', () => {
    const live = liveEnumMembers('PropertyType');
    expect(live).not.toBeNull();
    for (const v of ['CommercialLease', 'CommercialSale', 'Residential', 'ResidentialLease']) {
      expect(live).toContain(v);
    }
  });

  // NEGATIVE: the six values removed 2026-09-07 are genuinely not live, and are gone from source.
  it.each(['Condo', 'CommunityApartment', 'GardenApartment', 'UnitDuplex', 'UnitQuadruplex', 'UnitTriplex'])(
    "'%s' is NOT a live PropertySubType and must not be classified as residential",
    (value) => {
      expect(liveEnumMembers('PropertySubType')).not.toContain(value);
      // and it no longer appears as a classification constant in the source
      expect(SRC).not.toMatch(new RegExp(`"${value}"`));
    },
  );

  it("'Commercial' is NOT a live PropertyType member, and the dead branch is gone", () => {
    expect(liveEnumMembers('PropertyType')).not.toContain('Commercial');
    expect(SRC).not.toMatch(/propertyType === "Commercial"/);
    // it IS a live PropertySubType — a different field the classifier does not test as a type
    expect(liveEnumMembers('PropertySubType')).toContain('Commercial');
  });

  it('the source carries no RESO terminology', () => {
    expect(SRC).not.toMatch(/\bRESO\b/);
  });
});

// ─── B. UCBA Art. I Sec. 5(F) — the 5-unit threshold ────────────────────────────────────────
describe('UCBA Art. I Sec. 5(F) — mixed-use 5-unit threshold', () => {
  const mixed = { PropertyType: 'Residential', PropertySubType: 'MixedUse' };

  it.each([1, 2, 5])('%i units (<=5) → RLS-eligible, mixedUseSmallBuilding true', (n) => {
    const r = classifyRlsEligibility({ ...mixed, NumberOfUnitsTotal: n });
    expect(r.rlsEligible).toBe(true);
    expect(r.mixedUseSmallBuilding).toBe(true);
    expect(r.ucbaRef).toBe('UCBA Art. I, Sec. 5(F)');
  });

  it.each([6, 12, 300])('%i units (>5) → website-only, mixedUseSmallBuilding false', (n) => {
    const r = classifyRlsEligibility({ ...mixed, NumberOfUnitsTotal: n });
    expect(r.rlsEligible).toBe(false);
    expect(r.mixedUseSmallBuilding).toBe(false);
    expect(r.ucbaRef).toBe('UCBA Art. I, Sec. 5(F)');
  });

  it('the boundary is inclusive at 5 and exclusive at 6', () => {
    expect(classifyRlsEligibility({ ...mixed, NumberOfUnitsTotal: 5 }).rlsEligible).toBe(true);
    expect(classifyRlsEligibility({ ...mixed, NumberOfUnitsTotal: 6 }).rlsEligible).toBe(false);
  });

  it('accepts the unit count under all three key spellings the parser supports', () => {
    for (const key of ['NumberOfUnitsTotal', 'numberOfUnitsTotal', 'number_of_units_total']) {
      expect(classifyRlsEligibility({ ...mixed, [key]: 9 }).rlsEligible).toBe(false);
    }
  });

  // DOCUMENTED, NOT ASSERTED AS CORRECT: missing unit count defaults to RLS-eligible.
  // The intent is to route the listing INTO the stricter path. See the enforcement-gap test below.
  it('a missing unit count defaults to RLS-eligible and assumes a small building', () => {
    const r = classifyRlsEligibility(mixed);
    expect(r.rlsEligible).toBe(true);
    expect(r.mixedUseSmallBuilding).toBe(true);
    expect(r.reason).toMatch(/NumberOfUnitsTotal not provided/);
  });

  it.each(['', null, undefined, 'not-a-number'])('unit count %p is treated as unknown', (v) => {
    expect(classifyRlsEligibility({ ...mixed, NumberOfUnitsTotal: v }).mixedUseSmallBuilding).toBe(true);
  });
});

// ─── C. classification tiers ────────────────────────────────────────────────────────────────
describe('classification tiers', () => {
  it('explicit opt-out wins over everything (MALLAN decision)', () => {
    const r = classifyRlsEligibility(
      { PropertyType: 'Residential', PropertySubType: 'Apartment' },
      { explicitOptOut: true },
    );
    expect(r.rlsEligible).toBe(false);
    expect(r.ucbaRef).toBeNull();
  });

  it.each(['CommercialLease', 'CommercialSale'])('%s PropertyType → website-only', (pt) => {
    const r = classifyRlsEligibility({ PropertyType: pt });
    expect(r.rlsEligible).toBe(false);
    expect(r.mixedUseSmallBuilding).toBe(false);
  });

  it.each(['Apartment', 'Condominium', 'Townhouse', 'MultiFamily', 'SingleFamilyResidence', 'Loft'])(
    'residential subtype %s → RLS-eligible, no mixed-use flag',
    (st) => {
      const r = classifyRlsEligibility({ PropertyType: 'Residential', PropertySubType: st });
      expect(r.rlsEligible).toBe(true);
      expect(r.mixedUseSmallBuilding).toBe(false);
    },
  );

  it('a MALLAN commercial_sub_type forces the mixed-use path even on a residential subtype', () => {
    const r = classifyRlsEligibility(
      { PropertyType: 'Residential', PropertySubType: 'Apartment', NumberOfUnitsTotal: 40 },
      { commercialSubType: 'RetailStore' },
    );
    expect(r.rlsEligible).toBe(false);
    expect(r.ucbaRef).toBe('UCBA Art. I, Sec. 5(F)');
  });

  it('commercialOwnership is accepted but changes nothing (documented as unused)', () => {
    const base = { PropertyType: 'Residential', PropertySubType: 'Apartment' };
    expect(classifyRlsEligibility(base, { commercialOwnership: 'CommercialCondo' }))
      .toEqual(classifyRlsEligibility(base));
  });

  it('an unrecognised PropertyType fails CLOSED to website-only', () => {
    expect(classifyRlsEligibility({ PropertyType: 'Farm' }).rlsEligible).toBe(false);
    expect(classifyRlsEligibility({ PropertyType: 'Land' }).rlsEligible).toBe(false);
  });

  it('no PropertyType at all → RLS-eligible (Draft may not have one yet)', () => {
    expect(classifyRlsEligibility({}).rlsEligible).toBe(true);
  });

  it('a removed non-live subtype now falls through to the PropertyType tier, not the residential tier', () => {
    // 'Condo' is not a live PropertySubType. With PropertyType Residential it still resolves
    // RLS-eligible — but via the Residential PropertyType tier, and WITHOUT the mixed-use flag.
    const r = classifyRlsEligibility({ PropertyType: 'Residential', PropertySubType: 'Condo' });
    expect(r.rlsEligible).toBe(true);
    expect(r.reason).toBe('Residential property — RLS-eligible');
  });
});

// ─── D. the ENFORCEMENT GAP — proven, reported, NOT fixed here ──────────────────────────────
describe('the mixed-use unit-count citation, and where enforcement actually lives', () => {
  it('NumberOfUnitsTotal is mandatory via agentSubmitted, NOT via BUILDING-001', () => {
    const rules = require('@/lib/compliance/rebny-ucba-rules').REBNY_UCBA_RULES;
    expect(rules.requiredFields.agentSubmitted).toContain('NumberOfUnitsTotal');
    const building001 = rules.conditionalRules.find((r: { code: string }) => r.code === 'BUILDING-001');
    expect(building001).toBeDefined();
    // the stale comment claimed BUILDING-001 requires it — it does not
    expect(building001.requireFields).not.toContain('NumberOfUnitsTotal');
    expect(building001.requireFields).toEqual(
      expect.arrayContaining(['BuildingAreaTotal', 'TaxAnnualAmount', 'LotSizeArea', 'LotSizeDimensions']),
    );
  });

  it('the corrected source no longer cites BUILDING-001 as the enforcer', () => {
    expect(SRC).not.toMatch(/already required[\s\S]{0,80}BUILDING-001/);
    expect(SRC).toMatch(/agentSubmitted/);
  });

  // CORRECTED 2026-09-07 after independent review. An earlier version of this test asserted
  // that CREATE "skips mandatory REBNY/UCBA validation" because validateListing(body) is called
  // with no ListingContext. That conclusion was FALSE: it stopped tracing at validateListing and
  // ignored the hard gate immediately after it. CREATE *does* enforce.
  it('the CRM CREATE path DOES enforce the mandatory gate via assertRlsCompliantPayload', () => {
    const post = readFileSync(join(__dirname, '../../../app/api/crm/listings/route.ts'), 'utf8');
    // validateListing is called without a context — that alone proves nothing…
    expect(post).toMatch(/validateListing\(body\)\s*;/);
    // …because the hard gate runs immediately afterwards, WITH a full ListingContext,
    // inside the same `if (rlsEligible)` block, and returns 422 when it fails.
    expect(post).toMatch(/assertRlsCompliantPayload\(body, \{/);
    expect(post).toMatch(/rlsEligible,[\s\S]{0,120}mixedUseSmallBuilding: eligibility\.mixedUseSmallBuilding/);
    expect(post).toMatch(/if \(!enforcement\.passed\)[\s\S]{0,300}status: 422/);
  });

  it('CREATE runs the gate only when the listing is RLS-eligible (website-only is exempt by design)', () => {
    const post = readFileSync(join(__dirname, '../../../app/api/crm/listings/route.ts'), 'utf8');
    const gateIdx = post.indexOf('assertRlsCompliantPayload(body, {');
    const guardIdx = post.indexOf('if (rlsEligible) {');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(guardIdx);
  });

  it('the CRM PATCH path skips its enforcement gate for CRM-created listings', () => {
    const patch = readFileSync(join(__dirname, '../../../app/api/crm/listings/[id]/route.ts'), 'utf8');
    expect(patch).toMatch(/const isCrmCreated = !listing\.mls_id/);
    expect(patch).toMatch(/if \(effectiveRlsEligible && !isDraftLike && !isCrmCreated\)/);
  });
});
