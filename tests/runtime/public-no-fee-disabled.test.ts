/// <reference types="jest" />
/**
 * "No Fee" is DISABLED on the public site until a live Cotality field is found (Maya, 2026-10-09: "Disable until a live field is found").
 *
 * Found by the second review she pasted and confirmed in the code: the "No Fee" chip and the phrases "no fee" / "no broker fee" / "owner pays" filtered ListingTerms for NoFee / OwnerPays. Neither is a
 * live member of ListingTerms, and the live OwnerPays is the list of UTILITIES the owner pays, so every such search answered "no results" (the Trestle path ignored it, so the two paths disagreed). No live
 * field says who pays the broker fee.
 *
 * What holds now: the filter panel shows the box disabled with the reason; no search applies the filter (the DB path, the projection); a typed phrase is read, removed from the text and filters nothing
 * (the search page tells the reader); the home page suggests nothing that depends on it; an old link with amenities=no-fee drops it. This file holds all of those, and the evidence that the reason is true.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SearchFilterPanel from '@/app/components/SearchFilterPanel';
import { buildChips } from '@/app/components/SearchChips';
import { parseNaturalLanguageSearch } from '@/lib/search/natural-language-parser';
import { extractProjectionAmenityKeys } from '@/lib/search/listing-search-projection';
import { applyPublicListingPostFilters } from '@/lib/search/public-listing-db';
import { AMENITY_FIELD_MAP, isSearchableAmenity, searchableAmenities, unavailableAmenities, type SearchFilters } from '@/lib/search/types';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
/** the file's code without its comments */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const REASON = 'Not searchable yet. Fee and move-in cost details that the listing broker provides are shown on the listing page.';
const live: Record<string, string[]> = JSON.parse(read('data/cotality-enums.live.json')).enums;

describe('the reason is true: there is no live field to filter on', () => {
  it('NoFee and OwnerPays are not members of ListingTerms, and the live OwnerPays lists utilities', () => {
    expect(live.ListingTerms).not.toContain('NoFee');
    expect(live.ListingTerms).not.toContain('OwnerPays');
    expect(live.OwnerPays).toEqual(expect.arrayContaining(['AllUtilities', 'Heat', 'Water', 'Electricity']));
  });

  it('no live enumeration is named for who pays a broker fee (when one appears, this fails until someone decides to enable the filter)', () => {
    expect(Object.keys(live).filter((name) => /broker.*fee|fee.*paid|paid.*by|no_?fee/i.test(name))).toEqual([]);
  });
});

describe('the filter is disabled in the one map every layer reads', () => {
  it('No Fee carries the reason, names no field and no value, and is not searchable', () => {
    const entry = AMENITY_FIELD_MAP['no-fee'];
    expect(entry.unavailable).toBe(REASON);
    expect(entry.field).toBe('');
    expect(entry.values).toEqual([]);
    expect(isSearchableAmenity('no-fee')).toBe(false);
  });

  it('it is the only disabled filter; every other one is searchable and names a field and a value', () => {
    const disabled = Object.entries(AMENITY_FIELD_MAP).filter(([, c]) => c.unavailable).map(([k]) => k);
    expect(disabled).toEqual(['no-fee']);
    for (const [key, config] of Object.entries(AMENITY_FIELD_MAP)) {
      if (key === 'no-fee') continue;
      expect(isSearchableAmenity(key)).toBe(true);
      expect(config.field).not.toBe('');
      expect(config.values.length).toBeGreaterThan(0);
    }
  });

  it('searchableAmenities keeps the filters a search can apply, in order, each once, and drops the rest (a disabled filter, unknown words, names every object inherits)', () => {
    expect(searchableAmenities(['doorman', 'no-fee', 'pet-friendly', 'doorman', 'nonsense', 'toString', 'constructor', '__proto__', 'hasOwnProperty'])).toEqual(['doorman', 'pet-friendly']);
    expect(searchableAmenities(undefined)).toEqual([]);
    expect(searchableAmenities(null)).toEqual([]);
    expect(searchableAmenities([])).toEqual([]);
  });

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'])('%s is not an amenity (it used to pass `key in AMENITY_FIELD_MAP`)', (key) => {
    expect(isSearchableAmenity(key)).toBe(false);
  });
});

