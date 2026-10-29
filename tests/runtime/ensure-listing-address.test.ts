/// <reference types="jest" />
/**
 * The address of the stub that `POST /api/idx/ensure-listing` creates for a Cotality listing (lib/listings/stub-address.ts).
 *
 * PROVEN DEFECT (found 2026-10-10 by running the public converter on the row this route writes; listed as report-only in the Execution State until now). The stub kept its address under
 * `full`, `unit`, `zip` and lowercase `latitude` / `longitude`, and the public converter (dbListingToPublicDTO) and the canonical slug read the provider's names: StreetNumber, StreetName,
 * UnitNumber, PostalCode, Latitude, Longitude. A stub that passed the display gates, which the CRM's own display flags can make it, rendered an empty street number, street name and postal
 * code, no unit and no map, under `/listing/listing-<id>` instead of the street-based URL, until the sync loaded the real row.
 *
 * The first two blocks hold the splitter and the JSON to a table. The last runs the real route handler against a stub of the database and feeds the row it would write to the real converter,
 * including the two cases where the street must NOT appear: the feed did not allow the address to be shown, and the CRM sent the withheld-address placeholder.
 */

const mockCreate = jest.fn<Promise<unknown>, [unknown]>();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: (a: unknown) => mockCreate(a),
    },
    auditEvent: { create: async () => ({}) },
  },
}));
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: async () => ({ userId: 1n, role: 'BROKER', userType: 'agent' }),
  isAuthError: () => false,
  logAuditEvent: async () => undefined,
}));
jest.mock('@/lib/auth/readonly-guard', () => ({ __esModule: true, assertWriteAllowed: () => null }));
jest.mock('@/lib/search/listing-search-projection', () => ({
  __esModule: true,
  dualWriteProjectionForListingId: async () => undefined,
}));

import { splitStubStreetLine, stubAddressJson } from '@/lib/listings/stub-address';
import { dbListingToPublicDTO } from '@/lib/idx/db-to-public-dto';

type Row = Record<string, unknown>;

const COTALITY_ID = 'RLS20103476';
const WITHHELD = 'ADDRESS AVAILABLE UPON REQUEST';

// What the CRM sends for a listing found in the live Cotality search (public/crm/js/core/api-client.js ensureListing), with the street line as
// mapTrestleToCrmListing builds it: StreetNumber, StreetDirPrefix, StreetName, StreetSuffix and StreetDirSuffix joined by spaces, in capitals.
const BODY: Row = {
  listing_id: COTALITY_ID,
  address: '67 E 82ND STREET',
  unit: '4D',
  zip: '10028',
  neighborhood: 'Upper East Side',
  borough: 'Manhattan',
  latitude: 40.7757,
  longitude: -73.953,
  price: 1500000,
  status: 'Active',
  listing_category: 'sale',
  internet_display_yn: true,
  address_display_yn: true,
};

