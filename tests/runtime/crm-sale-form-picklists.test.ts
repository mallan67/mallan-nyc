/// <reference types="jest" />
/**
 * The sale forms: every option of every picklist they bind is a live Cotality value.
 *
 * compliance:validate checks the first control of a radio / checkbox group; this checks every member of every group (the check the rental
 * forms already have in crm-rental-form-is-rental.test.ts), and that the rental-only questions are not on a sale page.
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
const VALUELESS = new Set(['BuildingFeatures', 'SyndicateTo']);

describe.each(['SALE-FORM-REDESIGN', 'SALE-FORM-WITH-TOOLS'])('%s', (name) => {
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

  it('carries no rental-only question', () => {
    for (const concept of ['RentIncludes', 'LastMonthRentReqYN', 'RentControlYN', 'MaximumPetWeight', 'MaximumNumberOfPets', 'PetDeposit', 'ApplicationFee', 'SecurityDeposit']) {
      expect({ concept, bound: !!doc.querySelector(`[data-concept="${concept}"]`) }).toEqual({ concept, bound: false });
    }
  });

  it('every bound concept is a live Cotality field or a Mallan concept the registry names', () => {
    const registry = JSON.parse(readFileSync(resolve(ROOT, 'compliance/rules/compliance-concepts.json'), 'utf8'));
    const reg = registry.customFieldKeys.keys as string[];
    const local = Object.keys(registry.localConcepts); // Mallan-only concepts the registry names (workflow status, auction ...)
    const unknown: string[] = [];
    doc.querySelectorAll('[data-concept]').forEach((el: Element) => {
      const c = el.getAttribute('data-concept') as string;
      if (!(c in live.entities.Property) && !(c in (live.entities.CustomProperty ?? {})) && !reg.includes(c) && !local.includes(c)) unknown.push(c);
    });
    expect([...new Set(unknown)]).toEqual([]);
  });
});
