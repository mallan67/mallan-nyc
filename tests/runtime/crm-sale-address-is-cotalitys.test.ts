/// <reference types="jest" />
/**
 * The Sale form writes the address Cotality holds (Maya, 2026-11-02): "use the one that Cotality uses as the true address, so that I have no choice but to input it as it is
 * required or the listing will not go through". Live Cotality: every past listing of 800 2nd Avenue, hers included, is StreetNumber 800, StreetName "2ND", StreetSuffix
 * "Avenue", no direction. These tests drive the REAL Sale form with the building index stubbed.
 */
import { bootAddForm, sleep, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);

const BUILDING_800_2ND = {
  address: '800 2ND Avenue', name: '', borough: 'Manhattan', zip: '10017', neighborhood: 'Turtle Bay', subdivisionName: 'Turtle Bay',
  streetNumber: '800', streetDirPrefix: '', streetName: '2ND', streetSuffix: 'Avenue', common_interest: 'Condominium', source: 'cotality',
};

const val = (f: BootedForm, id: string) => ((f.d.getElementById(id) as HTMLInputElement | null)?.value) ?? '';

async function typeAndLeave(f: BootedForm, text: string) {
  const el = f.d.getElementById('saleStreetAddress') as HTMLInputElement;
  el.value = text;
  el.dispatchEvent(new f.w.Event('input', { bubbles: true }));
  el.dispatchEvent(new f.w.Event('blur'));
  await sleep(500);
}

describe.each([['800 Second Ave'], ['800 2nd Ave'], ['800 second avenue']])('typed "%s"', (typed) => {
  it('becomes 800 2ND Avenue, with the atoms Cotality holds, and the building\'s neighborhood', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings: [BUILDING_800_2ND], settle: 600 });
    try {
      await typeAndLeave(f, typed);
      expect(val(f, 'saleStreetAddress')).toBe('800 2ND Avenue');
      expect([val(f, 'saleStreetNumber'), val(f, 'saleStreetDirPrefix'), val(f, 'saleStreetName'), val(f, 'saleStreetSuffix')]).toEqual(['800', '', '2ND', 'Avenue']);
      expect(val(f, 'saleNeighborhoodFromAddress')).toBe('Turtle Bay');
      expect([...new Set(f.errors)]).toEqual([]);
    } finally { f.close(); }
  });
});

describe('there is no "keep what I typed" choice, for any listing type', () => {
  it.each(['InHouseInternal', 'InHouseWebOnly'])('listing type %s: no confirmation dialog, the address is Cotality\'s', async (type) => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings: [BUILDING_800_2ND], settle: 600 });
    try {
      const radio = f.d.querySelector(`input[name="saleListingType"][value="${type}"]`) as HTMLInputElement | null;
      expect(radio).not.toBeNull();                               // the type that used to ask must really be chosen
      radio!.checked = true; radio!.dispatchEvent(new f.w.Event('change', { bubbles: true }));
      let asked = 0;
      f.w.confirm = () => { asked++; return false; };            // the old "Cancel = keep what I typed"
      await typeAndLeave(f, '800 Second Ave');
      expect(asked).toBe(0);
      expect(val(f, 'saleStreetAddress')).toBe('800 2ND Avenue');
      expect(val(f, 'saleStreetName')).toBe('2ND');
    } finally { f.close(); }
  });

  it('tells the agent the address was changed to the one Cotality holds', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { buildings: [BUILDING_800_2ND], settle: 600 });
    try {
      await typeAndLeave(f, '800 Second Ave');
      const toasts = [...f.d.querySelectorAll('.mallan-toast')].map((t) => t.textContent ?? '');
      expect(toasts.join('\n')).toContain('Address set to the one Cotality holds for this building: 800 2ND Avenue');
    } finally { f.close(); }
  });
});