describe('no search applies it', () => {
  const doorman = { id: 'a', buildingFeatures: 'Concierge' };
  const plain = { id: 'b' };
  const noFeeTerms = { id: 'c', listingTerms: 'NoFee,OwnerPays' };
  const run = (query: string, rows: Array<Record<string, unknown>>, features = new Map<string, Record<string, unknown>>()) =>
    applyPublicListingPostFilters(rows as never, features, new URLSearchParams(query)).map((l) => l.id);

  it('amenities=no-fee keeps every listing (it used to keep none)', () => {
    expect(run('amenities=no-fee', [doorman, plain, noFeeTerms], new Map([['c', { ListingTerms: 'NoFee,OwnerPays' }]]))).toEqual(['a', 'b', 'c']);
  });

  it('amenities=no-fee,doorman filters on the doorman alone', () => {
    expect(run('amenities=no-fee,doorman', [doorman, plain])).toEqual(['a']);
    expect(run('amenities=doorman,no-fee', [doorman, plain])).toEqual(['a']);
  });

  it('a word every object inherits is not an amenity: amenities=toString,constructor filters nothing and does not throw', () => {
    expect(run('amenities=toString,constructor,__proto__', [doorman, plain])).toEqual(['a', 'b']);
  });

  it('the search projection never stores it, even for a listing whose ListingTerms says NoFee', () => {
    expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { ListingTerms: 'NoFee,OwnerPays', BuildingFeatures: 'Concierge' } })).toEqual(['doorman']);
    expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { ListingTerms: 'NoFee,OwnerPays' } })).toBeNull();
  });

  it('it stays disabled even if a field is named for it: the reason is what disables it (so naming the field is not enough to turn it on by accident)', () => {
    const entry = AMENITY_FIELD_MAP['no-fee'];
    const saved = { ...entry };
    try {
      entry.field = 'ListingTerms';
      entry.values = ['NoFee'];
      expect(isSearchableAmenity('no-fee')).toBe(false);
      expect(run('amenities=no-fee', [doorman, plain, noFeeTerms], new Map([['c', { ListingTerms: 'NoFee' }]]))).toEqual(['a', 'b', 'c']);
      expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { ListingTerms: 'NoFee' } })).toBeNull();
    } finally {
      Object.assign(entry, saved);
    }
  });

  it('a chip is shown only for a filter that is applied', () => {
    const filters = { amenities: ['doorman', 'no-fee', 'toString'] } as unknown as SearchFilters;
    const chips = buildChips(filters, [], undefined);
    expect(chips.filter((c) => c.type === 'amenity').map((c) => c.filterValue)).toEqual(['doorman']);
  });
});

