/// <reference types="jest" />
/**
 * Two records of one unit, and a video that never reached the site (Maya, 2026-11-05: 333 E 46th St #2G, "i have there two versions, i cannot tell which is which", an Update that "did nothing", and a
 * YouTube link typed into both video boxes that is "not there").
 *
 * The CRM holds the Mallan listing (SL-0004, Mallan-authored, the one the site shows) AND the REBNY / Cotality copy of the same unit (RLS20093870, owned by the feed). These tests run the real routes with a
 * mocked database and pin:
 *   - GET tells the form who owns the row (source_owned) and, for the feed's copy, which Mallan listing is its twin (the rule the public page uses to redirect it: exactly one proven local twin);
 *   - the feed's copy refuses every save (403 SOURCE_OWNED_LISTING), so the form must not offer one;
 *   - a SMALL save of just the video links on a live Mallan listing is accepted, keeps the rest of the record, writes no status, and what it stores is what the public record and the card badge read.
 */
import { buildPrismaMock } from './helpers';
import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';
import { hasVideo } from '@/lib/idx/display-adapter';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));

const requireAgentOrBrokerMock: jest.Mock = jest.fn();
const isAuthErrorMock: jest.Mock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: (req: unknown): Promise<unknown> => requireAgentOrBrokerMock(req),
  isAuthError: (v: unknown): boolean => Boolean(isAuthErrorMock(v)),
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: async () => undefined }));
jest.mock('@/lib/crm/listing-urls', () => ({ __esModule: true, buildListingUrls: () => ({ publicUrl: '/listing/x', realPlusUrl: 'https://realplus/x' }) }));

