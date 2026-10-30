/// <reference types="jest" />
/**
 * Schools and Education on the neighborhood guides (Master 21.12, 21.11, 23.10).
 *
 * Owner instruction, Maya Allan, 2026-10-30: a school may be mentioned, but only as a plain fact with no reference to who it
 * is for. This test is the standing gate for that rule:
 *   - the facts come from one dated public record (data/neighborhood-schools.json), and each display string is re-derived
 *     here from the source string recorded beside it, so a formatting slip cannot change a name or an address;
 *   - every guide gets the same section, the same wording and the same selection rule (every record with the guide's ZIP
 *     codes, none omitted), so no school is chosen, ordered or left out for any other reason;
 *   - the fixed wording has no ranking, quality, proximity, zoning, audience or familial word;
 *   - school wording appears in a guide only inside the governed section.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import NeighborhoodSchools from '@/app/components/neighborhoods/NeighborhoodSchools';
import { DOE_SCHOOL_SEARCH_URL, SCHOOL_SOURCE, schoolRecordsUpdatedLabel, schoolsForZipCodes } from '@/lib/neighborhoods/schools';

const ROOT = path.resolve(__dirname, '../..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const generator = require(path.join(ROOT, 'scripts/refresh-neighborhood-schools.js')) as {
  formatName: (s: string) => string;
  formatAddress: (s: string) => string;
};

type FileRecord = { id: string; name: string; address: string; level: string; sector: string; sourceName: string; sourceAddress: string };
const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/neighborhood-schools.json'), 'utf8')) as {
  source: Record<string, string>;
  zips: Record<string, FileRecord[]>;
};

const GUIDE_FILES = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island'].map((b) => `data/${b}-neighborhoods.json`);
const guides: Array<{ slug: string; zipCodes: string[] }> = GUIDE_FILES.flatMap((f) => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  return (Array.isArray(j) ? j : j.neighborhoods) as Array<{ slug: string; zipCodes: string[] }>;
});

const LEVELS = ['Elementary', 'Middle', 'High', 'K-8', 'Secondary', 'K-12', 'Ungraded', ''];
const all = Object.values(file.zips).flat();

const plain = (html: string) =>
  html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();

// Independent re-derivation: same letters and digits as the source, whatever the capitalisation, leading zeros or ordinal suffix.
const nameKey = (s: string) => s.toUpperCase().replace(/\b0+(?=\d)/g, '');
const addressKey = (s: string) => s.toUpperCase().replace(/(?<=\d)(?:ST|ND|RD|TH)\b/g, '');

describe('data/neighborhood-schools.json: one dated public record, nothing hand-edited', () => {
  it('names its source and dates', () => {
    expect(SCHOOL_SOURCE.datasetId).toBe('ji82-xba5');
    expect(SCHOOL_SOURCE.publisher).toBe('NYC Department of City Planning');
    expect(SCHOOL_SOURCE.dataset).toBe('Facilities Database');
    expect(SCHOOL_SOURCE.recordsUpdated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SCHOOL_SOURCE.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(schoolRecordsUpdatedLabel()).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    expect(file.source.selectionRule).toMatch(/none omitted/);
  });

  it('every record is complete, in scope and unique', () => {
    expect(all.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const [zip, rows] of Object.entries(file.zips)) {
      expect(zip).toMatch(/^\d{5}$/);
      for (const s of rows) {
        expect(s.id).toMatch(/^[0-9a-f]{32}$/);
        expect(ids.has(s.id)).toBe(false);
        ids.add(s.id);
        expect(s.name.length).toBeGreaterThan(0);
        expect(s.address.length).toBeGreaterThan(0);
        expect(['public', 'charter']).toContain(s.sector);
        expect(LEVELS).toContain(s.level);
        // State Education Department institution records (administrative addresses) are out of scope
        expect(s.sourceAddress).not.toMatch(/-(?:RM|FL|BLDG|STE)\b/);
      }
    }
  });

  it('each display name and address is the recorded source string, only re-cased (no word added, dropped or changed)', () => {
    const drift = all.flatMap((s) => [
      ...(nameKey(s.name) === nameKey(s.sourceName) ? [] : [`name: ${s.sourceName} -> ${s.name}`]),
      ...(addressKey(s.address) === addressKey(s.sourceAddress) ? [] : [`address: ${s.sourceAddress} -> ${s.address}`]),
    ]);
    expect(drift).toEqual([]);
  });

  it('numbered streets carry the right ordinal suffix', () => {
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
    expect(generator.formatName('FIORELLO H. LAGUARDIA HIGH SCHOOL OF MUSIC & ART AND PERFORMING ARTS')).toBe('Fiorello H. LaGuardia High School of Music & Art and Performing Arts');
    expect(generator.formatName('THE 30TH AVENUE SCHOOL (G&T CITYWIDE)')).toBe('The 30th Avenue School (G&T Citywide)');
    expect(generator.formatName('P.S./I.S. 078Q')).toBe('P.S./I.S. 78Q');
    expect(generator.formatAddress('116 WEST 11 STREET')).toBe('116 West 11th Street');
    expect(generator.formatAddress('185 1 AVENUE')).toBe('185 1st Avenue');
    expect(generator.formatAddress('240 2 AVENUE')).toBe('240 2nd Avenue');
    expect(generator.formatAddress('28-37 29 STREET')).toBe('28-37 29th Street');
    expect(generator.formatAddress('40 IRVING PLACE')).toBe('40 Irving Place');
    expect(generator.formatAddress('100 WEST 112 STREET')).toBe('100 West 112th Street');
    expect(generator.formatAddress('100 WEST 113 STREET')).toBe('100 West 113th Street');
    expect(generator.formatAddress('100 WEST 122 STREET')).toBe('100 West 122nd Street');
  });

  it('every ZIP code the guides list has an entry, and every entry is used by a guide', () => {
    const used = new Set(guides.flatMap((g) => g.zipCodes));
    expect([...used].filter((z) => !(z in file.zips)).sort()).toEqual([]);
    expect(Object.keys(file.zips).filter((z) => !used.has(z)).sort()).toEqual([]);
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

describe('the Schools and Education section, rendered for each of the guides', () => {
  const EXPECTED_NOTE = `This is a list by ZIP code, not by attendance zone. To find the school zoned for a specific address, use the NYC Department of Education school search.`;
  // Words that would turn a fact list into a recommendation, a proximity claim, a zoning claim or a statement about who it is for.
  const BANNED_IN_FIXED_WORDING: Array<[string, RegExp]> = [
    ['ranking/quality', /\b(?:best|top|great|greatest|good|better|excellent|highly|rated|ratings?|ranked|ranking|rankings|premier|prestigious|desirable|sought|popular|quality|strong|outstanding|leading|elite|exclusive|reputation|reputable|well-regarded)\b/i],
    ['proximity/convenience', /\b(?:near|nearby|nearest|close|closest|closer|proximity|convenient|convenience|access|steps|walk|walking|minutes|commute|surrounded|around)\b/i],
    ['zoning/district', /\b(?:zone|zones|zoning|district|districts|catchment|feeder|enrolment|enrollment|admission|admissions|waitlist|demand)\b/i],
    ['audience/familial', /\b(?:famil(?:y|ies)|child(?:ren)?(?:['’]s)?|kids?|students?|parents?|teens?|young|youth|couples?|singles?|buyers?|renters?|residents?|neighbors?|community)\b/i],
    ['protected class', /\b(?:diverse|diversity|ethnic\w*|religio\w*|catholic|jewish|christian|islamic|parochial|private)\b/i],
  ];

  const render = (zipCodes: string[]) => renderToStaticMarkup(createElement(NeighborhoodSchools, { zipCodes }));

  it('is present for every guide with the single heading "Schools and Education"', () => {
    expect(guides.length).toBe(59);
    for (const g of guides) {
      const html = render(g.zipCodes);
      expect(html.match(/<h2[ >]/g)).toHaveLength(1);
      expect(html).toContain('>Schools and Education</h2>');
    }
  });

  it('lists exactly the records for the guide\'s ZIP codes: the stated count equals the rows, every row is in the data, none omitted', () => {
    for (const g of guides) {
      const html = render(g.zipCodes);
      const expected = schoolsForZipCodes(g.zipCodes);
      const rows = [...html.matchAll(/<tr[^>]*><th scope="row"[^>]*>(.*?)<\/th><td[^>]*>(.*?)<\/td>/g)].map((m) => [plain(m[1]), plain(m[2])]);
      expect(rows).toEqual(expected.map((s) => [s.name, `${s.address}, ${s.zip}`]));
      const lead = plain(html).match(/lists (no|\d+) public (?:and|or) charter schools? with an address in/);
      expect(lead).not.toBeNull();
      expect(lead![1] === 'no' ? 0 : Number(lead![1])).toBe(expected.length);
      // a long list is collapsed, never cut: the full list is in the page
      expect(html.includes('<details')).toBe(expected.length > 15);
    }
  });

  it('uses the same wording and the same rule on every guide', () => {
    const fixedWording = (zipCodes: string[]) =>
      plain(render(zipCodes).replace(/<tbody>.*<\/tbody>/s, ' '))
        .replace(/ZIP codes? \d{5}(?:(?:, and |, | and )\d{5})*/g, 'ZIP X')
        .replace(/\b\d+ (?=public and charter)/g, 'N ')
        .replace(/Show all \d+ schools/g, 'Show all N schools')
        .replace(/(public and charter) schools?\b/g, '$1 school(s)');
    // three variants at most: a list, a collapsed list, and "no school found"
    expect(new Set(guides.map((g) => fixedWording(g.zipCodes))).size).toBeLessThanOrEqual(3);
  });

  it('has no ranking, quality, proximity, zoning, audience, familial or protected-class word in its fixed wording', () => {
    const offenders: string[] = [];
    for (const g of guides) {
      const fixed = plain(render(g.zipCodes).replace(/<tbody>.*<\/tbody>/s, ' ')).replace(EXPECTED_NOTE, ' ');
      for (const [label, re] of BANNED_IN_FIXED_WORDING) {
        const m = fixed.match(re);
        if (m) offenders.push(`${g.slug} ${label}: "${m[0]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('says it is a list by ZIP code and sends a reader who needs a zoned school to the official address search', () => {
    for (const g of guides) {
      const html = render(g.zipCodes);
      expect(plain(html)).toContain(EXPECTED_NOTE);
      const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[0]);
      expect(links).toHaveLength(1);
      expect(links[0]).toContain(`href="${DOE_SCHOOL_SEARCH_URL}"`);
      expect(links[0]).toContain('rel="noopener noreferrer"');
    }
  });

  it('names its source and date, and does not claim completeness', () => {
    const text = plain(render(guides[0].zipCodes));
    expect(text).toContain(`Source: NYC Department of City Planning Facilities Database, records updated ${schoolRecordsUpdatedLabel()}.`);
    expect(text).toContain('Non-public schools are not included, and the record may not list every school.');
  });

  it('does not rank or order by anything but name, and shows no per-school judgement column', () => {
    const html = render(guides.find((g) => g.zipCodes.length > 1)!.zipCodes);
    const headers = [...html.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((m) => m[1]);
    expect(headers).toEqual(['School', 'Address', 'Level', 'Type']);
  });
});

describe('school wording appears in a guide only inside the governed section', () => {
  it('no other neighborhood component mentions a school', () => {
    const dir = path.join(ROOT, 'app/components/neighborhoods');
    const offenders = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.tsx') && f !== 'NeighborhoodSchools.tsx')
      // the page component imports and renders the governed section by name; that is not school wording
      .filter((f) => /school/i.test(fs.readFileSync(path.join(dir, f), 'utf8').replace(/NeighborhoodSchools/g, '')));
    expect(offenders).toEqual([]);
  });

  it('every guide page renders the section from the guide\'s own ZIP codes', () => {
    for (const f of ['app/manhattan/[neighborhood]/page.tsx', 'app/components/neighborhoods/BoroughDetailPage.tsx']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(src).toContain('<NeighborhoodSchools zipCodes={n.zipCodes} />');
    }
    for (const b of ['brooklyn', 'queens', 'bronx', 'staten-island']) {
      const src = fs.readFileSync(path.join(ROOT, `app/${b}/[neighborhood]/page.tsx`), 'utf8');
      expect(src).toContain('BoroughDetailPage');
    }
  });

  it('the guide records themselves carry no school wording', () => {
    const SCHOOLISH = /\b(?:schools?|elementary|kindergarten|charter|academy)\b|\bP\.?S\.?\s?\d+|\bPS\/IS\b/i;
    const offenders = guides.filter((g) => SCHOOLISH.test(JSON.stringify(g).replace(/Brooklyn Academy of Music|MoMA PS1/g, ''))).map((g) => g.slug);
    expect(offenders).toEqual([]);
  });
});