describe('the filter panel shows it disabled, with the reason', () => {
  const html = (currentFilters: SearchFilters = {}) =>
    renderToStaticMarkup(createElement(SearchFilterPanel, { isOpen: true, onClose: () => undefined, onApply: () => undefined, currentFilters, activeTab: 'rent-residential' }));
  const inputs = (markup: string) => markup.match(/<input\b[^>]*>/g) ?? [];

  it('the No Fee box is a disabled, unchecked checkbox that points at its reason, and the reason is on the page', () => {
    const markup = html();
    const noFee = inputs(markup).filter((tag) => tag.includes('aria-describedby="amenity-no-fee-unavailable"'));
    expect(noFee).toHaveLength(1);
    expect(noFee[0]).toMatch(/\bdisabled\b/);
    expect(noFee[0]).not.toMatch(/\bchecked\b/);
    expect(markup).toContain('id="amenity-no-fee-unavailable"');
    expect(markup).toContain(REASON);
    expect(markup.match(/No Fee/g)).toHaveLength(1);
  });

  it('it is the only disabled box: every other amenity can be ticked', () => {
    const disabled = inputs(html()).filter((tag) => /\bdisabled\b/.test(tag));
    expect(disabled).toHaveLength(1);
    const ticks = inputs(html()).filter((tag) => tag.includes('type="checkbox"') && !/\bdisabled\b/.test(tag));
    expect(ticks.length).toBeGreaterThanOrEqual(Object.values(AMENITY_FIELD_MAP).filter((c) => !c.unavailable).length);
  });

  it('even if the filters it was given still name No Fee, the box is not checked', () => {
    const markup = html({ amenities: ['no-fee'] } as unknown as SearchFilters);
    const noFee = inputs(markup).filter((tag) => tag.includes('aria-describedby="amenity-no-fee-unavailable"'));
    expect(noFee[0]).not.toMatch(/\bchecked\b/);
  });
});

