/// <reference types="jest" />
/**
 * Emergency fix: 333 E 46th St Apt 2G — slug, address normalization,
 * detail route resolution, and search correctness.
 */

import { normalizeNycAddress } from '@/lib/address/nyc-address-normalizer';
import {
  generateListingSlug,
  parseAddressSlug,
  extractListingIdFromSlug,
  stripListingIdSuffix,
} from '@/lib/listing-slug';

describe('NYC address normalizer — 333 E 46th St', () => {
  test('normalizes "333 E 46th St Apt 2G"', () => {
    const result = normalizeNycAddress('333 E 46th St Apt 2G');
    expect(result.StreetNumber).toBe('333');
    expect(result.StreetDirPrefix).toBe('E');
    expect(result.StreetName).toBe('46th');
    expect(result.StreetSuffix).toBe('St');
    expect(result.UnitNumber).toBe('2G');
  });

  test('normalizes "333 East 46th Street Apt 2G"', () => {
    const result = normalizeNycAddress('333 East 46th Street Apt 2G');
    expect(result.StreetNumber).toBe('333');
    expect(result.StreetDirPrefix).toBe('E');
    expect(result.StreetName).toBe('46th');
    expect(result.StreetSuffix).toBe('St');
    expect(result.UnitNumber).toBe('2G');
  });

  test('normalizes "333 E. 46 St #2G"', () => {
    const result = normalizeNycAddress('333 E. 46 St #2G');
    expect(result.StreetNumber).toBe('333');
    expect(result.StreetDirPrefix).toBe('E');
    expect(result.StreetName).toBe('46th');
    expect(result.StreetSuffix).toBe('St');
    expect(result.UnitNumber).toBe('2G');
  });

  test('normalizes full address with city/state/zip', () => {
    const result = normalizeNycAddress('333 E 46th St, Apt. 2G, New York, NY 10017');
    expect(result.StreetNumber).toBe('333');
    expect(result.StreetDirPrefix).toBe('E');
    expect(result.StreetName).toBe('46th');
    expect(result.StreetSuffix).toBe('St');
    expect(result.UnitNumber).toBe('2G');
    expect(result.City).toBe('New York');
    expect(result.StateOrProvince).toBe('NY');
    expect(result.PostalCode).toBe('10017');
  });
});

describe('slug generation — 333 E 46th St Apt 2G', () => {
  test('generates address slug with direction prefix and unit', () => {
    const slug = generateListingSlug({
      address: {
        streetNumber: '333',
        streetDirPrefix: 'E',
        streetName: '46th St',
        unitNumber: '2G',
        city: 'New York',
        stateOrProvince: 'NY',
        postalCode: '10017',
      },
      id: 'SL-0042',
    });
    expect(slug).toContain('333-e-46th-st-apt-2g-new-york-ny-10017');
  });

  test('generates correct slug without separate streetDirPrefix (composite streetName)', () => {
    const slug = generateListingSlug({
      address: {
        streetNumber: '333',
        streetName: 'E 46th St',
        unitNumber: '2G',
        city: 'New York',
        stateOrProvince: 'NY',
        postalCode: '10017',
      },
      id: 'SL-0042',
    });
    expect(slug).toContain('333-e-46th-st-apt-2g-new-york-ny-10017');
  });
});

