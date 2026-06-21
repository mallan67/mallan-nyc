/// <reference types="jest" />
/**
 * Phase C — CRM PATCH must PRESERVE typed agent attribution (Codex #420 blocker).
 *
 * After Phase C, agent_info JSON is frozen/absent, so the live attribution is in the 8
 * typed columns. The PATCH route must NOT re-derive typed columns from the stale `{}`
 * agent_info on an unrelated edit (that would null them), and must not replace a Mallan
 * exclusive's manual typed override with the owning Agent row.
 *
 * BEHAVIORAL: invoke the real PATCH handler with mocked prisma/auth; inspect the captured
 * `listing.update` data payload. Status = "Draft" so the RLS 48-field gate is skipped and
 * the update path runs.
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
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: async () => undefined }));
jest.mock('@/lib/crm/listing-urls', () => ({ __esModule: true, buildListingUrls: () => ({ publicUrl: '/listing/x', realPlusUrl: 'https://realplus/x' }) }));

// Existing typed attribution on the row; agent_info JSON is empty (post-Phase-C).
function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 101n, listing_id: 'RLS-PHC-1', mls_id: 'RLS12345', status: 'Draft',
    rls_eligible: true, listing_type: 'rent', agent_id: null,
    raw_data: {}, address: {}, features: {}, internet_address_display_yn: false,
    agent_info: {},                                  // ← frozen/empty post-Phase-C
    list_agent_full_name: 'Existing Agent', list_office_name: 'Compass',
    list_agent_email: 'existing@compass.com', list_agent_direct_phone: '212-555-1111',
    list_office_mls_id: 'OFF-EXIST', list_agent_mls_id: 'AG-EXIST',
    co_list_office_mls_id: null, co_list_agent_mls_id: null,
    ...overrides,
  };
}

let captured: Record<string, unknown> | null = null;
function setRow(row: Record<string, unknown>) {
  const m = prismaMock as { listing: { findUnique: jest.Mock; update: jest.Mock } };
  m.listing.findUnique = jest.fn(async () => row);
  m.listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => {
    captured = args.data;
    return { ...row, ...args.data };
  });
}

async function callPatch(body: unknown, id = '101'): Promise<Response> {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  const req = new Request(`http://localhost/api/crm/listings/${id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  captured = null;
  requireAgentOrBrokerMock.mockReset().mockResolvedValue({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 't' });
  isAuthErrorMock.mockReset().mockReturnValue(false);
  logAuditEventMock.mockReset().mockResolvedValue(undefined);
});

describe('Phase C — PATCH preserves typed agent attribution', () => {
  it('third-party, unrelated field edit: typed columns untouched, agent_info NOT written', async () => {
    setRow(baseRow());
    const res = await callPatch({ PropertyType: 'Residential' }); // no agent fields
    expect(res.status).not.toBe(422);
    expect(captured).not.toBeNull();
    // typed columns are NOT in the update payload → DB values preserved
    expect(captured).not.toHaveProperty('list_office_name');
    expect(captured).not.toHaveProperty('list_agent_email');
    expect(captured).not.toHaveProperty('list_agent_full_name');
    // agent_info JSON is never written
    expect(captured).not.toHaveProperty('agent_info');
  });

  it('third-party, explicit agent field change: typed columns updated, agent_info NOT written', async () => {
    setRow(baseRow());
    const res = await callPatch({ ListOfficeName: 'New Brokerage LLC', PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
    expect(captured!.list_office_name).toBe('New Brokerage LLC');
    // unchanged agent fields keep their existing typed value (seeded from typed columns)
    expect(captured!.list_agent_email).toBe('existing@compass.com');
    expect(captured).not.toHaveProperty('agent_info');
  });

  it('Mallan exclusive, unrelated edit: manual typed override NOT replaced by owning Agent row', async () => {
    const m = prismaMock as { agent: { findUnique: jest.Mock } };
    m.agent.findUnique = jest.fn(async () => ({
      id: 5n, full_name: 'Owning Agent', first_name: 'Owning', last_name: 'Agent',
      email: 'owner@mallan.nyc', phone: '646-000-0000',
    }));
    setRow(baseRow({
      listing_id: 'SL-0001', rls_eligible: false, agent_id: 5n,
      list_agent_full_name: 'Manual Override Name', list_office_name: 'Mallan Real Estate Inc.',
      list_agent_email: 'manual@mallan.nyc',
    }));
    const res = await callPatch({ PropertyType: 'Residential' }); // unrelated edit
    expect(res.status).not.toBe(422);
    // exclusive re-stamp seeded from existing typed values → manual override survives
    expect(captured!.list_agent_full_name).toBe('Manual Override Name');
    expect(captured!.list_agent_email).toBe('manual@mallan.nyc');
    expect(captured).not.toHaveProperty('agent_info');
  });

  it('Mallan exclusive with a blank typed field: that blank is filled from the Agent row', async () => {
    const m = prismaMock as { agent: { findUnique: jest.Mock } };
    m.agent.findUnique = jest.fn(async () => ({
      id: 5n, full_name: 'Owning Agent', first_name: 'Owning', last_name: 'Agent',
      email: 'owner@mallan.nyc', phone: '646-000-0000',
    }));
    setRow(baseRow({
      listing_id: 'SL-0002', rls_eligible: false, agent_id: 5n,
      list_agent_full_name: 'Manual Override Name', list_office_name: 'Mallan Real Estate Inc.',
      list_agent_email: null, list_agent_direct_phone: null, // blank → fillable
    }));
    const res = await callPatch({ PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
    expect(captured!.list_agent_full_name).toBe('Manual Override Name'); // manual wins
    expect(captured!.list_agent_email).toBe('owner@mallan.nyc');         // blank filled from Agent row
    expect(captured).not.toHaveProperty('agent_info');
  });
});
