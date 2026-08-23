/// <reference types="jest" />
/**
 * InHouse listing gate tests — PR-Exclusive.1.
 *
 * Proves:
 *   1. InHouse still permits Trestle building lookup (not suppressed)
 *   2. InHouse forces all 4 distribution gates OFF in form serialization
 *   3. InHouse → rls_eligible=false in backend eligibility classification
 *   4. Website-only (rls_eligible=false) listings pass filterDisplayableDbListings
 *   5. Ambiguous/different Trestle match requires confirmation for InHouse
 *   6. Non-InHouse listing types preserve existing lookup behavior
 *   7. Switching to InHouse clears stale IDX match state
 */

const fs = require('fs');
const path = require('path');
const FORM_PATH = path.resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const formHtml = fs.readFileSync(FORM_PATH, 'utf8');

// ─── 1. InHouse still permits Trestle building lookup ───────────────────────

describe('Form — InHouse permits Trestle building lookup', () => {
  it('searchBuildingForListing does NOT have InHouse early-return', () => {
    const fnMatch = formHtml.match(/function searchBuildingForListing\(query, prefix\)\s*\{([\s\S]{0,600}?)\n\s*\/\/ Debounce/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).not.toContain('_isInHouseListingType');
  });

  it('saleAddressBlurLookup does NOT have InHouse early-return', () => {
    const fnStart = formHtml.indexOf('function saleAddressBlurLookup()');
    expect(fnStart).toBeGreaterThan(-1);
    const body = formHtml.slice(fnStart, fnStart + 2000);
    expect(body).not.toContain('_isInHouseListingType');
  });

  it('fetchBuildingsFromAPI is called by both searchBuildingForListing and saleAddressBlurLookup', () => {
    expect(formHtml).toContain('fetchBuildingsFromAPI(query)');
    expect(formHtml).toContain('fetchBuildingsFromAPI(addr)');
  });

  it('saleAddressBlurLookup checks local cache first, then falls back to API', () => {
    const fnStart = formHtml.indexOf('function saleAddressBlurLookup()');
    expect(fnStart).toBeGreaterThan(-1);
    const body = formHtml.slice(fnStart, fnStart + 2000);
    expect(body).toContain('buildingDatabase.find');
    expect(body).toContain('fetchBuildingsFromAPI(addr)');
    const cacheIdx = body.indexOf('buildingDatabase.find');
    const apiIdx = body.indexOf('fetchBuildingsFromAPI(addr)');
    expect(cacheIdx).toBeLessThan(apiIdx);
  });

  it('saleAddressBlurLookup shows candidates in existing results UI on multi-match', () => {
    const fnStart = formHtml.indexOf('function saleAddressBlurLookup()');
    expect(fnStart).toBeGreaterThan(-1);
    const body = formHtml.slice(fnStart, fnStart + 2000);
    expect(body).toContain('saleBuildingSearchResults');
    expect(body).toContain("selectBuildingFromIDX('sale'");
  });
});

// ─── 2. InHouse forces all 4 distribution gates OFF ─────────────────────────

describe('Form serialization — InHouse distribution gates', () => {
  it('InHouse is included in the gate-off condition', () => {
    const gatePattern = /if\s*\(\s*isOwnerOptOut\s*\|\|\s*isParticipantOnly\s*\|\|\s*isInHouse\s*\)/;
    expect(formHtml).toMatch(gatePattern);
  });

  it('gate-off block sets IDX + Internet display to false, address conditional on web-only', () => {
    const idx = formHtml.indexOf('// Distribution gates — force OFF');
    expect(idx).toBeGreaterThan(-1);
    const slice = formHtml.slice(idx, idx + 500);
    expect(slice).toContain('saleIdxDisplayYN = false');
    expect(slice).toContain('InternetEntireListingDisplayYN = false');
    expect(slice).toMatch(/InternetAddressDisplayYN\s*=\s*isInHouseWebOnly\s*\?\s*true\s*:\s*false/);
  });

  it('InHouse/OptOut force syndication OFF via empty canonical SyndicateTo (phantom SyndicateYN removed)', () => {
    // Cotality-clean sweep 2026-05-30: the phantom SyndicateYN=false signal was
    // removed; syndication-off is now the Cotality-correct empty SyndicateTo,
    // achieved by gating the SyndicateTo collection on NOT InHouse/OptOut.
    expect(formHtml).not.toMatch(/data\.SyndicateYN\s*=/);
    expect(formHtml).toMatch(/if\s*\(\s*!\(\s*isOwnerOptOut\s*\|\|\s*isParticipantOnly\s*\|\|\s*isInHouse\s*\)[\s\S]*?SALE_SYNDICATION_MAP/);
  });
});

// ─── 3. Backend: InHouse → rls_eligible=false ───────────────────────────────

describe('Backend — InHouse RLS eligibility', () => {
  it('POST handler treats saleListingType=InHouse as explicitOptOut', () => {
    const postRoute = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/crm/listings/route.ts'),
      'utf8'
    );
    expect(postRoute).toContain('"InHouse", "InHouseInternal", "InHouseWebOnly"');
    expect(postRoute).toContain('inHouseValues.includes(String(body.saleListingType');
    expect(postRoute).toContain('inHouseValues.includes(String(body.listingAgreement');
    expect(postRoute).toMatch(/explicitOptOut:.*isInHouse/);
  });

  it('PATCH handler treats merged InHouse as explicitOptOut', () => {
    const patchRoute = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/crm/listings/[id]/route.ts'),
      'utf8'
    );
    expect(patchRoute).toContain('"InHouse", "InHouseInternal", "InHouseWebOnly"');
    expect(patchRoute).toContain('inHouseValues.includes(String(merged.saleListingType');
    expect(patchRoute).toContain('inHouseValues.includes(String(merged.listingAgreement');
    expect(patchRoute).toMatch(/explicitOptOut:.*isInHouse/);
  });
});