const ADDRESS = { StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46TH', StreetSuffix: 'Street', UnitNumber: '2G', City: 'New York City', StateOrProvince: 'NY', PostalCode: '10017', Borough: 'manhattan' };
const YOUTUBE = 'https://youtu.be/bawq6mNSd30';

const BASE = {
  list_price: 765000, bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 0, living_area: 860, property_type: 'Co-op', property_sub_type: 'Apartment', borough: 'manhattan', neighborhood: 'Turtle Bay',
  listing_type: 'sale', status: 'Active', rls_eligible: true, agent_id: null, owner_client_id: null, address: ADDRESS, features: {}, agent_info: {}, media: [],
  internet_address_display_yn: true, internet_entire_listing_display_yn: true, idx_display_yn: true, owner_opt_out: false, participant_only: false,
  listing_contract_date: new Date('2026-05-27'), modification_timestamp: new Date('2026-10-28'), created_at: new Date('2026-05-27'), updated_at: new Date('2026-10-28'),
};
// the Mallan listing the site shows: authored in the CRM form (SL- id), no feed sync
const MALLAN = { ...BASE, id: 4n, listing_id: 'SL-0004', mls_id: null, list_office_mls_id: null, last_synced_from_trestle: null, raw_data: { PublicRemarks: 'Our own description.', saleRlsId: 'RLS20093870' } };
// the feed's copy of the same unit: Mallan's office (7041), synced from Cotality
const FEED_COPY = { ...BASE, id: 312086n, listing_id: 'RLS20093870', mls_id: '1170236599', list_office_mls_id: '7041', last_synced_from_trestle: new Date('2026-11-01'), raw_data: { VirtualTourURLUnbranded: YOUTUBE } };
const localCandidate = (over: Record<string, unknown> = {}) => ({ listing_id: 'SL-0004', rls_eligible: true, list_office_mls_id: null, address: ADDRESS, borough: 'manhattan', internet_address_display_yn: true, internet_entire_listing_display_yn: true, idx_display_yn: true, status: 'Active', ...over });

function use(row: Record<string, unknown>, candidates: Record<string, unknown>[] = []) {
  const m = prismaMock as any;
  m.listing.findUnique = jest.fn(async (args: any) => {
    const w = args?.where || {};
    return (w.id !== undefined && w.id === row.id) || (w.listing_id !== undefined && w.listing_id === row.listing_id) ? row : null;
  });
  m.listing.findMany = jest.fn(async () => candidates);
  m.listing.update = jest.fn(async (args: any) => ({ ...row, ...args.data, id: row.id }));
}
const call = async (method: 'GET' | 'PATCH', id: string, body?: unknown): Promise<Response> => {
  const route = await import('@/app/api/crm/listings/[id]/route');
  const req = new Request(`http://localhost/api/crm/listings/${id}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return (route as any)[method](req, { params: Promise.resolve({ id }) });
};

beforeEach(() => {
  requireAgentOrBrokerMock.mockReset().mockResolvedValue({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 'test' });
  isAuthErrorMock.mockReset().mockReturnValue(false);
});

describe('GET tells the form who owns the record', () => {
  it('the feed copy is source-owned, and its twin is the Mallan listing of the same unit', async () => {
    use(FEED_COPY, [localCandidate()]);
    const res = await call('GET', '312086');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source_owned).toBe(true);
    expect(body.source_class).toBe('mallan-rls-return-copy');
    expect(body.mallan_twin).toEqual({ listing_id: 'SL-0004' });
  });

  it('a different unit of the same building is not its twin (the physical-unit key needs the unit)', async () => {
    use(FEED_COPY, [localCandidate({ address: { ...ADDRESS, UnitNumber: '3H' } })]);
    const body = await (await call('GET', '312086')).json();
    expect(body.mallan_twin).toEqual({ listing_id: null, reason: 'no-local-twin' });
  });

  it('two Mallan listings of one unit are not guessed between', async () => {
    use(FEED_COPY, [localCandidate(), localCandidate({ listing_id: 'SL-0099' })]);
    const body = await (await call('GET', '312086')).json();
    expect(body.mallan_twin).toEqual({ listing_id: null, reason: 'ambiguous-local-twins' });
  });

  it('the Mallan listing is NOT source-owned, carries no twin, and the twin search does not even run', async () => {
    use(MALLAN);
    const res = await call('GET', 'SL-0004');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.source_owned).toBe(false);
    expect(body.source_class).toBe('mallan-local');
    expect(body).not.toHaveProperty('mallan_twin');
    expect((prismaMock as any).listing.findMany).not.toHaveBeenCalled();
  });
});

describe('what the form must not offer: a save of the feed copy', () => {
  it('is refused with the server\'s own words, and nothing is written', async () => {
    use(FEED_COPY, [localCandidate()]);
    const res = await call('PATCH', '312086', { VirtualTourURLUnbranded2: YOUTUBE });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('SOURCE_OWNED_LISTING');
    expect((prismaMock as any).listing.update).not.toHaveBeenCalled();
  });
});

describe('a small save of the video links on the live Mallan listing', () => {
  const links = { VirtualTourURLUnbranded: '', VirtualTourURLUnbranded2: YOUTUBE, VirtualTourURLUnbranded3: '', VirtualTourURLBranded: '', VideosCount: 1, saleVideoUrl: YOUTUBE };

  it('is accepted, keeps the rest of the record, and writes no status', async () => {
    use(MALLAN);
    const res = await call('PATCH', 'SL-0004', links);
    expect(res.status).toBe(200);
    const update = (prismaMock as any).listing.update as jest.Mock;
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0][0].data;
    expect(data.raw_data).toMatchObject({ PublicRemarks: 'Our own description.', saleRlsId: 'RLS20093870', VirtualTourURLUnbranded2: YOUTUBE, saleVideoUrl: YOUTUBE });
    expect(data).not.toHaveProperty('status');
  });

  it('what it stores is what the public record carries, and the card shows its Video badge', async () => {
    use(MALLAN);
    expect(hasVideo(dbListingToPublicDTO({ ...MALLAN, id: '4', list_price: '765000', raw_data: MALLAN.raw_data } as unknown as DbListing))).toBe(false);          // before: the card has no video (the live state)
    await call('PATCH', 'SL-0004', links);
    const stored = ((prismaMock as any).listing.update as jest.Mock).mock.calls[0][0].data.raw_data;
    const dto = dbListingToPublicDTO({ ...MALLAN, id: '4', list_price: '765000', raw_data: stored } as unknown as DbListing);
    expect(dto.videoUrl).toBe(YOUTUBE);
    expect(hasVideo(dto)).toBe(true);
  });

  it('a link cleared in the form is cleared in the record (an empty box is no video)', async () => {
    use({ ...MALLAN, raw_data: { ...MALLAN.raw_data, VirtualTourURLUnbranded2: YOUTUBE } });
    await call('PATCH', 'SL-0004', { ...links, VirtualTourURLUnbranded2: '', saleVideoUrl: '', VideosCount: 0 });
    const stored = ((prismaMock as any).listing.update as jest.Mock).mock.calls[0][0].data.raw_data;
    expect(hasVideo(dbListingToPublicDTO({ ...MALLAN, id: '4', list_price: '765000', raw_data: stored } as unknown as DbListing))).toBe(false);
  });
});
