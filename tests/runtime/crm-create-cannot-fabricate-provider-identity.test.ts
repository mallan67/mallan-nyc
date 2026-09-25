/// <reference types="jest" />
/**
 * A CRM CREATE MAY NOT MINT A PROVIDER IDENTIFIER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT
 *
 * `POST /api/crm/listings` wrote the caller's own value straight into the
 * provider-identity column:
 *
 *     mls_id: (normalized.mls_id as string) ?? null,
 *
 * `mls_id` is a COTALITY fact. It is issued by the provider and arrives through
 * the feed. Mallan cannot assert one — that is the authority split this whole
 * architecture rests on. Nothing in the CRM sends it either: neither intake form
 * has an `mls_id` field (the `saleListTeamMlsId` / `rentalListTeamMlsId` inputs
 * are ListTeamKey, a different field), so no legitimate caller loses anything by
 * this being refused.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT MATTERS BEYOND PROVENANCE
 *
 * `mls_id === null` is the repo's shorthand for "Mallan authored this", and it
 * is load-bearing in at least four places:
 *
 *   - the owner-required publication guard
 *     (app/api/crm/listings/[id]/status/route.ts) is scoped to
 *     `listing.mls_id === null`, so a fabricated mls_id lets an ownerless
 *     listing go Active — it walks straight past the guard added in a2620927
 *   - `const isCrmCreated = !listing.mls_id` decides whether RLS enforcement and
 *     content scanning run
 *   - the CRM list query splits `crmCreated` from `trestleClosed` on it
 *   - source classification reports the row's provenance from it
 *
 * So one unvalidated body field lets a caller choose which side of four
 * different boundaries their listing lands on. This test pins the create, and it
 * pins the guard it was bypassing.
 */
process.env.READONLY_MODE = 'false';

const mockValidateSession = jest.fn();
const mockLeadFindUnique = jest.fn();
const mockAgentFindUnique = jest.fn();
const mockTransaction = jest.fn();
const mockListingCreate = jest.fn();
const mockListingFindFirst = jest.fn();
const mockListingCount = jest.fn();

jest.mock('@/lib/prisma', () => {
  const listing = {
    create: (a: unknown) => mockListingCreate(a),
    findFirst: (a: unknown) => mockListingFindFirst(a),
    findUnique: jest.fn().mockResolvedValue(null),
    count: (a: unknown) => mockListingCount(a),
  };
  const client = {
    listing,
    lead: { findUnique: (a: unknown) => mockLeadFindUnique(a) },
    agent: { findUnique: (a: unknown) => mockAgentFindUnique(a) },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: (fn: unknown) => mockTransaction(fn),
    // The listing_id sequence is allocated with a raw query.
    $queryRaw: jest.fn().mockResolvedValue([{ max_seq: 0 }]),
  };
  return { __esModule: true, default: client };
});

import { NextRequest } from 'next/server';

const AGENT_ID = 3n;

function body(extra: Record<string, unknown> = {}) {
  return {
    listing_type: 'sale',
    list_price: 1250000,
    // Website-only Mallan exclusive: skips the RLS field validator so this test
    // isolates the provider-identity guard instead of tripping over unrelated
    // required-field errors.
    rls_eligible: false,
    address: {
      StreetNumber: '333',
      StreetName: 'East 46th Street',
      City: 'New York',
      StateOrProvince: 'NY',
      PostalCode: '10017',
    },
    ...extra,
  };
}

async function post(payload: Record<string, unknown>) {
  const { POST } = await import('@/app/api/crm/listings/route');
  const req = new NextRequest('https://x.test/api/crm/listings', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
  req.cookies.set('session_token', 'tok');
  return POST(req);
}

beforeEach(() => {
  jest.resetModules();
  for (const m of [
    mockValidateSession,
    mockLeadFindUnique,
    mockAgentFindUnique,
    mockTransaction,
    mockListingCreate,
    mockListingFindFirst,
    mockListingCount,
  ]) {
    m.mockReset();
  }
  mockValidateSession.mockResolvedValue({
    userId: AGENT_ID,
    userType: 'agent',
    role: 'BROKER',
    sessionId: 's',
  });
  mockListingFindFirst.mockResolvedValue(null);
  mockListingCount.mockResolvedValue(0);
  mockAgentFindUnique.mockResolvedValue({ id: AGENT_ID, full_name: 'A Agent' });
  mockListingCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: 7n,
    ...args.data,
  }));
  // Run the transaction body against the same mocked client.
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const prisma = (await import('@/lib/prisma')).default;
    return fn(prisma);
  });
});

jest.mock('@/lib/auth/session', () => {
  const actual = jest.requireActual('@/lib/auth/session');
  return {
    __esModule: true,
    ...actual,
    validateSession: (t: string) => mockValidateSession(t),
  };
});

describe('the premise: no CRM form sends mls_id', () => {
  it('neither intake form declares an mls_id field', () => {
    const { readFileSync } = require('fs') as typeof import('fs');
    const { resolve } = require('path') as typeof import('path');
    const REPO = resolve(__dirname, '../..');
    for (const form of ['SALE-FORM-REDESIGN.html', 'RENTAL-FORM-REDESIGN.html']) {
      const src = readFileSync(resolve(REPO, 'public/crm', form), 'utf8');
      // An id or name of exactly `mls_id` would be swept into the POST body by
      // the forms' generic field collector.
      expect(src).not.toMatch(/(id|name)=["']mls_id["']/i);
    }
  });
});

describe('POST /api/crm/listings refuses a caller-supplied mls_id', () => {
  it('is rejected rather than silently dropped', async () => {
    // Silently nulling it would hide a client bug and leave the caller believing
    // the value took effect.
    const res = await post(body({ mls_id: 'RLS20093870' }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe('PROVIDER_IDENTITY_NOT_ASSIGNABLE');
  });

  it('nothing is written when it is refused', async () => {
    await post(body({ mls_id: 'RLS20093870' }));
    expect(mockListingCreate).not.toHaveBeenCalled();
  });

  it('an empty or null mls_id is not treated as an attempt', async () => {
    // A client that sends the key with no value has asserted nothing.
    for (const value of [null, '', '   ']) {
      mockListingCreate.mockClear();
      const res = await post(body({ mls_id: value }));
      expect(res.status).not.toBe(422);
    }
  });

  it('a create WITHOUT mls_id is never refused by this guard', async () => {
    // Scoped deliberately: this asserts the guard does not fire, not that the
    // whole create succeeds. The full create path is covered by its own suites,
    // and re-simulating it here would test the mock rather than the guard.
    const res = await post(body());
    const json = await res.json().catch(() => ({}));
    expect(json.code).not.toBe('PROVIDER_IDENTITY_NOT_ASSIGNABLE');
  });

  it('the refusal happens BEFORE any database work', async () => {
    // The guard must not depend on a transaction, a sequence allocation, or a
    // validator having run first — otherwise a failure earlier in the pipeline
    // would mask it.
    await post(body({ mls_id: 'RLS20093870' }));
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockListingCreate).not.toHaveBeenCalled();
  });
});
