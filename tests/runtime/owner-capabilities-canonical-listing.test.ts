/// <reference types="jest" />
/**
 * A SELLER OR LANDLORD REACHES EXACTLY ONE LISTING: THE ONE THEY OWN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CANONICAL RELATION
 *
 * `Listing.owner_client_id` is the only Seller/Landlord relation. It is a real
 * FK, it is what `canAccessOwnerListing` enforces, and it is what
 * `resolveOwnerListing` queries.
 *
 * `Lead.active_sale_listing_id` / `active_rental_listing_id` are plain nullable
 * String columns holding a `listing_id` TEXT value — no FK, no unique
 * constraint, no index. They are a HINT about which owned listing is the
 * current one. They are not, and were never, an authorization boundary.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE FOUND
 *
 * Most owner-facing routes already gate on `canAccessOwnerListing`. Three did
 * not:
 *
 *   1. POST /api/portal/seller/signals   — `payload.listing_id || lead.active_sale_listing_id`
 *   2. POST /api/portal/landlord/signals — `payload.listing_id || lead.active_rental_listing_id`
 *
 *      The first term is CALLER-SUPPLIED and was never checked. An owner could
 *      attach their pricing feedback, valuation request and readiness signals to
 *      ANY listing id — another owner's, or a Cotality-sourced row — and those
 *      records are durable: they land in `PortalEvent`, which is Mallan's own
 *      activity/audit history and what the agent's CRM signal panels read.
 *      A false attribution in the audit trail is not a display bug.
 *
 *   3. GET /api/portal/landlord/relist   — `findFirst({ where: { listing_id: lead.active_rental_listing_id } })`
 *
 *      Read a listing's market status straight off the hint with NO ownership
 *      clause, so a stale or foreign hint returned another listing's status.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE INVARIANT THAT MUST NOT MOVE
 *
 * Owner portal users do not mutate regulated canonical listing facts. Durable
 * owner requests belong in CRM/audit history, and authorized staff applies the
 * canonical change. The sweep at the bottom pins that: NO route under
 * `app/api/portal/**` may write to the `listing` model.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const OWNER_LEAD_ID = BigInt(31);
const OTHER_LEAD_ID = BigInt(99);

/** The listings the authenticated owner actually owns. Swapped per test. */
let ownedListings: Array<Record<string, unknown>> = [];
/** What `Lead.active_*_listing_id` claims. Advisory only. */
let leadRow: Record<string, unknown> | null = null;

const { prisma: basePrisma, calls } = buildPrismaMock({
  listing: {
    // Honours the `owner_client_id` WHERE against a universe that INCLUDES a
    // foreign listing. If a caller ever drops that clause, the foreign row
    // enters the candidate set and these tests go red — which a mock that
    // simply returned `ownedListings` could never detect.
    findMany: jest.fn(async (args: { where?: Record<string, unknown> }) => {
      const universe = [...ownedListings, FOREIGN_LISTING];
      const wantOwner = args?.where?.owner_client_id;
      const wantType = args?.where?.listing_type;
      return universe.filter(
        (row) =>
          (wantOwner === undefined || row.owner_client_id === wantOwner) &&
          (wantType === undefined || row.listing_type === wantType),
      );
    }),
    // The pre-fix relist route resolved by listing_id ALONE. Answering it
    // faithfully — with a listing the caller does not own — is what makes the
    // failing assertion meaningful rather than incidental.
    findFirst: jest.fn(async (args: { where?: Record<string, unknown> }) => {
      const wanted = args?.where?.listing_id;
      return FOREIGN_LISTING.listing_id === wanted ? FOREIGN_LISTING : null;
    }),
  },
  lead: {
    findUnique: jest.fn(async () => leadRow),
  },
  portalEvent: {
    // The default mock `create` echoes its ARGUMENT, so the row has no `id` and
    // the route throws on `event.id.toString()` before any assertion is reached.
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      createdEvents.push(args.data);
      return { ...args.data, id: BigInt(createdEvents.length), created_at: new Date() };
    }),
  },
});

/** Every PortalEvent row the last request actually wrote. */
const createdEvents: Array<Record<string, unknown>> = [];

const FOREIGN_LISTING = {
  id: BigInt(777),
  listing_id: 'RL-7777',
  listing_type: 'rent',
  owner_client_id: OTHER_LEAD_ID,
  status: 'Active',
  modification_timestamp: new Date('2026-08-01'),
};

