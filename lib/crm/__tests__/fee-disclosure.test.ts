import { checkFeeDisclosure, isDisplayReadyStatus } from '@/lib/crm/fee-disclosure';

/**
 * isDisplayReadyStatus — the FARE gate must fire ONLY when a rental becomes
 * publicly displayed (Active/ComingSoon). The CRM form saves drafts as RESO
 * MlsStatus "Incomplete" (non-Draft but non-display-ready), so draft saves must
 * never be gated (Codex #348).
 */
describe('isDisplayReadyStatus', () => {
  it('is true for Active and ComingSoon', () => {
    expect(isDisplayReadyStatus('Active')).toBe(true);
    expect(isDisplayReadyStatus('ComingSoon')).toBe(true);
    expect(isDisplayReadyStatus('active')).toBe(true); // normalized
  });

  it('is false for Draft and Incomplete (draft saves never gated)', () => {
    expect(isDisplayReadyStatus('Draft')).toBe(false);
    expect(isDisplayReadyStatus('Incomplete')).toBe(false);
  });

  it('is false for terminal / non-public statuses', () => {
    for (const s of ['Withdrawn', 'Pending', 'Sold', 'Rented', 'Expired', 'Hold', '']) {
      expect(isDisplayReadyStatus(s)).toBe(false);
    }
  });

  it('combined gate logic: draft (Incomplete) save with fee flag + no detail is NOT gated', () => {
    // The route condition is: isRental && isDisplayReadyStatus(status) && !checkFeeDisclosure(data).ok
    const flaggedNoDetail = { AdditionalFeeYN: true };
    const draftGated = isDisplayReadyStatus('Incomplete') && !checkFeeDisclosure(flaggedNoDetail).ok;
    expect(draftGated).toBe(false); // draft Incomplete → not display-ready → not gated
    const publishGated = isDisplayReadyStatus('Active') && !checkFeeDisclosure(flaggedNoDetail).ok;
    expect(publishGated).toBe(true); // Active + flag + no detail → gated
  });
});

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
