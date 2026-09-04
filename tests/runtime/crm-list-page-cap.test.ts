/// <reference types="jest" />
/**
 * PR-CRM.4 (2026-05-24) — Server-side page-size cap on CRM list endpoints.
 *
 * Closes the 2026-05-24 CRM Backbone Audit §8 finding #4: list
 * endpoints accept `limit` from query string with no documented
 * server-side cap. An agent (or compromised session) could request
 * `?limit=99999` and pull the entire CRM lead/client/listing table
 * in a single payload — NY SHIELD Act bulk-extraction concern.
 *
 * The fix is identical across all 3 list endpoints:
 *
 *   const limit = Math.min(
 *     Math.max(parseInt(searchParams.get("limit") || "<DEFAULT>") || <DEFAULT>, 1),
 *     200,
 *   );
 *
 * Properties:
 *   - Default when `limit` is missing or unparseable → <DEFAULT> (per-route)
 *   - `limit=99999`  →  capped to 200
 *   - `limit=0`      →  falls through `|| <DEFAULT>` → clamp [1, 200] → <DEFAULT>
 *   - `limit=-5`     →  Math.max(-5, 1) = 1
 *   - `limit=abc`    →  parseInt NaN → `|| <DEFAULT>` → <DEFAULT>
 *   - `limit=50`     →  pass-through 50
 *
 * Strategy: this is a source-pin test (read each route file and assert
 * the clamp idiom is present) PLUS one runtime-behavior probe per
 * route. The runtime probes mock prisma and assert `take` is called
 * with the expected capped value for representative inputs.
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import { buildPrismaMock, makeRequest, readJson } from './helpers';
import type { NextRequest } from 'next/server';

/**
 * `makeRequest` from helpers returns a plain `Request` cast to NextRequest,
 * which does NOT expose `req.nextUrl` (Next.js-specific property used by
 * these CRM list routes to read searchParams). This local wrapper adds
 * `nextUrl` via a non-enumerable defineProperty so each route can do
 * `req.nextUrl.searchParams.get(...)` as it does in production.
 */
function makeGetRequest(url: string): NextRequest {
  const req = makeRequest({ method: 'GET', url });
  Object.defineProperty(req, 'nextUrl', {
    get() {
      return new URL(url);
    },
    configurable: true,
  });
  return req;
}

const LEADS_PATH = path.resolve(__dirname, '../../app/api/crm/leads/route.ts');
const CLIENTS_PATH = path.resolve(__dirname, '../../app/api/crm/clients/route.ts');
const LISTINGS_PATH = path.resolve(__dirname, '../../app/api/crm/listings/route.ts');
const SCOPE_PATH = path.resolve(__dirname, '../../lib/crm/listings-scope.ts');