const OWNED_RENTAL = {
  id: BigInt(11),
  listing_id: 'RL-0011',
  listing_type: 'rent',
  owner_client_id: OWNER_LEAD_ID,
  status: 'ComingSoon',
  modification_timestamp: new Date('2026-08-20'),
};

const OWNED_SALE = {
  id: BigInt(12),
  listing_id: 'SL-0012',
  listing_type: 'sale',
  owner_client_id: OWNER_LEAD_ID,
  status: null,
  modification_timestamp: new Date('2026-08-20'),
};

/**
 * These routes call the ARRAY form of `$transaction` (a batch of creates), which
 * the shared mock does not model — it only runs a callback. Without this the
 * batch resolves to null and the route throws before any assertion is reached.
 */
const prismaMock: Record<string, unknown> = new Proxy(
  basePrisma as unknown as Record<string, unknown>,
  {
    get(target, prop: string) {
      if (prop === '$transaction') {
        return async (arg: unknown) =>
          Array.isArray(arg)
            ? Promise.all(arg)
            : typeof arg === 'function'
              ? (arg as (tx: unknown) => unknown)(prismaMock)
              : null;
      }
      return (target as Record<string, unknown>)[prop];
    },
  },
);

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requirePortalRole: jest.fn(async () => ({
    userId: OWNER_LEAD_ID,
    userType: 'lead',
    portalRole: 'landlord',
  })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));

import { POST as SELLER_SIGNALS } from '@/app/api/portal/seller/signals/route';
import { POST as LANDLORD_SIGNALS } from '@/app/api/portal/landlord/signals/route';
import { GET as LANDLORD_RELIST } from '@/app/api/portal/landlord/relist/route';

const REPO = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

/** Every `listing_id` written into PortalEvent by the last request. */
function recordedEventListingIds(): unknown[] {
  return createdEvents.map((data) => data.listing_id);
}

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
  createdEvents.length = 0;
  ownedListings = [];
  leadRow = null;
});

describe('seller signals attach only to a listing the seller owns', () => {
  const post = (body: Record<string, unknown>) =>
    SELLER_SIGNALS(makeRequest({ method: 'POST', body }));

  it('a listing_id the caller does NOT own is refused, and nothing is written', async () => {
    leadRow = { id: OWNER_LEAD_ID, active_sale_listing_id: null };
    ownedListings = [OWNED_SALE];

    const res = await post({ estimated_value: 1500000, listing_id: FOREIGN_LISTING.listing_id });

    expect(res.status).toBe(403);
    const json = await readJson<{ code?: string }>(res);
    expect(json.code).toBe('LISTING_NOT_OWNED');
    expect(createdEvents).toEqual([]);
  });

  it('a listing_id the caller DOES own is recorded', async () => {
    leadRow = { id: OWNER_LEAD_ID, active_sale_listing_id: null };
    ownedListings = [OWNED_SALE];

    const res = await post({ estimated_value: 1500000, listing_id: OWNED_SALE.listing_id });

    expect(res.status).toBeLessThan(400);
    const ids = recordedEventListingIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids)).toEqual(new Set([OWNED_SALE.listing_id]));
  });

  it('with no listing_id supplied it falls back to the owned listing, not the raw hint', async () => {
    // The hint names a listing this lead does not own. Honouring it would put a
    // foreign listing id into Mallan's audit history.
    leadRow = { id: OWNER_LEAD_ID, active_sale_listing_id: FOREIGN_LISTING.listing_id };
    ownedListings = [OWNED_SALE];

    const res = await post({ estimated_value: 1500000 });

    expect(res.status).toBeLessThan(400);
    expect(new Set(recordedEventListingIds())).toEqual(new Set([OWNED_SALE.listing_id]));
  });

  it('an owner who owns nothing records a signal with no listing attribution', async () => {
    // A seller planning a sale before the listing exists is legitimate. What is
    // not legitimate is inventing an attribution for it.
    leadRow = { id: OWNER_LEAD_ID, active_sale_listing_id: FOREIGN_LISTING.listing_id };
    ownedListings = [];

    const res = await post({ estimated_value: 1500000 });

    expect(res.status).toBeLessThan(400);
    expect(new Set(recordedEventListingIds())).toEqual(new Set([null]));
  });
});

