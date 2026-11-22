/// <reference types="jest" />
/**
 * The public Doorman filter (key `doorman`; the VALUES it matches are the live Doorperson* members; Maya, 2026-11-22: the general name is Doorman) (Maya, 2026-11-20: "the public search needs to have those changes, please be careful on how you update").
 *
 * What live Cotality says (read 2026-11-20, every one of the 9,655 Active listings): who staffs the door is AttendanceType, a key inside
 * CustomProperty.CustomFields: DoorpersonFullTime / DoorpersonPartTime / DoorpersonYes (VideoDoorperson* is its own thing, and the CRM search keeps it its
 * own box). The public "Doorman" filter did not read it: it matched BuildingFeatures "Concierge", so against live data it missed 417 of the 515 doorperson
 * rentals and 3,345 of the 5,098 doorperson sales, and returned 28 rentals and 51 sales that have no doorperson at all.
 *
 * What the code and the public site show (found by the REBNY compliance gate and confirmed): AttendanceType is NOT a Property field ($select answers
 * HTTP 400), the listing sync reads Property fields only, and so no stored listing carries it (the public listings API served 0 of 400 with it). A filter
 * that reads AttendanceType from stored listings would answer "nothing" and say nothing. So, as with No Fee (Maya, 2026-10-09: "Disable until a live field is
 * found"), the filter is DISABLED with a reason until the sync carries the field, and the old rule keeps its own, honestly named, Concierge filter.
 *
 *  1. The Doorperson entry names the live field and the live members, and is disabled with a reason.
 *  2. The reason is true: the sync does not read AttendanceType. When it starts to, this fails until someone enables the filter.
 *  3. Nothing applies it (stored-listing search, projection, chips); the panel shows it disabled; a typed phrase is read, reported and filters nothing.
 *  4. Concierge is exactly the old rule.
 *  5. Enabled (simulated), it matches whole members: a substring test takes "VideoDoorpersonFullTime" for "DoorpersonFullTime".
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SearchFilterPanel from '@/app/components/SearchFilterPanel';
import { buildChips } from '@/app/components/SearchChips';
import { ATTENDANCE_TYPE_MEMBERS } from '@/lib/idx/attendance-type';
import { parseNaturalLanguageSearch } from '@/lib/search/natural-language-parser';
import { extractProjectionAmenityKeys } from '@/lib/search/listing-search-projection';
import { applyPublicListingPostFilters } from '@/lib/search/public-listing-db';
import { AMENITY_FIELD_MAP, STORED_LISTINGS_CARRY_ATTENDANCE_TYPE, amenitiesUrlValue, isSearchableAmenity, searchableAmenities, unavailableAmenities, type SearchFilters } from '@/lib/search/types';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
/** the file's code without its comments */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const live = JSON.parse(read('data/cotality-enums.live.json'));

describe('the Doorman filter names the live field and the live members, and is disabled with a reason', () => {
  it('names AttendanceType and the three Doorperson members, says Doorman, and carries a reason', () => {
    const entry = AMENITY_FIELD_MAP.doorman;
    expect(entry.field).toBe('AttendanceType');
    expect(entry.values).toEqual(['DoorpersonFullTime', 'DoorpersonPartTime', 'DoorpersonYes']);
    expect(entry.label).toBe('Doorman');
    expect(entry.group).toBe('Lobby & Services');
    expect(entry.unavailable).toMatch(/^Not searchable yet\./);
    expect(isSearchableAmenity('doorman')).toBe(false);
  });

  it('every member it names is a live AttendanceType member, and none is a video member', () => {
    for (const v of AMENITY_FIELD_MAP.doorman.values) expect(ATTENDANCE_TYPE_MEMBERS).toContain(v);
    expect(Object.keys(live.search.custom_fields.keys.AttendanceType.observed.sale)).toEqual(expect.arrayContaining(['DoorpersonFullTime', 'DoorpersonYes']));
    expect(AMENITY_FIELD_MAP.doorman.values.some((v) => /video/i.test(v))).toBe(false);
  });
});

