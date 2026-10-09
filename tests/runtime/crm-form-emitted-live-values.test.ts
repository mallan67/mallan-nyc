/// <reference types="jest" />
/**
 * What the two Add forms EMIT for a live Cotality enumeration is a member of it - except for the gaps listed here, which are named, explained and fail the suite when they change.
 *
 * Found 2026-10-09 (Maya: "there is no noise, there are errors and the need fixing. Do not assume, do actual corrections"): the unit pet words (Unit*), the Rental building amenities (their visible labels),
 * the Sale View words and the Rental "Owner Pays" box all sent values live Cotality does not have, and nothing noticed, because the tests that check a page against the live lists look at what a control
 * OFFERS (and then only for a few fields), not at what the page's collector SENDS after a translation. This test sets every option of every select, radio and checkbox of each page in turn, runs the page's
 * own collector, and checks every value sent for a key that is a live Property enumeration against data/cotality-enums.live.json.
 *
 * The same goes for the KEYS a collector sends (KNOWN_NON_PROPERTY_KEYS): the provider-style names (a capital first letter) that are not fields of the live Property resource.
 *
 * KNOWN_GAPS is the inventory of what is left, per form. Each entry is a value the page sends that the live list does not have, with the reason it is still there. The test fails when a page sends a NEW
 * value that is not a member (so a new control cannot repeat the error), and when a gap listed here is no longer sent (so the list is cleaned when a gap is closed).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { bootAddForm, type AddForm } from './add-form-harness';

jest.setTimeout(900000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const live: { entities: Record<string, Record<string, string>>; enums: Record<string, string[]> } = JSON.parse(readFileSync(resolve(__dirname, '../../data/cotality-enums.live.json'), 'utf8'));

const WORKFLOW = 'a word of Mallan\'s own listing workflow, not a Cotality status: the status route (not this field) decides the stored status';
const STRUCTURE = 'UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED: the live StructureType list has no such member (Loft and WalkUp are live ArchitecturalStyle members; "Commercial" has none); whether these options move to another field or go is the product\'s call';
const SUBTYPE = 'UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED: the live PropertySubType list has Townhouse (no single / multi family split); which member each option stands for is the product\'s call';
const COMMERCIAL = 'Mallan\'s own classification word: lib/compliance/rls-eligibility.ts treats PropertyType "Commercial" as website-only (not RLS-eligible) and public search reads it; the live members are CommercialSale / CommercialLease, so changing the word means changing those rules with it';
const PERMISSION = 'UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED: the live Permission list has no OwnerOptOut; the owner opt-out is derived from this word by lib/compliance/normalizer.ts (derivePermissionBooleans)';

/** form -> "Field = value" -> why the page still sends it */
const KNOWN_GAPS: Record<string, Record<string, string>> = {
  'SALE-FORM-REDESIGN': {
    'MlsStatus = Draft': WORKFLOW, 'MlsStatus = Sold': WORKFLOW, 'MlsStatus = Cancelled': WORKFLOW,
    'StructureType = Loft': STRUCTURE, 'StructureType = WalkUp': STRUCTURE, 'StructureType = Commercial': STRUCTURE,
    'PropertySubType = SingleFamilyTownhouse': SUBTYPE, 'PropertySubType = MultiFamilyTownhouse': SUBTYPE,
    'PropertyType = Commercial': COMMERCIAL,
    'Permission = OwnerOptOut': PERMISSION,
  },
  'RENTAL-FORM-REDESIGN': {
    'StructureType = Loft': STRUCTURE, 'StructureType = WalkUp': STRUCTURE, 'StructureType = Commercial': STRUCTURE,
    'PropertySubType = SingleFamilyTownhouse': SUBTYPE, 'PropertySubType = MultiFamilyTownhouse': SUBTYPE,
    'PropertyType = Commercial': COMMERCIAL,
  },
};

