/// <reference types="jest" />
/**
 * NO MARKET STATUS IS A STATE, NOT A WORD.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG
 *
 * `listings.status` holds the Cotality market fact (`Property.StandardStatus`).
 * It was `String NOT NULL DEFAULT 'Active'`, so a Mallan-authored listing that
 * had never been on the market still had to store SOME market status. Mallan
 * chose `Draft` — a Mallan publication word, not a Cotality StandardStatus
 * member — so the column meant two different things depending on who wrote the
 * row, and Mallan workflow state lived inside the provider-status domain.
 *
 * The default was the other half of the defect: every INSERT that omitted the
 * column silently claimed the listing was `Active`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT MEANS NOW
 *
 * NULL means exactly one thing: THIS LISTING HAS NO MARKET STATUS YET.
 *
 * Mallan publication/review state lives only in
 * `Listing.compliance.mallan_publication`, whose reader already treats an
 * absent record as DRAFT / INTERNAL_ONLY — so no backfill is needed and none
 * is performed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INVARIANT THESE TESTS DEFEND
 *
 * Every public gate is an ALLOW-list, so "no market status" must fail closed at
 * each one — and every internal path must read it as "not on the market yet"
 * rather than crashing or inventing a status. Legacy rows still carrying
 * `Draft` keep working unchanged: no production backfill is authorized.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';

/** Swapped per-test; the seeded findUnique closes over it. */
let currentListingRow: Record<string, unknown> | null = null;

/**
 * The default mock `create` echoes its ARGUMENT back, which is `{ data: … }` —
 * not a row, so `result.id` is undefined and the route's own catch turns that
 * into a 500 before any assertion runs. Seeding a realistic created row is what
 * lets these tests observe the route's real success path.
 */
const createListing = jest.fn(
  async (args: { data: Record<string, unknown> }) => ({
    ...args.data,
    id: BigInt(4242),
  }),
);

const { prisma: basePrisma, calls } = buildPrismaMock({
  listing: {
    findUnique: jest.fn(async () => currentListingRow),
    create: createListing,
  },
});

/**
 * `buildPrismaMock` intercepts every `$`-prefixed property, so raw-SQL stubs
 * cannot be assigned onto it. Wrapping is the only way to give
 * `generateListingId` a MAX() result — and `$transaction` must hand back the
 * WRAPPER, or the callback's `tx.$queryRaw` falls through to the unwrapped mock.
 */
const prismaMock: Record<string, unknown> = new Proxy(
  basePrisma as unknown as Record<string, unknown>,
  {
    get(target, prop: string) {
      if (prop === '$queryRaw') return async () => [{ max_seq: null }];
      if (prop === '$executeRaw') return async () => 0;
      if (prop === '$transaction') {
        return async (cb: unknown) =>
          typeof cb === 'function' ? (cb as (tx: unknown) => unknown)(prismaMock) : null;
      }
      return (target as Record<string, unknown>)[prop];
    },
  },
);

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({
    userId: 'agent-1',
    userType: 'agent',
    role: 'BROKER',
  })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));

import { POST as CREATE_LISTING } from '@/app/api/crm/listings/route';
import { PATCH as PATCH_STATUS } from '@/app/api/crm/listings/[id]/status/route';
import { marketStatusForBusinessOutcome } from '@/lib/crm/market-status-label';
import { readPublication } from '@/lib/crm/publication-state';
import { filterDisplayableDbListings } from '@/lib/idx/db-to-public-dto';
import { isLocalOpenHousePubliclyEligible } from '@/lib/open-houses/local-open-house-eligible';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

/** The one place a test names the create call, so a rename fails loudly. */
function createArgs(): Record<string, unknown> {
  expect(createListing.mock.calls.length).toBeGreaterThan(0);
  return createListing.mock.calls[createListing.mock.calls.length - 1][0].data;
}

function updateArgs(): Record<string, unknown> {
  const recorded = calls['listing.update'];
  expect(recorded && recorded.length).toBeGreaterThan(0);
  return (recorded[recorded.length - 1][0] as { data: Record<string, unknown> }).data;
}

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
  createListing.mockClear();
  currentListingRow = null;
});