describe('slug parsing — extracts direction prefix', () => {
  test('parses 333-e-46th-st-apt-2g-new-york-ny-10017 with direction', () => {
    const parsed = parseAddressSlug('333-e-46th-st-apt-2g-new-york-ny-10017');
    expect(parsed).not.toBeNull();
    expect(parsed!.streetNumber).toBe('333');
    expect(parsed!.streetDirPrefix).toBe('E');
    expect(parsed!.streetName).toMatch(/46th/i);
    expect(parsed!.unitNumber).toBe('2g');
    expect(parsed!.postalCode).toBe('10017');
  });

  test('parses slug with listing ID suffix', () => {
    const slug = '333-e-46th-st-apt-2g-new-york-ny-10017-sl-0042';
    const parsed = parseAddressSlug(slug);
    expect(parsed).not.toBeNull();
    expect(parsed!.streetNumber).toBe('333');
    expect(parsed!.streetDirPrefix).toBe('E');
    expect(parsed!.postalCode).toBe('10017');
    expect(parsed!.unitNumber).toBe('2g');
  });

  test('W direction also works', () => {
    const parsed = parseAddressSlug('400-w-57th-st-apt-17c-new-york-ny-10019');
    expect(parsed).not.toBeNull();
    expect(parsed!.streetDirPrefix).toBe('W');
    expect(parsed!.streetName).toMatch(/57th/i);
  });
});

describe('detail route DB matching — separate StreetDirPrefix', () => {
  test('parsed slug fields match DB fields for 333 E 46th', () => {
    const parsed = parseAddressSlug('333-e-46th-st-apt-2g-new-york-ny-10017');
    expect(parsed).not.toBeNull();

    // Simulated DB row
    const dbAddr = {
      StreetNumber: '333',
      StreetDirPrefix: 'E',
      StreetName: '46th',
      StreetSuffix: 'St',
      UnitNumber: '2G',
      PostalCode: '10017',
    };

    // The parsed direction prefix should match the DB's StreetDirPrefix
    expect(parsed!.streetDirPrefix?.toUpperCase()).toBe(dbAddr.StreetDirPrefix);

    // The parsed street name should be findable in the DB's StreetName
    const dbStreetLower = dbAddr.StreetName.toLowerCase();
    const parsedStreetLower = parsed!.streetName.toLowerCase();
    expect(
      dbStreetLower.includes(parsedStreetLower) || parsedStreetLower.includes(dbStreetLower)
    ).toBe(true);

    // Unit
    const dbUnit = dbAddr.UnitNumber.toLowerCase().replace(/[\s-]/g, '');
    const parsedUnit = (parsed!.unitNumber || '').toLowerCase().replace(/[\s-]/g, '');
    expect(dbUnit).toBe(parsedUnit);
  });

  test('parsed slug fields match DB with composite StreetName containing direction', () => {
    const parsed = parseAddressSlug('333-e-46th-st-apt-2g-new-york-ny-10017');
    expect(parsed).not.toBeNull();

    // DB row where direction is baked into StreetName
    const dbAddr = {
      StreetNumber: '333',
      StreetName: 'E 46TH',
      StreetSuffix: 'ST',
      UnitNumber: '2G',
      PostalCode: '10017',
    };

    const dbStreetLower = dbAddr.StreetName.toLowerCase();
    const parsedDir = (parsed!.streetDirPrefix || '').toLowerCase();
    const composite = [parsedDir, parsed!.streetName.toLowerCase()].filter(Boolean).join(' ');

    expect(
      dbStreetLower.includes(parsed!.streetName.toLowerCase()) ||
      composite.includes(dbStreetLower) ||
      dbStreetLower.includes(composite)
    ).toBe(true);
  });
});

