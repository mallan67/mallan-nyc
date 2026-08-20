/// <reference types="jest" />
/**
 * P1C6 — feed-reconcile eligible-orphan import + media population
 * (behavioral RED→GREEN; designed from the 2026-06-11 live probe).
 *
 * Probe facts: the 3 media-sync ghosts are StandardStatus=Pending — invisible
 * to the Active-only orphan diff BY DESIGN (L13 "$expand 400s" REFUTED: the
 * route's exact expand form returned HTTP 200 with media).
 *
 * Under test:
 *   1. Pending/AUC Trestle listings missing locally ARE detected and created
 *      (RED on main: Active-only diff never sees them).
 *   2. Created orphan WITH media → listing_media populated via the
 *      RC1-hardened upsert with tombstoneVanished:false (the inline expand
 *      payload is not pagination-proven complete — never delete from it).
 *   3. mediaCount=0 → CLEAN no-media outcome: no upsert, no faked photos,
 *      counted in orphans_no_media.
 *   4. STATUS-TRUTH FIX (2026-07-05): ghost transition now spares any local-Active
 *      listing that is live on-market in ANY status (Active ∪ Pending ∪ AUC ∪ ComingSoon).
 *      Only a listing absent from EVERY live on-market status is withdrawn. This reverses
 *      the prior Active-only diff, which the full DB↔Cotality census proved was falsely
 *      suppressing 103 live rows (6 Active, 97 Pending).
 */

import { makeRequest, readJson } from './helpers';

const createdListings: Array<Record<string, unknown>> = [];
const ghostTransitions: Array<Record<string, unknown>> = [];
const upsertCalls: Array<{ id: string; rows: unknown[]; opts: Record<string, unknown> }> = [];
const summaryCalls: string[] = [];

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
        // First call: ourActive (status Active); second: ourAllRls
        if ((args.where as { status?: string }).status === 'Active') {
          return [
            // Active locally but present in the live Pending set → still live → MUST be spared.
            { id: 7n, listing_id: 'RLS-GHOST', status: 'Active' },
            // Active locally and absent from EVERY live on-market status → a real ghost.
            { id: 8n, listing_id: 'RLS-DEPARTED', status: 'Active' },
          ];
        }
        return [{ listing_id: 'RLS-A1' }, { listing_id: 'RLS-GHOST' }, { listing_id: 'RLS-DEPARTED' }];
      }),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        createdListings.push(args.data);
        return {};
      }),
      update: jest.fn(async (args: Record<string, unknown>) => {
        ghostTransitions.push(args);
        return {};
      }),
    },
    auditEvent: { create: jest.fn(async () => ({})) },
    agent: { findMany: jest.fn(async () => []) },
    // P1C6b: archive exclusion read — RLS-ARCHIVED simulates an archived id
    // present in the Trestle eligible set (must never be re-imported).
    listingsArchive: { findMany: jest.fn(async () => [{ listing_id: 'RLS-ARCHIVED' }]) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

jest.mock('@/lib/idx/auth', () => ({
  __esModule: true,
  getAccessToken: jest.fn(async () => 'test-token'),
}));

const GATED_ID = 'RLS-GATED';

jest.mock('@/lib/idx/trestle-mapper', () => ({
  __esModule: true,
  // Pass through the real terminal-status set + normalizer: the archive-clock
  // helper (lib/listings/terminal-since.ts), now used by the reconcile writers,
  // imports TERMINAL_STATUSES + normalizeStandardStatus from here (#415). Keeping
  // the single source of truth (no duplicated status set in the test).
  TERMINAL_STATUSES: jest.requireActual('@/lib/idx/trestle-mapper').TERMINAL_STATUSES,
  normalizeStandardStatus: jest.requireActual('@/lib/idx/trestle-mapper').normalizeStandardStatus,
  // Status-truth fix (2026-08-19): the ghost writer now recomputes the display
  // gate from the TARGET status through the canonical helper instead of
  // hardcoding `idx_display_yn: false`. Pass the REAL implementation through —
  // a stub would let the test agree with a gate that does not exist.
  computeGateColumns: jest.requireActual('@/lib/idx/trestle-mapper').computeGateColumns,
  validateRequiredFields: jest.fn(() => ({ valid: true, missingFields: [] })),
  checkDistributionGates: jest.fn((raw: Record<string, unknown>) =>
    String(raw.ListingId) === 'RLS-GATED'
      ? { displayable: false, reason: 'owner_opt_out' }
      : { displayable: true, reason: null },
  ),
  mapTrestleToPrisma: jest.fn((raw: Record<string, unknown>) => ({
    listing_id: String(raw.ListingId),
    mls_id: String(raw.ListingId),
    status: String(raw.StandardStatus),
    listing_type: 'sale',
    media: [],
    address: {}, features: {}, compliance: {}, agent_info: {}, raw_data: {},
    list_price: 1, living_area: 1,
  })),
}));

jest.mock('@/lib/email/sendgrid', () => ({ __esModule: true, sendEmail: jest.fn(async () => ({ success: true })) }));
jest.mock('@/lib/email/templates', () => ({ __esModule: true, feedReconcileAbortEmail: jest.fn(() => '<html/>') }));
jest.mock('@/lib/sanitize', () => ({ __esModule: true, escapeHtml: (s: string) => s }));
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: jest.fn(async () => undefined),
}));
jest.mock('@/lib/idx/media-sync', () => ({
  __esModule: true,
  upsertListingMedia: jest.fn(async (id: string, rows: unknown[], opts: Record<string, unknown>) => {
    upsertCalls.push({ id, rows, opts });
    return { inserted: rows.length, updated: 0, skipped: 0, tombstoned: 0 };
  }),
  updateListingMediaSummary: jest.fn(async (id: string) => {
    summaryCalls.push(id);
    return {};
  }),
}));

