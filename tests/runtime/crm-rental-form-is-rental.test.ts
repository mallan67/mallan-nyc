/// <reference types="jest" />
/**
 * The rental forms carry rental fields, and every option of every picklist they bind is a live Cotality value.
 *
 * compliance:validate checks the first control of a radio / checkbox group; this checks every member of the group, and that the sale-only
 * blocks (purchase requirements, flip tax, sponsor units, buyer policies) are not on a rental page.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');

const ROOT = resolve(__dirname, '../..');
const live = JSON.parse(readFileSync(resolve(ROOT, 'data/cotality-enums.live.json'), 'utf8'));
const enumFor = (concept: string): string[] | null => {
  const t = String(live.entities.Property[concept] ?? live.entities.CustomProperty?.[concept] ?? '')
    .replace(/^Collection\(/, '').replace(/\)$/, '').replace(/^.*\.Enums\.(?:Multi\.)?/, '');
  return live.enums[concept] ?? live.enums[t] ?? null;
};

// A box with no value of its own is a Yes/No or an amenity-by-design box (BuildingFeatures, SyndicateTo): not a picklist member.
const VALUELESS = new Set(['BuildingFeatures', 'SyndicateTo']);

describe.each(['RENTAL-FORM-REDESIGN', 'RENTAL-FORM-WITH-TOOLS'])('%s', (name) => {
  const doc = new JSDOM(readFileSync(resolve(ROOT, `public/crm/${name}.html`), 'utf8')).window.document;

  it('every option of every bound picklist is a live Cotality value', () => {
    const bad: string[] = [];
    const groups = new Map<string, { concept: string | null; values: string[] }>();
    doc.querySelectorAll('input[type=radio],input[type=checkbox],select').forEach((el: Element) => {
      const input = el as HTMLInputElement;
      const key = el.tagName === 'SELECT' ? `#${el.id}` : input.name || el.id;
      const g = groups.get(key) ?? { concept: null, values: [] };
      g.concept = g.concept ?? el.getAttribute('data-concept');
      if (el.tagName === 'SELECT') [...(el as HTMLSelectElement).options].forEach((o) => { if (o.value && !o.hidden && !o.disabled) g.values.push(o.value); });
      else if (input.getAttribute('value')) g.values.push(input.value);
      groups.set(key, g);
    });
    for (const [key, g] of groups) {
      if (!g.concept || VALUELESS.has(g.concept)) continue;
      const members = enumFor(g.concept);
      if (!members) continue;
      const missing = g.values.filter((v) => !members.includes(v));
      if (missing.length) bad.push(`${key} (${g.concept}): ${missing.join(', ')}`);
    }
    expect(bad).toEqual([]);
  });

  it('has no sale-only block', () => {
    for (const id of ['bldgMaxFinancing', 'bldgMinDownPayment', 'bldgDTIRatio', 'bldgPostCloseLiquidity', 'bldgFlipTax', 'bldgFlipTaxAmount', 'bldgFlipTaxPaidBy',
      'bldgParentsAllowed', 'bldgCoBuyersAllowed', 'bldgCorpOwnAllowed', 'bldgGiftsAllowed', 'bldgTotalShares', 'bldgUnderlying', 'bldgAvgMaint']) {
      expect({ id, present: !!doc.getElementById(id) }).toEqual({ id, present: false });
    }
    for (const concept of ['FlipTax', 'MaximumFinancingPercent']) expect(doc.querySelector(`[data-concept="${concept}"]`)).toBeNull();
  });

  it('asks the rental questions Cotality has fields for', () => {
    for (const concept of ['ApplicationFee', 'LastMonthRentReqYN', 'RentControlYN', 'SponsorUnitYN', 'RentIncludes', 'MaximumPetWeight', 'MaximumNumberOfPets', 'PetDeposit', 'PetsComments', 'SecurityDeposit']) {
      expect({ concept, bound: !!doc.querySelector(`[data-concept="${concept}"]`) }).toEqual({ concept, bound: true });
    }
  });
});

describe.each(['RENTAL-FORM-REDESIGN', 'RENTAL-FORM-WITH-TOOLS'])('%s: lease term and smoking say what Cotality means', (name) => {
  const html = readFileSync(resolve(ROOT, `public/crm/${name}.html`), 'utf8');
  const doc = new JSDOM(html).window.document;

  it('every Lease Term choice is a live LeaseTerm member, and the list is the one control bound to LeaseTerm', () => {
    const select = doc.getElementById('rentalLeaseTerm') as HTMLSelectElement;
    expect(select.getAttribute('data-concept')).toBe('LeaseTerm');
    const members: string[] = live.enums.LeaseTerm;
    for (const o of [...select.options].filter((x) => x.value)) expect({ value: o.value, live: members.includes(o.value) }).toEqual({ value: o.value, live: true });
    expect([...doc.querySelectorAll('[data-concept="LeaseTerm"]')].map((e) => e.id)).toEqual(['rentalLeaseTerm']);       // Min Lease (a number of months) is not sent as a LeaseTerm
  });

  it('Smoking Allowed is not bound to BuildingSmokeFreeYN as it stands: it asks the opposite question', () => {
    expect(doc.querySelector('[data-concept="BuildingSmokeFreeYN"]')).toBeNull();
    expect([...doc.querySelectorAll('input[name="rentalSmoking"]')].every((i) => i.getAttribute('data-concept-disposition') === 'mallan-internal')).toBe(true);
  });
});

describe('RENTAL-FORM-REDESIGN save payload', () => {
  const html = readFileSync(resolve(ROOT, 'public/crm/RENTAL-FORM-REDESIGN.html'), 'utf8');
  it('inverts Smoking Allowed into BuildingSmokeFreeYN and maps a minimum lease to a live LeaseTerm member', () => {
    expect(html).toContain("if (data.rentalSmoking === 'Yes') data.BuildingSmokeFreeYN = false;");
    expect(html).toContain("else if (data.rentalSmoking === 'No') data.BuildingSmokeFreeYN = true;");
    const mapped = [...html.matchAll(/(\d+): '([A-Za-z]+)'/g)].filter((m) => ['MonthToMonth', 'ThreeMonths', 'SixMonths', 'NineMonths', 'TwelveMonths', 'TwentyFourMonths', 'ThirtySixMonths'].includes(m[2])).map((m) => m[2]);
    expect(new Set(mapped).size).toBe(7);
    for (const m of new Set(mapped)) expect(live.enums.LeaseTerm).toContain(m);
  });
});
