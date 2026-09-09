/// <reference types="jest" />
/**
 * Portal status projection (owner ruling 2026-09-08): every portal reader renders a SERVER label computed per
 * transaction from the stored live Cotality StandardStatus token — Closed reads "Sold" on a sale and "Rented" on a
 * rental, Pending reads "In Contract" on a sale; legacy stored spellings ('Sold' / 'Rented' / 'Cancelled') are
 * normalized to their token; an unknown state is "Status unavailable" — never a fabricated "Active".
 *
 *   - lib/compliance/dto.ts  sanitizeOwnedListingForOwner + sanitizeListingForPortal → status (token) + status_label
 *   - /api/portal/comparables serializeComp → status (token) + status_label
 *   - /api/crm/agent-inquiry → the email's status line through statusDisplayLabelFor (source ratchet)
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { makeRequest } from './helpers';
import { sanitizeListingForPortal, sanitizeOwnedListingForOwner } from '@/lib/compliance/dto';

const ROOT = resolve(__dirname, '../..');

function row(over: Record<string, unknown>) {
  return {
    id: 5n,
    listing_id: 'SL-0001',
    status: 'Active',
    listing_type: 'sale',
    property_type: 'Condo',
    property_sub_type: null,
    list_price: 1_000_000,
    bedrooms_total: 2,
    bathrooms_full: 2,
    bathrooms_half: null,
    living_area: 1000,
    borough: 'Manhattan',
    neighborhood: 'Upper East Side',
    address: { streetNumber: '1', streetName: 'Main St' },
    features: {},
    media: [],
    list_office_name: 'Mallan Real Estate Inc.',
    internet_address_display_yn: true,
    internet_entire_listing_display_yn: true,
    participant_only: false,
    owner_opt_out: false,
    ...over,
  } as unknown as Parameters<typeof sanitizeOwnedListingForOwner>[0];
}

describe('owner DTO status_label per transaction', () => {
  const cases: [string, string, string, string][] = [
    // stored,      type,   token,       label
    ['Closed',      'sale', 'Closed',    'Sold'],
    ['Closed',      'rent', 'Closed',    'Rented'],
    ['Sold',        'sale', 'Closed',    'Sold'],      // legacy spelling
    ['Rented',      'rent', 'Closed',    'Rented'],    // legacy spelling
    ['Leased',      'rent', 'Closed',    'Rented'],    // legacy spelling
    ['Cancelled',   'sale', 'Canceled',  'Canceled'],  // legacy double-L
    ['Pending',     'sale', 'Pending',   'In Contract'],
    ['Pending',     'rent', 'Pending',   'Pending'],
    ['Active',      'rent', 'Active',    'Active'],
    ['ComingSoon',  'sale', 'ComingSoon','Coming Soon'],
    ['Hold',        'sale', 'Hold',      'Hold'],
    ['Draft',       'sale', 'Incomplete','Incomplete'],
  ];
  it.each(cases)('stored %s on a %s → status %s, status_label %s', (stored, type, token, label) => {
    const out = sanitizeOwnedListingForOwner(row({ status: stored, listing_type: type }), type === 'sale' ? 'seller' : 'landlord');
    expect(out.status).toBe(token);
    expect(out.status_label).toBe(label);
  });

  it('an unknown stored state is "Status unavailable" — never "Active"', () => {
    const out = sanitizeOwnedListingForOwner(row({ status: 'Bogus', listing_type: 'sale' }), 'seller');
    expect(out.status_label).toBe('Status unavailable');
    expect(out.status_label).not.toBe('Active');
  });

  it('a row recorded off the feed reads the Mallan presence state, not a provider status', () => {
    const out = sanitizeOwnedListingForOwner(row({ status: 'Active', listing_type: 'sale', sync_status: 'off_feed' }), 'seller');
    expect(out.status_label).toBe('Off Market — reason unknown');
  });

  it('the projection never leaks raw_data / MlsStatus into the portal payload', () => {
    const out = sanitizeOwnedListingForOwner(row({ status: 'Closed', listing_type: 'sale', raw_data: { MlsStatus: 'X', CloseDate: '2026-01-01' } }), 'seller');
    expect(out.raw_data).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('MlsStatus');
  });
});

describe('buyer / public portal DTO status_label', () => {
  it('sale Pending → In Contract; rental Closed → Rented; legacy Sold → Closed / Sold', () => {
    const a = sanitizeListingForPortal(row({ status: 'Pending', listing_type: 'sale' }), 'buyer');
    expect(a?.status).toBe('Pending');
    expect(a?.status_label).toBe('In Contract');
    const b = sanitizeListingForPortal(row({ status: 'Closed', listing_type: 'rent' }), 'buyer');
    expect(b?.status_label).toBe('Rented');
    const c = sanitizeListingForPortal(row({ status: 'Sold', listing_type: 'sale' }), 'buyer');
    expect(c?.status).toBe('Closed');
    expect(c?.status_label).toBe('Sold');
  });
});

// ── /api/portal/comparables serializeComp ────────────────────────────────────────────────────────────────────
const findFirstMock = jest.fn();
const findManyMock = jest.fn();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    listing: { findFirst: (...a: unknown[]) => findFirstMock(...a), findMany: (...a: unknown[]) => findManyMock(...a) },
    lead: { findUnique: jest.fn(async () => null) },
  },
}));
const requireWorkspaceMock = jest.fn();
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireWorkspace: (...a: unknown[]) => requireWorkspaceMock(...a),
  isAuthError: (v: unknown) => v instanceof Response,
}));

function comp(over: Record<string, unknown>) {
  return {
    id: 10n, listing_id: 'C-1', status: 'Active', listing_type: 'sale', property_type: 'Condo',
    list_price: 1_000_000, bedrooms_total: 2, bathrooms_full: 1, living_area: null, days_on_market: 3,
    address: { streetNumber: '1', streetName: 'Main St', unitNumber: '2A' }, internet_address_display_yn: true,
    neighborhood: 'UES', borough: 'Manhattan', owner_client_id: null, ...over,
  };
}

describe('/api/portal/comparables status_label', () => {
  beforeEach(() => {
    requireWorkspaceMock.mockResolvedValue({ userId: 1n, userType: 'agent', role: 'AGENT' });
    findFirstMock.mockResolvedValue(comp({ id: 1n, listing_id: 'SUBJ' }));
    findManyMock.mockResolvedValue([
      comp({ id: 11n, listing_id: 'C-SALE-CLOSED', status: 'Closed', listing_type: 'sale' }),
      comp({ id: 12n, listing_id: 'C-RENT-CLOSED', status: 'Closed', listing_type: 'rent' }),
      comp({ id: 13n, listing_id: 'C-LEGACY-SOLD', status: 'Sold', listing_type: 'sale' }),
      comp({ id: 14n, listing_id: 'C-ACTIVE', status: 'Active', listing_type: 'rent' }),
      comp({ id: 15n, listing_id: 'C-BOGUS', status: 'Bogus', listing_type: 'sale' }),
    ]);
  });

  it('serializeComp emits the token + the transaction label (Closed → Sold on a sale, Rented on a rental)', async () => {
    const { GET } = await import('@/app/api/portal/comparables/route');
    // The route reads `req.nextUrl.searchParams` (a Next.js-only property the plain Request in
    // makeRequest does not carry), so attach it the way the other runtime specs do.
    const url = 'http://localhost/api/portal/comparables?listingId=SUBJ';
    const req = makeRequest({ method: 'GET', url });
    Object.defineProperty(req, 'nextUrl', { value: new URL(url), enumerable: false });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const all = [...body.building.listings, ...body.area.listings] as { listing_id: string; status: string; status_label: string }[];
    const by = Object.fromEntries(all.map((c) => [c.listing_id, c]));
    expect(by['C-SALE-CLOSED']).toMatchObject({ status: 'Closed', status_label: 'Sold' });
    expect(by['C-RENT-CLOSED']).toMatchObject({ status: 'Closed', status_label: 'Rented' });
    expect(by['C-LEGACY-SOLD']).toMatchObject({ status: 'Closed', status_label: 'Sold' });
    expect(by['C-ACTIVE']).toMatchObject({ status: 'Active', status_label: 'Active' });
    expect(by['C-BOGUS'].status_label).toBe('Status unavailable');
  });
});

describe('agent-inquiry email status line', () => {
  const src = readFileSync(resolve(ROOT, 'app/api/crm/agent-inquiry/route.ts'), 'utf8');
  it('labels through statusDisplayLabelFor(status, listing_type) — no UPPERCASE legacy vocabulary, no fabricated Active', () => {
    expect(src).toMatch(/statusDisplayLabelFor\(/);
    expect(src).not.toMatch(/=== 'COMING_SOON'/);
    expect(src).not.toMatch(/if \(!raw\) return 'Active'/);
    expect(src).toContain('Status unavailable');
  });
});
