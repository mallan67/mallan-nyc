/**
 * Cotality ref: docs/architecture/COTALITY-COMPLETE-REFERENCE.md §5, §11, §18
 *
 * Tests for building lookup → form autofill pipeline.
 * Verifies: CommonInterest→radio mapping, borough population, building
 * facts display, address parsing after selection, and derived fields.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const formHtml = readFileSync(FORM_PATH, 'utf8');

const ROUTE_PATH = resolve(__dirname, '../../app/api/buildings/search/route.ts');
const routeTs = readFileSync(ROUTE_PATH, 'utf8');

// ── 1. CommonInterest → form type mapping ──

describe('_commonInterestToFormType mapper', () => {
  const fnStart = formHtml.indexOf('function _commonInterestToFormType(ci)');

  it('mapper function exists', () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it('maps StockCooperative to Coop', () => {
    const body = formHtml.slice(fnStart, fnStart + 500);
    expect(body).toContain("'StockCooperative': 'Coop'");
  });

  it('maps Condominium to Condo', () => {
    const body = formHtml.slice(fnStart, fnStart + 500);
    expect(body).toContain("'Condominium': 'Condo'");
  });

  it('maps Condop to Condop', () => {
    const body = formHtml.slice(fnStart, fnStart + 500);
    expect(body).toContain("'Condop': 'Condop'");
  });

  it('maps Co-op to Coop', () => {
    const body = formHtml.slice(fnStart, fnStart + 500);
    expect(body).toContain("'Co-op': 'Coop'");
  });
});

// ── 2. fetchBuildingsFromAPI uses the mapper ──

describe('fetchBuildingsFromAPI applies type mapping', () => {
  it('calls _commonInterestToFormType on common_interest', () => {
    expect(formHtml).toContain('_commonInterestToFormType(ci)');
  });

  it('sets type and model from mapped value', () => {
    const fnStart = formHtml.indexOf('async function fetchBuildingsFromAPI');
    const fnBody = formHtml.slice(fnStart, fnStart + 2500);
    expect(fnBody).toContain('type: formType');
    expect(fnBody).toContain('model: formType');
  });

  it('preserves raw commonInterestRaw for reference', () => {
    const fnStart = formHtml.indexOf('async function fetchBuildingsFromAPI');
    const fnBody = formHtml.slice(fnStart, fnStart + 2500);
    expect(fnBody).toContain('commonInterestRaw: ci');
  });
});

// ── 3. Form radio values match mapped output ──

describe('salePropertyType radio values match mapper output', () => {
  it('has Coop radio value', () => {
    expect(formHtml).toContain('name="salePropertyType" value="Coop"');
  });

  it('has Condo radio value', () => {
    expect(formHtml).toContain('name="salePropertyType" value="Condo"');
  });

  it('has Condop radio value', () => {
    expect(formHtml).toContain('name="salePropertyType" value="Condop"');
  });
});

// ── 4. selectBuildingFromIDX calls address derivation ──

describe('selectBuildingFromIDX triggers address derivation', () => {
  const fnStart = formHtml.indexOf('function selectBuildingFromIDX(prefix, address)');
  const fnBody = formHtml.slice(fnStart, fnStart + 3000);

  it('calls parseSaleAddress after setting street address', () => {
    expect(fnBody).toContain('parseSaleAddress()');
  });

  it('calls updateSaleAddressDerived after setting borough', () => {
    expect(fnBody).toContain('updateSaleAddressDerived()');
  });
});

// ── 5. populateBuildingFromIDX fills building modal fields ──

describe('populateBuildingFromIDX fills all building fields', () => {
  const fnStart = formHtml.indexOf('function populateBuildingFromIDX(prefix, building)');
  // Window widened to 8000 after the 2026-05-28 rewrite expanded the function
  // to set 32+ Cotality-derivable fields. The original 2000-char window
  // truncated the body before BldgYearBuilt/BldgTotalFloors/etc., causing
  // false-negative test failures while the function actually set them.
  // Bumped 8000→9500→12000 across Track 1 (2026-05-30): the AssociationFee,
  // parking/pets/docs auto-fill, multiMembers helper, and the in-unit-W/D
  // laundry allowlist all grew populateBuildingFromIDX, pushing the amenity
  // checks (BldgDoorman/BldgElevator/…) past the window. The function still
  // sets them — the slice was just truncating. If this function grows again,
  // bump the window; do NOT weaken the assertions.
  const fnBody = formHtml.slice(fnStart, fnStart + 12000);

  it('sets BldgStreetAddress', () => {
    expect(fnBody).toContain("prefix + 'BldgStreetAddress'");
  });

  it('sets BldgName', () => {
    expect(fnBody).toContain("prefix + 'BldgName'");
  });

  it('sets BldgYearBuilt', () => {
    expect(fnBody).toContain("prefix + 'BldgYearBuilt'");
  });

  it('sets BldgTotalFloors', () => {
    expect(fnBody).toContain("prefix + 'BldgTotalFloors'");
  });

  it('sets BldgTotalUnits', () => {
    expect(fnBody).toContain("prefix + 'BldgTotalUnits'");
  });

  it('sets StructureType', () => {
    expect(fnBody).toContain("prefix + 'StructureType'");
  });

  it('checks doorman amenity', () => {
    expect(fnBody).toContain("prefix + 'BldgDoorman'");
  });

  it('checks elevator amenity', () => {
    expect(fnBody).toContain("prefix + 'BldgElevator'");
  });
});

// ── 6. Backend includes CityRegion in Trestle $select ──

describe('Backend Trestle query includes borough fields', () => {
  it('$select includes CityRegion', () => {
    expect(routeTs).toContain("'CityRegion'");
  });

  it('$select includes CountyOrParish', () => {
    expect(routeTs).toContain("'CountyOrParish'");
  });

  it('Trestle result uses CityRegion for borough', () => {
    expect(routeTs).toContain("borough: String(r.CityRegion || '')");
  });
});

// ── 7. Candidate display shows building facts ──

describe('Candidate display shows building facts', () => {
  it('shows stories count in candidate', () => {
    const fnStart = formHtml.indexOf('function searchBuildingForListing');
    const fnBody = formHtml.slice(fnStart, fnStart + 2000);
    expect(fnBody).toContain("stories");
  });

  it('shows year built in candidate', () => {
    const fnStart = formHtml.indexOf('function searchBuildingForListing');
    const fnBody = formHtml.slice(fnStart, fnStart + 2000);
    expect(fnBody).toContain("built");
  });
});

// ── 8. Dedup key excludes unit number ──

describe('Building dedup key excludes unit number', () => {
  it('key uses StreetNumber-StreetName-PostalCode (no unit)', () => {
    expect(routeTs).toContain('`${addr.StreetNumber}-${addr.StreetName}-${addr.PostalCode || \'\'}`');
  });
});
