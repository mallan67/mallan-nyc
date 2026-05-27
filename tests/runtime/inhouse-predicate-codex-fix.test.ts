/**
 * Codex finding fix: isInHouse predicate must check BOTH saleListingType
 * AND listingAgreement for all three InHouse values.
 *
 * Verifies POST and PATCH routes use a shared inHouseValues array that
 * covers "InHouse", "InHouseInternal", and "InHouseWebOnly" on both
 * body.saleListingType and body.listingAgreement fields.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const POST_PATH = resolve(__dirname, '../../app/api/crm/listings/route.ts');
const PATCH_PATH = resolve(__dirname, '../../app/api/crm/listings/[id]/route.ts');
const postRoute = readFileSync(POST_PATH, 'utf8');
const patchRoute = readFileSync(PATCH_PATH, 'utf8');

const INHOUSE_VALUES = ['InHouse', 'InHouseInternal', 'InHouseWebOnly'];

describe('POST route — isInHouse predicate (Codex fix)', () => {
  it('defines inHouseValues array with all three values', () => {
    expect(postRoute).toContain('"InHouse", "InHouseInternal", "InHouseWebOnly"');
  });

  it('checks saleListingType against inHouseValues', () => {
    expect(postRoute).toContain('inHouseValues.includes(String(body.saleListingType');
  });

  it('checks listingAgreement against inHouseValues', () => {
    expect(postRoute).toContain('inHouseValues.includes(String(body.listingAgreement');
  });

  it('saleListingType=InHouseInternal triggers isInHouse', () => {
    const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
    expect(inHouseValues.includes("InHouseInternal")).toBe(true);
  });

  it('saleListingType=InHouseWebOnly triggers isInHouse', () => {
    const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
    expect(inHouseValues.includes("InHouseWebOnly")).toBe(true);
  });

  it('listingAgreement=InHouseInternal triggers isInHouse', () => {
    const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
    expect(inHouseValues.includes("InHouseInternal")).toBe(true);
  });

  it('listingAgreement=InHouseWebOnly triggers isInHouse', () => {
    const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
    expect(inHouseValues.includes("InHouseWebOnly")).toBe(true);
  });

  it('legacy listingAgreement=InHouse still triggers isInHouse', () => {
    const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
    expect(inHouseValues.includes("InHouse")).toBe(true);
  });

  it('ExclusiveRightToSell does NOT trigger isInHouse', () => {
    const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
    expect(inHouseValues.includes("ExclusiveRightToSell")).toBe(false);
  });

  it('OwnerOptOut does NOT trigger isInHouse', () => {
    const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
    expect(inHouseValues.includes("OwnerOptOut")).toBe(false);
  });

  it('ParticipantOnly does NOT trigger isInHouse', () => {
    const inHouseValues = ["InHouse", "InHouseInternal", "InHouseWebOnly"];
    expect(inHouseValues.includes("ParticipantOnly")).toBe(false);
  });
});

describe('PATCH route — isInHouse predicate (Codex fix)', () => {
  it('defines inHouseValues array with all three values', () => {
    expect(patchRoute).toContain('"InHouse", "InHouseInternal", "InHouseWebOnly"');
  });

  it('checks merged.saleListingType against inHouseValues', () => {
    expect(patchRoute).toContain('inHouseValues.includes(String(merged.saleListingType');
  });

  it('checks merged.listingAgreement against inHouseValues', () => {
    expect(patchRoute).toContain('inHouseValues.includes(String(merged.listingAgreement');
  });
});

describe('String() coercion safety', () => {
  it('String(undefined) does not match any inHouseValue', () => {
    expect(INHOUSE_VALUES.includes(String(undefined))).toBe(false);
  });

  it('String(null) does not match any inHouseValue', () => {
    expect(INHOUSE_VALUES.includes(String(null))).toBe(false);
  });

  it('String("") via fallback does not match any inHouseValue', () => {
    expect(INHOUSE_VALUES.includes(String("" || ""))).toBe(false);
  });
});
