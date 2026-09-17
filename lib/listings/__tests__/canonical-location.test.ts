/**
 * CANONICAL LOCATION — the one interpretation of the REBNY feed's location fields.
 *
 * Declared by Maya 2026-09-08 on exhaustive live evidence
 * (docs/operations/evidence-2026-09-08/location-semantics.md): on every one of 591,596 live rows
 * City = "New York City"; CityRegion = exactly the five boroughs; SubdivisionName = 723 NYC
 * neighborhood names; CountyOrParish = the five counties (disagreeing with CityRegion on 35 rows);
 * MLSAreaMajor/Minor empty on all rows. Hence:
 *   borough      ← CityRegion (never inferred from county or city)
 *   neighborhood ← SubdivisionName only (no CityRegion fallback — that would store a borough)
 *   county       ← CountyOrParish, its own fact
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  COUNTY_BY_BOROUGH,
  MALLAN_BOROUGHS,
  PROVIDER_CITY_REGION_VALUES,
  boroughFromCityRegion,
  cityRegionForBorough,
  countyFromCountyOrParish,
  locationFromProviderRow,
  neighborhoodFromSubdivisionName,
} from '@/lib/listings/canonical-location';
import { mapTrestleToPrisma } from '@/lib/idx/trestle-mapper';
import { CITY_REGION_VALUES } from '@/lib/search/canonical/live-truth';

const EVIDENCE = path.resolve(__dirname, '../../../docs/operations/evidence-2026-09-08/location/CityRegion.json');

describe('provider vocabulary is the live-measured set, not a hand-typed one', () => {
  it('PROVIDER_CITY_REGION_VALUES equals the committed, count-reconciled live census (complete: true)', () => {
    const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8')) as { values: string[]; complete: boolean };
    expect(evidence.complete).toBe(true);
    expect([...PROVIDER_CITY_REGION_VALUES].sort()).toEqual([...evidence.values].sort());
  });

  it('agrees with the Search engine vocabulary (no second opinion)', () => {
    expect([...PROVIDER_CITY_REGION_VALUES].sort()).toEqual([...CITY_REGION_VALUES].sort());
  });
});

describe('boroughFromCityRegion', () => {
  it('maps each live CityRegion value to the Mallan borough; StatenIsland gains its space', () => {
    expect(boroughFromCityRegion('Manhattan')).toBe('Manhattan');
    expect(boroughFromCityRegion('Brooklyn')).toBe('Brooklyn');
    expect(boroughFromCityRegion('Queens')).toBe('Queens');
    expect(boroughFromCityRegion('Bronx')).toBe('Bronx');
    expect(boroughFromCityRegion('StatenIsland')).toBe('Staten Island');
  });

  it('accepts the Mallan display forms (CRM input) and is case-insensitive', () => {
    for (const b of MALLAN_BOROUGHS) expect(boroughFromCityRegion(b)).toBe(b);
    expect(boroughFromCityRegion('staten island')).toBe('Staten Island');
    expect(boroughFromCityRegion('MANHATTAN')).toBe('Manhattan');
  });

  it('never derives a borough from a county, a city, or nothing', () => {
    expect(boroughFromCityRegion('Kings')).toBeNull();
    expect(boroughFromCityRegion('New York')).toBeNull();
    expect(boroughFromCityRegion('Richmond')).toBeNull();
    expect(boroughFromCityRegion('New York City')).toBeNull();
    expect(boroughFromCityRegion(null)).toBeNull();
    expect(boroughFromCityRegion('')).toBeNull();
    expect(boroughFromCityRegion(42)).toBeNull();
  });
});

describe('cityRegionForBorough — the $filter literal', () => {
  it('returns the live provider value for a Mallan borough', () => {
    expect(cityRegionForBorough('Staten Island')).toBe('StatenIsland');
    expect(cityRegionForBorough('StatenIsland')).toBe('StatenIsland');
    expect(cityRegionForBorough('Manhattan')).toBe('Manhattan');
    expect(cityRegionForBorough('the bronx')).toBeNull();
    expect(cityRegionForBorough('Kings')).toBeNull();
  });
});

describe('neighborhood and county', () => {
  it('neighborhood is SubdivisionName, trimmed; empty is unknown', () => {
    expect(neighborhoodFromSubdivisionName(' Upper East Side ')).toBe('Upper East Side');
    expect(neighborhoodFromSubdivisionName('')).toBeNull();
    expect(neighborhoodFromSubdivisionName(null)).toBeNull();
  });

  it('county is CountyOrParish verbatim; the borough→county table is NYC geography for Mallan rows only', () => {
    expect(countyFromCountyOrParish('Kings')).toBe('Kings');
    expect(countyFromCountyOrParish('')).toBeNull();
    expect(COUNTY_BY_BOROUGH['Staten Island']).toBe('Richmond');
    expect(COUNTY_BY_BOROUGH.Manhattan).toBe('New York');
  });
});

describe('locationFromProviderRow — one of the 35 live rows where county and CityRegion disagree', () => {
  it('borough follows CityRegion; county stays the county fact', () => {
    const loc = locationFromProviderRow({ CityRegion: 'Brooklyn', CountyOrParish: 'New York', City: 'New York City', SubdivisionName: 'Williamsburg', PostalCity: 'New York', PostalCode: '11249-1498' });
    expect(loc).toEqual({ borough: 'Brooklyn', neighborhood: 'Williamsburg', county: 'New York', city: 'New York City', postalCity: 'New York', postalCode: '11249-1498' });
  });

  it('absent CityRegion → borough unknown (null), even with a county present', () => {
    const loc = locationFromProviderRow({ CountyOrParish: 'Kings', SubdivisionName: 'Park Slope' });
    expect(loc.borough).toBeNull();
    expect(loc.county).toBe('Kings');
    expect(loc.neighborhood).toBe('Park Slope');
  });
});

describe('mapTrestleToPrisma uses the canonical location', () => {
  const raw = (over: Record<string, unknown>) => ({
    ListingKey: '1090000001', ListingId: 'RLS-LOC-1', StandardStatus: 'Active', PropertyType: 'Residential',
    ListPrice: 1000000, ModificationTimestamp: '2026-09-08T00:00:00Z', ...over,
  });

  it('borough ← CityRegion (StatenIsland → Staten Island); county never wins', () => {
    expect(mapTrestleToPrisma(raw({ CityRegion: 'StatenIsland', CountyOrParish: 'Richmond' })).borough).toBe('Staten Island');
    expect(mapTrestleToPrisma(raw({ CityRegion: 'Brooklyn', CountyOrParish: 'New York' })).borough).toBe('Brooklyn');
  });

  it('no CityRegion → borough null, not inferred from CountyOrParish or City', () => {
    expect(mapTrestleToPrisma(raw({ CountyOrParish: 'Kings', City: 'New York City' })).borough).toBeNull();
  });

  it('neighborhood ← SubdivisionName only; a missing SubdivisionName never becomes the borough', () => {
    expect(mapTrestleToPrisma(raw({ CityRegion: 'Manhattan', SubdivisionName: 'Tribeca' })).neighborhood).toBe('Tribeca');
    expect(mapTrestleToPrisma(raw({ CityRegion: 'Manhattan' })).neighborhood).toBeNull();
  });
});
