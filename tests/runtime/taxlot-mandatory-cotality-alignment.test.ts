/// <reference types="jest" />
/**
 * H1 — TaxLot mandatory-field Cotality alignment (2026-05-30).
 *
 * Live Cotality `$metadata`: `TaxLot` (Edm.String) is the real field; `BuildingTaxLot`
 * is a PHANTOM (absent from the feed). The sales form emits canonical `TaxLot`
 * (audit F2). This test proves the server mandatory-field gate
 * (`assertRlsCompliantPayload`) requires `TaxLot` — NOT the phantom — so a
 * residential (rls-eligible) sale with a filled tax lot is no longer 422'd on it,
 * while a missing tax lot still blocks, and the legacy `BuildingTaxLot` key is no
 * longer the canonical required field.
 *
 * Pre-fix this file fails: the blocker carried field `BuildingTaxLot` and a filled
 * `TaxLot` did not satisfy the gate. Post-fix it flips green.
 */
import { assertRlsCompliantPayload, type ListingContext } from '@/lib/compliance/rls-enforcement';
import { REBNY_UCBA_RULES } from '@/lib/compliance/rebny-ucba-rules';

const CTX: ListingContext = { listingType: 'sale', rlsEligible: true };

// Non-condo residential base so CONDO-001 (which also requires TaxLot) does NOT
// fire — isolating the MANDATORY-LIST behaviour as the sole source of a TaxLot
// blocker. We only assert on tax-lot fields; other mandatory fields are
// intentionally absent (and will produce unrelated blockers we ignore).
const baseResidentialSale: Record<string, unknown> = {
  PropertyType: 'Residential',
  PropertySubType: 'SingleFamilyResidence',
  CommonInterest: 'None',
};

function blockerFields(payload: Record<string, unknown>): Array<string | undefined> {
  return assertRlsCompliantPayload(payload, CTX).blockers.map((b) => b.field);
}

describe('H1 — TaxLot is the mandatory Cotality field (BuildingTaxLot is phantom)', () => {
  it('TaxLot set, BuildingTaxLot absent → NO tax-lot blocker (residential create not 422’d on tax lot)', () => {
    const fields = blockerFields({ ...baseResidentialSale, TaxLot: '56' });
    expect(fields).not.toContain('TaxLot');
    expect(fields).not.toContain('BuildingTaxLot');
  });

  it('tax lot absent → MF-001 blocker for the canonical TaxLot (still required)', () => {
    const res = assertRlsCompliantPayload({ ...baseResidentialSale }, CTX);
    const taxLot = res.blockers.find((b) => b.field === 'TaxLot');
    expect(taxLot).toBeDefined();
    expect(taxLot?.code).toBe('MF-001');
    expect(res.blockers.find((b) => b.field === 'BuildingTaxLot')).toBeUndefined();
  });

  it('legacy BuildingTaxLot alone does NOT satisfy the canonical TaxLot requirement', () => {
    const fields = blockerFields({ ...baseResidentialSale, BuildingTaxLot: '56' });
    expect(fields).toContain('TaxLot');          // canonical still required
    expect(fields).not.toContain('BuildingTaxLot'); // phantom is never the required field
  });

  it('agentSubmitted mandatory list contains TaxLot and NOT the phantom BuildingTaxLot', () => {
    const required = REBNY_UCBA_RULES.requiredFields.agentSubmitted as readonly string[];
    expect(required).toContain('TaxLot');
    expect(required).not.toContain('BuildingTaxLot');
  });
});
