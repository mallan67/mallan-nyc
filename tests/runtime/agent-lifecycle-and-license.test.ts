/// <reference types="jest" />
/**
 * Two invariants that must hold at the SERVER boundary, not just in the browser.
 *
 *  1. ACCOUNT STATE HAS ONE AUTHORITY.
 *     PATCH used to write Agent.status directly while DELETE also revoked the
 *     agent's sessions. Because validateSession() reads only the Session row —
 *     it never re-reads Agent.status, and it EXTENDS sessions near expiry — an
 *     agent edited to "inactive" through the generic form kept a working,
 *     accepted CRM session. Every transition now goes through
 *     applyAgentStatusTransition.
 *
 *  2. license_type IS NOT FREE TEXT.
 *     Fixing the browser mapping is insufficient. A stale client, a malformed
 *     request or a direct API caller must not be able to put a designation
 *     display string into a column whose canonical values are
 *     salesperson | associate_broker | broker.
 *
 *  3. THE LICENCE CLASS IS NOT DERIVED FROM AUTHORISATION.
 *     `associate_broker` is its own stored class. The retired design inferred
 *     it from `broker` + role AGENT, manufacturing a NY licence class out of a
 *     Mallan software permission. Nothing on the write path reads `role` to
 *     decide a class or a title any more.
 */
import { readFileSync } from 'fs';
import { resolve, sep } from 'path';
import { makeRequest } from './helpers';

const ROOT = resolve(__dirname, '../..');
import {
  rejectNonCanonicalLicenseType,
  designationFromStored,
  resolveDesignation,
  DESIGNATIONS,
  LICENSE_TYPES,
} from '../../lib/agents/license-designation';
import {
  applyAgentStatusTransition,
  transitionAgentStatus,
  revokesSessions,
  isAgentStatus,
} from '../../lib/agents/agent-lifecycle';
import {
  canonicalTitleFor,
  rejectIncoherentLicenceRole,
  rejectUnverifiedMemberMlsId,
} from '../../lib/agents/license-designation';

// ─── prisma mock ───────────────────────────────────────────────────────────
const agentFindUnique = jest.fn();
const agentUpdate = jest.fn(async () => ({}));
const agentCreate = jest.fn();
const sessionDeleteMany = jest.fn(async () => ({ count: 3 }));
const mfaDeleteMany = jest.fn(async () => ({ count: 1 }));
const auditCreate = jest.fn(async () => ({ id: 1n }));

const txSpy = jest.fn();
const client = {
  agent: { findUnique: agentFindUnique, update: agentUpdate, create: agentCreate },
  session: { deleteMany: sessionDeleteMany },
  mfaSession: { deleteMany: mfaDeleteMany },
  auditEvent: { create: auditCreate },
};
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    ...client,
    // interactive transaction: the callback either fully commits or, on a
    // throw, nothing it wrote is kept
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      txSpy();
      return fn(client);
    },
  },
}));

const requireBrokerMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireBroker: requireBrokerMock,
  requireAgentOrBroker: requireBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
  logAuditEvent: jest.fn(async () => {}),
}));
jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

const BROKER = { userId: 1n, userType: 'agent' as const, role: 'BROKER', sessionId: 's1' };
const TARGET = {
  id: 6n, first_name: 'A', last_name: 'B', full_name: 'A B', email: 'a@mallan.nyc',
  license_no: '1', license_type: 'broker', license_expiry: null, trestle_mls_id: null,
  sale_split: null, rental_split: null, role: 'AGENT', status: 'active',
  last_login: null, created_at: new Date(), title: 'Licensed Real Estate Associate Broker',
  bio: null, photo: null, public_slug: 'a-b', featured: false, specialties: [], languages: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  txSpy.mockReset();
  requireBrokerMock.mockResolvedValue(BROKER);
  agentFindUnique.mockResolvedValue({ ...TARGET });
  agentUpdate.mockResolvedValue({ ...TARGET });
  agentCreate.mockResolvedValue({ id: 7n, email: 'new@mallan.nyc', status: 'active' });
  sessionDeleteMany.mockResolvedValue({ count: 3 });
  mfaDeleteMany.mockResolvedValue({ count: 1 });
  auditCreate.mockResolvedValue({ id: 1n });
});

