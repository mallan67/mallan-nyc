/// <reference types="jest" />
export {};
/**
 * THE ONE CANONICAL MALLAN SOURCE-OWNERSHIP RULE — proved BEHAVIOURALLY, not by reading source text.
 *
 * Owner review 2026-09-09: *"Do not accept rls_eligible=false as proof of Mallan ownership merely because today's
 * simulation returns zero; add a provider-row negative test and establish one canonical source-ownership rule."*
 *
 * WHAT WAS WRONG. Three separate implementations all said `SL-`/`RL-` prefix **OR** `rls_eligible === false`.
 * But `rls_eligible === false` means "commercial / website-only, not RLS inventory" — it is an INPUT to
 * `computeGateColumns`, not a provenance fact the feed asserts. A third-party COMMERCIAL row ingested with
 * `false` would be classified as Mallan-owned, and the listing-expiration cron would write `expiration_date`,
 * `idx_display_yn` and `modification_timestamp` onto another brokerage's listing.
 *
 * HOW THIS FILE PROVES IT. Every assertion below runs code:
 *   1. The in-memory predicate and the Prisma `where` form are driven over the SAME fixture rows and must agree
 *      row-for-row. A drift between the two forms fails here rather than in production.
 *   2. The REAL listing-expiration cron handler is invoked against an in-memory Prisma that actually EVALUATES
 *      the where clause it is given. The test then inspects which listings were notified and which had a
 *      ProtectedPeriod created. Nothing is asserted by matching source text.
 */

import { isMallanAuthoredListing, mallanAuthoredListingWhere, hasProviderProvenance } from '@/lib/listings/exclusive-agent-assignment';

// The `where` evaluator lives in tests/helpers so other suites can drive the same clauses over fixture rows.
import { matchesWhere, type Row } from '@/tests/helpers/prisma-where-evaluator';

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────────────────────
// The shapes come from production (read-only 2026-09-09): a Mallan row carries the SL-/RL- prefix, a null
// last_synced_from_trestle, no list_office_mls_id and no mls_id; a feed row is Trestle-synced and office-stamped.
const MALLAN_EXCLUSIVE = {
  id: 1, listing_id: 'SL-0001', rls_eligible: false,
  last_synced_from_trestle: null, list_office_mls_id: null, mls_id: null,
};

/** THE NEGATIVE CASE. A third-party COMMERCIAL listing: website-only flag set, but the feed plainly sent it. */
const THIRD_PARTY_COMMERCIAL = {
  id: 2, listing_id: 'RLS90001', rls_eligible: false,
  last_synced_from_trestle: new Date('2026-09-08T03:30:00Z'), list_office_mls_id: '9999', mls_id: 'RLS90001',
};

const THIRD_PARTY_NORMAL = {
  id: 3, listing_id: 'RLS12345', rls_eligible: true,
  last_synced_from_trestle: new Date('2026-09-08T03:30:00Z'), list_office_mls_id: '9999', mls_id: 'RLS12345',
};

/** A Mallan row that has NOT been given a prefix yet but is genuinely CRM-authored. */
const MALLAN_WEBSITE_ONLY_NO_PREFIX = {
  id: 4, listing_id: 'legacy-web-77', rls_eligible: false,
  last_synced_from_trestle: null, list_office_mls_id: null, mls_id: null,
};

const ALL = [MALLAN_EXCLUSIVE, THIRD_PARTY_COMMERCIAL, THIRD_PARTY_NORMAL, MALLAN_WEBSITE_ONLY_NO_PREFIX];

describe('rls_eligible=false is not proof of Mallan ownership', () => {
  it('a third-party COMMERCIAL row with rls_eligible=false is NOT Mallan-authored', () => {
    expect(isMallanAuthoredListing(THIRD_PARTY_COMMERCIAL)).toBe(false);
    expect(hasProviderProvenance(THIRD_PARTY_COMMERCIAL)).toBe(true);
  });

  it.each([
    ['a Trestle sync stamp alone', { listing_id: 'RLS1', rls_eligible: false, last_synced_from_trestle: new Date(), list_office_mls_id: null, mls_id: null }],
    ['a provider list-office id alone', { listing_id: 'RLS2', rls_eligible: false, last_synced_from_trestle: null, list_office_mls_id: '9999', mls_id: null }],
    ['a provider MLS id alone', { listing_id: 'RLS3', rls_eligible: false, last_synced_from_trestle: null, list_office_mls_id: null, mls_id: 'RLS3' }],
  ])('%s is enough to disqualify ownership', (_label, row) => {
    expect(isMallanAuthoredListing(row)).toBe(false);
  });

  it('the SL-/RL- prefix stays definitive on its own — the feed cannot mint one', () => {
    expect(isMallanAuthoredListing(MALLAN_EXCLUSIVE)).toBe(true);
    // even if a prefixed row somehow carried a sync stamp, the prefix still wins
    expect(isMallanAuthoredListing({ ...MALLAN_EXCLUSIVE, last_synced_from_trestle: new Date() })).toBe(true);
  });

  it('a genuinely CRM-authored website-only row without a prefix is still owned', () => {
    expect(isMallanAuthoredListing(MALLAN_WEBSITE_ONLY_NO_PREFIX)).toBe(true);
  });

  it('an ordinary third-party feed row is never owned', () => {
    expect(isMallanAuthoredListing(THIRD_PARTY_NORMAL)).toBe(false);
  });
});

