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
import { fieldsOn } from '@/lib/cotality/verified-contract';

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
      'BuildingFeatures', 'PetsAllowed',
      'CrossStreet',
      'NewConstructionYN',
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

  test('Trestle branch response surfaces tax + association', () => {
    expect(src).toMatch(/tax_block:\s*String\(r\.TaxBlock/);
    expect(src).toMatch(/tax_lot:\s*String\(r\.TaxLot/);
    expect(src).toMatch(/association_name:\s*String\(r\.AssociationName/);
    // renting_allowed_yn is no longer sourced from Cotality — RentingAllowedYN
    // is not on the live Property entity (removed 2026-05-29). The DB path
    // still sets it from stored features.
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

// ──────────────────────────────────────────────────────────────────────────
// Metadata-backed contract: the OData $select may ONLY reference fields that
// exist on the live Cotality `Property` entity. An unknown field makes Trestle
// reject the whole query with HTTP 400 (no 4xx retry), silently killing the
// Cotality building lookup. This test fails if future code reintroduces a
// phantom field. Source of truth: artifacts/metadata.xml.
// ──────────────────────────────────────────────────────────────────────────
describe('buildings/search $select is metadata-valid (no phantom Cotality fields)', () => {
  const routeSrc = read('app/api/buildings/search/route.ts');
  // Field names the live Cotality contract declares on the Property resource.
  const propertyFields = new Set(Object.keys(fieldsOn('Property')));

  // The route's OData $select array (const SELECT = [ '...', ... ].join(','))
  const selectFields = (() => {
    const block = (routeSrc.match(/const SELECT = \[([\s\S]*?)\]\.join\(','\)/) || ['', ''])[1];
    return [...block.matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1]);
  })();

  test('parses a non-empty Property field set and $select list', () => {
    expect(propertyFields.size).toBeGreaterThan(100);
    expect(selectFields.length).toBeGreaterThan(0);
  });

  test('every $select field exists on the live Cotality Property entity', () => {
    const unknown = selectFields.filter((f) => !propertyFields.has(f));
    expect(unknown).toEqual([]);
  });

  test('the four known-phantom fields are never selected', () => {
    for (const phantom of ['AttendanceType', 'NewDevelopmentYN', 'SponsorUnitYN', 'RentingAllowedYN']) {
      expect(selectFields).not.toContain(phantom);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Both entry points must work (2026-05-29 fix):
//  - Building-tab search is an INDEPENDENT fallback (calls the API when the
//    in-memory cache is empty/stale), not a cache-only filter.
//  - Building-tab select uses the SHARED populateBuildingFromIDX (full field
//    set + building type), not a partial bespoke mapper.
//  - No-match shows a clear message on both the main-address and Building-tab
//    paths (no silent failure).
// ──────────────────────────────────────────────────────────────────────────
describe('sales form — both building entry points (Path 1 main address + Path 2 Building tab)', () => {
  const src = read('public/crm/SALE-FORM-REDESIGN.html');
  const fnBody = (name: string) => {
    const m = src.match(new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`));
    return m ? m[0] : '';
  };

  test('Building-tab search calls /api/buildings/search when the cache misses', () => {
    expect(fnBody('searchBuildingByAddress')).toMatch(/fetchBuildingsFromAPI/);
  });

  test('Building-tab select delegates to populateBuildingFromIDX (full field set)', () => {
    expect(fnBody('selectBuildingForModal')).toMatch(/populateBuildingFromIDX\(/);
  });

  test('Building-tab select populates building type (PropertyType)', () => {
    expect(fnBody('selectBuildingForModal')).toMatch(/PropertyType/);
  });

  test('Building-tab search shows a clear no-match message', () => {
    expect(fnBody('searchBuildingByAddress')).toMatch(/No building match found/i);
  });

  test('Main-address blur lookup shows a clear no-match message (not silent)', () => {
    expect(fnBody('saleAddressBlurLookup')).toMatch(/No building match found/i);
  });

  test('Main-address blur lookup auto-applies a single exact match', () => {
    expect(fnBody('saleAddressBlurLookup')).toMatch(/selectBuildingFromIDX/);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// fetchBuildingsFromAPI must preserve the FULL /api/buildings/search building
// object (2026-05-29 hotfix). buildingDatabase (the cache that feeds BOTH
// selectBuildingFromIDX and selectBuildingForModal) is fetchBuildingsFromAPI's
// output. populateBuildingFromIDX reads the full snake_case shape via pick()
// (tax_block, association_*, cross_street, stories_total, units_total, and the
// expanded amenities roof_deck/storage/bike_room/.../washer_dryer_allowed). If
// the normalizer rebuilds a lossy subset, those fields never reach the form.
// The fix: pass the raw API object through (spread) and only add display/alias
// fields on top.
// ──────────────────────────────────────────────────────────────────────────
describe('fetchBuildingsFromAPI preserves the full API building object', () => {
  const src = read('public/crm/SALE-FORM-REDESIGN.html');
  const fnBody = (name: string) => {
    const m = src.match(new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`));
    return m ? m[0] : '';
  };
  const body = fnBody('fetchBuildingsFromAPI');

  test('spreads the raw API object (does not rebuild a lossy subset)', () => {
    // Object.assign({}, b, {...}) (or {...b, ...}) preserves every field the
    // API returned, so expanded fields survive into buildingDatabase.
    expect(body).toMatch(/Object\.assign\(\s*\{\s*\}\s*,\s*b\s*,|\.\.\.b\b/);
  });

  test('still sets the UI display + alias fields (no dropdown/legacy regression)', () => {
    for (const f of ['address:', 'name:', 'neighborhood:', 'type:', 'model:', 'totalFloors:']) {
      expect(body).toContain(f);
    }
  });

  test('does not whitelist-drop expanded fields by omitting the spread', () => {
    // Guard: a return object literal with address/name/neighborhood but NO
    // spread of b is the lossy-subset regression. Require the spread.
    const returnsObjectLiteral = /return\s*\{[\s\S]*?address:/.test(body);
    const hasSpread = /Object\.assign\(\s*\{\s*\}\s*,\s*b\s*,|\.\.\.b\b/.test(body);
    expect(returnsObjectLiteral && !hasSpread).toBe(false);
  });
});
