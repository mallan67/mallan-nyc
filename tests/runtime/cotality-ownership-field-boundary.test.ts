/// <reference types="jest" />
/**
 * Raw Cotality CommonInterest / current REBNY ownership-type boundary.
 * Verified 2026-10-04 from live Cotality plus current REBNY LMP.RLS rules.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const files = {
  sale: readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'), 'utf8'),
  rental: readFileSync(resolve(__dirname, '../../public/crm/RENTAL-FORM-REDESIGN.html'), 'utf8'),
  saleTools: readFileSync(resolve(__dirname, '../../public/crm/SALE-FORM-WITH-TOOLS.html'), 'utf8'),
  rentalTools: readFileSync(resolve(__dirname, '../../public/crm/RENTAL-FORM-WITH-TOOLS.html'), 'utf8'),
};

const currentRlsEntryValues = ['', 'Condominium', 'StockCooperative', 'Condop', 'RentalBuilding', 'None'];

function selectBlock(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const open = html.lastIndexOf('<select', start);
  const end = html.indexOf('</select>', start);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return html.slice(open, end + '</select>'.length);
}

function optionValues(block: string): string[] {
  return [...block.matchAll(/<option\s+value="([^"]*)"/g)].map((m) => m[1]);
}

describe('current REBNY ownership picker', () => {
  it.each([
    ['sale', 'saleCommonInterest'],
    ['rental', 'rentalCommonInterest'],
    ['saleTools', 'saleCommonInterest'],
    ['rentalTools', 'rentalCommonInterest'],
  ] as const)('%s offers exactly the current RLS entry values', (key, id) => {
    const block = selectBlock(files[key], id);
    expect(optionValues(block)).toEqual(currentRlsEntryValues);
    expect(block).not.toMatch(/CommunityApartment|PlannedDevelopment|Timeshare/);
  });

  it('uses Ownership Type as the Mallan-facing label', () => {
    for (const [key, id] of [
      ['sale', 'saleCommonInterest'],
      ['rental', 'rentalCommonInterest'],
      ['saleTools', 'saleCommonInterest'],
      ['rentalTools', 'rentalCommonInterest'],
    ] as const) {
      const html = files[key];
      const start = html.indexOf(`id="${id}"`);
      const context = html.slice(Math.max(0, start - 700), start);
      expect(context).toContain('Ownership Type');
      expect(context).not.toContain('Ownership Structure');
    }
  });
});

describe('raw field separation', () => {
  it('Sale building lookup never substitutes property_type for common_interest', () => {
    expect(files.sale).not.toContain('b.common_interest || b.property_type');
    expect(files.sale).toContain("var ci = b.common_interest == null ? '' : b.common_interest;");
  });

  it('Rental building lookup never substitutes property_type for common_interest', () => {
    expect(files.rental).not.toContain('b.common_interest || b.property_type');
    expect(files.rental).toContain("_rentalRawClassificationToFormType(b.common_interest || '', b.property_sub_type || '')");
  });

  it('Rental form no longer exposes the non-RLS OwnershipType control', () => {
    expect(files.rental).not.toContain('id="rentalOwnershipType"');
    expect(files.rental).not.toContain('data-rls-field="OwnershipType"');
  });

  it('Mallan classification radios are not falsely tagged as raw PropertyType', () => {
    expect(files.sale).not.toMatch(/name="salePropertyType"[^>]*data-rls-field="PropertyType"/);
    expect(files.rental).not.toMatch(/name="rentalPropertyType"[^>]*data-rls-field="PropertyType"/);
  });
});

describe('save/reload ownership preservation', () => {
  it('Sale saves one canonical CommonInterest key and removes the duplicate alias', () => {
    expect(files.sale).toContain('delete data.saleCommonInterest;');
    expect(files.sale).toContain("ownershipEl.dataset.preserveNull === 'true' && ownershipEl.dataset.explicit !== 'true'");
  });

  it('Rental saves one canonical CommonInterest key and removes the duplicate alias', () => {
    expect(files.rental).toContain('delete data.rentalCommonInterest;');
    expect(files.rental).toContain("ownershipEl.dataset.preserveNull === 'true' && ownershipEl.dataset.explicit !== 'true'");
  });

  it('Sale reload preserves raw null and historical provider values', () => {
    expect(files.sale).toContain("saleOwnershipEl.dataset.preserveNull = 'true'");
    expect(files.sale).toContain("historicalOwnershipOption.dataset.historicalProviderValue = 'true'");
  });

  it('Rental reload preserves raw null and historical provider values', () => {
    expect(files.rental).toContain("rentalOwnershipEl.dataset.preserveNull = 'true'");
    expect(files.rental).toContain("historicalOwnershipOption.dataset.historicalProviderValue = 'true'");
  });

  it('ownership is never auto-derived from Mallan classification or another provider field', () => {
    expect(files.sale).not.toContain('syncSaleCommonInterest');
    expect(files.rental).not.toContain('syncRentalCommonInterest');
    const saleMap = files.sale.slice(files.sale.indexOf('function getResoPropertyFields'), files.sale.indexOf('\n}', files.sale.indexOf('function getResoPropertyFields')) + 2);
    const rentalMap = files.rental.slice(files.rental.indexOf('function getResoPropertyFields'), files.rental.indexOf('\n}', files.rental.indexOf('function getResoPropertyFields')) + 2);
    expect(saleMap).not.toContain('CommonInterest');
    expect(rentalMap).not.toContain('CommonInterest');
  });

  it('current listing entry requires an explicit ownership choice', () => {
    expect(selectBlock(files.sale, 'saleCommonInterest')).toContain('required');
    expect(selectBlock(files.rental, 'rentalCommonInterest')).toContain('required');
    expect(selectBlock(files.rental, 'rentalCommonInterest')).not.toContain('selected>Rental Building');
  });
});

type OwnershipControl = { value: string; dataset: Record<string, string> };

// Executes the REAL collector fragment and change handler lifted from each form's source, so the
// save-payload behavior is proven instead of pinning exact wording.
function collectCommonInterest(html: string, id: string, control: OwnershipControl | null): unknown {
  const startMarker = `var ownershipEl = document.getElementById('${id}');`;
  expect(html.split(startMarker).length - 1).toBe(1);
  const start = html.indexOf(startMarker);
  const end = html.indexOf(`delete data.${id};`, start);
  expect(end).toBeGreaterThan(start);
  const data: Record<string, unknown> = {};
  const fakeDocument = { getElementById: (x: string) => (x === id ? control : null) };
  new Function('document', 'data', html.slice(start, end))(fakeDocument, data);
  return data.CommonInterest;
}

function changeCommonInterest(html: string, fn: string, id: string, control: OwnershipControl): void {
  const start = html.indexOf(`function ${fn}() {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = html.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  const fakeDocument = { getElementById: (x: string) => (x === id ? control : null) };
  new Function('document', `${html.slice(start, end + 2)}; ${fn}();`)(fakeDocument);
}

describe.each([
  ['sale', 'saleCommonInterest', 'onSaleCommonInterestChange'],
  ['rental', 'rentalCommonInterest', 'onRentalCommonInterestChange'],
] as const)('%s ownership save payload (executes the real form code)', (key, id, handler) => {
  const html = files[key];
  const control = (value: string, dataset: Record<string, string> = {}): OwnershipControl => ({ value, dataset: { ...dataset } });

  it('saves null when the control is absent', () => {
    expect(collectCommonInterest(html, id, null)).toBeNull();
  });

  it('keeps a genuine provider null that the agent never touched, even when the UI shows a default', () => {
    expect(collectCommonInterest(html, id, control('', { preserveNull: 'true' }))).toBeNull();
    expect(collectCommonInterest(html, id, control('Condominium', { preserveNull: 'true' }))).toBeNull();
  });

  it('lets an explicit agent choice replace a restored null', () => {
    const c = control('', { preserveNull: 'true' });
    c.value = 'StockCooperative';
    changeCommonInterest(html, handler, id, c);
    expect(c.dataset.explicit).toBe('true');
    expect(c.dataset.preserveNull).toBeUndefined();
    expect(collectCommonInterest(html, id, c)).toBe('StockCooperative');
  });

  it('lets an explicit choice win if both flags are ever present', () => {
    expect(collectCommonInterest(html, id, control('Condop', { preserveNull: 'true', explicit: 'true' }))).toBe('Condop');
  });

  it('saves current raw values unchanged and keeps None distinct from null', () => {
    for (const raw of ['Condominium', 'StockCooperative', 'Condop', 'RentalBuilding', 'None']) {
      expect(collectCommonInterest(html, id, control(raw, { explicit: 'true' }))).toBe(raw);
      expect(collectCommonInterest(html, id, control(raw))).toBe(raw);
    }
  });

  it('saves null for an unselected new entry, never a fabricated value', () => {
    expect(collectCommonInterest(html, id, control(''))).toBeNull();
  });

  it('re-saves a historical provider value unchanged', () => {
    expect(collectCommonInterest(html, id, control('CommunityApartment', { explicit: 'true' }))).toBe('CommunityApartment');
  });
});
