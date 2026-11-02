/**
 * MALLAN-LISTED COTALITY IDENTITY — the two active Cotality listings under Maya Allan / Mallan Real Estate Inc. (office 7041, agent MLS 39361):
 *
 *   333 E 46th St #2G  RLS20093870  has the Mallan-authored SL-0004  -> SL-0004 is the sole public listing; the Cotality duplicate is suppressed.
 *   800 Second Ave #806 RLS20123633 has NO Mallan-authored twin      -> the Cotality listing is the sole public listing, read-only.
 *
 * Suppression depends on PROVEN identity (the same physical unit as a published Mallan-authored row), never on the office id alone. When a
 * Mallan-authored twin for #806 is created later, the context reconciles on its own: no duplicate, nothing lost.
 */

import { buildMallanTwinContext, EMPTY_TWIN_CONTEXT, type MallanTwinContext } from '@/lib/listings/mallan-twin-context';
import {
  excludeMallanRlsReturnCopies,
  isMallanRlsReturnCopy,
  isVerifiedMallanListedRow,
  mallanListedWhere,
} from '@/lib/listings/mallan-source-identity';
import { classifyDbListing, dbListingToPublicDTO, filterDisplayableDbListings, type DbListing } from '@/lib/idx/db-to-public-dto';
import { classifyListingSource } from '@/lib/auth/listing-capabilities';
import { featuredBadgeFor, isMallanOwnedListing, orderFeaturedListings, MALLAN_EXCLUSIVE_BADGE_TEXT } from '@/lib/featured/featured-ordering';
import { parseAddressQuery, buildPublicListingDbSearch } from '@/lib/search/public-listing-db';

const addr = (over: Record<string, unknown> = {}) => ({
  StreetNumber: '333', StreetDirPrefix: 'E', StreetName: '46th', StreetSuffix: 'Street', UnitNumber: '2G', City: 'New York', PostalCode: '10017', ...over,
});
const addr806 = () => addr({ StreetNumber: '800', StreetDirPrefix: '', StreetName: '2nd', StreetSuffix: 'Avenue', UnitNumber: '806' });

const MAYA = {
  trestle_mls_id: '39361', full_name: 'Maya Allan', first_name: 'Maya', last_name: 'Allan', public_slug: 'maya-allan',
  title: 'Licensed Real Estate Broker', email: 'maya@mallan.nyc', phone: '646-258-4460', photo: null, status: 'active',
};
const OTHER_BROKER = { ...MAYA, trestle_mls_id: '55555', full_name: 'Other Broker', public_slug: 'other-broker', email: 'x@other.example', phone: '212-555-0100' };

const LOCAL_SL0004 = { listing_id: 'SL-0004', address: addr(), status: 'Active' };
const OFFICE_ROWS = [
  { listing_id: 'RLS20093870', address: addr(), list_office_mls_id: '7041' },
  { listing_id: 'RLS20123633', address: addr806(), list_office_mls_id: '7041' },
];

const CTX = buildMallanTwinContext([LOCAL_SL0004], OFFICE_ROWS, [MAYA]);

function row(over: Partial<DbListing> = {}): DbListing {
  const now = new Date('2026-11-01T00:00:00.000Z');
  return {
    id: '806', listing_id: 'RLS20123633', mls_id: 'RLS20123633', status: 'Active', listing_type: 'sale', property_type: 'Residential',
    property_sub_type: 'Condominium', list_price: '525000', bedrooms_total: 0, bathrooms_full: 1, bathrooms_half: 0, living_area: '480',
    borough: 'Manhattan', neighborhood: 'Turtle Bay', address: addr806(), features: {}, media: [], agent_info: {}, agent_id: null, owner_client_id: null,
    rls_eligible: true, idx_display_yn: true, internet_entire_listing_display_yn: true, internet_address_display_yn: true, owner_opt_out: false,
    participant_only: false, list_office_mls_id: '7041', list_agent_mls_id: '39361', raw_data: { ListingAgreement: 'ExclusiveAgency' },
    listing_contract_date: now, modification_timestamp: now, created_at: now, updated_at: now, ...over,
  } as DbListing;
}

