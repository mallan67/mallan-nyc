/// <reference types="jest" />
/**
 * A control that claims a Cotality field (data-concept) must send that field.
 *
 * `data-concept="X"` says "this control is Cotality's X". compliance:validate holds the name and the picklist to the live contract; this test holds the
 * claim to the page's own collector: it fills each such control in turn, runs collectSaleFormData / collectRentalFormData (the function that builds the
 * payload the server stores) and reads whether key X came out with a value. A control whose value only travels under the form's own internal id would
 * claim a field it never sends.
 */
import { bootAddForm, storedListing, type AddForm } from './add-form-harness';
import { normalizePayload } from '@/lib/compliance/normalizer';

jest.setTimeout(900000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGES: Array<[AddForm, string]> = [['SALE-FORM-REDESIGN', 'collectSaleFormData'], ['RENTAL-FORM-REDESIGN', 'collectRentalFormData']];

/** The collector builds these from several controls (the address line is split into number / name / suffix, the building's postal code and borough come from the address, ...). */
const COLLECTOR_OWNED = new Set(['StreetName', 'StreetNumber', 'UnitNumber', 'PostalCode', 'CityRegion', 'SubdivisionName', 'PublicRemarks', 'ListTeamKey']);
/** A unit or a frequency is sent with the amount it belongs to, never alone (the create gate refuses a unit alone: crm-form-create-gate.test.ts). */
const NEEDS_AMOUNT = new Set(['LivingAreaUnits', 'BuildingAreaUnits', 'LotSizeUnits', 'FoundationAreaUnits', 'LandLeaseAmountFrequency', 'AdditionalFeeFrequency', 'AssociationFeeFrequency', 'LeaseAmountFrequency']);
/** The amenity boxes: a box with a live BuildingFeatures member sends it, the others are kept in the form's own list (crm-form-live-members.test.ts). */
const AMENITY_LIST = new Set(['BuildingFeatures']);
const sent = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

type Findings = { emitted: string[]; internalOnly: string[]; lost: string[] };
async function unsentClaims(form: AddForm, collector: string): Promise<Findings> {
  const f = await bootAddForm(form, { settle: 800 });
  const type = form === 'SALE-FORM-REDESIGN' ? 'sale' : 'rent';
  const emitted = new Set<string>(), internalOnly = new Set<string>(), lost = new Set<string>();
  const sig = (data: any) => { try { const r: any = storedListing(data, type); return JSON.stringify([r.features, r.raw_data, r.address, Object.keys(r).sort().map((k) => r[k] && typeof r[k] !== 'object' ? r[k] : null)]); } catch { return 'x'; } };
  try {
    const w = f.w; const d: Document = f.d;
    const fire = (el: Element) => { el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
    const collect = () => w[collector]();
    let baseData: any = {}; try { baseData = collect(); } catch { baseData = {}; }
    const baseSig = sig(baseData);
    const controls = [...d.querySelectorAll('[data-concept]')] as HTMLElement[];
    for (const el of controls) {
      const concept = el.getAttribute('data-concept')!;
      if (!((w.COTALITY_FIELD_KINDS || {})[concept])) continue;   // a Mallan concept (workflow-status, auction_*), not a Cotality field
      const tag = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type;
      if ((el as HTMLInputElement).disabled || type === 'hidden') continue;
      const label = `${concept} (${el.id || (el as HTMLInputElement).name || tag})`;
      let restore: () => void = () => undefined;
      if (tag === 'select') {
        const s = el as HTMLSelectElement;
        const opts = [...s.options].filter((x) => x.value && !x.disabled && !x.hidden);
        if (!opts.length) continue;
        const was = s.value;
        restore = () => { s.value = was; fire(s); };
        // some options carry no value for the field ("Custom", "Case by Case"): the claim holds if any option is sent
        let ok = false;
        for (const o of opts) {
          s.value = o.value; fire(s);
          let dd: any = {}; try { dd = collect(); } catch { dd = {}; }
          let nn: any = {}; try { nn = normalizePayload(dd).normalized; } catch { nn = {}; }
          if (sent(dd[concept]) || sent(nn[concept])) { ok = true; break; }
        }
        if (ok) { emitted.add(label); restore(); continue; }
        s.value = opts[0].value; fire(s);
      } else if (type === 'checkbox' || type === 'radio') {
        const b = el as HTMLInputElement;
        const was = b.checked; b.checked = true; fire(b); restore = () => { b.checked = was; fire(b); };
      } else {
        const t = el as HTMLInputElement;
        const was = t.value;
        const kind = (w.COTALITY_FIELD_KINDS || {})[concept];
        t.value = type === 'datetime-local' ? '2026-01-01T10:00' : type === 'number' || kind === 'i' || kind === 'n' ? '7' : type === 'date' || kind === 'd' ? '2026-01-01' : type === 'url' ? 'https://example.com/x' : 'x1';
        fire(t); restore = () => { t.value = was; fire(t); };
      }
      let data: any = {};
      try { data = collect(); } catch { data = {}; }
      let norm: any = {}; try { norm = normalizePayload(data).normalized; } catch { norm = {}; }
      if (COLLECTOR_OWNED.has(concept) || NEEDS_AMOUNT.has(concept) || AMENITY_LIST.has(concept)) { emitted.add(label); restore(); continue; }
      if (sent(data[concept]) || sent(norm[concept])) emitted.add(label);
      else if (sig(data) !== baseSig) internalOnly.add(label);
      else lost.add(label);
      restore();
    }
  } finally { f.close(); }
  return { emitted: [...emitted].sort(), internalOnly: [...internalOnly].sort(), lost: [...lost].sort() };
}

describe('every control that claims a Cotality field sends it', () => {
  it.each(PAGES)('%s', async (form, collector) => {
    const r = await unsentClaims(form, collector);
    expect(r.emitted.length).toBeGreaterThan(130);                                  // (the controls were found)
    expect({ internalOnly: r.internalOnly, lost: r.lost }).toEqual({ internalOnly: [], lost: [] });
  });
});
