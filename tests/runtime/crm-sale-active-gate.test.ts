/// <reference types="jest" />
/**
 * A Sale listing cannot become Active until every required field is complete (Maya, 2026-11-02): "instead of guessing which field was missed, the field should be
 * highlighted and show which tab it is at". These tests drive the REAL Sale form.
 *
 * Unchanged on purpose: the REBNY required-field list itself (SALE_REQUIRED_FIELDS), Draft saves, InHouse listings (not on RLS), and moves between statuses that are
 * already live. Only what happens when a required field is missing changed.
 */
import { bootAddForm, sleep, type BootedForm } from './add-form-harness';

jest.setTimeout(180000);
/* eslint-disable @typescript-eslint/no-explicit-any */

const status = (f: BootedForm) => (f.d.getElementById('saleStatus') as HTMLSelectElement).value;
const chooseStatus = (f: BootedForm, value: string) => {
  const el = f.d.getElementById('saleStatus') as HTMLSelectElement;
  el.value = value;
  el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
};
const panel = (f: BootedForm) => f.d.getElementById('saleValidationPanel')!;
const listItems = (f: BootedForm) => [...f.d.querySelectorAll('#saleMissingFieldsList li')].map((li) => li.textContent ?? '');
const missingNow = (f: BootedForm): any[] => (f.w as any).collectSaleMissingRequired();

// every ancestor that would hide an element: the page hides tabs, sub-tabs and the Building window with an inline display:none or the Tailwind `hidden` class
// (not jsdom's getComputedStyle: its selector engine cannot parse the page's escaped Tailwind rules)
const hiddenBy = (el: Element | null, _w: any): string[] => {
  const out: string[] = [];
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (e.classList.contains('hidden') || (e as HTMLElement).style?.display === 'none') out.push(e.id || e.className.toString().slice(0, 40) || e.tagName);
  }
  return out;
};

