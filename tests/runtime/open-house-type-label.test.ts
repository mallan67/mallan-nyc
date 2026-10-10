/// <reference types="jest" />
/**
 * /api/open-houses reaches a card three ways: the live Cotality OpenHouse query with the property expanded, the
 * fallback that fetches the property separately, and the database. The first two labelled the card with a private
 * mapPropertyType() that read only CommonInterest and PropertyType; the third used the canonical
 * mapPropertyTypeToDisplay, so the same listing could carry a different label depending on the path, and a database
 * lease without a CommonInterest printed the raw word "ResidentialLease". The fallback path also never selected
 * PropertySubType from Cotality.
 *
 * openHouseTypeLabel is the one function all three call. The first block pins the labels the old function gave for
 * every input it could tell apart (nothing the cards showed for a condo, a co-op, a condop, a rental or a plain
 * residence changes); the second block pins what is better; the third pins the wiring.
 */
import fs from 'fs';
import path from 'path';
import { openHouseTypeLabel } from '@/lib/open-houses/property-type-label';

describe('labels that did not change', () => {
  it.each([
    ['Condominium', undefined, 'Residential', 'Condo'],
    ['Condominium', undefined, 'ResidentialLease', 'Condo'],
    ['StockCooperative', undefined, 'Residential', 'Co-op'],
    ['StockCooperative', undefined, 'ResidentialLease', 'Co-op'],
    ['Condop', undefined, 'Residential', 'Condop'],
    [undefined, undefined, 'Residential', 'Residential'],
    [undefined, undefined, 'ResidentialLease', 'Rental'],
    [null, null, 'ResidentialLease', 'Rental'],
    ['', '', 'Residential', 'Residential'],
    ['RentalBuilding', undefined, 'ResidentialLease', 'Rental'],
    ['None', undefined, 'Residential', 'Residential'],
    [undefined, undefined, undefined, 'Residential'],
    [undefined, undefined, 'ResidentialIncome', 'Residential'],
  ])('CommonInterest %j, PropertySubType %j, PropertyType %j -> %s', (commonInterest, subType, propertyType, expected) => {
    expect(openHouseTypeLabel(commonInterest, subType, propertyType)).toBe(expected);
  });

  it('CommonInterest still wins over the subtype, as in the canonical mapping', () => {
    expect(openHouseTypeLabel('Condominium', 'Townhouse', 'Residential')).toBe('Condo');
    expect(openHouseTypeLabel('StockCooperative', 'Condominium', 'Residential')).toBe('Co-op');
  });
});

describe('labels that are better now', () => {
  it('reads the property subtype when CommonInterest says nothing, like the database path always did', () => {
    expect(openHouseTypeLabel(undefined, 'Townhouse', 'Residential')).toBe('Townhouse');
    expect(openHouseTypeLabel('Freehold', 'Townhouse', 'Residential')).toBe('Townhouse');
    expect(openHouseTypeLabel(undefined, 'Condominium', 'Residential')).toBe('Condo');
    expect(openHouseTypeLabel(undefined, 'Stock Cooperative', 'Residential')).toBe('Co-op');
    expect(openHouseTypeLabel(undefined, 'Multi-Family', 'Residential')).toBe('Multi-Family');
  });

  it('a lease with no CommonInterest is a Rental, not the raw word "ResidentialLease" (the database path printed it)', () => {
    expect(openHouseTypeLabel(undefined, null, 'ResidentialLease')).toBe('Rental');
    expect(openHouseTypeLabel(undefined, 'Apartment', 'ResidentialLease')).toBe('Rental');
    expect(openHouseTypeLabel(undefined, 'Apartment', 'Residential')).toBe('Residential');
  });

  it('a townhouse rental is a Townhouse', () => {
    expect(openHouseTypeLabel(undefined, 'Townhouse', 'ResidentialLease')).toBe('Townhouse');
  });

  it('is never empty', () => {
    const odd: unknown[][] = [[undefined, undefined, undefined], [null, null, null], [5, 5, 5], [{}, [], true]];
    for (const [commonInterest, subType, propertyType] of odd) {
      expect(openHouseTypeLabel(commonInterest, subType, propertyType).length).toBeGreaterThan(0);
    }
  });
});

describe('the route uses it on all three paths', () => {
  const route = fs.readFileSync(path.resolve(__dirname, '../../app/api/open-houses/route.ts'), 'utf8');

  it('keeps no label function of its own and no longer calls the canonical one directly', () => {
    expect(route).not.toMatch(/function mapPropertyType\b/);
    expect(route).not.toMatch(/\bmapPropertyType\(/);
    expect(route).not.toContain('mapPropertyTypeToDisplay');
    expect(route).toContain("from '@/lib/open-houses/property-type-label'");
  });

  it('calls it exactly three times: the expanded query, the separate property fetch, the database', () => {
    expect((route.match(/openHouseTypeLabel\(/g) || []).length).toBe(3);
    // both Cotality paths, each with the subtype (one of them dropping it would put the labels apart again)
    expect(route.split('openHouseTypeLabel(prop.CommonInterest, prop.PropertySubType, prop.PropertyType)').length - 1).toBe(2);
    expect(route).toMatch(/openHouseTypeLabel\(\(l\.features as Record<string, unknown>\)\?\.CommonInterest, l\.property_sub_type, l\.property_type\)/);
  });

  it('asks Cotality for PropertySubType on every path that labels a card from the feed', () => {
    const selects = route.split('\n').filter((l) => /\$select|\$expand/.test(l) && /CommonInterest/.test(l));
    expect(selects.length).toBe(2);
    for (const line of selects) expect(line).toContain('PropertySubType');
  });
});

// Module scope: without a top-level import/export TypeScript treats this file as a global script.
export {};
