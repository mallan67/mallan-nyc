/**
 * Domain 8 (2026-09-08) — every amenity filter names live provider members, or declares itself a text concept.
 *
 * The 2026-09-08 census found 15 amenity values that are not published members of their field (e.g.
 * BuildingFeatures 'Elevator' — the live member is 'Elevators'; LaundryFeatures 'OnCommonFloor' — live is
 * 'CommonOnFloor'; InteriorFeatures 'WoodBurningFireplace' / 'NaturalLight' / 'Renovated' / 'Quiet' — no such
 * members exist). A phantom either matched by accident (substring) or could never match. Concepts the provider
 * has no member for (renovated, quiet, natural light) are declared as PublicRemarks text matches, explicitly.
 */
import { AMENITY_FIELD_MAP } from '@/lib/search/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LIVE = require('../../../data/cotality-enums.live.json') as { enums: Record<string, string[]> };

describe('AMENITY_FIELD_MAP binds to the live vocabulary', () => {
  const entries = Object.entries(AMENITY_FIELD_MAP);

  it.each(entries.filter(([, m]) => m.field !== 'PublicRemarks'))('%s: every value is a live member of every field it targets', (_key, m) => {
    const fields = m.field.split(',').map((f) => f.trim());
    for (const f of fields) expect(LIVE.enums[f]).toBeDefined();
    for (const v of m.values) {
      const isMember = fields.some((f) => (LIVE.enums[f] || []).includes(v));
      expect({ value: v, field: m.field, isMember }).toEqual({ value: v, field: m.field, isMember: true });
    }
  });

  it('text concepts the provider has no member for are declared on PublicRemarks (renovated, quiet, natural light)', () => {
    for (const key of ['renovated', 'quiet', 'natural-light'] as const) {
      expect(AMENITY_FIELD_MAP[key].field).toBe('PublicRemarks');
      expect(AMENITY_FIELD_MAP[key].values.length).toBeGreaterThan(0);
    }
  });

  it('fireplace reads the live fireplace facts (InteriorFeatures Fireplace or any FireplaceFeatures member except None)', () => {
    expect(AMENITY_FIELD_MAP.fireplace.field).toBe('InteriorFeatures,FireplaceFeatures');
    expect(AMENITY_FIELD_MAP.fireplace.values).toContain('Fireplace');
    expect(AMENITY_FIELD_MAP.fireplace.values).toContain('WoodBurning');
    expect(AMENITY_FIELD_MAP.fireplace.values).not.toContain('None');
  });
});
