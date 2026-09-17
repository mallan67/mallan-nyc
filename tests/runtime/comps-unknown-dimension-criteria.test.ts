/// <reference types="jest" />
/**
 * GROUP H — AN UNKNOWN SUBJECT BEDROOM COUNT IS NOT A STUDIO.
 *
 * app/api/crm/sales/comps/route.ts:79-80 collapses the subject's unknown dimensions to zero:
 *
 *     const beds  = listing.bedrooms_total ?? 0;
 *     const baths = (listing.bathrooms_full ?? 0) + Math.round((listing.bathrooms_half ?? 0) * 0.5);
 *
 * and lib/comps/defaults.ts:12-13 does it again (`specs.beds ?? 0`). The subject then enters
 * buildDefaultCriteria as a 0-bedroom, 0-bathroom property, which becomes
 *
 *     BedroomsTotal ge 0 and BedroomsTotal le 0
 *
 * on the wire — a STUDIO filter. Every comp for a listing whose bedroom count simply was not recorded is
 * drawn from studios, and the resulting CMA prices the property against the wrong inventory.
 *
 * THE TYPES ALREADY KNEW. ListingSpecs declares `beds: number | null` and `baths: number | null`
 * (lib/comps/defaults.ts) — the unknown state is modelled at the boundary and destroyed one line later,
 * because CompRange.beds_min/beds_max are non-nullable numbers and offer no way to say "not known".
 *
 * THE REPRESENTATION IS NOT NEW. CompRange already models exactly this for a different dimension:
 * `sqft_min: number | null`, `sqft_max: number | null`, `sqft_enabled: boolean`, and sqftFilter()
 * (fetch-comps.ts:113-116) emits nothing when it is disabled. Beds and baths are the odd ones out. This
 * extends that established pattern to them rather than inventing a second idea.
 *
 * LEGACY CRITERIA CANNOT BE TRUSTED TO SPEAK FOR THEMSELVES, and this is the subtle half. Rows already
 * stored in Listing.comp_criteria have no beds_enabled key, and reading a missing flag as `true` would
 * honour exactly the fabricated 0/0 this packet exists to remove — the defect would survive inside its own
 * stored output. A legacy flag is therefore resolved against the CURRENT canonical subject value:
 *
 *     no beds_enabled + subject beds === null      -> dimension DISABLED (the stored 0/0 was manufactured)
 *     no beds_enabled + subject beds is numeric    -> dimension ENABLED  (the stored range is real)
 *     explicit beds_enabled                        -> honoured as written
 *
 * comp_criteria is a JSON column, so this is a contract extension, not schema growth, and no backfill or
 * production write is required.
 */
import { buildDefaultCriteria } from '@/lib/comps/defaults';
import { fetchComps } from '@/lib/comps/fetch-comps';
import type { CompCriteria } from '@/lib/comps/types';

