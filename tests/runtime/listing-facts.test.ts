/// <reference types="jest" />
/**
 * A commercial listing has no bedrooms or bathrooms (Maya, 2026-11-06: a medical office on the Featured list read "0 bd · 2 ba").
 *
 * The behaviour is pinned two ways: the helper and the display adapter are RUN (a card is only as right as the flag that reaches it), and every public surface that prints beds and baths is read
 * for the shared helper (the repo's way of pinning card markup: source structure, no jsdom).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { showsBedsAndBaths, bedBathLead } from '@/lib/format/listing-facts';
import { fromPublicDTO } from '@/lib/idx/display-adapter';

const read = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf8');

describe('showsBedsAndBaths / bedBathLead', () => {
  it('a home shows beds and baths; only a commercial listing does not', () => {
    expect(showsBedsAndBaths({})).toBe(true);
    expect(showsBedsAndBaths({ isCommercial: false })).toBe(true);
    expect(showsBedsAndBaths({ isCommercial: null })).toBe(true);
    expect(showsBedsAndBaths({ isCommercial: true })).toBe(false);
  });

  it('the page description leads with "1 bed, 1 bath " for a home and with nothing for an office', () => {
    expect(bedBathLead({ bedroomsTotal: 1, bathroomsFull: 1 })).toBe('1 bed, 1 bath ');
    expect(bedBathLead({ bedroomsTotal: 0, bathroomsFull: 2, isCommercial: true })).toBe('');
    expect(`${bedBathLead({ bedroomsTotal: 0, bathroomsFull: 2, isCommercial: true })}Commercial in Manhattan.`).toBe('Commercial in Manhattan.');
  });

  it('a studio is still a home: 0 bedrooms is not what makes a listing commercial', () => {
    expect(bedBathLead({ bedroomsTotal: 0, bathroomsFull: 1 })).toBe('0 bed, 1 bath ');
  });
});

describe('the display adapter carries the flag from the public record to every card', () => {
  const dto = (over: Record<string, unknown>) => ({
    id: 'SL-0010', mlsId: 'SL-0010', slug: 'x', status: 'Active', listingType: 'sale',
    address: { streetNumber: '1', streetName: 'Main St', unitNumber: null, city: 'New York', county: 'New York', postalCode: '10001' },
    listPrice: 1, originalListPrice: 1, bedroomsTotal: 0, bathroomsFull: 2, bathroomsHalf: 0, livingArea: 1200,
    propertyType: 'Commercial', propertySubType: 'Office', listOfficeName: 'Mallan', modificationTimestamp: '', media: [],
    _displayCompliance: { attributionText: 'x', requiresAttribution: true }, ...over,
  });

  it('keeps isCommercial: true (the search cards and the map popup read it from here)', () => {
    expect(fromPublicDTO(dto({ isCommercial: true }) as never).isCommercial).toBe(true);
  });
  it('a home has no flag, so it still shows its beds and baths', () => {
    expect(showsBedsAndBaths(fromPublicDTO(dto({ propertyType: 'Condo' }) as never))).toBe(true);
  });
});

describe('every public surface that prints beds and baths uses the shared helper', () => {
  // the guard sits on the very element that prints the bedroom count (a separator that also asks the helper does not count)
  const SURFACES: Array<[string, string, RegExp, number]> = [
    ['app/components/SearchListingCard.tsx', 'the three search-card layouts', /showsBedsAndBaths\(listing\) && \(\s*<>\s*<span>\{listing\.bedroomsTotal\} Bed/g, 3],
    ['app/components/FeaturedListings.tsx', 'the Featured card', /showsBedsAndBaths\(listing\) && <>\{listing\.bedroomsTotal\} bd/g, 1],
    ['app/components/SearchMap.tsx', 'the map popup', /showsBedsAndBaths\(listing\) && <>\{listing\.bedroomsTotal\} Bed/g, 1],
    ['app/components/neighborhoods/LiveListingsWidget.tsx', 'the neighbourhood widget', /showsBedsAndBaths\(listing\) && <>\{listing\.bedroomsTotal\} bed/g, 1],
  ];

  it.each(SURFACES)('%s (%s) imports the helper and guards the bedroom count with it', (file, _what, guard, uses) => {
    const src = read(file);
    expect(src).toMatch(/import \{ showsBedsAndBaths \} from '@\/lib\/format\/listing-facts'/);
    expect((src.match(guard) ?? []).length).toBe(uses);
  });

  it('the Featured card and the neighbourhood widget declare the flag their data carries', () => {
    expect(read('app/components/FeaturedListings.tsx')).toMatch(/isCommercial\?: boolean/);
    expect(read('app/components/neighborhoods/LiveListingsWidget.tsx')).toMatch(/isCommercial\?: boolean/);
  });

  it('the display adapter declares the flag and copies it from the public record', () => {
    const src = read('lib/idx/display-adapter.ts');
    expect(src).toMatch(/isCommercial\?: boolean/);
    expect(src).toMatch(/isCommercial: dto\.isCommercial/);
  });

  describe('the listing page', () => {
    const page = read('app/listing/[...slug]/page.tsx');

    it('leaves the Beds and Baths tiles out of the stats row of a commercial listing, and the area tile keeps its place', () => {
      expect(page).toMatch(/\{showsBedsAndBaths\(listing\) && \(<>/);
      expect(page).toMatch(/\{showsBedsAndBaths\(listing\) && <div className="w-px h-8 bg-black\/10" \/>\}/);
    });

    it('never writes "N bed, M bath" into a search-engine description by hand: the three descriptions use the helper', () => {
      expect(page).not.toMatch(/description: `\$\{listing\.bedroomsTotal\} bed, \$\{listing\.bathroomsFull\} bath/);
      expect((page.match(/description: `\$\{bedBathLead\(listing\)\}/g) ?? []).length).toBe(3);
    });
  });
});
