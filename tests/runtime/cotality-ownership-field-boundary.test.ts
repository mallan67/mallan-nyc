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
    expect(files.sale).toContain("ownershipEl.dataset.preserveNull === 'true'");
    expect(files.sale).toContain("ownershipEl.dataset.explicit === 'true'");
  });

  it('Rental saves one canonical CommonInterest key and removes the duplicate alias', () => {
    expect(files.rental).toContain('delete data.rentalCommonInterest;');
    expect(files.rental).toContain("ownershipEl.dataset.preserveNull === 'true'");
    expect(files.rental).toContain("ownershipEl.dataset.explicit === 'true'");
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
