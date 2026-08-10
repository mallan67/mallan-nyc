/// <reference types="jest" />
/**
 * PHASE-4 `backlog_remaining` PROBE — pinned at the REAL seam, plus its
 * control-plane consequence.
 *
 * The previous suite proved `buildR2BacklogWhere` but DELIBERATELY EXCLUDED the
 * probe (`media-sync-phase4-backlog.test.ts:200` — "exclude the bounded
 * backlog_remaining PROBE"). The probe was therefore the one backlog query with
 * no coverage, which is exactly where the divergence survived: it omitted
 * `media_key: { not: null }` and `r2_policy_excluded_at: null`.
 *
 * These tests assert the query the probe ACTUALLY issues, and then follow the
 * value into `deriveOneCycleFollowup`, because `backlog_remaining` is a
 * control-plane input that decides whether One Cycle wakes Neon again.
 */

const mockMediaSyncFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockMediaSyncUpsert = jest.fn<Promise<unknown>, [unknown]>();
const mockListingMediaFindMany = jest.fn<Promise<unknown[]>, [unknown]>();
const mockAuditFindMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]);

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    mediaSyncState: {
      findUnique: (a: unknown) => mockMediaSyncFindUnique(a),
      upsert: (a: unknown) => mockMediaSyncUpsert(a),
    },
    listingMedia: {
      findMany: (a: unknown) => mockListingMediaFindMany(a),
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
      count: async () => 0,
    },
    listing: { update: jest.fn(), findUnique: jest.fn() },
    auditEvent: { findMany: (a: unknown) => mockAuditFindMany(a), create: async () => ({}) },
    $transaction: (fn: unknown) =>
      typeof fn === 'function'
        ? (fn as (tx: unknown) => unknown)({
            $queryRaw: async () => [{ locked: true }],
            listingMedia: { findMany: (a: unknown) => mockListingMediaFindMany(a) },
          })
        : Promise.all(fn as Promise<unknown>[]),
  },
}));

import {
  runMediaSync,
  buildR2MirrorableBacklogUniverseWhere,
  R2_BACKLOG_PROBE_CAP,
  type RunMediaSyncOptions,
} from '../media-sync';
import { deriveOneCycleFollowup } from '../one-cycle-preflight';

/** The probe is the ids-only bounded select — same discriminator the existing suite uses. */
function isProbeCall(call: unknown[]): boolean {
  const a = call[0] as { select?: Record<string, unknown>; take?: number };
  return Boolean(a?.select && Object.keys(a.select).join(',') === 'id' && a.take === R2_BACKLOG_PROBE_CAP + 1);
}

function options(overrides: Partial<RunMediaSyncOptions> = {}): RunMediaSyncOptions {
  return {
    fetchDeps: {
      getAccessToken: async () => 'tok',
      fetchProperties: async () => [],
      fetchMedia: async () => ({ rows: [], complete: true }),
    },
    ...overrides,
  } as unknown as RunMediaSyncOptions;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMediaSyncFindUnique.mockResolvedValue({
    id: 1, resource: 'Media', last_photos_change: new Date('2026-08-01T00:00:00Z'),
    last_media_modified: new Date('2026-08-01T00:00:00Z'), last_listing_key: '1',
    last_run_at: new Date('2026-08-01T00:00:00Z'), last_run_status: 'ok',
    rows_checked: 0, rows_updated: 0, rows_failed: 0,
  });
  mockMediaSyncUpsert.mockResolvedValue({});
  mockAuditFindMany.mockResolvedValue([]);
});

