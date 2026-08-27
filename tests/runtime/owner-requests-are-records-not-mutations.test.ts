/// <reference types="jest" />
/**
 * AN OWNER ASKS. STAFF CHANGES THE LISTING.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE THIS IMPLEMENTS
 *
 * "Owner portal users do not directly mutate regulated canonical listing facts
 * merely for convenience. Durable owner requests/actions belong in Mallan
 * CRM/audit history and authorized staff applies the canonical change."
 *
 * Three owner capabilities had no route at all, so the only way a seller or
 * landlord could raise them was outside the system — a phone call or an email,
 * with no record against the listing:
 *
 *   - CORRECTION REQUEST      "the square footage is wrong"
 *   - MARKETING APPROVAL      "yes, run the open house" / "no, not that photo"
 *   - SHOWING COORDINATION    "I can do Tuesday after 4, use the lockbox"
 *
 * None of them is a listing edit. Each is a REQUEST, recorded against the
 * listing the owner actually owns, visible to the agent in CRM activity and in
 * the audit trail, and actioned by authorized staff through the CRM — where the
 * compliance gates already live.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A LISTING IS REQUIRED HERE, UNLIKE SIGNALS
 *
 * A seller may record planning signals before a listing exists — valuation,
 * timeline, readiness are about a sale, not about a listing. A correction
 * request is about a specific listing fact; without a listing there is nothing
 * to correct. So this route requires an OWNED listing and refuses otherwise,
 * rather than recording an unattached request nobody can action.
 */
import { buildPrismaMock, makeRequest, readJson } from './helpers';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OWNER_LEAD_ID = BigInt(31);

let ownedListings: Array<Record<string, unknown>> = [];
const createdEvents: Array<Record<string, unknown>> = [];
const auditEvents: Array<{ action: string; changes: Record<string, unknown> }> = [];

const { prisma: prismaMock, calls } = buildPrismaMock({
  listing: {
    // Same fidelity requirement as owner-capabilities: the universe contains a
    // listing this lead does NOT own, so dropping the ownership WHERE would
    // surface it and turn these tests red.
    findMany: jest.fn(async (args: { where?: Record<string, unknown> }) => {
      const universe = [...ownedListings, FOREIGN_LISTING];
      const wantOwner = args?.where?.owner_client_id;
      return universe.filter(
        (row) => wantOwner === undefined || row.owner_client_id === wantOwner,
      );
    }),
  },
  lead: {
    findUnique: jest.fn(async () => ({ id: OWNER_LEAD_ID, agent_id: BigInt(3) })),
  },
  portalEvent: {
    create: jest.fn(async (args: { data: Record<string, unknown> }) => {
      createdEvents.push(args.data);
      return { ...args.data, id: BigInt(createdEvents.length), created_at: new Date() };
    }),
  },
});

const FOREIGN_LISTING = {
  id: BigInt(777),
  listing_id: 'SL-9999',
  listing_type: 'sale',
  owner_client_id: BigInt(99),
  modification_timestamp: new Date('2026-08-01'),
};

const OWNED_SALE = {
  id: BigInt(12),
  listing_id: 'SL-0012',
  listing_type: 'sale',
  owner_client_id: OWNER_LEAD_ID,
  modification_timestamp: new Date('2026-08-20'),
};

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requirePortalRole: jest.fn(async () => ({
    userId: OWNER_LEAD_ID,
    userType: 'lead',
    portalRole: 'seller',
  })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(
    async (
      action: string,
      _entityType: string,
      _entityId: string,
      _auth: unknown,
      changes: Record<string, unknown>,
    ) => {
      auditEvents.push({ action, changes });
    },
  ),
}));

import { POST as OWNER_REQUEST } from '@/app/api/portal/owner-requests/route';

const REPO = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

const post = (body: Record<string, unknown>) =>
  OWNER_REQUEST(makeRequest({ method: 'POST', body }));

beforeEach(() => {
  for (const key of Object.keys(calls)) delete calls[key];
  createdEvents.length = 0;
  auditEvents.length = 0;
  ownedListings = [OWNED_SALE];
});

