/// <reference types="jest" />
/**
 * Schools and Education on the neighborhood guides (Master 21.12, 21.11, 23.10).
 *
 * Owner instruction, Maya Allan, 2026-10-30: a school may be mentioned, but only as a plain fact with no reference to who it
 * is for. This test is the standing gate for that rule:
 *   - the facts come from one dated public record (data/neighborhood-schools.json); each display string is re-derived here
 *     from the source string recorded beside it, and the source category, type and data source of every record are checked;
 *   - every guide gets the same section, the same wording, the same presentation and the same selection rule (every record
 *     with the guide's ZIP codes, none omitted), so no school is chosen, ordered or left out for any other reason; where the
 *     record has no school for a guide's ZIP codes the section is absent, never an empty notice;
 *   - the fixed wording has no ranking, quality, proximity, zoning, audience, familial or protected-class word;
 *   - school names that contain a word about people are an explicit, owner-visible list: a new one fails until it is accepted;
 *   - school wording appears in the guide pages only inside the governed section.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NeighborhoodSchools from '@/app/components/neighborhoods/NeighborhoodSchools';
import { DOE_SCHOOL_SEARCH_URL, SCHOOL_SOURCE, schoolListRetrievedLabel, schoolRecordsUpdatedLabel, schoolsForZipCodes } from '@/lib/neighborhoods/schools';

const ROOT = path.resolve(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const generator = require(path.join(ROOT, 'scripts/refresh-neighborhood-schools.js')) as {
  formatName: (s: string) => string;
  formatAddress: (s: string) => string;
  parseFactype: (s: string) => { level: string; sector: string };
  ADDRESS_WORD_FIXES: Record<string, string>;
};

type FileRecord = {
  id: string;
  name: string;
  address: string;
  level: string;
  sector: string;
  sourceName: string;
  sourceAddress: string;
  sourceSubgroup: string;
  sourceFactype: string;
  sourceDatasource: string;
};
const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/neighborhood-schools.json'), 'utf8')) as {
  source: Record<string, string | number | Record<string, number>>;
  zips: Record<string, FileRecord[]>;
};

const GUIDE_FILES = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island'].map((b) => `data/${b}-neighborhoods.json`);
const guides: Array<{ slug: string; zipCodes: string[] }> = GUIDE_FILES.flatMap((f) => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  return (Array.isArray(j) ? j : j.neighborhoods) as Array<{ slug: string; zipCodes: string[] }>;
});

const all = Object.values(file.zips).flat();
const SUBGROUPS = ['PUBLIC K-12 SCHOOLS', 'CHARTER K-12 SCHOOLS', 'PUBLIC AND PRIVATE SPECIAL EDUCATION SCHOOLS'];
const LEVELS = ['Elementary', 'Middle', 'High', 'K-8', 'Secondary', 'K-12', 'Ungraded'];

// Guides whose ZIP codes have no school in the record. The section is absent on these (never an empty notice); a change to this list is visible.
const GUIDES_WITHOUT_SCHOOLS = ['midtown-west', 'nolita', 'soho'];

const plain = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();

// Independent re-derivation: same letters and digits as the source, whatever the capitalisation, leading zeros, ordinal suffix,
// "The" filed at the end ("..., THE"), or the one documented source misspelling in the address.
const nameKey = (s: string) => s.toUpperCase().replace(/, THE$/, '').replace(/^THE /, '').replace(/\b0+(?=\d)/g, '').replace(/\s+/g, ' ');
const addressKey = (s: string) =>
  s
    .toUpperCase()
    .split(' ')
    .map((w) => generator.ADDRESS_WORD_FIXES[w] || w)
    .join(' ')
    .replace(/(?<=\d)(?:ST|ND|RD|TH)\b/g, '');

describe('data/neighborhood-schools.json: one dated public record, nothing hand-edited', () => {
  it('names its source, dates and counts, and is not stale', () => {
    const s = SCHOOL_SOURCE;
    expect(s.datasetId).toBe('ji82-xba5');
    expect(s.publisher).toBe('NYC Department of City Planning');
    expect(s.dataset).toBe('Facilities Database');
    expect(s.recordsUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Date.parse(s.recordsUpdated)).toBeLessThanOrEqual(Date.parse(s.retrieved));
    expect(Date.parse(s.retrieved)).toBeLessThanOrEqual(Date.now());
    expect(file.source.selectionRule).toMatch(/none omitted/);
    expect(schoolRecordsUpdatedLabel()).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    expect(schoolListRetrievedLabel()).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    // Freshness gate (Master 23.10 as amended): a list older than 13 months fails until `node scripts/refresh-neighborhood-schools.js` is run.
    const ageDays = (Date.now() - Date.parse(s.retrieved)) / 86_400_000;
    expect({ retrieved: s.retrieved, olderThan400Days: ageDays > 400 }).toEqual({ retrieved: s.retrieved, olderThan400Days: false });
  });

  it('the recorded counts equal what the file holds (the generator stops if it cannot place a returned record)', () => {
    expect(file.source.recordCount).toBe(all.length);
    const bySubgroup: Record<string, number> = {};
    for (const r of all) bySubgroup[r.sourceSubgroup] = (bySubgroup[r.sourceSubgroup] || 0) + 1;
    expect(file.source.bySubgroup).toEqual(bySubgroup);
    expect(Object.keys(bySubgroup).sort()).toEqual([...SUBGROUPS].sort());
  });

  it('every record is complete, from the Department of Education site data, and classified exactly as its source type says', () => {
    expect(all.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const rows of Object.values(file.zips)) {
      for (const s of rows) {
        expect(s.id).toMatch(/^[0-9a-f]{32}$/);
        expect(ids.has(s.id)).toBe(false);
        ids.add(s.id);
        expect(s.name.length).toBeGreaterThan(0);
        expect(SUBGROUPS).toContain(s.sourceSubgroup);
        // not the State Education Department institution records, not the NYCHA community-center record
        expect(s.sourceDatasource).toBe('doe_lcgms');
        const parsed = generator.parseFactype(s.sourceFactype);
        expect({ level: s.level, sector: s.sector }).toEqual(parsed);
        expect(LEVELS).toContain(s.level);
        // a source record with no address stays on the list, with no address
        expect(s.address === '').toBe(s.sourceAddress === '');
        expect(s.sourceAddress).not.toMatch(/-(?:RM|FL|BLDG|STE)\b|#\d|-\d+(?:ST|ND|RD|TH) FL/);
      }
    }
  });

  it('every ZIP code the guides list has an entry, and every entry is used by a guide', () => {
    const used = new Set(guides.flatMap((g) => g.zipCodes));
    expect([...used].filter((z) => !(z in file.zips)).sort()).toEqual([]);
    expect(Object.keys(file.zips).filter((z) => !used.has(z)).sort()).toEqual([]);
    for (const z of Object.keys(file.zips)) expect(z).toMatch(/^\d{5}$/);
  });

  it('each display name and address is the recorded source string, only re-cased (no word added, dropped or changed)', () => {
    const drift = all.flatMap((s) => [
      ...(nameKey(s.name) === nameKey(s.sourceName) ? [] : [`name: ${s.sourceName} -> ${s.name}`]),
      ...(addressKey(s.address) === addressKey(s.sourceAddress) ? [] : [`address: ${s.sourceAddress} -> ${s.address}`]),
    ]);
    expect(drift).toEqual([]);
  });

  it('display is properly cased: no all-capitals name, ordinal suffixes present and correct', () => {
    const shouting = all.filter((s) => s.name.length > 8 && s.name === s.name.toUpperCase() && /[A-Z]{4}/.test(s.name)).map((s) => s.name);
    expect(shouting).toEqual([]);
    const missingOrdinal = all.filter((s) => /(?<!^)\b\d+ (?:Street|Avenue|Place|Road|Drive|Lane|Court|Terrace|Boulevard|Parkway|Way|Row)\b/.test(s.address.replace(/^\d+(?:-\d+)? /, ''))).map((s) => s.address);
    expect(missingOrdinal).toEqual([]);
    const wrong = all.flatMap((s) =>
      [...s.address.matchAll(/(\d+)(st|nd|rd|th)\b/g)]
        .filter(([, n, suf]) => {
          const v = Number(n);
          const want = v % 100 >= 11 && v % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[v % 10] || 'th';
          return suf !== want;
        })
        .map(() => s.address),
    );
    expect(wrong).toEqual([]);
  });

  it('the formatter keeps its documented behaviour', () => {
    expect(generator.formatName('P.S. 003 CHARRETTE SCHOOL')).toBe('P.S. 3 Charrette School');
    expect(generator.formatName('P.S. 242 - THE YOUNG DIPLOMATS MAGNET ACADEMY')).toBe('P.S. 242 - The Young Diplomats Magnet Academy');
    expect(generator.formatName("P.S. 372 -THE CHILDREN'S SCHOOL")).toBe("P.S. 372 -The Children's School");
    expect(generator.formatName('FIORELLO H. LAGUARDIA HIGH SCHOOL OF MUSIC & ART AND PERFORMING ARTS')).toBe('Fiorello H. LaGuardia High School of Music & Art and Performing Arts');
    expect(generator.formatName('THE 30TH AVENUE SCHOOL (G&T CITYWIDE)')).toBe('The 30th Avenue School (G&T Citywide)');
    expect(generator.formatName('P.S./I.S. 078Q')).toBe('P.S./I.S. 78Q');
    expect(generator.formatName('PAVE ACADEMY CHARTER SCHOOL')).toBe('PAVE Academy Charter School');
    expect(generator.formatName('NYC ISCHOOL')).toBe('NYC iSchool');
    expect(generator.formatName('SCHOOL OF EARTH EXPLORATION AND DISCOVERY HARLEM (SEED HARLEM)')).toBe('School of Earth Exploration and Discovery Harlem (SEED Harlem)');
    expect(generator.formatName('URBAN ASSEMBLY SCHOOL OF BUSINESS FOR YOUNG WOMEN, THE')).toBe('The Urban Assembly School of Business for Young Women');
    expect(generator.formatAddress('116 WEST 11 STREET')).toBe('116 West 11th Street');
    expect(generator.formatAddress('185 1 AVENUE')).toBe('185 1st Avenue');
    expect(generator.formatAddress('240 2 AVENUE')).toBe('240 2nd Avenue');
    expect(generator.formatAddress('28-37 29 STREET')).toBe('28-37 29th Street');
    expect(generator.formatAddress('40 IRVING PLACE')).toBe('40 Irving Place');
    expect(generator.formatAddress('100 WEST 112 STREET')).toBe('100 West 112th Street');
    expect(generator.formatAddress('100 WEST 113 STREET')).toBe('100 West 113th Street');
    expect(generator.formatAddress('100 WEST 122 STREET')).toBe('100 West 122nd Street');
    expect(generator.formatAddress('285 DELANCY STREET')).toBe('285 Delancey Street');
    expect(generator.parseFactype('UNGRADED SCHOOL - CHARTER, SPECIAL EDUCATION')).toEqual({ level: 'Ungraded', sector: 'charter' });
    expect(() => generator.parseFactype('APPROVED PRIVATE SCHOOLS FOR SWD')).toThrow();
  });

  it('within a ZIP code the order is by name and no school is listed twice', () => {
    for (const rows of Object.values(file.zips)) {
      const names = rows.map((r) => `${r.name}|${r.address}`);
      expect(new Set(names).size).toBe(names.length);
      const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }) || a.address.localeCompare(b.address, 'en', { numeric: true }));
      expect(rows.map((r) => r.id)).toEqual(sorted.map((r) => r.id));
    }
  });
});

describe('school names that contain a word about people are an explicit, owner-visible list', () => {
  // Owner instruction 2026-10-30: "remove all word of families and children". That was about wording Mallan writes. A school's name is the
  // record's proper noun, printed as the record has it. This is the list of names the guard has seen; a name that is not on it fails the
  // test until the owner accepts it (add it here) or the record is excluded. Pending the owner's decision at merge.
  const PEOPLE_WORDS = /\b(?:famil(?:y|ies)|child(?:ren)?(?:['’]s)?|kids?|toddlers?|bab(?:y|ies)|infants?|parents?|teen(?:s|agers?)?|young|youth|seniors?|couples?|married|singles|men(?:['’]s)?|women(?:['’]s)?|girls?|boys?)\b/i;
  const ACCEPTED_NAMES_WITH_PEOPLE_WORDS: string[] = [
    "Beginning With Children Charter School II",
    "Boys Preparatory Charter School of New York",
    "Bronx Global Learning Institute for Girls Charter School",
    "Children's Aid College Preparatory Charter School",
    "Eagle Academy for Young Men",
    "Eagle Academy for Young Men II",
    "Eagle Academy for Young Men of Harlem",
    "Family Life Academy Charter School II",
    "Family Life Academy Charter School III",
    "Girls Preparatory Charter School of the Bronx",
    "Girls Preparatory Charter School of the Bronx II",
    "Harlem Children's Zone Promise Academy Charter School",
    "Harlem Children's Zone Promise Academy II Charter School",
    "P.S. 23 The New Children's School",
    "P.S. 242 - The Young Diplomats Magnet Academy",
    "P.S. 333 Manhattan School for Children",
    "P.S. 372 -The Children's School",
    "P.S. Q023 @ Queens Children Center",
    "TAG Young Scholars",
    "The Children's Lab School",
    "The Children's Workshop School",
    "The Eagle Academy for Young Men of Staten Island",
    "The Urban Assembly School of Business for Young Women",
    "The Young Women's Leadership School of Staten Island",
    "Uncommon Excellence Boys Charter School NYC",
    "Uncommon Excellence Girls Charter School NYC",
    "Urban Assembly Institute of Math and Science for Young Women",
    "Young Leaders Elementary School",
    "Young Voices Academy of the Bronx",
    "Young Women's Leadership School",
    "Young Women's Leadership School of Brooklyn",
    "Young Women's Leadership School, Astoria",
  ];

  it('matches the list the owner has been shown', () => {
    const found = [...new Set(all.filter((s) => PEOPLE_WORDS.test(s.name)).map((s) => s.name))].sort();
    expect(found).toEqual([...ACCEPTED_NAMES_WITH_PEOPLE_WORDS].sort());
  });
});

describe('the Schools and Education section, rendered for each of the guides', () => {
  const EXPECTED_NOTE = 'This is a list by ZIP code, not by attendance zone. For schools by address, use the NYC Department of Education school search.';
  // Words that would turn a fact list into a recommendation, a proximity claim, a zoning claim or a statement about who it is for.
  const BANNED_IN_FIXED_WORDING: Array<[string, RegExp]> = [
    ['ranking/quality', /\b(?:best|top|great|greatest|good|better|excellent|highly|rated|ratings?|ranked|ranking|rankings|premier|prestigious|desirable|sought|popular|quality|strong|outstanding|leading|elite|exclusive|reputation|reputable|well-regarded|ideal|perfect|improv\w+|scores?|graduation|gifted|selective|competitive)\b/i],
    ['proximity/convenience', /\b(?:near|nearby|nearest|close|closest|closer|proximity|convenient|convenience|access|steps|walk|walking|minutes|commute|surrounded|around|distance|blocks?|within)\b/i],
    ['zoning/district', /\b(?:zone|zones|zoning|district|districts|catchment|feeder|enrolment|enrollment|admission|admissions|waitlist|demand)\b/i],
    ['audience/familial', /\b(?:famil(?:y|ies)|child(?:ren)?(?:['’]s)?|kids?|students?|parents?|teens?|young|youth|couples?|singles?|\w*buyers?|renters?|residents?|neighbors?|community|households?|school-age|girls?|boys?|men|women)\b/i],
    ['safety/steering', /\b(?:safe|safer|safest|safety|crime|dangerous|gentrif\w+|up-and-coming|affluent|wealth\w*|working[- ]class|gritty|rough|transitional|upscale|trendy|hip)\b/i],
    ['protected class', /\b(?:diverse|diversity|multicultural|immigrants?|ethnic\w*|religio\w*|catholic|jewish|christian|islamic|parochial|synagogues?|mosques?)\b/i],
  ];

  const render = (zipCodes: string[]) => renderToStaticMarkup(createElement(NeighborhoodSchools, { zipCodes }));
  const withSchools = guides.filter((g) => schoolsForZipCodes(g.zipCodes).length > 0);
  const withoutSchools = guides.filter((g) => schoolsForZipCodes(g.zipCodes).length === 0);

  it('is present, with the single heading "Schools and Education", on every guide that has a school in the record, and absent (not empty) on the rest', () => {
    expect(guides.length).toBe(59);
    expect(withoutSchools.map((g) => g.slug).sort()).toEqual(GUIDES_WITHOUT_SCHOOLS);
    for (const g of withoutSchools) expect(render(g.zipCodes)).toBe('');
    for (const g of withSchools) {
      const html = render(g.zipCodes);
      expect(html.match(/<h2[ >]/g)).toHaveLength(1);
      expect(html).toContain('>Schools and Education</h2>');
    }
  });

  it("lists exactly the records for the guide's ZIP codes: the stated count equals the rows, every row is in the data, none omitted, always in full", () => {
    for (const g of withSchools) {
      const html = render(g.zipCodes);
      const expected = schoolsForZipCodes(g.zipCodes);
      const rows = [...html.matchAll(/<tr[^>]*><th scope="row"[^>]*>(.*?)<\/th><td[^>]*>(.*?)<\/td>/g)].map((m) => [plain(m[1]), plain(m[2])]);
      expect(rows).toEqual(expected.map((s) => [s.name, s.address ? `${s.address}, ${s.zip}` : `Address not listed, ${s.zip}`]));
      const lead = plain(html).match(/This list shows (\d+) public and charter schools? with an address in/);
      expect(lead).not.toBeNull();
      expect(Number(lead![1])).toBe(expected.length);
      // one presentation for every guide: never collapsed, never cut
      expect(html).not.toContain('<details');
    }
  });

  it('selects from the file by ZIP code only: the count for a guide equals the number of records in its ZIP codes', () => {
    for (const g of guides) {
      const n = [...new Set(g.zipCodes)].reduce((sum, z) => sum + (file.zips[z]?.length ?? 0), 0);
      const unique = new Set(g.zipCodes.flatMap((z) => (file.zips[z] ?? []).map((r) => r.id))).size;
      expect(schoolsForZipCodes(g.zipCodes)).toHaveLength(unique);
      expect(unique).toBeLessThanOrEqual(n);
    }
  });

  it('uses the same wording, the same structure and the same rule on every guide', () => {
    const fixedWording = (zipCodes: string[]) =>
      plain(render(zipCodes).replace(/<tbody>.*<\/tbody>/s, ' '))
        .replace(/ZIP codes? \d{5}(?:(?:, and |, | and )\d{5})*/g, 'ZIP X')
        .replace(/\b\d+ (?=public and charter)/g, 'N ')
        .replace(/(public and charter) schools?\b/g, '$1 school(s)');
    expect(new Set(withSchools.map((g) => fixedWording(g.zipCodes))).size).toBe(1);
    const structure = (zipCodes: string[]) => render(zipCodes).replace(/<tbody>.*<\/tbody>/s, '<tbody/>').replace(/ZIP codes? \d{5}(?:(?:, and |, | and )\d{5})*/g, 'ZIP X').replace(/\b\d+ (?=public and charter)/g, 'N ').replace(/(public and charter) schools?\b/g, '$1 school(s)');
    expect(new Set(withSchools.map((g) => structure(g.zipCodes))).size).toBe(1);
  });

  it('has no ranking, quality, proximity, zoning, audience, familial, safety or protected-class word in its fixed wording', () => {
    const offenders: string[] = [];
    for (const g of withSchools) {
      const fixed = plain(render(g.zipCodes).replace(/<tbody>.*<\/tbody>/s, ' ')).replace(EXPECTED_NOTE, ' ');
      for (const [label, re] of BANNED_IN_FIXED_WORDING) {
        const m = fixed.match(re);
        if (m) offenders.push(`${g.slug} ${label}: "${m[0]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('says it is a list by ZIP code and sends a reader who needs schools by address to the official search', () => {
    for (const g of withSchools) {
      const html = render(g.zipCodes);
      expect(plain(html)).toContain(EXPECTED_NOTE);
      const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[0]);
      expect(links).toHaveLength(1);
      expect(links[0]).toContain('href="https://schoolsearch.schools.nyc/"');
      expect(links[0]).toContain('rel="noopener noreferrer"');
    }
    expect(DOE_SCHOOL_SEARCH_URL).toBe('https://schoolsearch.schools.nyc/');
  });

  it('describes what it includes and what it leaves out, and names its source and both dates', () => {
    const text = plain(render(withSchools[0].zipCodes));
    expect(text).toContain(`Source: NYC Department of City Planning Facilities Database, dataset updated ${schoolRecordsUpdatedLabel()}; list taken ${schoolListRetrievedLabel()}.`);
    expect(text).toContain('Included: public schools and charter schools that the database records from NYC Department of Education site data.');
    expect(text).toContain('Not included: private schools, and charter schools that have no NYC Department of Education site record in the database.');
  });

  it('shows the same four columns, with no per-school judgement column', () => {
    for (const g of withSchools) {
      const headers = [...render(g.zipCodes).matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((m) => m[1]);
      expect(headers).toEqual(['School', 'Address', 'Level', 'Type']);
    }
  });
});

describe('school wording appears in a guide only inside the governed section', () => {
  const schoolWordingIn = (files: string[]) =>
    files.filter((f) => /school/i.test(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/NeighborhoodSchools|neighborhood-schools/g, '')));

  it('no guide page, component or helper other than the section and its data module mentions a school', () => {
    const dirs: Array<[string, (f: string) => boolean]> = [
      ['app/components/neighborhoods', (f) => f.endsWith('.tsx') && f !== 'NeighborhoodSchools.tsx'],
      ['lib/neighborhoods', (f) => f.endsWith('.ts') && f !== 'schools.ts'],
    ];
    const files = [
      ...dirs.flatMap(([d, keep]) => fs.readdirSync(path.join(ROOT, d)).filter(keep).map((f) => `${d}/${f}`)),
      ...['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island'].map((b) => `app/${b}/[neighborhood]/page.tsx`),
      'lib/types/neighborhood.ts',
    ];
    expect(schoolWordingIn(files)).toEqual([]);
  });

  it('every guide page renders the section unconditionally, once, from the guide\'s own ZIP codes', () => {
    for (const f of ['app/manhattan/[neighborhood]/page.tsx', 'app/components/neighborhoods/BoroughDetailPage.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      // on a line of its own, directly inside <main>: not wrapped in a condition, not commented out
      expect(src.match(/^[ \t]*<NeighborhoodSchools zipCodes=\{n\.zipCodes\} \/>[ \t\r]*$/gm)).toHaveLength(1);
      expect(src.match(/NeighborhoodSchools/g)).toHaveLength(3); // import (two mentions) and the one use
      expect(src.indexOf('<NeighborhoodSchools')).toBeLessThan(src.indexOf('<NeighborhoodCTASection'));
      expect(src.indexOf('<main>')).toBeLessThan(src.indexOf('<NeighborhoodSchools'));
      expect(src.indexOf('<NeighborhoodSchools')).toBeLessThan(src.indexOf('</main>'));
    }
    for (const b of ['brooklyn', 'queens', 'bronx', 'staten-island']) {
      const src = fs.readFileSync(path.join(ROOT, `app/${b}/[neighborhood]/page.tsx`), 'utf8');
      expect(src).toMatch(/return \(\s*<BoroughDetailPage\s+neighborhood=\{n\}/);
    }
  });

  it('the guide records themselves carry no school wording', () => {
    const SCHOOLISH = /\b(?:schools?|elementary|kindergarten|charter|academy)\b|\bP\.?S\.?\s?\d+|\bPS\/IS\b/i;
    const offenders = guides.filter((g) => SCHOOLISH.test(JSON.stringify(g).replace(/Brooklyn Academy of Music|MoMA PS1/g, ''))).map((g) => g.slug);
    expect(offenders).toEqual([]);
  });
});