describe('the identity context is built from proof, not from the office id', () => {
  it('333 E 46th St #2G: the Cotality row is a PROVEN duplicate of SL-0004', () => {
    expect(CTX.returnCopyIds).toEqual(['RLS20093870']);
  });

  it('800 Second Ave #806: no Mallan-authored twin, so it is NOT a duplicate', () => {
    expect(CTX.returnCopyIds).not.toContain('RLS20123633');
  });

  it('a Draft local row is not a twin (it is not public)', () => {
    const ctx = buildMallanTwinContext([{ ...LOCAL_SL0004, status: 'Draft' }], OFFICE_ROWS, [MAYA]);
    expect(ctx.returnCopyIds).toEqual([]);
  });

  it('a different unit in the same building is never merged', () => {
    const ctx = buildMallanTwinContext([{ ...LOCAL_SL0004, address: addr({ UnitNumber: '3A' }) }], OFFICE_ROWS, [MAYA]);
    expect(ctx.returnCopyIds).toEqual([]);
  });

  it('a third-party office row at the same unit is not a Mallan duplicate', () => {
    const ctx = buildMallanTwinContext([LOCAL_SL0004], [{ listing_id: 'RLS777', address: addr(), list_office_mls_id: '9999' }], [MAYA]);
    expect(ctx.returnCopyIds).toEqual([]);
  });

  it('a unit-less address proves nothing (the physical-unit key needs the unit)', () => {
    const ctx = buildMallanTwinContext([{ ...LOCAL_SL0004, address: addr({ UnitNumber: '' }) }], [{ listing_id: 'RLS5', address: addr({ UnitNumber: '' }), list_office_mls_id: '7041' }], [MAYA]);
    expect(ctx.returnCopyIds).toEqual([]);
  });

  it('the roster verifies only ACTIVE agents that carry an MLS member id', () => {
    const ctx = buildMallanTwinContext([], [], [MAYA, { ...OTHER_BROKER, status: 'inactive' }, { ...OTHER_BROKER, trestle_mls_id: null }]);
    expect(Object.keys(ctx.agentsByMlsId)).toEqual(['39361']);
    expect(ctx.agentsByMlsId['39361']).toMatchObject({ name: 'Maya Allan', title: 'Licensed Real Estate Broker', slug: 'maya-allan' });
  });

  it('RECONCILES ON ITS OWN: when a Mallan-authored twin for #806 is created, the Cotality row becomes the suppressed duplicate (no second card)', () => {
    const later = buildMallanTwinContext(
      [LOCAL_SL0004, { listing_id: 'SL-0011', address: addr806(), status: 'Active' }],
      OFFICE_ROWS,
      [MAYA],
    );
    expect(later.returnCopyIds).toEqual(['RLS20093870', 'RLS20123633']);
    expect(isVerifiedMallanListedRow(row(), later)).toBe(false); // the authored SL-0011 takes the brand and the page; history is kept in the database
  });
});

describe('exactly two distinct public listings under Maya (never three or four)', () => {
  const population = [
    { listing_id: 'SL-0004', list_office_mls_id: null },
    { listing_id: 'RLS20093870', list_office_mls_id: '7041' },
    { listing_id: 'RLS20123633', list_office_mls_id: '7041' },
    { listing_id: 'RLS11111', list_office_mls_id: '9999' },
  ];
  const publicSet = (ctx: MallanTwinContext) => population.filter((r) => !isMallanRlsReturnCopy(r, ctx)).map((r) => r.listing_id);

  it('with the proven twin: SL-0004 and RLS20123633 (plus unrelated third-party inventory), never RLS20093870', () => {
    expect(publicSet(CTX)).toEqual(['SL-0004', 'RLS20123633', 'RLS11111']);
  });

  it('the Mallan set (authored + verified Mallan-listed) is exactly those two', () => {
    const mallan = population.filter((r) => !isMallanRlsReturnCopy(r, CTX)).filter((r) =>
      r.listing_id.startsWith('SL-') || isVerifiedMallanListedRow({ ...r, list_agent_mls_id: '39361', raw_data: { ListingAgreement: 'ExclusiveAgency' } }, CTX));
    expect(mallan.map((r) => r.listing_id)).toEqual(['SL-0004', 'RLS20123633']);
  });

  it('SL-0004 keeps its canonical record: it is never classified as a return-copy or a Cotality-listed row', () => {
    expect(isMallanRlsReturnCopy({ listing_id: 'SL-0004' }, CTX)).toBe(false);
    expect(isVerifiedMallanListedRow({ listing_id: 'SL-0004', list_office_mls_id: '7041', list_agent_mls_id: '39361', raw_data: { ListingAgreement: 'ExclusiveAgency' } }, CTX)).toBe(false);
  });
});

