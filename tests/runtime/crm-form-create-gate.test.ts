/// <reference types="jest" />
/**
 * A listing an agent fills in on the Sale or the Rental Add form is accepted by the server's create gate.
 *
 * Found 2026-10-08 (an adversarial audit, then a run of the real pages): the forms and the gate had never been tried together. POST /api/crm/listings classifies the listing
 * (classifyRlsEligibility), and for an RLS-eligible one runs validateListing and then assertRlsCompliantPayload on the body AS THE FORM SENT IT (the aliases are applied afterwards), and
 * answers 422 for anything missing. The Sale form could never send ElevatorsTotal or NewDevelopmentYN (fields Cotality does not have, which the tables nevertheless made mandatory); it
 * sent its area units, its lot units and its property condition under its own box ids; the Rental form sent UnParsedAddress (the gate looks for UnparsedAddress), no SyndicateTo, no
 * NewConstructionYN, no AVM or consumer-comment answer, no area units; and a Draft was refused for the county, which only a change event of the borough box filled in.
 *
 * This runs the REAL pages through the collector the save uses, for the property types and every borough, and sends the body through the real gate in the route's own order.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, fillForm, sleep, storedListing, type BootedForm } from './add-form-harness';
import { classifyRlsEligibility } from '@/lib/compliance/rls-eligibility';
import { validateListing } from '@/lib/compliance/rebny-validator';
import { assertRlsCompliantPayload } from '@/lib/compliance/rls-enforcement';

jest.setTimeout(300000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const hydration: any = {};
new Function('window', readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-hydration.js'), 'utf8'))(hydration);
const numeric = (table: 'sale' | 'rental') => new Set<string>(hydration.MallanListingHydration.tables[table].FIELD_MAP.filter((r: any) => r.type === 'number').map((r: any) => r.form));

/** The route's own sequence (app/api/crm/listings/route.ts, after the body is read): classify, then validateListing, then assertRlsCompliantPayload. */
function createGate(body: Record<string, any>, listingType: 'sale' | 'rent') {
  const inHouse = ['InHouse', 'InHouseInternal', 'InHouseWebOnly'];
  const isInHouse = inHouse.includes(String(body.saleListingType || '')) || inHouse.includes(String(body.listingAgreement || ''));
  const eligibility = classifyRlsEligibility(body, { explicitOptOut: body.rls_eligible === false || isInHouse, commercialSubType: body.commercial_sub_type, commercialOwnership: body.commercial_ownership });
  if (!eligibility.rlsEligible) return { eligible: false as const, problems: [] as string[] };
  const validation = validateListing(body);
  const enforcement = assertRlsCompliantPayload(body, { listingType, isNewDevelopment: body.NewDevelopmentYN === true, currentStatus: body.MlsStatus, rlsEligible: true, mixedUseSmallBuilding: eligibility.mixedUseSmallBuilding });
  return { eligible: true as const, problems: [...validation.errors.map((e) => `validator: ${e}`), ...enforcement.blockers.map((b: any) => `gate ${b.code}: ${b.field} — ${b.message}`)] };
}

const change = (f: BootedForm, id: string, value: string) => {
  const el = f.d.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!el) throw new Error(`no control ${id}`);
  el.value = value;
  for (const type of ['input', 'change', 'blur']) el.dispatchEvent(new (f.w as any).Event(type, { bubbles: true }));
};

type Kind = { name: string; commonInterest: string };
const KINDS: Kind[] = [{ name: 'condo', commonInterest: 'Condominium' }, { name: 'co-op', commonInterest: 'StockCooperative' }];
const BOROUGHS = [['Manhattan', '10022', '333 E 46th St'], ['Brooklyn', '11201', '1 Pierrepont St'], ['Queens', '11101', '10-20 Jackson Ave'], ['Bronx', '10451', '851 Grand Concourse'], ['StatenIsland', '10301', '75 Bay St']] as const;

