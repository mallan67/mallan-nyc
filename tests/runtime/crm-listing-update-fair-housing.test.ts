/// <reference types="jest" />
/**
 * Fair Housing scan on every EDIT of a listing (PATCH /api/crm/listings/[id]).
 *
 * Found 2026-10-08 (an adversarial audit, then read from the route): POST /api/crm/listings scans the free text it is given and answers 422, but PATCH did not scan anything. The RLS gate PATCH runs skips
 * every draft and every CRM-created listing (no mls_id), and the validator's verdict there is recorded but never blocks, so a clean listing could be edited to say "adults only, no Section 8" and the text
 * was written to raw_data and the features bucket. Federal FHA, NY State HRL and NYC HRL Title 8 apply to all advertising, whatever the listing's status or RLS eligibility.
 *
 * Behavioral: the real PATCH handler with mocked prisma/auth; the real scan runs, so the 422 (and the absence of a write) is observed.
 */
import { buildPrismaMock } from './helpers';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

const requireAgentOrBrokerMock: jest.Mock = jest.fn();
const isAuthErrorMock: jest.Mock = jest.fn();
const logAuditEventMock: jest.Mock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (req: unknown): Promise<unknown> => requireAgentOrBrokerMock(req),
  isAuthError: (v: unknown): boolean => Boolean(isAuthErrorMock(v)),
  logAuditEvent: (...args: unknown[]): Promise<void> => logAuditEventMock(...args),
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: async () => undefined }));
jest.mock('@/lib/crm/listing-urls', () => ({ __esModule: true, buildListingUrls: () => ({ publicUrl: '/listing/x', realPlusUrl: 'https://realplus/x' }) }));

