/// <reference types="jest" />
/**
 * P1C1 — reset-sync RC2 patch (behavioral RED→GREEN).
 *
 * The reset-sync route fetches with expandMedia:false (Trestle 400s the
 * expand — PR-S.1c), so mapped.media is ALWAYS []. Its upsert UPDATE branch
 * wrote `media: mapped.media` unconditionally — the last Trestle-shaped JSON
 * writer outside the RC2 guard. On any UPDATE-branch hit (re-entrant run /
 * partial failure / future edit) it stomps existing listings.media to [] —
 * the exact RC2 bug surviving in a manual side door (deep-review L5-manual,
 * writer W16). Defense-in-depth note: STEP 1 deletes all listings first, so a
 * clean run hits CREATE everywhere; the UPDATE branch is the re-entrant path.
 *
 * Under test (route-level, mocked Trestle + Prisma):
 *   1. the captured upsert `update` payload has NO `media` key (RED: media:[]).
 *   2. the CREATE branch still writes media (new row — W1-identical semantics).
 */

import { makeRequest, readJson } from './helpers';

const upsertCalls: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    agent: {
      findUnique: jest.fn(async () => ({
        id: 1n, license_no: '10311201806', trestle_mls_id: '39361', full_name: 'Maya Allan',
      })),
    },
    clientListingAction: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    showing: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    comment: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    priceHistory: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    marketingActivity: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    protectedPeriod: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    listing: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
      // #446: reset-sync now fetches existing status for the terminal_since clock.
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
        upsertCalls.push(args);
        return {};
      }),
      count: jest.fn(async () => 1),
      groupBy: jest.fn(async () => []),
    },
  },
}));

jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireBroker: jest.fn(async () => ({ userId: 1n, userType: 'agent', role: 'BROKER' })),
  isAuthError: jest.fn(() => false),
  logAuditEvent: jest.fn(async () => undefined),
}));

jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

jest.mock('@/lib/idx/auth', () => ({
  __esModule: true,
  hasCredentials: () => true,
}));

jest.mock('@/lib/idx/fetch', () => ({
  __esModule: true,
  fetchFromTrestle: jest.fn(async () => ({
    totalFetched: 1,
    records: [{ ListingId: 'RLS20012345', ListingKey: '1159000001' }],
  })),
}));

jest.mock('@/lib/idx/trestle-mapper', () => ({
  __esModule: true,
  // #446: the terminal_since helper (via reset-sync) needs the real terminal set + normalizer.
  TERMINAL_STATUSES: jest.requireActual('@/lib/idx/trestle-mapper').TERMINAL_STATUSES,
  normalizeStandardStatus: jest.requireActual('@/lib/idx/trestle-mapper').normalizeStandardStatus,
  validateHistoricalFields: jest.fn(() => ({ valid: true, missingFields: [] })),
  checkDistributionGates: jest.fn(() => ({ displayable: true, reason: null })),
  mapTrestleToPrisma: jest.fn(() => ({
    listing_id: 'RLS20012345',
    mls_id: 'RLS20012345',
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Residential',
    property_sub_type: 'Condo',
    list_price: 1000000,
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: 0,
    living_area: 1000,
    borough: 'Manhattan',
    neighborhood: 'Midtown',
    city: 'New York',
    postal_code: '10017',
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    participant_only: false,
    owner_opt_out: false,
    address: {},
    features: {},
    media: [], // expandMedia:false → ALWAYS empty — must never reach the UPDATE payload
    compliance: {},
    agent_info: {},
    raw_data: {},
    modification_timestamp: new Date('2026-06-01'),
    listing_contract_date: null,
    last_synced_from_trestle: new Date('2026-06-11'),
    sync_status: 'ok',
  })),
}));

jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: jest.fn(async () => undefined),
}));

import { POST } from '@/app/api/crm/listings/reset-sync/route';

beforeEach(() => {
  upsertCalls.length = 0;
  process.env.IDX_ENABLED = 'true';
  // PR #618 disabled this route's EXECUTABLE access in production (it is the
  // only whole-table delete in the repo and emits no cache invalidation, so a
  // run would leave permanent event-driven cache ghosts). These tests exercise
  // the WRITER CONTRACT beneath that guard, not the guard itself — that is
  // covered by reset-sync-disabled.test.ts — so they opt in explicitly.
  process.env.RESET_SYNC_ENABLED = 'true';
});

describe('P1C1 — reset-sync must not stomp listings.media on the UPDATE branch', () => {
  it('upsert UPDATE payload omits media entirely (RC2 semantics: not fetched → not written)', async () => {
    const res = await POST(makeRequest({ method: 'POST', url: 'http://localhost/api/crm/listings/reset-sync' }));
    const json = await readJson<{ success?: boolean; upserted?: number }>(res);

    expect(res.status).toBe(200);
    expect(json.upserted).toBe(1);
    expect(upsertCalls).toHaveLength(1);
    // The RC2 contract: media was NOT fetched (expandMedia:false), so the
    // UPDATE payload must OMIT the key — preserving existing listings.media.
    expect(Object.keys(upsertCalls[0].update)).not.toContain('media');
  });

  it('CREATE branch still writes media (new row, W1-identical semantics)', async () => {
    await POST(makeRequest({ method: 'POST', url: 'http://localhost/api/crm/listings/reset-sync' }));
    expect(upsertCalls).toHaveLength(1);
    expect(Object.keys(upsertCalls[0].create)).toContain('media');
    expect(upsertCalls[0].create.media).toEqual([]);
  });
});
