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
  revokesSessions,
  isAgentStatus,
} from '../../lib/agents/agent-lifecycle';

// ─── prisma mock ───────────────────────────────────────────────────────────
const agentFindUnique = jest.fn();
const agentUpdate = jest.fn(async () => ({}));
const sessionDeleteMany = jest.fn(async () => ({ count: 3 }));
const mfaDeleteMany = jest.fn(async () => ({ count: 1 }));
const auditCreate = jest.fn(async () => ({ id: 1n }));

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    agent: { findUnique: agentFindUnique, update: agentUpdate, create: jest.fn() },
    session: { deleteMany: sessionDeleteMany },
    mfaSession: { deleteMany: mfaDeleteMany },
    auditEvent: { create: auditCreate },
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
        body: { first_name: 'A', last_name: 'B', email: 'x@mallan.nyc', license_type: bad },
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