describe('each owner request is recorded against the owned listing', () => {
  it.each([
    ['correction', 'owner_correction_request'],
    ['marketing_approval', 'owner_marketing_approval'],
    ['showing_coordination', 'owner_showing_coordination'],
  ])('%s is recorded as %s', async (kind, eventType) => {
    const res = await post({
      kind,
      listing_id: OWNED_SALE.listing_id,
      message: 'The square footage is 1,240 not 1,420.',
    });

    expect(res.status).toBe(201);
    expect(createdEvents).toHaveLength(1);
    expect(createdEvents[0].event_type).toBe(eventType);
    expect(createdEvents[0].listing_id).toBe(OWNED_SALE.listing_id);
    expect(createdEvents[0].lead_id).toBe(OWNER_LEAD_ID);
  });

  it('the agent sees it in the audit trail, with the listing it is about', async () => {
    await post({
      kind: 'correction',
      listing_id: OWNED_SALE.listing_id,
      message: 'The square footage is wrong.',
    });

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0].action).toBe('owner_request');
    expect(auditEvents[0].changes.listing_id).toBe(OWNED_SALE.listing_id);
    expect(auditEvents[0].changes.kind).toBe('correction');
  });

  it('a marketing approval records the DECISION, not a listing change', async () => {
    await post({
      kind: 'marketing_approval',
      listing_id: OWNED_SALE.listing_id,
      decision: 'declined',
      message: 'Please do not use the kitchen photo.',
    });

    expect(createdEvents[0].metadata).toMatchObject({ decision: 'declined' });
    // The point of the whole route: no canonical listing fact moved.
    expect(calls['listing.update']).toBeUndefined();
    expect(calls['listing.create']).toBeUndefined();
  });

  it('an unrecognised decision is refused rather than stored as free text', async () => {
    const res = await post({
      kind: 'marketing_approval',
      listing_id: OWNED_SALE.listing_id,
      decision: 'maybe later',
    });
    expect(res.status).toBe(400);
    expect(createdEvents).toEqual([]);
  });
});

describe('the ownership boundary', () => {
  it('a listing the caller does not own is refused, and nothing is written', async () => {
    const res = await post({
      kind: 'correction',
      listing_id: 'SL-9999',
      message: 'Change the price.',
    });

    expect(res.status).toBe(403);
    const json = await readJson<{ code?: string }>(res);
    expect(json.code).toBe('LISTING_NOT_OWNED');
    expect(createdEvents).toEqual([]);
    expect(auditEvents).toEqual([]);
  });

  it('an owner with no listings gets the same refusal as a foreign listing', async () => {
    // Deliberately NOT a distinguishable "you have no listings" response: that
    // would tell a caller whether SL-0012 exists, which is exactly what the
    // 403 is protecting. Unlike planning signals, these requests are ABOUT a
    // listing, so there is nothing to record either way.
    ownedListings = [];
    const res = await post({
      kind: 'correction',
      listing_id: OWNED_SALE.listing_id,
      message: 'Something is wrong.',
    });
    expect(res.status).toBe(403);
    expect(createdEvents).toEqual([]);
  });

  it('a missing listing_id does not silently pick one', async () => {
    // Guessing which listing a correction is about would attach the request to
    // the wrong one whenever an owner has several.
    const res = await post({ kind: 'correction', message: 'Something is wrong.' });
    expect(res.status).toBe(400);
    expect(createdEvents).toEqual([]);
  });
});

describe('input the record must not accept', () => {
  it('an unknown request kind is refused', async () => {
    const res = await post({
      kind: 'change_price',
      listing_id: OWNED_SALE.listing_id,
      message: 'Drop it to 1.2M',
    });
    expect(res.status).toBe(400);
    expect(createdEvents).toEqual([]);
  });

  it('an empty request is refused', async () => {
    const res = await post({ kind: 'correction', listing_id: OWNED_SALE.listing_id, message: '  ' });
    expect(res.status).toBe(400);
    expect(createdEvents).toEqual([]);
  });

  it('the message is length-capped rather than stored unbounded', async () => {
    const res = await post({
      kind: 'correction',
      listing_id: OWNED_SALE.listing_id,
      message: 'x'.repeat(10000),
    });
    expect(res.status).toBe(400);
    expect(createdEvents).toEqual([]);
  });
});

describe('the route cannot become a listing editor', () => {
  it('it never writes to the listing model', () => {
    const src = read('app/api/portal/owner-requests/route.ts');
    expect(src).not.toMatch(/prisma\.listing\.(create|update|updateMany|upsert|delete)/);
  });

  it('it authorizes through the canonical owner relation, not the Lead hint', () => {
    const src = read('app/api/portal/owner-requests/route.ts');
    expect(src).toMatch(/resolveOwnedListingId\(/);
    expect(src).not.toMatch(/active_(sale|rental)_listing_id/);
  });
});
