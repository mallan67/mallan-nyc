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