describe('a Cotality row earns the Mallan mark only when every fact is verified', () => {
  it('#806 (office 7041 + roster agent 39361 + exclusive agreement + no authored twin) is a verified Mallan-listed row', () => {
    expect(isVerifiedMallanListedRow(row(), CTX)).toBe(true);
    expect(classifyDbListing(row(), CTX)).toBe('mallan-listed-cotality');
  });

  it.each([
    ['another brokerage office', { list_office_mls_id: '9999' }],
    ['an agent that is not on the Mallan roster', { list_agent_mls_id: '55555' }],
    ['no list agent', { list_agent_mls_id: null }],
    ['an open or missing agreement', { raw_data: { ListingAgreement: 'OpenListing' } }],
    ['no agreement', { raw_data: {} }],
  ])('%s -> NOT Mallan-listed (no mark, no Mallan agent card)', (_label, over) => {
    expect(isVerifiedMallanListedRow(row(over as Partial<DbListing>), CTX)).toBe(false);
    expect(classifyDbListing(row(over as Partial<DbListing>), CTX)).toBe('third-party-idx');
  });

  it('agent_id on the row is NEVER identity (a sync stamps it on third-party rows)', () => {
    const fake = row({ list_office_mls_id: '9999', list_agent_mls_id: '55555', agent_id: BigInt(1) as unknown as DbListing['agent_id'] });
    expect(classifyDbListing(fake, CTX)).toBe('third-party-idx');
  });

  it('without the context a Cotality row is treated as third-party (no brand granted on a guess)', () => {
    expect(classifyDbListing(row())).toBe('third-party-idx');
    expect(classifyDbListing(row(), EMPTY_TWIN_CONTEXT)).toBe('third-party-idx');
  });

  it('the SQL predicate names the office, the roster agents and the agreement, and excludes authored rows and duplicates', () => {
    const where = mallanListedWhere(CTX) as { list_office_mls_id: unknown; list_agent_mls_id: unknown; NOT: unknown[]; OR: unknown[] };
    expect(where.list_office_mls_id).toEqual({ in: ['7041'] });
    expect(where.list_agent_mls_id).toEqual({ in: ['39361'] });
    expect(where.NOT).toEqual(expect.arrayContaining([{ listing_id: { in: ['RLS20093870'] } }]));
    expect(where.OR).toHaveLength(3);
  });
});

