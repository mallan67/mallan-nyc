/// <reference types="jest" />
/**
 * AttendanceType backfill (scripts/backfill-attendance-type.ts): writes ONE key, `features.AttendanceType`, and nothing else.
 *
 * Maya, 2026-11-22: "the doorman should be searchable, update the field only", and for SL-0010 / SL-0004 "correct the field".
 *
 * The contract:
 *   1. planRow decides each stored listing: set / clear / unchanged / unknown / no-key for a Cotality listing, rename / unchanged for a Mallan one.
 *   2. The only key that can differ between the stored features and the written features is AttendanceType.
 *   3. A lookup that did not answer is UNKNOWN: what is stored is kept, never cleared.
 *   4. Cotality is the authority for a feed row: its value is stored verbatim (even a spelling RLS has not renamed yet); only a Mallan-authored row is renamed.
 *   5. DRY RUN is the default and writes nothing; a write needs the token, the production declaration and the canonical database.
 *   6. A write is a compare-and-set on the features that were read, in one transaction with the projection rewrite; a changed row is skipped.
 *   7. The run is bounded (--total), keyset-resumable (last_id / afterId), and one failing row does not stop the rest.
 *   8. (compliance gate on #704, 2026-11-22) A Mallan-authored listing stores AttendanceType as an ARRAY (the CRM forms) and keeps a copy in raw_data,
 *      which the CRM reads first: both are renamed, each in the shape it is stored in. updated_at is written back unchanged.
 *   9. "converged" is true only after a whole walk with nothing to set, clear, rename, unknown, no-key, failed or concurrent: set, clear and rename
 *      being 0 is also true when Cotality did not answer.
 *  10. The public cache cannot be invalidated from a command line: the report says "failed", it never says done, and it names the listings.
 *  11. The filter stays off, and the canonical-database guard is the default guard.
 */

const mockListingFindMany = jest.fn();
const mockUpdateMany = jest.fn();
const mockTransaction = jest.fn();
const mockDualWrite = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { listing: { findMany: (...a: unknown[]) => mockListingFindMany(...a) }, $transaction: (...a: unknown[]) => mockTransaction(...a), $disconnect: jest.fn() },
}));
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: (...a: unknown[]) => mockDualWrite(...a),
}));

import {
  BACKFILL_CONFIRM_TOKEN,
  BACKFILL_ENV_VAR,
  assertWriteAuthorized,
  holdsRetiredMember,
  parseArgs,
  parseTotal,
  planRow,
  renameRetiredMembers,
  renameStoredValue,
  runBackfill,
  storedAttendance,
  type BackfillDeps,
  type BackfillRow,
} from '../../scripts/backfill-attendance-type';
import type { AttendanceJoin } from '@/lib/idx/custom-property-join';
import { SEARCH_CACHE_TAG } from '@/lib/cache/public-cache';
import { STORED_LISTINGS_CARRY_ATTENDANCE_TYPE } from '@/lib/search/types';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CANONICAL_ENV = { DATABASE_URL: 'postgresql://u:p@ep-cold-waterfall-adno3ao2-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require', DATABASE_URL_UNPOOLED: 'postgresql://u:p@ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require' };
const STALE_ENV = { DATABASE_URL: 'postgresql://u:p@ep-royal-dawn-ad6eh8t2-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require' };
const WRITE_ENV = { ...CANONICAL_ENV, [BACKFILL_ENV_VAR]: 'production' };

const join = (entries: Record<string, string | null>, unknownKeys: string[] = []): AttendanceJoin => ({ byKey: new Map(Object.entries(entries)), unknown: new Set(unknownKeys), requests: 1 });
let nextId = 0;
const STAMP = new Date('2026-11-01T12:00:00.000Z');
const feed = (key: string, features: Record<string, unknown> = {}, extra: Partial<BackfillRow> = {}): BackfillRow => ({ id: BigInt(++nextId), listing_id: `RLS${key}`, mls_id: key, status: 'Active', features, raw_data: null, address: { StreetName: 'Park' }, updated_at: STAMP, ...extra });
const mallan = (listingId: string, features: Record<string, unknown> = {}, rawData: unknown = null): BackfillRow => ({ id: BigInt(++nextId), listing_id: listingId, mls_id: null, status: 'Active', features, raw_data: rawData, address: {}, updated_at: STAMP });

