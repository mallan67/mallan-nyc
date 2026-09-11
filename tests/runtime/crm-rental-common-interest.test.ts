/// <reference types="jest" />
/**
 * THE PROVIDER'S BUILDING MODEL MUST REACH THE FORM — AND "RENTAL BUILDING" IS NOT A DEFAULT.
 *
 * Owner report, 2026-09-10: a Cotality `CommonInterest = Condominium` must select Condo on the
 * rental form and must never fall back to Rental Building.
 *
 * ── WHAT IS ACTUALLY WRONG ─────────────────────────────────────────────────────────────────────
 *
 * normalizeCommonInterest() is correct: it accepts the live members, folds the legacy spellings
 * (Condo -> Condominium, Coop/Co-op -> StockCooperative) and returns '' for anything unrecognised
 * rather than guessing. It is simply never called on the way in.
 *
 *   · the CommonInterest select ships `<option value="RentalBuilding" selected>`;
 *   · the PropertyType radio ships `value="RentalBuilding" ... checked`;
 *   · hydration sets the PropertyType RADIO from the listing, and never sets #rentalCommonInterest
 *     from the provider's CommonInterest at all.
 *
 * So a condominium loads and the field sits on its hardcoded default. The agent then saves a
 * listing that tells REBNY the building is a rental building.
 *
 * A hardcoded `selected`/`checked` on a REQUIRED provider-sourced field is the defect. Where the
 * provider identity is unresolved the form must show NOTHING SELECTED and fail closed, not assert
 * the most common case. Everything below drives the shipped functions and inspects the field.
 */
export {};
import { readFileSync } from 'fs';
import { resolve } from 'path';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
const jsdom: any = require('jsdom');
const ROOT = resolve(__dirname, '../..');

/* eslint-disable @typescript-eslint/no-explicit-any */

// Boots the real ~1MB rental form per test; see the note in crm-rental-address-hydration.test.ts.
jest.setTimeout(180_000);

function boot() {
  const html = readFileSync(resolve(ROOT, 'public/crm/RENTAL-FORM-REDESIGN.html'), 'utf8');
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on('jsdomError', () => undefined);
  const dom = new jsdom.JSDOM(html, { url: 'http://localhost/crm/rental-listing', runScripts: 'dangerously', virtualConsole });
  const win: any = dom.window;
  win.eval('window.fetch = function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); };');
  const ci = () => (win.document.getElementById('rentalCommonInterest') as any)?.value ?? null;
  return { win, ci, close: () => win.close() };
}

describe('the shipped markup does not assert a building model nobody chose', () => {
  const html = readFileSync(resolve(ROOT, 'public/crm/RENTAL-FORM-REDESIGN.html'), 'utf8');

  it('the CommonInterest select does not pre-select Rental Building', () => {
    expect(html).not.toMatch(/<option value="RentalBuilding"\s+selected>/);
  });

  it('it offers an explicit unselected state instead', () => {
    const select = /<select id="rentalCommonInterest"[\s\S]*?<\/select>/.exec(html);
    expect(select).not.toBeNull();
    expect(select![0]).toMatch(/<option value=""[^>]*selected/);
  });

  it('an unresolved CommonInterest is EMPTY, not "RentalBuilding"', () => {
    const t = boot();
    expect(t.ci()).toBe('');
    t.close();
  });
});

describe('a provider CommonInterest reaches the field', () => {
  const apply = (t: any, value: unknown) => t.win.eval(`applyProviderCommonInterest(${JSON.stringify(value)})`);

  it('Condominium selects Condominium', () => {
    const t = boot();
    apply(t, 'Condominium');
    expect(t.ci()).toBe('Condominium');
    t.close();
  });

  it('the legacy spelling "Condo" folds to Condominium — never to Rental Building', () => {
    const t = boot();
    apply(t, 'Condo');
    expect(t.ci()).toBe('Condominium');
    t.close();
  });

  it('Coop and Co-op fold to StockCooperative', () => {
    for (const v of ['Coop', 'Co-op']) {
      const t = boot();
      apply(t, v);
      expect(t.ci()).toBe('StockCooperative');
      t.close();
    }
  });

  it('an actual RentalBuilding still selects RentalBuilding — when the provider says so', () => {
    const t = boot();
    apply(t, 'RentalBuilding');
    expect(t.ci()).toBe('RentalBuilding');
    t.close();
  });

  it('a value that is not a live member leaves the field UNSET rather than defaulting', () => {
    const t = boot();
    apply(t, 'Brownstone');
    expect(t.ci()).toBe('');
    t.close();
  });

  it('an empty provider value leaves it unset', () => {
    for (const v of ['', null, undefined]) {
      const t = boot();
      apply(t, v);
      expect(t.ci()).toBe('');
      t.close();
    }
  });
});

describe('selecting a condominium building drives the condo requirement layer', () => {
  it('a Condominium shows board fields; a RentalBuilding does not', () => {
    const t = boot();
    t.win.eval("applyProviderCommonInterest('Condominium')");
    const boardShown = () => !(t.win.document.getElementById('rentalBoardApprovalField') as any)?.classList.contains('hidden');
    expect(boardShown()).toBe(true);
    t.win.eval("applyProviderCommonInterest('RentalBuilding')");
    expect(boardShown()).toBe(false);
    t.close();
  });
});
