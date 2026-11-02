/// <reference types="jest" />
/**
 * InHouse listing gate tests — PR-Exclusive.1.
 *
 * Proves:
 *   1. InHouse still permits Cotality building lookup (not suppressed)
 *   2. InHouse forces all 4 distribution gates OFF in form serialization
 *   3. InHouse → rls_eligible=false in backend eligibility classification
 *   4. Website-only (rls_eligible=false) listings pass filterDisplayableDbListings
 *   5. Ambiguous/different Cotality match requires confirmation for InHouse
 *   6. Non-InHouse listing types preserve existing lookup behavior
 *   7. Switching to InHouse clears stale IDX match state
 */

const fs = require('fs');
const path = require('path');
const FORM_PATH = path.resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const formHtml = fs.readFileSync(FORM_PATH, 'utf8');

// ─── 1. InHouse still permits Cotality building lookup ───────────────────────

describe('Form — InHouse permits Cotality building lookup', () => {
  it('building lookup remains available in InHouse mode', () => {
    const start = formHtml.indexOf('function searchBuildingForListing(query, prefix)');
    const end = formHtml.indexOf('// Building selection', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(formHtml.slice(start, end)).not.toContain('_isInHouseListingType');
  });
  it('main-address lookup remains available in InHouse mode', () => {
    const start = formHtml.indexOf('function saleAddressBlurLookup()');
    expect(start).toBeGreaterThan(-1);
    expect(formHtml.slice(start, start + 4500)).not.toContain('_isInHouseListingType');
  });
  it('both address entry points call the authenticated building API', () => {
    const calls = formHtml.match(/fetchBuildingsFromAPI\(street, stillWanted\)/g) || [];
    expect(calls).toHaveLength(2);
  });
  it('checks the exact cached address before querying Cotality', () => {
    const start = formHtml.indexOf('function saleAddressBlurLookup()');
    const body = formHtml.slice(start, start + 4500);
    const cached = body.indexOf('bl.exactMatch(buildingDatabase, street)');
    const api = body.indexOf('fetchBuildingsFromAPI(street, stillWanted)');
    expect(cached).toBeGreaterThan(-1);
    expect(api).toBeGreaterThan(cached);
  });
  it('offers a candidate list for non-exact or ambiguous matches', () => {
    const start = formHtml.indexOf('function saleAddressBlurLookup()');
    const body = formHtml.slice(start, start + 4500);
    expect(body).toContain('saleBuildingSearchResults');
    expect(body).toContain("selectBuildingFromIDX('sale'");
    expect(body).toContain('bl.exactMatch(matches, street)');
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

// ─── 5. The address is Cotality's: a found building always writes it, whatever the listing type ──
// Maya, 2026-11-02: a listing whose address differs from the one Cotality holds does not go through, so the form gives no "keep what I typed" choice.

describe('Form — a found building always writes the Cotality address (no keep-typed option)', () => {
  const selectBody = () => {
    const fnMatch = formHtml.match(/function selectBuildingFromIDX\(prefix, picked\)\s*\{([\s\S]{0,9000}?)\n\}/);
    expect(fnMatch).not.toBeNull();
    return fnMatch![1];
  };

  it('has no confirm(), no keep-typed branch, and does not depend on the listing type', () => {
    const body = selectBody();
    expect(body).not.toContain('confirm(');
    expect(body).not.toContain('useCanonical');
    expect(body).not.toContain('_isInHouseListingType');
  });

  it('writes the building address and still populates the building fields', () => {
    const body = selectBody();
    expect(body).toContain("setVal(prefix + 'StreetAddress', building.address)");
    expect(body).toContain('populateBuildingFromIDX(prefix, building)');
  });

  it('tells the agent when what they typed was replaced by the Cotality address', () => {
    expect(selectBody()).toContain('Address set to the one Cotality holds for this building');
  });
});

// ─── 6. Non-InHouse preserves existing lookup behavior ──────────────────────

describe('Form — Non-InHouse lookup behavior preserved', () => {
  it('selectBuildingFromIDX still overwrites address for non-InHouse (no confirm gate)', () => {
    const fnMatch = formHtml.match(/function selectBuildingFromIDX\(prefix, picked\)\s*\{([\s\S]{0,9000}?)\n\}/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![1];
    expect(body).not.toContain('confirm(');
    expect(body).toContain("setVal(prefix + 'StreetAddress', building.address)");
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

// ─── 9. Address parser — parseAddressQuery ──────────────────────────────────

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

  it('Cotality OData uses startswith(StreetNumber,...) not strict eq', () => {
    expect(routeCode).toContain("startswith(StreetNumber,");
  });

  it('Cotality OData uses contains(tolower(StreetName),...) for case-insensitive search', () => {
    expect(routeCode).toContain("contains(tolower(StreetName),");
  });

  it('Cotality OData uses StreetDirPrefix eq for enum comparison', () => {
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

  it('Cotality fallback fires when streetNumber + streetDirPrefix (no streetName)', () => {
    expect(routeCode).toContain("parsed.streetName || parsed.streetDirPrefix");
  });
});