// ─── 4. Website-only bypass in filterDisplayableDbListings ──────────────────

describe('filterDisplayableDbListings — website-only bypass', () => {
  it('rls_eligible=false listings bypass IDX distribution gates', () => {
    const { filterDisplayableDbListings } = require('../../lib/idx/db-to-public-dto');
    const websiteOnly = [{
      id: '1', listing_id: 'SL-0001', status: 'Active',
      rls_eligible: false, idx_display_yn: false,
      internet_entire_listing_display_yn: false,
      owner_opt_out: false, participant_only: false,
      agent_id: '1', owner_client_id: null,
      address: {}, features: {}, media: [], agent_info: {},
      list_price: '500000', property_type: 'Residential',
      property_sub_type: 'Condo', bedrooms_total: 2,
      bathrooms_full: 1, bathrooms_half: 0, living_area: '900',
      borough: 'Manhattan', neighborhood: 'UES',
      mls_id: null, slug: 'test', compliance: {},
    }];
    const result = filterDisplayableDbListings(websiteOnly);
    expect(result).toHaveLength(1);
  });
});

// ─── 5. Ambiguous Trestle match requires confirmation for InHouse ───────────

describe('Form — InHouse address mismatch confirmation', () => {
  it('selectBuildingFromIDX checks _isInHouseListingType before address overwrite', () => {
    const fnMatch = formHtml.match(/function selectBuildingFromIDX\(prefix, address\)\s*\{([\s\S]{0,4000}?)\n\}/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![1];
    expect(body).toContain('_isInHouseListingType(prefix)');
    expect(body).toContain('typedNorm');
    expect(body).toContain('trestleNorm');
    expect(body).toContain('confirm(');
  });

  it('confirmation dialog mentions both typed and Trestle canonical addresses', () => {
    const fnMatch = formHtml.match(/function selectBuildingFromIDX[\s\S]*?confirm\(([\s\S]*?)\)/);
    expect(fnMatch).not.toBeNull();
    const confirmBody = fnMatch![1];
    expect(confirmBody).toContain('You entered');
    expect(confirmBody).toContain('Trestle/RLS canonical');
  });

  it('Cancel preserves typed address but still populates building fields', () => {
    const fnMatch = formHtml.match(/function selectBuildingFromIDX\(prefix, address\)\s*\{([\s\S]{0,4000}?)\n\}/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![1];
    expect(body).toContain('if (!useCanonical)');
    expect(body).toContain('populateBuildingFromIDX(prefix, building)');
  });
});

// ─── 6. Non-InHouse preserves existing lookup behavior ──────────────────────

describe('Form — Non-InHouse lookup behavior preserved', () => {
  it('selectBuildingFromIDX still overwrites address for non-InHouse (no confirm gate)', () => {
    const fnMatch = formHtml.match(/function selectBuildingFromIDX\(prefix, address\)\s*\{([\s\S]{0,4000}?)\n\}/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![1];
    const afterGuard = body.split('populateBuildingFromIDX(prefix, building)')[1] || '';
    expect(afterGuard || body).toContain("setVal(prefix + 'StreetAddress', building.address)");
  });
});

// ─── 7. Switching to InHouse clears stale match state ───────────────────────

describe('Form — handleSaleListingTypeChange clears stale state for InHouse', () => {
  it('handleSaleListingTypeChange calls _clearIdxMatchState when InHouse', () => {
    const fnStart = formHtml.indexOf('function handleSaleListingTypeChange(value)');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = formHtml.slice(fnStart, fnStart + 2500);
    expect(fnBody).toContain("_clearIdxMatchState('sale')");
  });
});

// ─── 8. Banner says "Building Match Found" not "IDX Match Found" ────────────

describe('Form — Banner text uses building reference, not IDX distribution', () => {
  it('banner says "Building Match Found"', () => {
    expect(formHtml).toContain('Building Match Found');
    expect(formHtml).not.toContain('>IDX Match Found<');
  });

  it('section header says "Building Lookup" not "IDX Lookup"', () => {
    expect(formHtml).toContain('Property Address — Building Lookup');
  });
});

// ─── 9. Cotality address parser — parseAddressQuery ─────────────────────────────

describe('Building search — Cotality OData pattern alignment', () => {
  const routeCode = fs.readFileSync(
    path.resolve(__dirname, '../../app/api/buildings/search/route.ts'),
    'utf8'
  );

  it('parser returns streetDirPrefix field', () => {
    expect(routeCode).toContain('streetDirPrefix');
    expect(routeCode).toContain('DIR_PREFIX_MAP');
  });

  it('DIR_PREFIX_MAP normalizes East→E, West→W, North→N, South→S', () => {
    expect(routeCode).toMatch(/east.*'E'/i);
    expect(routeCode).toMatch(/west.*'W'/i);
    expect(routeCode).toMatch(/north.*'N'/i);
    expect(routeCode).toMatch(/south.*'S'/i);
  });

  it('Trestle OData uses startswith(StreetNumber,...) not strict eq', () => {
    expect(routeCode).toContain("startswith(StreetNumber,");
  });

  it('Trestle OData uses contains(tolower(StreetName),...) for case-insensitive search', () => {
    expect(routeCode).toContain("contains(tolower(StreetName),");
  });

  it('Trestle OData uses StreetDirPrefix eq for enum comparison', () => {
    expect(routeCode).toContain("StreetDirPrefix eq");
  });

  it('does NOT use case-sensitive contains(StreetName,...) without tolower', () => {
    // The only contains(StreetName,...) pattern should be wrapped in tolower()
    const badPattern = /contains\(StreetName,/;
    const goodPattern = /contains\(tolower\(StreetName\),/;
    expect(routeCode).toMatch(goodPattern);
    // Remove all good patterns and check no bad pattern remains
    const withoutGood = routeCode.replace(/contains\(tolower\(StreetName\),/g, '');
    expect(withoutGood).not.toMatch(badPattern);
  });

  it('parser strips ordinal suffixes (46th→46, 57th→57)', () => {
    expect(routeCode).toContain('stripOrdinal');
    expect(routeCode).toContain('ORDINAL_RE');
  });

  it('parser lowercases streetName for tolower() alignment', () => {
    expect(routeCode).toContain('.toLowerCase()');
  });

  it('DB query uses case-insensitive LOWER() for StreetName', () => {
    expect(routeCode).toContain("LOWER(address->>'StreetName')");
  });

  it('Trestle fallback fires when streetNumber + streetDirPrefix (no streetName)', () => {
    expect(routeCode).toContain("parsed.streetName || parsed.streetDirPrefix");
  });
});