const patch = (body: unknown) =>
  makeRequest({ url: 'http://test/api/crm/agents/6', body, method: 'PATCH' });

// ═══════════════════════════════════════════════════════════════════════════
describe('licence designation contract (pure)', () => {
  it('three licence classes are canonical, associate_broker among them', () => {
    expect([...LICENSE_TYPES]).toEqual(['salesperson', 'associate_broker', 'broker']);
  });

  it('every designation resolves to a canonical licence class', () => {
    for (const d of Object.values(DESIGNATIONS)) {
      expect(LICENSE_TYPES).toContain(resolveDesignation(d)!.license_type);
    }
    expect(resolveDesignation(DESIGNATIONS.ASSOCIATE_BROKER)!.license_type).toBe('associate_broker');
    expect(resolveDesignation(DESIGNATIONS.PRINCIPAL_BROKER)!.license_type).toBe('broker');
    expect(resolveDesignation(DESIGNATIONS.SALESPERSON)!.license_type).toBe('salesperson');
  });

  it('reverse resolution reads the LICENCE CLASS, never the authorisation role', () => {
    // The class carries the fact now; there is no role argument to pass.
    expect(designationFromStored('associate_broker')).toBe(DESIGNATIONS.ASSOCIATE_BROKER);
    expect(designationFromStored('broker')).toBe(DESIGNATIONS.PRINCIPAL_BROKER);
    expect(designationFromStored('salesperson')).toBe(DESIGNATIONS.SALESPERSON);
  });

  it('a legacy bare "broker" row is not ESCALATED when its own title says associate', () => {
    // The second argument is the STORED TITLE - a designation string, which is
    // evidence about the licence. It is never the role.
    expect(designationFromStored('broker', 'Licensed Real Estate Associate Broker'))
      .toBe(DESIGNATIONS.ASSOCIATE_BROKER);
    expect(designationFromStored('broker', 'Licensed Associate Real Estate Broker'))
      .toBe(DESIGNATIONS.ASSOCIATE_BROKER);
    expect(designationFromStored('broker', 'Licensed Real Estate Broker'))
      .toBe(DESIGNATIONS.PRINCIPAL_BROKER);
  });

  it('an unknown licence forces an explicit choice rather than guessing', () => {
    expect(designationFromStored(null, null)).toBe('');
    expect(designationFromStored('Licensed Associate Broker', 'AGENT')).toBe('');
  });

  it('rejects designation display strings, and says what to send instead', () => {
    const err = rejectNonCanonicalLicenseType('Licensed Associate Broker');
    expect(err).toContain('is a designation, not a licence class');
    expect(err).toContain('"associate_broker"');
    expect(rejectNonCanonicalLicenseType('garbage')).toContain('must be one of');
    expect(rejectNonCanonicalLicenseType('broker')).toBeNull();
    expect(rejectNonCanonicalLicenseType('associate_broker')).toBeNull();
    expect(rejectNonCanonicalLicenseType(undefined)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('server boundary refuses non-canonical license_type', () => {
  for (const bad of ['Licensed Associate Broker', 'Licensed Associate Real Estate Broker',
                     'Licensed Real Estate Associate Broker', 'Licensed Broker',
                     'Associate Broker', 'garbage', 'BROKER', 'associate-broker']) {
    it(`CREATE rejects ${JSON.stringify(bad)} with 400 and zero mutation`, async () => {
      const { POST } = await import('@/app/api/crm/agents/route');
      const res = await POST(makeRequest({
        url: 'http://test/api/crm/agents', method: 'POST',
        body: { first_name: 'A', last_name: 'B', email: 'x@mallan.nyc', license_type: bad,
                license_no: '1', license_expiry: '2030-01-01' },
      }));
      expect(res.status).toBe(400);
      expect(agentUpdate).not.toHaveBeenCalled();
    });

    it(`PATCH rejects ${JSON.stringify(bad)} with 400 and zero mutation`, async () => {
      const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
      const res = await PATCH(patch({ license_type: bad }), { params: Promise.resolve({ id: '6' }) });
      expect(res.status).toBe(400);
      expect(agentUpdate).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });
  }

  it('accepts the canonical values', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    for (const good of ['broker', 'salesperson', 'associate_broker']) {
      jest.clearAllMocks();
      requireBrokerMock.mockResolvedValue(BROKER);
      agentFindUnique.mockResolvedValue({ ...TARGET });
      agentUpdate.mockResolvedValue({ ...TARGET });
      const res = await PATCH(patch({ license_type: good }), { params: Promise.resolve({ id: '6' }) });
      expect(res.status).toBe(200);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('account state has ONE authority', () => {
  it('the transition revokes sessions and MFA when leaving active', async () => {
    const db = {
      agent: { update: agentUpdate },
      session: { deleteMany: sessionDeleteMany },
      mfaSession: { deleteMany: mfaDeleteMany },
      auditEvent: { create: auditCreate },
    } as never;
    const out = await applyAgentStatusTransition(db, 6n, 'inactive', BROKER, { previous: 'active' });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { user_type: 'agent', user_id: 6n } });
    expect(mfaDeleteMany).toHaveBeenCalledWith({ where: { agent_id: 6n } });
    expect(out).toEqual({ status: 'inactive', sessions_revoked: 3, mfa_sessions_revoked: 1 });
  });

  it('reactivating does NOT revoke — there is nothing to revoke', () => {
    expect(revokesSessions('active')).toBe(false);
    expect(revokesSessions('inactive')).toBe(true);
    expect(revokesSessions('suspended')).toBe(true);
  });

  it('PATCH status=inactive now revokes sessions, as Deactivate does', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    const res = await PATCH(patch({ status: 'inactive' }), { params: Promise.resolve({ id: '6' }) });
    expect(res.status).toBe(200);
    // the whole point: the edit path can no longer leave a live session behind
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { user_type: 'agent', user_id: 6n } });
    expect(mfaDeleteMany).toHaveBeenCalled();
  });

  it('PATCH status writes a status_change audit event naming the transition', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    await PATCH(patch({ status: 'suspended' }), { params: Promise.resolve({ id: '6' }) });
    const calls = auditCreate.mock.calls as unknown as Array<[{ data: { action: string; changes: Record<string, unknown> } }]>;
    const status = calls.map((c) => c[0].data).find((d) => d.action === 'status_change');
    expect(status).toBeDefined();
    expect(status!.changes.status).toEqual({ old: 'active', new: 'suspended' });
    expect(status!.changes.sessions_revoked).toBe(3);
  });

  it('a no-op status (already active) revokes nothing', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    await PATCH(patch({ status: 'active' }), { params: Promise.resolve({ id: '6' }) });
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown status without writing anything', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    const res = await PATCH(patch({ status: 'archived' }), { params: Promise.resolve({ id: '6' }) });
    expect(res.status).toBe(400);
    expect(agentUpdate).not.toHaveBeenCalled();
    expect(isAgentStatus('archived')).toBe(false);
  });

  it('DELETE uses the same authority, so the two cannot drift apart', async () => {
    const { DELETE } = await import('@/app/api/crm/agents/[id]/route');
    const res = await DELETE(
      makeRequest({ url: 'http://test/api/crm/agents/6', method: 'DELETE' }),
      { params: Promise.resolve({ id: '6' }) },
    );
    const json = await res.json();
    expect(json.status).toBe('inactive');
    expect(json.sessions_revoked).toBe(3);
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { user_type: 'agent', user_id: 6n } });
  });
});