/** What an agent does: types the street, fills the form, picks the borough and the ownership, then the form's own derivations run. */
async function fillRealistically(form: 'SALE-FORM-REDESIGN' | 'RENTAL-FORM-REDESIGN', prefix: 'sale' | 'rental', kind: Kind, borough: readonly [string, string, string]) {
  const f = await bootAddForm(form, { settle: 600 });
  fillForm(f.d, prefix, numeric(prefix));
  // an agent listing a condo does not tick the commercial sub-types (they would make it a mixed-use building and the listing website-only)
  f.d.querySelectorAll(`input[name="${prefix}CommSubtype"], input[name="${prefix}BusinessType"], input[name="${prefix}CommercialFeatures"]`).forEach((el: any) => { el.checked = false; });
  const ownership = f.d.getElementById(`${prefix}CommercialOwnership`) as HTMLSelectElement | null;
  if (ownership) ownership.value = '';
  const street = f.d.getElementById(`${prefix}StreetAddress`) as HTMLInputElement;
  street.value = borough[2];
  f.w[prefix === 'sale' ? 'parseSaleAddress' : 'parseRentalAddress']();
  change(f, `${prefix}Borough`, borough[0]);
  change(f, `${prefix}ZipCode`, borough[1]);
  change(f, `${prefix}CommonInterest`, kind.commonInterest);
  // facts the filler cannot know: the year the building was built, a building of ordinary size
  for (const [id, v] of prefix === 'sale' ? [['saleBldgYearBuilt', '1985'], ['saleBldgTotalUnits', '120'], ['saleBldgTotalFloors', '30']] : [['bldgYearBuilt', '1985'], ['bldgTotalUnits', '120'], ['bldgTotalFloors', '30']]) {
    if (f.d.getElementById(id)) change(f, id, v);
  }
  await sleep(300);
  return f;
}

describe.each([
  ['SALE-FORM-REDESIGN', 'sale', 'sale', 'collectSaleFormData'],
  ['RENTAL-FORM-REDESIGN', 'rental', 'rent', 'collectRentalFormData'],
] as const)('%s: a filled-in form is accepted by the create gate', (form, prefix, listingType, collector) => {
  for (const kind of KINDS) {
    it(`${kind.name} in Manhattan: nothing the gate asks for is missing`, async () => {
      const f = await fillRealistically(form, prefix, kind, BOROUGHS[0]);
      try {
        const verdict = createGate(f.w[collector](), listingType);
        expect(verdict.eligible).toBe(true);
        expect(verdict.problems).toEqual([]);
      } finally { f.close(); }
    });
  }

  it.each(BOROUGHS.slice(1))('a %s listing: the county is derived and accepted', async (...borough) => {
    const f = await fillRealistically(form, prefix, KINDS[0], borough as unknown as readonly [string, string, string]);
    try {
      const body = f.w[collector]();
      const verdict = createGate(body, listingType);
      expect(verdict.eligible).toBe(true);
      expect(body.CountyOrParish).toBeTruthy();
      expect(verdict.problems).toEqual([]);
    } finally { f.close(); }
  });
});

// ── The lists the forms offer are Cotality's, a missing answer is named, an old saved value loads, and a unit travels with its area ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { JSDOM } = require('jsdom');
const liveEnums = JSON.parse(readFileSync(resolve(__dirname, '../../data/cotality-enums.live.json'), 'utf8')).enums as Record<string, string[]>;
const pageDoc = (name: string): Document => new JSDOM(readFileSync(resolve(__dirname, `../../public/crm/${name}.html`), 'utf8')).window.document;
const optionValues = (doc: Document, id: string) => [...doc.querySelectorAll(`#${id} option`)].map((o) => (o as HTMLOptionElement).value).filter((v) => v !== '');
const sorted = (list: string[]) => [...list].sort();

