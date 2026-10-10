/// <reference types="jest" />
/**
 * The unit-level PetsAllowed of the Add forms, the Tools viewers and the server table carries the LIVE Cotality members.
 *
 * Found 2026-10-01 (a live probe, recorded as "Known held defect - Sale Redesign PetsAllowed") and corrected 2026-10-09 (Maya: "there is no noise, there are errors and the need fixing. Do not assume, do actual
 * corrections"): both forms wrote UnitYes / UnitCatsOK / UnitDogsOK / UnitBreedRestrictions / UnitSizeLimit / UnitNumberLimit / UnitNo into PetsAllowed, and the server table listed the same, while the live
 * Cotality list (data/cotality-enums.live.json) serves Yes / CatsOk / DogsOk / BreedRestrictions / SizeLimit / NumberLimit / No. Every listing an agent saved carried a value Cotality does not have, and a synced
 * listing's pets (Yes, CatsOk) matched no box of the Tools viewers, so they were listed as stored extras instead of shown. The boxes now carry the live members; a listing saved with the old spellings still
 * loads (valueMap). The building group (Mallan Building Profile, internal: BuildingPetsAllowed is not a Cotality field) is the form's own and is not part of this.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, storedListing, type AddForm } from './add-form-harness';
import { bootViewer, rendered, until as viewerUntil, type ViewerFile } from './tools-viewer-harness';
import { REBNY_FIELD_TABLES } from '@/lib/compliance/rebny-field-tables';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const live: { enums: Record<string, string[]> } = JSON.parse(readFileSync(resolve(__dirname, '../../data/cotality-enums.live.json'), 'utf8'));
const LIVE_PETS = new Set(live.enums.PetsAllowed);
const UNIT = ['Yes', 'CatsOk', 'DogsOk', 'BreedRestrictions', 'SizeLimit', 'NumberLimit', 'No'];                      // the boxes, in the order the forms show them
const LEGACY: Record<string, string> = { UnitYes: 'Yes', UnitCatsOK: 'CatsOk', UnitDogsOK: 'DogsOk', UnitBreedRestrictions: 'BreedRestrictions', UnitSizeLimit: 'SizeLimit', UnitNumberLimit: 'NumberLimit', UnitNo: 'No' };

const PAGES = [
  ['SALE-FORM-REDESIGN', 'sale'], ['RENTAL-FORM-REDESIGN', 'rental'], ['SALE-FORM-WITH-TOOLS', 'sale'], ['RENTAL-FORM-WITH-TOOLS', 'rental'],
] as const;
const read = (name: string) => readFileSync(resolve(__dirname, `../../public/crm/${name}.html`), 'utf8');
const unitValues = (doc: Document, prefix: string) => [...doc.querySelectorAll(`input[name="${prefix}PetsAllowed"]`)].map((e) => (e as HTMLInputElement).value);

describe('the unit pet policy boxes offer exactly the live members, on every page', () => {
  it.each(PAGES)('%s', (file, prefix) => {
    const values = unitValues(new JSDOM(read(file)).window.document, prefix);
    expect(values).toEqual(UNIT);
    for (const v of values) expect(LIVE_PETS.has(v)).toBe(true);
    expect(values.filter((v) => v.startsWith('Unit'))).toEqual([]);
  });

  it('the building group is the form\'s own and keeps its Building* values (it is the Mallan Building Profile, not a Cotality field)', () => {
    for (const [file, prefix] of PAGES.filter(([f]) => !f.includes('TOOLS'))) {
      const building = [...new JSDOM(read(file)).window.document.querySelectorAll(`input[name="${prefix}BuildingPetsAllowed"]`)].map((e) => (e as HTMLInputElement).value);
      expect(building.length).toBeGreaterThan(0);
      expect(building.every((v) => v.startsWith('Building'))).toBe(true);
    }
  });
});

describe('the server rule table lists the same live members', () => {
  it('enumValues.PetsAllowed is the unit members of the live list, and the conditional note says "No"', () => {
    const listed = [...REBNY_FIELD_TABLES.enumValues.PetsAllowed];
    expect([...listed].sort()).toEqual([...UNIT].sort());
    for (const v of listed) expect(LIVE_PETS.has(v)).toBe(true);
    const source = readFileSync(resolve(__dirname, '../../lib/compliance/rebny-field-tables.ts'), 'utf8');
    expect(source).toContain('If BuildingPetsAllowed = BuildingNo then PetsAllowed must = No');
    expect(source).not.toMatch(/\bUnit(Yes|No|CatsOK|DogsOK|BreedRestrictions|SizeLimit|NumberLimit)\b/);
  });
});

describe.each([['SALE-FORM-REDESIGN', 'sale', 'collectSaleFormData'], ['RENTAL-FORM-REDESIGN', 'rental', 'collectRentalFormData']] as const)('%s: the pet boxes behave', (form, prefix, collector) => {
  const tick = (f: any, value: string, on = true) => {
    const box = f.d.querySelector(`input[name="${prefix}PetsAllowed"][value="${value}"]`) as HTMLInputElement;
    box.checked = on;
    box.dispatchEvent(new f.w.Event('change', { bubbles: true }));
  };
  const ticked = (f: any) => [...f.d.querySelectorAll(`input[name="${prefix}PetsAllowed"]:checked`)].map((e: any) => e.value);

  it('sends what is ticked as the live members, in the order of the boxes', async () => {
    const f = await bootAddForm(form as AddForm, { settle: 300 });
    try {
      tick(f, 'CatsOk'); tick(f, 'Yes'); tick(f, 'SizeLimit');
      expect(f.w[collector]().PetsAllowed).toEqual(['Yes', 'CatsOk', 'SizeLimit']);
    } finally { f.close(); }
  });

  it('"No" switches the others off, and any other answer switches "No" off', async () => {
    const f = await bootAddForm(form as AddForm, { settle: 300 });
    try {
      tick(f, 'Yes'); tick(f, 'DogsOk');
      tick(f, 'No');
      expect(ticked(f)).toEqual(['No']);
      tick(f, 'DogsOk');
      expect(ticked(f)).toEqual(['DogsOk']);
    } finally { f.close(); }
  });

  it('a building that allows no pets locks the unit to "No" and shows why; allowing pets again unlocks it', async () => {
    const f = await bootAddForm(form as AddForm, { settle: 300 });
    try {
      tick(f, 'Yes');
      const building = f.d.querySelector(`input[name="${prefix}BuildingPetsAllowed"][value="BuildingNo"]`) as HTMLInputElement;
      building.checked = true;
      building.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      expect(ticked(f)).toEqual(['No']);
      expect([...f.d.querySelectorAll(`input[name="${prefix}PetsAllowed"]`)].every((e: any) => e.disabled)).toBe(true);
      expect(f.d.getElementById(`${prefix}PetsAllowedLocked`)!.classList.contains('hidden')).toBe(false);
      building.checked = false;
      building.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      expect([...f.d.querySelectorAll(`input[name="${prefix}PetsAllowed"]`)].some((e: any) => e.disabled)).toBe(false);
      expect(f.d.getElementById(`${prefix}PetsAllowedLocked`)!.classList.contains('hidden')).toBe(true);
    } finally { f.close(); }
  });

  it('a saved listing comes back with the same boxes ticked; one saved with the old Unit* spellings loads as the live members', async () => {
    const f = await bootAddForm(form as AddForm, { settle: 300 });
    let stored: Record<string, any>;
    try { tick(f, 'Yes'); tick(f, 'CatsOk'); stored = storedListing(f.w[collector](), prefix === 'sale' ? 'sale' : 'rent') as Record<string, any>; } finally { f.close(); }
    const reopen = async (listing: Record<string, any>) => {
      const g = await bootAddForm(form as AddForm, { search: '?id=1', listing, settle: 1500 });
      try { return ticked(g); } finally { g.close(); }
    };
    expect(await reopen(stored)).toEqual(['Yes', 'CatsOk']);
    const old = { ...stored, raw_data: { ...stored.raw_data, PetsAllowed: ['UnitYes', 'UnitCatsOK', 'UnitDogsOK', 'UnitBreedRestrictions', 'UnitSizeLimit', 'UnitNumberLimit'] } };
    expect(await reopen(old)).toEqual(['Yes', 'CatsOk', 'DogsOk', 'BreedRestrictions', 'SizeLimit', 'NumberLimit']);
    expect(await reopen({ ...stored, raw_data: { ...stored.raw_data, PetsAllowed: ['UnitNo'] } })).toEqual(['No']);
    // and a value of the live list that has no box here (BirdsOk) does not tick anything
    expect(await reopen({ ...stored, raw_data: { ...stored.raw_data, PetsAllowed: ['BirdsOk'] } })).toEqual([]);
  });
});

describe.each(['SALE-FORM-WITH-TOOLS', 'RENTAL-FORM-WITH-TOOLS'] as ViewerFile[])('%s: a stored listing\'s pets', (file) => {
  const prefix = file.startsWith('SALE') ? 'sale' : 'rental';
  const listing = (PetsAllowed: string[]) => ({
    id: '77', listing_id: 'L77', mls_id: 'M77', status: 'Active', listing_type: prefix === 'sale' ? 'sale' : 'rent', property_type: 'Residential', list_price: '1250000',
    address: { StreetNumber: '333', StreetName: '46th', StreetSuffix: 'St', City: 'New York', PostalCode: '10017', StateOrProvince: 'NY' },
    features: {}, agent_info: {}, media: [], raw_data: { CommonInterest: 'Condominium', PetsAllowed },
  });
  const shown = async (PetsAllowed: string[]) => {
    const b = bootViewer(file, { listing: listing(PetsAllowed) });
    try {
      await viewerUntil(() => rendered(b.d));
      return {
        ticked: [...b.d.querySelectorAll(`input[name="${prefix}PetsAllowed"]:checked`)].map((e: any) => e.value),
        extras: [...b.d.querySelectorAll('.viewer-extra-value')].map((e) => String(e.textContent)).filter((t) => /PetsAllowed/.test(t)),
      };
    } finally { b.close(); }
  };

  it('live members (what Cotality serves for a synced listing) tick their boxes, and nothing is listed as stored extra', async () => {
    expect(await shown(['Yes', 'CatsOk'])).toEqual({ ticked: ['Yes', 'CatsOk'], extras: [] });
  });

  it('the old Unit* spellings (a listing saved before the boxes were corrected) tick the same boxes', async () => {
    expect(await shown(Object.keys(LEGACY).filter((k) => k !== 'UnitNo'))).toEqual({ ticked: ['Yes', 'CatsOk', 'DogsOk', 'BreedRestrictions', 'SizeLimit', 'NumberLimit'], extras: [] });
  });

  it('a live member no box offers (BirdsOk, a Building* member) is shown as text beside the ones that tick, not dropped', async () => {
    const out = await shown(['Yes', 'BirdsOk', 'BuildingYes']);
    expect(out.ticked).toEqual(['Yes']);
    expect(out.extras).toHaveLength(1);
    expect(out.extras[0]).toMatch(/PetsAllowed \(stored\): BirdsOk, BuildingYes/);
  });
});

describe('the Sale building lookup suggests each live member the form has a box for', () => {
  // populateBuildingFromIDX is the page's own function: it is run here on a stand-in document that holds the unit pet boxes (the lookup's answer is Cotality's, as the building route returns it)
  const FORM = read('SALE-FORM-REDESIGN');
  const extractFn = (src: string, name: string): string => {
    const start = src.indexOf(`function ${name}(`);
    if (start === -1) throw new Error(`not found: ${name}`);
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    throw new Error(`unbalanced: ${name}`);
  };
  type Box = { value: string; checked: boolean };
  const suggest = (building: Record<string, unknown>, ticked: string[] = []) => {
    const pets: Box[] = UNIT.map((value) => ({ value, checked: ticked.includes(value) }));
    const document = {
      getElementById: () => null,
      querySelectorAll: (selector: string) => { const named = selector.match(/name="([^"]+)"/); return named && named[1] === 'salePetsAllowed' ? pets : []; },
      createElement: () => ({ value: '', text: '', dataset: {} as Record<string, string> }),
    };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const runner = new Function('document', '_syncSaleBuildingAddressFields', `${extractFn(FORM, 'populateBuildingFromIDX')}; return populateBuildingFromIDX;`);
    runner(document, () => undefined)('sale', building);
    return pets.filter((box) => box.checked).map((box) => box.value);
  };

  it.each(UNIT)('Cotality "%s" ticks the box of that name and no other', (member) => {
    expect(suggest({ pets_allowed: member })).toEqual([member]);
  });

  it('a list ticks each of its members that has a box', () => {
    expect(suggest({ pets_allowed: 'CatsOk,DogsOk,SizeLimit,BirdsOk,BuildingCatsOk' })).toEqual(['CatsOk', 'DogsOk', 'SizeLimit']);
  });

  it('PetsAllowedYN true suggests "Yes" and false suggests "No"', () => {
    expect(suggest({ pets_allowed: '', pets_allowed_yn: true })).toEqual(['Yes']);
    expect(suggest({ pets_allowed: '', pets_allowed_yn: false })).toEqual(['No']);
  });

  it('what the agent ticked is never overridden by the lookup', () => {
    expect(suggest({ pets_allowed: 'CatsOk,Yes' }, ['No'])).toEqual(['No']);
  });
});