describe('a typed phrase is read, removed from the text, and filters nothing', () => {
  it.each(['no fee', 'No Broker Fee', 'owner pays', 'NO FEE', 'no fees', 'No-Fee', 'nofee', 'no broker fees', 'no-broker-fee', 'landlord pays'])('%j: no filter, nothing left over, and the reader is told why', (phrase) => {
    const parsed = parseNaturalLanguageSearch(`2br chelsea ${phrase} doorman`);
    expect(parsed.filters.amenities).toEqual(['doorman']);
    expect(parsed.remainingQuery).toBe('');
    expect(parsed.neighborhood).toBe('Chelsea');
    expect(parsed.unavailable).toHaveLength(1);
    expect(parsed.unavailable[0].key).toBe('no-fee');
    expect(parsed.unavailable[0].reason).toBe(REASON);
  });

  it('enabling the filter (one change in lib/search/types.ts) turns the typed phrases into a real filter again, and the notice goes', () => {
    const entry = AMENITY_FIELD_MAP['no-fee'];
    const saved = { ...entry };
    try {
      delete entry.unavailable;
      entry.field = 'ListingTerms';
      entry.values = ['SomeLiveMember'];
      expect(isSearchableAmenity('no-fee')).toBe(true);
      const parsed = parseNaturalLanguageSearch('studio chelsea no fee');
      expect(parsed.filters.amenities).toEqual(['no-fee']);
      expect(parsed.unavailable).toEqual([]);
      expect(parsed.remainingQuery).toBe('');
    } finally {
      Object.assign(entry, saved);
    }
    expect(parseNaturalLanguageSearch('studio chelsea no fee').filters.amenities).toBeUndefined();
    expect(parseNaturalLanguageSearch('studio chelsea no fee').unavailable).toHaveLength(1);
  });

  it('every example the home page rotates through is something the search can do', () => {
    const examples = [...(/const EXAMPLE_QUERIES = \[([\s\S]*?)\];/.exec(read('app/components/HeroSearch.tsx'))?.[1] ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(examples.length).toBeGreaterThanOrEqual(6);
    for (const example of examples) {
      expect(example).not.toMatch(/no fee|no broker fee|owner pays/i);
      expect(parseNaturalLanguageSearch(example).unavailable).toEqual([]);
    }
  });
});

/** every spelling the dictionary reads, bare: the search page and the home page must send each of them to the parser (code review of 2026-10-09: "no broker fee" and "owner pays" were not sent) */
const SPELLINGS = ['no fee', 'no  fee', 'No-Fee', 'no fees', 'nofee', 'no broker fee', 'no broker fees', 'No-Broker-Fee', 'no broker-fee', 'owner pays', 'owner pays the broker fee', 'landlord pays', 'landlord pays the fee'];

describe('a link that names the disabled filter is told to the reader, not silently cleaned', () => {
  it('unavailableAmenities names the disabled filters of a request, once each, with the label and the reason, and nothing else', () => {
    expect(unavailableAmenities(['doorman', 'no-fee', 'no-fee', 'toString', 'nonsense'])).toEqual([{ key: 'no-fee', label: 'No Fee', reason: REASON }]);
    expect(unavailableAmenities(['doorman', 'pet-friendly'])).toEqual([]);
    expect(unavailableAmenities(undefined)).toEqual([]);
    expect(unavailableAmenities([''])).toEqual([]);
  });

  it('what the home page sends is what the search page reads: the phrase becomes the disabled filter in the link, the filters drop it, and the notice names it', () => {
    const parsed = parseNaturalLanguageSearch('studio chelsea no fee pet friendly');
    const inLink = [...(parsed.filters.amenities ?? []), ...parsed.unavailable.map((u) => u.key)];
    expect(inLink).toEqual(['pet-friendly', 'no-fee']);
    expect(searchableAmenities(inLink)).toEqual(['pet-friendly']);
    expect(unavailableAmenities(inLink).map((u) => u.label)).toEqual(['No Fee']);
  });

  it('the home page folds what its search read but did not apply into the link, and routes every spelling through the parser', () => {
    const hero = code('app/components/HeroSearch.tsx');
    expect(hero).toMatch(/amenities: \[\.\.\.\(parsed\.filters\.amenities \?\? \[\]\), \.\.\.parsed\.unavailable\.map\(\(u\) => u\.key\)\],/);
    const signals = /const nlSignals = (\/.*\/i);/.exec(hero)?.[1];
    expect(signals).toBeDefined();
    const heroSignals = new Function(`return ${signals}`)() as RegExp;
    // the bare phrase: a prefix such as "studio" would match the signals by itself and prove nothing
    for (const phrase of SPELLINGS) expect(heroSignals.test(phrase)).toBe(true);
  });

  it('the search page routes every spelling through the parser too', () => {
    const signals = /const nlSignals = (\/.*\/i);/.exec(code('app/search/page.tsx'))?.[1];
    expect(signals).toBeDefined();
    const pageSignals = new Function(`return ${signals}`)() as RegExp;
    for (const phrase of SPELLINGS) expect(pageSignals.test(phrase)).toBe(true);
  });
});

describe('the pages that read it', () => {
  it('the search page drops a disabled or unknown filter from the URL, and tells the reader about a phrase or a link filter it did not apply', () => {
    const page = code('app/search/page.tsx');
    expect(page).toMatch(/const amenityKeys = searchableAmenities\(csv\('amenities'\)\);/);
    expect(page).toMatch(/amenities: amenityKeys\.length \? amenityKeys : undefined/);
    // the typed phrases come from the SAME parse as the filters, in the one branch that parses; every other branch of the resolved search says nothing was read
    expect(page).toMatch(/const typed = resolvedSearch\.unavailable;/);
    expect(page).toMatch(/unavailable: parsed\.unavailable,/);
    expect(page.match(/unavailable: NO_UNAVAILABLE/g)).toHaveLength(5);
    expect(page).toMatch(/unavailableAmenities\(amenitiesParam\.split\(','\)\)/);
    expect(page).toMatch(/\.filter\(\(\{ key \}\) => !typed\.some\(\(t\) => t\.key === key\)\)/);
    expect(page).toMatch(/unavailableTerms\.length > 0/);
    expect(page).toMatch(/was not applied\. \$\{t\.reason\}/);
  });

  it('the DB path and the chips ask isSearchableAmenity, not `in AMENITY_FIELD_MAP`', () => {
    expect(code('lib/search/public-listing-db.ts')).toMatch(/isSearchableAmenity\(a\)/);
    expect(code('lib/search/public-listing-db.ts')).not.toMatch(/ in AMENITY_FIELD_MAP/);
    expect(code('app/components/SearchChips.tsx')).toMatch(/if \(!isSearchableAmenity\(a\)\) continue;/);
  });
});
