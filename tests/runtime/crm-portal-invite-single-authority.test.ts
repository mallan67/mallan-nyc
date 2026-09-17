/// <reference types="jest" />
/**
 * REG-3 — ONE AUTHORITY ISSUES A PORTAL INVITE, ONE AUTHORITY ACCEPTS IT.
 *
 * TWO ROUTES WROTE THE SAME THREE Lead.portal_* FIELDS:
 *
 *   POST /api/crm/clients/[id]/invite    what the CRM actually calls (api-client.js:464)
 *   POST /api/auth/invite                no executable caller anywhere - zero occurrences of
 *                                        "auth/invite" in all of public/crm, index-built.html included
 *
 * They were not equivalent, and the differences were the protections:
 *
 *                        canonical CRM route          retired /api/auth/invite
 *   ownership check      yes (:33-35)                 NONE - any agent, any leadId
 *   inactive client      409 refusal (:39-41)         no check
 *   id parsing           safeBigInt + -1 fallback     raw BigInt() - throws to a 500 on bad input
 *   role source          body ?? client ?? roles[0]   body only
 *
 * So the unreferenced route was the permissive one. Deleted rather than delegated to: a second issuer
 * that writes the same fields with fewer checks is not a compatibility layer, it is a bypass.
 *
 * THE ACCEPTANCE ROUTE IS A DIFFERENT AUTHORITY AND STAYS. /api/auth/invite/[token] is what
 * app/portal/accept/page.tsx calls (:26, :54). Issuance and acceptance are not duplicates of each other.
 *
 * TWO DEFECTS THE RETIREMENT CENSUS EXPOSED IN THE SURVIVOR, both corrected here:
 *
 *   1. THE SURVIVING ROUTE EMITTED AN UNCONSUMABLE URL. It returned `/portal/invite?token=...`, and
 *      app/portal/invite DOES NOT EXIST - no page, no rewrite (next.config has only /buy and /rent), and
 *      the ONLY reference to that path in the repository was the line emitting it. The single page that
 *      reads ?token= is /portal/accept. Retiring the duplicate without this would have closed REG-3 with
 *      one issuer whose every link 404s.
 *
 *   2. THE SURVIVING ROUTE ACCEPTED ANY TRUTHY ROLE. The retired route validated against
 *      buyer|tenant|seller|landlord; the canonical one did not. Deleting the duplicate would have
 *      silently dropped a real check, so it is carried across - with the alias the repo already uses.
 *
 * THE renter -> tenant ALIAS IS NOT INVENTED HERE. Lead.roles[] says "renter" while the legacy
 * portal_role vocabulary says "tenant", and the conversion already exists at app/api/auth/me:201,
 * portal/complete-profile:31 and :39, sign-up:145 and lib/auth/middleware:189. Rejecting a
 * roles[0] === "renter" fallback would refuse a client the rest of the system accepts.
 *
 * NOT DECIDED HERE: whether issuance should also SEND the invitation. The retired route emailed; the
 * canonical one returns a URL. That is a product-workflow question, registered separately, and using a
 * retirement packet to settle it would be deciding by side effect.
 */
import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildPrismaMock, makeRequest, readJson } from './helpers';

const ROOT = resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/* eslint-disable @typescript-eslint/no-explicit-any */

const LEAD = {
  id: 7n,
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Buyer',
  portal_role: null as string | null,
  roles: ['buyer'] as string[],
  status: 'active',
  agent_id: 'agent-1',
  portal_token: null,
  portal_token_expires_at: null,
};

let leadRow: Record<string, unknown> | null = { ...LEAD };
let authPrincipal: Record<string, unknown> = { userId: 'agent-1', userType: 'agent', role: 'BROKER' };

const leadFindUnique = jest.fn(async () => leadRow);
const leadUpdate = jest.fn(async (args: { data: Record<string, unknown> }) => ({ ...LEAD, ...args.data }));
const auditCreate = jest.fn(async () => ({ id: 1n }));

const { prisma: prismaMock } = buildPrismaMock({
  lead: { findUnique: leadFindUnique, update: leadUpdate },
  auditEvent: { create: auditCreate },
});
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

// READONLY_MODE defaults ON, which would 403 before any logic under test runs.
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/auth/portal-token', () => ({
  __esModule: true,
  generatePortalToken: () => ({ rawToken: 'RAW-TOKEN', tokenHash: 'HASHED', expiresAt: new Date('2099-01-01') }),
  hashPortalToken: (t: string) => (t === 'RAW-TOKEN' ? 'HASHED' : 'other'),
  isPortalTokenExpired: () => false,
}));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => authPrincipal),
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => undefined),
  hashPassword: jest.fn(async () => 'new-hash'),
  createSession: jest.fn(async () => 'session-token'),
  SESSION_COOKIE: 'session_token',
}));

