/// <reference types="jest" />
/**
 * FEED-RECONCILE STATUS TRUTH + PROVENANCE (M1) — behavioural RED→GREEN.
 *
 * DEFECT (pre-fix, app/api/cron/feed-reconcile/route.ts step 5b):
 * every "ghost" — a locally-Active listing absent from the live ON-MARKET
 * universe — was stamped with the single literal `"Withdrawn"`, decided purely
 * from absence, with `terminal_since` set to the reconcile wall-clock.
 *
 * Why that is wrong, from the live feed (probe 2026-08-19, raw + sha256 in
 * `.cache/cotality-authority-m2/raw/`):
 *   `StandardStatus eq 'Closed'`    -> HTTP 200, @odata.count 577,073
 *   `StandardStatus eq 'Withdrawn'` -> HTTP 200, @odata.count 0
 * The absence diff spans only Active ∪ Pending ∪ ActiveUnderContract ∪
 * ComingSoon, so a listing that went Closed upstream leaves that set exactly
 * like one that left the feed. Closed is the overwhelmingly likely fate and the
 * feed carries no Withdrawn rows at all — so the cron was recording a status the
 * provider never issues, on rows whose `last_synced_from_trestle` marks them
 * provider-sourced, with nothing saying Mallan invented it.
 *
 * Downstream that is not cosmetic: `Closed` carries a ClosePrice/CloseDate and
 * drives comps and the UCBA Art. I §6 24-hour rule; `Withdrawn` does neither.
 * And `terminal_since` — the T+180 archive clock — was the day we NOTICED
 * rather than the day the provider says it closed, so a long-closed listing's
 * 180-day retention clock restarted on the reconcile date.
 *
 * FIXED CONTRACT (asserted below):
 *   provider returns a record  -> store the provider's StandardStatus VERBATIM,
 *                                 age off the provider's CloseDate/OffMarketDate,
 *                                 audit `status_origin: provider_asserted`
 *   provider returns empty 200 -> genuine departure: DEPARTED_STATUS, audit
 *                                 `status_origin: mallan_local_derivation` plus
 *                                 the derivation reason
 *   lookup did not complete    -> UNVERIFIED: skip. Never guessed, never
 *                                 rendered as "departed"
 *   provider says on-market    -> spare the row
 */
import { makeRequest, readJson } from './helpers';

type UpdateCall = { where: { id: bigint }; data: Record<string, unknown> };
const listingUpdates: UpdateCall[] = [];
const auditEvents: Array<Record<string, unknown>> = [];

/** Five local Actives so the ghost set stays under GHOST_ABORT_RATIO (0.5). */
const LOCAL_ACTIVE = [
  { id: 1n, listing_id: 'RLS-STILL-ACTIVE-1', status: 'Active', address: {} },
  { id: 2n, listing_id: 'RLS-STILL-ACTIVE-2', status: 'Active', address: {} },
  { id: 3n, listing_id: 'RLS-STILL-ACTIVE-3', status: 'Active', address: {} },
  { id: 11n, listing_id: 'RLS-CLOSED-UPSTREAM', status: 'Active', address: {} },
  { id: 12n, listing_id: 'RLS-DEPARTED', status: 'Active', address: {} },
];

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findMany: jest.fn(async (args: { where: Record<string, unknown> }) => {
        if ((args.where as { status?: string }).status === 'Active') return LOCAL_ACTIVE;
        return LOCAL_ACTIVE.map((r) => ({ listing_id: r.listing_id }));
      }),
      create: jest.fn(async () => ({})),
      update: jest.fn(async (args: UpdateCall) => {
        listingUpdates.push(args);
        return {};
      }),
    },
    auditEvent: {
      create: jest.fn(async (args: { data: Record<string, unknown> }) => {
        auditEvents.push(args.data);
        return {};
      }),
    },
    agent: { findMany: jest.fn(async () => []) },
    listingsArchive: { findMany: jest.fn(async () => []) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

jest.mock('@/lib/idx/auth', () => ({
  __esModule: true,
  getAccessToken: jest.fn(async () => 'test-token'),
}));

jest.mock('@/lib/email/sendgrid', () => ({
  __esModule: true,
  sendEmail: jest.fn(async () => ({ success: true })),
}));
jest.mock('@/lib/email/templates', () => ({
  __esModule: true,
  feedReconcileAbortEmail: jest.fn(() => '<html/>'),
}));
jest.mock('@/lib/sanitize', () => ({ __esModule: true, escapeHtml: (s: string) => s }));
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: jest.fn(async () => undefined),
}));
jest.mock('@/lib/idx/media-sync', () => ({
  __esModule: true,
  upsertListingMedia: jest.fn(async () => ({ inserted: 0, updated: 0, skipped: 0, tombstoned: 0 })),
  updateListingMediaSummary: jest.fn(async () => ({})),
}));

import { GET } from '@/app/api/cron/feed-reconcile/route';

/** Provider CloseDate for the upstream-closed ghost — deliberately far in the past. */
const PROVIDER_CLOSE_DATE = '2026-01-15';

type GhostLookupMode = 'closed_and_departed' | 'lookup_http_500' | 'still_on_market';