describe('the column itself', () => {
  it('is nullable and carries no default', () => {
    const schema = read('prisma/schema.prisma');
    const line = schema
      .split('\n')
      .find((l) => /^\s*status\s/.test(l) && l.includes('Cotality'));
    expect(line).toBeDefined();
    expect(line as string).toMatch(/status\s+String\?/);
    expect(line as string).not.toMatch(/@default/);
  });

  it('the migration drops the constraint AND the default, and touches no data', () => {
    const sql = read(
      'prisma/migrations/20260827090000_listings_status_nullable_market_status/migration.sql',
    );
    const statements = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--') && l.trim() !== '');
    const body = statements.join('\n');
    expect(body).toMatch(/ALTER TABLE "listings" ALTER COLUMN "status" DROP NOT NULL;/);
    expect(body).toMatch(/ALTER TABLE "listings" ALTER COLUMN "status" DROP DEFAULT;/);
    // No row is read, written or deleted. A backfill here would be an
    // unauthorized mass production update.
    expect(body).not.toMatch(/\b(UPDATE|DELETE|INSERT)\b/i);
    expect(statements).toHaveLength(2);
  });
});

describe('a Mallan-authored listing is born with NO market status', () => {
  it('POST /api/crm/listings persists status = null', async () => {
    const res = await CREATE_LISTING(
      makeRequest({
        method: 'POST',
        body: { listing_type: 'sale', rls_eligible: false, list_price: 1000000 },
      }),
    );
    expect(res.status).toBeLessThan(400);
    expect(createArgs().status).toBeNull();
  });

  it('…and records DRAFT in the publication namespace, not in the status column', async () => {
    await CREATE_LISTING(
      makeRequest({
        method: 'POST',
        body: { listing_type: 'rent', rls_eligible: false, list_price: 4200 },
      }),
    );
    const data = createArgs();
    expect(data.status).toBeNull();
    expect(readPublication(data.compliance).state).toBe('DRAFT');
    expect(readPublication(data.compliance).visibility).toBe('INTERNAL_ONLY');
  });

  it('the convert path agrees — one initial state, not two', () => {
    // Convert needs a real Lead graph to run; the write itself is pinned here so
    // the two create paths cannot drift apart.
    const src = read('app/api/crm/convert/route.ts');
    expect(src).toMatch(/const convertInitialStatus: string \| null = null;/);
    expect(src).toMatch(/status: convertInitialStatus,/);
  });

  it('neither create path writes the Draft sentinel into the provider column any more', () => {
    for (const rel of ['app/api/crm/listings/route.ts', 'app/api/crm/convert/route.ts']) {
      const code = read(rel)
        .split('\n')
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
        })
        .join('\n');
      expect(code).not.toMatch(/["']Draft["']/);
    }
  });
});