describe('planRow: a Cotality listing', () => {
  it('stores the value Cotality carries when the stored one differs, or is missing', () => {
    const p = planRow(feed('1'), join({ '1': 'DoorpersonFullTime,LobbyAttendantFullTime' }));
    expect(p.action).toBe('set');
    expect(p.to).toBe('DoorpersonFullTime,LobbyAttendantFullTime');
    expect(p.from).toBeUndefined();
    expect(planRow(feed('2', { AttendanceType: 'ConciergeYes' }), join({ '2': 'DoorpersonYes' })).action).toBe('set');
  });

  it('leaves a listing alone when the stored value already equals Cotality', () => {
    const p = planRow(feed('1', { AttendanceType: 'DoorpersonYes' }), join({ '1': 'DoorpersonYes' }));
    expect(p.action).toBe('unchanged');
    expect(p.nextFeatures).toBeNull();
  });

  it('clears a stored value only when a lookup that ANSWERED found no AttendanceType', () => {
    const p = planRow(feed('1', { AttendanceType: 'DoorpersonYes' }), join({ '1': null }));
    expect(p.action).toBe('clear');
    expect(p.to).toBeUndefined();
    expect(p.nextFeatures).not.toHaveProperty('AttendanceType');
    expect(planRow(feed('2'), join({ '2': null })).action).toBe('unchanged'); // nothing stored, nothing carried
  });

  it('a lookup that did not answer is UNKNOWN: what is stored is kept, never cleared', () => {
    const stored = feed('1', { AttendanceType: 'DoorpersonFullTime' });
    for (const lookup of [join({}, ['1']), join({})]) {
      const p = planRow(stored, lookup);
      expect(p.action).toBe('unknown');
      expect(p.nextFeatures).toBeNull();
      expect(p.to).toBe('DoorpersonFullTime');
    }
  });

  it('a listing with no ListingKey has nothing to look up', () => {
    expect(planRow(feed('1', { AttendanceType: 'DoorpersonYes' }, { mls_id: null }), join({})).action).toBe('no-key');
    expect(planRow(feed('1', {}, { mls_id: '   ' }), join({})).action).toBe('no-key');
  });

  it('stores the spelling Cotality serves even when RLS has not renamed it yet (the provider is the authority)', () => {
    const retired = 'Doorman' + 'FullTime';
    const p = planRow(feed('1'), join({ '1': retired }));
    expect(p.action).toBe('set');
    expect(p.to).toBe(retired);
    expect(holdsRetiredMember(p.to)).toBe(true);
  });

  it('changes ONLY AttendanceType: every other key of the features is carried unchanged', () => {
    const features = { Amenities: ['Gym'], PetsAllowed: 'Yes', Nested: { a: 1 }, AttendanceType: 'ConciergeYes' };
    const p = planRow(feed('1', features), join({ '1': 'DoorpersonFullTime' }));
    const { AttendanceType: _before, ...restBefore } = features;
    const { AttendanceType: after, ...restAfter } = p.nextFeatures as Record<string, unknown>;
    expect(restAfter).toEqual(restBefore);
    expect(after).toBe('DoorpersonFullTime');
  });
});