// fills a required field the way an agent would
function fill(f: BootedForm, m: any) {
  const field = m.field;
  if (field.type === 'garage') {
    const no = f.d.querySelector('input[name="saleGarageSpaces"][value="No"]') as HTMLInputElement;
    no.checked = true; no.dispatchEvent(new f.w.Event('change', { bubbles: true }));
    return;
  }
  if (field.type === 'checkboxGroup') {
    const first = f.d.querySelector(`input[name="${field.name}"]`) as HTMLInputElement | null;
    if (first) { first.checked = true; first.dispatchEvent(new f.w.Event('change', { bubbles: true })); }
    return;
  }
  if (field.type === 'radio') {
    const first = f.d.querySelector(`input[name="${field.name}"]`) as HTMLInputElement | null;
    if (first) { first.checked = true; first.dispatchEvent(new f.w.Event('change', { bubbles: true })); }
    return;
  }
  const el = f.d.getElementById(field.id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (!el) return;
  if (el.tagName === 'SELECT') {
    const opt = [...(el as HTMLSelectElement).options].find((o) => o.value && o.value !== 'Draft' && o.value !== 'Fair');
    if (opt) (el as HTMLSelectElement).value = opt.value;
  } else if ((el as HTMLInputElement).type === 'date') el.value = '2027-01-15';
  else if ((el as HTMLInputElement).type === 'number') el.value = '2';
  else el.value = 'x';
  el.dispatchEvent(new f.w.Event('change', { bubbles: true }));
}

async function fillEverything(f: BootedForm) {
  for (let pass = 0; pass < 6 && missingNow(f).length; pass++) {
    for (const m of missingNow(f)) fill(f, m);
    await sleep(50);
  }
}

describe('a new listing cannot be made Active while required fields are empty', () => {
  it('refuses Active, keeps the status, and says which fields are missing and on which tab', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      expect(status(f)).toBe('Draft');
      chooseStatus(f, 'Active');
      expect(status(f)).toBe('Draft');                                        // refused
      expect(panel(f).classList.contains('hidden')).toBe(false);              // and the list is SHOWN (it used to be hidden again at once)
      const items = listItems(f);
      expect(items.length).toBeGreaterThan(5);
      expect(items.some((t) => t.startsWith('Listing Info — CoBroke Agreement Type'))).toBe(true);
      expect(items.some((t) => t.startsWith('Unit Info — '))).toBe(true); // other tabs are named too
      expect(items.length).toBe(missingNow(f).length);
      expect([...new Set(f.errors)]).toEqual([]);
    } finally { f.close(); }
  });

  it('boxes every missing field in red, including a radio group, and puts the count on each tab', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Active');
      const boxed = (id: string) => f.d.getElementById(id)!.classList.contains('sale-missing-field');
      expect(boxed('saleCoBrokeAgreementType')).toBe(true);
      const missingRadio = missingNow(f).find((m) => m.field.type === 'radio');
      expect(missingRadio).toBeTruthy();                                       // a blank form has radio groups left to answer (e.g. Heating, Cooling)
      const radio = f.d.querySelector(`input[name="${missingRadio.field.name}"]`) as HTMLInputElement;
      const row = (radio.closest('label') as HTMLElement).parentElement!;
      expect(row.classList.contains('sale-missing-field')).toBe(true);        // a radio group is boxed as a row
      const badge = f.d.querySelector('#sidebarTab1 .sale-tab-missing');
      expect(badge).not.toBeNull();
      expect(Number(badge!.textContent)).toBe(missingNow(f).filter((m) => m.tab === 1).length);
    } finally { f.close(); }
  });

  it('every required field can be jumped to: its tab and sub-tab open and the field is on screen', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Active');
      const unreachable: string[] = [];
      for (const m of missingNow(f)) {
        (f.w as any).revealSaleField(m);
        const el = (f.w as any).saleFieldElements(m.field)[0];
        const why = el ? hiddenBy(el, f.w) : ['no such control'];
        if (why.length) unreachable.push(`${m.tabName} — ${m.label}: hidden by ${why.join(', ')}`);
      }
      expect(unreachable).toEqual([]);
    } finally { f.close(); }
  });

  it('the list item for a field jumps to it', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Active');
      const idx = missingNow(f).findIndex((m) => m.label === 'Bedrooms');
      expect(idx).toBeGreaterThanOrEqual(0);
      (f.d.querySelector(`#saleMissingFieldsList [data-sale-missing="${idx}"]`) as HTMLElement).click();
      expect(f.d.getElementById('saleMainTab2')!.style.display).not.toBe('none');   // Unit Info is open
      expect(f.d.getElementById('saleMainTab1')!.style.display).toBe('none');
    } finally { f.close(); }
  });
});

describe('with every required field complete', () => {
  it('Active is allowed, and the list and the boxes are gone', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Active');                                              // refused first: the list is up
      expect(panel(f).classList.contains('hidden')).toBe(false);
      await fillEverything(f);
      expect(missingNow(f)).toEqual([]);
      chooseStatus(f, 'Active');
      expect(status(f)).toBe('Active');
      expect(panel(f).classList.contains('hidden')).toBe(true);
      expect(f.d.querySelectorAll('.sale-missing-field').length).toBe(0);
      expect(f.d.querySelectorAll('.sale-tab-missing').length).toBe(0);
    } finally { f.close(); }
  });

  it('the list and the boxes clear as the fields are filled', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Active');
      const before = listItems(f).length;
      const box = f.d.getElementById('saleCoBrokeAgreementType') as HTMLSelectElement;
      expect(box.classList.contains('sale-missing-field')).toBe(true);
      const opt = Array.from(box.options).find((o) => o.value);
      expect(opt).toBeTruthy();
      box.value = opt!.value; box.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      expect(listItems(f).length).toBe(before - 1);                           // one less in the list
      expect(box.classList.contains('sale-missing-field')).toBe(false);       // and its box is gone
    } finally { f.close(); }
  });
});

