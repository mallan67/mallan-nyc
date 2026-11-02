/** Regression: building ownership is not the unit's selected commercial use. */
import fs from 'fs';
import path from 'path';
const sale = fs.readFileSync(path.join(process.cwd(), 'public/crm/SALE-FORM-REDESIGN.html'), 'utf8');
describe('Sale building selector keeps commercial use', () => {
  const start = sale.indexOf('function selectBuildingFromIDX(prefix, picked)');
  const end = sale.indexOf('// Populate building modal fields from IDX data', start);
  const selector = sale.slice(start, end);
  test('guards Office Retail and Commercial before applying building ownership', () => {
    expect(selector).toContain("['Office', 'Retail', 'Commercial']");
    expect(selector).toContain('!commercialUseSelected && !building.classification_unverified');
    expect(selector).toContain('if (typeRadio && !commercialUseSelected');
  });
  test('separates condo office ownership and commercial condo ownership', () => {
    expect(selector).toContain('OfficeRetailOwnership');
    expect(selector).toContain('CommercialOwnership');
    expect(selector).toContain("Condo: 'CommercialCondo'");
  });
  test('preserves unit and does not change stored identity', () => {
    expect(selector).toContain("prefix + 'UnitNumber'");
    expect(selector).not.toContain('listing_id =');
    expect(selector).not.toContain('owner_client_id =');
  });
});