describe('the lists the Add forms offer are the live Cotality lists', () => {
  const sale = pageDoc('SALE-FORM-REDESIGN');
  const rental = pageDoc('RENTAL-FORM-REDESIGN');
  const saleTools = pageDoc('SALE-FORM-WITH-TOOLS');          // the Tools viewers are forks of the forms and show the whole stored listing: they offer the same lists
  const rentalTools = pageDoc('RENTAL-FORM-WITH-TOOLS');

  it.each([['Sale', sale, 'saleCondition'], ['Rental', rental, 'rentalCondition'], ['Sale Tools viewer', saleTools, 'saleCondition'], ['Rental Tools viewer', rentalTools, 'rentalCondition']] as const)('%s: the Condition box lists the members of PropertyCondition, and keeps only the earlier word "Fair" as a hidden choice', (_name, doc, id) => {
    const hidden = [...doc.querySelectorAll(`#${id} option[hidden]`)].map((o) => (o as HTMLOptionElement).value);
    expect(hidden).toEqual(['Fair']);
    expect(sorted(optionValues(doc, id).filter((v) => v !== 'Fair'))).toEqual(sorted(liveEnums.PropertyCondition));
  });

  it('the hydration module knows the same members, and maps only the earlier words that have a member of the same name', () => {
    const w: any = {};
    new Function('window', readFileSync(resolve(__dirname, '../../public/crm/js/forms/listing-hydration.js'), 'utf8'))(w);
    expect(sorted(w.MallanListingHydration.PROPERTY_CONDITION)).toEqual(sorted(liveEnums.PropertyCondition));
    const condition = w.MallanListingHydration.propertyCondition;
    for (const member of liveEnums.PropertyCondition) expect(condition(member)).toBe(member);                    // every live member, the first one too, is recognised as itself
    expect([condition('Excellent'), condition('Good'), condition('Poor'), condition('Updated'), condition(' Turnkey ')]).toEqual(['Excellent', 'GoodCondition', 'PoorCondition', 'UpdatedRemodeled', 'Turnkey']);
    expect([condition('Fair'), condition(''), condition(null), condition(undefined), condition('Mint')]).toEqual(['', '', '', '', '']);
  });

  it.each([['Sale form', sale], ['Sale Tools viewer', saleTools]] as const)('the %s offers exactly the members of SpecialListingConditions', (_name, doc) => {
    const values = [...doc.querySelectorAll('input[name="saleSpecialListingConditions"]')].map((e) => (e as HTMLInputElement).value);
    expect(sorted(values)).toEqual(sorted(liveEnums.SpecialListingConditions));
    expect(new Set(values).size).toBe(values.length);
  });

  it('every area unit and lot unit a form offers is a member of Cotality\'s list for it, and none is offered twice', () => {
    for (const [doc, id, list] of [[sale, 'saleLivingAreaUnits', 'AreaUnits'], [sale, 'saleTHBuildingAreaUnits', 'AreaUnits'], [sale, 'saleTHLotSizeUnits', 'LotSizeUnits'],
      [rental, 'rentalLivingAreaUnits', 'AreaUnits'], [rental, 'rentalTHBuildingAreaUnits', 'AreaUnits'], [rental, 'rentalTHLotSizeUnits', 'LotSizeUnits'],
      [saleTools, 'saleLivingAreaUnits', 'AreaUnits'], [saleTools, 'saleTHBuildingAreaUnits', 'AreaUnits'], [saleTools, 'saleTHLotSizeUnits', 'LotSizeUnits'],
      [rentalTools, 'rentalLivingAreaUnits', 'AreaUnits'], [rentalTools, 'rentalTHBuildingAreaUnits', 'AreaUnits'], [rentalTools, 'rentalTHLotSizeUnits', 'LotSizeUnits']] as const) {
      const values = optionValues(doc, id);
      expect(values.length).toBeGreaterThan(0);
      expect(values.filter((v) => !liveEnums[list].includes(v))).toEqual([]);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('the syndication maps send only members of SyndicateTo', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 300 });
    try {
      const hydration = f.w.MallanListingHydration.tables.sale.SYNDICATION_MAP as { cotality: string | null }[];
      for (const map of [hydration, f.w.RENTAL_SYNDICATION_MAP as { cotality: string | null }[]]) {
        const sent = map.map((e) => e.cotality).filter((v): v is string => !!v);
        expect(sent.length).toBeGreaterThan(0);
        expect(sent.filter((v) => !liveEnums.SyndicateTo.includes(v))).toEqual([]);
      }
    } finally { f.close(); }
  });
});

