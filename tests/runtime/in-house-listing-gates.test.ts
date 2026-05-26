/// <reference types="jest" />
/**
 * InHouse listing gate tests — PR-Exclusive.1.
 *
 * Proves:
 *   1. InHouse forces all 4 distribution gates OFF in form serialization
 *   2. InHouse → rls_eligible=false in backend eligibility classification
 *   3. Website-only (rls_eligible=false) listings pass filterDisplayableDbListings
 *   4. IDX lookup is suppressed when listing type is InHouse
 *   5. Non-InHouse listing types preserve IDX lookup behavior
 *   6. Switching to InHouse clears IDX match state
 */

// ─── 1. Form serialization: InHouse forces distribution gates OFF ───────────

describe('Form serialization — InHouse distribution gates', () => {
  it('InHouse must be included in the gate-off condition alongside OwnerOptOut/ParticipantOnly', () => {
    const fs = require('fs');
    const html = fs.readFileSync(
      require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'),
      'utf8'
    );
    const gatePattern = /if\s*\(\s*isOwnerOptOut\s*\|\|\s*isParticipantOnly\s*\|\|\s*isInHouse\s*\)/;
    expect(html).toMatch(gatePattern);
  });

  it('gate-off block sets all 4 flags to false', () => {
    const fs = require('fs');
    const html = fs.readFileSync(
      require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'),
      'utf8'
    );
    const idx = html.indexOf('Distribution gates');
    expect(idx).toBeGreaterThan(-1);
    const slice = html.slice(idx, idx + 500);
    expect(slice).toContain('IDXEntireListingDisplayYN = false');
    expect(slice).toContain('InternetEntireListingDisplayYN = false');
    expect(slice).toContain('InternetAddressDisplayYN = false');
    expect(slice).toContain('SyndicateYN = false');
  });
});

// ─── 2. Backend: InHouse → rls_eligible=false ───────────────────────────────

describe('Backend — InHouse RLS eligibility', () => {
  it('POST handler treats saleListingType=InHouse as explicitOptOut', () => {
    const fs = require('fs');
    const postRoute = fs.readFileSync(
      require('path').resolve(__dirname, '../../app/api/crm/listings/route.ts'),
      'utf8'
    );
    expect(postRoute).toContain('body.saleListingType === "InHouse"');
    expect(postRoute).toContain('isInHouse');
    expect(postRoute).toMatch(/explicitOptOut:.*isInHouse/);
  });

  it('PATCH handler treats merged InHouse as explicitOptOut', () => {
    const fs = require('fs');
    const patchRoute = fs.readFileSync(
      require('path').resolve(__dirname, '../../app/api/crm/listings/[id]/route.ts'),
      'utf8'
    );
    expect(patchRoute).toContain('merged.saleListingType === "InHouse"');
    expect(patchRoute).toMatch(/explicitOptOut:.*isInHouse/);
  });
});

// ─── 3. Website-only bypass in filterDisplayableDbListings ──────────────────

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

// ─── 4. IDX lookup suppressed for InHouse ───────────────────────────────────

describe('Form — IDX lookup suppression for InHouse', () => {
  it('searchBuildingForListing returns early when InHouse', () => {
    const fs = require('fs');
    const html = fs.readFileSync(
      require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'),
      'utf8'
    );
    const fnMatch = html.match(/function searchBuildingForListing\(query, prefix\)\s*\{([^}]{0,500})/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain('_isInHouseListingType(prefix)');
  });

  it('saleAddressBlurLookup returns early when InHouse', () => {
    const fs = require('fs');
    const html = fs.readFileSync(
      require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'),
      'utf8'
    );
    const fnMatch = html.match(/function saleAddressBlurLookup\(\)\s*\{([^}]{0,300})/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain('_isInHouseListingType');
  });
});

// ─── 5. Non-InHouse preserves IDX lookup ────────────────────────────────────

describe('Form — Non-InHouse IDX lookup preserved', () => {
  it('searchBuildingForListing still calls fetchBuildingsFromAPI for non-InHouse', () => {
    const fs = require('fs');
    const html = fs.readFileSync(
      require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'),
      'utf8'
    );
    expect(html).toContain('fetchBuildingsFromAPI(query)');
    expect(html).toContain('selectBuildingFromIDX');
  });
});

// ─── 6. Switching to InHouse clears IDX match state ─────────────────────────

describe('Form — handleSaleListingTypeChange clears IDX state for InHouse', () => {
  it('handleSaleListingTypeChange calls _clearIdxMatchState when InHouse', () => {
    const fs = require('fs');
    const html = fs.readFileSync(
      require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'),
      'utf8'
    );
    const fnMatch = html.match(/function handleSaleListingTypeChange\(value\)\s*\{([\s\S]{0,800}?)\n\}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain("_clearIdxMatchState('sale')");
  });

  it('_clearIdxMatchState hides banner and clears search', () => {
    const fs = require('fs');
    const html = fs.readFileSync(
      require('path').resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'),
      'utf8'
    );
    expect(html).toContain("function _clearIdxMatchState(prefix)");
    const fnMatch = html.match(/function _clearIdxMatchState\(prefix\)\s*\{([\s\S]{0,500}?)\n\}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain("IdxMatchBanner");
    expect(fnMatch![1]).toContain("BuildingSearchResults");
    expect(fnMatch![1]).toContain("BuildingSearch");
  });
});
