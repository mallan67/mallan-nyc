/// <reference types="jest" />
/**
 * PUBLICATION HAS ITS OWN SERVER BOUNDARY.
 *
 * Three routes, three questions, and none of them may answer another's:
 *
 *   PATCH /api/crm/listings/[id]/status        COTALITY market status only
 *   PATCH /api/crm/listings/[id]               editable Mallan facts + owner
 *   PATCH /api/crm/listings/[id]/publication   the Mallan publication workflow
 *
 * `lib/crm/publication-state.ts` stays the single transition authority. This
 * route resolves the actor, gathers the facts the rules depend on, and persists
 * the decision — it re-implements no rule.
 *
 * These are BEHAVIOURAL: the real handler runs against a mocked Prisma and the
 * captured `update` payload is inspected. A source-grep would not catch the two
 * things most likely to go wrong here — role resolution across identity domains,
 * and compliance being evaluated against the wrong audience.
 */
process.env.READONLY_MODE = 'false';

const mockValidateSession = jest.fn();
const mockListingFindUnique = jest.fn();
const mockListingUpdate = jest.fn();
const mockLogAuditEvent = jest.fn();
const mockRevalidate = jest.fn();
const mockDualWrite = jest.fn();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: (a: unknown) => mockListingFindUnique(a),
      update: (a: unknown) => mockListingUpdate(a),
    },
  },
}));

jest.mock('@/lib/auth/session', () => {
  const actual = jest.requireActual('@/lib/auth/session');
  return { __esModule: true, ...actual, validateSession: (t: string) => mockValidateSession(t) };
});

jest.mock('@/lib/auth', () => {
  const actual = jest.requireActual('@/lib/auth');
  return { __esModule: true, ...actual, logAuditEvent: (...a: unknown[]) => mockLogAuditEvent(...a) };
});

jest.mock('@/lib/cache/public-cache', () => {
  const actual = jest.requireActual('@/lib/cache/public-cache');
  return { __esModule: true, ...actual, safeRevalidateTags: (...a: unknown[]) => mockRevalidate(...a) };
});

jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: (...a: unknown[]) => mockDualWrite(...a),
}));

import { NextRequest } from 'next/server';
import {
  PUBLICATION_NAMESPACE,
  type MallanPublication,
  type PublicationState,
} from '@/lib/crm/publication-state';

const BROKER = 10n;
const AGENT = 11n;
const OWNER = 501n;
const STRANGER = 999n;

function row(over: Record<string, unknown> = {}) {
  return {
    id: 7n,
    listing_id: 'SL-0004',
    mls_id: null,
    status: 'Draft',
    listing_type: 'sale',
    rls_eligible: false,
    agent_id: AGENT,
    owner_client_id: OWNER,
    address: { StreetNumber: '333', StreetName: 'E 46th St' },
    compliance: {},
    raw_data: { PublicRemarks: 'Sunny two bedroom with river views.' },
    internet_address_display_yn: true,
    internet_entire_listing_display_yn: true,
    list_office_name: 'Mallan Real Estate Inc.',
    list_office_mls_id: null,
    ...over,
  };
}

function withState(state: PublicationState, over: Record<string, unknown> = {}) {
  const pub: MallanPublication = {
    state,
    visibility: state === 'PUBLISHED_PUBLIC' ? 'PUBLIC_WEB' : 'INTERNAL_ONLY',
    history: [],
  };
  return row({ compliance: { [PUBLICATION_NAMESPACE]: pub }, ...over });
}

function asStaff(userId: bigint, role: string) {
  mockValidateSession.mockResolvedValue({ userId, userType: 'agent', role, sessionId: 's' });
}
function asLead(userId: bigint) {
  mockValidateSession.mockResolvedValue({ userId, userType: 'lead', role: 'seller', sessionId: 's' });
}

