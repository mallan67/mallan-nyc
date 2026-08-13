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

import { tourUrlsForDto } from '@/lib/media/listing-media-resolver';

describe('all six slots are PRESENTED, not just selected', () => {
  it('branded slots are not collapsed by ?? — a second branded value still counts', () => {
    // Branded1 is a video, Branded2 is a tour. An `??` chain would keep only
    // Branded1 and the tour would vanish.
    const out = tourUrlsForDto([], [
      'https://youtu.be/branded1',
      'https://my.matterport.com/show/?m=branded2',
      null,
    ]);
    expect(out.videoUrl).toContain('youtu.be/branded1');
    expect(out.virtualTourURL).toContain('matterport');
  });

  it('unbranded still wins over an equivalent branded value (UCBA)', () => {
    const out = tourUrlsForDto(
      ['https://my.matterport.com/show/?m=unbranded'],
      ['https://my.matterport.com/show/?m=branded'],
    );
    expect(out.virtualTourURL).toContain('unbranded');
  });

  it('a scalar branded argument still works (back-compatible)', () => {
    const out = tourUrlsForDto([], 'https://youtu.be/solo');
    expect(out.videoUrl).toContain('youtu.be/solo');
  });

  it('Unbranded3 alone still surfaces', () => {
    const out = tourUrlsForDto([null, null, 'https://youtu.be/slot3'], []);
    expect(out.videoUrl).toContain('slot3');
  });
});