describe('planRow: a Mallan-authored listing', () => {
  const OLD = (m: string) => 'Doorman' + m; // the retired spelling, built so no served file carries it

  it('renames a retired member to its live member, one for one, and leaves the rest of the list alone (SL-0010)', () => {
    const p = planRow(mallan('SL-0010', { AttendanceType: `${OLD('FullTime')},LobbyAttendantFullTime`, Floor: 8 }), join({}));
    expect(p.action).toBe('rename');
    expect(p.to).toBe('DoorpersonFullTime,LobbyAttendantFullTime');
    expect(p.nextFeatures).toEqual({ AttendanceType: 'DoorpersonFullTime,LobbyAttendantFullTime', Floor: 8 });
    expect(planRow(mallan('SL-0004', { AttendanceType: OLD('FullTime') }), join({})).to).toBe('DoorpersonFullTime');
    expect(planRow(mallan('RL-0001', { AttendanceType: 'Video' + OLD('Yes') }), join({})).to).toBe('VideoDoorpersonYes');
  });

  it('does not look anything up, and leaves a row alone that holds no retired member or no value', () => {
    expect(planRow(mallan('SL-0020', { AttendanceType: 'DoorpersonYes,ConciergePartTime' }), join({})).action).toBe('unchanged');
    expect(planRow(mallan('SL-0021', {}), join({})).action).toBe('unchanged');
    expect(planRow(mallan('RL-0022', { AttendanceType: 'None' }), join({})).action).toBe('unchanged');
  });

  it('renames an ARRAY (what the CRM forms save) and keeps it an array: SL-0010 as the Sale form stores it', () => {
    const p = planRow(mallan('SL-0010', { AttendanceType: [OLD('FullTime'), 'LobbyAttendantFullTime'] }), join({}));
    expect(p.action).toBe('rename');
    expect(p.nextFeatures).toEqual({ AttendanceType: ['DoorpersonFullTime', 'LobbyAttendantFullTime'] });
    expect(p.to).toBe('DoorpersonFullTime,LobbyAttendantFullTime');
    expect(planRow(mallan('SL-0004', { AttendanceType: [OLD('FullTime')] }), join({})).nextFeatures).toEqual({ AttendanceType: ['DoorpersonFullTime'] });
  });

  it('renames the copy in raw_data too (the CRM reads it BEFORE features), in its own shape, and changes no other key of either', () => {
    const p = planRow(mallan('SL-0010', { AttendanceType: OLD('FullTime'), Floor: 8 }, { AttendanceType: [OLD('FullTime')], Address: { Street: 'Second Avenue' } }), join({}));
    expect(p.action).toBe('rename');
    expect(p.nextFeatures).toEqual({ AttendanceType: 'DoorpersonFullTime', Floor: 8 });
    expect(p.nextRawData).toEqual({ AttendanceType: ['DoorpersonFullTime'], Address: { Street: 'Second Avenue' } });
  });

  it('renames only the copy that holds a retired member: a features copy that is live is left alone, and the other way round', () => {
    const rawOnly = planRow(mallan('SL-0010', { AttendanceType: 'DoorpersonFullTime' }, { AttendanceType: [OLD('FullTime')] }), join({}));
    expect(rawOnly.action).toBe('rename');
    expect(rawOnly.nextFeatures).toBeNull();
    expect(rawOnly.nextRawData).toEqual({ AttendanceType: ['DoorpersonFullTime'] });
    const featuresOnly = planRow(mallan('SL-0004', { AttendanceType: OLD('FullTime') }, { AttendanceType: ['DoorpersonFullTime'] }), join({}));
    expect(featuresOnly.nextRawData).toBeNull();
    expect(featuresOnly.nextFeatures).toEqual({ AttendanceType: 'DoorpersonFullTime' });
    expect(planRow(mallan('SL-0005', { AttendanceType: ['DoorpersonYes'] }, { AttendanceType: ['DoorpersonYes'] }), join({})).action).toBe('unchanged');
  });

  it('a Cotality listing never gets a raw_data write, and a value it cannot read (not a text, not an array of texts) is left alone', () => {
    expect(planRow(feed('1', {}, { raw_data: { AttendanceType: [OLD('Yes')] } }), join({ '1': 'DoorpersonYes' })).nextRawData).toBeNull();
    for (const odd of [42, true, { a: 1 }, [1, 2], []]) expect(planRow(mallan('SL-0040', { AttendanceType: odd as unknown }), join({})).action).toBe('unchanged');
  });

  it('never takes a Cotality value for a Mallan-authored listing, even when the lookup has the key', () => {
    const row = { ...mallan('SL-0030', { AttendanceType: 'ConciergeYes' }), mls_id: '999' };
    expect(planRow(row, join({ '999': 'DoorpersonFullTime' })).action).toBe('unchanged');
  });
});

