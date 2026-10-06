/// <reference types="jest" />
/**
 * "Exclusive" in CRM Search means the exclusive agreements Cotality defines.
 *
 * Live Cotality (2026-10-06, Lookup catalog joined to the Field catalog on Property + ListingAgreement + FieldKey 360 + LookupName):
 * ListingAgreement is a single-valued enum with 11 members and NO value called "Exclusive". The four RESO-standard exclusive
 * agreements are ExclusiveAgency, ExclusiveRightToLease, ExclusiveRightToSell and ExclusiveRightWithException (each defined by its
 * own contract text); Probate is defined as "an Exclusive Right To Sell listing agreement" under the probate code but is not an RLS
 * value; CoExclusiveAgency is RLS-only and defined by name alone; Open, Net, NonExclusiveAgency, PropertyManagement and
 * SellerReserved are not exclusive agreements. `ListingAgreement eq 'Exclusive'` and the joined string
 * 'ExclusiveRightToSell,ExclusiveRightToLease' are both rejected by live Cotality (HTTP 400); the two values as separate
 * comparisons returned 5,573 listings and all four exclusive values together returned 585,403.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildCrmIdxODataFilter } from '@/lib/search/crm-idx-filter';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const mirror = JSON.parse(read('data/cotality-enums.live.json')) as { enums: Record<string, string[]> };
const LIVE = mirror.enums.ListingAgreement;
const EXCLUSIVE = LIVE.filter((v) => v.startsWith('Exclusive')).sort();
const q = (checkboxFilters: Record<string, string[]>) => new URLSearchParams({ status: '*', checkboxFilters: JSON.stringify(checkboxFilters) });

describe('Cotality ListingAgreement as mirrored from live $metadata', () => {
  it('has 11 members, no plain Exclusive, and exactly four Exclusive-named members', () => {
    expect(LIVE).toHaveLength(11);
    expect(LIVE).not.toContain('Exclusive');
    expect(EXCLUSIVE).toEqual(['ExclusiveAgency', 'ExclusiveRightToLease', 'ExclusiveRightToSell', 'ExclusiveRightWithException']);
  });
});

describe('the advanced "Exclusive" box', () => {
  const html = read('public/crm/html/search-form-and-results.html');
  const box = html.match(/<label[^>]*><input type="checkbox" class="w-3 h-3" data-field="ListingAgreement" data-value="(Exclusive[A-Za-z]*,[A-Za-z,]+)"> Exclusive<\/label>/);

  it('exists once and selects exactly the exclusive agreements Cotality defines', () => {
    expect(box).not.toBeNull();
    expect((box as RegExpMatchArray)[1].split(',').sort()).toEqual(EXCLUSIVE);
  });

  it('no other joined ListingAgreement value remains in the Search form', () => {
    const joined = [...html.matchAll(/data-field="ListingAgreement"[^>]*data-value="([^"]+)"/g)].map((m) => m[1]).filter((v) => v.includes(','));
    expect(joined).toHaveLength(1);
  });
});

describe('the server splits joined ListingAgreement values instead of sending a string Cotality rejects', () => {
  it('the Exclusive box becomes one exact comparison per agreement', () => {
    const filter = buildCrmIdxODataFilter(q({ ListingAgreement: [EXCLUSIVE.join(',')] }));
    expect(filter).toContain(
      "(ListingAgreement eq 'ExclusiveAgency' or ListingAgreement eq 'ExclusiveRightToLease' or ListingAgreement eq 'ExclusiveRightToSell' or ListingAgreement eq 'ExclusiveRightWithException')",
    );
    expect(filter).not.toMatch(/ListingAgreement eq '[^']*,[^']*'/);
  });

  it('the old joined pair is split too, so saved searches that held it still work', () => {
    expect(buildCrmIdxODataFilter(q({ ListingAgreement: ['ExclusiveRightToSell,ExclusiveRightToLease'] }))).toContain(
      "(ListingAgreement eq 'ExclusiveRightToSell' or ListingAgreement eq 'ExclusiveRightToLease')",
    );
  });

  it('duplicates collapse, spaces and empty parts are ignored, the legacy CoExclusive alias is mapped after the split', () => {
    expect(buildCrmIdxODataFilter(q({ ListingAgreement: ['ExclusiveAgency, ExclusiveAgency,,', 'ExclusiveAgency'] }))).toContain("ListingAgreement eq 'ExclusiveAgency'");
    const legacy = buildCrmIdxODataFilter(q({ ListingAgreement: ['CoExclusive,ExclusiveAgency'] }));
    expect(legacy).toContain("(ListingAgreement eq 'CoExclusiveAgency' or ListingAgreement eq 'ExclusiveAgency')");
    expect(legacy).not.toMatch(/ListingAgreement eq 'CoExclusive'/);
  });

  it('an empty selection adds no clause and a single live value is unchanged', () => {
    expect(buildCrmIdxODataFilter(q({ ListingAgreement: [' , '] }))).not.toContain('ListingAgreement');
    expect(buildCrmIdxODataFilter(q({ ListingAgreement: ['Open'] }))).toContain("ListingAgreement eq 'Open'");
  });

  it('every one of the 11 live values is accepted as its own comparison', () => {
    for (const value of LIVE) expect(buildCrmIdxODataFilter(q({ ListingAgreement: [value] }))).toContain(`ListingAgreement eq '${value}'`);
  });
});
