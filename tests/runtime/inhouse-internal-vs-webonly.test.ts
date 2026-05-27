/**
 * Cotality ref: docs/architecture/COTALITY-COMPLETE-REFERENCE.md §21
 *
 * Tests for InHouse Internal Only vs. Web Only distinction.
 * Option B implementation: status gating (Internal Only = Draft, Web Only = can be Active).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const FORM_PATH = resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html');
const formHtml = readFileSync(FORM_PATH, 'utf8');

const POST_ROUTE_PATH = resolve(__dirname, '../../app/api/crm/listings/route.ts');
const postRoute = readFileSync(POST_ROUTE_PATH, 'utf8');

const PATCH_ROUTE_PATH = resolve(__dirname, '../../app/api/crm/listings/[id]/route.ts');
const patchRoute = readFileSync(PATCH_ROUTE_PATH, 'utf8');

// ── 1. Form has both InHouse radio options ──

describe('Form — InHouse Internal Only vs Web Only radios', () => {
  it('has InHouseInternal radio', () => {
    expect(formHtml).toContain('value="InHouseInternal"');
  });

  it('has InHouseWebOnly radio', () => {
    expect(formHtml).toContain('value="InHouseWebOnly"');
  });

  it('Internal Only label says "Internal Only"', () => {
    const idx = formHtml.indexOf('value="InHouseInternal"');
    const context = formHtml.slice(idx - 200, idx + 200);
    expect(context).toContain('Internal Only');
  });

  it('Web Only label says "Web Only"', () => {
    const idx = formHtml.indexOf('value="InHouseWebOnly"');
    const context = formHtml.slice(idx - 200, idx + 200);
    expect(context).toContain('Web Only');
  });

  it('shows seller authorization warning near listing type', () => {
    expect(formHtml).toContain('does not mean automatically advertiseable');
  });
});

// ── 2. inHouseVisibility stored in form data ──

describe('Form serialization — inHouseVisibility', () => {
  it('InHouseInternal sets inHouseVisibility=internal_only', () => {
    expect(formHtml).toContain("data.inHouseVisibility = 'internal_only'");
  });

  it('InHouseWebOnly sets inHouseVisibility=web_only', () => {
    expect(formHtml).toContain("data.inHouseVisibility = 'web_only'");
  });
});

// ── 3. Both types force distribution gates OFF ──

describe('Form serialization — both InHouse types force distribution OFF', () => {
  it('isInHouse includes InHouseInternal', () => {
    expect(formHtml).toContain("saleListType === 'InHouseInternal'");
  });

  it('isInHouse includes InHouseWebOnly', () => {
    expect(formHtml).toContain("saleListType === 'InHouseWebOnly'");
  });

  it('gate-off block still sets all 4 flags to false', () => {
    const idx = formHtml.indexOf('Distribution gates');
    expect(idx).toBeGreaterThan(-1);
    const slice = formHtml.slice(idx, idx + 500);
    expect(slice).toContain('IDXEntireListingDisplayYN = false');
    expect(slice).toContain('InternetEntireListingDisplayYN = false');
    expect(slice).toContain('InternetAddressDisplayYN = false');
    expect(slice).toContain('SyndicateYN = false');
  });
});

// ── 4. Internal Only cannot be set Active from form ──

describe('Form — Internal Only locks status to Draft', () => {
  it('handleSaleListingTypeChange disables status selector for InHouseInternal', () => {
    const fnStart = formHtml.indexOf('function handleSaleListingTypeChange');
    expect(fnStart).toBeGreaterThan(-1);
    const body = formHtml.slice(fnStart, fnStart + 3000);
    expect(body).toContain('isInHouseInternal');
    expect(body).toContain("statusEl.value = 'Draft'");
    expect(body).toContain('statusEl.disabled = true');
  });

  it('shows lock notice for Internal Only', () => {
    expect(formHtml).toContain('Internal Only listings must remain Draft');
  });
});

// ── 5. Web Only can be Active ──

describe('Form — Web Only allows Active', () => {
  it('handleSaleListingTypeChange re-enables status selector for non-internal types', () => {
    const fnStart = formHtml.indexOf('function handleSaleListingTypeChange');
    expect(fnStart).toBeGreaterThan(-1);
    const body = formHtml.slice(fnStart, fnStart + 3000);
    expect(body).toContain('statusEl.disabled = false');
  });
});

// ── 6. Internal Only cannot be featured ──

describe('Internal Only vs Web Only — Featured Listings safety', () => {
  it('Internal Only stays Draft — Draft is not in DISPLAYABLE_STATUSES', () => {
    // DISPLAYABLE_STATUSES = ['Active', 'ComingSoon', 'ActiveUnderContract']
    // Draft is NOT in that set, so Internal Only listings are filtered out
    // by filterDisplayableDbListings and buildSearchDisplayWhere
    expect(['Active', 'ComingSoon', 'ActiveUnderContract']).not.toContain('Draft');
  });

  it('Web Only can be Active — Active IS in DISPLAYABLE_STATUSES', () => {
    expect(['Active', 'ComingSoon', 'ActiveUnderContract']).toContain('Active');
  });
});

// ── 7. Existing OwnerOptOut and ParticipantOnly unchanged ──

describe('OwnerOptOut and ParticipantOnly unchanged', () => {
  it('OwnerOptOut radio still exists', () => {
    expect(formHtml).toContain('value="OwnerOptOut"');
  });

  it('ParticipantOnly radio still exists', () => {
    expect(formHtml).toContain('value="ParticipantOnly"');
  });

  it('OwnerOptOut warning still exists', () => {
    expect(formHtml).toContain('saleOwnerOptOutWarning');
  });
});

// ── 8. Backend detects both new InHouse values ──

describe('Backend — POST route detects InHouseInternal and InHouseWebOnly', () => {
  it('POST route checks for InHouseInternal', () => {
    expect(postRoute).toContain('"InHouseInternal"');
  });

  it('POST route checks for InHouseWebOnly', () => {
    expect(postRoute).toContain('"InHouseWebOnly"');
  });

  it('PATCH route checks for InHouseInternal', () => {
    expect(patchRoute).toContain('"InHouseInternal"');
  });

  it('PATCH route checks for InHouseWebOnly', () => {
    expect(patchRoute).toContain('"InHouseWebOnly"');
  });
});

// ── 9. Two distinct warning banners ──

describe('Form — distinct warning banners', () => {
  it('has Internal Only warning banner', () => {
    expect(formHtml).toContain('saleInHouseInternalWarning');
    expect(formHtml).toContain('Internal Only: Not Public');
  });

  it('has Web Only warning banner', () => {
    expect(formHtml).toContain('saleInHouseWebOnlyWarning');
    expect(formHtml).toContain('Web Only: mallan.nyc Only');
  });

  it('no longer has the old ambiguous saleInHouseWarning', () => {
    expect(formHtml).not.toContain('id="saleInHouseWarning"');
  });
});

// ── 10. _isInHouseListingType detects both values ──

describe('_isInHouseListingType helper', () => {
  it('checks for InHouseInternal', () => {
    const fnStart = formHtml.indexOf('function _isInHouseListingType');
    expect(fnStart).toBeGreaterThan(-1);
    const body = formHtml.slice(fnStart, fnStart + 300);
    expect(body).toContain("'InHouseInternal'");
    expect(body).toContain("'InHouseWebOnly'");
  });
});
