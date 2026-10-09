/// <reference types="jest" />
/**
 * The Fair Housing scan every listing write runs (lib/compliance/listing-fair-housing.ts), used by POST /api/crm/listings, PATCH /api/crm/listings/[id] and the bulk audit.
 *
 * It scans the free text a request carries: the canonical remark slots after the accepted aliases are resolved, and every other string under a key that names free text
 * (the forms post their free-text boxes under the id of the control). Structured values are not scanned.
 */
import { FREE_TEXT_IDS, nonTextFreeTextKey, nonTextRemarkSlot, scanListingBodyForFairHousing } from '@/lib/compliance/listing-fair-housing';
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

  it.each(FREE_TEXT_IDS.map((id) => [id]))('the box %s, whose id does not name free text, is scanned under raw:<id> (found 2026-10-09)', (id) => {
    expect(fields({ [id]: 'No vouchers, adults only.' })).toContain(`raw:${id}`);
    expect(fields({ [id]: 'Open plan, two bedrooms, 40x monthly rent.' })).toEqual([]);
  });

  it('the boxes are these five: the layout and financing textareas, and the two rental-building inputs where an income or an occupancy policy is typed (the list cannot shrink unnoticed)', () => {
    expect([...FREE_TEXT_IDS].sort()).toEqual(['bldgMaxOccupants', 'bldgMinIncome', 'rentalTHLayout', 'saleTHFinancing', 'saleTHLayout']);
    expect(fields({ bldgMinIncome: 'No vouchers.', bldgMaxOccupants: 'Adults only.' })).toEqual(['raw:bldgMinIncome', 'raw:bldgMaxOccupants']);
  });
});

describe('nonTextRemarkSlot', () => {
  it('is null for text, for null and for an absent slot (clearing a remark is allowed)', () => {
    expect(nonTextRemarkSlot({})).toBeNull();
    expect(nonTextRemarkSlot({ PublicRemarks: 'Sunny.', PrivateRemarks: '', ShowingInstructions: null, SyndicationRemarks: undefined })).toBeNull();
    expect(nonTextRemarkSlot({ description: 'Sunny.', privateRemarks: 'Call first.' })).toBeNull();
  });

  it.each([['PublicRemarks', ['x']], ['ShowingInstructions', { a: 1 }], ['PrivateRemarks', 5], ['SyndicationRemarks', true]])('names the slot %s when it holds something that is not text', (slot, value) => {
    expect(nonTextRemarkSlot({ [slot]: value })).toBe(slot);
  });

  it('sees an alias too: description holding a list is the PublicRemarks slot', () => {
    expect(nonTextRemarkSlot({ description: ['No children'] })).toBe('PublicRemarks');
    expect(nonTextRemarkSlot({ privateRemarks: { a: 1 } })).toBe('PrivateRemarks');
  });

  it('looks at the body\'s own slot as well as the normalized one: the body is what an edit merges into raw_data', () => {
    expect(nonTextRemarkSlot({ PublicRemarks: ['No children'] }, { PublicRemarks: 'Sunny.' })).toBe('PublicRemarks');
    expect(nonTextRemarkSlot({ PublicRemarks: 'Sunny.' }, { PublicRemarks: 'Sunny.' })).toBeNull();
  });

  it('a body that is not an object is not a violation', () => {
    for (const nothing of [null, undefined, 'text', 5]) expect(nonTextRemarkSlot(nothing as never)).toBeNull();
  });
});

describe('nonTextFreeTextKey', () => {
  it('is null when every free-text key holds text, null or nothing, and when the body carries no free-text key', () => {
    expect(nonTextFreeTextKey({})).toBeNull();
    expect(nonTextFreeTextKey({ webHeadline: 'Bright corner unit', saleBrokerComments: '', agentRemarks: null, bldgMinIncome: undefined, saleTHLayout: 'Open plan.' })).toBeNull();
  });

  it.each([...FREE_TEXT_IDS].map((id) => [id]))('names the box %s, whose id does not name free text, when it holds a list or an object (the scan reads strings only: found 2026-10-09)', (id) => {
    expect(nonTextFreeTextKey({ [id]: ['No vouchers, adults only.'] })).toBe(id);
    expect(nonTextFreeTextKey({ [id]: { note: 'no children' } })).toBe(id);
    expect(nonTextFreeTextKey({ [id]: [] })).toBe(id);                                      // an empty list is still not text
  });

  it.each(['webHeadline', 'saleBrokerComments', 'agentRemarks', 'showingInstructions', 'rentalMoveInCostsComments', 'photoCaption', 'saleNewOHNotes', 'previewDescription'])(
    'names the free-text key %s when it holds a list or an object', (key) => {
      expect(nonTextFreeTextKey({ [key]: ['Adults only.'] })).toBe(key);
      expect(nonTextFreeTextKey({ [key]: { text: 'Adults only.' } })).toBe(key);
    });

  it('names the remark slots too (a list there is not text either), and the first offending key in the order the body carries them', () => {
    expect(nonTextFreeTextKey({ PublicRemarks: ['x'] })).toBe('PublicRemarks');
    expect(nonTextFreeTextKey({ ListPrice: 5, webHeadline: ['a'], saleBrokerComments: ['b'] })).toBe('webHeadline');
    expect(nonTextFreeTextKey({ saleBrokerComments: ['b'], webHeadline: ['a'] })).toBe('saleBrokerComments');
  });

  it('a number or a boolean is not wording and passes (the forms post InternetConsumerCommentYN, a checkbox, under a name that says "comment")', () => {
    expect(nonTextFreeTextKey({ InternetConsumerCommentYN: true, saleInternetConsumerCommentYN: false, rentalInternetConsumerCommentYN: true, webHeadline: 5, bldgMaxOccupants: 2 })).toBeNull();
  });

  it('a structured key, whose name does not say free text, may hold a list or an object', () => {
    expect(nonTextFreeTextKey({ images: [{ url: 'a.jpg' }], saleViewList: ['City'], features: { Doorman: true }, property_sub_type: 'Active Adult', OpenHouses: [{ day: 'Sat' }] })).toBeNull();
  });

  it('null is not an object: a cleared box is allowed', () => {
    expect(nonTextFreeTextKey({ webHeadline: null, bldgMinIncome: null })).toBeNull();
  });

  it('a body that is not an object is not a violation', () => {
    for (const nothing of [null, undefined, 'text', 5]) expect(nonTextFreeTextKey(nothing as never)).toBeNull();
  });
});
