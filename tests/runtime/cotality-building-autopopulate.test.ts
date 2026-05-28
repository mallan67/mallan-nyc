/// <reference types="jest" />
/**
 * Cotality-streamlined building auto-populate — source-pin tests.
 *
 * Locks in the contract that:
 *   1. /api/buildings/search returns every Cotality-backed field the
 *      sales form's building modal needs (neighborhood, borough, year,
 *      stories, units, tax, association, every amenity, address atoms
 *      including StreetDirPrefix).
 *   2. /api/crm/neighborhoods/cotality exists and groups by all 5 NYC
 *      boroughs.
 *   3. The sales form's populateBuildingFromIDX sets BldgNeighborhood
 *      (the bug Maya hit), every address atom, year, stories, units,
 *      tax, association, and every Cotality-derived amenity flag.
 *   4. The sales form loads the Cotality dropdown on DOMContentLoaded
 *      with a graceful fallback to the static <optgroup> options.
 *   5. populateBuildingFromIDX never touches UnitNumber/Apt — the
 *      user-entered unit must survive building selection.
 *   6. Address atoms preserve StreetDirPrefix (no E/W/N/S drop).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

describe('buildings/search response shape — Cotality fields the modal needs', () => {
  const src = read('app/api/buildings/search/route.ts');

  test('OData $select includes every Cotality field surfaced to the form', () => {
    for (const field of [
      'BuildingName', 'YearBuilt', 'StoriesTotal', 'NumberOfUnitsInCommunity',
      'CommonInterest', 'OwnershipType', 'PropertyType', 'PropertySubType',
      'StructureType',
      'StreetNumber', 'StreetName', 'StreetSuffix', 'StreetDirPrefix',
      'PostalCode', 'UnitNumber', 'SubdivisionName',
      'City', 'StateOrProvince',
      'BuildingFeatures', 'PetsAllowed', 'AttendanceType',
      'CrossStreet',
      'NewConstructionYN', 'NewDevelopmentYN', 'SponsorUnitYN',
      'RentingAllowedYN',
      'TaxBlock', 'TaxLot', 'TaxAnnualAmount',
      'AssociationName', 'AssociationFee', 'AssociationFeeFrequency',
    ]) {
      expect(src).toContain(`'${field}'`);
    }
  });

  test('Trestle branch response surfaces neighborhood + subdivisionName + address atoms', () => {
    expect(src).toMatch(/neighborhood:\s*String\(r\.SubdivisionName/);
    expect(src).toMatch(/subdivisionName:\s*String\(r\.SubdivisionName/);
    expect(src).toMatch(/streetDirPrefix:\s*String\(r\.StreetDirPrefix/);
    expect(src).toMatch(/source:\s*['"]cotality['"]/);
  });

  test('Trestle branch response surfaces tax + association + renting allowed', () => {
    expect(src).toMatch(/tax_block:\s*String\(r\.TaxBlock/);
    expect(src).toMatch(/tax_lot:\s*String\(r\.TaxLot/);
    expect(src).toMatch(/association_name:\s*String\(r\.AssociationName/);
    expect(src).toMatch(/renting_allowed_yn:\s*r\.RentingAllowedYN/);
  });

  test('Trestle branch surfaces expanded amenity flags (roof deck, storage, bike, valet, etc.)', () => {
    for (const flag of [
      'roof_deck', 'storage', 'spa', 'bike_room', 'package_room',
      'lounge', 'playroom', 'business_center', 'conference_room',
      'cold_storage', 'courtyard', 'valet', 'wheelchair_access',
      'live_in_super', 'on_site_manager', 'washer_dryer_allowed',
    ]) {
      expect(src).toMatch(new RegExp(`${flag}:\\s*(?:features\\.includes|dbFeatures\\.includes|dbAttendance\\.includes|attendance\\.includes)`));
    }
  });

  test('DB branches use shared formatAddress helper (preserves StreetDirPrefix)', () => {
    // Old inline concat patterns that dropped StreetDirPrefix must be gone.
    expect(src).not.toMatch(
      /`\$\{addr\.StreetNumber \|\| ''\} \$\{addr\.StreetName \|\| ''\} \$\{addr\.StreetSuffix \|\| ''\}`\.trim\(\)/,
    );
  });
});

describe('/api/crm/neighborhoods/cotality endpoint contract', () => {
  const src = read('app/api/crm/neighborhoods/cotality/route.ts');

  test('endpoint file exists and exports GET', () => {
    expect(src).toMatch(/export async function GET/);
  });

  test('requires agent or broker auth (not public)', () => {
    expect(src).toMatch(/requireAgentOrBroker/);
  });

  test('groups by all 5 NYC boroughs', () => {
    for (const borough of ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island']) {
      expect(src).toContain(borough);
    }
  });

  test('queries Cotality SubdivisionName + CityRegion via DB cache', () => {
    expect(src).toMatch(/SubdivisionName/);
    expect(src).toMatch(/CityRegion/);
  });

  test('caches at edge (1 hour s-maxage + SWR)', () => {
    expect(src).toMatch(/s-maxage=3600/);
  });
});

describe('populateBuildingFromIDX — sets every Cotality-derivable field', () => {
  const src = read('public/crm/SALE-FORM-REDESIGN.html');

  test('sets BldgNeighborhood (THE bug Maya hit)', () => {
    expect(src).toMatch(/BldgNeighborhood/);
    // The function must reference the dropdown specifically (not just the field name in field maps)
    expect(src).toMatch(/prefix \+ 'BldgNeighborhood'/);
  });

  test('dynamically inserts Cotality neighborhoods missing from static dropdown', () => {
    expect(src).toMatch(/cotalityAdded/);
    expect(src).toMatch(/document\.createElement\(['"]option['"]\)/);
  });

  test('sets BldgCity, BldgState, BldgZip, BldgBorough', () => {
    for (const field of ['BldgCity', 'BldgState', 'BldgZip', 'BldgBorough']) {
      expect(src).toMatch(new RegExp(`prefix \\+ '${field}'`));
    }
  });

  test('sets BldgYearBuilt, BldgYearRenovated, BldgTotalFloors, BldgTotalUnits', () => {
    for (const field of ['BldgYearBuilt', 'BldgYearRenovated', 'BldgTotalFloors', 'BldgTotalUnits']) {
      expect(src).toMatch(new RegExp(`prefix \\+ '${field}'`));
    }
  });

  test('sets BldgTaxBlock, BldgTaxLot, BldgAnnualTaxes, BldgAssociationName', () => {
    for (const field of ['BldgTaxBlock', 'BldgTaxLot', 'BldgAnnualTaxes', 'BldgAssociationName']) {
      expect(src).toMatch(new RegExp(`prefix \\+ '${field}'`));
    }
  });

  test('sets BldgCrossStreet1 from CrossStreet', () => {
    expect(src).toMatch(/prefix \+ 'BldgCrossStreet1'/);
  });

  test('sets BldgSublettingAllowed from RentingAllowedYN', () => {
    expect(src).toMatch(/prefix \+ 'BldgSublettingAllowed'/);
    expect(src).toMatch(/renting_allowed_yn/);
  });

  test('sets BldgNewConstruction, BldgNewDevelopment, BldgSponsorUnits', () => {
    for (const field of ['BldgNewConstruction', 'BldgNewDevelopment', 'BldgSponsorUnits']) {
      expect(src).toMatch(new RegExp(`prefix \\+ '${field}'`));
    }
  });

  test('sets every expanded amenity (RoofDeck, Storage, BikeRoom, etc.)', () => {
    for (const field of [
      'BldgRoofDeck', 'BldgStorage', 'BldgBikeRoom', 'BldgPackageRoom',
      'BldgLounge', 'BldgPlayroom', 'BldgBusinessCenter', 'BldgConferenceRoom',
      'BldgColdStorage', 'BldgCourtyard', 'BldgValet', 'BldgWheelchairAccess',
      'BldgLiveInSuper', 'BldgOnSiteManager',
    ]) {
      expect(src).toMatch(new RegExp(`prefix \\+ '${field}'`));
    }
  });

  test('NEVER touches UnitNumber/Apt fields (preserves user-entered unit)', () => {
    // Find the populateBuildingFromIDX function body and assert no UnitNumber writes.
    // Ignore comments that mention UnitNumber — we only care that no setVal /
    // direct assignment WRITES to a Unit/Apt field.
    const fnMatch = src.match(/function populateBuildingFromIDX\([^)]*\)\s*\{[\s\S]*?\n\}/);
    expect(fnMatch).not.toBeNull();
    if (!fnMatch) return;
    const body = fnMatch[0];
    // Strip comment lines before assertion
    const code = body
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toMatch(/setVal\([^,]+UnitNumber/);
    expect(code).not.toMatch(/setVal\([^,]+Apt/);
    expect(code).not.toMatch(/['"][A-Za-z]+UnitNumber['"]/);
  });

  test('sets BldgName, BldgStreetAddress (existing — regression guard)', () => {
    expect(src).toMatch(/prefix \+ 'BldgName'/);
    expect(src).toMatch(/prefix \+ 'BldgStreetAddress'/);
  });
});

describe('form init wires Cotality neighborhood loader', () => {
  const src = read('public/crm/SALE-FORM-REDESIGN.html');

  test('loadCotalityNeighborhoodsIntoDropdown function exists', () => {
    expect(src).toMatch(/async function loadCotalityNeighborhoodsIntoDropdown/);
  });

  test('called from DOMContentLoaded with sale prefix', () => {
    expect(src).toMatch(/loadCotalityNeighborhoodsIntoDropdown\(['"]sale['"]\)/);
  });

  test('falls back gracefully on network failure (no exception, keep static list)', () => {
    expect(src).toMatch(/keep static fallback options/i);
    expect(src).toMatch(/catch \(err\)[\s\S]{0,200}Cotality dropdown load failed/);
  });

  test('uses snake_case + camelCase pick helper for snake/camel API shape tolerance', () => {
    expect(src).toMatch(/const pick = \(snake, camel\)/);
  });
});