const BUILDING_PROFILE = 'a Mallan Building Profile / form field with a provider-style name: the persistence map routes it to features and raw_data; it is not a Property field';
const FARE_LEGACY = 'a legacy fee-disclosure name (a CustomProperty field in Cotality, not a Property field): raw_data only, read by lib/crm/fee-disclosure.ts as the fallback when the canonical MoveInCosts fields are blank';
const ALIASED = 'a name the normalizer renames (REBNY_FIELD_TABLES.aliasToCanonical) to the live one';
const PHANTOM_RENTAL = 'UNRESOLVED - LIVE COTALITY/REBNY CONTRACT EVIDENCE REQUIRED: not in the live metadata, raw_data only; the Sale form stopped sending it (Cotality-clean 2026-05-30) and keeps the value under its own key with a legacy reload, the Rental form still sends it';
const MALLAN_OWN = 'a Mallan field with a provider-style name; not a live Property field, raw_data only';
const NYC_FACT = 'an NYC fact the rule table classifies (rebny-field-tables.ts header), not a top-level Property field: sent as the agent\'s answer because the create gate (CS-002: no Coming Soon for a new development; SPONSOR-001) and the building search read it; persisted in features and raw_data';

/** form -> key -> why the collector still sends it */
const KNOWN_NON_PROPERTY_KEYS: Record<string, Record<string, string>> = {
  'SALE-FORM-REDESIGN': {
    AttendanceType: BUILDING_PROFILE, BathroomsTotal: BUILDING_PROFILE, BuildingLaundryFeatures: BUILDING_PROFILE, BuildingPetsAllowed: BUILDING_PROFILE, FlipTax: BUILDING_PROFILE,
    SponsorUnitYN: BUILDING_PROFILE, TaxAbatementComments: BUILDING_PROFILE, TaxAbatementYN: BUILDING_PROFILE, CoBrokeAgreement: MALLAN_OWN, NewDevelopmentYN: NYC_FACT,
  },
  'RENTAL-FORM-REDESIGN': {
    AttendanceType: BUILDING_PROFILE, BathroomsTotal: BUILDING_PROFILE, BuildingLaundryFeatures: BUILDING_PROFILE, BuildingPetsAllowed: BUILDING_PROFILE, ElevatorsTotal: BUILDING_PROFILE,
    NewDevelopmentYN: BUILDING_PROFILE, TaxAbatementComments: BUILDING_PROFILE, TaxAbatementYN: BUILDING_PROFILE, CoBrokeAgreement: MALLAN_OWN,
    AdditionalFee: FARE_LEGACY, AdditionalFeeDescription: FARE_LEGACY, AdditionalFeeFrequency: FARE_LEGACY, AdditionalFeeYN: FARE_LEGACY, FeeFrequency: FARE_LEGACY,
    IDXEntireListingDisplayYN: ALIASED, Permissions: ALIASED,
    RentingAllowedYN: PHANTOM_RENTAL, SyndicateYN: PHANTOM_RENTAL, YearRenovated: PHANTOM_RENTAL, FirstShowingDate: MALLAN_OWN, NetMonthlyRent: MALLAN_OWN,
  },
};

const PAGES: Array<[string, string]> = [['SALE-FORM-REDESIGN', 'collectSaleFormData'], ['RENTAL-FORM-REDESIGN', 'collectRentalFormData']];
const parts = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(parts) : typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