describe.each([
  ['SALE-FORM-REDESIGN', 'sale', 'collectSaleFormData'],
  ['RENTAL-FORM-REDESIGN', 'rental', 'collectRentalFormData'],
] as const)('%s: what the gate is told, and what it is not', (form, prefix, collector) => {
  it('a unit is sent with the area it belongs to, and not alone', async () => {
    const f = await bootAddForm(form, { settle: 300 });
    try {
      const keys = (body: Record<string, any>) => ['LivingAreaUnits', 'BuildingAreaUnits', 'LotSizeUnits'].filter((k) => k in body);
      expect(keys(f.w[collector]())).toEqual([]);                                 // no area typed: no unit asserted
      change(f, prefix === 'sale' ? 'saleUnitSqFt' : 'rentalSqFt', '1100');
      change(f, `${prefix}THBuildingArea`, '2400');
      change(f, `${prefix}THLotSize`, '2000');
      change(f, `${prefix}LivingAreaUnits`, 'SquareMeters');
      change(f, `${prefix}THBuildingAreaUnits`, 'SquareFeet');
      change(f, `${prefix}THLotSizeUnits`, 'Acres');
      const body = f.w[collector]();
      expect({ living: [body.LivingArea, body.LivingAreaUnits], building: [body.BuildingAreaTotal, body.BuildingAreaUnits], lot: [body.LotSizeArea, body.LotSizeUnits] })
        .toEqual({ living: [1100, 'SquareMeters'], building: [2400, 'SquareFeet'], lot: [2000, 'Acres'] });
    } finally { f.close(); }
  });

  it('the county follows the borough, whichever way the borough was set', async () => {
    const f = await bootAddForm(form, { settle: 300 });
    try {
      const borough = f.d.getElementById(`${prefix}Borough`) as HTMLSelectElement;
      borough.value = 'Brooklyn';                                                  // set without a change event (the address lookup, a stored listing)
      (f.d.getElementById(`${prefix}CountyOrParish`) as HTMLInputElement).value = '';
      expect(f.w[collector]().CountyOrParish).toBe('Kings');
    } finally { f.close(); }
  });
});

describe('SALE-FORM-REDESIGN: a condo whose agent left out a required answer is told which', () => {
  it('names SpecialListingConditions and PropertyCondition, and nothing else, when neither was given', async () => {
    const f = await fillRealistically('SALE-FORM-REDESIGN', 'sale', KINDS[0], BOROUGHS[0]);
    try {
      f.d.querySelectorAll('input[name="saleSpecialListingConditions"]').forEach((el: any) => { el.checked = false; });
      change(f, 'saleCondition', '');
      const body = f.w.collectSaleFormData();
      const verdict = createGate(body, 'sale');
      expect(verdict.eligible).toBe(true);
      expect('SpecialListingConditions' in body).toBe(false);                      // nothing ticked is no answer (an empty list would pass the gate as one)
      expect('PropertyCondition' in body).toBe(false);
      expect(verdict.problems.filter((p) => !/SpecialListingConditions|PropertyCondition/.test(p))).toEqual([]);
      expect(verdict.problems.some((p) => /SpecialListingConditions/.test(p))).toBe(true);
      expect(verdict.problems.some((p) => /PropertyCondition/.test(p))).toBe(true);
    } finally { f.close(); }
  });
});

describe.each([
  ['SALE-FORM-REDESIGN', 'sale', 'sale', 'saleCondition', 'collectSaleFormData'],
  ['RENTAL-FORM-REDESIGN', 'rental', 'rent', 'rentalCondition', 'collectRentalFormData'],
] as const)('%s: a stored listing\'s condition and units load', (form, prefix, listingType, conditionId, collector) => {
  const open = async (raw: Record<string, any>) => {
    const f = await bootAddForm(form, { settle: 300 });
    let stored: Record<string, any>;
    try { stored = storedListing(f.w[collector](), listingType) as Record<string, any>; } finally { f.close(); }
    stored.raw_data = { ...stored.raw_data, ...raw };
    return bootAddForm(form, { search: '?id=1', listing: stored, settle: 1500 });
  };
  const value = (f: BootedForm, id: string) => (f.d.getElementById(id) as HTMLSelectElement).value;

  it.each([['Good', 'GoodCondition'], ['Poor', 'PoorCondition'], ['Updated', 'UpdatedRemodeled'], ['Excellent', 'Excellent']])('a listing saved with the earlier word "%s" shows the member %s and sends it', async (stored, member) => {
    const f = await open({ [conditionId]: stored });
    try {
      expect(value(f, conditionId)).toBe(member);
      expect(f.w[collector]().PropertyCondition).toEqual([member]);
    } finally { f.close(); }
  });

  it('a listing saved with "Fair" (no member) still shows it, sends no PropertyCondition, and is not lost', async () => {
    const f = await open({ [conditionId]: 'Fair' });
    try {
      expect(value(f, conditionId)).toBe('Fair');
      const body = f.w[collector]();
      expect('PropertyCondition' in body).toBe(false);
      expect(body[conditionId]).toBe('Fair');
    } finally { f.close(); }
  });

  it('a listing that holds the canonical list only (a synced one) shows its first member', async () => {
    const f = await open({ [conditionId]: undefined, PropertyCondition: ['Turnkey', 'ShowsWell'] });
    try { expect(value(f, conditionId)).toBe('Turnkey'); } finally { f.close(); }
  });

  it('a listing that holds the canonical unit only shows it', async () => {
    const f = await open({ [`${prefix}LivingAreaUnits`]: undefined, [`${prefix}THBuildingAreaUnits`]: undefined, [`${prefix}THLotSizeUnits`]: undefined, LivingAreaUnits: 'SquareMeters', BuildingAreaUnits: 'SquareMeters', LotSizeUnits: 'Hectares' });
    try {
      expect([value(f, `${prefix}LivingAreaUnits`), value(f, `${prefix}THBuildingAreaUnits`), value(f, `${prefix}THLotSizeUnits`)]).toEqual(['SquareMeters', 'SquareMeters', 'Hectares']);
    } finally { f.close(); }
  });
});

