/// <reference types="jest" />
/**
 * The Fair Housing scan every listing write runs (lib/compliance/listing-fair-housing.ts), used by POST /api/crm/listings, PATCH /api/crm/listings/[id] and the bulk audit.
 *
 * It scans the free text a request carries: the canonical remark slots after the accepted aliases are resolved, and every other string under a key that names free text
 * (the forms post their free-text boxes under the id of the control). Structured values are not scanned.
 */
import { scanListingBodyForFairHousing } from '@/lib/compliance/listing-fair-housing';
import { normalizePayload } from '@/lib/compliance/normalizer';

/** the fields the scan names, once each (a phrase that two rules match is two blockers in one field) */
const fields = (body: Record<string, unknown>, normalized?: Record<string, unknown>) => [...new Set(scanListingBodyForFairHousing(body, normalized).map((i) => i.field))];

describe('scanListingBodyForFairHousing', () => {
  it('clean text, and a body with no text at all, are clean', () => {
    expect(fields({ PublicRemarks: 'Sun-filled corner one-bedroom with a renovated kitchen, close to the express train.', ListPrice: 1200000 })).toEqual([]);
    expect(fields({})).toEqual([]);
    expect(fields({ saleBrokerComments: '', agentRemarks: null, webHeadline: 5 })).toEqual([]);
  });

  it('a body that is not an object is clean rather than a crash', () => {
    for (const nothing of [null, undefined, 'text', 5]) expect(scanListingBodyForFairHousing(nothing as never)).toEqual([]);
  });

  it.each(['PublicRemarks', 'ShowingInstructions', 'PrivateRemarks', 'SyndicationRemarks'])('the %s slot is scanned, and named as that slot', (slot) => {
    expect(fields({ [slot]: 'Quiet building, adults only.' })).toEqual([slot]);
  });

  it('a canonical slot posted under its own name is scanned once, not twice', () => {
    const issues = scanListingBodyForFairHousing({ PublicRemarks: 'No Section 8.' });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.field === 'PublicRemarks')).toBe(true);                // never also as raw:PublicRemarks
    expect(issues[0]).toMatchObject({ code: 'FH-001', severity: 'BLOCKER' });
    expect(issues[0].message).toContain('"No Section 8"');
  });

  it.each([['description', 'PublicRemarks'], ['privateRemarks', 'PrivateRemarks']])('the alias %s is resolved first: the text is scanned as %s', (alias, slot) => {
    const found = fields({ [alias]: 'Tenant must pass background check.' });
    expect(found).toContain(slot);
  });

  it('an alias that loses to a canonical key the body also carries is still scanned, under its own key', () => {
    // normalizePayload keeps the canonical key's value, so the aliased text would otherwise be dropped unscanned
    const found = fields({ PublicRemarks: 'Bright and sunny.', description: 'Adults only.' });
    expect(found).toEqual(['raw:description']);
  });

  it.each(['agentRemarks', 'showingInstructions', 'webHeadline', 'saleBrokerComments', 'saleTHOtherRemarks', 'previewDescription', 'rentalMoveInCostsComments', 'photoCaption', 'saleNewOHNotes'])(
    'the free-text key %s is scanned under raw:<key>', (key) => {
      expect(fields({ [key]: 'No CityFHEPS accepted.' })).toContain(`raw:${key}`);
    });

  it('a structured value is not scanned, so an "Active Adult" property type is not a violation', () => {
    expect(fields({ property_sub_type: 'Active Adult', status: 'Active', PropertySubType: 'Active Adult Community' })).toEqual([]);
  });

  it('every phrase found is a blocker in its field, and the message names the phrase', () => {
    const issues = scanListingBodyForFairHousing({ PublicRemarks: 'Adults only, no Section 8.', webHeadline: 'Seniors only' });
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.filter((i) => i.field === 'PublicRemarks').map((i) => i.message).join(' ')).toMatch(/"[Aa]dults only"[\s\S]*"[Nn]o Section 8"/);
    expect(issues.some((i) => i.field === 'raw:webHeadline')).toBe(true);
  });

  it('uses the normalized payload the caller already holds, instead of normalizing again', () => {
    const body = { listing_type: 'sale' };
    const normalized = { ...normalizePayload(body).normalized, PublicRemarks: 'Adults only.' };
    expect(fields(body, normalized)).toEqual(['PublicRemarks']);
    expect(fields(body)).toEqual([]);                                                // without it, the body alone is clean
  });
});
