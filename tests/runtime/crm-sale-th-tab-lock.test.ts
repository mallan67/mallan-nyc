/// <reference types="jest" />
/**
 * The Sale form's TH / Building tab is LOCKED for every UNIT type, including a commercial, office or retail unit in a condo, condop or co-op building.
 *
 * Before: the lock looked only at the top-level property type (Condo, Co-op, Condop, Loft...). A Commercial listing (ownership "Commercial Condo") and an Office or
 * Retail listing (ownership Condo / Condop / Co-op) never counted as a unit type, so the TH / Building tab stayed open and the agent was walked into a townhouse
 * form for a unit. Only a whole building, land, a townhouse, mixed use or fee simple needs that tab.
 *
 * Proven on the REAL page: the form is booted, a type is chosen the way an agent chooses it, and the tab button is read back.
 */
import { bootAddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(240000);
/* eslint-disable @typescript-eslint/no-explicit-any */

let f: BootedForm;
beforeAll(async () => { f = await bootAddForm('SALE-FORM-REDESIGN'); });
afterAll(() => f?.close());

function choose(name: string, value: string) {
  const radio = f.d.querySelector(`input[name="${name}"][value="${value}"]`) as HTMLInputElement | null;
  if (!radio) throw new Error(`no ${name}=${value} control on the page`);
  radio.checked = true;
  radio.dispatchEvent(new (f.w as any).Event('change', { bubbles: true }));
  f.w.applySalesFieldRules();
}
function clear(name: string) {
  f.d.querySelectorAll(`input[name="${name}"]`).forEach((r) => { (r as HTMLInputElement).checked = false; });
}
function reset() {
  clear('saleCommercialOwnership');
  clear('saleOfficeRetailOwnership');
  choose('salePropertyType', 'Condo');
  clear('saleCommercialOwnership');
  clear('saleOfficeRetailOwnership');
}
const tab = () => f.d.getElementById('sidebarTab3') as HTMLButtonElement;
const locked = () => tab().disabled === true && tab().getAttribute('aria-disabled') === 'true';
const open = () => tab().disabled === false && tab().getAttribute('aria-disabled') === 'false';

describe('Commercial: the ownership structure decides', () => {
  beforeEach(reset);

  it.each(['CommercialCondo', 'CommercialCondop', 'CommercialCoop'])('Commercial + %s -> TH / Building is LOCKED', (ownership) => {
    choose('salePropertyType', 'Commercial');
    choose('saleCommercialOwnership', ownership);
    expect(f.w.shouldSkipTab3('sale')).toBe(true);
    expect(locked()).toBe(true);
    expect(tab().title).toMatch(/Locked/);
  });

  it.each(['WholeBuilding', 'LandOnly'])('Commercial + %s -> TH / Building stays open (it needs the tab)', (ownership) => {
    choose('salePropertyType', 'Commercial');
    choose('saleCommercialOwnership', ownership);
    expect(f.w.shouldSkipTab3('sale')).toBe(false);
    expect(open()).toBe(true);
  });

  it('Commercial with no ownership chosen yet does not lock anything', () => {
    choose('salePropertyType', 'Commercial');
    expect(open()).toBe(true);
  });
});

describe('Office and Retail: the building ownership type decides', () => {
  beforeEach(reset);

  it.each([['Office', 'Condo'], ['Office', 'Coop'], ['Office', 'Condop'], ['Retail', 'Condo'], ['Retail', 'Coop'], ['Retail', 'Condop']])(
    '%s + %s -> LOCKED',
    (type, ownership) => {
      choose('salePropertyType', type);
      choose('saleOfficeRetailOwnership', ownership);
      expect(f.w.shouldSkipTab3('sale')).toBe(true);
      expect(locked()).toBe(true);
    },
  );

  it.each([['Office', 'Townhouse'], ['Office', 'MixedUse'], ['Office', 'FeeSimple'], ['Retail', 'Townhouse']])('%s + %s -> stays open', (type, ownership) => {
    choose('salePropertyType', type);
    choose('saleOfficeRetailOwnership', ownership);
    expect(open()).toBe(true);
  });
});

describe('residential types are unchanged', () => {
  beforeEach(reset);

  it.each(['Condo', 'Coop', 'Condop', 'Loft'])('%s -> LOCKED', (type) => {
    choose('salePropertyType', type);
    expect(locked()).toBe(true);
  });

  it.each(['SingleFamilyTownhouse', 'MultiFamilyTownhouse', 'SingleFamily', 'MultiFamily'])('%s -> TH / Building open', (type) => {
    choose('salePropertyType', type);
    expect(open()).toBe(true);
  });
});

describe('the lock follows the choice both ways, and the flow skips the tab', () => {
  beforeEach(reset);

  it('a commercial condo locks it; switching the ownership to a whole building reopens it; back to condo locks it again', () => {
    choose('salePropertyType', 'Commercial');
    choose('saleCommercialOwnership', 'CommercialCondo');
    expect(locked()).toBe(true);
    choose('saleCommercialOwnership', 'WholeBuilding');
    expect(open()).toBe(true);
    expect(tab().title).toBe('');
    choose('saleCommercialOwnership', 'CommercialCondo');
    expect(locked()).toBe(true);
  });

  it('a locked tab cannot be reached by keyboard or mouse (a disabled button), and the mobile tab is locked with it', () => {
    choose('salePropertyType', 'Commercial');
    choose('saleCommercialOwnership', 'CommercialCondo');
    expect(tab().disabled).toBe(true);
    expect(tab().style.pointerEvents).toBe('none');
    const mobile = f.d.querySelectorAll('.mobile-tab')[2] as HTMLButtonElement | undefined;
    if (mobile) expect(mobile.disabled).toBe(true);
  });

  it('Next from Features goes straight to Distribution for a commercial condo (no TH / Building step)', () => {
    choose('salePropertyType', 'Commercial');
    choose('saleCommercialOwnership', 'CommercialCondo');
    const shown: number[] = [];
    const orig = f.w.showSaleMainTab;
    f.w.showSaleMainTab = (n: number) => { shown.push(n); };
    const validate = f.w.validateSaleTab;
    f.w.validateSaleTab = () => true;
    try {
      f.w.navigateNextFromFeatures('sale');
    } finally {
      f.w.showSaleMainTab = orig;
      f.w.validateSaleTab = validate;
    }
    expect(shown).toEqual([4]);
  });
});