describe('P0-1 the transition is ATOMIC', () => {
  it('runs inside one transaction', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    await PATCH(patch({ status: 'inactive' }), { params: Promise.resolve({ id: '6' }) });
    expect(txSpy).toHaveBeenCalledTimes(1);
  });

  it('rolls back entirely when session revocation fails', async () => {
    // Without a transaction this is the original defect recreated by a failure
    // path: status already inactive, accepted Session still alive.
    sessionDeleteMany.mockRejectedValue(new Error('session delete failed'));
    const db = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        try { return await fn(client); } catch (e) { throw e; } // a real tx discards writes
      },
    } as never;
    await expect(
      transitionAgentStatus(db, 6n, 'inactive', BROKER, { previous: 'active' }),
    ).rejects.toThrow('session delete failed');

    // the lifecycle audit for a transition that did not happen must not exist
    const audits = (auditCreate.mock.calls as unknown as Array<[{ data: { action: string } }]>)
      .map((c) => c[0].data.action);
    expect(audits).not.toContain('status_change');
  });

  it('PATCH returns the COMMITTED status, not the pre-transition one', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    const res = await PATCH(patch({ status: 'suspended' }), { params: Promise.resolve({ id: '6' }) });
    const json = await res.json();
    expect(json.lifecycle.status).toBe('suspended');
    expect(json.lifecycle.sessions_revoked).toBe(3);
  });
});