describe('renameRetiredMembers / holdsRetiredMember', () => {
  it('maps every retired member without case, keeps the order and the other members', () => {
    const OLD = (m: string) => 'Doorman' + m;
    expect(renameRetiredMembers(`ConciergeYes, ${OLD('PartTime').toLowerCase()} ,${OLD('Yes')},${'Video' + OLD('FullTime')}`)).toBe('ConciergeYes,DoorpersonPartTime,DoorpersonYes,VideoDoorpersonFullTime');
    expect(renameRetiredMembers('None')).toBe('None');
    expect(renameRetiredMembers('')).toBe('');
  });

  it('holdsRetiredMember sees a retired member in a list and nothing else', () => {
    expect(holdsRetiredMember('ConciergeYes,' + 'Doorman' + 'Yes')).toBe(true);
    expect(holdsRetiredMember('DoorpersonYes,VideoDoorpersonFullTime')).toBe(false);
    expect(holdsRetiredMember(undefined)).toBe(false);
  });
});

describe('renameStoredValue / storedAttendance', () => {
  it('keeps the shape, renames only retired members, and says nothing when there is nothing to rename', () => {
    const OLD = (m: string) => 'Doorman' + m;
    expect(renameStoredValue(OLD('Yes'))).toBe('DoorpersonYes');
    expect(renameStoredValue([OLD('PartTime'), 'ConciergeYes'])).toEqual(['DoorpersonPartTime', 'ConciergeYes']);
    expect(renameStoredValue('DoorpersonYes')).toBeUndefined();
    expect(renameStoredValue(['None'])).toBeUndefined();
    expect(renameStoredValue(null)).toBeUndefined();
    expect(renameStoredValue(7)).toBeUndefined();
  });

  it('reads a comma text and an array of texts the same way, and nothing else', () => {
    expect(storedAttendance({ AttendanceType: 'A,B' })).toBe('A,B');
    expect(storedAttendance({ AttendanceType: ['A', 'B'] })).toBe('A,B');
    expect(storedAttendance({ AttendanceType: '   ' })).toBeUndefined();
    expect(storedAttendance({ AttendanceType: [1] })).toBeUndefined();
    expect(storedAttendance(null)).toBeUndefined();
  });
});

describe('guards', () => {
  it('a write needs the token and the production declaration', () => {
    expect(() => assertWriteAuthorized({ confirm: undefined }, WRITE_ENV)).toThrow(/--confirm/);
    expect(() => assertWriteAuthorized({ confirm: 'nope' }, WRITE_ENV)).toThrow(/--confirm/);
    expect(() => assertWriteAuthorized({ confirm: BACKFILL_CONFIRM_TOKEN }, CANONICAL_ENV)).toThrow(new RegExp(BACKFILL_ENV_VAR));
    expect(() => assertWriteAuthorized({ confirm: BACKFILL_CONFIRM_TOKEN }, WRITE_ENV)).not.toThrow();
  });

  it('--total is required and must be a positive whole number: there is no unbounded mode', () => {
    for (const bad of [undefined, '', '0', '-5', 'all', 'Infinity', '1.5', '10abc']) expect(() => parseTotal(bad)).toThrow(/--total/);
    expect(parseTotal('500')).toBe(500);
    expect(() => parseArgs(['--execute'])).toThrow(/--total/);
    expect(parseArgs(['--total=40', '--after-id=7', '--batch=10', '--execute', '--confirm=x'])).toEqual({ execute: true, confirm: 'x', total: 40, batchSize: 10, afterId: BigInt(7) });
    expect(() => parseArgs(['--total=5', '--after-id=abc'])).toThrow(/after-id/);
  });
});

