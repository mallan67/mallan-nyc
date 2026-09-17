/// <reference types="jest" />
/**
 * Domain 5 (2026-09-08) — a REAL round trip through the handlers: create → reload → edit → reload.
 *
 * The matrix's static-defect register recorded "no test performs an actual create → save → reload → edit →
 * save → reload of field values; the round-trip tests are regex/AST assertions over source". This one drives
 * POST /api/crm/listings, GET /api/crm/listings/[id] and PATCH /api/crm/listings/[id] against an in-memory
 * store and asserts that the SAME payload persists into the SAME buckets on create and on edit, and that every
 * value survives a reload under its stored (canonical) name.
 */
export {};
type Rec = Record<string, unknown>;
const store: { rows: Map<string, Rec> } = { rows: new Map() };
const NEXT_ID = 900n;

function mem() {
  const listing = {
    create: jest.fn(async (args: { data: Rec }) => {
      const row = { id: NEXT_ID, created_at: new Date(), updated_at: new Date(), ...args.data };
      store.rows.set(String(row.id), row);
      return row;
    }),
    findUnique: jest.fn(async (args: { where: Rec }) => {
      const w = args.where;
      if (w.id !== undefined) return store.rows.get(String(w.id)) ?? null;
      if (w.listing_id !== undefined) return [...store.rows.values()].find((r) => r.listing_id === w.listing_id) ?? null;
      return null;
    }),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    update: jest.fn(async (args: { where: Rec; data: Rec }) => {
      const row = store.rows.get(String(args.where.id))!;
      const next = { ...row, ...args.data, updated_at: new Date() };
      store.rows.set(String(row.id), next);
      return next;
    }),
  };
  const prisma: Rec = {
    listing,
    auditEvent: { create: jest.fn(async (a: { data: Rec }) => ({ id: 1n, ...a.data })) },
    agent: { findUnique: jest.fn(async () => null) },
    listingSearchProjection: { upsert: jest.fn(async () => null), findUnique: jest.fn(async () => null) },
    $executeRaw: jest.fn(async () => 0),
    $queryRaw: jest.fn(async () => [{ max_seq: null }]),
  };
  prisma.$transaction = jest.fn(async (cb: (tx: Rec) => unknown) => cb(prisma));
  return prisma;
}
const prismaMock = mem();
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: prismaMock }));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => ({ role: 'BROKER', userId: 7n, userType: 'agent', sessionId: 't' }),
  isAuthError: () => false,
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({ __esModule: true, dualWriteProjectionForListingId: async () => undefined }));
jest.mock('@/lib/crm/listing-urls', () => ({ __esModule: true, buildListingUrls: () => ({ publicUrl: '/listing/x', rebnyListingUrl: 'https://www.mallan.nyc/listing/x' }) }));

