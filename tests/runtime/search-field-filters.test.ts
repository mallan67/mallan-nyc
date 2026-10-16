/// <reference types="jest" />
/**
 * Search on every Cotality field (lib/search/field-filters.ts).
 *
 * Every field name, type and picklist value comes from the live contract (data/cotality-enums.live.json) and the live list of
 * fields Cotality lets us filter on (data/cotality-filterable.live.json). These tests hold the builder to that contract and keep the
 * generated search catalog (public/crm/js/search/search-field-catalog.js) in step with it.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  allSearchableFields,
  applyPostFilters,
  buildFieldFilters,
  isLongText,
  matchesPostFilter,
  opsFor,
  searchableField,
} from '../../lib/search/field-filters';
import { buildCrmIdxODataFilter } from '../../lib/search/crm-idx-filter';

const root = resolve(__dirname, '../..');
const contract = JSON.parse(readFileSync(resolve(root, 'data/cotality-enums.live.json'), 'utf8'));
const filterableDoc = JSON.parse(readFileSync(resolve(root, 'data/cotality-filterable.live.json'), 'utf8'));
const registry = JSON.parse(readFileSync(resolve(root, 'compliance/rules/compliance-concepts.json'), 'utf8'));

const run = (list: unknown) => buildFieldFilters(JSON.stringify(list));

describe('every Cotality field is addressable by search', () => {
  const all = allSearchableFields();
  const names = new Set(all.map((f) => f.name));

  it('covers every Property field, every CustomProperty field and every CustomFields key', () => {
    for (const n of Object.keys(contract.entities.Property)) expect(names.has(n)).toBe(true);
    for (const n of Object.keys(contract.entities.CustomProperty)) if (n !== 'CustomFields') expect(names.has(n)).toBe(true);
    for (const n of registry.customFieldKeys.keys) expect(names.has(n)).toBe(true);
  });

  it('server-side exactly the fields Cotality accepts in $filter; the rest are filtered on the fetched page', () => {
    const server = new Set(all.filter((f) => f.serverSide).map((f) => f.name));
    expect([...server].sort()).toEqual([...filterableDoc.filterable].sort());
    expect(filterableDoc.filterable.length + filterableDoc.provider_blocked.length + Object.keys(filterableDoc.other_failures).length)
      .toBe(Object.keys(contract.entities.Property).length);
  });

  it('every enumeration field carries its live picklist', () => {
    for (const f of all.filter((x) => x.kind === 'enum')) expect(Array.isArray(f.members) && f.members!.length > 0).toBe(true);
  });

  it('the generated search catalog lists the same fields, kinds and filter side as the module', () => {
    const src = readFileSync(resolve(root, 'public/crm/js/search/search-field-catalog.js'), 'utf8');
    const json = src.slice(src.indexOf('window.COTALITY_SEARCH_FIELDS = ') + 'window.COTALITY_SEARCH_FIELDS = '.length).replace(/;\s*$/, '');
    const catalog: Array<{ n: string; k: string; s: number; e?: string }> = JSON.parse(json);
    const enumsStart = src.indexOf('window.COTALITY_SEARCH_ENUMS = ') + 'window.COTALITY_SEARCH_ENUMS = '.length;
    const enumsJson = src.slice(enumsStart, src.indexOf(';\n', enumsStart));
    const catalogEnums: Record<string, string[]> = JSON.parse(enumsJson);
    expect(catalog.map((c) => c.n).sort()).toEqual([...names].sort());
    const byName = new Map(all.map((f) => [f.name, f]));
    for (const c of catalog) {
      const f = byName.get(c.n)!;
      expect(c.k).toBe(f.kind);
      expect(!!c.s).toBe(f.serverSide);
      if (f.kind === 'enum') expect(catalogEnums[c.e!]).toEqual(f.members);
    }
  });
});

describe('buildFieldFilters', () => {
  it('builds typed OData clauses for each kind', () => {
    const r = run([
      { f: 'ListPrice', op: 'between', v: [500000, 900000] },
      { f: 'FireplaceYN', op: 'eq', v: true },
      { f: 'BedroomsTotal', op: 'ge', v: 2 },
      { f: 'ListingContractDate', op: 'ge', v: '2026-09-01' },
      { f: 'ModificationTimestamp', op: 'ge', v: '2026-10-01' },
      { f: 'LaundryFeatures', op: 'in', v: ['InUnit', 'WasherHookup'] },
      { f: 'BuildingName', op: 'contains', v: 'Tower' },
      { f: 'SubdivisionName', op: 'in', v: ['West Village'] },
    ]);
    expect(r.rejected).toEqual([]);
    expect(r.clauses).toEqual([
      '(ListPrice ge 500000 and ListPrice le 900000)',
      'FireplaceYN eq true',
      'BedroomsTotal ge 2',
      'ListingContractDate ge 2026-09-01',
      'ModificationTimestamp ge 2026-10-01T00:00:00Z',
      "(LaundryFeatures eq 'InUnit' or LaundryFeatures eq 'WasherHookup')",
      "contains(BuildingName,'Tower')",
      "SubdivisionName eq 'West Village'",
    ]);
    expect(r.postFilters).toEqual([]);
  });

  it('rejects a field Cotality does not have, an operator the type does not support and a value that is not a live picklist member', () => {
    const r = run([
      { f: 'IDXEntireListingDisplayYN', op: 'eq', v: true },
      { f: 'ListPrice', op: 'contains', v: '5' },
      { f: 'PetsAllowed', op: 'in', v: ['CatsOK'] },
      { f: 'ListPrice', op: 'ge', v: 'abc' },
    ]);
    expect(r.clauses).toEqual([]);
    expect(r.rejected.map((x) => x.field)).toEqual(['IDXEntireListingDisplayYN', 'ListPrice', 'PetsAllowed', 'ListPrice']);
  });

  it('escapes quotes and cannot be used to inject OData', () => {
    const r = run([{ f: 'BuildingName', op: 'contains', v: "x') or ListPrice gt 0 or ('" }]);
    expect(r.clauses[0]).toBe("contains(BuildingName,'x'') or ListPrice gt 0 or (''')");
  });

  it('applies fields Cotality blocks, CustomProperty fields and CustomFields keys to the fetched page', () => {
    const blocked = filterableDoc.provider_blocked[0] as string;
    const r = run([
      { f: blocked, op: 'notnull' },
      { f: 'SponsorUnitYN', op: 'eq', v: true },
      { f: 'AdditionalFeeYN', op: 'eq', v: true },
    ]);
    expect(r.clauses).toEqual([]);
    expect(r.postFilters.map((p) => p.source)).toEqual(['property', 'custom-fields', 'custom-property']);
  });

  it('matches free text on the page for remarks-type fields, because Cotality cannot evaluate contains() on them in time', () => {
    expect(isLongText('PublicRemarks')).toBe(true);
    const r = run([{ f: 'PublicRemarks', op: 'contains', v: 'terrace' }]);
    expect(r.clauses).toEqual([]);
    expect(r.postFilters).toHaveLength(1);
    const rows = [{ PublicRemarks: 'Sunny TERRACE apartment' }, { PublicRemarks: 'No outdoor space' }, { PublicRemarks: null }];
    expect(applyPostFilters(rows, r.postFilters)).toEqual([rows[0]]);
  });

  it('reads CustomFields keys out of the CustomProperty JSON string', () => {
    const rec = (cf: object) => ({ CustomProperty: [{ CustomFields: JSON.stringify(cf) }] });
    const pf = run([{ f: 'TaxMonthlyAmount', op: 'ge', v: 1000 }]).postFilters[0];
    expect(matchesPostFilter(rec({ TaxMonthlyAmount: 1500 }), pf)).toBe(true);
    expect(matchesPostFilter(rec({ TaxMonthlyAmount: 900 }), pf)).toBe(false);
    expect(matchesPostFilter(rec({}), pf)).toBe(false);
    const yn = run([{ f: 'SponsorUnitYN', op: 'eq', v: true }]).postFilters[0];
    expect(matchesPostFilter(rec({ SponsorUnitYN: true }), yn)).toBe(true);
    expect(matchesPostFilter(rec({ SponsorUnitYN: false }), yn)).toBe(false);
  });

  it('reads CustomFields the way Cotality sends them: every value is text, a Yes/No field is "1" or "0" (live 2026-10-16)', () => {
    const rec = (cf: object) => ({ CustomProperty: [{ CustomFields: JSON.stringify(cf) }] });
    const tax = run([{ f: 'TaxMonthlyAmount', op: 'ge', v: 800 }]).postFilters[0];
    expect(matchesPostFilter(rec({ TaxMonthlyAmount: '840.00' }), tax)).toBe(true);
    expect(matchesPostFilter(rec({ TaxMonthlyAmount: '400.00' }), tax)).toBe(false);
    const sponsor = run([{ f: 'SponsorUnitYN', op: 'eq', v: true }]).postFilters[0];
    expect(matchesPostFilter(rec({ SponsorUnitYN: '1' }), sponsor)).toBe(true);
    expect(matchesPostFilter(rec({ SponsorUnitYN: '0' }), sponsor)).toBe(false);
    const common = run([{ f: 'PercentOfCommonElements', op: 'between', v: [1, 50] }]);   // numeric, from live evidence, not from the field's name
    expect(common.rejected).toEqual([]);
    expect(matchesPostFilter(rec({ PercentOfCommonElements: '1.00' }), common.postFilters[0])).toBe(true);
    expect(matchesPostFilter(rec({ PercentOfCommonElements: '0.00' }), common.postFilters[0])).toBe(false);
  });

  it('caps the number of filters and tolerates garbage', () => {
    expect(buildFieldFilters('not json').rejected).toHaveLength(1);
    expect(buildFieldFilters('{}').rejected).toHaveLength(1);
    expect(buildFieldFilters(null).clauses).toEqual([]);
    const many = Array.from({ length: 40 }, () => ({ f: 'FireplaceYN', op: 'eq', v: true }));
    expect(run(many).clauses).toHaveLength(25);
  });

  it('every operator offered for a kind is accepted for a field of that kind', () => {
    const first = (x: unknown) => (Array.isArray(x) ? x[0] : x);
    for (const f of allSearchableFields().filter((x) => x.serverSide)) {
      const sample: Record<string, unknown> = { boolean: true, number: 1, date: '2026-01-01', datetime: '2026-01-01', string: 'a', enum: f.members?.[0] };
      const one = sample[f.kind];
      for (const op of opsFor(f.kind)) {
        const v = op === 'between' ? [one, one] : op === 'in' ? [one] : first(one);
        const r = run([{ f: f.name, op, v }]);
        expect(r.rejected).toEqual([]);
      }
    }
  });
});

describe('the CRM search filter includes field filters', () => {
  it('appends the server-side clauses to the existing OData filter', () => {
    const params = new URLSearchParams({ type: 'sale', fieldFilters: JSON.stringify([{ f: 'FireplaceYN', op: 'eq', v: true }]) });
    expect(buildCrmIdxODataFilter(params)).toContain('FireplaceYN eq true');
  });
  it('leaves the filter unchanged without field filters', () => {
    expect(buildCrmIdxODataFilter(new URLSearchParams({ type: 'sale' }))).not.toContain('FireplaceYN');
  });
  it('searchableField knows where a field lives', () => {
    expect(searchableField('ListPrice')?.source).toBe('property');
    expect(searchableField('ApplicationFee')?.source).toBe('custom-property');
    expect(searchableField('FlipTax')?.source).toBe('custom-fields');
    expect(searchableField('NotAField')).toBeNull();
  });
});
