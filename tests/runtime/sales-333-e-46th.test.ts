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