describe('runBackfill', () => {
  let txUpdateMany: jest.Mock;
  const baseDeps = (over: Partial<BackfillDeps> = {}): BackfillDeps => ({
    prisma: { listing: { findMany: mockListingFindMany }, $transaction: mockTransaction } as unknown as BackfillDeps['prisma'],
    fetchJoin: async (keys) => join(Object.fromEntries(keys.map((k) => [k, k === '2' ? null : 'DoorpersonFullTime']))),
    revalidate: jest.fn(),
    assertTarget: () => undefined,
    ...over,
  });
  const run = (o: Partial<Parameters<typeof runBackfill>[0]> = {}, env = CANONICAL_ENV, deps = baseDeps()) => runBackfill({ execute: false, total: 100, batchSize: 100, ...o }, env, deps);

  beforeEach(() => {
    jest.clearAllMocks();
    nextId = 0;
    txUpdateMany = mockUpdateMany;
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ listing: { updateMany: txUpdateMany } }));
  });

  it('a DRY RUN reads, plans and counts, and performs ZERO writes, projection rewrites or cache invalidation', async () => {
    mockListingFindMany.mockResolvedValueOnce([feed('1'), feed('2', { AttendanceType: 'ConciergeYes' }), feed('3', { AttendanceType: 'DoorpersonFullTime' }), mallan('SL-0010', { AttendanceType: 'Doorman' + 'FullTime' })]);
    const deps = baseDeps();
    const report = await run({}, CANONICAL_ENV, deps);
    expect(report.mode).toBe('dry-run');
    expect(report.totals).toMatchObject({ scanned: 4, feed_rows: 3, mallan_rows: 1, set: 1, clear: 1, unchanged: 1, rename: 1, failed: 0 });
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
    expect(mockDualWrite).not.toHaveBeenCalled();
    expect(deps.revalidate).not.toHaveBeenCalled();
  });

  it('EXECUTE without the token or the production declaration refuses before reading anything', async () => {
    await expect(run({ execute: true }, WRITE_ENV)).rejects.toThrow(/--confirm/);
    await expect(run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN }, CANONICAL_ENV)).rejects.toThrow(new RegExp(BACKFILL_ENV_VAR));
    expect(mockListingFindMany).not.toHaveBeenCalled();
  });

  it('a database that is not the canonical production endpoint refuses, dry run included, before reading anything', async () => {
    const { assertCanonicalTarget } = jest.requireActual('../../scripts/recover-stale-property-listings');
    const deps = baseDeps({ assertTarget: assertCanonicalTarget });
    await expect(runBackfill({ execute: false, total: 5, batchSize: 5 }, STALE_ENV, deps)).rejects.toThrow(/canonical/i);
    await expect(runBackfill({ execute: false, total: 5, batchSize: 5 }, {}, deps)).rejects.toThrow(/cannot be determined/i);
    mockListingFindMany.mockResolvedValueOnce([]);
    await expect(runBackfill({ execute: false, total: 5, batchSize: 5 }, CANONICAL_ENV, deps)).resolves.toMatchObject({ mode: 'dry-run', exhausted: true });
    expect(mockListingFindMany).toHaveBeenCalledTimes(1);
  });

  it('EXECUTE writes only the planned rows: a compare-and-set on the features that were read, with the projection rewrite in the same transaction', async () => {
    const r1 = feed('1', { Keep: 'me' });
    const r3 = feed('3', { AttendanceType: 'DoorpersonFullTime' });
    mockListingFindMany.mockResolvedValueOnce([r1, r3]);
    const deps = baseDeps();
    const report = await run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN }, WRITE_ENV, deps);
    expect(report.totals).toMatchObject({ scanned: 2, set: 1, unchanged: 1, failed: 0, concurrent: 0 });
    expect(mockTransaction).toHaveBeenCalledTimes(1); // the unchanged row is not written
    expect(mockUpdateMany).toHaveBeenCalledWith({ where: { id: r1.id, features: { equals: { Keep: 'me' } } }, data: { features: { Keep: 'me', AttendanceType: 'DoorpersonFullTime' }, updated_at: STAMP } });
    expect(mockDualWrite).toHaveBeenCalledWith(expect.anything(), r1.listing_id);
    expect(deps.revalidate).toHaveBeenCalledTimes(1);
    const tags = (deps.revalidate as jest.Mock).mock.calls[0][0] as Set<string>;
    expect(tags.has(SEARCH_CACHE_TAG)).toBe(true);
  });

  it('a row the sync changed after it was read is skipped, not overwritten: no projection rewrite, no cache tag for it', async () => {
    mockListingFindMany.mockResolvedValueOnce([feed('1')]);
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    const deps = baseDeps();
    const report = await run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN }, WRITE_ENV, deps);
    expect(report.totals).toMatchObject({ concurrent: 1, set: 0, failed: 0 });
    expect(mockDualWrite).not.toHaveBeenCalled();
    expect(deps.revalidate).not.toHaveBeenCalled();
  });

  it('one failing row is counted and the rest are still written', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockListingFindMany.mockResolvedValueOnce([feed('1'), feed('4'), feed('5')]);
    mockTransaction.mockImplementationOnce(async () => { throw new Error('boom'); }).mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ listing: { updateMany: txUpdateMany } }));
    const report = await run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN }, WRITE_ENV);
    expect(report.totals).toMatchObject({ scanned: 3, failed: 1, set: 2 });
    errors.mockRestore();
  });

  it('an unknown lookup keeps what is stored: nothing is written for it, in a dry run or an execute', async () => {
    const rows = () => [feed('9', { AttendanceType: 'DoorpersonYes' })];
    const noAnswer = baseDeps({ fetchJoin: async () => join({}, ['9']) });
    mockListingFindMany.mockResolvedValueOnce(rows());
    expect((await run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN }, WRITE_ENV, noAnswer)).totals).toMatchObject({ unknown: 1, clear: 0, set: 0 });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('is bounded by --total, keyset-resumable, and reports where it stopped', async () => {
    const page1 = [feed('1'), feed('2'), feed('3')];
    mockListingFindMany.mockResolvedValueOnce(page1);
    const first = await run({ total: 3, batchSize: 3 });
    expect(first.totals.scanned).toBe(3);
    expect(first.last_id).toBe(page1[2].id.toString());
    expect(first.exhausted).toBe(false);
    expect(mockListingFindMany).toHaveBeenCalledTimes(1);
    expect(mockListingFindMany.mock.calls[0][0]).toMatchObject({ where: { id: { gt: BigInt(0) } }, orderBy: { id: 'asc' }, take: 3 });

    mockListingFindMany.mockResolvedValueOnce([feed('7')]);
    const second = await run({ total: 3, batchSize: 3, afterId: BigInt(first.last_id as string) });
    expect(mockListingFindMany.mock.calls[1][0]).toMatchObject({ where: { id: { gt: page1[2].id } } });
    expect(second.exhausted).toBe(true); // fewer rows than asked for: the end
  });

  it('walks the listings in batches by keyset: each batch starts after the last id of the one before', async () => {
    const a = [feed('1'), feed('2')];
    const b = [feed('3'), feed('4')];
    mockListingFindMany.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    const report = await run({ total: 4, batchSize: 2 });
    expect(report.batches).toBe(2);
    expect(report.totals.scanned).toBe(4);
    expect(mockListingFindMany.mock.calls[0][0].where.id).toEqual({ gt: BigInt(0) });
    expect(mockListingFindMany.mock.calls[1][0].where.id).toEqual({ gt: a[1].id });
    expect(report.last_id).toBe(b[1].id.toString());
  });

  it('EXECUTE on a Mallan-authored listing: a compare-and-set on features AND raw_data, both renamed, updated_at written back as it was', async () => {
    const OLD = (m: string) => 'Doorman' + m;
    const features = { AttendanceType: [OLD('FullTime'), 'LobbyAttendantFullTime'], Floor: 8 };
    const raw = { AttendanceType: [OLD('FullTime'), 'LobbyAttendantFullTime'], Floor: '8' };
    const row = mallan('SL-0010', features, raw);
    mockListingFindMany.mockResolvedValueOnce([row]);
    const report = await run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN }, WRITE_ENV);
    expect(report.totals).toMatchObject({ rename: 1, failed: 0, concurrent: 0 });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: row.id, features: { equals: features }, raw_data: { equals: raw } },
      data: {
        features: { AttendanceType: ['DoorpersonFullTime', 'LobbyAttendantFullTime'], Floor: 8 },
        raw_data: { AttendanceType: ['DoorpersonFullTime', 'LobbyAttendantFullTime'], Floor: '8' },
        updated_at: STAMP,
      },
    });
    expect(report.changed_listing_ids).toEqual(['SL-0010']);
  });

  it('a Mallan-authored listing whose raw_data is empty writes features only: raw_data is neither compared nor written', async () => {
    const row = mallan('SL-0004', { AttendanceType: 'Doorman' + 'FullTime' }, null);
    mockListingFindMany.mockResolvedValueOnce([row]);
    await run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN }, WRITE_ENV);
    const call = mockUpdateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: row.id, features: { equals: row.features } });
    expect(call.data).toEqual({ features: { AttendanceType: 'DoorpersonFullTime' }, updated_at: STAMP });
  });

  it('reads only the statuses the public site shows (Active, ComingSoon, ActiveUnderContract), never a pending or closed listing', async () => {
    mockListingFindMany.mockResolvedValueOnce([]);
    await run();
    expect(mockListingFindMany.mock.calls[0][0].where.status.in).toEqual(['Active', 'ComingSoon', 'ActiveUnderContract']);
    expect(mockListingFindMany.mock.calls[0][0].select).toMatchObject({ raw_data: true, updated_at: true });
  });

  it('converged is true ONLY after a whole walk with nothing to do: not after a partial walk, a resumed one, or one where Cotality did not answer', async () => {
    const settled = () => [feed('3', { AttendanceType: 'DoorpersonFullTime' }), mallan('SL-0020', { AttendanceType: 'DoorpersonYes' })];
    const allSame = baseDeps({ fetchJoin: async () => join({ '3': 'DoorpersonFullTime' }) });
    mockListingFindMany.mockResolvedValueOnce(settled());
    const done = await run({ total: 10, batchSize: 10 }, CANONICAL_ENV, allSame);
    expect(done).toMatchObject({ exhausted: true, from_start: true, converged: true });

    mockListingFindMany.mockResolvedValueOnce(settled());
    expect((await run({ total: 10, batchSize: 10, afterId: BigInt(5) }, CANONICAL_ENV, allSame)).converged).toBe(false); // resumed: not the whole walk

    mockListingFindMany.mockResolvedValueOnce(settled());
    expect((await run({ total: 2, batchSize: 2 }, CANONICAL_ENV, allSame)).converged).toBe(false); // stopped by --total, not at the end

    mockListingFindMany.mockResolvedValueOnce([feed('3', { AttendanceType: 'DoorpersonFullTime' })]);
    const cotalityDown = baseDeps({ fetchJoin: async () => join({}, ['3']) });
    const down = await run({ total: 10, batchSize: 10 }, CANONICAL_ENV, cotalityDown);
    expect(down.totals).toMatchObject({ set: 0, clear: 0, rename: 0, unknown: 1 });
    expect(down.converged).toBe(false); // set, clear and rename are all 0, and it is NOT done

    mockListingFindMany.mockResolvedValueOnce([feed('9')]);
    const work = await run({ total: 10, batchSize: 10 }, CANONICAL_ENV, baseDeps());
    expect(work.totals.set).toBe(1);
    expect(work.converged).toBe(false);
  });

  it('the public cache cannot be invalidated from a command line: the report says failed, never done, names the listings, and a dry run attempts nothing', async () => {
    const failing = baseDeps({ revalidate: jest.fn((_tags: Set<string>, counters: { revalidation_failures: number }) => { counters.revalidation_failures += 3; }) });
    mockListingFindMany.mockResolvedValueOnce([feed('1'), feed('4')]);
    const executed = await run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN }, WRITE_ENV, failing);
    expect(executed.cache_invalidation).toBe('failed');
    expect(executed.revalidation_failures).toBe(3);
    expect(executed.cache_tags_attempted).toBeGreaterThan(0);
    expect(executed.changed_listing_count).toBe(2);
    expect(executed.changed_listing_ids).toHaveLength(2);

    const working = baseDeps({ revalidate: jest.fn() });
    mockListingFindMany.mockResolvedValueOnce([feed('1')]);
    expect((await run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN }, WRITE_ENV, working)).cache_invalidation).toBe('ok');

    mockListingFindMany.mockResolvedValueOnce([feed('1')]);
    const dry = await run({}, CANONICAL_ENV, working);
    expect(dry.cache_invalidation).toBe('not-attempted');
    expect(dry.cache_tags_attempted).toBe(0);
    expect(dry.changed_listing_ids).toHaveLength(1); // what it WOULD change
  });

  it('invalidates the tags of each batch, once per batch, not the whole cumulative set again', async () => {
    const revalidate = jest.fn();
    mockListingFindMany.mockResolvedValueOnce([feed('1'), feed('4')]).mockResolvedValueOnce([feed('5'), feed('6')]);
    await run({ execute: true, confirm: BACKFILL_CONFIRM_TOKEN, total: 4, batchSize: 2 }, WRITE_ENV, baseDeps({ revalidate }));
    expect(revalidate).toHaveBeenCalledTimes(2);
    const first = revalidate.mock.calls[0][0] as Set<string>;
    const second = revalidate.mock.calls[1][0] as Set<string>;
    expect([...second].some((tag) => first.has(tag) && tag !== SEARCH_CACHE_TAG)).toBe(false);
  });

  it('reports the coverage after the run: feed rows carrying a value, and those still on a spelling RLS has not renamed', async () => {
    mockListingFindMany.mockResolvedValueOnce([feed('1'), feed('2', { AttendanceType: 'ConciergeYes' }), feed('6')]);
    const report = await run({}, CANONICAL_ENV, baseDeps({ fetchJoin: async () => join({ '1': 'DoorpersonFullTime', '2': null, '6': 'Doorman' + 'Yes' }) }));
    expect(report.feed_rows_carrying_value).toBe(2);
    expect(report.feed_rows_with_retired_member).toBe(1);
  });

  it('the DEFAULT target guard is the canonical-database guard (a no-op there would pass every other test)', () => {
    const source = readFileSync(resolve(__dirname, '../../scripts/backfill-attendance-type.ts'), 'utf8');
    expect(source).toMatch(/assertTarget: assertCanonicalTarget,/);
    expect(source).toMatch(/import \{ assertCanonicalTarget, PRODUCTION_ENV_VALUE, type RecoveryEnv \} from "\.\/recover-stale-property-listings";/);
    expect(source).toMatch(/deps\.assertTarget\(env\);\n  if \(options\.execute\) assertWriteAuthorized/);
  });

  it('the public Doorman filter stays OFF until the coverage check (converged) has passed: this PR does not switch it on', () => {
    expect(STORED_LISTINGS_CARRY_ATTENDANCE_TYPE).toBe(false);
  });

  it('makes no Cotality request when a batch holds only Mallan-authored listings', async () => {
    const fetchJoin = jest.fn(async () => join({}));
    mockListingFindMany.mockResolvedValueOnce([mallan('SL-0010', { AttendanceType: 'Doorman' + 'FullTime' })]);
    await run({}, CANONICAL_ENV, baseDeps({ fetchJoin }));
    expect(fetchJoin).not.toHaveBeenCalled();
  });
});