describe('landlord signals attach only to a listing the landlord owns', () => {
  const post = (body: Record<string, unknown>) =>
    LANDLORD_SIGNALS(makeRequest({ method: 'POST', body }));

  it('a listing_id the caller does NOT own is refused, and nothing is written', async () => {
    leadRow = { id: OWNER_LEAD_ID, active_rental_listing_id: null, lease_end_date: null, rent_per_month: null };
    ownedListings = [OWNED_RENTAL];

    const res = await post({ monthly_rent: 4200, listing_id: FOREIGN_LISTING.listing_id });

    expect(res.status).toBe(403);
    const json = await readJson<{ code?: string }>(res);
    expect(json.code).toBe('LISTING_NOT_OWNED');
    expect(createdEvents).toEqual([]);
  });

  it('a listing_id the caller DOES own is recorded', async () => {
    leadRow = { id: OWNER_LEAD_ID, active_rental_listing_id: null, lease_end_date: null, rent_per_month: null };
    ownedListings = [OWNED_RENTAL];

    const res = await post({ monthly_rent: 4200, listing_id: OWNED_RENTAL.listing_id });

    expect(res.status).toBeLessThan(400);
    expect(new Set(recordedEventListingIds())).toEqual(new Set([OWNED_RENTAL.listing_id]));
  });
});

describe('relist timing reads the OWNED listing, never the raw hint', () => {
  it('a hint pointing at someone else’s listing does not leak its market status', async () => {
    leadRow = {
      id: OWNER_LEAD_ID,
      relist_reminder_date: null,
      lease_end_date: null,
      vacancy_risk: null,
      active_rental_listing_id: FOREIGN_LISTING.listing_id,
    };
    ownedListings = []; // owns nothing

    const res = await LANDLORD_RELIST(makeRequest({ method: 'GET' }));
    const json = await readJson<{ listing_status: string | null }>(res);

    // FOREIGN_LISTING.status is 'Active'. Reading it here would be the leak.
    expect(json.listing_status).toBeNull();
  });

  it('an owned listing’s status IS returned, including when it has none yet', async () => {
    leadRow = {
      id: OWNER_LEAD_ID,
      relist_reminder_date: null,
      lease_end_date: null,
      vacancy_risk: null,
      active_rental_listing_id: OWNED_RENTAL.listing_id,
    };
    ownedListings = [OWNED_RENTAL];

    const res = await LANDLORD_RELIST(makeRequest({ method: 'GET' }));
    const json = await readJson<{ listing_status: string | null }>(res);
    expect(json.listing_status).toBe('ComingSoon');
  });
});

describe('owners never mutate canonical listing facts', () => {
  it('no route under app/api/portal writes to the listing model', () => {
    // "Owner portal users do not directly mutate regulated canonical listing
    // facts merely for convenience. Durable owner requests/actions belong in
    // Mallan CRM/audit history and authorized staff applies the canonical
    // change." This is that rule, enforced rather than trusted.
    const routes: string[] = [];
    const walk = (rel: string) => {
      const abs = resolve(REPO, rel);
      if (statSync(abs).isDirectory()) {
        for (const entry of readdirSync(abs)) walk(`${rel}/${entry}`);
        return;
      }
      if (rel.endsWith('route.ts')) routes.push(rel);
    };
    walk('app/api/portal');

    // Guard the guard: a walk that found nothing would make this vacuous.
    expect(routes.length).toBeGreaterThan(30);

    const WRITES = /\b(?:prisma|tx)\.listing\.(?:create|update|updateMany|upsert|delete|deleteMany)\b/;
    const offenders = routes.filter((rel) => WRITES.test(read(rel)));
    expect(offenders).toEqual([]);
  });

  it('every by-listingId owner route runs the ownership gate', () => {
    // These take a listing id from the query string, so the gate is the ONLY
    // thing between a lead and another owner's private data.
    for (const rel of [
      'app/api/portal/marketing/route.ts',
      'app/api/portal/price-history/route.ts',
      'app/api/portal/comparables/route.ts',
      'app/api/portal/listings/[id]/comments/route.ts',
    ]) {
      expect(read(rel)).toMatch(/canAccessOwnerListing\(/);
    }
  });

  it('the collection routes scope by owner_client_id in the WHERE, not after the fact', () => {
    // A post-filter can be dropped in a refactor and nothing fails; a WHERE
    // clause cannot return the row at all.
    for (const rel of [
      'app/api/portal/showings/route.ts',
      'app/api/portal/offers/route.ts',
    ]) {
      expect(read(rel)).toMatch(/owner_client_id: auth\.userId/);
    }
  });
});