// A Mallan-authored local listing (SL- prefix), the only kind PATCH manages. `mls_id: null` is a CRM-created exclusive, which the RLS gate skips.
function localListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 101n, listing_id: 'SL-FH-1', mls_id: null, status: 'Draft', rls_eligible: true, listing_type: 'sale', agent_id: null,
    list_office_mls_id: null, last_synced_from_trestle: null, raw_data: {} as Record<string, unknown>, address: {}, features: {}, agent_info: {}, internet_address_display_yn: false,
    ...overrides,
  };
}
const withListing = (overrides: Record<string, unknown> = {}) => {
  const listing = prismaMock as { listing: { findUnique: jest.Mock; update: jest.Mock } };
  listing.listing.findUnique = jest.fn(async () => localListing(overrides));
  listing.listing.update = jest.fn(async () => ({ ...localListing(overrides), status: 'Draft' }));
  return listing.listing;
};
async function callPatch(body: unknown): Promise<Response> {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  const req = new Request('http://localhost/api/crm/listings/101', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(req, { params: Promise.resolve({ id: '101' }) });
}
type Refusal = { error: string; blockers: Array<{ code: string; field: string; message: string }> };

beforeEach(() => {
  requireAgentOrBrokerMock.mockReset();
  isAuthErrorMock.mockReset();
  logAuditEventMock.mockReset();
  requireAgentOrBrokerMock.mockResolvedValue({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 'test' });
  isAuthErrorMock.mockReturnValue(false);
  logAuditEventMock.mockResolvedValue(undefined);
});

describe('PATCH /api/crm/listings/[id]: a Fair Housing violation in the text of an edit is refused and nothing is written', () => {
  it.each([
    ['a draft', { status: 'Draft' }],
    ['an Incomplete draft', { status: 'Incomplete' }],
    ['an Active CRM-created exclusive (no mls_id: the RLS gate skips it)', { status: 'Active' }],
    ['an Active listing that has an mls_id and is rental', { status: 'Active', mls_id: 'RLS123', listing_type: 'rent' }],
    ['a website-only listing', { status: 'Active', rls_eligible: false }],
  ])('%s: PublicRemarks "adults only, no Section 8" answers 422 and the row is not updated', async (_name, overrides) => {
    const row = withListing(overrides);
    const res = await callPatch({ PublicRemarks: 'Quiet building, adults only. No Section 8.' });
    expect(res.status).toBe(422);
    const json = (await res.json()) as Refusal;
    expect(json.error).toBe('Update blocked by Fair Housing content gate');
    expect(json.blockers.length).toBeGreaterThan(0);
    expect(json.blockers.every((b) => b.code === 'FH-001' && b.field === 'PublicRemarks')).toBe(true);
    expect(json.blockers.map((b) => b.message).join(' ')).toMatch(/"[Aa]dults only"/);
    expect(row.update).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it.each([['ShowingInstructions', 'ShowingInstructions'], ['PrivateRemarks', 'PrivateRemarks'], ['description', 'PublicRemarks'], ['privateRemarks', 'PrivateRemarks']])(
    'the text posted as %s is scanned as %s (the accepted aliases are resolved first)', async (key, slot) => {
      const row = withListing();
      const res = await callPatch({ [key]: 'Tenant must pass background check. No felonies.' });
      expect(res.status).toBe(422);
      expect(((await res.json()) as Refusal).blockers.some((b) => b.field === slot)).toBe(true);
      expect(row.update).not.toHaveBeenCalled();
    });

  it.each([['agentRemarks', 'Adults only, no felonies.'], ['showingInstructions', 'No Section 8.'], ['webHeadline', 'Active adult 55+ — no CityFHEPS.'], ['saleBrokerComments', 'Seniors only'], ['saleTHOtherRemarks', 'No CityFHEPS']])(
    'the form\'s own free-text box %s is scanned and named raw:%s', async (key, text) => {
      const row = withListing();
      const res = await callPatch({ [key]: text });
      expect(res.status).toBe(422);
      expect(((await res.json()) as Refusal).blockers.some((b) => b.field === `raw:${key}`)).toBe(true);
      expect(row.update).not.toHaveBeenCalled();
    });

  // found 2026-10-09 by an independent review: these five boxes post under ids that do not name free text, and the scan did not read them (the existing test of the page even asserted that "No children please" in
  // the layout box saves). A rental building's "Min. income" ("40x monthly rent") and "Max. occupants" ("2 per bedroom") are where "no vouchers" and "no children" get typed.
  it.each([['saleTHLayout', 'Adults only'], ['saleTHFinancing', 'No vouchers accepted'], ['rentalTHLayout', 'No children please'], ['bldgMinIncome', '40x monthly rent, no vouchers'], ['bldgMaxOccupants', 'no children']])(
    'the box %s, whose id does not name free text, is scanned and named raw:%s', async (key, text) => {
      const row = withListing();
      const res = await callPatch({ [key]: text });
      expect(res.status).toBe(422);
      expect(((await res.json()) as Refusal).blockers.some((b) => b.field === `raw:${key}`)).toBe(true);
      expect(row.update).not.toHaveBeenCalled();
    });

  it.each([['saleTHLayout', 'Open plan living room, two bedrooms on the garden side.'], ['bldgMinIncome', '40x monthly rent'], ['bldgMaxOccupants', '2 per bedroom']])('the same boxes with ordinary text (%s) are saved', async (key, text) => {
    const row = withListing();
    const res = await callPatch({ [key]: text });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledTimes(1);
  });

  it.each([[{ PublicRemarks: ['Adults only. No Section 8.'] }, 'PublicRemarks'], [{ ShowingInstructions: { text: 'No felonies' } }, 'ShowingInstructions'], [{ PrivateRemarks: ['x'] }, 'PrivateRemarks'], [{ description: ['No children'] }, 'PublicRemarks']])(
    'a remark slot that is not text (%j) answers 400, because the scan reads text only and the public page calls string methods on it', async (body, slot) => {
      const row = withListing();
      const res = await callPatch(body);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(`${slot} must be text`);
      expect(row.update).not.toHaveBeenCalled();
    });

  it('a remark slot set to null or to an empty string is text (clearing a remark is allowed)', async () => {
    const row = withListing();
    const res = await callPatch({ PublicRemarks: '', PrivateRemarks: null });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledTimes(1);
  });

  it('the scan runs before the RLS gate, so an RLS-eligible Active listing with an mls_id and a thin payload is told about the text first', async () => {
    withListing({ status: 'Active', mls_id: 'RLS123' });
    const res = await callPatch({ PublicRemarks: 'Adults only.' });
    expect(res.status).toBe(422);
    expect(((await res.json()) as Refusal).error).toBe('Update blocked by Fair Housing content gate');
  });
});

describe('PATCH /api/crm/listings/[id]: clean text, structured values and the text the request does not carry are saved as before', () => {
  it('clean remarks are saved: 200, the row is updated, and the text is in raw_data', async () => {
    const row = withListing({ status: 'Active' });
    const res = await callPatch({ PublicRemarks: 'Sun-filled corner one-bedroom with a renovated kitchen, close to the express train.', ListPrice: 1200000 });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledTimes(1);
    const data = (row.update.mock.calls[0][0] as { data: { raw_data: Record<string, unknown> } }).data;
    expect(data.raw_data.PublicRemarks).toContain('Sun-filled corner one-bedroom');
  });

  it('a structured value that merely reads like a protected class ("Active Adult" property type) is not scanned', async () => {
    const row = withListing();
    const res = await callPatch({ property_sub_type: 'Active Adult', PublicRemarks: 'Sunny renovated one-bedroom near the park.' });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledTimes(1);
  });

  it('an edit that carries no text is not refused for text already stored: the scan reads the request, not the record', async () => {
    const row = withListing({ raw_data: { PublicRemarks: 'Adults only.' } });
    const res = await callPatch({ ListPrice: 999000 });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledTimes(1);
  });

  it('an edit that REPLACES flagged text with clean text is saved', async () => {
    const row = withListing({ raw_data: { PublicRemarks: 'Adults only.' } });
    const res = await callPatch({ PublicRemarks: 'Bright, quiet and close to everything.' });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledTimes(1);
  });
});

describe('PATCH /api/crm/listings/[id]: where the scan sits', () => {
  it('is in the handler after the body is read and before the record is merged, any gate runs or anything is written', () => {
    const src = readFileSync(resolve(__dirname, '../../app/api/crm/listings/[id]/route.ts'), 'utf8');
    const patch = src.slice(src.indexOf('export async function PATCH'), src.indexOf('export async function DELETE'));
    const bodyRead = patch.indexOf('body = await req.json()');
    const scan = patch.indexOf('scanListingBodyForFairHousing(body)');
    expect(bodyRead).toBeGreaterThan(-1);
    expect(scan).toBeGreaterThan(bodyRead);
    for (const later of ['const merged =', 'classifyRlsEligibility(', 'assertRlsCompliantPayload(', 'validateListing(', 'prisma.listing.update(']) {
      expect(patch.indexOf(later)).toBeGreaterThan(scan);
    }
    expect(patch.slice(scan, scan + 400)).toMatch(/status:\s*422/);
  });
});
