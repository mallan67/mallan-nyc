/// <reference types="jest" />
/**
 * The shared executor (Packet 2): the alert delta is decided over the COMPLETE universe, in
 * universe order, before any delivery cap — never over the first page.
 */
import { rowsModifiedSince, universeKeyOf } from '@/lib/search/engine/executor';
import type { SettledUniverse, UniverseRow } from '@/lib/search/engine/universe';
import type { SearchCriteria } from '@/lib/search/engine/criteria';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/search/engine/provider-client', () => ({ queryProvider: jest.fn(), walkProvider: jest.fn() }));

const row = (i: number, ts: string | null): UniverseRow => ({
  source: i % 7 === 0 ? 'mallan' : 'provider', listingKey: i % 7 === 0 ? null : `K${i}`, listingId: i % 7 === 0 ? `SL-${i}` : `ID${i}`,
  price: 1_000_000 - i * 1000, contractDate: null, modificationTimestamp: ts,
});
const universe = (rows: UniverseRow[]): SettledUniverse => ({
  rows, total: rows.length, countMeaning: 'exact', providerCount: rows.length, providerRows: rows.length, providerPages: 1,
  mallanRows: 0, mallanExcludedUnresolvedType: 0, suppressedOfficeIds: [], filter: '', orderby: '',
});

test('rows after `since` are found deep in the universe, not only on the first page, in universe order', () => {
  const since = new Date('2026-09-04T00:00:00Z');
  const rows: UniverseRow[] = [];
  for (let i = 0; i < 300; i++) rows.push(row(i, i % 25 === 0 ? '2026-09-05T01:00:00Z' : '2026-09-01T00:00:00Z'));
  const d = rowsModifiedSince(universe(rows), since);
  expect(d.rows.map((r) => r.listingId)).toEqual([0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275].map((i) => (i % 7 === 0 ? `SL-${i}` : `ID${i}`)));
  expect(d.rows.length).toBe(12);
  expect(d.unknownTimestamp).toBe(0);
  // a delivery cap is applied AFTER the delta, and keeps universe order
  expect(d.rows.slice(0, 10).map((r) => r.listingId)[9]).toBe('ID225');
});

test('a row with no modification time cannot prove it is new: excluded and counted, never guessed', () => {
  const d = rowsModifiedSince(universe([row(1, null), row(2, 'not a date'), row(3, '2026-09-05T00:00:00Z')]), new Date('2026-09-04T00:00:00Z'));
  expect(d.rows.map((r) => r.listingId)).toEqual(['ID3']);
  expect(d.unknownTimestamp).toBe(2);
});

test('the universe cache key ignores paging, so every page and every consumer share one universe', () => {
  const base: SearchCriteria = { workflow: 'sale', standardStatus: ['Active'], cityRegion: ['Manhattan'], subdivisionName: [], commonInterest: [], structureType: [], postalCode: [], listingId: [], sort: 'price_desc', limit: 50, offset: 0 };
  expect(universeKeyOf(base)).toBe(universeKeyOf({ ...base, limit: 10, offset: 200 }));
  expect(universeKeyOf(base)).not.toBe(universeKeyOf({ ...base, cityRegion: ['Brooklyn'] }));
});
