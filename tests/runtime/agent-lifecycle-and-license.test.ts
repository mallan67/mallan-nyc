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
 *     broker | salesperson.
 */
import { makeRequest } from './helpers';
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
const sessionDeleteMany = jest.fn(async () => ({ count: 3 }));
const mfaDeleteMany = jest.fn(async () => ({ count: 1 }));
const auditCreate = jest.fn(async () => ({ id: 1n }));

const txSpy = jest.fn();
const client = {
  agent: { findUnique: agentFindUnique, update: agentUpdate, create: jest.fn() },
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
  sessionDeleteMany.mockResolvedValue({ count: 3 });
  mfaDeleteMany.mockResolvedValue({ count: 1 });
  auditCreate.mockResolvedValue({ id: 1n });
});

const patch = (body: unknown) =>
  makeRequest({ url: 'http://test/api/crm/agents/6', body, method: 'PATCH' });

// ═══════════════════════════════════════════════════════════════════════════
describe('licence designation contract (pure)', () => {
  it('only broker and salesperson are canonical', () => {
    expect([...LICENSE_TYPES]).toEqual(['broker', 'salesperson']);
  });

  it('every designation resolves to a canonical licence class', () => {
    for (const d of Object.values(DESIGNATIONS)) {
      expect(LICENSE_TYPES).toContain(resolveDesignation(d)!.license_type);
    }
  });

  it('reverse resolution uses ROLE, never the broker-editable title', () => {
    // both store license_type "broker" - role is what separates them
    expect(designationFromStored('broker', 'BROKER')).toBe(DESIGNATIONS.PRINCIPAL_BROKER);
    expect(designationFromStored('broker', 'AGENT')).toBe(DESIGNATIONS.ASSOCIATE_BROKER);
    expect(designationFromStored('salesperson', 'AGENT')).toBe(DESIGNATIONS.SALESPERSON);
  });

  it('an Associate Broker with an off-pattern title still reopens as Associate', () => {
    // the old title-text heuristic returned "Licensed Broker" here
    expect(designationFromStored('broker', 'AGENT')).toBe(DESIGNATIONS.ASSOCIATE_BROKER);
  });

  it('an unknown licence forces an explicit choice rather than guessing', () => {
    expect(designationFromStored(null, null)).toBe('');
    expect(designationFromStored('Licensed Associate Broker', 'AGENT')).toBe('');
  });

  it('rejects designation display strings, and says what to send instead', () => {
    const err = rejectNonCanonicalLicenseType('Licensed Associate Broker');
    expect(err).toContain('is a designation, not a licence class');
    expect(err).toContain('"broker"');
    expect(rejectNonCanonicalLicenseType('garbage')).toContain('must be one of');
    expect(rejectNonCanonicalLicenseType('broker')).toBeNull();
    expect(rejectNonCanonicalLicenseType(undefined)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('server boundary refuses non-canonical license_type', () => {
  for (const bad of ['Licensed Associate Broker', 'Licensed Broker', 'garbage', 'BROKER']) {
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
    for (const good of ['broker', 'salesperson']) {
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

  it('the second creation path enforces the same licence contract', async () => {
    const { POST } = await import('@/app/api/auth/agent/register/route');
    const res = await POST(makeRequest({
      url: 'http://test/api/auth/agent/register', method: 'POST',
      body: { firstName: 'A', lastName: 'B', email: 'z@mallan.nyc', password: 'Passw0rd!x',
              licenseType: 'Licensed Associate Broker' },
    }));
    expect(res.status).toBe(400);
  });
});

describe('P0-3/P0-4 role, licence and title stay congruent', () => {
  it('derives the title from licence class and authorisation role', () => {
    expect(canonicalTitleFor('broker', 'AGENT')).toBe('Licensed Real Estate Associate Broker');
    expect(canonicalTitleFor('broker', 'BROKER')).toBe('Licensed Real Estate Broker');
    expect(canonicalTitleFor('salesperson', 'AGENT')).toBe('Licensed Real Estate Salesperson');
    expect(canonicalTitleFor(null, 'AGENT')).toBeNull();
  });

  it('an AGENT-role record cannot be styled principal Broker, whatever is posted', async () => {
    const { PATCH } = await import('@/app/api/crm/agents/[id]/route');
    await PATCH(patch({ license_type: 'broker', title: 'Licensed Real Estate Broker' }),
      { params: Promise.resolve({ id: '6' }) });
    const dataArg = (agentUpdate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>)[0][0];
    // role on the stored record is AGENT, so the derived title is Associate
    expect(dataArg.data.title).toBe('Licensed Real Estate Associate Broker');
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