const json = (body: unknown, method: string, url: string) =>
  new Request(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function post(body: Rec) {
  const { POST } = await import('@/app/api/crm/listings/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (POST as any)(json(body, 'POST', 'http://localhost/api/crm/listings'));
}
async function get(id: string) {
  const { GET } = await import('@/app/api/crm/listings/[id]/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (GET as any)(new Request(`http://localhost/api/crm/listings/${id}`), { params: Promise.resolve({ id }) });
}
async function patch(id: string, body: Rec) {
  const { PATCH } = await import('@/app/api/crm/listings/[id]/route');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (PATCH as any)(json(body, 'PATCH', `http://localhost/api/crm/listings/${id}`), { params: Promise.resolve({ id }) });
}

/** A rental, website-only (skips the 48-field RLS gate), with Mallan aliases AND contract feature keys. */
const CREATE = {
  listing_type: 'rent',
  rls_eligible: false,
  ListPrice: 4200,
  BedroomsTotal: 2,
  BathroomsFull: 1,
  description: 'Sun-drenched two bedroom with a renovated kitchen',
  privateRemarks: 'Keys with doorman',
  Borough: 'Manhattan',
  neighborhood: 'Yorkville',
  UnParsedAddress: '400 East 90th Street 17C',
  StreetNumber: '400',
  StreetName: 'East 90th Street',
  UnitNumber: '17C',
  PostalCode: '10128',
  Furnished: 'Furnished',
  LeaseType: 'Standard',
  MinLeaseMonths: 12,
  YearBuilt: 1928,
  LaundryFeatures: ['InUnit'],
};

describe('create → reload → edit → reload (the same contract both ways)', () => {
  let id = '';
  let createFeatureKeys: string[] = [];

  it('POST creates the listing with every fact under its stored name', async () => {
    const res = await post(CREATE);
    expect(res.status).toBe(201);
    const created = await res.json();
    id = String(NEXT_ID);
    expect(created.listing_id).toMatch(/^RL-\d{4}$/);
    const row = store.rows.get(id)!;
    const features = row.features as Rec;
    const address = row.address as Rec;
    createFeatureKeys = Object.keys(features).sort();
    expect(features).toMatchObject({ PublicRemarks: CREATE.description, PrivateRemarks: CREATE.privateRemarks, Furnished: 'Furnished', LeaseType: 'Standard', MinLeaseMonths: 12, YearBuilt: 1928, LaundryFeatures: ['InUnit'] });
    expect(address).toMatchObject({ CityRegion: 'Manhattan', SubdivisionName: 'Yorkville', UnparsedAddress: CREATE.UnParsedAddress, UnitNumber: '17C' });
    expect(row.borough).toBe('Manhattan');
    expect(row.neighborhood).toBe('Yorkville');
    for (const alias of ['description', 'privateRemarks', 'Borough', 'neighborhood', 'UnParsedAddress']) expect(row.raw_data as Rec).not.toHaveProperty(alias);
  });

  it('GET reloads the created values under their stored names', async () => {
    const res = await get(id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect((body.features as Rec).Furnished).toBe('Furnished');
    expect((body.features as Rec).PublicRemarks).toBe(CREATE.description);
    expect((body.address as Rec).CityRegion).toBe('Manhattan');
    expect(body.borough).toBe('Manhattan');
  });

  it('PATCH with the same shape edits every fact into the same buckets, and GET reloads the edit', async () => {
    const res = await patch(id, { description: 'Renovated two bedroom, south light', Furnished: 'Unfurnished', MinLeaseMonths: 24, Borough: 'Brooklyn', LaundryFeatures: ['CommonArea'] });
    expect(res.status).toBe(200);
    const reload = await (await get(id)).json();
    expect((reload.features as Rec).PublicRemarks).toBe('Renovated two bedroom, south light');
    expect((reload.features as Rec).Furnished).toBe('Unfurnished');
    expect((reload.features as Rec).MinLeaseMonths).toBe(24);
    expect((reload.features as Rec).LaundryFeatures).toEqual(['CommonArea']);
    expect((reload.features as Rec).LeaseType).toBe('Standard'); // untouched fact survives a partial edit
    expect((reload.address as Rec).CityRegion).toBe('Brooklyn');
    expect(reload.borough).toBe('Brooklyn');
    for (const alias of ['description', 'Borough']) {
      expect(reload.raw_data as Rec).not.toHaveProperty(alias);
      expect(reload.features as Rec).not.toHaveProperty(alias);
    }
  });

  it('the features bucket has the same key set whether the payload arrived by create or by edit', async () => {
    // A fresh edit with the full create payload (minus the create-only controls) must route to exactly the
    // keys the create routed — one contract, two entry points.
    const { listing_type: _lt, rls_eligible: _re, ...facts } = CREATE;
    const res = await patch(id, facts);
    expect(res.status).toBe(200);
    const reload = await (await get(id)).json();
    const editFeatureKeys = Object.keys(reload.features as Rec).sort();
    expect(editFeatureKeys).toEqual(createFeatureKeys);
  });
});
