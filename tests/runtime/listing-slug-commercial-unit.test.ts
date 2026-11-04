/// <reference types="jest" />
/**
 * A commercial space's slug says "unit", not "apt" (Maya, 2026-11-04: the URL of 800 2nd Avenue #806, a medical office condominium, was
 * https://mallan.nyc/listing/800-2nd-avenue-apt-806-new-york-city-ny-10017/sl-0010 — "it should say either unit or commercial unit... right now it appears as an apartment").
 *
 * One rule (slugUnitWord, on the listing's RAW property type and subtype), applied by every builder of a slug: the DB-row builder the page's canonical uses, the sitemap, the Cotality
 * record's public DTO and the CRM's "public URL". An address link written with "apt" before this change must still find the listing, and the page redirects it to the canonical one.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildListingSlugFromDbRow, extractListingIdFromSlug, generateListingSlug, parseAddressSlug, slugUnitWord } from '@/lib/listing-slug';
import { buildCanonicalListingPath } from '@/lib/listing-canonical-url';
import { buildListingUrls } from '@/lib/crm/listing-urls';

const ADDRESS = { streetNumber: '800', streetName: '2nd Avenue', unitNumber: '806', city: 'New York City', stateOrProvince: 'NY', postalCode: '10017' };
const slugOf = (propertyType?: string | null, propertySubType?: string | null, over: Record<string, unknown> = {}) =>
  generateListingSlug({ address: ADDRESS, id: 'SL-0010', mlsId: 'SL-0010', internetAddressDisplayYN: true, propertyType, propertySubType, ...over });

describe('slugUnitWord', () => {
  it.each([
    ['Commercial', 'Commercial Condo'], ['Commercial', null], ['Office', null], ['Retail', 'RetailCondo'], ['CommercialSale', 'Business'], ['CommercialSale', 'FlexibleSpace'], ['Industrial', null], ['Commercial Condo', null],
  ])('%s / %s is a unit', (type, sub) => expect(slugUnitWord(type, sub)).toBe('unit'));

  it.each([
    ['Residential', 'Apartment'], ['Condo', null], ['Condop', 'Apartment'], ['Co-op', 'Apartment'], ['Residential', 'Townhouse'], ['ResidentialIncome', null], [null, null], [undefined, undefined], ['', ''],
  ])('%s / %s stays an apartment', (type, sub) => expect(slugUnitWord(type, sub)).toBe('apt'));
});

describe('800 2nd Avenue #806 (SL-0010)', () => {
  it('saved as a commercial listing its slug says unit', () => {
    expect(slugOf('Commercial', 'Commercial Condo')).toBe('800-2nd-avenue-unit-806-new-york-city-ny-10017-sl-0010');
    expect(buildCanonicalListingPath({ slug: slugOf('Commercial', 'Commercial Condo'), id: 'SL-0010' })).toBe('/listing/800-2nd-avenue-unit-806-new-york-city-ny-10017/sl-0010');
  });

  it('saved as a residential condo it still says apt (what production holds today: propertyType Condo)', () => {
    expect(slugOf('Condo')).toBe('800-2nd-avenue-apt-806-new-york-city-ny-10017-sl-0010');
    expect(slugOf(undefined)).toBe('800-2nd-avenue-apt-806-new-york-city-ny-10017-sl-0010');       // a caller that knows no type keeps the old slug
  });

  it('a space with no unit number has no marker at all, and a suppressed address is still the id-only slug', () => {
    expect(slugOf('Commercial', null, { address: { ...ADDRESS, unitNumber: null } })).toBe('800-2nd-avenue-new-york-city-ny-10017-sl-0010');
    expect(slugOf('Commercial', null, { internetAddressDisplayYN: false })).toBe('listing-sl-0010');
  });

  it('the old ".../apt-806-..." link still finds the listing (by its id, or by its address) and is not the canonical path, so the page redirects it', () => {
    const oldSlug = '800-2nd-avenue-apt-806-new-york-city-ny-10017-sl-0010';
    expect(extractListingIdFromSlug(oldSlug)).toBe('SL-0010');
    expect(parseAddressSlug(oldSlug)).toMatchObject({ streetNumber: '800', postalCode: '10017', unitNumber: '806' });
    expect(`/listing/${oldSlug.replace(/-sl-0010$/, '')}/sl-0010`).not.toBe(buildCanonicalListingPath({ slug: slugOf('Commercial'), id: 'SL-0010' }));
  });

  it('the new slug reads back: its id, and its address with the unit', () => {
    const slug = slugOf('Commercial', 'Commercial Condo');
    expect(extractListingIdFromSlug(slug)).toBe('SL-0010');
    expect(parseAddressSlug(slug)).toMatchObject({ streetNumber: '800', postalCode: '10017', unitNumber: '806' });
  });

  it('a unit written "8 H" or "17-C" is one token after the marker, and parses back for either marker', () => {
    for (const type of ['Commercial', 'Condo']) {
      const slug = slugOf(type, null, { address: { ...ADDRESS, unitNumber: '17-C' } });
      expect(slug).toContain(type === 'Commercial' ? '-unit-17c-' : '-apt-17c-');
      expect(parseAddressSlug(slug)?.unitNumber).toBe('17c');
    }
  });
});

describe('every builder of a slug agrees', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    listing_id: 'SL-0010', rls_eligible: false, borough: 'Manhattan', property_type: 'Commercial', property_sub_type: 'Commercial Condo',
    address: { StreetNumber: '800', StreetName: '2nd Avenue', UnitNumber: '806', City: 'New York City', PostalCode: '10017' }, ...over,
  });
  const sitemapSlug = (r: ReturnType<typeof row>) => {
    const a = r.address as Record<string, string>;
    return generateListingSlug({
      address: { streetNumber: a.StreetNumber, streetName: a.StreetName, unitNumber: a.UnitNumber, city: a.City, stateOrProvince: 'NY', postalCode: a.PostalCode },
      id: r.listing_id, mlsId: r.listing_id, internetAddressDisplayYN: true, propertyType: r.property_type as string, propertySubType: r.property_sub_type as string,
    });
  };

  it.each([['Commercial', 'Commercial Condo', 'unit'], ['Condo', null, 'apt'], ['Residential', 'Apartment', 'apt']])('the page canonical (DB row), the sitemap and the CRM public URL say the same for %s / %s: %s', (type, sub, word) => {
    const r = row({ property_type: type, property_sub_type: sub });
    const canonical = buildListingSlugFromDbRow(r);
    expect(canonical).toContain(`-${word}-806-`);
    expect(sitemapSlug(r)).toBe(canonical);
    const { publicUrl } = buildListingUrls({ listing_id: 'SL-0010', status: 'Active', address: r.address, rls_eligible: false, internet_address_display_yn: true, internet_entire_listing_display_yn: true, property_type: type, property_sub_type: sub });
    expect(publicUrl).toContain(`/listing/800-2nd-avenue-${word}-806-new-york-city-ny-10017/sl-0010`);
  });

  it('the sitemap, the Cotality record\'s public DTO and the CRM routes hand the raw type to the slug (a builder that did not would disagree with the page)', () => {
    const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8').replace(/\r\n/g, '\n');
    expect(src('app/sitemap.ts')).toMatch(/property_type: true,\n\s+property_sub_type: true,/);
    expect(src('app/sitemap.ts')).toMatch(/propertyType: l\.property_type,\n\s+propertySubType: l\.property_sub_type,/);
    expect(src('lib/idx/public-dto.ts')).toMatch(/propertyType: listing\.propertyType,\n\s+propertySubType: listing\.propertySubType,/);
    for (const route of ['app/api/crm/listings/[id]/route.ts', 'app/api/crm/listings/[id]/status/route.ts']) expect(src(route)).toMatch(/property_type: (updated|listing)\.property_type,\n\s+property_sub_type: (updated|listing)\.property_sub_type,/);
    expect(src('app/api/crm/listings/route.ts')).toMatch(/property_type: true,\n\s+property_sub_type: true,/);
  });
});
