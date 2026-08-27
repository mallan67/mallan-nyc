/// <reference types="jest" />
/**
 * PATCH MUST BE ABLE TO REPAIR THE OWNER, AND MUST STOP DESTROYING compliance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEFECT 1 — THE OWNER WORKFLOW DEAD-ENDS AT CREATE
 *
 * `POST /api/crm/listings` accepts `owner_client_id`, authorises it with
 * `assertLeadAccess`, and persists it. The status route then refuses to publish
 * a Mallan-local listing that has none (409 OWNER_REQUIRED_BEFORE_PUBLICATION).
 *
 * But `app/api/crm/listings/[id]/route.ts` contains the string
 * `owner_client_id` ZERO times. There is no way to set, change, or repair the
 * owner after creation. Combined with the intake forms not sending it, every
 * form-created listing is ownerless AND permanently unpublishable — the guard
 * added in a2620927 became a trap rather than a prompt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEFECT 2 — EVERY AGENT EDIT WIPES THE compliance COLUMN
 *
 * The same route assigns a fresh five-key object with no spread of the loaded
 * value:
 *
 *     update.compliance = { validation_result, validated_at, warnings, valid,
 *                           rls_eligibility };
 *
 * So any other key under `compliance` is destroyed on every save. That is not
 * hypothetical: `lib/syndication/eligibility.ts:142` reads four authored
 * sub-objects (`syndication`, `mallan_control_verification`,
 * `seller_advertising_authorization`, `media_rights`), and
 * `app/api/crm/sales/listings/route.ts:63` reads a `Permissions` key — none of
 * which any writer produces, and all of which a single PATCH would erase.
 *
 * Every Cotality-driven update lane already preserves this column by OMITTING
 * the key (`complianceUpdatePatch()` in lib/idx/sync.ts). The CRM write path is
 * the one lane that clobbers it. It is also the blocker for putting any durable
 * Mallan publication state inside `compliance`, which is the next piece of work.
 */
import { buildPrismaMock } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

const requireAgentOrBrokerMock: jest.Mock = jest.fn();
const isAuthErrorMock: jest.Mock = jest.fn();
const logAuditEventMock: jest.Mock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (req: unknown): Promise<unknown> => requireAgentOrBrokerMock(req),
  isAuthError: (v: unknown): boolean => Boolean(isAuthErrorMock(v)),
  logAuditEvent: (...a: unknown[]): Promise<void> => logAuditEventMock(...a),
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: async () => undefined,
}));
jest.mock('@/lib/crm/listing-urls', () => ({
  __esModule: true,
  buildListingUrls: () => ({ publicUrl: '/listing/x', publicActiveUrl: '/listing/x' }),
}));

const AGENT = 7n;
const OTHER_AGENT = 8n;
const MY_CLIENT = 501n;
const THEIR_CLIENT = 999n;

/** A Mallan-authored local listing: SL- prefix, no provider id. */
function localRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 101n,
    listing_id: 'SL-0004',
    mls_id: null,
    status: 'Draft',
    rls_eligible: false,
    listing_type: 'sale',
    agent_id: AGENT,
    owner_client_id: null,
    raw_data: {},
    address: {},
    features: {},
    compliance: {},
    internet_address_display_yn: false,
    agent_info: {},
    list_agent_full_name: 'A Agent',
    list_office_name: 'Mallan Real Estate Inc.',
    list_agent_email: null,
    list_agent_direct_phone: null,
    list_office_mls_id: null,
    list_agent_mls_id: null,
    co_list_office_mls_id: null,
    co_list_agent_mls_id: null,
    ...overrides,
  };
}

let captured: Record<string, unknown> | null = null;

function setRow(row: Record<string, unknown>, leadFor?: Record<string, unknown> | null) {
  const m = prismaMock as {
    listing: { findUnique: jest.Mock; update: jest.Mock };
    lead: { findUnique: jest.Mock };
    agent: { findUnique: jest.Mock };
  };
  m.listing.findUnique = jest.fn(async () => row);
  m.listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => {
    captured = args.data;
    return { ...row, ...args.data };
  });
  m.lead.findUnique = jest.fn(async () => (leadFor === undefined ? null : leadFor));
  m.agent.findUnique = jest.fn(async () => ({
    id: AGENT,
    full_name: 'A Agent',
    first_name: 'A',
    last_name: 'Agent',
    email: 'a@mallan.nyc',
    phone: '212-555-0000',
  }));
}

