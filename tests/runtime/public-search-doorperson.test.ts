/// <reference types="jest" />
/**
 * The public search follows live Cotality for the doorman (Maya, 2026-11-20: "the public search needs to have those changes, please be
 * careful on how you update").
 *
 * What live Cotality says (read 2026-11-20, every one of the 9,655 Active listings): the fact "a person staffs the door" is AttendanceType
 * (CustomProperty.CustomFields) = DoorpersonFullTime / DoorpersonPartTime / DoorpersonYes (VideoDoorperson* is its own thing, and the CRM search
 * keeps it its own box). The public "Doorman" filter did not read it: it matched BuildingFeatures "Concierge", so it missed 417 of the 515
 * doorperson rentals and 3,345 of the 5,098 doorperson sales, and returned 28 rentals and 51 sales that have no doorperson at all.
 *
 *  1. The filter reads AttendanceType and matches whole members. A substring test is wrong here: "DoorpersonFullTime" is inside
 *     "VideoDoorpersonFullTime".
 *  2. The old rule (BuildingFeatures "Concierge") keeps its own filter, so someone who types "concierge" still gets exactly what they asked for.
 *  3. The words a reader sees say Doorperson. "doorman" typed in the search box is still understood.
 *  4. The DB path and the search projection read the filter the same way (the projection says it keeps parity).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import SearchFilterPanel from '@/app/components/SearchFilterPanel';
import { buildChips } from '@/app/components/SearchChips';
import { ATTENDANCE_TYPE_MEMBERS } from '@/lib/idx/attendance-type';
import { parseNaturalLanguageSearch } from '@/lib/search/natural-language-parser';
import { extractProjectionAmenityKeys } from '@/lib/search/listing-search-projection';
import { applyPublicListingPostFilters } from '@/lib/search/public-listing-db';
import { AMENITY_FIELD_MAP, type SearchFilters } from '@/lib/search/types';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const live = JSON.parse(read('data/cotality-enums.live.json'));

describe('the Doorperson filter names the live field and the live members', () => {
  it('reads AttendanceType, the three Doorperson members, and says Doorperson', () => {
    expect(AMENITY_FIELD_MAP.doorman).toEqual({
      field: 'AttendanceType',
      values: ['DoorpersonFullTime', 'DoorpersonPartTime', 'DoorpersonYes'],
      label: 'Doorperson',
      group: 'Lobby & Services',
    });
  });

  it('every value it names is a live AttendanceType member', () => {
    for (const v of AMENITY_FIELD_MAP.doorman.values) expect(ATTENDANCE_TYPE_MEMBERS).toContain(v);
    const observed = Object.keys(live.search.custom_fields.keys.AttendanceType.observed.sale);
    expect(observed).toEqual(expect.arrayContaining(['DoorpersonFullTime', 'DoorpersonYes']));
  });

  it('the video doorperson is not in it (the CRM search keeps it its own box, and the listing page lists it as Virtual Doorperson)', () => {
    expect(AMENITY_FIELD_MAP.doorman.values.some((v) => /video/i.test(v))).toBe(false);
  });

  it('the old rule keeps its own Concierge filter, on the live BuildingFeatures member', () => {
    expect(AMENITY_FIELD_MAP.concierge).toEqual({ field: 'BuildingFeatures', values: ['Concierge'], label: 'Concierge', group: 'Lobby & Services' });
    expect(live.enums.BuildingFeatures).toContain('Concierge');
  });
});

describe('the stored-listing search matches whole AttendanceType members', () => {
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
  const run = (query: string) => applyPublicListingPostFilters(rows as never, features, new URLSearchParams(query)).map((l) => l.id);

  it('amenities=doorman keeps the listings with a Doorperson member, from the listing or from its stored features', () => {
    expect(run('amenities=doorman')).toEqual(['full', 'part-in-list', 'yes', 'from-features']);
  });

  it('it does not keep a video doorperson, a concierge, a lobby attendant, a Concierge building feature, None, a blank or the retired spelling', () => {
    const kept = run('amenities=doorman');
    for (const id of ['video', 'video-notice-spelling', 'concierge-attendance', 'concierge-feature', 'none', 'retired-spelling', 'blank']) expect(kept).not.toContain(id);
  });

  it('amenities=concierge keeps exactly what the old doorman filter kept: the Concierge building feature', () => {
    expect(run('amenities=concierge')).toEqual(['concierge-feature']);
  });

  it('the two filters together keep only a listing that satisfies both', () => {
    expect(run('amenities=doorman,concierge')).toEqual([]);
  });
});

describe('the search projection reads the filter the same way', () => {
  it('stores doorman for a Doorperson member, in a list or alone', () => {
    expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { AttendanceType: 'DoorpersonFullTime' } })).toEqual(['doorman']);
    expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { AttendanceType: 'LobbyAttendantYes,DoorpersonPartTime' } })).toEqual(['doorman']);
  });

  it('does not store doorman for a video doorperson, a concierge, None or the retired spelling', () => {
    for (const AttendanceType of ['VideoDoorpersonYes', 'VideoDoorPersonFullTime', 'ConciergeFullTime', 'None', 'DoormanFullTime', 'VideoDoormanYes']) {
      expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { AttendanceType } })).toBeNull();
    }
  });

  it('stores concierge, not doorman, for the Concierge building feature', () => {
    expect(extractProjectionAmenityKeys({ listing_id: 'X', features: { BuildingFeatures: 'Concierge' } })).toEqual(['concierge']);
  });
});

describe('typed words', () => {
  it.each(['doorperson', 'doorman', 'Doorperson building'])('%j is read as the Doorperson filter', (word) => {
    expect(parseNaturalLanguageSearch(`2br chelsea ${word}`).filters.amenities).toEqual(['doorman']);
  });

  it('"concierge" is read as the Concierge filter, not as a doorperson', () => {
    expect(parseNaturalLanguageSearch('2br chelsea concierge').filters.amenities).toEqual(['concierge']);
  });
});

describe('the words a reader sees', () => {
  it('the active-filter chip says Doorperson', () => {
    const chips = buildChips({ amenities: ['doorman', 'concierge'] } as unknown as SearchFilters, [], undefined);
    expect(chips.filter((c) => c.type === 'amenity').map((c) => c.label)).toEqual(['Doorperson', 'Concierge']);
  });

  it('the filter panel offers Doorperson and Concierge, and says Doorman nowhere', () => {
    const markup = renderToStaticMarkup(createElement(SearchFilterPanel, { isOpen: true, onClose: () => undefined, onApply: () => undefined, currentFilters: {}, activeTab: 'rent-residential' }));
    expect(markup).toContain('Doorperson');
    expect(markup).toContain('Concierge');
    expect(markup).not.toMatch(/Doorman/);
  });

  it('the listing side panel and the home-page example say Doorperson', () => {
    expect(read('app/components/ListingSidePanel.tsx')).not.toMatch(/Doorman/);
    expect(read('app/components/HeroSearch.tsx')).not.toMatch(/'2br UES doorman under 3M'/);
    expect(read('app/components/HeroSearch.tsx')).toContain("'2br UES doorperson under 3M'");
  });

  it('the home-page example is understood by the search box', () => {
    expect(parseNaturalLanguageSearch('2br UES doorperson under 3M').filters.amenities).toEqual(['doorman']);
  });
});