describe('the predicate and the Prisma where form cannot drift apart', () => {
  it('both select exactly the same rows', () => {
    const byPredicate = ALL.filter((r) => isMallanAuthoredListing(r)).map((r) => r.listing_id);
    const bySql = ALL.filter((r) => matchesWhere(r, mallanAuthoredListingWhere())).map((r) => r.listing_id);
    expect(bySql).toEqual(byPredicate);
    expect(byPredicate).toEqual(['SL-0001', 'legacy-web-77']);
  });

  it('the where form excludes the third-party commercial row specifically', () => {
    expect(matchesWhere(THIRD_PARTY_COMMERCIAL, mallanAuthoredListingWhere())).toBe(false);
  });
});

// ── The cron, actually executed ──────────────────────────────────────────────────────────────────────────────
const listingFindMany: jest.Mock = jest.fn();
const listingUpdate: jest.Mock = jest.fn(async () => ({}));
const protectedPeriodCreate: jest.Mock = jest.fn(async () => ({ id: 1 }));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findMany: (a: unknown) => listingFindMany(a),
      update: (a: unknown) => listingUpdate(a),
    },
    protectedPeriod: {
      create: (a: unknown) => protectedPeriodCreate(a),
      findMany: async () => [],
      update: async () => ({}),
    },
    agent: { findMany: async () => [] },
    auditEvent: { create: async () => ({}) },
  },
}));
jest.mock('@/lib/notifications/engine', () => ({ createNotification: jest.fn(async () => ({})) }));
jest.mock('@/lib/email/sendgrid', () => ({ sendEmail: jest.fn(async () => ({ ok: true })) }));
jest.mock('@/lib/email/templates', () => ({ listingExpirationEmail: () => ({ subject: 's', html: 'h', text: 't' }) }));
jest.mock('@/lib/search/listing-search-projection', () => ({ dualWriteProjectionForListingId: jest.fn(async () => ({})) }));
jest.mock('@/lib/cache/public-cache', () => ({
  safeRevalidateTags: jest.fn(), listingCacheTag: () => 't', buildingAndManifestInvalidationTags: () => [], SEARCH_CACHE_TAG: 'search',
}));

describe('the listing-expiration cron writes only to Mallan-owned rows', () => {
  const expired = new Date(Date.now() - 24 * 3600 * 1000);
  // Every candidate is expired, has an agent, and has no protected period — so ownership is the ONLY thing
  // that can keep the cron off a row.
  const candidates = ALL.map((r) => ({
    ...r, status: 'Active', expiration_date: expired, agent_id: 10,
    protected_period: null, expiration_30d_notified: false, expiration_7d_notified: false,
    address: { street: '1 Main St' },
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    // The mock EVALUATES the where clause the route actually built.
    listingFindMany.mockImplementation(async (args: { where?: Record<string, unknown> }) =>
      candidates.filter((row) => matchesWhere(row as Row, args?.where)));
    process.env.CRON_SECRET = 'test-secret';
  });

  async function runCron() {
    const { GET } = require('@/app/api/cron/listing-expiration/route');
    const { NextRequest } = require('next/server');
    const req = new NextRequest('https://mallan.nyc/api/cron/listing-expiration', {
      headers: { authorization: 'Bearer test-secret' },
    });
    return GET(req);
  }

  it('creates a ProtectedPeriod for the Mallan rows and for NO third-party row', async () => {
    const res = await runCron();
    expect(res.status).toBe(200);

    const touchedListingIds = (protectedPeriodCreate.mock.calls as unknown[][])
      .map((c) => (c[0] as { data: { listing_id: number } }).data.listing_id)
      .sort();
    // ids 1 and 4 are the Mallan rows; 2 is the third-party COMMERCIAL row (rls_eligible=false) and 3 is a
    // normal feed row. Neither may be touched.
    expect(touchedListingIds).toEqual([1, 4]);
    expect(touchedListingIds).not.toContain(2);
    expect(touchedListingIds).not.toContain(3);
  });

  it('never writes an update to a third-party listing row', async () => {
    await runCron();
    const updatedIds = (listingUpdate.mock.calls as unknown[][]).map((c) => (c[0] as { where: { id: number } }).where.id);
    for (const id of updatedIds) expect([1, 4]).toContain(id);
  });

  it('the where clause it built is the canonical ownership predicate, not a looser one', async () => {
    await runCron();
    expect(listingFindMany).toHaveBeenCalled();
    // Prove by BEHAVIOUR: replay every where the route used against the third-party commercial row.
    for (const call of listingFindMany.mock.calls as unknown[][]) {
      const where = (call[0] as { where?: Record<string, unknown> })?.where;
      if (!where || !JSON.stringify(where).includes('rls_eligible')) continue;
      expect(matchesWhere(THIRD_PARTY_COMMERCIAL as Row, where)).toBe(false);
    }
  });
});
