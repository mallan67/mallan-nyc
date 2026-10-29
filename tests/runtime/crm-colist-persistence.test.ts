/// <reference types="jest" />
/**
 * Co-listing agents and offices persist on Mallan listings with no schema change.
 *
 * Live Cotality (2026-10-06): Property keeps up to three co-listing agents (CoListAgent, CoListAgent2, CoListAgent3) and two co-listing
 * offices (CoListOffice, CoListOffice2), separate from the primary ListAgent and ListOffice fields, and independent of the listing agreement.
 *
 * Storage: the create and edit routes keep EVERY submitted key in the listing's existing raw_data JSON, so all co-list slots persist there.
 * Slot 1's two MLS IDs also have typed columns (co_list_agent_mls_id, co_list_office_mls_id); before this change nothing wrote them for a
 * Mallan listing: the persistence map left the keys out of the agent bucket on create, and the edit route's agent key list left them out on
 * edit, so a typed-first reader (hydration, DTOs, syndication) saw stale or empty values after an edit.
 */
import { buildPrismaMock } from './helpers';
import { normalizePayload, buildPersistenceRecord } from '@/lib/compliance/normalizer';
import { typedAgentColumnsFromJson } from '@/lib/listings/agent-info-typed-columns';
import { buildExclusiveAgentAssignment } from '@/lib/listings/exclusive-agent-assignment';

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

// What the forms send (MallanCoList.collect): three agents and two offices, '' for unused slots.
const THREE_AGENTS_TWO_OFFICES = {
  CoListAgentMlsId: '108207', CoListAgentFullName: 'Caroline Gruchawka', CoListAgentKey: '25233925',
  CoListAgent2MlsId: '97052', CoListAgent2FullName: 'Paeder Alexander Varnam', CoListAgent2Key: '25211111',
  CoListAgent3MlsId: '94043', CoListAgent3FullName: 'Angelina C Martinez', CoListAgent3Key: '25222222',
  CoListOfficeMlsId: '7222', CoListOfficeName: 'Compass', CoListOfficeKey: '5658932',
  CoListOffice2MlsId: '334', CoListOffice2Name: 'Corcoran Group', CoListOffice2Key: '5658936',
};
const NO_COLIST = Object.fromEntries(Object.keys(THREE_AGENTS_TWO_OFFICES).map((k) => [k, '']));

describe('create: the co-list MLS IDs reach the typed columns, every slot reaches raw_data', () => {
  const payload = { PropertyType: 'Residential', ListAgentMlsId: '39361', ListAgentFullName: 'Maya Allan', ...THREE_AGENTS_TWO_OFFICES };

  it('routes CoListAgentMlsId and CoListOfficeMlsId into the agent bucket and keeps the other slots in raw_data only', () => {
    const { normalized } = normalizePayload(payload);
    const record = buildPersistenceRecord(normalized);
    expect(record.agentInfo).toMatchObject({ ListAgentMlsId: '39361', CoListAgentMlsId: '108207', CoListOfficeMlsId: '7222' });
    for (const key of ['CoListAgentFullName', 'CoListAgent2MlsId', 'CoListAgent3MlsId', 'CoListOffice2MlsId', 'CoListOffice2Name']) {
      expect(record.agentInfo).not.toHaveProperty(key);
    }
    expect(record.raw_data).toMatchObject(THREE_AGENTS_TWO_OFFICES);
  });

  it('the typed columns hold slot 1 only, and the primary agent columns stay separate', () => {
    const { normalized } = normalizePayload(payload);
    const typed = typedAgentColumnsFromJson(buildPersistenceRecord(normalized).agentInfo);
    expect(typed.co_list_agent_mls_id).toBe('108207');
    expect(typed.co_list_office_mls_id).toBe('7222');
    expect(typed.list_agent_mls_id).toBe('39361');
    expect(typed.list_agent_full_name).toBe('Maya Allan');
  });

  it('the Mallan-exclusive stamp keeps the co-list identifiers the form sent', () => {
    const { normalized } = normalizePayload(payload);
    const agentInfo = buildPersistenceRecord(normalized).agentInfo;
    const assignment = buildExclusiveAgentAssignment(
      { id: 5n, full_name: 'Maya Allan', first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc', phone: '646-000-0000' },
      { listing_id: 'SL-0001', rls_eligible: false },
      agentInfo,
    );
    const typed = typedAgentColumnsFromJson((assignment?.agent_info ?? agentInfo) as Record<string, unknown>);
    expect(typed.co_list_agent_mls_id).toBe('108207');
    expect(typed.co_list_office_mls_id).toBe('7222');
  });

  it('a listing with no co-listing agent stores nulls, never empty strings', () => {
    const { normalized } = normalizePayload({ PropertyType: 'Residential', ...NO_COLIST });
    const typed = typedAgentColumnsFromJson(buildPersistenceRecord(normalized).agentInfo);
    expect(typed.co_list_agent_mls_id).toBeNull();
    expect(typed.co_list_office_mls_id).toBeNull();
  });
});

function mallanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 303n, listing_id: 'SL-0303', mls_id: null, status: 'Draft', rls_eligible: false, listing_type: 'sale', agent_id: 5n,
    raw_data: {}, address: {}, features: {}, internet_address_display_yn: false, agent_info: {},
    list_agent_full_name: 'Maya Allan', list_office_name: 'Mallan Real Estate Inc.', list_agent_email: 'maya@mallan.nyc', list_agent_direct_phone: '646-000-0000',
    list_office_mls_id: '7041', list_agent_mls_id: '39361', co_list_office_mls_id: null, co_list_agent_mls_id: null,
    ...overrides,
  };
}