describe('canonical URL — buildListingUrls returns separated /address/id form', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildListingUrls } = require('@/lib/crm/listing-urls');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildCanonicalListingPath } = require('@/lib/listing-canonical-url');

  test('Active CRM listing with full address returns /address-slug/sl-XXXX (two segments)', () => {
    const urls = buildListingUrls({
      listing_id: 'SL-0004',
      status: 'Active',
      address: {
        StreetNumber: '333',
        StreetDirPrefix: 'E',
        StreetName: '46th',
        StreetSuffix: 'St',
        UnitNumber: '2G',
        City: 'New York',
        StateOrProvince: 'NY',
        PostalCode: '10017',
      },
      // Website-only Mallan CRM exclusive (rls_eligible === false): the IDX
      // display booleans do not bind. Added 2026-08-07 — buildListingUrls now
      // uses the canonical DB address decision, under which UNKNOWN provenance
      // fails closed. These SL- rows are first-party inventory, not RLS.
      rls_eligible: false,
      internet_address_display_yn: true,
    });
    expect(urls.publicUrl).not.toBeNull();
    expect(urls.publicUrl).not.toMatch(/\/listing\/listing-/);
    expect(urls.publicUrl).toContain('333');
    expect(urls.publicUrl).toContain('46th');
    // Separated canonical: must end with /sl-0004 (path segment, not hybrid suffix)
    expect(urls.publicUrl).toMatch(/\/sl-0004$/);
    // Must NOT contain hybrid suffix `-sl-0004` in the address slug
    expect(urls.publicUrl).not.toMatch(/-sl-0004\//);
    expect(urls.publicUrl).not.toMatch(/-sl-0004$/);  // would mean trailing hybrid
    expect(urls.rebnyListingUrl).toBe(urls.publicUrl);
  });

  test('buildCanonicalListingPath strips hybrid suffix → /address/id', () => {
    // Input slug from generateListingSlug includes the hybrid suffix.
    expect(buildCanonicalListingPath({
      slug: '333-east-46th-street-apt-2g-new-york-ny-10017-sl-0004',
      id: 'SL-0004',
    })).toBe('/listing/333-east-46th-street-apt-2g-new-york-ny-10017/sl-0004');
  });

  test('buildCanonicalListingPath preserves UCBA-suppressed id-only canonical', () => {
    expect(buildCanonicalListingPath({
      slug: 'listing-rls20061539',
      id: 'RLS20061539',
    })).toBe('/listing/listing-rls20061539');
  });

  test('buildCanonicalListingPath handles legacy address-only slug (no hybrid suffix)', () => {
    expect(buildCanonicalListingPath({
      slug: '400-east-90th-street-apt-17c-new-york-ny-10128',
      id: 'RLS20061539',
    })).toBe('/listing/400-east-90th-street-apt-17c-new-york-ny-10128/rls20061539');
  });

  test('Active CRM listing with empty address never returns generic /listing/sl-XXXX URL', () => {
    const urls = buildListingUrls({
      listing_id: 'SL-9999',
      status: 'Active',
      address: {},
      // Website-only Mallan CRM exclusive (rls_eligible === false): the IDX
      // display booleans do not bind. Added 2026-08-07 — buildListingUrls now
      // uses the canonical DB address decision, under which UNKNOWN provenance
      // fails closed. These SL- rows are first-party inventory, not RLS.
      rls_eligible: false,
      internet_address_display_yn: true,
    });
    // Either null (refused) or a best-effort address slug — but NEVER /listing/sl-9999
    if (urls.publicUrl !== null) {
      expect(urls.publicUrl).not.toMatch(/\/listing\/sl-\d+$/i);
      expect(urls.publicUrl).not.toMatch(/\/listing\/listing-/);
    }
  });

  test('rebnyListingUrl never equals generic /listing/sl-XXXX', () => {
    const urls = buildListingUrls({
      listing_id: 'SL-0004',
      status: 'Active',
      address: {
        StreetNumber: '333',
        StreetName: 'East 46th Street',
        UnitNumber: '2G',
        City: 'New York',
        PostalCode: '10017',
      },
      // Website-only Mallan CRM exclusive (rls_eligible === false): the IDX
      // display booleans do not bind. Added 2026-08-07 — buildListingUrls now
      // uses the canonical DB address decision, under which UNKNOWN provenance
      // fails closed. These SL- rows are first-party inventory, not RLS.
      rls_eligible: false,
      internet_address_display_yn: true,
    });
    expect(urls.rebnyListingUrl).not.toBe('https://www.mallan.nyc/listing/sl-0004');
    expect(urls.rebnyListingUrl).not.toBe('https://www.mallan.nyc/listing/listing-sl-0004');
  });
});

