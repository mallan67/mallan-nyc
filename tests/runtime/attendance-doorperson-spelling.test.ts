/// <reference types="jest" />
/**
 * AttendanceType after RLS renamed Doorman to Doorperson (released 2026-11-17).
 *
 * Maya, 2026-11-19: "follow live, do not keep the old, update with the new information and make sure mapping is
 * updated. The doorman is for rental and sale." Live Cotality (read 2026-11-19, 9,668 Active listings) serves
 * DoorpersonFullTime / DoorpersonPartTime / DoorpersonYes and VideoDoorpersonFullTime / VideoDoorpersonPartTime /
 * VideoDoorpersonYes (lowercase p; the RLS notice's "VideoDoorPersonFullTime" is not on any live row).
 *
 *  1. No file the site or the CRM serves carries a retired Doorman spelling.
 *  2. The Sale and Rental forms and their read-only viewers offer exactly the live members, and nothing else.
 *  3. The CRM search boxes filter on the live members.
 *  4. The generated data contract (data/cotality-enums.live.json, `npm run cotality:pull`) carries the Doorperson members. Its sample still holds a few
 *     Doorman values on closed rentals that RLS has not backfilled (live truth, never hand-edited), so the contract blob inside index-built.html is
 *     data, not a place the old spelling is written: the scan below leaves that one generated line out.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { ATTENDANCE_TYPE_MEMBERS } from '@/lib/idx/attendance-type';

const ROOT = resolve(__dirname, '../..');
const RETIRED = /(?:Video)?Doorman(?:FullTime|PartTime|Yes)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|html)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('no retired Doorman spelling is served', () => {
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'public/crm'))];

  it('scans the site, the library and the CRM pages', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it.each(files.map((f) => [f.slice(ROOT.length + 1).replace(/\\/g, '/'), f]))('%s', (_rel, file) => {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const hits = lines.map((l, i) => (RETIRED.test(l) && !l.startsWith('window.COTALITY_SEARCH_CONTRACT =') ? `${i + 1}: ${l.trim().slice(0, 140)}` : '')).filter(Boolean);
    expect(hits).toEqual([]);
  });
});

describe('the forms offer exactly the live AttendanceType members', () => {
  const FORMS: [string, string][] = [
    ['SALE-FORM-REDESIGN', 'saleAttendanceType'],
    ['SALE-FORM-WITH-TOOLS', 'saleAttendanceType'],
    ['RENTAL-FORM-REDESIGN', 'rentalAttendanceType'],
    ['RENTAL-FORM-WITH-TOOLS', 'rentalAttendanceType'],
  ];
  it.each(FORMS)('%s (%s)', (name, field) => {
    const html = readFileSync(join(ROOT, `public/crm/${name}.html`), 'utf8');
    const values = [...html.matchAll(new RegExp(`<input[^>]*name="${field}"[^>]*value="([^"]+)"`, 'g'))].map((m) => m[1]);
    expect([...values].sort()).toEqual([...ATTENDANCE_TYPE_MEMBERS].sort());
  });

  it.each(FORMS)('%s labels its door boxes Doorperson, not Doorman', (name, field) => {
    const html = readFileSync(join(ROOT, `public/crm/${name}.html`), 'utf8');
    const labels = [...html.matchAll(new RegExp(`<label[^>]*>\\s*<input[^>]*name="${field}"[^>]*value="((?:Video)?Doorperson[A-Za-z]+)"[^>]*>([^<]*)</label>`, 'g'))];
    expect(labels).toHaveLength(6);
    for (const m of labels) expect(m[2]).toMatch(/Doorperson/);
  });
});

describe('what a visitor or an agent reads for a doorperson', () => {
  it.each(['app/building/page.tsx', 'app/buildings/[slug]/page.tsx'])('%s: the amenity icon is keyed on the label the amenity list now carries', (page) => {
    const src = readFileSync(join(ROOT, page), 'utf8');
    expect(src).toMatch(/\bDoorperson:/);
    expect(src).not.toMatch(/\bDoorman:/);
  });

  it('the CRM detail view reads the video member as Video, not as its full-time substring', () => {
    const src = readFileSync(join(ROOT, 'public/crm/js/render/render-master-detail.js'), 'utf8');
    const line = src.split(/\r?\n/).find((l) => /^\s*doorman: function \(l\)/.test(l))!;
    const fn = new Function(`return ({ ${line.trim().replace(/,\s*$/, '')} }).doorman;`)();
    const read = (AttendanceType: string) => fn({ rebny: { AttendanceType } });
    expect(read('VideoDoorpersonFullTime')).toBe('Video');
    expect(read('VideoDoorpersonYes')).toBe('Video');
    expect(read('DoorpersonFullTime')).toBe('Full-time');
    expect(read('DoorpersonPartTime')).toBe('Part-time');
    expect(read('DoorpersonYes')).toBe('Yes');
    expect(read('None')).toBe('None');
    expect(read('')).toBe('--');
  });
});

describe('the generated data contract carries the live members', () => {
  it.each(['sale', 'rental'])('%s listings: the Doorperson members are observed', (side) => {
    const live = JSON.parse(readFileSync(join(ROOT, 'data/cotality-enums.live.json'), 'utf8'));
    const observed = Object.keys(live.search.custom_fields.keys.AttendanceType.observed[side]);
    expect(observed).toEqual(expect.arrayContaining(['DoorpersonFullTime', 'DoorpersonYes']));
  });
});

describe('the CRM search boxes filter on the live members', () => {
  const PAGES = ['public/crm/html/search-form-and-results.html', 'public/crm/index-built.html'];
  it.each(PAGES)('%s', (page) => {
    const html = readFileSync(join(ROOT, page), 'utf8');
    const values = new Set<string>();
    for (const m of html.matchAll(/data-field="AttendanceType"[^>]*data-value="([^"]+)"|data-value="([^"]+)"[^>]*data-field="AttendanceType"/g)) {
      for (const v of (m[1] || m[2]).split(',')) values.add(v.trim());
    }
    expect(values.size).toBeGreaterThan(0);
    // "Any" is the search page's own "Any Attended" choice (the server turns it into every attended member), not a Cotality member
    const live = new Set<string>([...ATTENDANCE_TYPE_MEMBERS, 'Any']);
    expect([...values].filter((v) => !live.has(v))).toEqual([]);
    expect(values.has('DoorpersonFullTime')).toBe(true);
  });
});
