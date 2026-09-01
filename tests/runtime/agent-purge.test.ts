/// <reference types="jest" />
/**
 * Agent permanent delete — mistake rollback only.
 *
 * Deactivate (existing) is normal offboarding and retains everything.
 * Delete Permanently is for an erroneous / never-used record and must refuse
 * the moment the target shows any sign of having acted as a broker.
 *
 * These tests exercise the REAL route handlers against a mocked Prisma,
 * including the interactive transaction, so atomicity and rollback are proven
 * behaviourally rather than asserted from the source.
 */
import { makeRequest } from './helpers';
import {
  PURGE_BLOCKERS,
  refusePurge,
  blockingCounts,
  headshotObjectKey,
} from '../../lib/agents/agent-purge';

// ─── Prisma mock, including $transaction ───────────────────────────────────
const counts: Record<string, jest.Mock> = {};
const MODELS = [
  'deal', 'showing', 'protectedPeriod', 'pastDeal', 'cmaReport', 'document',
  'campaign', 'followUpTask', 'leadAssignmentRule', 'demandAlert', 'agentMetrics',
  'agentPerformanceIndex', 'pricingExperiment', 'lead', 'listing', 'savedSearch',
  'externalListing', 'externalListingComment', 'sellerLead', 'marketingActivity',
  'activeLease', 'offer', 'outreachEvent', 'identityReviewQueue', 'auditEvent',
  'activityLog', 'listingAudit', 'priceHistory', 'session', 'mfaSession',
];
const agentFindUnique = jest.fn();
const agentDelete = jest.fn(async () => ({}));
const auditCreate = jest.fn(async () => ({ id: 1n }));
const sessionDeleteMany = jest.fn(async () => ({ count: 0 }));
const mfaDeleteMany = jest.fn(async () => ({ count: 0 }));
const txSpy = jest.fn();

function buildClient() {
  const c: Record<string, unknown> = {
    agent: { findUnique: agentFindUnique, delete: agentDelete },
    session: { count: counts.session, deleteMany: sessionDeleteMany },
    mfaSession: { count: counts.mfaSession, deleteMany: mfaDeleteMany },
    auditEvent: { count: counts.auditEvent, create: auditCreate },
  };
  for (const m of MODELS) {
    if (!c[m]) c[m] = { count: counts[m] };
  }
  return c;
}

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === '$transaction') {
        return async (fn: (tx: unknown) => Promise<unknown>) => {
          txSpy();
          return fn(buildClient());
        };
      }
      return (buildClient() as Record<string, unknown>)[prop];
    },
  }),
}));

const requireBrokerMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireBroker: requireBrokerMock,
  isAuthError: (v: unknown) => v instanceof Response,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

const BROKER = { userId: 1n, userType: 'agent' as const, role: 'BROKER', sessionId: 's1' };

/** Shape of the purge AuditEvent payload, so assertions are type-checked. */
type PurgeAudit = {
  data: {
    action: string; entity_type: string; entity_id: string; user_id: bigint;
    changes: {
      reason: string;
      deleted_agent: Record<string, string | null>;
      dependency_counts_at_purge: Record<string, number>;
      ephemeral_deleted: { sessions: number; mfa_sessions: number };
      retained_media: { r2_key: string | null; note: string };
    };
  };
};

/** A pristine erroneous record: never logged in, role AGENT. */
const PRISTINE = {
  id: 6n, first_name: 'Caludia', last_name: 'Milkowski', full_name: 'Caludia Milkowski',
  email: 'cmilkowski@mallan.nyc', license_no: '10301200574', license_type: 'broker',
  role: 'AGENT', status: 'active', public_slug: 'caludia-milkowski',
  photo: 'https://r2.example/agents/caludia-milkowski/headshot.webp',
  last_login: null as Date | null, created_at: new Date('2026-09-01T21:37:16Z'),
};

function setAllCountsZero() {
  for (const m of MODELS) counts[m].mockResolvedValue(0);
}

beforeEach(() => {
  for (const m of MODELS) counts[m] = jest.fn(async () => 0);
  agentFindUnique.mockReset();
  agentDelete.mockReset(); agentDelete.mockResolvedValue({});
  auditCreate.mockReset(); auditCreate.mockResolvedValue({ id: 1n });
  sessionDeleteMany.mockReset(); sessionDeleteMany.mockResolvedValue({ count: 2 });
  mfaDeleteMany.mockReset(); mfaDeleteMany.mockResolvedValue({ count: 1 });
  txSpy.mockReset();
  requireBrokerMock.mockReset(); requireBrokerMock.mockResolvedValue(BROKER);
  setAllCountsZero();
  agentFindUnique.mockResolvedValue({ ...PRISTINE });
});

const purge = (body: unknown = { confirm_email: 'cmilkowski@mallan.nyc' }) =>
  makeRequest({ url: 'http://test/api/crm/agents/6/purge', body, method: 'POST' });