import { GET } from '@/app/api/cron/feed-reconcile/route';

const PENDING_WITH_MEDIA = 'RLS20030621';
const PENDING_NO_MEDIA = 'RLS20014678';

beforeEach(() => {
  createdListings.length = 0;
  ghostTransitions.length = 0;
  upsertCalls.length = 0;
  summaryCalls.length = 0;
  process.env.CRON_SECRET = 'test-secret';
  process.env.IDX_ENABLED = 'true';

  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const ok = (value: unknown) => ({
      ok: true, status: 200, json: async () => ({ value }), text: async () => '',
    }) as unknown as Response;
    if (url.includes('$expand')) {
      // Orphan batch fetch — both Pending orphans, one with media, one without
      return ok([
        {
          ListingId: PENDING_WITH_MEDIA, StandardStatus: 'Pending',
          PhotosChangeTimestamp: '2026-05-14T20:37:58.703Z',
          Media: [
            { MediaKey: 'MK-1', MediaURL: 'https://cdn/1.jpg', MediaCategory: 'Photo', MediaStatus: 'Active', Order: 1 },
            { MediaKey: 'MK-2', MediaURL: 'https://cdn/2.jpg', MediaCategory: 'Photo', MediaStatus: 'Active', Order: 2 },
          ],
        },
        { ListingId: PENDING_NO_MEDIA, StandardStatus: 'Pending', Media: [] },
        {
          // Gate-blocked orphan WITH media — its photos must NEVER reach
          // listing_media (the R2 mirror has no compliance join).
          ListingId: GATED_ID, StandardStatus: 'Pending',
          Media: [{ MediaKey: 'MK-G', MediaURL: 'https://cdn/g.jpg', MediaCategory: 'Photo', MediaStatus: 'Active', Order: 1 }],
        },
      ]);
    }
    if (url.includes('Pending')) {
      // Eligible-non-active id page — includes RLS-GHOST to prove ghost
      // semantics stay Active-only
      return ok([
        { ListingId: PENDING_WITH_MEDIA },
        { ListingId: PENDING_NO_MEDIA },
        { ListingId: GATED_ID },
        { ListingId: 'RLS-GHOST' },
        { ListingId: 'RLS-ARCHIVED' }, // P1C6b: archived — must be excluded
      ]);
    }
    // Active id page
    return ok([{ ListingId: 'RLS-A1' }]);
  }) as unknown as typeof fetch;
});

function call() {
  return GET(makeRequest({
    method: 'GET',
    url: 'http://localhost/api/cron/feed-reconcile',
    headers: { authorization: 'Bearer test-secret' },
  }));
}