describe('the public DTO for #806', () => {
  const dto = dbListingToPublicDTO(row(), { twin: CTX });

  it('is the Mallan-listed, read-only Cotality listing: _source stays db+idx (NOT forced to exclusive), RLS attribution and disclaimer stay', () => {
    expect(dto._source).toBe('db+idx');
    expect(dto._mallanListed).toBe(true);
    expect(dto._displayCompliance.requiresAttribution).toBe(true);
    expect(dto._displayCompliance.disclaimerRequired).toBe(true);
    expect(dto._displayCompliance.attributionText).toMatch(/^Listing courtesy of /);
  });

  it("carries Maya's verified name, license title, profile slug, email and phone (from the roster)", () => {
    expect(dto._assignedAgent).toMatchObject({
      name: 'Maya Allan', title: 'Licensed Real Estate Broker', slug: 'maya-allan', email: 'maya@mallan.nyc', phone: '646-258-4460',
    });
  });

  it('is read-only: it is not Mallan-authored, so no edit capability is granted', () => {
    expect(classifyListingSource(row() as never, CTX)).not.toBe('mallan-local');
  });

  it("another brokerage's listing never carries the Mallan mark or any Mallan/agent contact", () => {
    const other = dbListingToPublicDTO(row({ listing_id: 'RLS777', list_office_mls_id: '9999', list_agent_mls_id: '55555',
      agent_info: { ListAgentFullName: 'Other Broker', ListAgentEmail: 'leak@other.example' } }), { twin: CTX });
    expect(other._mallanListed).toBeUndefined();
    expect(other._assignedAgent).toBeUndefined();
    expect(JSON.stringify(other)).not.toMatch(/leak@other\.example/);
    expect(isMallanOwnedListing(other)).toBe(false);
  });

  it('the suppressed duplicate is not displayable as a Mallan-listed row either', () => {
    const dup = row({ listing_id: 'RLS20093870', address: addr() });
    expect(isVerifiedMallanListedRow(dup, CTX)).toBe(false);
    expect(isMallanRlsReturnCopy(dup, CTX)).toBe(true);
  });

  it('still passes the display gates: a gated-off Mallan-listed row stays hidden', () => {
    expect(filterDisplayableDbListings([row({ idx_display_yn: false })])).toHaveLength(0);
    expect(filterDisplayableDbListings([row()])).toHaveLength(1);
  });
});

describe('Mallan Exclusive branding is keyed on proven ownership only', () => {
  const mallanListed = dbListingToPublicDTO(row(), { twin: CTX });
  const authored = { id: 'SL-0004', _source: 'exclusive' };
  const thirdParty = { id: 'RLS99', _source: 'db+idx' };

  it('both Mallan listings earn the one "Mallan Exclusive" badge', () => {
    expect(featuredBadgeFor({ ...mallanListed }, false)).toMatchObject({ kind: 'exclusive', text: MALLAN_EXCLUSIVE_BADGE_TEXT });
    expect(featuredBadgeFor(authored, false)).toMatchObject({ kind: 'exclusive', text: MALLAN_EXCLUSIVE_BADGE_TEXT });
  });

  it('pinning does not double the badge (Mallan wins), and a pinned third-party row stays "Featured"', () => {
    expect(featuredBadgeFor({ ...mallanListed }, true)?.kind).toBe('exclusive');
    expect(featuredBadgeFor(thirdParty, true)?.kind).toBe('rls');
  });

  it('a third-party row, pinned or not, never gets the Mallan mark', () => {
    expect(isMallanOwnedListing(thirdParty)).toBe(false);
    expect(featuredBadgeFor(thirdParty, false)).toBeNull();
    // the flag must be the strict boolean the server sets
    expect(isMallanOwnedListing({ id: 'RLS1', _source: 'db+idx', _mallanListed: 'true' as unknown as boolean })).toBe(false);
  });

  it('Featured lists BOTH Mallan listings first, including the 0-bedroom #806', () => {
    const general = [{ id: 'RLS-a', _source: 'db+idx' }, { id: 'RLS-b', _source: 'db+idx' }];
    const out = orderFeaturedListings([{ ...mallanListed, id: 'RLS20123633', address: undefined }, { ...authored }], general as never, new Set(), 6);
    expect(out.slice(0, 2).map((l) => l.id).sort()).toEqual(['RLS20123633', 'SL-0004']);
    expect(mallanListed.bedroomsTotal).toBe(0);
  });
});

describe('the public query exposes both Mallan listings and hides only the proven duplicate', () => {
  it('buildPublicListingDbSearch carries the context-aware exclusion', () => {
    const { where } = buildPublicListingDbSearch(new URLSearchParams('type=sale'), CTX);
    expect(JSON.stringify(where)).toContain('"listing_id":{"notIn":["RLS20093870"]}');
  });

  it('with an empty context nothing is hidden by office id', () => {
    const and = excludeMallanRlsReturnCopies(EMPTY_TWIN_CONTEXT).OR;
    expect(JSON.stringify(and)).not.toContain('RLS2009');
  });
});