describe('what stays as it was', () => {
  it('a listing that is already live is not held back when it moves to another live status', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      const sel = f.d.getElementById('saleStatus') as HTMLSelectElement;
      sel.value = 'Active';                                                   // as a restored listing is: no change event
      sel.dispatchEvent(new f.w.Event('focus'));                              // the agent opens the box
      chooseStatus(f, 'OfferOut');
      expect(status(f)).toBe('OfferOut');
    } finally { f.close(); }
  });

  it('an InHouse listing (not on RLS) can be made Active', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      const radio = f.d.querySelector('input[name="saleListingType"][value="InHouseInternal"]') as HTMLInputElement;
      expect(radio).not.toBeNull();
      radio.checked = true;
      chooseStatus(f, 'Active');
      expect(status(f)).toBe('Active');
    } finally { f.close(); }
  });

  it('validateREBNYRequired still answers with the labels', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      const labels: string[] = (f.w as any).validateREBNYRequired('sale');
      expect(labels).toEqual(missingNow(f).map((m) => m.label));
      expect(labels).toContain('CoBroke Agreement Type');
    } finally { f.close(); }
  });

  it('Draft is never blocked: choosing Draft shows nothing', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Future');
      expect(status(f)).toBe('Future');
      expect(panel(f).classList.contains('hidden')).toBe(true);
    } finally { f.close(); }
  });
});

describe('the fields the REBNY server requires and the agent fills (they used to reach the server unflagged)', () => {
  it('are in the list with their tab, the Building window included', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Active');
      const items = listItems(f).join('\n');
      for (const want of ['Listing Info \u2014 Street Address', 'Listing Info \u2014 Borough', 'Listing Info \u2014 Zip Code', 'Listing Info \u2014 Neighborhood', 'Listing Info \u2014 Structure Type',
        'Listing Info \u2014 Ownership Type', 'Listing Info \u2014 Concessions', 'Listing Info \u2014 Showing Instructions', 'Unit Info \u2014 Total Rooms', 'Unit Info \u2014 Pets Allowed',
        'Building window \u2014 Year Built', 'Building window \u2014 Total Floors', 'Building window \u2014 Tax Block', 'Unit Info \u2014 Tax Lot']) expect(items).toContain(want);
    } finally { f.close(); }
  });

  it('a Building window field opens that window and its sub-tab when its item is clicked', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Active');
      expect(f.d.getElementById('saleBuildingModal')!.classList.contains('hidden')).toBe(true);
      const idx = missingNow(f).findIndex((m) => m.label === 'Tax Block');
      expect(idx).toBeGreaterThanOrEqual(0);
      (f.d.querySelector(`#saleMissingFieldsList [data-sale-missing="${idx}"]`) as HTMLElement).click();
      expect(f.d.getElementById('saleBuildingModal')!.classList.contains('hidden')).toBe(false);
      expect(hiddenBy(f.d.getElementById('saleBldgTaxBlock'), f.w)).toEqual([]);                  // the Financials sub-tab is open
    } finally { f.close(); }
  });

  it('Structure Type is answered by either box, and so is Neighborhood', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      const has = (label: string) => missingNow(f).some((m) => m.label === label);
      expect(has('Structure Type')).toBe(true);
      const bt = f.d.getElementById('saleBldgType') as HTMLSelectElement;
      const opt = Array.from(bt.options).find((o) => o.value);
      bt.value = opt!.value;                                                                   // the Building window's box, not the main tab's
      expect(has('Structure Type')).toBe(false);
      expect(has('Neighborhood')).toBe(true);
      const nb = f.d.getElementById('saleBldgNeighborhood') as HTMLSelectElement;
      nb.insertAdjacentHTML('beforeend', '<option value="Turtle Bay">Turtle Bay</option>');
      nb.value = 'Turtle Bay';
      expect(has('Neighborhood')).toBe(false);
    } finally { f.close(); }
  });

  it('the garage question must be ANSWERED (the backend requires GarageYN to publish): an untouched default No is not an answer', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      const label = 'Garage Spaces Assigned (answer Yes or No)';
      expect(missingNow(f).map((m) => m.label)).toContain(label);
      const no = f.d.querySelector('input[name="saleGarageSpaces"][value="No"]') as HTMLInputElement;
      no.checked = true; no.dispatchEvent(new f.w.Event('change', { bubbles: true }));       // the agent chooses No
      expect(missingNow(f).map((m) => m.label)).not.toContain(label);
    } finally { f.close(); }
  });

  it('a saved listing\'s own answer counts: the townhouse tab\'s Garage box (what opening a saved GarageYN restores) answers it', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      const label = 'Garage Spaces Assigned (answer Yes or No)';
      const th = f.d.getElementById('saleTHGarageYN') as HTMLSelectElement;
      th.value = 'No';
      expect(missingNow(f).map((m) => m.label)).not.toContain(label);
    } finally { f.close(); }
  });
});

