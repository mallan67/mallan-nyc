/**
 * Domain 9 (2026-09-08) — CustomProperty.CustomFields is stored losslessly.
 *
 * Provider facts (census 2026-09-08): the CustomProperty navigation returns a payload on every one of 591,599
 * rows; `CustomFields` is a JSON string carrying 61 NYC/REBNY keys on every row (BuildingTaxLot,
 * CertificateOfOccupancyYN, GuarantorsAcceptedYN, FlipTaxRemarks, MaximumFinancingRemarks, TaxAbatementComments,
 * BuildingRules …); `$expand=CustomProperty($select=CustomFields)` was accepted live for the whole corpus.
 * Mallan fact: no production caller expanded CustomProperty, and the mapper never read it — the 61 keys were
 * never ingested. The mapper now parses them into `custom_fields` when the row carries the expansion.
 */
import { mapTrestleToPrisma, customFieldsFromProviderRow } from '../trestle-mapper';

const base = {
  ListingKey: 'K1', ListingId: 'RLS1', StandardStatus: 'Active', MlsStatus: 'Active', PropertyType: 'Residential',
  ListPrice: 1, ModificationTimestamp: '2026-09-01T00:00:00Z',
};

describe('CustomFields → custom_fields (lossless)', () => {
  it('parses the CustomFields JSON string of the expanded CustomProperty into custom_fields', () => {
    const cf = { CertificateOfOccupancyYN: 'Yes', BuildingTaxLot: '7501', FlipTaxRemarks: '2% paid by purchaser' };
    const mapped = mapTrestleToPrisma({ ...base, CustomProperty: [{ ListingKey: 'K1', CustomFields: JSON.stringify(cf) }] } as never);
    expect(mapped.custom_fields).toEqual(cf);
  });
  it('accepts an already-parsed object', () => {
    expect(customFieldsFromProviderRow({ CustomProperty: { CustomFields: { GuarantorsAcceptedYN: 'Yes' } } })).toEqual({ GuarantorsAcceptedYN: 'Yes' });
  });
  it('writes nothing when the row was not expanded — never a null overwrite of a CRM-authored value', () => {
    const mapped = mapTrestleToPrisma(base as never);
    expect('custom_fields' in mapped).toBe(false);
  });
  it('a malformed string is not stored (fail-closed, never a fabricated fact)', () => {
    expect(customFieldsFromProviderRow({ CustomProperty: { CustomFields: '{not json' } })).toBeNull();
    expect(customFieldsFromProviderRow({ CustomProperty: [] })).toBeNull();
    expect(customFieldsFromProviderRow({})).toBeNull();
  });
});
