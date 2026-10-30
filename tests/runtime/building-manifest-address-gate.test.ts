/// <reference types="jest" />
/**
 * The building manifest lists a unit under the building's street address with its unit number. A listing whose seller switched address
 * display off (internet_address_display_yn = false) must therefore never appear in it. Compliance review 2026-10-30 (gap G2): the manifest
 * applied four gates and the Mallan return-copy exclusion but not this one.
 *
 * The real `where` the manifest sends to the database is captured and EVALUATED over sample rows (not matched as text).
 */
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>) => (...args: unknown[]) => fn(...args),
  revalidateTag: jest.fn(),
}));
const findMany = jest.fn();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { listing: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { getBuildingManifestShard } from '@/lib/buildings/public-building-data';

type Row = Record<string, unknown>;
// Equality, null, notIn, startsWith, OR/AND, and the JSON-path string_starts_with the manifest uses on `address`.
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
    if (key === 'AND') return (cond as Row[]).every((w) => matches(row, w));
    const v = row[key];
    if (cond === null) return v === null || v === undefined;
    if (typeof cond !== 'object') return v === cond;
    const c = cond as Row;
    if ('path' in c) {
      const pathKey = (c.path as string[])[0];
      const leaf = (v as Row | undefined)?.[pathKey];
      return typeof leaf === 'string' && leaf.startsWith(c.string_starts_with as string);
    }
    return Object.entries(c).every(([op, arg]) => {
      if (op === 'notIn') return v !== null && v !== undefined && !(arg as unknown[]).includes(v);
      if (op === 'startsWith') return typeof v === 'string' && v.startsWith(arg as string);
      throw new Error(`operator not modelled: ${op}`);
    });
  });
}

const GOOD: Row = {
  listing_id: 'RLS20084568', idx_display_yn: true, owner_opt_out: false, internet_entire_listing_display_yn: true,
  internet_address_display_yn: true, participant_only: false, list_office_mls_id: '4321',
  address: { StreetNumber: '434', StreetName: '20th', PostalCode: '10011', UnitNumber: '7' },
};

async function capturedWhere(): Promise<Record<string, unknown>> {
  findMany.mockReset().mockResolvedValue([]);
  await getBuildingManifestShard('4');
  return findMany.mock.calls[0][0].where as Record<string, unknown>;
}

describe('building manifest: which listings may appear as units under a building address', () => {
  it('admits a fully displayable listing in the shard', async () => {
    expect(matches(GOOD, await capturedWhere())).toBe(true);
  });

  it('REGRESSION (review gap G2): does not admit a listing whose address display is switched off', async () => {
    expect(matches({ ...GOOD, internet_address_display_yn: false }, await capturedWhere())).toBe(false);
  });

  it.each([
    ['idx_display_yn off', { idx_display_yn: false }],
    ['entire-listing display off', { internet_entire_listing_display_yn: false }],
    ['owner opt-out', { owner_opt_out: true }],
    ['participant-only', { participant_only: true }],
    ["Mallan's own listing returned through Cotality", { list_office_mls_id: '7041' }],
    ['a street number in another shard', { address: { StreetNumber: '934', StreetName: '20th' } }],
  ])('still does not admit a listing with %s', async (_n, over) => {
    expect(matches({ ...GOOD, ...over }, await capturedWhere())).toBe(false);
  });

  it('still admits a Mallan-authored local row (the return-copy exclusion keeps SL-/RL- rows)', async () => {
    expect(matches({ ...GOOD, listing_id: 'SL-0100', list_office_mls_id: null }, await capturedWhere())).toBe(true);
  });
});
