/// <reference types="jest" />
/**
 * ONE vocabulary authority (Search Consolidation Packet 1).
 *
 *   data/cotality-enums.live.json → canonical/live-truth.ts → engine/criteria.ts → engine/contract.ts
 *
 * Every link is bound here with SET EQUALITY (not subset): a member missing from any link
 * fails. CityRegion is a plain string field (no enum) and is bound live-truth → executor →
 * contract only. These tests prove the chain is one; they prove nothing about the provider
 * itself — that is the live pull + `npm run cotality:verify`.
 */
import * as live from '@/lib/search/canonical/live-truth';
import {
  STANDARD_STATUS_MEMBERS, PROPERTY_TYPE_MEMBERS, COMMON_INTEREST_MEMBERS, STRUCTURE_TYPE_MEMBERS,
  CITY_REGION_VALUES, EXECUTED_PARAMS, displayOf, resolveMember,
} from '@/lib/search/engine/criteria';
import { searchContract } from '@/lib/search/engine/contract';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FILE = require('../../../data/cotality-enums.live.json') as { pulled_at: string | null; enums: Record<string, string[]> };

const sorted = (xs: readonly string[]) => [...xs].sort();

describe('live file → canonical live-truth (set equality)', () => {
  test('the file carries a real pull stamp', () => {
    expect(FILE.pulled_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(live.LIVE_AUTHORITY.verifiedAgainstPull).toBe(FILE.pulled_at);
  });
  test.each([
    ['StandardStatus', live.STANDARD_STATUS_MEMBERS],
    ['PropertyType', live.PROPERTY_TYPE_MEMBERS],
    ['CommonInterest', live.COMMON_INTEREST_MEMBERS],
    ['StructureType', live.STRUCTURE_TYPE_MEMBERS],
  ] as const)('%s members equal the live file', (field, members) => {
    expect(sorted(members)).toEqual(sorted(FILE.enums[field]));
  });
});

describe('canonical live-truth → executor (no hand-maintained copy)', () => {
  test('executor member tokens equal live-truth exactly', () => {
    expect(sorted(STANDARD_STATUS_MEMBERS.map(([t]) => t))).toEqual(sorted(live.STANDARD_STATUS_MEMBERS));
    expect(sorted(PROPERTY_TYPE_MEMBERS.map(([t]) => t))).toEqual(sorted(live.PROPERTY_TYPE_MEMBERS));
    expect(sorted(COMMON_INTEREST_MEMBERS.map(([t]) => t))).toEqual(sorted(live.COMMON_INTEREST_MEMBERS));
    expect(sorted(STRUCTURE_TYPE_MEMBERS.map(([t]) => t))).toEqual(sorted(live.STRUCTURE_TYPE_MEMBERS));
    expect([...CITY_REGION_VALUES]).toEqual([...live.CITY_REGION_VALUES]);
  });
  test('labels are derived from the token, never a second vocabulary', () => {
    expect(displayOf('StockCooperative', COMMON_INTEREST_MEMBERS)).toBe('Stock Cooperative');
    expect(displayOf('FreeStandingBuilding', STRUCTURE_TYPE_MEMBERS)).toBe('Free Standing Building');
    expect(resolveMember('Free Standing Building', STRUCTURE_TYPE_MEMBERS)).toBe('FreeStandingBuilding');
  });
});

describe('executor → contract payload (verbatim)', () => {
  const c = searchContract();
  test('members and parameters are the executor\'s, unchanged', () => {
    expect(c.members.StandardStatus.map((m) => m.token)).toEqual(STANDARD_STATUS_MEMBERS.map(([t]) => t));
    expect(c.members.PropertyType.map((m) => m.token)).toEqual(PROPERTY_TYPE_MEMBERS.map(([t]) => t));
    expect(c.members.CommonInterest.map((m) => m.token)).toEqual(COMMON_INTEREST_MEMBERS.map(([t]) => t));
    expect(c.members.StructureType.map((m) => m.token)).toEqual(STRUCTURE_TYPE_MEMBERS.map(([t]) => t));
    expect(c.cityRegion).toEqual([...CITY_REGION_VALUES]);
    expect(sorted(c.executableParams)).toEqual(sorted([...EXECUTED_PARAMS]));
    expect(c.vocabularyPulledAt).toBe(FILE.pulled_at);
  });
  test('the contract names every parameter the browser is allowed to send, and only those', () => {
    for (const p of ['type', 'status', 'minPrice', 'maxPrice', 'minBeds', 'maxBeds', 'minBaths', 'maxBaths', 'borough', 'neighborhood', 'ownership', 'StructureType', 'zip', 'listingId', 'sort', 'limit', 'skip']) {
      expect(c.executableParams).toContain(p);
    }
    for (const p of ['address', 'keyword', 'minSqft', 'propertySubType', 'dateFrom', 'checkboxFilters']) {
      expect(c.executableParams).not.toContain(p);
    }
  });
});