describe('the probe uses the SHARED universe verbatim', () => {
  it('probe where === buildR2MirrorableBacklogUniverseWhere()', async () => {
    mockListingMediaFindMany.mockResolvedValue([]);
    await runMediaSync(options());

    const probe = mockListingMediaFindMany.mock.calls.find(isProbeCall);
    expect(probe).toBeDefined();
    expect(probe![0]).toMatchObject({ where: buildR2MirrorableBacklogUniverseWhere() });
  });

  it('probe carries BOTH previously-omitted predicates', async () => {
    mockListingMediaFindMany.mockResolvedValue([]);
    await runMediaSync(options());

    const probe = mockListingMediaFindMany.mock.calls.find(isProbeCall)!;
    const where = (probe[0] as { where: Record<string, unknown> }).where;
    // The exact two clauses whose absence produced a permanent phantom backlog.
    expect(where.media_key).toEqual({ not: null });
    expect(JSON.stringify(where)).toContain('r2_policy_excluded_at');
  });

  it('probe stays bounded', async () => {
    mockListingMediaFindMany.mockResolvedValue([]);
    await runMediaSync(options());
    const probe = mockListingMediaFindMany.mock.calls.find(isProbeCall)!;
    expect((probe[0] as { take: number }).take).toBe(R2_BACKLOG_PROBE_CAP + 1);
  });

  it('probe carries NO cooldown and NO attempted-id exclusion', async () => {
    mockListingMediaFindMany.mockResolvedValue([]);
    await runMediaSync(options());
    const probe = mockListingMediaFindMany.mock.calls.find(isProbeCall)!;
    const where = (probe[0] as { where: Record<string, unknown> }).where;
    // No cooldown: a deferred row is still outstanding backlog.
    expect(JSON.stringify(where)).not.toContain('r2_last_attempt_at');
    // No per-invocation attempted-id exclusion. Asserted on the TOP-LEVEL `id`
    // key specifically — a bare `notIn` search would false-positive on the
    // Mallan return-copy suppression clause (`list_office_mls_id: { notIn: [...] }`),
    // which legitimately lives inside the mirror-admission policy.
    expect(where.id).toBeUndefined();
  });
});

describe('backlog_remaining -> One Cycle wake decision', () => {
  const completion = (backlogRemaining: number) => ({
    success: true,
    complete: true,
    members: [
      { member: 'idx-sync', summary: { total_fetched: 0 } },
      {
        member: 'media-sync',
        summary: {
          backlog_remaining: backlogRemaining,
          failures: 0,
          r2_failed: 0,
          time_budget_exhausted: false,
        },
      },
    ],
  }) as never;

  it('only policy-excluded/unmirrorable rows remain -> 0 -> NO further wake', async () => {
    mockListingMediaFindMany.mockResolvedValue([]); // universe excludes them
    const result = await runMediaSync(options());
    expect(result.backlog_remaining).toBe(0);

    const followup = deriveOneCycleFollowup(completion(0), true, new Date('2026-08-09T12:00:00Z'));
    expect(followup.backlogPending).toBe(false);
    expect(followup.nextBacklogRunAt).toBeNull();
  });

  it('a genuine eligible backlog -> wake scheduled', () => {
    const followup = deriveOneCycleFollowup(completion(7), true, new Date('2026-08-09T12:00:00Z'));
    expect(followup.backlogPending).toBe(true);
    expect(followup.nextBacklogRunAt).not.toBeNull();
  });
});

describe('measureBacklogInflow cannot be polluted by unprocessable rows', () => {
  it('inflow is derived from a count the mirror selector could actually drain', async () => {
    // The probe and the candidate selector now share a base, so any row counted
    // here is a row the drain can select once its cooldown elapses. Before the
    // fix, permanently-parked rows inflated backlog_remaining, which inflated
    // measured inflow and therefore computeAdaptiveDrainLimit's batch size.
    mockListingMediaFindMany.mockResolvedValue([]);
    const result = await runMediaSync(options());
    expect(result.backlog_remaining).toBe(0);

    const probe = mockListingMediaFindMany.mock.calls.find(isProbeCall)!;
    expect((probe[0] as { where: unknown }).where).toEqual(buildR2MirrorableBacklogUniverseWhere());
  });
});