function reset(lead: Record<string, unknown> | null, principal?: Record<string, unknown>) {
  leadRow = lead;
  authPrincipal = principal ?? { userId: 'agent-1', userType: 'agent', role: 'BROKER' };
  leadUpdate.mockClear();
  auditCreate.mockClear();
}

async function invite(body: Record<string, unknown>, id = '7') {
  jest.resetModules();
  const { POST } = await import('@/app/api/crm/clients/[id]/invite/route');
  const res = await POST(
    makeRequest({ method: 'POST', url: 'http://localhost/api/crm/clients/' + id + '/invite', body }) as never,
    { params: Promise.resolve({ id }) } as never,
  );
  return { res, json: await readJson<any>(res) };
}

/** Did this call write a portal token? */
const wroteToken = () => leadUpdate.mock.calls.some(
  (c) => (c[0] as { data?: Record<string, unknown> })?.data?.portal_token !== undefined);
const writtenData = () => (leadUpdate.mock.calls[0]?.[0] as { data?: Record<string, unknown> })?.data ?? {};

// ═════════════════════════════════════════════════════════════════════════════
// A — the duplicate is gone and nothing calls it
// ═════════════════════════════════════════════════════════════════════════════
describe('A · exactly one issuance authority exists', () => {
  it('the duplicate issuance route file is deleted', () => {
    expect(existsSync(resolve(ROOT, 'app/api/auth/invite/route.ts'))).toBe(false);
  });

  it('the acceptance authority is untouched and still present', () => {
    expect(existsSync(resolve(ROOT, 'app/api/auth/invite/[token]/route.ts'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'app/portal/accept/page.tsx'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'lib/auth/portal-token.ts'))).toBe(true);
  });

  it('no executable code targets POST /api/auth/invite', () => {
    // The acceptance path /api/auth/invite/[token] is a DIFFERENT authority and is expected. What must
    // not exist is a call to the bare issuance path.
    const files = [
      'public/crm/js/core/api-client.js',
      'public/crm/index-built.html',
      'app/portal/accept/page.tsx',
    ];
    for (const f of files) {
      const src = read(f);
      const bare = /["'`]\/api\/auth\/invite["'`]|["'`]\/api\/auth\/invite\?/.test(src);
      expect({ f, callsBareIssuance: bare }).toEqual({ f, callsBareIssuance: false });
    }
  });

  it('the CRM still issues through the canonical route', () => {
    expect(read('public/crm/js/core/api-client.js')).toContain("'/api/crm/clients/' + encodeURIComponent(id) + '/invite'");
    expect(read('public/crm/index-built.html')).toContain("'/api/crm/clients/' + encodeURIComponent(id) + '/invite'");
  });

  it('the acceptance page still calls the acceptance authority', () => {
    expect(read('app/portal/accept/page.tsx')).toContain('/api/auth/invite/');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — the role vocabulary the retired route enforced, carried across
// ═════════════════════════════════════════════════════════════════════════════
describe('B · portal_role is validated against the established vocabulary', () => {
  it.each(['buyer', 'tenant', 'seller', 'landlord'])('%s is accepted', async (role) => {
    reset({ ...LEAD });
    const { res, json } = await invite({ portal_role: role });
    expect(res.status).toBe(200);
    expect(json.portalRole).toBe(role);
    expect(writtenData().portal_role).toBe(role);
  });

  it('roles[0] === "renter" resolves to portal_role "tenant" — the alias the repo already uses', async () => {
    // app/api/auth/me:201, portal/complete-profile:31/:39, sign-up:145, lib/auth/middleware:189 all make
    // this same conversion. Rejecting it would refuse a client every other surface accepts.
    reset({ ...LEAD, portal_role: null, roles: ['renter'] });
    const { res, json } = await invite({});
    expect(res.status).toBe(200);
    expect(json.portalRole).toBe('tenant');
    expect(writtenData().portal_role).toBe('tenant');
  });

  it('an arbitrary truthy role is REFUSED, and nothing is written', async () => {
    reset({ ...LEAD });
    const { res } = await invite({ portal_role: 'administrator' });
    expect(res.status).toBe(400);
    expect({ wroteToken: wroteToken(), updates: leadUpdate.mock.calls.length })
      .toEqual({ wroteToken: false, updates: 0 });
  });

  it('the refusal happens BEFORE token generation — not after, and not silently corrected', async () => {
    reset({ ...LEAD });
    const { json } = await invite({ portal_role: 'vendor' });
    expect(String(json.error)).toMatch(/portal_role|buyer|tenant|seller|landlord/i);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it('a client with no resolvable role is still refused with the existing message', async () => {
    reset({ ...LEAD, portal_role: null, roles: [] });
    const { res } = await invite({});
    expect(res.status).toBe(400);
    expect(wroteToken()).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — the protections that made this the surviving route
// ═════════════════════════════════════════════════════════════════════════════
describe('C · ownership, lifecycle and input handling all still hold', () => {
  it('a BROKER may invite any eligible client', async () => {
    reset({ ...LEAD, agent_id: 'someone-else' }, { userId: 'agent-9', userType: 'agent', role: 'BROKER' });
    const { res } = await invite({ portal_role: 'buyer' });
    expect(res.status).toBe(200);
  });

  it('the assigned agent may invite their own client', async () => {
    reset({ ...LEAD, agent_id: 'agent-2' }, { userId: 'agent-2', userType: 'agent', role: 'AGENT' });
    const { res } = await invite({ portal_role: 'buyer' });
    expect(res.status).toBe(200);
  });

  it('an unassigned agent gets 403 and writes nothing', async () => {
    reset({ ...LEAD, agent_id: 'agent-2' }, { userId: 'agent-3', userType: 'agent', role: 'AGENT' });
    const { res } = await invite({ portal_role: 'buyer' });
    expect(res.status).toBe(403);
    expect(wroteToken()).toBe(false);
  });

  it('an inactive client is refused, with no token write', async () => {
    reset({ ...LEAD, status: 'inactive' });
    const { res } = await invite({ portal_role: 'buyer' });
    expect(res.status).toBe(409);
    expect(wroteToken()).toBe(false);
  });

  it('a malformed id fails closed rather than throwing', async () => {
    reset(null);
    const { res } = await invite({ portal_role: 'buyer' }, 'not-a-number');
    expect(res.status).toBe(404);
    expect(wroteToken()).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// D — the token contract, and the URL that must actually be consumable
// ═════════════════════════════════════════════════════════════════════════════
describe('D · what is written, and where the agent is sent', () => {
  it('the HASH and expiry are stored — never the raw token', async () => {
    reset({ ...LEAD });
    const { json } = await invite({ portal_role: 'buyer' });
    const data = writtenData();
    expect(data.portal_token).toBe('HASHED');
    expect(data.portal_token_expires_at).toBeInstanceOf(Date);
    expect(JSON.stringify(data)).not.toContain('RAW-TOKEN');
    expect(JSON.stringify(json)).not.toContain('"portal_token"');
  });

  it('the returned URL points at the page that actually consumes a token', async () => {
    // It used to be /portal/invite, which does not exist as a page or a rewrite. The one page reading
    // ?token= is /portal/accept.
    reset({ ...LEAD });
    const { json } = await invite({ portal_role: 'buyer' });
    expect(String(json.inviteUrl)).toMatch(/^\/portal\/accept\?token=/);
    expect(String(json.inviteUrl)).toContain('RAW-TOKEN');
  });

  it('the emitted path corresponds to a real page on disk', () => {
    const src = read('app/api/crm/clients/[id]/invite/route.ts');
    const m = src.match(/inviteUrl = `([^?`]+)/);
    expect(m).not.toBeNull();
    const route = String(m![1]).replace(/^\//, '');
    expect({ route, exists: existsSync(resolve(ROOT, 'app', route, 'page.tsx')) })
      .toEqual({ route, exists: true });
  });

  it('the acceptance route recognises the issued token', async () => {
    reset({ ...LEAD, portal_token: 'HASHED', portal_token_expires_at: new Date('2099-01-01') });
    jest.resetModules();
    const { GET } = await import('@/app/api/auth/invite/[token]/route');
    const res = await GET(
      makeRequest({ method: 'GET', url: 'http://localhost/api/auth/invite/RAW-TOKEN' }) as never,
      { params: Promise.resolve({ token: 'RAW-TOKEN' }) } as never,
    );
    const json = await readJson<any>(res);
    expect({ status: res.status, valid: json.valid }).toEqual({ status: 200, valid: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// E — the documented contract matches the code
// ═════════════════════════════════════════════════════════════════════════════
describe('E · current docs name the surviving authorities', () => {
  it('no CURRENT contract still advertises POST /api/auth/invite as the issuer', () => {
    for (const f of ['CONTRACTS/api-contract.v1.md', 'README.md']) {
      const lines = read(f).split(/\r?\n/)
        .filter((l) => /\/api\/auth\/invite(?!\/)/.test(l) && !/\[token\]/.test(l));
      expect({ f, stale: lines }).toEqual({ f, stale: [] });
    }
  });

  it('both surviving authorities are documented', () => {
    const contract = read('CONTRACTS/api-contract.v1.md');
    expect(contract).toContain('/api/crm/clients/[id]/invite');
    expect(contract).toContain('/api/auth/invite/[token]');
  });
});
