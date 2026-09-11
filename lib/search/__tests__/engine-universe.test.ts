/// <reference types="jest" />
/**
 * Universe merge, order and paging — pure parts only. Provider and storage
 * reads are exercised by the Runtime/Integration Validator, not mocked here.
 */
import { comparatorFor, pageOf, type UniverseRow, type SettledUniverse } from '@/lib/search/engine/universe';

const row = (o: Partial<UniverseRow> & { listingId: string }): UniverseRow => ({ source: 'provider', listingKey: null, price: null, contractDate: null, ...o });

describe('one comparator for both sources', () => {
  test('price desc, nulls last, identity tie-break ascending', () => {
    const rows = [
      row({ listingId: 'RLS3', listingKey: '3', price: 500 }),
      row({ listingId: 'SL-0004', source: 'mallan', price: 765000 }),
      row({ listingId: 'RLS1', listingKey: '1', price: 765000 }),
      row({ listingId: 'RLS9', listingKey: '9', price: null }),
    ];
    expect([...rows].sort(comparatorFor('price_desc')).map((r) => r.listingId)).toEqual(['RLS1', 'SL-0004', 'RLS3', 'RLS9']);
  });
  test('newest uses contract date desc, then identity', () => {
    const rows = [
      row({ listingId: 'A', listingKey: 'A', contractDate: '2026-01-01' }),
      row({ listingId: 'B', listingKey: 'B', contractDate: '2026-06-01' }),
      row({ listingId: 'SL-0007', source: 'mallan', contractDate: '2026-06-01' }),
      row({ listingId: 'C', listingKey: 'C', contractDate: null }),
    ];
    expect([...rows].sort(comparatorFor('newest')).map((r) => r.listingId)).toEqual(['B', 'SL-0007', 'A', 'C']);
  });
  test('the order is total: sorting a shuffled copy reproduces it', () => {
    const rows = Array.from({ length: 50 }, (_, i) => row({ listingId: `K${(i * 7) % 50}`, listingKey: `${(i * 7) % 50}`, price: (i % 5) * 1000 }));
    const a = [...rows].sort(comparatorFor('price_asc')).map((r) => r.listingId);
    const b = [...rows].reverse().sort(comparatorFor('price_asc')).map((r) => r.listingId);
    expect(b).toEqual(a);
  });
});

describe('paging over the settled universe', () => {
  const u: SettledUniverse = {
    rows: Array.from({ length: 7 }, (_, i) => row({ listingId: `L${i}`, listingKey: `${i}`, price: 7 - i })),
    total: 7, countMeaning: 'exact', providerCount: 7, providerRows: 7, providerPages: 1, mallanRows: 0,
    mallanExcludedUnresolvedType: 0, suppressedOfficeIds: ['7041'], filter: '', orderby: '',
  };
  test('pages partition the universe with no overlap and no gap', () => {
    const ids = [...pageOf(u, 0, 3), ...pageOf(u, 3, 3), ...pageOf(u, 6, 3)].map((r) => r.listingId);
    expect(ids).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']);
    expect(new Set(ids).size).toBe(7);
  });
  test('an offset past the end is empty, not a fallback set', () => {
    expect(pageOf(u, 999, 50)).toEqual([]);
  });
});
