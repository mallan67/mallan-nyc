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
 *   4. Ghost-transition semantics byte-identical: a local-Active listing
 *      absent from Trestle-ACTIVE still transitions even when present in the
 *      Pending set (the eligible set extends ORPHANS only).
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
          return [{ id: 7n, listing_id: 'RLS-GHOST', status: 'Active' }];
        }
        return [{ listing_id: 'RLS-A1' }, { listing_id: 'RLS-GHOST' }];
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

  it('ghost semantics byte-identical: local-Active absent from Trestle-ACTIVE still transitions even though it sits in the Pending set', async () => {
    await call();
    expect(ghostTransitions).toHaveLength(1);
    const data = (ghostTransitions[0] as { data: Record<string, unknown> }).data;
    expect(data.status).toBe('Withdrawn');
  });
});