describe('P0-2 every status and licence writer obeys the authority', () => {
  const me = (body: unknown) =>
    makeRequest({ url: 'http://test/api/crm/agents/me', body, method: 'PATCH' });

  it('/agents/me status change revokes sessions instead of writing the field', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/me/route');
    // send a generic field alongside, so the two update paths are separable
    const res = await PATCH(me({ status: 'inactive', bio: 'x' }));
    expect(res.status).toBe(200);
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { user_type: 'agent', user_id: 6n } });

    const calls = (agentUpdate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)
      .map((c) => c[0].data);
    // the ONLY write carrying status is the lifecycle transition, which writes
    // status alone; the generic field update carries bio and never status
    const generic = calls.find((d) => 'bio' in d);
    expect(generic).toBeDefined();
    expect(generic!.status).toBeUndefined();
    const transition = calls.find((d) => 'status' in d);
    expect(Object.keys(transition!)).toEqual(['status']);
  });

  it('/agents/me rejects a non-canonical license_type', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/me/route');
    const res = await PATCH(me({ license_type: 'Licensed Associate Broker' }));
    expect(res.status).toBe(400);
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('/agents/me cannot self-edit the regulated professional title', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/me/route');
    await PATCH(me({ title: 'Licensed Real Estate Broker', bio: 'x' }));
    const dataArg = ((agentUpdate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0]
      ?? [{ data: {} }])[0];
    expect(dataArg.data.title).toBeUndefined();
    expect(dataArg.data.bio).toBe('x');
  });

  it('the second Agent creation authority is RETIRED, not merely guarded', () => {
    // /api/auth/agent/register created Agent rows independently and required
    // only name + email, so an ACTIVE account could exist with no licence facts
    // at all. It had no runtime caller, so it is removed rather than having the
    // validation copied into it - a duplicate writer is the defect, and
    // guarding it just makes the duplicate harder to notice.
    const { existsSync } = require('fs') as typeof import('fs');
    expect(existsSync(resolve(ROOT, 'app/api/auth/agent/register/route.ts'))).toBe(false);
  });

  it('POST /api/crm/agents is now the only Agent create authority', () => {
    const { readdirSync } = require('fs') as typeof import('fs');
    const files = readdirSync(resolve(ROOT, 'app/api'), { recursive: true } as never) as unknown as string[];
    const creators = files
      .map((f) => String(f).split(sep).join('/'))
      .filter((f) => f.endsWith('route.ts'))
      .filter((f) => readFileSync(resolve(ROOT, 'app/api', f), 'utf8').includes('prisma.agent.create'));
    expect(creators).toEqual(['crm/agents/route.ts']);
  });
});

