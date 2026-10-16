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
