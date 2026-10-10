/// <reference types="jest" />
/**
 * ListingAgreement values Mallan offers, accepts or searches must be members of the live Cotality enum.
 *
 * Live Cotality has CoExclusiveAgency and NO CoExclusive (data/cotality-enums.live.json, regenerated from live
 * $metadata). Co-exclusive is an agreement TYPE: the two listing agents may be in the same office, the same company or
 * different companies, so it never implies an office relationship. The non-live value may appear ONLY as a documented
 * legacy INPUT alias (old stored rows, old saved searches); no form or Search control may offer it.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
const mirror = JSON.parse(read('data/cotality-enums.live.json')) as { enums: Record<string, string[]> };
const LIVE = new Set(mirror.enums.ListingAgreement);

const FORMS = ['SALE-FORM-REDESIGN', 'RENTAL-FORM-REDESIGN', 'SALE-FORM-WITH-TOOLS', 'RENTAL-FORM-WITH-TOOLS'];

describe('ListingAgreement uses live Cotality values only', () => {
  it('the live enum has CoExclusiveAgency and not CoExclusive', () => {
    expect(LIVE.has('CoExclusiveAgency')).toBe(true);
    expect(LIVE.has('CoExclusive')).toBe(false);
  });

  it('every Add/Edit permitted value is a live member', () => {
    for (const v of REBNY_FIELD_TABLES.enumValues.ListingAgreement) expect(LIVE.has(v)).toBe(true);
    expect(REBNY_FIELD_TABLES.enumValues.ListingAgreement).toContain('CoExclusiveAgency');
  });

  it('every alias normalizes to a live member, and the non-live value is only an alias key', () => {
    const aliases = REBNY_FIELD_TABLES.valueAliases.ListingAgreement as Record<string, string>;
    for (const target of Object.values(aliases)) expect(LIVE.has(target)).toBe(true);
    expect(aliases['Co-Exclusive']).toBe('CoExclusiveAgency');
    expect(aliases['Co Exclusive']).toBe('CoExclusiveAgency');
    expect(aliases.CoExclusive).toBe('CoExclusiveAgency');
  });

  it.each(FORMS)('%s offers CoExclusiveAgency and never the non-live CoExclusive', (name) => {
    const html = read(`public/crm/${name}.html`);
    const prefix = name.startsWith('SALE') ? 'sale' : 'rental';
    expect(html).toContain(`name="${prefix}ListingType" value="CoExclusiveAgency"`);
    expect(html).not.toMatch(/value="CoExclusive"/);
  });

  it('every ListingAgreement criterion in Search is a live member', () => {
    const html = read('public/crm/html/search-form-and-results.html');
    const values = [...html.matchAll(/data-field="ListingAgreement"[^>]*data-value="([^"]+)"/g)].flatMap((m) => m[1].split(','));
    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((v) => !LIVE.has(v))).toEqual([]);
    expect(values).toContain('CoExclusiveAgency');
  });

  it('the non-live value appears only inside documented legacy aliases', () => {
    const files = [
      ...FORMS.map((n) => `public/crm/${n}.html`),
      'public/crm/html/search-form-and-results.html',
      'public/crm/html/modals/listing-type-info.html',
      'public/crm/js/search/saved-searches.js',
      'lib/search/crm-idx-filter.ts',
      'lib/compliance/rebny-field-tables.ts',
    ];
    for (const f of files) {
      const offenders = read(f)
        .split('\n')
        .filter((l) => /CoExclusive(?!Agency)/.test(l) && !/CoExclusiveAgency/.test(l));
      expect({ file: f, offenders }).toEqual({ file: f, offenders: [] });
    }
  });

  it('legacy saved-search CoExclusive criteria are sent to Cotality as the live value', () => {
    const params = new URLSearchParams({ checkboxFilters: JSON.stringify({ ListingAgreement: ['CoExclusive', 'ExclusiveAgency'] }) });
    const filter = buildCrmIdxODataFilter(params);
    expect(filter).toContain("ListingAgreement eq 'CoExclusiveAgency'");
    expect(filter).toContain("ListingAgreement eq 'ExclusiveAgency'");
    expect(filter).not.toMatch(/ListingAgreement eq 'CoExclusive'/);
  });

  it('a live CoExclusiveAgency criterion is passed through unchanged', () => {
    const params = new URLSearchParams({ checkboxFilters: JSON.stringify({ ListingAgreement: ['CoExclusiveAgency'] }) });
    expect(buildCrmIdxODataFilter(params)).toContain("ListingAgreement eq 'CoExclusiveAgency'");
  });
});