// ═══════════════════════════════════════════════════════════════════════
// Source pins — all 3 routes clamp limit to [1, 200] with NaN guard
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.4 — source pins (limit clamp on all 3 list routes)', () => {
  // The canonical idiom is:
  //   Math.min(Math.max(parseInt(searchParams.get("limit") || "<DEFAULT>") || <DEFAULT>, 1), 200)
  // This is a regex that captures any per-route DEFAULT (could be "50",
  // "100", etc.) while pinning the [1, 200] clamp.

  const clampPattern = /Math\.min\(\s*Math\.max\(\s*parseInt\(searchParams\.get\(['"]limit['"]\)\s*\|\|\s*['"](\d+)['"]\)\s*\|\|\s*\d+,\s*1\s*\),\s*200\s*\)/;

  it('leads route clamps limit to [1, 200]', () => {
    const src = readFileSync(LEADS_PATH, 'utf8');
    expect(src).toMatch(clampPattern);
    // Negative pin: ensure the prior unsafe upper bound of 500 is gone.
    expect(src).not.toMatch(/Math\.min\(parseInt\(searchParams\.get\(['"]limit['"]\)\s*\|\|\s*['"]\d+['"]\),\s*500\)/);
  });

  it('clients route clamps limit to [1, 200] (was already correct pre-PR — pinning preserves it)', () => {
    const src = readFileSync(CLIENTS_PATH, 'utf8');
    expect(src).toMatch(clampPattern);
  });

  it('listings route clamps limit to [1, 200] with min-guard + NaN-guard', () => {
    // 2026-09-04: the listings clamp MOVED; it did not weaken. It now lives in
    // `lib/crm/listings-scope.ts` as `resolvePageSize()`, beside the CRM
    // listings population predicate, so both are exercised as functions rather
    // than matched as text. The PR-CRM.4 bulk-extraction guarantee is unchanged
    // and is pinned here in its new home. The route must DELEGATE rather than
    // re-implement, so a second unclamped read cannot reappear beside it.
    const scopeSrc = readFileSync(SCOPE_PATH, 'utf8');

    // The security bound itself, and the [1, MAX_PAGE_SIZE] clamp fed by a
    // NaN/empty-guarded request value.
    expect(scopeSrc).toMatch(/export const MAX_PAGE_SIZE\s*=\s*200\s*;/);
    expect(scopeSrc).toMatch(
      /Math\.min\(\s*Math\.max\(\s*requestedLimit\s*,\s*1\s*\)\s*,\s*MAX_PAGE_SIZE\s*\)/
    );
    expect(scopeSrc).toMatch(/parseInt\(rawLimit\)\s*\|\|\s*DEFAULT_PAGE_SIZE/);

    // The route delegates and never clamps inline.
    const src = readFileSync(LISTINGS_PATH, 'utf8');
    expect(src).toMatch(/resolvePageSize\(/);
    expect(src).not.toMatch(/const\s+limit\s*=\s*Math\.min\(/);

    // Negative pins: neither the prior min-unguarded shape, nor a raised cap.
    expect(src).not.toMatch(/^[^/\n]*const\s+limit\s*=\s*Math\.min\(parseInt\(searchParams\.get\(['"]limit['"]\)\s*\|\|\s*['"]\d+['"]\),\s*200\)\s*;/m);
    expect(scopeSrc).not.toMatch(/MAX_PAGE_SIZE\s*=\s*(?!200\b)\d+/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Runtime behavior — mock prisma + invoke GET, assert `take: <expected>`
// passed to findMany. One probe per route, parameterized over inputs.
// ═══════════════════════════════════════════════════════════════════════

// Shared mocks. Typed as jest.Mock (permissive Parameters<>[] tuple) so
// mock.calls[N][M] can be indexed without TS2493 "tuple of length 0"
// errors from the narrow inferred type of `jest.fn(async () => [])`.
const leadFindMany: jest.Mock = jest.fn(async () => []);
const leadCount: jest.Mock = jest.fn(async () => 0);
const listingFindMany: jest.Mock = jest.fn(async () => []);
const listingCount: jest.Mock = jest.fn(async () => 0);

const { prisma: prismaMock } = buildPrismaMock({
  lead: { findMany: leadFindMany, count: leadCount },
  listing: { findMany: listingFindMany, count: listingCount },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

// Auth + helpers.
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => ({
    userId: 'agent-1',
    userType: 'agent',
    role: 'BROKER', // broker so we don't filter out by agent_id in test fixtures
  })),
  isAuthError: () => false,
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));
// clients route uses findClients() helper — mock it so we can read the
// limit it received without standing up the full ownership-filter path.
const findClientsMock: jest.Mock = jest.fn(async () => ({ clients: [], total: 0 }));
jest.mock('@/lib/db/clients', () => ({
  __esModule: true,
  findClients: findClientsMock,
  clientEmailExists: jest.fn(async () => false),
  createClient: jest.fn(async () => ({ id: 1n })),
}));

import { GET as leadsGET } from '@/app/api/crm/leads/route';
import { GET as clientsGET } from '@/app/api/crm/clients/route';
import { GET as listingsGET } from '@/app/api/crm/listings/route';

function clearAll() {
  leadFindMany.mockClear();
  leadCount.mockClear();
  listingFindMany.mockClear();
  listingCount.mockClear();
  findClientsMock.mockClear();
}

describe('PR-CRM.4 — leads GET enforces the [1, 200] cap at runtime', () => {
  beforeEach(() => clearAll());

  it('?limit=99999 is capped to 200', async () => {
    const req = makeGetRequest('http://localhost/api/crm/leads?limit=99999&all=true');
    const res = await leadsGET(req);
    expect(res.status).toBe(200);
    expect(leadFindMany).toHaveBeenCalledTimes(1);
    const firstArg = leadFindMany.mock.calls[0][0] as { take: number };
    expect(firstArg.take).toBe(200);
  });

  it('?limit=50 passes through unchanged', async () => {
    const req = makeGetRequest('http://localhost/api/crm/leads?limit=50&all=true');
    await leadsGET(req);
    const firstArg = leadFindMany.mock.calls[0][0] as { take: number };
    expect(firstArg.take).toBe(50);
  });

  it('?limit=0 falls back to safe default (not 0, not NaN)', async () => {
    const req = makeGetRequest('http://localhost/api/crm/leads?limit=0&all=true');
    await leadsGET(req);
    const firstArg = leadFindMany.mock.calls[0][0] as { take: number };
    expect(firstArg.take).toBe(100); // route default for leads
    expect(Number.isFinite(firstArg.take)).toBe(true);
    expect(firstArg.take).toBeGreaterThanOrEqual(1);
  });

  it('?limit=abc (unparseable) falls back to safe default', async () => {
    const req = makeGetRequest('http://localhost/api/crm/leads?limit=abc&all=true');
    await leadsGET(req);
    const firstArg = leadFindMany.mock.calls[0][0] as { take: number };
    expect(firstArg.take).toBe(100);
    expect(Number.isNaN(firstArg.take)).toBe(false);
  });

  it('?limit=-5 clamps to 1 (Math.max guard)', async () => {
    const req = makeGetRequest('http://localhost/api/crm/leads?limit=-5&all=true');
    await leadsGET(req);
    const firstArg = leadFindMany.mock.calls[0][0] as { take: number };
    // -5 parses to -5, then `-5 || 100` = -5 (negative is truthy), then
    // Math.max(-5, 1) = 1, then Math.min(1, 200) = 1. Verify.
    expect(firstArg.take).toBe(1);
  });
});

describe('PR-CRM.4 — clients GET enforces the [1, 200] cap at runtime', () => {
  beforeEach(() => clearAll());

  it('?limit=99999 is capped to 200', async () => {
    const req = makeGetRequest('http://localhost/api/crm/clients?limit=99999');
    await clientsGET(req);
    expect(findClientsMock).toHaveBeenCalledTimes(1);
    const firstArg = findClientsMock.mock.calls[0][0] as { limit: number };
    expect(firstArg.limit).toBe(200);
  });

  it('?limit=50 passes through unchanged', async () => {
    const req = makeGetRequest('http://localhost/api/crm/clients?limit=50');
    await clientsGET(req);
    const firstArg = findClientsMock.mock.calls[0][0] as { limit: number };
    expect(firstArg.limit).toBe(50);
  });

  it('?limit=0 / invalid falls back to safe default', async () => {
    const req = makeGetRequest('http://localhost/api/crm/clients?limit=0');
    await clientsGET(req);
    const firstArg = findClientsMock.mock.calls[0][0] as { limit: number };
    expect(firstArg.limit).toBe(50); // route default for clients
  });
});

describe('PR-CRM.4 — listings GET enforces the [1, 200] cap at runtime', () => {
  beforeEach(() => clearAll());

  it('?limit=99999 is capped to 200', async () => {
    const req = makeGetRequest('http://localhost/api/crm/listings?limit=99999');
    await listingsGET(req);
    expect(listingFindMany).toHaveBeenCalledTimes(1);
    const firstArg = listingFindMany.mock.calls[0][0] as { take: number };
    expect(firstArg.take).toBe(200);
  });

  it('?limit=50 passes through unchanged', async () => {
    const req = makeGetRequest('http://localhost/api/crm/listings?limit=50');
    await listingsGET(req);
    const firstArg = listingFindMany.mock.calls[0][0] as { take: number };
    expect(firstArg.take).toBe(50);
  });

  it('?limit=abc falls back to safe default + does not pass NaN to Prisma', async () => {
    const req = makeGetRequest('http://localhost/api/crm/listings?limit=abc');
    await listingsGET(req);
    const firstArg = listingFindMany.mock.calls[0][0] as { take: number };
    expect(firstArg.take).toBe(50);
    expect(Number.isNaN(firstArg.take)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Existing behavior preserved — auth + filter params still work
// ═══════════════════════════════════════════════════════════════════════
describe('PR-CRM.4 — pre-existing behavior is preserved', () => {
  beforeEach(() => clearAll());

  it('leads route still honors ?status and ?source filters', async () => {
    const req = makeGetRequest('http://localhost/api/crm/leads?status=new&source=website&all=true&limit=50');
    await leadsGET(req);
    const firstArg = leadFindMany.mock.calls[0][0] as unknown as { where: Record<string, unknown> };
    expect(firstArg.where.status).toBe('new');
    expect(firstArg.where.source).toBe('website');
  });

  it('listings route still honors ?type and ?status filters', async () => {
    const req = makeGetRequest('http://localhost/api/crm/listings?type=sale&status=Active&limit=50');
    await listingsGET(req);
    const firstArg = listingFindMany.mock.calls[0][0] as unknown as { where: Record<string, unknown> };
    expect(firstArg.where.listing_type).toBe('sale');
    expect(firstArg.where.status).toBe('Active');
  });
});
