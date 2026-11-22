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

/**
 * What an agent or a client READS on a CRM page says Doorman (Maya, 2026-11-22: "the general name should be doorman since this is how the industry uses it, but the field
 * need to changed"). This reverses the 2026-11-20 instruction that labels say Doorperson: the VALUES stay the live RLS members (DoorpersonFullTime / PartTime / Yes), the WORD a
 * person reads is Doorman. A label, a placeholder or a sample sentence may not say Doorperson. What may stay: the live members and the identifiers code depends on.
 */
describe('no CRM page says Doorperson where a person reads it', () => {
  // every text file a browser reads from public/crm, not only pages and scripts
  const walkText = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkText(p, out);
      else if (/\.(js|html|css|json|md|txt|svg|csv|xml)$/i.test(name)) out.push(p);
    }
    return out;
  };
  const crmFiles = walkText(join(ROOT, 'public/crm'));

  const IDENTIFIERS: RegExp[] = [
    /(?:Video)?Doorperson(?:FullTime|PartTime|Yes)\b/g, // the live AttendanceType members: value="DoorpersonFullTime", data-value="DoorpersonYes"
    /[\w$]*doorperson[\w$]+|[\w$]+doorperson[\w$]*/gi, // an identifier with letters around it
  ];
  const READABLE = /door[ _-]?pe(?:rson|ople)/i;
  const readsAsDoorperson = (line: string) => READABLE.test(IDENTIFIERS.reduce((s, re) => s.replace(re, ' '), line));

  it('the guard catches every spelling a person would read, and lets the live members through', () => {
    for (const miss of ['Doorperson', 'doorperson', 'Door Person', 'door-person', 'DOORPERSON', 'placeholder="doorperson, gym"', "'doorperson and elevator'", '<span>Doorperson:</span>', 'Video Doorperson'])
      expect(readsAsDoorperson(miss)).toBe(true);
    for (const ok of ['value="DoorpersonFullTime"', 'data-value="DoorpersonYes,DoorpersonFullTime,DoorpersonPartTime"', 'value="VideoDoorpersonYes"', 'Doorman (Full-Time)', 'doorman', 'hasDoorperson(x)'])
      expect(readsAsDoorperson(ok)).toBe(false);
  });

  it('scans the pages, scripts, stylesheets and data files of the CRM', () => {
    expect(crmFiles.length).toBeGreaterThan(100);
    expect(crmFiles.some((f) => /\.html$/i.test(f)) && crmFiles.some((f) => /\.js$/i.test(f))).toBe(true);
  });

  it.each(crmFiles.map((f) => [f.slice(ROOT.length + 1).replace(/\\/g, '/'), f]))('%s', (_rel, file) => {
    const hits = readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l, i) => (!l.startsWith('window.COTALITY_SEARCH_CONTRACT =') && readsAsDoorperson(l) ? `${i + 1}: ${l.trim().slice(0, 150)}` : ''))
      .filter(Boolean);
    expect(hits).toEqual([]);
  });

  it('the Sale and Rental attendance boxes keep the live values and say Doorman', () => {
    for (const [form, name] of [['SALE-FORM-REDESIGN', 'saleAttendanceType'], ['SALE-FORM-WITH-TOOLS', 'saleAttendanceType'], ['RENTAL-FORM-REDESIGN', 'rentalAttendanceType'], ['RENTAL-FORM-WITH-TOOLS', 'rentalAttendanceType']]) {
      const html = readFileSync(join(ROOT, `public/crm/${form}.html`), 'utf8');
      for (const [value, label] of [['DoorpersonFullTime', 'Doorman'], ['VideoDoorpersonFullTime', 'Video Doorman']])
        expect(html).toMatch(new RegExp(`name="${name}" value="${value}"[^>]*>\\s*${label} \\(Full-Time\\)`));
    }
  });

  it('the Security Features boxes keep the live value DoorMan (RLS renamed only AttendanceType) and say Doorman', () => {
    const live = JSON.parse(readFileSync(join(ROOT, 'data/cotality-enums.live.json'), 'utf8'));
    expect(live.enums.SecurityFeatures).toContain('DoorMan');
    for (const form of ['SALE-FORM-REDESIGN', 'SALE-FORM-WITH-TOOLS']) {
      const html = readFileSync(join(ROOT, `public/crm/${form}.html`), 'utf8');
      expect(html).toMatch(/name="saleBldgSecurity" value="DoorMan"[^>]*>\s*Doorman \(secured lobby\)/);
    }
  });

  it('the deal forms keep their saved checkbox ids and say Doorman', () => {
    for (const [file, id] of [['public/crm/TENANT-DEAL-FORM.html', 'tenantFeatDoorman'], ['public/crm/BUYER-DEAL-FORM.html', 'buyerFeatDoorman']]) {
      const html = readFileSync(join(ROOT, file), 'utf8');
      expect(html).toMatch(new RegExp(`id="${id}"[^>]*>\\s*Doorman</label>`));
    }
  });

  it('the report builder keeps its field id and says Doorman', () => {
    expect(readFileSync(join(ROOT, 'public/crm/html/modals/reports.html'), 'utf8')).toMatch(/data-field="doorman">\s*Doorman<\/label>/);
  });
});

describe('the CRM search engine matches an AttendanceType member whole, so a video doorperson is never taken for a doorperson', () => {
  it('compares AttendanceType by member, like ListingAgreement is compared exactly', () => {
    const src = readFileSync(join(ROOT, 'public/crm/js/search/search-engine.js'), 'utf8');
    expect(src).toMatch(/_fk === 'AttendanceType'/);
    expect(src).not.toMatch(/FullTimeDoorman|VirtualDoorman/);
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

  it.each(FORMS)('%s labels its door boxes Doorman (the value stays the live Doorperson member), not Doorperson', (name, field) => {
    const html = readFileSync(join(ROOT, `public/crm/${name}.html`), 'utf8');
    const labels = [...html.matchAll(new RegExp(`<label[^>]*>\\s*<input[^>]*name="${field}"[^>]*value="((?:Video)?Doorperson[A-Za-z]+)"[^>]*>([^<]*)</label>`, 'g'))];
    expect(labels).toHaveLength(6);
    for (const m of labels) {
      expect(m[2]).toMatch(/Doorman/);
      expect(m[2]).not.toMatch(/Doorperson/);
    }
  });
});

describe('what a visitor or an agent reads for a doorman', () => {
  it.each(['app/building/page.tsx', 'app/buildings/[slug]/page.tsx'])('%s: the amenity icon is keyed on the label the amenity list carries (Doorman)', (page) => {
    const src = readFileSync(join(ROOT, page), 'utf8');
    expect(src).toMatch(/\bDoorman:/);
    expect(src).not.toMatch(/\bDoorperson:/);
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