function installFetch(mode: GhostLookupMode) {
  const ok = (value: unknown) =>
    ({ ok: true, status: 200, json: async () => ({ value }), text: async () => '' }) as unknown as Response;

  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    // The ghost status lookup is the ONLY request selecting CloseDate.
    if (url.includes('CloseDate')) {
      if (mode === 'lookup_http_500') {
        return { ok: false, status: 500, json: async () => ({}), text: async () => 'boom' } as unknown as Response;
      }
      if (mode === 'still_on_market') {
        return ok([
          { ListingId: 'RLS-CLOSED-UPSTREAM', StandardStatus: 'Pending' },
          { ListingId: 'RLS-DEPARTED', StandardStatus: 'Active' },
        ]);
      }
      // closed_and_departed: the provider HAS a record for one and NOT the other.
      return ok([
        {
          ListingId: 'RLS-CLOSED-UPSTREAM',
          StandardStatus: 'Closed',
          CloseDate: PROVIDER_CLOSE_DATE,
          OffMarketDate: PROVIDER_CLOSE_DATE,
        },
      ]);
    }

    // Orphan import batch — nothing to import in these scenarios.
    if (url.includes('$expand')) return ok([]);

    // Live non-active on-market id page.
    if (url.includes('Pending')) return ok([]);

    // Live Active id page — the three rows that are genuinely still live.
    return ok([
      { ListingId: 'RLS-STILL-ACTIVE-1' },
      { ListingId: 'RLS-STILL-ACTIVE-2' },
      { ListingId: 'RLS-STILL-ACTIVE-3' },
    ]);
  }) as unknown as typeof fetch;
}

function call() {
  return GET(
    makeRequest({
      method: 'GET',
      url: 'http://localhost/api/cron/feed-reconcile',
      headers: { authorization: 'Bearer test-secret' },
    }),
  );
}

beforeEach(() => {
  listingUpdates.length = 0;
  auditEvents.length = 0;
  process.env.CRON_SECRET = 'test-secret';
  process.env.IDX_ENABLED = 'true';
});

const updateFor = (id: bigint) => listingUpdates.find((u) => u.where.id === id);
const auditFor = (listingId: string) =>
  auditEvents.find(
    (e) => (e.changes as Record<string, unknown> | undefined)?.listing_id === listingId,
  );

describe("M1 — a ghost the provider calls Closed is recorded as Closed, not 'Withdrawn'", () => {
  beforeEach(() => installFetch('closed_and_departed'));

  it("stores the provider's own StandardStatus VERBATIM", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const u = updateFor(11n);
    expect(u).toBeDefined();
    // RED on the unfixed route: "Withdrawn" — a status whose live population is 0.
    expect(u!.data.status).toBe('Closed');
    expect(u!.data.idx_display_yn).toBe(false);
  });

  it("ages the archive clock off the PROVIDER's CloseDate, not the reconcile wall-clock", async () => {
    await call();
    const ts = updateFor(11n)!.data.terminal_since as Date;
    expect(ts).toBeInstanceOf(Date);
    // RED on the unfixed route: `terminal_since: now`, i.e. today — which
    // restarts the 180-day T+180 archive clock on a listing that closed in
    // January.
    expect(ts.toISOString().slice(0, 10)).toBe(PROVIDER_CLOSE_DATE);
  });

  it('records the status as PROVIDER-asserted in the audit trail', async () => {
    await call();
    const changes = auditFor('RLS-CLOSED-UPSTREAM')!.changes as Record<string, unknown>;
    expect(changes.status_origin).toBe('provider_asserted');
    expect(changes.provider_asserted_status).toBe('Closed');
    expect(changes.derivation_reason).toBeNull();
    expect(changes.to_status).toBe('Closed');
  });
});

describe('M1 — a ghost the provider has NO record of is an explicit Mallan-local derivation', () => {
  beforeEach(() => installFetch('closed_and_departed'));

  it('uses the departed status AND labels it as locally derived', async () => {
    await call();
    const u = updateFor(12n);
    expect(u).toBeDefined();
    expect(u!.data.status).toBe('Withdrawn');

    const changes = auditFor('RLS-DEPARTED')!.changes as Record<string, unknown>;
    // RED on the unfixed route: no `status_origin` key at all — the locally
    // invented status was indistinguishable from a provider observation.
    expect(changes.status_origin).toBe('mallan_local_derivation');
    expect(changes.provider_asserted_status).toBeNull();
    expect(changes.derivation_reason).toBe('absent_from_licensed_live_feed');
  });

  it('reports the provider-asserted / locally-derived split in the response', async () => {
    const res = await call();
    const json = await readJson<Record<string, number>>(res);
    expect(json.ghosts_transitioned).toBe(2);
    expect(json.ghosts_provider_asserted).toBe(1);
    expect(json.ghosts_locally_derived).toBe(1);
    expect(json.ghosts_unverified_skipped).toBe(0);
  });
});

describe('M1 — fail-closed: an UNVERIFIED lookup is never rendered as a departure', () => {
  beforeEach(() => installFetch('lookup_http_500'));

  it('transitions NOTHING when the per-listing status lookup fails', async () => {
    const res = await call();
    const json = await readJson<Record<string, number>>(res);
    expect(res.status).toBe(200);
    // The single most important assertion in this file: an HTTP failure must
    // not become a status. SUPPORTED / PROVIDER_REJECTED / UNVERIFIED are three
    // states and may never collapse.
    expect(listingUpdates).toHaveLength(0);
    expect(auditEvents).toHaveLength(0);
    expect(json.ghosts_detected).toBe(2);
    expect(json.ghosts_transitioned).toBe(0);
    expect(json.ghosts_unverified_skipped).toBe(2);
  });
});

describe('M1 — a candidate the provider reports on-market is spared', () => {
  beforeEach(() => installFetch('still_on_market'));

  it('believes the per-id lookup over the set diff and writes nothing', async () => {
    const res = await call();
    const json = await readJson<Record<string, number>>(res);
    expect(listingUpdates).toHaveLength(0);
    expect(json.ghosts_transitioned).toBe(0);
    expect(json.ghosts_spared_still_on_market).toBe(2);
  });
});