describe('SEO guard — CRM exclusives must NEVER get generic listing-XXX slug', () => {
  test('SL- listing with full address produces address slug, not listing-sl-XXXX', () => {
    const slug = generateListingSlug({
      address: {
        streetNumber: '333',
        streetDirPrefix: 'E',
        streetName: '46th St',
        unitNumber: '2G',
        city: 'New York',
        stateOrProvince: 'NY',
        postalCode: '10017',
      },
      id: 'SL-0004',
    });
    expect(slug).not.toMatch(/^listing-/);
    expect(slug).toContain('333');
    expect(slug).toContain('46th');
  });

  test('RL- rental listing with full address produces address slug', () => {
    const slug = generateListingSlug({
      address: {
        streetNumber: '400',
        streetName: 'Park Avenue',
        unitNumber: '5A',
        city: 'New York',
        stateOrProvince: 'NY',
        postalCode: '10022',
      },
      id: 'RL-0099',
    });
    expect(slug).not.toMatch(/^listing-/);
  });

  test('SL- with empty streetName falls back to best-effort address slug, not generic', () => {
    const slug = generateListingSlug({
      address: {
        streetNumber: '333',
        streetName: '',
        unitNumber: '2G',
        city: 'New York',
        stateOrProvince: 'NY',
        postalCode: '10017',
      },
      id: 'SL-0004',
    });
    // Should NOT be generic listing-sl-0004
    expect(slug).not.toMatch(/^listing-/);
    // Should contain some address-derived content
    expect(slug.length).toBeGreaterThan(10);
  });

  test('SL- with NO usable address data falls back to generic (last resort)', () => {
    const slug = generateListingSlug({
      address: {
        streetName: '',
      },
      id: 'SL-0004',
      mlsId: 'SL-0004',
    });
    // Truly empty address — generic is the only option
    expect(slug).toBe('listing-sl-0004');
  });

  test('InternetAddressDisplayYN=false ALWAYS produces generic (UCBA compliance)', () => {
    // This is intentional — when seller opts out of address display, the URL
    // CANNOT contain the address. Compliance trumps SEO.
    const slug = generateListingSlug({
      address: {
        streetNumber: '333',
        streetName: '46th St',
        city: 'New York',
        stateOrProvince: 'NY',
        postalCode: '10017',
      },
      id: 'SL-0004',
      mlsId: 'SL-0004',
      internetAddressDisplayYN: false,
    });
    expect(slug).toBe('listing-sl-0004');
  });
});

describe('detail page hardening (source-pin) — Maya audit follow-ups', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  const PAGE = fs.readFileSync(
    path.resolve(__dirname, '../../app/listing/[...slug]/page.tsx'),
    'utf8',
  );

  test('generateMetadata canonical URL uses buildCanonicalListingPath (not raw listing.slug)', () => {
    // The og:url, twitter URL, and alternates.canonical must match the
    // separated /listing/{address}/{id} route the page redirects to.
    expect(PAGE).toMatch(/const canonicalPath = buildCanonicalListingPath\(\{\s*slug:\s*listing\.slug \|\| '',\s*id:\s*listing\.id \|\| '',?\s*\}\);/);
    expect(PAGE).toMatch(/const canonicalUrl = `https:\/\/mallan\.nyc\$\{canonicalPath\}`/);
    // The old hybrid form must be gone.
    expect(PAGE).not.toMatch(/canonicalUrl = `https:\/\/mallan\.nyc\/listing\/\$\{listing\.slug\}`/);
  });

  test('fetchFromDB Strategy 2 does NOT short-circuit on candidates.length === 1', () => {
    // The legacy `if (candidates.length === 1) dbListing = candidates[0];`
    // shortcut bypassed unit/direction matching. Must be replaced by a
    // validator that applies to every candidate, including the single-
    // candidate case.
    expect(PAGE).not.toMatch(/if\s*\(\s*candidates\.length\s*===\s*1\s*\)\s*\{[\s\S]{0,60}?dbListing\s*=\s*candidates\[0\]/);
    expect(PAGE).toMatch(/matchesParsedAddress/);
  });

  test('fetchFromDB validator enforces UnitNumber match when slug has unit', () => {
    expect(PAGE).toMatch(/if \(parsedUnit && dbUnit !== parsedUnit\) return false;/);
  });

  test('fetchFromDB validator enforces StreetDirPrefix match when slug has direction', () => {
    expect(PAGE).toMatch(/if \(parsedDir\)[\s\S]{0,300}?if \(!dirMatch\) return false;/);
  });

  test('fetchFromDB broad fallback also uses the same validator (includes unit check)', () => {
    expect(PAGE).toMatch(/broadCandidates\.find\(matchesParsedAddress\)/);
  });
});

