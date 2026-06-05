import { checkFeeDisclosure } from '@/lib/crm/fee-disclosure';

/**
 * FARE Act fee-disclosure gate (PR 3c). The pure rule used by the backend publish
 * paths. The caller applies it only when a rental becomes display-ready
 * (publish/non-Draft), so draft-save-allowed is a route concern; here we prove the
 * rule itself. Generic data only (no SL-0004 / Maya).
 */
describe('checkFeeDisclosure', () => {
  it('BLOCKS when AdditionalFeeYN is true but no fee detail is present', () => {
    const r = checkFeeDisclosure({ AdditionalFeeYN: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/FARE Act/i);
  });

  it('accepts string "true" for AdditionalFeeYN as the trigger', () => {
    expect(checkFeeDisclosure({ AdditionalFeeYN: 'true' }).ok).toBe(false);
  });

  it('does NOT block when AdditionalFeeYN is false/absent (no false block)', () => {
    expect(checkFeeDisclosure({ AdditionalFeeYN: false }).ok).toBe(true);
    expect(checkFeeDisclosure({}).ok).toBe(true);
    expect(checkFeeDisclosure(null).ok).toBe(true);
  });

  it('allows publish when MoveInCostsAmount is present (> 0)', () => {
    expect(checkFeeDisclosure({ AdditionalFeeYN: true, MoveInCostsAmount: 1500 }).ok).toBe(true);
  });

  it('allows publish when MoveInCostsComments is present', () => {
    expect(checkFeeDisclosure({ AdditionalFeeYN: true, MoveInCostsComments: 'First month + security' }).ok).toBe(true);
  });

  it('legacy AdditionalFee / AdditionalFeeDescription counts as disclosure', () => {
    expect(checkFeeDisclosure({ AdditionalFeeYN: true, AdditionalFeeDescription: 'Move In Fees' }).ok).toBe(true);
    // AdditionalFee > 0 is both the trigger AND a detail → allowed.
    expect(checkFeeDisclosure({ AdditionalFee: 900 }).ok).toBe(true);
  });

  it('a zero MoveInCostsAmount alone does NOT satisfy disclosure when fees are flagged', () => {
    expect(checkFeeDisclosure({ AdditionalFeeYN: true, MoveInCostsAmount: 0 }).ok).toBe(false);
    // but a zero amount WITH a comment is fine
    expect(checkFeeDisclosure({ AdditionalFeeYN: true, MoveInCostsAmount: 0, MoveInCostsComments: 'No move-in fee' }).ok).toBe(true);
  });

  it('blank-string detail fields do not count as disclosure', () => {
    expect(checkFeeDisclosure({ AdditionalFeeYN: true, MoveInCostsComments: '   ', AdditionalFeeDescription: '' }).ok).toBe(false);
  });
});