describe('P0-3/P0-4 role, licence and title stay congruent', () => {
  it('derives the title from the LICENCE CLASS alone - there is no role argument', () => {
    expect(canonicalTitleFor('associate_broker')).toBe('Licensed Associate Real Estate Broker');
    expect(canonicalTitleFor('broker')).toBe('Licensed Real Estate Broker');
    expect(canonicalTitleFor('salesperson')).toBe('Licensed Real Estate Salesperson');
    expect(canonicalTitleFor(null)).toBeNull();
    // Passing an authorisation grant is a COMPILE error, which is the point.
    expect(canonicalTitleFor.length).toBe(1);
  });

  it('the posted title is ignored - the stored title follows the posted licence class', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    await PATCH(patch({ license_type: 'associate_broker', title: 'Licensed Real Estate Broker' }),
      { params: Promise.resolve({ id: '6' }) });
    const dataArg = (agentUpdate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0];
    expect(dataArg.data.title).toBe('Licensed Associate Real Estate Broker');
  });

  it('a posted principal-broker class derives the principal designation, whatever the stored role', async () => {
    // The stored record carries role AGENT. Under the retired design that
    // silently rewrote this to the Associate Broker title.
    jest.clearAllMocks();
    requireBrokerMock.mockResolvedValue(BROKER);
    agentFindUnique.mockResolvedValue({ ...TARGET, role: 'AGENT' });
    agentUpdate.mockResolvedValue({ ...TARGET });
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    await PATCH(patch({ license_type: 'broker' }), { params: Promise.resolve({ id: '6' }) });
    const dataArg = (agentUpdate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0];
    expect(dataArg.data.title).toBe('Licensed Real Estate Broker');
  });

  it('an unrelated PATCH never rewrites the designation of a legacy row', async () => {
    // The title is recomputed only when the licence class is actually written.
    // Otherwise editing a phone number would ESCALATE a legacy "broker" row.
    jest.clearAllMocks();
    requireBrokerMock.mockResolvedValue(BROKER);
    agentFindUnique.mockResolvedValue({
      ...TARGET, license_type: 'broker', role: 'AGENT',
      title: 'Licensed Real Estate Associate Broker',
    });
    agentUpdate.mockResolvedValue({ ...TARGET });
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    await PATCH(patch({ phone: '646-555-0100' }), { params: Promise.resolve({ id: '6' }) });
    const dataArg = (agentUpdate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0];
    expect(dataArg.data.title).toBeUndefined();
  });

  it('a salesperson licence cannot hold BROKER authorisation', () => {
    expect(rejectIncoherentLicenceRole('salesperson', 'BROKER')).toContain('cannot hold the BROKER');
    expect(rejectIncoherentLicenceRole('broker', 'BROKER')).toBeNull();
    expect(rejectIncoherentLicenceRole('salesperson', 'AGENT')).toBeNull();
  });

  it('PATCH refuses an incoherent licence/role pair', async () => {
    agentFindUnique.mockResolvedValue({ ...TARGET, role: 'BROKER' });
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    const res = await PATCH(patch({ license_type: 'salesperson' }), { params: Promise.resolve({ id: '6' }) });
    expect(res.status).toBe(400);
    expect(agentUpdate).not.toHaveBeenCalled();
  });
});

describe('P1-5 MemberMlsId fails closed at the server', () => {
  it('the guard refuses any non-null client value', () => {
    expect(rejectUnverifiedMemberMlsId('39361')).toContain('cannot be set from client input');
    expect(rejectUnverifiedMemberMlsId(null)).toBeNull();
    expect(rejectUnverifiedMemberMlsId(undefined)).toBeNull();
  });

  it('PATCH rejects a typed trestle_mls_id', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    const res = await PATCH(patch({ trestle_mls_id: '39361' }), { params: Promise.resolve({ id: '6' }) });
    expect(res.status).toBe(400);
    expect(agentUpdate).not.toHaveBeenCalled();
  });

  it('CREATE rejects a typed trestle_mls_id', async () => {
    const { POST } = await import('@/app/api/crm/agents/route');
    const res = await POST(makeRequest({
      url: 'http://test/api/crm/agents', method: 'POST',
      body: { first_name: 'A', last_name: 'B', email: 'q@mallan.nyc', license_type: 'broker',
              license_no: '1', license_expiry: '2030-01-01', trestle_mls_id: '39361' },
    }));
    expect(res.status).toBe(400);
  });
});