describe('P1C6 — eligible-orphan import (RED on main: Active-only diff)', () => {
  it('detects and creates Pending orphans missing locally', async () => {
    const res = await call();
    const json = await readJson<Record<string, number>>(res);
    expect(res.status).toBe(200);
    const createdIds = createdListings.map((d) => d.listing_id);
    expect(createdIds).toContain(PENDING_WITH_MEDIA);
    expect(createdIds).toContain(PENDING_NO_MEDIA);
    expect(json.orphans_created).toBe(3);
  });

  it('TRISTLE BLOCKER: gate-blocked orphan with media → listing created gated:, ZERO media rows written, counted as compliance skip (not no-media)', async () => {
    const res = await call();
    const json = await readJson<Record<string, number>>(res);
    const gated = createdListings.find((d) => d.listing_id === GATED_ID);
    expect(gated).toBeDefined();
    expect(String(gated!.sync_status)).toContain('gated:');
    expect(upsertCalls.map((c) => c.id)).not.toContain(GATED_ID);
    expect(summaryCalls).not.toContain(GATED_ID);
    expect(json.orphans_media_gated).toBe(1);
    expect(json.orphans_no_media).toBe(1); // the clean-no-media case stays distinct
  });

  it('media-bearing orphan → listing_media populated via the hardened upsert, NEVER tombstoning from the inline payload', async () => {
    await call();
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].id).toBe(PENDING_WITH_MEDIA);
    expect(upsertCalls[0].rows).toHaveLength(2);
    expect(upsertCalls[0].opts.tombstoneVanished).toBe(false);
    expect(summaryCalls).toEqual([PENDING_WITH_MEDIA]);
  });

  it('mediaCount=0 → clean no-media outcome: no upsert, no fake, counted', async () => {
    const res = await call();
    const json = await readJson<Record<string, number>>(res);
    expect(upsertCalls.map((c) => c.id)).not.toContain(PENDING_NO_MEDIA);
    expect(json.orphans_no_media).toBe(1);
    expect(json.orphans_with_media).toBe(1);
    expect(json.orphan_media_errors).toBe(0);
  });

  it('STATUS-TRUTH FIX: a live-Pending listing is SPARED; only a genuinely-departed listing is withdrawn', async () => {
    // RLS-GHOST is Active locally but present in the live Pending set → still a live listing →
    // it MUST NOT be withdrawn. RLS-DEPARTED is Active locally and absent from every live
    // on-market status → a real ghost. The prior Active-only diff withdrew BOTH; the full
    // DB↔Cotality census (2026-07-05) proved that falsely suppressed 103 live rows (6 Active,
    // 97 Pending). Now only the genuinely-departed listing transitions.
    await call();
    expect(ghostTransitions).toHaveLength(1);
    const t = ghostTransitions[0] as { where: { id: unknown }; data: Record<string, unknown> };
    expect(t.data.status).toBe('Withdrawn');
    expect(t.where.id).toBe(8n); // RLS-DEPARTED — NOT RLS-GHOST (id 7n, spared)
  });

  it('P1C6b: archived id in the eligible set is EXCLUDED from import and counted', async () => {
    const res = await call();
    const json = await readJson<Record<string, number>>(res);
    expect(createdListings.map((d) => d.listing_id)).not.toContain('RLS-ARCHIVED');
    expect(json.archive_overlap).toBe(1);
  });

  it('P1C6b: chunked-catch-up counters present and coherent (small set fits one chunk)', async () => {
    const res = await call();
    const json = await readJson<Record<string, number>>(res);
    expect(json.chunk_size).toBe(300);
    expect(json.total_eligible).toBe(3); // gated + 2 pending (archived excluded)
    expect(json.imported_this_run).toBe(3);
    expect(json.remaining_after_run).toBe(0);
    expect(json.with_media).toBe(1);
    expect(json.no_media).toBe(1);
    expect(json.gated_skipped).toBe(1);
  });
});

// ── STATUS-TRUTH HARDENING (2026-07-06): empty/partial HTTP-200 feed floor guards ──
// A non-200 fetch already throws (fail-closed), but an HTTP-200 EMPTY or PARTIAL feed
// would make the whole/most of the active book look "departed" and mass-withdraw live
// listings. These prove the floor guards abort fail-closed with ZERO withdrawals.
describe('STATUS-TRUTH HARDENING — feed floor guards', () => {
  const okVal = (value: unknown) => ({
    ok: true, status: 200, json: async () => ({ value }), text: async () => '',
  }) as unknown as Response;

  it('empty HTTP-200 feed → aborts (live_feed_empty), NO withdrawals', async () => {
    // Every Trestle page returns 200 with an empty set → liveOnMarketIds is empty.
    global.fetch = jest.fn(async () => okVal([])) as unknown as typeof fetch;
    const res = await call();
    const json = await readJson<Record<string, unknown>>(res);
    expect(res.status).toBe(503);
    expect(json.aborted).toBe(true);
    expect(json.reason).toBe('live_feed_empty');
    expect(ghostTransitions).toHaveLength(0); // ← the whole point: no mass withdrawal
  });

  it('partial/collapsed HTTP-200 feed → aborts (ghost_ratio_collapse), NO withdrawals', async () => {
    // Non-empty but the live set contains NONE of our active ids → every active row is a
    // false ghost (2/2 = 100% > 50% ratio). Must abort, not withdraw.
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('Pending')) return okVal([]); // no non-active on-market
      return okVal([{ ListingId: 'RLS-UNRELATED' }]); // Active page: one unrelated id
    }) as unknown as typeof fetch;
    const res = await call();
    const json = await readJson<Record<string, unknown>>(res);
    expect(res.status).toBe(503);
    expect(json.aborted).toBe(true);
    expect(json.reason).toBe('ghost_ratio_collapse');
    expect(ghostTransitions).toHaveLength(0);
  });

  it('non-200 feed still fail-closed (throws → 5xx), NO withdrawals', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false, status: 503, json: async () => ({}), text: async () => '',
    }) as unknown as Response) as unknown as typeof fetch;
    const res = await call();
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(ghostTransitions).toHaveLength(0);
  });
});
