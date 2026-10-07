/// <reference types="jest" />
/**
 * A number box the agent left blank is no number. The Sale and Rental Add / Edit forms turned it into 0 (`parseInt(x || '0') || 0`): "0 bedrooms" (a studio), "0 baths", "no association fee",
 * "closed at $0", "no security deposit" are facts the agent never gave, and a save over a stored value cleared it to 0 (the Sale form already guarded the tax against exactly this: a blank box
 * must not overwrite what is stored). A blank number is `null` now; a typed 0 is still 0. The server counts null as missing (lib/compliance/rebny-validator.ts: hasValue), where 0 passed
 * the required-field check. ListPrice is not changed here: listings.list_price is a required column. These tests drive the REAL pages through the collector the save uses.
 */
import { bootAddForm, type AddForm, type BootedForm } from './add-form-harness';

jest.setTimeout(120000);
/* eslint-disable @typescript-eslint/no-explicit-any */

type Box = [key: string, control: string, typed: string, expected: number];
type Form = { form: AddForm; prefix: 'sale' | 'rental'; collector: string; boxes: Box[]; blankOnly: string[] };
const FORMS: Form[] = [
  {
    form: 'SALE-FORM-REDESIGN', prefix: 'sale', collector: 'collectSaleFormData',
    boxes: [
      ['BedroomsTotal', 'saleBedrooms', '3', 3], ['BathroomsFull', 'saleFullBaths', '2', 2], ['BathroomsHalf', 'saleHalfBaths', '1', 1], ['LivingArea', 'saleUnitSqFt', '1234.5', 1234.5],
      ['OriginalListPrice', 'saleOriginalPrice', '1300000', 1300000], ['ClosePrice', 'saleSoldPrice', '1250000', 1250000], ['AssociationFee', 'saleMaintCC', '1250.5', 1250.5],
      ['BuildingAreaTotal', 'saleTHBuildingArea', '4200', 4200], ['FoundationArea', 'saleTHFoundationArea', '900', 900], ['LotSizeArea', 'saleTHLotSize', '2500', 2500],
    ],
    blankOnly: ['BathroomsTotal'],
  },
  {
    form: 'RENTAL-FORM-REDESIGN', prefix: 'rental', collector: 'collectRentalFormData',
    boxes: [
      ['LivingArea', 'rentalSqFt', '850', 850],
      ['NetMonthlyRent', 'rentalMonthlyRent', '4200.5', 4200.5], ['LeaseAmount', 'rentalMonthlyRent', '4200.5', 4200.5], ['SecurityDeposit', 'rentalSecurityDeposit', '4200', 4200],
      ['BuildingAreaTotal', 'rentalTHBuildingArea', '4200', 4200], ['FoundationArea', 'rentalTHFoundationArea', '900', 900], ['LotSizeArea', 'rentalTHLotSize', '2500', 2500],
      ['MoveInCostsAmount', 'rentalMoveInCostsAmount', '300', 300], ['AdditionalFee', 'rentalAdditionalFee', '25', 25],
    ],
    blankOnly: ['BathroomsTotal'],
  },
];

const set = (f: BootedForm, id: string, value: string) => { (f.d.getElementById(id) as HTMLInputElement).value = value; };

describe.each(FORMS)('$form: a number box the agent left blank', (p) => {
  let f: BootedForm;
  beforeAll(async () => { f = await bootAddForm(p.form, { settle: 600 }); });
  afterAll(() => f.close());

  it('boots without a page error', () => {
    expect(f.errors).toEqual([]);
  });

  it.each(p.boxes.map(([key, control]) => [key, control]))('%s (the %s box) is none, not 0', (key, control) => {
    expect((f.d.getElementById(control) as HTMLInputElement).value).toBe('');
    const payload = f.w[p.collector]();
    expect([key, payload[key]]).toEqual([key, null]);
  });

  it('the total of the bathrooms is none when neither count is given', () => {
    expect(f.w[p.collector]().BathroomsTotal).toBeNull();
  });

  it.each(p.boxes)('%s: a number typed in %s (%s) is that number', (key, control, typed, expected) => {
    set(f, control, typed);
    try {
      expect([key, f.w[p.collector]()[key]]).toEqual([key, expected]);
    } finally { set(f, control, ''); }
  });

  it.each(p.boxes.map(([key, control]) => [key, control]))('%s: a typed 0 is 0 (it is an answer), and spaces are none', (key, control) => {
    set(f, control, '0');
    try {
      expect([key, f.w[p.collector]()[key]]).toEqual([key, 0]);
      set(f, control, '   ');
      expect([key, f.w[p.collector]()[key]]).toEqual([key, null]);
    } finally { set(f, control, ''); }
  });

  it('the total of the bathrooms counts what is given: a half bath alone is 0.5, the full ones alone are the count, both add up', () => {
    const [full, half] = p.prefix === 'sale' ? ['saleFullBaths', 'saleHalfBaths'] : ['rentalFullBathrooms', 'rentalHalfBathrooms'];
    try {
      set(f, half, '1');
      expect(f.w[p.collector]().BathroomsTotal).toBe(0.5);
      set(f, half, '');
      set(f, full, '2');
      expect(f.w[p.collector]().BathroomsTotal).toBe(2);
      set(f, half, '1');
      expect(f.w[p.collector]().BathroomsTotal).toBe(2.5);
      if (p.prefix === 'sale') {
        set(f, full, '0');
        set(f, half, '0');
        expect(f.w[p.collector]().BathroomsTotal).toBe(0);                  // two zeros the agent typed are 0 baths
      }
    } finally { set(f, full, p.prefix === 'sale' ? '' : 'custom'); set(f, half, p.prefix === 'sale' ? '' : 'custom'); }
  });
});