/** Every "Field = value" a page sends, for a key that is a live Property enumeration, that is not a member of it - over the default form and each single option of each control. */
async function emittedNonMembers(form: string, collector: string): Promise<Record<string, string>> {
  const f = await bootAddForm(form as AddForm, { settle: 800 });
  const found: Record<string, string> = {};
  try {
    const w = f.w; const d: Document = f.d;
    const collect = () => w[collector]();
    const base = collect();
    const fire = (el: Element) => el.dispatchEvent(new w.Event('change', { bubbles: true }));
    const check = (where: string, data: any, onlyChanged: boolean) => {
      for (const [k, v] of Object.entries<any>(data)) {
        if (!(k in live.entities.Property) || !live.enums[k]) continue;
        if (onlyChanged && JSON.stringify(v) === JSON.stringify(base[k])) continue;
        for (const p of parts(v)) if (!live.enums[k].includes(p)) found[`${k} = ${p}`] = found[`${k} = ${p}`] ?? where;
      }
    };
    check('(the default form)', base, false);
    for (const s of [...d.querySelectorAll('select')] as HTMLSelectElement[]) {
      const original = s.value;
      for (const o of [...s.options]) {
        if (o.value === original || o.disabled) continue;
        s.value = o.value; fire(s);
        check(`${s.id || s.name} = ${o.value}`, collect(), true);
      }
      s.value = original; fire(s);
    }
    const boxes = [...d.querySelectorAll('input[type=radio], input[type=checkbox]')] as HTMLInputElement[];
    const checkedRadio = new Map<string, HTMLInputElement>();
    for (const b of boxes) if (b.type === 'radio' && b.checked) checkedRadio.set(b.name, b);
    for (const b of boxes) {
      if (b.checked || b.disabled) continue;
      b.checked = true; fire(b);
      check(`${b.name || b.id} = ${b.value}`, collect(), true);
      b.checked = false; fire(b);
      if (b.type === 'radio' && checkedRadio.has(b.name)) { checkedRadio.get(b.name)!.checked = true; fire(checkedRadio.get(b.name)!); }
    }
  } finally { f.close(); }
  return found;
}

describe('what the Add forms send for a live enumeration is a member of it, but for the gaps listed here', () => {
  it.each(PAGES)('%s', async (form, collector) => {
    const found = await emittedNonMembers(form, collector);
    const known = KNOWN_GAPS[form];
    expect({ newlyFound: Object.keys(found).filter((k) => !(k in known)).sort() }).toEqual({ newlyFound: [] });
    expect({ noLongerSent: Object.keys(known).filter((k) => !(k in found)).sort() }).toEqual({ noLongerSent: [] });
  });

  it('every gap names its reason', () => {
    for (const gaps of Object.values(KNOWN_GAPS)) for (const [gap, reason] of Object.entries(gaps)) expect({ gap, reason: reason.length > 40 }).toEqual({ gap, reason: true });
  });
});

/** The provider-style keys (a capital first letter) a page's collector assigns on its payload: read from the source of the function. */
function collectorKeys(form: string, fn: string): string[] {
  const html = readFileSync(resolve(__dirname, `../../public/crm/${form}.html`), 'utf8');
  const start = html.indexOf(`function ${fn}(`);
  if (start === -1) throw new Error(`not found: ${fn}`);
  let depth = 0, end = html.indexOf('{', start);
  for (let i = end; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = html.slice(start, end + 1);
  const keys = new Set<string>();
  for (const m of body.matchAll(/\bdata\.([A-Z][A-Za-z0-9_]*)\s*=(?!=)/g)) keys.add(m[1]);
  for (const m of body.matchAll(/\bdata\[['"]([A-Z][A-Za-z0-9_]*)['"]\]\s*=(?!=)/g)) keys.add(m[1]);
  return [...keys].sort();
}

describe('the provider-style keys the collectors send are fields of the live Property resource, but for the ones listed here', () => {
  it.each(PAGES)('%s', (form, collector) => {
    const keys = collectorKeys(form, collector);
    expect(keys.length).toBeGreaterThan(80);                                         // (the function was read)
    const notProperty = keys.filter((k) => !(k in live.entities.Property));
    const known = KNOWN_NON_PROPERTY_KEYS[form];
    expect({ newlyFound: notProperty.filter((k) => !(k in known)) }).toEqual({ newlyFound: [] });
    expect({ noLongerSent: Object.keys(known).filter((k) => !notProperty.includes(k)).sort() }).toEqual({ noLongerSent: [] });
  });

  it('every key names its reason', () => {
    for (const keys of Object.values(KNOWN_NON_PROPERTY_KEYS)) for (const [key, reason] of Object.entries(keys)) expect({ key, reason: reason.length > 40 }).toEqual({ key, reason: true });
  });
});