let captured: Record<string, unknown> | null = null;
function setRow(row: Record<string, unknown>) {
  const m = prismaMock as { listing: { findUnique: jest.Mock; update: jest.Mock }; agent: { findUnique: jest.Mock } };
  m.agent.findUnique = jest.fn(async () => ({ id: 5n, full_name: 'Maya Allan', first_name: 'Maya', last_name: 'Allan', email: 'maya@mallan.nyc', phone: '646-000-0000' }));
  m.listing.findUnique = jest.fn(async () => row);
  m.listing.update = jest.fn(async (args: { data: Record<string, unknown> }) => {
    captured = args.data;
    return { ...row, ...args.data };
  });
}
async function patch(body: unknown, id = '303'): Promise<Response> {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  const req = new Request(`http://localhost/api/crm/listings/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  captured = null;
  requireAgentOrBrokerMock.mockReset().mockResolvedValue({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 't' });
  isAuthErrorMock.mockReset().mockReturnValue(false);
  logAuditEventMock.mockReset().mockResolvedValue(undefined);
});

describe('edit (PATCH): the typed co-list columns follow the form, raw_data keeps every slot', () => {
  it('writes the slot 1 MLS IDs to the typed columns and every slot to raw_data', async () => {
    setRow(mallanRow());
    const res = await patch({ PropertyType: 'Residential', ...THREE_AGENTS_TWO_OFFICES });
    expect(res.status).not.toBe(422);
    expect(captured!.co_list_agent_mls_id).toBe('108207');
    expect(captured!.co_list_office_mls_id).toBe('7222');
    expect(captured!.raw_data).toMatchObject(THREE_AGENTS_TWO_OFFICES);
    // the primary side is untouched and separate
    expect(captured!.list_agent_mls_id).toBe('39361');
    expect(captured!.list_agent_full_name).toBe('Maya Allan');
  });

  it('changing the co-listing agent replaces the stored value (the edit is not lost on reload)', async () => {
    setRow(mallanRow({ co_list_agent_mls_id: '108207', co_list_office_mls_id: '7222', raw_data: { ...THREE_AGENTS_TWO_OFFICES } }));
    const res = await patch({ PropertyType: 'Residential', ...THREE_AGENTS_TWO_OFFICES, CoListAgentMlsId: '555', CoListAgentFullName: 'Someone Else', CoListOfficeMlsId: '51', CoListOfficeName: 'Douglas Elliman Real Estate' });
    expect(res.status).not.toBe(422);
    expect(captured!.co_list_agent_mls_id).toBe('555');
    expect(captured!.co_list_office_mls_id).toBe('51');
    expect((captured!.raw_data as Record<string, unknown>).CoListAgent2MlsId).toBe('97052'); // slots the edit did not change survive
  });

  it('removing every co-listing agent clears the typed columns and the stored slots', async () => {
    setRow(mallanRow({ co_list_agent_mls_id: '108207', co_list_office_mls_id: '7222', raw_data: { ...THREE_AGENTS_TWO_OFFICES } }));
    const res = await patch({ PropertyType: 'Residential', ...NO_COLIST });
    expect(res.status).not.toBe(422);
    expect(captured!.co_list_agent_mls_id).toBeNull();
    expect(captured!.co_list_office_mls_id).toBeNull();
    expect(captured!.raw_data).toMatchObject(NO_COLIST);
  });

  it('an edit that does not carry co-list keys leaves the typed co-list columns and the stored slots alone', async () => {
    setRow(mallanRow({ co_list_agent_mls_id: '108207', co_list_office_mls_id: '7222', raw_data: { ...THREE_AGENTS_TWO_OFFICES } }));
    const res = await patch({ PropertyType: 'Residential' });
    expect(res.status).not.toBe(422);
    expect(captured!.co_list_agent_mls_id).toBe('108207');
    expect(captured!.co_list_office_mls_id).toBe('7222');
    expect(captured!.raw_data).toMatchObject(THREE_AGENTS_TWO_OFFICES);
  });

  it('a synced third-party listing is still source-owned: co-list keys cannot rewrite it', async () => {
    setRow(mallanRow({ listing_id: 'RLS-1', mls_id: 'RLS12345', rls_eligible: true, agent_id: null }));
    const res = await patch({ PropertyType: 'Residential', ...THREE_AGENTS_TWO_OFFICES });
    expect(res.status).toBe(403);
    expect(captured).toBeNull();
  });
});
