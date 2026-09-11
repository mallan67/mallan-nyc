/// <reference types="jest" />
/**
 * H2 — VIEW-001 requires canonical `View` only; `ViewRemarks` is a phantom (2026-05-30).
 *
 * Live Cotality `$metadata` exposes `View` (Multi enum) and `ViewYN` (Boolean) but
 * NOT `ViewRemarks`. #280 (commit de5dd489) emits `ViewYN=true` when a view is
 * selected, which fires the VIEW-001 conditional rule. Before this fix VIEW-001
 * also required the phantom `ViewRemarks` — which the form (correctly) never
 * emits — so every residential sale with a view 422'd (CF-VIEW-001 BLOCKER).
 *
 * This test proves VIEW-001 now requires only the canonical `View`: a view-bearing
 * sale is not blocked on the phantom, while `View` itself stays required when
 * `ViewYN=true`. Pre-fix this file fails (a ViewRemarks blocker appears); post-fix
 * it flips green.
 */
import { assertRlsCompliantPayload, type ListingContext } from '@/lib/compliance/rls-enforcement';
import { REBNY_UCBA_RULES } from '@/lib/compliance/rebny-ucba-rules';

const CTX: ListingContext = { listingType: 'sale', rlsEligible: true };
const base: Record<string, unknown> = {
  PropertyType: 'Residential',
  PropertySubType: 'SingleFamilyResidence',
  CommonInterest: 'None',
};

function blockers(payload: Record<string, unknown>) {
  return assertRlsCompliantPayload(payload, CTX).blockers;
}

describe('H2 — VIEW-001 requires canonical View only (ViewRemarks is phantom)', () => {
  it('ViewYN=true + View set, ViewRemarks absent → NO VIEW-001 blocker (view-bearing sale not 422’d)', () => {
    const b = blockers({ ...base, ViewYN: true, View: ['River'] });
    expect(b.find((x) => x.field === 'ViewRemarks')).toBeUndefined();
    expect(b.find((x) => x.code === 'CF-VIEW-001')).toBeUndefined();
  });

  it('ViewYN=true + View absent → CF-VIEW-001 blocker for the canonical View (still required); never for ViewRemarks', () => {
    const b = blockers({ ...base, ViewYN: true });
    const viewBlocker = b.find((x) => x.code === 'CF-VIEW-001' && x.field === 'View');
    expect(viewBlocker).toBeDefined();
    expect(b.find((x) => x.field === 'ViewRemarks')).toBeUndefined();
  });

  it('ViewYN not asserted → VIEW-001 does not fire at all', () => {
    const b = blockers({ ...base });
    expect(b.find((x) => x.code === 'CF-VIEW-001')).toBeUndefined();
  });

  it('VIEW-001 requireFields = [View] only — phantom ViewRemarks removed', () => {
    const rules = REBNY_UCBA_RULES.conditionalRules as ReadonlyArray<{
      code: string;
      requireFields: readonly string[];
    }>;
    const rule = rules.find((r) => r.code === 'VIEW-001');
    expect(rule).toBeDefined();
    expect(rule?.requireFields).toContain('View');
    expect(rule?.requireFields).not.toContain('ViewRemarks');
  });
});