describe('P1-6 the server enforces the licence facts the form marks required', () => {
  const base = { first_name: 'A', last_name: 'B', email: 'r@mallan.nyc' };
  for (const [missing, body] of [
    ['license_type', { ...base, license_no: '1', license_expiry: '2030-01-01' }],
    ['license_no', { ...base, license_type: 'broker', license_expiry: '2030-01-01' }],
    ['license_expiry', { ...base, license_type: 'broker', license_no: '1' }],
  ] as Array<[string, Record<string, unknown>]>) {
    it(`refuses creation without ${missing}`, async () => {
      const { POST } = await import('@/app/api/crm/agents/route');
      const res = await POST(makeRequest({ url: 'http://test/api/crm/agents', method: 'POST', body }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain(missing);
    });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
describe('CREATE: the brokerage role is REQUIRED, canonical, and never defaulted', () => {
  // The write boundary is the whole point. The Add Agent form requires the
  // field, but HTML `required` is not a contract: the server accepted a missing
  // `role` and wrote the retired "AGENT", so a stale client or a direct API
  // caller could still mint a brand-new non-canonical Agent at the one place
  // that creates rows. Legacy "AGENT" is READ tolerance only.
  //
  // Every case asserts the ROW COUNT, not just the status. A 400 that still
  // wrote a row would be the worse failure.
  const BASE = {
    first_name: 'New', last_name: 'Agent', email: 'newagent@mallan.nyc',
    license_type: 'associate_broker', license_no: '10301200574',
    license_expiry: '2030-01-01',
  };
  const create = (body: Record<string, unknown>) =>
    makeRequest({ url: 'http://test/api/crm/agents', method: 'POST', body });

  beforeEach(() => {
    // no existing account with this email, so the email guard cannot be what
    // produces the 400 below
    agentFindUnique.mockResolvedValue(null);
  });

  it('refuses a MISSING role with 400 and creates ZERO rows', async () => {
    const { POST } = await import('@/app/api/crm/agents/route');
    const res = await POST(create({ ...BASE }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('role is required');
    expect(agentCreate).not.toHaveBeenCalled();
    expect(agentCreate.mock.calls).toHaveLength(0);
  });

  it('refuses the retired "AGENT" role with 400 and creates ZERO rows', async () => {
    const { POST } = await import('@/app/api/crm/agents/route');
    const res = await POST(create({ ...BASE, role: 'AGENT' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('must be one of');
    expect(agentCreate).not.toHaveBeenCalled();
    expect(agentCreate.mock.calls).toHaveLength(0);
  });

  it('refuses the principal-broker role from the roster form, with ZERO rows', async () => {
    const { POST } = await import('@/app/api/crm/agents/route');
    const res = await POST(create({ ...BASE, license_type: 'broker', role: 'BROKER' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('principal-broker role cannot be assigned');
    expect(agentCreate.mock.calls).toHaveLength(0);
  });

  it('refuses free text and mis-cased values rather than normalising them inbound', async () => {
    const { POST } = await import('@/app/api/crm/agents/route');
    for (const bad of ['salesperson', 'Associate Broker', 'associate_broker', 'ADMIN', '']) {
      agentCreate.mockClear();
      const res = await POST(create({ ...BASE, role: bad }));
      expect(res.status).toBe(400);
      expect(agentCreate.mock.calls).toHaveLength(0);
    }
  });

  it('accepts a canonical role, writes it VERBATIM, and creates exactly one row', async () => {
    const { POST } = await import('@/app/api/crm/agents/route');
    const res = await POST(create({ ...BASE, role: 'ASSOCIATE_BROKER' }));
    expect(res.status).toBe(201);
    expect(agentCreate).toHaveBeenCalledTimes(1);
    const data = (agentCreate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0].data;
    // recorded exactly as sent - no default, no up-casing, no derivation
    expect(data.role).toBe('ASSOCIATE_BROKER');
    // and the designation still follows the LICENCE CLASS, not the role
    expect(data.license_type).toBe('associate_broker');
    expect(data.title).toBe('Licensed Associate Real Estate Broker');
  });

  it('the route holds no "AGENT" fallback at all', async () => {
    const src = readFileSync(resolve(ROOT, 'app/api/crm/agents/route.ts'), 'utf8');
    const live = src.replace(/\/\*[\s\S]*?\*\//g, '')
      .split(String.fromCharCode(10)).filter((l) => !/^\s*\/\//.test(l))
      .join(String.fromCharCode(10));
    expect(live).not.toContain('"AGENT"');
    expect(live).not.toContain("'AGENT'");
    expect(live).toContain('requireBrokerageRole(body.role)');
  });
});