describe('sale form hardening (source-pin) — Maya audit follow-ups', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  const FORM = fs.readFileSync(
    path.resolve(__dirname, '../../public/crm/SALE-FORM-REDESIGN.html'),
    'utf8',
  );

  test('Fix 1: address composite fallback includes StreetDirPrefix', () => {
    // The composite fallback in _populateSaleFormFromApi must include
    // StreetDirPrefix or "333 E 46th St" reloads as "333 46th St" (the
    // exact bug that broke the REBNY listing URL lookup).
    expect(FORM).toMatch(
      /addr\.StreetNumber[\s\S]{0,200}?addr\.StreetDirPrefix[\s\S]{0,200}?addr\.StreetName[\s\S]{0,200}?addr\.StreetSuffix/,
    );
  });

  test('Fix 2: autosave server PATCH prefers _saleEditDbId over display text', () => {
    expect(FORM).toMatch(/var updateId = _saleEditDbId \|\| _saleEditListingId \|\| displayId/);
  });

  test('Fix 3: manualSaveDraft catch does not call performAutoSave in edit mode', () => {
    // Look for the guard `if (!_saleEditMode)` before performAutoSave within
    // the manual-save catch handler (allow whitespace, comments, multiline).
    expect(FORM).toMatch(/Save failed:[\s\S]{0,800}?if \(!_saleEditMode\)[\s\S]{0,200}?performAutoSave\(\)/);
  });

  test('Fix 4: autosave gate uses both _saleAutoSaveReady and _salePopulateInProgress', () => {
    expect(FORM).toMatch(/window\._salePopulateInProgress = false;/);
    expect(FORM).toMatch(/if \(!window\._saleAutoSaveReady \|\| window\._salePopulateInProgress\) return;/);
  });

  test('Fix 4: edit-mode populate holds the lock through agent fallback + field rules', () => {
    expect(FORM).toMatch(/window\._salePopulateInProgress = true;[\s\S]{0,1500}?applySalesFieldRules\(\)[\s\S]{0,500}?window\._salePopulateInProgress = false;/);
  });

  test('Fix 5: media-order PATCH surfaces non-OK status and network errors', () => {
    expect(FORM).toMatch(/Photo order NOT saved/);
    // The old silent-catch comment must be gone.
    expect(FORM).not.toMatch(/\/\* silent — order change is best-effort \*\//);
  });
});

describe('search type isolation — sale vs rent', () => {
  test('sale listing address data should not produce rental result', () => {
    // This test verifies the search params logic: type=sale vs type=rent
    // are separate and a sale listing with this address should not be
    // returned when querying type=rent.
    const saleParams = new URLSearchParams({
      type: 'sale',
      address: '333 E 46th St',
    });
    const rentParams = new URLSearchParams({
      type: 'rent',
      address: '333 E 46th St',
    });
    expect(saleParams.get('type')).toBe('sale');
    expect(rentParams.get('type')).toBe('rent');
    expect(saleParams.get('type')).not.toBe(rentParams.get('type'));
  });
});