describe('SALE-FORM-REDESIGN: the special listing conditions are saved as a list and come back', () => {
  it('saves the ticked boxes as a list under the Cotality name, and shows them on edit', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 300 });
    let stored: Record<string, any>;
    try {
      f.d.querySelectorAll('input[name="saleSpecialListingConditions"]').forEach((el: any) => { el.checked = ['Standard', 'Estate'].includes(el.value); });
      const body = f.w.collectSaleFormData();
      expect(body.SpecialListingConditions).toEqual(['Estate', 'Standard']);       // the order of the boxes
      expect('saleSpecialListingConditions' in body).toBe(false);
      stored = storedListing(body, 'sale') as Record<string, any>;
    } finally { f.close(); }
    const g = await bootAddForm('SALE-FORM-REDESIGN', { search: '?id=1', listing: stored, settle: 1500 });
    try {
      const ticked = [...g.d.querySelectorAll('input[name="saleSpecialListingConditions"]:checked')].map((e: any) => e.value);
      expect(ticked).toEqual(['Estate', 'Standard']);
    } finally { g.close(); }
  });
});

describe('RENTAL-FORM-REDESIGN: what the Rental form tells Cotality about syndication, construction and display', () => {
  it('sends the ticked destinations Cotality lists as SyndicateTo, the others in its own list, and nothing for an opt-out', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 300 });
    try {
      const body = f.w.collectRentalFormData();
      expect(body.SyndicateTo).toEqual(['Listhub', 'Realtorcom']);                 // ticked by default: Listhub, NY MLS, Realtor
      expect(body._rentalSyndicateInternal).toEqual(['NYMLS']);
      const optOut = f.d.querySelector('input[name="rentalListingType"][value="RLS-Owner-OptOut"]') as HTMLInputElement;
      optOut.checked = true;
      expect(f.w.collectRentalFormData().SyndicateTo).toEqual([]);
    } finally { f.close(); }
  });

  it('sends NewConstructionYN from the building tab\'s New Construction box, and the two per-row display answers as booleans', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 300 });
    try {
      const before = f.w.collectRentalFormData();
      expect(before.NewConstructionYN).toBe(false);
      expect(before.InternetAutomatedValuationDisplayYN).toBe(true);                // the radio's default answer is Yes
      expect(before.InternetConsumerCommentYN).toBe(false);                         // the box starts unticked
      (f.d.getElementById('bldgNewConstruction') as HTMLInputElement).checked = true;
      (f.d.querySelector('input[name="rentalInternetAVMDisplayYN"][value="No"]') as HTMLInputElement).checked = true;
      (f.d.getElementById('rentalInternetConsumerCommentYN') as HTMLInputElement).checked = true;
      const after = f.w.collectRentalFormData();
      expect([after.NewConstructionYN, after.InternetAutomatedValuationDisplayYN, after.InternetConsumerCommentYN]).toEqual([true, false, true]);
    } finally { f.close(); }
  });

  it('sends UnparsedAddress (lowercase p), the live Cotality name, and no capital-P spelling', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 300 });
    try {
      (f.d.getElementById('rentalStreetAddress') as HTMLInputElement).value = '333 E 46th St';
      f.w.parseRentalAddress();
      const body = f.w.collectRentalFormData();
      expect(body.UnparsedAddress).toBe('333 E 46th St');
      expect('UnParsedAddress' in body).toBe(false);
    } finally { f.close(); }
  });
});
