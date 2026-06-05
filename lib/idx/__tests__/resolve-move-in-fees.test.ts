import { resolveMoveInFees } from '../public-dto';

/**
 * Shared FARE Act move-in fee resolver (PR 3a-fix, Codex #346).
 *
 * Used by every DTO builder (DB path + Trestle-direct path) so disclosure is
 * path-independent. Canonical Property fields win; legacy fields are read-time
 * fallback ONLY when the canonical field is blank (null/undefined/'') — a
 * canonical 0 must win over a stale legacy AdditionalFee. Generic fixtures only.
 */
describe('resolveMoveInFees', () => {
  it('returns canonical MoveInCostsAmount + MoveInCostsComments', () => {
    expect(resolveMoveInFees({ MoveInCostsAmount: 1500, MoveInCostsComments: 'First + security' }))
      .toEqual({ moveInCostsAmount: 1500, moveInCostsComments: 'First + security' });
  });

  it('falls back to legacy AdditionalFee / AdditionalFeeDescription only when canonical is blank', () => {
    expect(resolveMoveInFees({ AdditionalFee: 900, AdditionalFeeDescription: 'Move In Fees' }))
      .toEqual({ moveInCostsAmount: 900, moveInCostsComments: 'Move In Fees' });
  });

  it('canonical wins over legacy (no conflicting value)', () => {
    const r = resolveMoveInFees({
      MoveInCostsAmount: 1500, AdditionalFee: 900,
      MoveInCostsComments: 'Canonical', AdditionalFeeDescription: 'Legacy',
    });
    expect(r.moveInCostsAmount).toBe(1500);
    expect(r.moveInCostsComments).toBe('Canonical');
  });

  it('CANONICAL ZERO wins over a stale legacy nonzero AdditionalFee (Codex #346)', () => {
    // The save path writes MoveInCostsAmount = 0 for an empty amount; 0 must NOT
    // fall through to a legacy AdditionalFee.
    expect(resolveMoveInFees({ MoveInCostsAmount: 0, AdditionalFee: 900 }).moveInCostsAmount).toBe(0);
    expect(resolveMoveInFees({ MoveInCostsAmount: 0, MoveInCostsAmountTotal: 2200 }).moveInCostsAmount).toBe(0);
  });

  it('treats blank-string / null / undefined canonical as blank and falls back', () => {
    expect(resolveMoveInFees({ MoveInCostsAmount: '', AdditionalFee: 750 }).moveInCostsAmount).toBe(750);
    expect(resolveMoveInFees({ MoveInCostsAmount: null, AdditionalFee: 750 }).moveInCostsAmount).toBe(750);
    expect(resolveMoveInFees({ AdditionalFee: 750 }).moveInCostsAmount).toBe(750);
  });

  it('falls back to MoveInCostsAmountTotal only when canonical + AdditionalFee blank', () => {
    expect(resolveMoveInFees({ MoveInCostsAmountTotal: 2200 }).moveInCostsAmount).toBe(2200);
    expect(resolveMoveInFees({ AdditionalFee: 100, MoveInCostsAmountTotal: 2200 }).moveInCostsAmount).toBe(100);
  });

  it('comments fall back to AdditionalFeeDescription only when canonical comments blank', () => {
    expect(resolveMoveInFees({ MoveInCostsComments: 'Note', AdditionalFeeDescription: 'Legacy' }).moveInCostsComments).toBe('Note');
    expect(resolveMoveInFees({ AdditionalFeeDescription: 'Legacy' }).moveInCostsComments).toBe('Legacy');
  });

  it('returns undefined for both when nothing is present', () => {
    expect(resolveMoveInFees({})).toEqual({ moveInCostsAmount: undefined, moveInCostsComments: undefined });
    expect(resolveMoveInFees(null)).toEqual({ moveInCostsAmount: undefined, moveInCostsComments: undefined });
  });

  it('resolves identically from a raw Trestle-record-shaped source (path-independent)', () => {
    // The Trestle-direct path passes the raw record; same PascalCase keys.
    const raw = { ListingId: 'RL-9', MoveInCostsAmount: 3300, MoveInCostsComments: 'Broker fee + deposit' };
    expect(resolveMoveInFees(raw)).toEqual({ moveInCostsAmount: 3300, moveInCostsComments: 'Broker fee + deposit' });
  });
});