describe('address and unit parsing (the failing production searches)', () => {
  it.each([
    ['800 Second Avenue', '800 Second Avenue', null],
    ['800 2nd Avenue', '800 2nd Avenue', null],
    ['800 2nd Ave #806', '800 2nd Ave', '806'],
    ['800 Second Avenue, Apt 806', '800 Second Avenue', '806'],
    ['800 second avenue unit 806', '800 second avenue', '806'],
    ['333 East 46th Street 2G', '333 East 46th Street', '2G'],
    ['333 E 46th St #2G', '333 E 46th St', '2G'],
    ['425 Park Avenue South', '425 Park Avenue South', null],
    ['Turtle Bay', 'Turtle Bay', null],
  ])('%s -> street %s, unit %s', (input, street, unit) => {
    expect(parseAddressQuery(input)).toEqual({ street, unit });
  });

  const where = (q: string) => buildPublicListingDbSearch(new URLSearchParams({ type: 'sale', address: q }), CTX).where;

  it('"800 Second Avenue" matches the number 800 and the street "2" / "Second"', () => {
    const json = JSON.stringify(where('800 Second Avenue'));
    expect(json).toContain('"StreetNumber"');
    expect(json).toContain('"equals":"800"');
    expect(json).toMatch(/"string_contains":"2"/);
  });

  it('a unit narrows the match to that unit; no unit leaves the building', () => {
    expect(JSON.stringify(where('800 2nd Ave #806'))).toContain('"UnitNumber"');
    expect(JSON.stringify(where('800 Second Avenue'))).not.toContain('"UnitNumber"');
  });

  it('number, street and unit are ANDed, so a nonexistent address matches nothing (no wildcard fallback)', () => {
    const w = where('999 Nonexistent Street #9Z') as { AND: Array<Record<string, unknown>> };
    const json = JSON.stringify(w);
    expect(json).toContain('"equals":"999"');
    expect(json).toContain('Nonexistent');
    expect(json).toContain('"equals":"9Z"');
    // three separate required groups: number, street name, unit (plus the suppression group)
    expect(w.AND.filter((c) => JSON.stringify(c).includes('StreetNumber') || JSON.stringify(c).includes('StreetName') || JSON.stringify(c).includes('UnitNumber'))).toHaveLength(3);
  });
});

describe('inquiries on the listing reach Maya and are persisted (no browser-supplied recipient)', () => {
  const read = (rel: string) => require('fs').readFileSync(require('path').resolve(__dirname, '../../', rel), 'utf8') as string;
  const route = read('app/api/inquiries/route.ts');
  const form = read('app/components/InquiryForm.tsx');

  it('the broker notification goes to the fixed Mallan inbox, never to a recipient from the request body', () => {
    expect(route).toMatch(/sendEmail\('info@mallan\.nyc'/);
    const destructure = route.match(/const \{([^}]*)\} = body;/);
    expect(destructure).not.toBeNull();
    expect(destructure![1]).not.toMatch(/\b(to|recipient|agentEmail|brokerEmail)\b/);
  });

  it('the form does not send a recipient: its agentEmail prop is ignored', () => {
    expect(form).toMatch(/agentEmail: _agentEmail/);
    expect(form).not.toMatch(/agentEmail\s*,?\s*\n?\s*(message|name)/);
    const bodyBlock = form.slice(form.indexOf('JSON.stringify({'), form.indexOf('JSON.stringify({') + 400);
    expect(bodyBlock).not.toMatch(/agentEmail/);
  });

  it('the lead is persisted, linked to the listing and assigned to the listing agent or the principal broker', () => {
    expect(route).toMatch(/prisma\.lead\.upsert/);
    expect(route).toMatch(/active_sale_listing_id: listingRef/);
    expect(route).toMatch(/role: 'BROKER'/);
    expect(route).toMatch(/inquiry_submitted/);
  });
});
