/**
 * SIX-SLOT COVERAGE — the live Trestle-direct path must select every verified
 * tour/video slot, not just slot 1.
 *
 * Live $metadata (2026-08-12) confirms six slots exist; live counts confirm
 * Unbranded2 = 2,377 and Unbranded3 = 354 are populated upstream. Selecting
 * only slot 1 is how those values were lost on this path.
 */
import { CARD_SELECT_FIELDS } from '@/lib/idx/card-fields';

const SLOTS = [
  'VirtualTourURLBranded',
  'VirtualTourURLBranded2',
  'VirtualTourURLBranded3',
  'VirtualTourURLUnbranded',
  'VirtualTourURLUnbranded2',
  'VirtualTourURLUnbranded3',
] as const;

describe('live Cotality card select covers all six tour slots', () => {
  it.each(SLOTS)('selects %s', (slot) => {
    expect(CARD_SELECT_FIELDS).toContain(slot);
  });

  it('specifically covers the two slots proven lost in production', () => {
    expect(CARD_SELECT_FIELDS).toContain('VirtualTourURLUnbranded2');
    expect(CARD_SELECT_FIELDS).toContain('VirtualTourURLUnbranded3');
  });

  it('selects each slot exactly once', () => {
    for (const s of SLOTS) {
      expect(CARD_SELECT_FIELDS.filter((f) => f === s)).toHaveLength(1);
    }
  });
});