describe('the status route treats NULL as a first-class starting point', () => {
  const localRow = (status: string | null) => ({
    id: BigInt(7),
    listing_id: 'SL-0007',
    mls_id: null,
    owner_client_id: BigInt(31),
    agent_id: BigInt(3),
    status,
    listing_type: 'sale',
    rls_eligible: false,
    raw_data: {},
    features: {},
    address: {},
    compliance: {},
    media: [],
    status_changed_at: null,
    first_active_date: null,
    days_on_market: 0,
    expiration_date: null,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    internet_automated_valuation_display_yn: true,
    internet_consumer_comment_yn: true,
    participant_only: false,
    owner_opt_out: false,
  });

  const patch = (status: string) =>
    PATCH_STATUS(makeRequest({ method: 'PATCH', body: { status } }), {
      params: Promise.resolve({ id: 'SL-0007' }),
    });

  it('a listing with no market status may go Active', async () => {
    currentListingRow = localRow(null);
    const res = await patch('Active');
    expect(res.status).toBeLessThan(400);
    expect(updateArgs().status).toBe('Active');
  });

  it('a listing with no market status may go ComingSoon', async () => {
    currentListingRow = localRow(null);
    const res = await patch('ComingSoon');
    expect(res.status).toBeLessThan(400);
    expect(updateArgs().status).toBe('ComingSoon');
  });

  it('a listing with no market status may NOT jump straight to a terminal outcome', async () => {
    currentListingRow = localRow(null);
    const res = await patch('Sold');
    expect(res.status).toBe(422);
    const json = await readJson<{ allowed: string[] }>(res);
    expect(json.allowed).toEqual(['Active', 'ComingSoon']);
    expect(calls['listing.update']).toBeUndefined();
  });

  it('taking a listing back off the market clears the market status', async () => {
    // The broker's word is still "Draft" — the API vocabulary does not change.
    // What changes is that the column stores the ABSENCE of a market status
    // rather than a Mallan word pretending to be a provider fact.
    currentListingRow = localRow('Withdrawn');
    const res = await patch('Draft');
    expect(res.status).toBeLessThan(400);
    expect(updateArgs().status).toBeNull();
  });

  it('and the helper is the one place that translation happens', () => {
    expect(marketStatusForBusinessOutcome('Draft')).toBeNull();
    expect(marketStatusForBusinessOutcome('Active')).toBe('Active');
    expect(marketStatusForBusinessOutcome('Sold')).toBe('Closed');
  });
});

describe('no market status fails closed on every public gate', () => {
  it('the public DTO filter drops it', () => {
    const row = (status: string | null) =>
      ({
        listing_id: 'SL-1',
        status,
        idx_display_yn: true,
        internet_entire_listing_display_yn: true,
        internet_address_display_yn: true,
        participant_only: false,
        owner_opt_out: false,
        rls_eligible: false,
      }) as unknown as Parameters<typeof filterDisplayableDbListings>[0][number];

    expect(filterDisplayableDbListings([row('Active')])).toHaveLength(1);
    expect(filterDisplayableDbListings([row(null)])).toHaveLength(0);
  });

  it('the open-house gate refuses it', () => {
    const base = {
      listing_id: 'SL-1',
      rls_eligible: false,
      owner_opt_out: false,
      participant_only: false,
      internet_entire_listing_display_yn: true,
      internet_address_display_yn: true,
    };
    expect(isLocalOpenHousePubliclyEligible({ ...base, status: 'Active' })).toBe(true);
    expect(isLocalOpenHousePubliclyEligible({ ...base, status: null })).toBe(false);
  });

  it('the agent public page puts it in neither the active nor the closed bucket', () => {
    const src = read('app/api/agents/[slug]/listings/route.ts');
    expect(src).toMatch(/l\.status != null && activeStatuses\.includes\(l\.status\)/);
    expect(src).toMatch(/l\.status != null && closedStatuses\.includes\(l\.status\)/);
  });
});

describe('the provider boundary no longer invents a status', () => {
  it('a Cotality record with no StandardStatus maps to null, not "Active"', () => {
    const src = read('lib/idx/trestle-mapper.ts');
    // Comments are stripped: the file documents the old expression by quoting
    // it, and a negative assertion that matches its own explanation is
    // vacuous — it would go red the moment someone described the fix.
    const code = src
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');
    expect(code).not.toMatch(/raw\.StandardStatus \|\| raw\.MlsStatus \|\| "Active"/);
    // Guard the guard: prove the strip left the real assignment behind.
    expect(code).toMatch(/const rawStatus = raw\.StandardStatus \?\? raw\.MlsStatus;/);
  });
});

describe('legacy rows are untouched', () => {
  it('a stored Draft still reads as an unpublished listing', () => {
    // No production backfill is authorized. Rows created before this change
    // keep `Draft`, and the transition table still accepts it as a key.
    const src = read('app/api/crm/listings/[id]/status/route.ts');
    expect(src).toMatch(/Draft: \["Active", "ComingSoon"\]/);
  });

  it('and the CRM detail route still treats an empty/absent status as draft-like', () => {
    const src = read('app/api/crm/listings/[id]/route.ts');
    expect(src).toMatch(/const persistedStatus = listing\.status \|\| "Draft";/);
  });
});