async function callPatch(body: unknown, id = '101'): Promise<Response> {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  const req = new Request(`http://localhost/api/crm/listings/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  captured = null;
  requireAgentOrBrokerMock
    .mockReset()
    .mockResolvedValue({ role: 'AGENT', userId: AGENT, userType: 'agent', sessionId: 't' });
  isAuthErrorMock.mockReset().mockReturnValue(false);
  logAuditEventMock.mockReset().mockResolvedValue(undefined);
});

describe('PATCH can set the canonical owner', () => {
  it('persists owner_client_id on a Mallan-local listing', async () => {
    // The lead is on this agent's roster, so assertLeadAccess allows it.
    setRow(localRow(), { id: MY_CLIENT, agent_id: AGENT });
    const res = await callPatch({ owner_client_id: String(MY_CLIENT) });
    expect(res.status).toBe(200);
    expect(captured?.owner_client_id).toBe(MY_CLIENT);
  });

  it('leaves the owner alone when the key is absent', async () => {
    // An unrelated edit must not blank the owner.
    setRow(localRow({ owner_client_id: MY_CLIENT }));
    await callPatch({ PropertyType: 'Residential' });
    expect(captured).not.toBeNull();
    expect('owner_client_id' in (captured as object)).toBe(false);
  });

  it("refuses another agent's client", async () => {
    // assertLeadAccess: the lead belongs to a different agent's roster.
    setRow(localRow(), { id: THEIR_CLIENT, agent_id: OTHER_AGENT });
    const res = await callPatch({ owner_client_id: String(THEIR_CLIENT) });
    expect(res.status).toBe(403);
    expect(captured).toBeNull();
  });

  it('a BROKER has brokerage scope', async () => {
    requireAgentOrBrokerMock.mockResolvedValue({
      role: 'BROKER',
      userId: AGENT,
      userType: 'agent',
      sessionId: 't',
    });
    setRow(localRow(), { id: THEIR_CLIENT, agent_id: OTHER_AGENT });
    const res = await callPatch({ owner_client_id: String(THEIR_CLIENT) });
    expect(res.status).toBe(200);
    expect(captured?.owner_client_id).toBe(THEIR_CLIENT);
  });

  it('rejects a non-numeric owner id', async () => {
    setRow(localRow());
    const res = await callPatch({ owner_client_id: 'not-an-id' });
    expect(res.status).toBe(422);
    expect(captured).toBeNull();
  });
});

describe('clearing the owner', () => {
  it('is allowed on a draft', async () => {
    // An ownerless draft is a legal state, so un-assigning before publication
    // is a legitimate correction.
    setRow(localRow({ owner_client_id: MY_CLIENT, status: 'Draft' }));
    const res = await callPatch({ owner_client_id: null });
    expect(res.status).toBe(200);
    expect(captured?.owner_client_id).toBeNull();
  });

  it('is refused on a live listing', async () => {
    // Publication REQUIRES an owner. Allowing a clear afterwards would produce
    // exactly the state the publication guard exists to prevent, only reached
    // sideways — and it would silently cut the seller off from their own
    // listing, since the portal resolves through this column.
    setRow(localRow({ owner_client_id: MY_CLIENT, status: 'Active' }));
    const res = await callPatch({ owner_client_id: null });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('OWNER_REQUIRED_WHILE_PUBLISHED');
    expect(captured).toBeNull();
  });
});

describe('a provider-owned listing cannot become Mallan-owned', () => {
  it('is refused before any owner logic runs', async () => {
    // A Cotality row is source-owned. The capability gate already blocks the
    // whole handler; this pins that the owner path cannot become a way around
    // it.
    setRow(
      localRow({
        listing_id: 'RLS20093870',
        mls_id: 'RLS20093870',
        rls_eligible: true,
        list_office_mls_id: 'OTHER',
      }),
      { id: MY_CLIENT, agent_id: AGENT },
    );
    const res = await callPatch({ owner_client_id: String(MY_CLIENT) });
    expect(res.status).toBe(403);
    expect(captured).toBeNull();
  });
});

describe('PATCH preserves unknown keys under compliance', () => {
  it('does not destroy an authored sub-object', async () => {
    setRow(
      localRow({
        compliance: {
          mallan_control_verification: { verified_by: 'broker-1', at: '2026-08-01' },
          seller_advertising_authorization: { granted: true },
        },
      }),
      null,
    );
    await callPatch({ PropertyType: 'Residential' });
    const compliance = captured?.compliance as Record<string, unknown>;
    expect(compliance.mallan_control_verification).toEqual({
      verified_by: 'broker-1',
      at: '2026-08-01',
    });
    expect(compliance.seller_advertising_authorization).toEqual({ granted: true });
  });

  it('still writes the validation result', async () => {
    setRow(localRow({ compliance: { something_else: 1 } }), null);
    await callPatch({ PropertyType: 'Residential' });
    const compliance = captured?.compliance as Record<string, unknown>;
    expect(compliance).toHaveProperty('validation_result');
    expect(compliance).toHaveProperty('validated_at');
    expect(compliance).toHaveProperty('rls_eligibility');
    expect(compliance.something_else).toBe(1);
  });

  it('a non-object compliance value does not crash the merge', async () => {
    // Defensive: the column is Json, so a legacy row could hold anything.
    setRow(localRow({ compliance: null }), null);
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).toBe(200);
    expect(captured?.compliance).toHaveProperty('validation_result');
  });
});