// ═══════════════════════════════════════════════════════════════════════════
describe('dependency spec', () => {
  it('covers all 21 FK relations and the 8 loose identity references', () => {
    expect(PURGE_BLOCKERS.filter((b) => b.kind === 'fk')).toHaveLength(21);
    expect(PURGE_BLOCKERS.filter((b) => b.kind === 'loose')).toHaveLength(8);
    expect(new Set(PURGE_BLOCKERS.map((b) => b.key)).size).toBe(PURGE_BLOCKERS.length);
  });

  it('blocks on every loose reference the database would NOT have protected', () => {
    const keys = PURGE_BLOCKERS.filter((b) => b.kind === 'loose').map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining([
      'offers_as_buyer_agent', 'offers_as_list_agent', 'outreach_events',
      'identity_review_assignments', 'listing_audits_run', 'price_changes_made',
      'activity_log_as_actor', 'audit_events_as_actor',
    ]));
  });

  it('reports the R2 headshot key without deleting anything', () => {
    expect(headshotObjectKey('caludia-milkowski')).toBe('agents/caludia-milkowski/headshot.webp');
    expect(headshotObjectKey(null)).toBeNull();
  });
});

describe('eligibility rules (pure)', () => {
  const zero = {};
  it('refuses self, whatever else is true', () => {
    expect(refusePurge({ id: 1n, role: 'AGENT', last_login: null }, 1n, zero)).toBe('refuse_self');
  });
  it('refuses any BROKER authorisation role — not an informal principal-broker notion', () => {
    expect(refusePurge({ id: 9n, role: 'BROKER', last_login: null }, 1n, zero)).toBe('refuse_broker_role');
    expect(refusePurge({ id: 9n, role: 'broker', last_login: null }, 1n, zero)).toBe('refuse_broker_role');
  });
  it('does NOT shield an Associate Broker — she is role AGENT', () => {
    expect(refusePurge({ id: 6n, role: 'AGENT', last_login: null }, 1n, zero)).toBeNull();
  });
  it('refuses anyone who has EVER logged in, regardless of current status', () => {
    expect(refusePurge({ id: 9n, role: 'AGENT', last_login: new Date() }, 1n, zero))
      .toBe('refuse_has_logged_in');
  });
  it('refuses on business history', () => {
    expect(refusePurge({ id: 9n, role: 'AGENT', last_login: null }, 1n, { deals: 3 }))
      .toBe('refuse_has_business_history');
  });
  it('reports only non-zero blockers, in spec order', () => {
    expect(blockingCounts({ deals: 0, leads: 2, documents: 1 })).toEqual({ documents: 1, leads: 2 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('POST purge — pristine erroneous account', () => {
  it('succeeds and deletes exactly the ephemeral rows plus the agent', async () => {
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.purged).toBe(true);
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { user_type: 'agent', user_id: 6n } });
    expect(mfaDeleteMany).toHaveBeenCalledWith({ where: { agent_id: 6n } });
    expect(agentDelete).toHaveBeenCalledWith({ where: { id: 6n } });
  });

  it('runs everything inside ONE transaction', async () => {
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    expect(txSpy).toHaveBeenCalledTimes(1);
  });

  it('re-counts every dependency inside the transaction — the preview is not trusted', async () => {
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    // one count call per blocker in the spec
    const called = PURGE_BLOCKERS.filter((b) => {
      const model = MODELS.find((m) => counts[m].mock.calls.length > 0 && b.key.length > 0);
      return model !== undefined;
    });
    expect(called.length).toBeGreaterThan(0);
    expect(counts.deal).toHaveBeenCalled();
    expect(counts.offer).toHaveBeenCalled();
    expect(counts.priceHistory).toHaveBeenCalled();
    expect(counts.activityLog).toHaveBeenCalled();
  });

  it('writes a purge AuditEvent carrying a COMPLETE identity snapshot', async () => {
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    await POST(purge(), { params: Promise.resolve({ id: '6' }) });

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const d = (auditCreate.mock.calls[0] as unknown as PurgeAudit[])[0].data;
    expect(d.action).toBe('purge');
    expect(d.entity_type).toBe('agent');
    expect(d.entity_id).toBe('6');
    expect(d.user_id).toBe(1n);
    const snap = d.changes.deleted_agent;
    for (const f of ['agent_id', 'full_name', 'email', 'license_no', 'license_type', 'role', 'public_slug', 'status_at_purge']) {
      expect(snap[f]).toBeDefined();
    }
    expect(snap.email).toBe('cmilkowski@mallan.nyc');
    expect(snap.license_no).toBe('10301200574');
    expect(snap.role).toBe('AGENT');
  });

  it('retains the R2 object and says so — never deletes media', async () => {
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    const json = await res.json();
    expect(json.retained.r2_media).toBe('agents/caludia-milkowski/headshot.webp');
    const d = (auditCreate.mock.calls[0] as unknown as PurgeAudit[])[0].data;
    expect(d.changes.retained_media.r2_key).toBe('agents/caludia-milkowski/headshot.webp');
  });

  it('says the static public profile survives, and never touches Git', async () => {
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    const json = await res.json();
    expect(json.note).toMatch(/data\/agents\.json/);
    expect(json.note).toMatch(/does not modify Git/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('POST purge — refusals (nothing is ever deleted)', () => {
  const expectNothingDeleted = () => {
    expect(agentDelete).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
    expect(mfaDeleteMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  };

  it('refuses an account with business history and names the exact blockers', async () => {
    counts.deal.mockResolvedValue(12);
    counts.pastDeal.mockResolvedValue(4);
    counts.document.mockResolvedValue(7);
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('refuse_has_business_history');
    expect(json.blocked_by).toEqual({ deals: 12, past_deals: 4, documents: 7 });
    expect(json.remedy).toBe('deactivate');
    expectNothingDeleted();
  });

  it('refuses on a LOOSE reference the database would not have caught', async () => {
    counts.priceHistory.mockResolvedValue(2); // changed_by — no FK exists
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.blocked_by).toEqual({ price_changes_made: 2 });
    expectNothingDeleted();
  });

  it('refuses when the target ACTED, via audit events they caused', async () => {
    counts.auditEvent.mockResolvedValue(5);
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    const json = await res.json();
    expect(json.blocked_by).toEqual({ audit_events_as_actor: 5 });
    expectNothingDeleted();
  });

  it('refuses an account that has ever logged in, even if now inactive', async () => {
    agentFindUnique.mockResolvedValue({
      ...PRISTINE, status: 'inactive', last_login: new Date('2026-08-01T10:00:00Z'),
    });
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('refuse_has_logged_in');
    expectNothingDeleted();
  });

  it('refuses a BROKER-role account', async () => {
    agentFindUnique.mockResolvedValue({ ...PRISTINE, role: 'BROKER' });
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    expect((await res.json()).error).toBe('refuse_broker_role');
    expectNothingDeleted();
  });

  it('refuses self-deletion', async () => {
    agentFindUnique.mockResolvedValue({ ...PRISTINE, id: 1n });
    requireBrokerMock.mockResolvedValue({ ...BROKER, userId: 1n });
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    expect((await res.json()).error).toBe('refuse_self');
    expectNothingDeleted();
  });

  it('requires a typed confirm_email that matches the target', async () => {
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const missing = await POST(
      makeRequest({ url: 'http://test/api/crm/agents/6/purge', body: {}, method: 'POST' }),
      { params: Promise.resolve({ id: '6' }) });
    expect(missing.status).toBe(400);

    const wrong = await POST(purge({ confirm_email: 'someone-else@mallan.nyc' }),
      { params: Promise.resolve({ id: '6' }) });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error).toBe('confirm_email_mismatch');
    expectNothingDeleted();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('POST purge — atomicity and repetition', () => {
  it('rolls the WHOLE transaction back when a step fails midway', async () => {
    // agent.delete succeeds, then the audit write blows up.
    auditCreate.mockRejectedValue(new Error('audit write failed'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('purge_failed');
    expect(json.message).toMatch(/rolled back/i);
    expect(json.message).toMatch(/No records were deleted/i);
    errSpy.mockRestore();
  });

  it('a repeat purge of an already-deleted agent is a harmless 404', async () => {
    agentFindUnique.mockResolvedValue(null);
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: '6' }) });
    expect(res.status).toBe(404);
    expect(agentDelete).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric id before touching anything', async () => {
    const { POST } = await import('@/app/api/crm/agents/[id]/purge/route');
    const res = await POST(purge(), { params: Promise.resolve({ id: 'not-an-id' }) });
    expect(res.status).toBe(400);
    expect(txSpy).not.toHaveBeenCalled();
  });
});

describe('GET purge-preview — advisory and read-only', () => {
  it('reports eligibility, the static profile, and the retained media', async () => {
    const { GET } = await import('@/app/api/crm/agents/[id]/purge-preview/route');
    const res = await GET(
      makeRequest({ url: 'http://test/api/crm/agents/6/purge-preview', method: 'GET' }),
      { params: Promise.resolve({ id: '6' }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.can_purge).toBe(true);
    expect(json.blocked_by).toEqual({});
    expect(json.orphaned_media.r2_key).toBe('agents/caludia-milkowski/headshot.webp');
    expect(json.orphaned_media.note).toMatch(/never deletes R2/i);
    expect(json.advisory).toMatch(/re-checks/i);
  });

  it('writes nothing at all', async () => {
    const { GET } = await import('@/app/api/crm/agents/[id]/purge-preview/route');
    await GET(makeRequest({ url: 'http://test/api/crm/agents/6/purge-preview', method: 'GET' }),
      { params: Promise.resolve({ id: '6' }) });
    expect(agentDelete).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
    expect(txSpy).not.toHaveBeenCalled();
  });

  it('surfaces the static-roster consequence explicitly', async () => {
    const { GET } = await import('@/app/api/crm/agents/[id]/purge-preview/route');
    const res = await GET(makeRequest({ url: 'http://test/api/crm/agents/6/purge-preview', method: 'GET' }),
      { params: Promise.resolve({ id: '6' }) });
    const json = await res.json();
    // cmilkowski@mallan.nyc IS in data/agents.json — her public profile outlives the account.
    expect(json.static_profile_exists).toBe(true);
    expect(json.public_profile_will_remain).toBe(true);
    expect(json.static_profile_note).toMatch(/does not modify Git/);
  });
});