describe('review findings on this gate (Codex, Vercel agent)', () => {
  it('an InHouse listing (not on RLS) is shown nothing: no list, no boxes, even after an earlier refusal', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Active');                                              // refused: the list is up and fields are boxed
      expect(f.d.querySelectorAll('.sale-missing-field').length).toBeGreaterThan(0);
      const radio = f.d.querySelector('input[name="saleListingType"][value="InHouseInternal"]') as HTMLInputElement;
      radio.checked = true;
      radio.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      chooseStatus(f, 'Active');
      expect(status(f)).toBe('Active');
      expect(panel(f).classList.contains('hidden')).toBe(true);
      expect(f.d.querySelectorAll('.sale-missing-field').length).toBe(0);
    } finally { f.close(); }
  });

  it('the list is the one for the status that was ASKED for: Withdrawn to Active does not list the Off Market Date', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      const sel = f.d.getElementById('saleStatus') as HTMLSelectElement;
      sel.value = 'Withdrawn';                                                // as a restored listing is
      sel.dispatchEvent(new f.w.Event('focus'));
      chooseStatus(f, 'Active');
      expect(status(f)).toBe('Withdrawn');                                    // refused, back to what it was
      const labels = listItems(f).join('\n');
      expect(labels).not.toContain('Off Market Date');                        // that field belongs to Withdrawn, not to Active
      expect(labels).toContain('CoBroke Agreement Type');
      // and the list stays that one while the agent fills fields
      const box = f.d.getElementById('saleCoBrokeAgreementType') as HTMLSelectElement;
      const opt = Array.from(box.options).find((o) => o.value);
      box.value = opt!.value; box.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      expect(listItems(f).join('\n')).not.toContain('Off Market Date');
    } finally { f.close(); }
  });

  it('filling a field in the Building window clears its box and its list entry', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      chooseStatus(f, 'Active');
      const has = (label: string) => listItems(f).some((t) => t.includes(label));
      expect(has('Year Built')).toBe(true);
      expect(f.d.getElementById('saleBldgYearBuilt')!.classList.contains('sale-missing-field')).toBe(true);
      const year = f.d.getElementById('saleBldgYearBuilt') as HTMLInputElement;
      year.value = '1960';
      year.dispatchEvent(new f.w.Event('input', { bubbles: true }));         // inside the Building window, outside the page container
      expect(has('Year Built')).toBe(false);
      expect(f.d.getElementById('saleBldgYearBuilt')!.classList.contains('sale-missing-field')).toBe(false);
    } finally { f.close(); }
  });

  it('Save goes through validateREBNYRequired (the seam other suites stub), and shows the list instead of an alert', async () => {
    const html = require('fs').readFileSync(require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
    expect(html.replace(/\r\n/g, '\n')).toContain("const saleMissing = validateREBNYRequired('sale');\n        if (saleMissing.length > 0) {\n            showSaleMissingRequired('save');");
  });
});