async function patch(body: Record<string, unknown>, id = 'SL-0004') {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/publication/route');
  const req = new NextRequest(`https://x.test/api/crm/listings/${id}/publication`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  req.cookies.set('session_token', 'tok');
  return PATCH(req, { params: Promise.resolve({ id }) });
}

/** The publication record actually written to the database. */
function persisted(): MallanPublication | undefined {
  const call = mockListingUpdate.mock.calls[0];
  if (!call) return undefined;
  return (call[0].data.compliance as Record<string, unknown>)[
    PUBLICATION_NAMESPACE
  ] as MallanPublication;
}

beforeEach(() => {
  jest.resetModules();
  for (const m of [
    mockValidateSession,
    mockListingFindUnique,
    mockListingUpdate,
    mockLogAuditEvent,
    mockRevalidate,
    mockDualWrite,
  ]) {
    m.mockReset();
  }
  mockListingUpdate.mockImplementation(async (a: { data: Record<string, unknown> }) => ({
    ...row(),
    ...a.data,
  }));
  mockLogAuditEvent.mockResolvedValue(undefined);
  mockDualWrite.mockResolvedValue(undefined);
});

describe('the workflow runs through the dedicated boundary', () => {
  it('an AGENT can submit a draft', async () => {
    asStaff(AGENT, 'AGENT');
    mockListingFindUnique.mockResolvedValue(withState('DRAFT'));
    const res = await patch({ to: 'SUBMITTED' });
    expect(res.status).toBe(200);
    expect(persisted()?.state).toBe('SUBMITTED');
  });

  it('a BROKER can approve after the compliance check', async () => {
    asStaff(BROKER, 'BROKER');
    mockListingFindUnique.mockResolvedValue(withState('COMPLIANCE_CHECK'));
    const res = await patch({ to: 'APPROVED' });
    expect(res.status).toBe(200);
    expect(persisted()?.state).toBe('APPROVED');
  });

  it('and the transition is recorded in the audit trail', async () => {
    asStaff(BROKER, 'BROKER');
    mockListingFindUnique.mockResolvedValue(withState('COMPLIANCE_CHECK'));
    await patch({ to: 'APPROVED' });
    expect(mockLogAuditEvent).toHaveBeenCalled();
    expect(mockLogAuditEvent.mock.calls[0][0]).toBe('listing_publication_transition');
  });
});

describe('role is resolved across identity domains, not from a string', () => {
  it('an AGENT cannot approve', async () => {
    asStaff(AGENT, 'AGENT');
    mockListingFindUnique.mockResolvedValue(withState('COMPLIANCE_CHECK'));
    const res = await patch({ to: 'APPROVED' });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('ACTOR_NOT_PERMITTED');
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });

  it('the OWNER can submit their own intake', async () => {
    asLead(OWNER);
    mockListingFindUnique.mockResolvedValue(withState('DRAFT'));
    const res = await patch({ to: 'SUBMITTED' });
    expect(res.status).toBe(200);
    expect(persisted()?.history[0].role).toBe('OWNER');
  });

  it('the OWNER cannot publish', async () => {
    asLead(OWNER);
    mockListingFindUnique.mockResolvedValue(withState('APPROVED'));
    const res = await patch({ to: 'PUBLISHED_PUBLIC' });
    expect(res.status).toBe(403);
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });

  it('a lead carrying role "BROKER" is still only an owner', async () => {
    // The trust boundary: a lead session can never hold staff authority, whatever
    // string its role happens to contain.
    mockValidateSession.mockResolvedValue({
      userId: OWNER,
      userType: 'lead',
      role: 'BROKER',
      sessionId: 's',
    });
    mockListingFindUnique.mockResolvedValue(withState('COMPLIANCE_CHECK'));
    const res = await patch({ to: 'APPROVED' });
    expect(res.status).toBe(403);
  });

  it('an unrelated lead is not a participant at all', async () => {
    asLead(STRANGER);
    mockListingFindUnique.mockResolvedValue(withState('DRAFT'));
    const res = await patch({ to: 'SUBMITTED' });
    expect(res.status).toBe(403);
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });
});

describe('compliance is evaluated against the TARGET audience', () => {
  it('discriminatory text blocks public publication', async () => {
    asStaff(BROKER, 'BROKER');
    mockListingFindUnique.mockResolvedValue(
      withState('APPROVED', {
        raw_data: { PublicRemarks: 'Great for a young christian couple, no kids.' },
      }),
    );
    const res = await patch({ to: 'PUBLISHED_PUBLIC' });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('COMPLIANCE_NOT_PASSED');
    // The CRM must be able to show WHAT failed, not merely that something did.
    expect(json.compliance.failures.some((f: { code: string }) => f.code === 'FH-001')).toBe(true);
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });

  it('the SAME text does not block an internal submit', async () => {
    // Nothing is advertised to anyone yet. The rule attaches to the audience.
    asStaff(AGENT, 'AGENT');
    mockListingFindUnique.mockResolvedValue(
      withState('DRAFT', {
        raw_data: { PublicRemarks: 'Great for a young christian couple, no kids.' },
      }),
    );
    const res = await patch({ to: 'SUBMITTED' });
    expect(res.status).toBe(200);
  });

  it('a suppressed address blocks public publication', async () => {
    asStaff(BROKER, 'BROKER');
    mockListingFindUnique.mockResolvedValue(
      withState('APPROVED', {
        rls_eligible: true,
        internet_address_display_yn: false,
      }),
    );
    const res = await patch({ to: 'PUBLISHED_PUBLIC' });
    expect(res.status).toBe(409);
    expect((await res.json()).compliance.failures.some((f: { code: string }) => f.code === 'ADDR-001')).toBe(true);
  });
});

describe('this route does not touch market status', () => {
  it('the update writes ONLY compliance', async () => {
    asStaff(AGENT, 'AGENT');
    mockListingFindUnique.mockResolvedValue(withState('DRAFT'));
    await patch({ to: 'SUBMITTED' });
    expect(Object.keys(mockListingUpdate.mock.calls[0][0].data)).toEqual(['compliance']);
  });

  it('and does NOT stamp modification_timestamp', async () => {
    // That column feeds the Cotality incremental cursor. Stamping it for a
    // Mallan-internal workflow move would poison the sync for a change the
    // provider never made.
    asStaff(AGENT, 'AGENT');
    mockListingFindUnique.mockResolvedValue(withState('DRAFT'));
    await patch({ to: 'SUBMITTED' });
    expect(mockListingUpdate.mock.calls[0][0].data.modification_timestamp).toBeUndefined();
  });

  it('sibling compliance keys survive the write', async () => {
    asStaff(AGENT, 'AGENT');
    mockListingFindUnique.mockResolvedValue(
      withState('DRAFT', {
        compliance: {
          [PUBLICATION_NAMESPACE]: { state: 'DRAFT', visibility: 'INTERNAL_ONLY', history: [] },
          validation_result: { ok: true },
          mallan_control_verification: { by: 'broker-1' },
        },
      }),
    );
    await patch({ to: 'SUBMITTED' });
    const written = mockListingUpdate.mock.calls[0][0].data.compliance as Record<string, unknown>;
    expect(written.validation_result).toEqual({ ok: true });
    expect(written.mallan_control_verification).toEqual({ by: 'broker-1' });
  });
});

describe('cache is invalidated only when the public surface changes', () => {
  it('an internal move does not bust the public cache', async () => {
    asStaff(AGENT, 'AGENT');
    mockListingFindUnique.mockResolvedValue(withState('DRAFT'));
    await patch({ to: 'SUBMITTED' });
    expect(mockRevalidate).not.toHaveBeenCalled();
    expect(mockDualWrite).not.toHaveBeenCalled();
  });

  it('going public does', async () => {
    asStaff(BROKER, 'BROKER');
    mockListingFindUnique.mockResolvedValue(withState('APPROVED'));
    const res = await patch({ to: 'PUBLISHED_PUBLIC' });
    expect(res.status).toBe(200);
    expect(mockRevalidate).toHaveBeenCalled();
  });
});

describe('a Cotality-sourced listing has no Mallan publication workflow', () => {
  it('is refused', async () => {
    // The provider decides what that listing is, and the next sync would
    // overwrite anything written here.
    asStaff(BROKER, 'BROKER');
    mockListingFindUnique.mockResolvedValue(
      withState('DRAFT', {
        listing_id: 'RLS20093870',
        mls_id: 'RLS20093870',
        rls_eligible: true,
        list_office_mls_id: 'OTHER',
      }),
    );
    const res = await patch({ to: 'SUBMITTED' }, 'RLS20093870');
    expect(res.status).toBe(403);
    expect(mockListingUpdate).not.toHaveBeenCalled();
  });
});

describe('input validation', () => {
  it('an unknown target state is a 400, not a 500', async () => {
    asStaff(BROKER, 'BROKER');
    mockListingFindUnique.mockResolvedValue(withState('DRAFT'));
    expect((await patch({ to: 'PUBLISHED_EVERYWHERE' })).status).toBe(400);
  });

  it('an unknown visibility is a 400', async () => {
    asStaff(BROKER, 'BROKER');
    mockListingFindUnique.mockResolvedValue(withState('DRAFT'));
    expect((await patch({ to: 'SUBMITTED', visibility: 'EVERYONE' })).status).toBe(400);
  });

  it('EXPORTED cannot be reached through this route at all', async () => {
    // No authorized exporter exists, so the route can never honestly supply
    // delivery evidence.
    asStaff(BROKER, 'BROKER');
    mockListingFindUnique.mockResolvedValue(withState('PUBLISHED_PUBLIC'));
    const res = await patch({ to: 'EXPORTED' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('EXPORT_DELIVERY_UNAVAILABLE');
  });
});