jest.mock('@/lib/idx/fetch', () => ({
  fetchFromTrestle: jest.fn(async () => ({ records: [], total: 0 })),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchFromTrestle } = require('@/lib/idx/fetch') as { fetchFromTrestle: jest.Mock };

/* eslint-disable @typescript-eslint/no-explicit-any */

const SUBJECT = {
  listing_id: 'SL-0001',
  building_name: 'The Apthorp',
  street_number: '390',
  street_name: 'West End Avenue',
  neighborhood: 'Upper West Side',
  borough: 'Manhattan',
  postal_code: '10024',
  property_type: 'Residential',
  subject: { features: {}, raw_data: {} },
};

/** Every OData $filter string fetchComps sent this run. */
function filtersSent(): string[] {
  return fetchFromTrestle.mock.calls.map((c) => String((c[0] || {}).filter || ''));
}

async function runComps(criteria: CompCriteria) {
  fetchFromTrestle.mockClear();
  await fetchComps(SUBJECT as any, criteria);
  return filtersSent();
}

const specs = (over: Partial<{ beds: number | null; baths: number | null; sqft: number | null }>) => ({
  beds: null, baths: null, sqft: 1100, list_price: 1_250_000,
  neighborhood: 'Upper West Side', building_name: 'The Apthorp',
  ...over,
});

// ═════════════════════════════════════════════════════════════════════════════
// A — the three states must not collapse into one another
// ═════════════════════════════════════════════════════════════════════════════
describe('A · unknown, zero and positive are three different subjects', () => {
  it('UNKNOWN beds/baths emit NO bedroom or bathroom clause at all', async () => {
    const c = buildDefaultCriteria(specs({ beds: null, baths: null }) as any);
    const sent = await runComps(c);
    expect(sent.length).toBeGreaterThan(0);                       // it really queried
    for (const f of sent) {
      expect({ f: f.slice(0, 0), beds: /BedroomsTotal/.test(f) }).toEqual({ f: '', beds: false });
      expect(/BathroomsTotalInteger/.test(f)).toBe(false);
    }
  });

  it('ZERO beds is a STUDIO and keeps a real zero range', async () => {
    const c = buildDefaultCriteria(specs({ beds: 0, baths: 0 }) as any);
    expect({ enabled: (c.building as any).beds_enabled, min: c.building.beds_min, max: c.building.beds_max })
      .toEqual({ enabled: true, min: 0, max: 0 });
    // The area band widens upward but never below zero.
    expect({ min: c.area.beds_min, max: c.area.beds_max }).toEqual({ min: 0, max: 1 });
    const sent = await runComps(c);
    expect(sent.some((f) => /BedroomsTotal ge 0 and BedroomsTotal le 0/.test(f))).toBe(true);
  });

  it('a POSITIVE subject keeps the existing range logic untouched', async () => {
    const c = buildDefaultCriteria(specs({ beds: 2, baths: 2 }) as any);
    expect({ b: [c.building.beds_min, c.building.beds_max], a: [c.area.beds_min, c.area.beds_max] })
      .toEqual({ b: [2, 2], a: [1, 3] });
    const sent = await runComps(c);
    expect(sent.some((f) => /BedroomsTotal ge 2 and BedroomsTotal le 2/.test(f))).toBe(true);
  });

  it('one unknown dimension does not disable the other, or the rest of the criteria', async () => {
    // An unknown bedroom count must not cost the CMA its neighbourhood, price, status or sqft filtering.
    const c = buildDefaultCriteria(specs({ beds: null, baths: 2, sqft: 1100 }) as any);
    const sent = await runComps(c);
    const joined = sent.join(' || ');
    expect(/BedroomsTotal/.test(joined)).toBe(false);
    expect(/BathroomsTotalInteger ge 1 and BathroomsTotalInteger le 3|BathroomsTotalInteger ge 2/.test(joined)).toBe(true);
    expect(/LivingArea ge /.test(joined)).toBe(true);
    expect(/ListPrice ge /.test(joined)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — legacy stored criteria resolve against the CURRENT subject
// ═════════════════════════════════════════════════════════════════════════════
describe('B · a stored 0/0 is only a studio if the subject really is one', () => {
  /** Criteria as they exist in Listing.comp_criteria today: no *_enabled keys for beds/baths. */
  const legacyZeroZero = (): CompCriteria => {
    const c = buildDefaultCriteria(specs({ beds: 2, baths: 2 }) as any) as any;
    c.building.beds_min = 0; c.building.beds_max = 0;
    c.area.beds_min = 0; c.area.beds_max = 0;
    delete c.building.beds_enabled; delete c.area.beds_enabled;
    delete c.building.baths_enabled; delete c.area.baths_enabled;
    return c as CompCriteria;
  };

  it('legacy 0/0 with an UNKNOWN subject emits no studio filter — the stored range was manufactured', async () => {
    const { resolveLegacyDimensions } = require('@/lib/comps/defaults');
    const resolved = resolveLegacyDimensions(legacyZeroZero(), { beds: null, baths: null });
    const sent = await runComps(resolved);
    expect(sent.some((f) => /BedroomsTotal/.test(f))).toBe(false);
  });

  it('legacy 0/0 with a subject that IS a studio still emits the studio filter', async () => {
    const { resolveLegacyDimensions } = require('@/lib/comps/defaults');
    const resolved = resolveLegacyDimensions(legacyZeroZero(), { beds: 0, baths: 0 });
    const sent = await runComps(resolved);
    expect(sent.some((f) => /BedroomsTotal ge 0 and BedroomsTotal le 0/.test(f))).toBe(true);
  });

  it('an EXPLICIT flag is honoured as written, whatever the subject says', async () => {
    const { resolveLegacyDimensions } = require('@/lib/comps/defaults');
    const c = buildDefaultCriteria(specs({ beds: 2, baths: 2 }) as any) as any;
    c.building.beds_enabled = false; c.area.beds_enabled = false;
    c.building.beds_min = null; c.building.beds_max = null;
    c.area.beds_min = null; c.area.beds_max = null;
    const resolved = resolveLegacyDimensions(c, { beds: 2, baths: 2 });
    const sent = await runComps(resolved);
    expect(sent.some((f) => /BedroomsTotal/.test(f))).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — validation refuses an incoherent range instead of inventing one
// ═════════════════════════════════════════════════════════════════════════════
describe('C · enabled without bounds is refused, disabled without bounds is fine', () => {
  const validate = () => require('@/lib/comps/defaults').validateDimensionBounds;

  it('enabled=true with null bounds is REFUSED, not silently defaulted to 0', () => {
    const c = buildDefaultCriteria(specs({ beds: 2, baths: 2 }) as any) as any;
    c.building.beds_enabled = true; c.building.beds_min = null; c.building.beds_max = null;
    expect(() => validate()(c)).toThrow(/beds/i);
  });

  it('enabled=true with max below min is REFUSED', () => {
    const c = buildDefaultCriteria(specs({ beds: 2, baths: 2 }) as any) as any;
    c.building.beds_min = 3; c.building.beds_max = 1;
    expect(() => validate()(c)).toThrow(/beds/i);
  });

  it('enabled=false with null bounds is accepted', () => {
    const c = buildDefaultCriteria(specs({ beds: null, baths: null }) as any) as any;
    expect(() => validate()(c)).not.toThrow();
  });

  it('a genuine zero range is accepted — 0 is a valid bound, not a missing one', () => {
    const c = buildDefaultCriteria(specs({ beds: 0, baths: 0 }) as any) as any;
    expect(() => validate()(c)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — the sqft precedent this mirrors is unchanged
// ═════════════════════════════════════════════════════════════════════════════
describe('D · sqft keeps behaving exactly as before', () => {
  it('unknown sqft still disables its own dimension and nothing else', async () => {
    const c = buildDefaultCriteria(specs({ beds: 2, baths: 2, sqft: null }) as any);
    expect(c.building.sqft_enabled).toBe(false);
    expect({ min: c.building.sqft_min, max: c.building.sqft_max }).toEqual({ min: null, max: null });
    const sent = await runComps(c);
    const joined = sent.join(' || ');
    expect(/LivingArea/.test(joined)).toBe(false);
    expect(/BedroomsTotal ge 2/.test(joined)).toBe(true);
  });

  it('known sqft still bands at 0.85/1.15 for the building and 0.80/1.20 for the area', () => {
    const c = buildDefaultCriteria(specs({ beds: 2, baths: 2, sqft: 1000 }) as any);
    expect({ b: [c.building.sqft_min, c.building.sqft_max], a: [c.area.sqft_min, c.area.sqft_max] })
      .toEqual({ b: [850, 1150], a: [800, 1200] });
  });
});