describe('the listing sync carries AttendanceType; the filter is enabled only when the switch says every stored Active listing has it', () => {
  it('the filter is searchable exactly when STORED_LISTINGS_CARRY_ATTENDANCE_TYPE is true, and carries its reason exactly when it is not', () => {
    expect(isSearchableAmenity('doorman')).toBe(STORED_LISTINGS_CARRY_ATTENDANCE_TYPE);
    expect(Boolean(AMENITY_FIELD_MAP.doorman.unavailable)).toBe(!STORED_LISTINGS_CARRY_ATTENDANCE_TYPE);
  });

  it('the sync, the CRM reset route and the nightly reconcile look AttendanceType up from CustomProperty', () => {
    expect(code('lib/idx/sync.ts')).toMatch(/fetchAttendanceTypes\(/);
    expect(code('app/api/crm/listings/reset-sync/route.ts')).toMatch(/fetchAttendanceTypes\(/);
    expect(code('app/api/cron/feed-reconcile/route.ts')).toMatch(/fetchAttendanceTypes\(/);
  });

  it('AttendanceType is still never asked of Property: it is a CustomProperty.CustomFields key, and a Property $select for it answers HTTP 400', () => {
    expect(code('lib/idx/trestle-mapper.ts')).not.toMatch(/AttendanceType/);
  });
});

describe('nothing applies it', () => {
  const rows = [
    { id: 'full', attendanceType: 'DoorpersonFullTime' },
    { id: 'concierge-feature', buildingFeatures: 'Concierge,FitnessCenter' },
    { id: 'plain' },
  ];
  const run = (query: string) => applyPublicListingPostFilters(rows as never, new Map(), new URLSearchParams(query)).map((l) => l.id);

  it('amenities=doorman filters nothing and does not throw (it used to answer with the Concierge listings, which are a different fact)', () => {
    expect(run('amenities=doorman')).toEqual(['full', 'concierge-feature', 'plain']);
    expect(run('amenities=doorman,concierge')).toEqual(['concierge-feature']);
    expect(searchableAmenities(['doorman', 'concierge', 'gym'])).toEqual(['concierge', 'gym']);
  });

  it('the search projection never stores it, even for a listing that carries AttendanceType', () => {
    expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { AttendanceType: 'DoorpersonFullTime' } })).toBeNull();
  });

  it('no chip is shown for it, and a link that names it is told to the reader with the reason', () => {
    const chips = buildChips({ amenities: ['doorman', 'concierge'] } as unknown as SearchFilters, [], undefined);
    expect(chips.filter((c) => c.type === 'amenity').map((c) => c.label)).toEqual(['Concierge']);
    expect(unavailableAmenities(['doorman', 'concierge'])).toEqual([{ key: 'doorman', label: 'Doorman', reason: AMENITY_FIELD_MAP.doorman.unavailable }]);
  });

  it('the filter panel shows Doorman as a disabled box with its reason, offers Concierge, and says Doorperson nowhere', () => {
    const markup = renderToStaticMarkup(createElement(SearchFilterPanel, { isOpen: true, onClose: () => undefined, onApply: () => undefined, currentFilters: { amenities: ['doorman'] } as unknown as SearchFilters, activeTab: 'rent-residential' }));
    const tag = (markup.match(/<input\b[^>]*>/g) ?? []).filter((t) => t.includes('aria-describedby="amenity-doorman-unavailable"'));
    expect(tag).toHaveLength(1);
    expect(tag[0]).toMatch(/\bdisabled\b/);
    expect(tag[0]).not.toMatch(/\bchecked\b/);
    expect(markup).toContain('id="amenity-doorman-unavailable"');
    expect(markup).toContain(AMENITY_FIELD_MAP.doorman.unavailable as string);
    expect(markup).toContain('Doorman');
    expect(markup).toContain('Concierge');
    expect(markup).not.toMatch(/Doorperson/);
  });

  it.each(['doorman', 'doorperson', 'door person', 'Doorperson'])('the typed word %j is read, removed from the text, filters nothing, and the reader is told why', (word) => {
    const parsed = parseNaturalLanguageSearch(`2br chelsea ${word}`);
    expect(parsed.filters.amenities).toBeUndefined();
    expect(parsed.remainingQuery).toBe('');
    expect(parsed.unavailable).toHaveLength(1);
    expect(parsed.unavailable[0].key).toBe('doorman');
    expect(parsed.unavailable[0].reason).toBe(AMENITY_FIELD_MAP.doorman.unavailable);
  });

  it('the home page suggests nothing that depends on it', () => {
    const examples = [...(/const EXAMPLE_QUERIES = \[([\s\S]*?)\];/.exec(read('app/components/HeroSearch.tsx'))?.[1] ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(examples.length).toBeGreaterThanOrEqual(6);
    for (const example of examples) expect(example).not.toMatch(/door\s?(man|person)/i);
  });

  it('the listing page and the building page say Doorman where they name the amenity (the stored members stay Doorperson)', () => {
    const listing = code('app/listing/[...slug]/page.tsx');
    const building = code('lib/buildings/public-building-data.ts');
    for (const text of [listing, building]) {
      expect(text).toContain("SecurityGuard: 'Doorman'");
      expect(text).toContain("VirtualDoorman: 'Virtual Doorman'");
      expect(text).not.toMatch(/['"`](?:24hr |Virtual )?Doorperson['"`]/);
    }
    expect(listing).toContain("'24hr Doorman'");
    // the building page looks its icon up by the label text: a key that says anything else falls back to the default icon
    expect(code('app/building/page.tsx')).toContain("Doorman: (");
    expect(code('app/buildings/[slug]/page.tsx')).toContain("Doorman: '");
    expect(code('lib/idx/attendance-type.ts')).toContain("out.add('24hr Doorman')");
  });

  it('the listing side panel says Doorman where it names the amenity', () => {
    expect(read('app/components/ListingSidePanel.tsx')).not.toMatch(/Doorperson/);
  });
});

describe('the "not applied" notice survives the page rewriting its own URL (found by the REBNY gate; reproduced on production for No Fee at 390px, where the view switch right after load deleted the param)', () => {
  it('amenitiesUrlValue keeps a disabled filter the link names, after the filters a search applies, in link order', () => {
    expect(amenitiesUrlValue(undefined, 'no-fee')).toBe('no-fee');
    expect(amenitiesUrlValue(undefined, 'doorman')).toBe('doorman');
    expect(amenitiesUrlValue(['gym'], 'doorman,gym')).toBe('gym,doorman');
    expect(amenitiesUrlValue(['gym'], 'no-fee,doorman,gym')).toBe('gym,no-fee,doorman');
  });

  it('drops words that are not amenities, and writes nothing when there is nothing to write', () => {
    expect(amenitiesUrlValue(undefined, 'toString,constructor,nonsense')).toBeUndefined();
    expect(amenitiesUrlValue(undefined, '')).toBeUndefined();
    expect(amenitiesUrlValue(undefined, null)).toBeUndefined();
    expect(amenitiesUrlValue([], undefined)).toBeUndefined();
    expect(amenitiesUrlValue(['gym'], null)).toBe('gym');
  });

  it('the notice, built from the URL the page then holds, still names the filter', () => {
    const written = amenitiesUrlValue(undefined, 'doorman');
    expect(unavailableAmenities((written ?? '').split(',')).map((u) => u.label)).toEqual(['Doorman']);
  });

  it('the search page writes the amenities param through it, and does not write filters.amenities alone', () => {
    const page = code('app/search/page.tsx');
    expect(page).toMatch(/setOrDel\('amenities', amenitiesUrlValue\(filters\.amenities, resetting\.current \? null : params\.get\('amenities'\)\)\);/);
    expect(page).not.toMatch(/setOrDel\('amenities', filters\.amenities\?\.length/);
  });

  it('Reset Search clears the kept key too: it says so before the filters change, and the URL write consumes the flag (found by the gate: the stale link was written straight back)', () => {
    const page = code('app/search/page.tsx');
    expect(page).toMatch(/const resetting = useRef\(false\);/);
    expect(page).toMatch(/const clearFilters = useCallback\(\(\) => \{\s*resetting\.current = true;\s*setSearchQuery\(''\);/);
    expect(page).toMatch(/resetting\.current \? null : params\.get\('amenities'\)\)\);\s*resetting\.current = false;/);
  });

  it.each(['app/components/HeroSearch.tsx', 'app/search/page.tsx'])('%s sends "door person" to the parser exactly when the parser can read it', (file) => {
    const signals = /const nlSignals = (\/.*\/i);/.exec(code(file))?.[1];
    expect(signals).toBeDefined();
    const re = new Function(`return ${signals}`)() as RegExp;
    for (const phrase of ['door person', 'Door Person', 'doorperson', 'doorman']) expect(re.test(phrase)).toBe(true);
    // the parser reads "door person" with ONE space; anything else must stay a plain address search, not a query the parser cannot read
    for (const phrase of ['door  person', 'outdoor person lane', 'door-person']) expect(re.test(phrase)).toBe(false);
    // and what the signals send there, the parser reads
    for (const phrase of ['2br chelsea door person', '2br chelsea Doorperson']) expect(parseNaturalLanguageSearch(phrase).unavailable.map((u) => u.key)).toEqual(['doorman']);
  });
});

describe('Concierge is exactly the old rule', () => {
  it('names BuildingFeatures "Concierge" (a live member) and is searchable', () => {
    expect(AMENITY_FIELD_MAP.concierge).toEqual({ field: 'BuildingFeatures', values: ['Concierge'], label: 'Concierge', group: 'Lobby & Services' });
    expect(live.enums.BuildingFeatures).toContain('Concierge');
    expect(isSearchableAmenity('concierge')).toBe(true);
  });

  it('keeps the listings that carry the Concierge building feature, in the stored-listing search and in the projection', () => {
    const rows = [{ id: 'a', buildingFeatures: 'Concierge,Elevators' }, { id: 'b', buildingFeatures: 'Elevators' }, { id: 'c' }];
    expect(applyPublicListingPostFilters(rows as never, new Map(), new URLSearchParams('amenities=concierge')).map((l) => l.id)).toEqual(['a']);
    expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { BuildingFeatures: 'Concierge' } })).toEqual(['concierge']);
  });

  it('a typed "concierge" is the Concierge filter', () => {
    expect(parseNaturalLanguageSearch('2br chelsea concierge').filters.amenities).toEqual(['concierge']);
  });
});

describe('when the Doorperson filter is enabled (simulated), it matches whole AttendanceType members', () => {
  const rows = [
    { id: 'full', attendanceType: 'DoorpersonFullTime' },
    { id: 'part-in-list', attendanceType: 'LobbyAttendantFullTime,DoorpersonPartTime' },
    { id: 'yes', attendanceType: 'DoorpersonYes' },
    { id: 'from-features' },
    { id: 'video', attendanceType: 'VideoDoorpersonFullTime' },
    { id: 'video-notice-spelling', attendanceType: 'VideoDoorPersonFullTime' },
    { id: 'concierge-attendance', attendanceType: 'ConciergeFullTime' },
    { id: 'concierge-feature', buildingFeatures: 'Concierge,FitnessCenter' },
    { id: 'none', attendanceType: 'None' },
    { id: 'retired-spelling', attendanceType: 'DoormanFullTime' },
    { id: 'blank' },
  ];
  const features = new Map<string, Record<string, unknown>>([['from-features', { AttendanceType: ['DoorpersonYes'] }]]);
  const withFilterEnabled = (fn: () => void) => {
    const entry = AMENITY_FIELD_MAP.doorman;
    const saved = { ...entry };
    try {
      delete entry.unavailable;
      fn();
    } finally {
      Object.assign(entry, saved);
    }
  };

  it('the stored-listing search keeps the Doorperson members and nothing else', () => {
    withFilterEnabled(() => {
      const kept = applyPublicListingPostFilters(rows as never, features, new URLSearchParams('amenities=doorman')).map((l) => l.id);
      expect(kept).toEqual(['full', 'part-in-list', 'yes', 'from-features']);
    });
  });

  it('the projection stores doorman for a Doorperson member, and not for a video doorperson, a concierge, None or the retired spelling', () => {
    withFilterEnabled(() => {
      expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { AttendanceType: 'LobbyAttendantYes,DoorpersonPartTime' } })).toEqual(['doorman']);
      for (const AttendanceType of ['VideoDoorpersonYes', 'VideoDoorPersonFullTime', 'ConciergeFullTime', 'None', 'DoormanFullTime', 'VideoDoormanYes']) {
        expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { AttendanceType } })).toBeNull();
      }
    });
  });

  it('a typed doorperson becomes the filter, and the notice goes', () => {
    withFilterEnabled(() => {
      const parsed = parseNaturalLanguageSearch('2br chelsea doorperson');
      expect(parsed.filters.amenities).toEqual(['doorman']);
      expect(parsed.unavailable).toEqual([]);
    });
    expect(parseNaturalLanguageSearch('2br chelsea doorperson').filters.amenities).toBeUndefined();
  });
});
