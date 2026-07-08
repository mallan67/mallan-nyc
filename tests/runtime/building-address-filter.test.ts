/// <reference types="jest" />
/**
 * Canonical building-address → Trestle OData filter.
 * Locks the Cotality-accurate behavior: UPPERCASE core (contains() is
 * case-sensitive), leading-direction handling, and the empty-core guard.
 */
import {
  parseBuildingAddress,
  buildBuildingAddressFilter,
} from '@/lib/buildings/building-address-filter';

describe('parseBuildingAddress', () => {
  it('uppercases the core (Trestle stores StreetName UPPERCASE; contains() is case-sensitive)', () => {
    // The bug this fixes: raw "Park" never matched "PARK AVENUE".
    for (const name of ['Park Avenue', 'PARK AVENUE', 'park avenue']) {
      expect(parseBuildingAddress('432', name, '10022').coreStreetNameUpper).toBe('PARK');
    }
  });

  it('strips a leading direction and captures it for StreetDirPrefix', () => {
    const p = parseBuildingAddress('50', 'W 66th Street', '10023');
    expect(p.coreStreetNameUpper).toBe('66TH');
    expect(p.dirPrefix).toBe('W');
  });

  it('NEVER returns an empty core — "West Street" falls back to the full name', () => {
    // strip leading "WEST" + suffix "STREET" => "" ; guard must fall back.
    const p = parseBuildingAddress('401', 'West Street', '10014');
    expect(p.coreStreetNameUpper).toBe('WEST STREET');
    expect(p.coreStreetNameUpper.length).toBeGreaterThan(0);
  });

  it('keeps a non-leading direction in the core (Central Park W / S)', () => {
    expect(parseBuildingAddress('55', 'Central Park W', '10023').coreStreetNameUpper).toBe('CENTRAL PARK W');
    expect(parseBuildingAddress('1', 'Central Park S', '10019').coreStreetNameUpper).toBe('CENTRAL PARK S');
  });

  it('handles a named avenue (Lafayette Street)', () => {
    expect(parseBuildingAddress('445', 'Lafayette Street', '10003').coreStreetNameUpper).toBe('LAFAYETTE');
  });
});

describe('buildBuildingAddressFilter', () => {
  it('builds a StreetNumber + contains(StreetName) + PostalCode filter', () => {
    const f = buildBuildingAddressFilter(parseBuildingAddress('432', 'Park Avenue', '10022'));
    expect(f).toBe("StreetNumber eq '432' and contains(StreetName,'PARK') and PostalCode eq '10022'");
  });

  it('never emits contains(StreetName,\'\') (would match every listing)', () => {
    const f = buildBuildingAddressFilter(parseBuildingAddress('401', 'West Street', '10014'));
    expect(f).not.toMatch(/contains\(StreetName,''\)/);
    expect(f).toContain("contains(StreetName,'WEST STREET')");
  });

  it('optionally adds StreetDirPrefix when requested', () => {
    const f = buildBuildingAddressFilter(parseBuildingAddress('50', 'W 66th Street', '10023'), {
      includeDirPrefix: true,
    });
    expect(f).toContain("StreetDirPrefix eq 'W'");
  });

  it('never uses MlsStatus (StandardStatus is the query axis — separate clause)', () => {
    const f = buildBuildingAddressFilter(parseBuildingAddress('432', 'Park Avenue', '10022'));
    expect(f).not.toMatch(/MlsStatus/);
  });
});