function req(body: unknown) {
  return new Request('http://localhost/api/idx/ensure-listing', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

async function createdRow(body: Row): Promise<Row> {
  mockCreate.mockClear();
  const { POST } = await import('@/app/api/idx/ensure-listing/route');
  const res = await POST(req(body));
  expect(res.status).toBe(201);
  expect(mockCreate).toHaveBeenCalledTimes(1);
  return (mockCreate.mock.calls[0][0] as { data: Row }).data;
}

/** the page data the public converter makes of the row; the columns the database fills in on its own are added, as the schema defaults do */
const pageData = (data: Row) =>
  dbListingToPublicDTO({ owner_opt_out: false, participant_only: false, ...data, id: 1n, created_at: new Date(), updated_at: new Date() } as unknown as Parameters<typeof dbListingToPublicDTO>[0]);

describe('the street line the CRM sends is split after its house number', () => {
  it.each([
    ['67 E 82ND STREET', '67', 'E 82ND STREET'],
    ['157 W 57TH STREET', '157', 'W 57TH STREET'],
    ['1 CENTRAL PARK WEST', '1', 'CENTRAL PARK WEST'],
    ['30-17 ASTORIA BOULEVARD', '30-17', 'ASTORIA BOULEVARD'],
    ['100A MAIN STREET', '100A', 'MAIN STREET'],
    ['5 5TH AVENUE', '5', '5TH AVENUE'],
    ['  345 PARK AVENUE SOUTH  ', '345', 'PARK AVENUE SOUTH'],
    ['67 e 82nd street', '67', 'e 82nd street'],
  ])('%j', (line, streetNumber, streetName) => {
    expect(splitStubStreetLine(line)).toEqual({ streetNumber, streetName });
  });

  it.each([['5TH AVENUE'], ['1ST AVENUE'], ['22ND STREET'], ['WEST 57TH STREET'], ['CENTRAL PARK WEST']])(
    '%j has no house number (an ordinal is not one): the whole line is the street name',
    (line) => {
      expect(splitStubStreetLine(line)).toEqual({ streetNumber: '', streetName: line });
    },
  );

  it.each([[WITHHELD], [WITHHELD.toLowerCase()], ['  Address Available Upon Request '], [''], ['   '], [undefined], [null], [67], [{}], [['67 E 82ND STREET']]])(
    '%j is no street',
    (line) => {
      expect(splitStubStreetLine(line)).toEqual({ streetNumber: '', streetName: '' });
    },
  );
});

describe('the address JSON of a stub', () => {
  it('carries the provider names the public page reads, and the lowercase keys it always had', () => {
    expect(stubAddressJson(BODY)).toEqual({
      StreetNumber: '67',
      StreetName: 'E 82ND STREET',
      UnitNumber: '4D',
      PostalCode: '10028',
      Latitude: 40.7757,
      Longitude: -73.953,
      full: '67 E 82ND STREET',
      unit: '4D',
      neighborhood: 'Upper East Side',
      borough: 'Manhattan',
      zip: '10028',
      latitude: 40.7757,
      longitude: -73.953,
      cross_street: '',
    });
  });

  it('is the lowercase shape alone, exactly as before, when the CRM sent nothing usable', () => {
    expect(stubAddressJson({})).toEqual({ full: '', unit: '', neighborhood: '', borough: '', zip: '', latitude: null, longitude: null, cross_street: '' });
  });

  it('does not store the withheld-address placeholder as a street (a later display permission would publish it as one)', () => {
    const json = stubAddressJson({ ...BODY, address: WITHHELD, unit: '', latitude: undefined, longitude: undefined });
    expect(json).not.toHaveProperty('StreetName');
    expect(json).not.toHaveProperty('StreetNumber');
    expect(json.full).toBe(WITHHELD);
  });

  it('takes only text and finite numbers for the provider names', () => {
    const providerKeys = (body: Row) => Object.keys(stubAddressJson(body)).filter((k) => /^[A-Z]/.test(k)).sort();
    expect(providerKeys({ address: 67, unit: 4, zip: 10028, latitude: '40.7757', longitude: 'x' })).toEqual(['Latitude']);
    expect(stubAddressJson({ latitude: '40.7757' }).Latitude).toBe(40.7757);
    expect(providerKeys({ latitude: NaN, longitude: Infinity })).toEqual([]);
    expect(providerKeys({ unit: '   ', zip: '  ' })).toEqual([]);
    expect(stubAddressJson({ unit: ' 4D ', zip: ' 10028 ' })).toMatchObject({ UnitNumber: '4D', PostalCode: '10028' });
  });

  it('keeps a coordinate of zero (a falsy number is still a position)', () => {
    expect(stubAddressJson({ latitude: 0, longitude: 0 })).toMatchObject({ Latitude: 0, Longitude: 0 });
  });
});

describe('the page data built from the stub the route writes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation(async (a: unknown) => ({ ...(a as { data: Row }).data, id: 1n }));
  });

  it('shows the street number, street, unit, postal code and position, under the street-based URL', async () => {
    const dto = pageData(await createdRow(BODY));
    expect(dto.address).toMatchObject({ streetNumber: '67', streetName: 'E 82nd Street', unitNumber: '4D', postalCode: '10028', latitude: 40.7757, longitude: -73.953 });
    expect(dto.url).toMatch(/^\/listing\/67-e-82nd-street-apt-4d-[a-z-]*10028\/rls20103476$/);
    expect(dto.url).not.toContain('/listing-rls');
  });

  it('a street the feed did not allow to be shown stays hidden even when the CRM sent it: street, unit, position and the URL', async () => {
    const data = await createdRow({ ...BODY, address_display_yn: false });
    expect(data.internet_address_display_yn).toBe(false);
    const dto = pageData(data);
    expect(dto.address.streetName).toBe('Address Undisclosed');
    expect(dto.address.streetNumber).toBe('');
    expect(dto.address.unitNumber).toBeNull();
    expect(dto.address).not.toHaveProperty('latitude');
    expect(dto.address).not.toHaveProperty('longitude');
    const published = JSON.stringify(dto);
    for (const leak of ['82nd', '82ND', '67 E', '4D', '40.7757', '-73.953']) expect(published).not.toContain(leak);
    expect(dto.url).toBe('/listing/listing-rls20103476');
  });

  it('the withheld-address placeholder the CRM sends is not stored as a street, and nothing is shown', async () => {
    const data = await createdRow({ ...BODY, address: WITHHELD, unit: '', latitude: undefined, longitude: undefined, address_display_yn: false });
    expect(JSON.stringify(data.address)).not.toContain('StreetName');
    const dto = pageData(data);
    expect(dto.address.streetName).toBe('Address Undisclosed');
    expect(dto.address.streetNumber).toBe('');
    expect(JSON.stringify(dto)).not.toContain('UPON REQUEST');
    expect(dto.url).toBe('/listing/listing-rls20103476');
  });
});

// Module scope: without a top-level import/export TypeScript treats this file as a global script.
export {};