describe('RENTAL-FORM-REDESIGN: the bedroom and bathroom lists', () => {
  // The lists start on "Custom" (no answer); "Studio (Apartment)" is 0 bedrooms; "6+", "5+" and "3+" are 6, 5 and 3.
  const LISTS: [string, string, [string, number | null][]][] = [
    ['BedroomsTotal', 'rentalBedrooms', [['custom', null], ['', null], ['Apartment', 0], ['1', 1], ['2', 2], ['6+', 6]]],
    ['BathroomsFull', 'rentalFullBathrooms', [['custom', null], ['', null], ['1', 1], ['4', 4], ['5+', 5]]],
    ['BathroomsHalf', 'rentalHalfBathrooms', [['custom', null], ['', null], ['0', 0], ['1', 1], ['3+', 3]]],
  ];
  let f: BootedForm;
  beforeAll(async () => { f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 600 }); });
  afterAll(() => f.close());

  it.each(LISTS.map(([key, control]) => [key, control]))('%s: the list starts on Custom, which is no answer', (key, control) => {
    expect((f.d.getElementById(control) as HTMLSelectElement).value).toBe('custom');
    expect([key, f.w.collectRentalFormData()[key]]).toEqual([key, null]);
  });

  it.each(LISTS.flatMap(([key, control, rows]) => rows.map(([entry, expected]) => [key, control, entry, expected] as [string, string, string, number | null])))(
    '%s: the entry %s=%p stands for %p', (key, control, entry, expected) => {
      set(f, control, entry);
      try {
        expect([key, f.w.collectRentalFormData()[key]]).toEqual([key, expected]);
      } finally { set(f, control, 'custom'); }
    },
  );
});

describe('RENTAL-FORM-REDESIGN: a rental has no association fee box', () => {
  it('sends no AssociationFee and no frequency: nothing is said about a fee the form never asked for', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 600 });
    try {
      const payload = f.w.collectRentalFormData();
      expect('AssociationFee' in payload).toBe(false);
      expect('AssociationFeeFrequency' in payload).toBe(false);
    } finally { f.close(); }
  });
});

describe('SALE-FORM-REDESIGN: whole numbers and decimals', () => {
  it('the count boxes keep the whole part of what is typed in them, and the area box keeps its decimals', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      set(f, 'saleBedrooms', '2.9');
      set(f, 'saleFullBaths', '1.5');
      set(f, 'saleHalfBaths', '1.9');
      set(f, 'saleUnitSqFt', '850.75');
      const payload = f.w.collectSaleFormData();
      expect([payload.BedroomsTotal, payload.BathroomsFull, payload.BathroomsHalf, payload.LivingArea, payload.BathroomsTotal]).toEqual([2, 1, 1, 850.75, 1.5]);
    } finally { f.close(); }
  });
});

describe('RENTAL-FORM-REDESIGN: what is not changed', () => {
  it('ListPrice stays a number too (the listing table needs one)', async () => {
    const f = await bootAddForm('RENTAL-FORM-REDESIGN', { settle: 600 });
    try {
      expect(f.w.collectRentalFormData().ListPrice).toBe(0);
      set(f, 'rentalMonthlyRent', '4200.5');
      expect(f.w.collectRentalFormData().ListPrice).toBe(4200.5);
    } finally { f.close(); }
  });
});

describe('SALE-FORM-REDESIGN: what is not changed', () => {
  it('ListPrice stays a number (the listing table needs one), and a tax the agent left blank is still not sent', async () => {
    const f = await bootAddForm('SALE-FORM-REDESIGN', { settle: 600 });
    try {
      const payload = f.w.collectSaleFormData();
      expect(payload.ListPrice).toBe(0);
      expect('TaxAnnualAmount' in payload).toBe(false);
    } finally { f.close(); }
  });
});
