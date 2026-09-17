/// <reference types="jest" />
/**
 * The canonical Search permission projection — P0-C4.
 *
 * PROVEN DEFECT (adjudicated 2026-09-15): the Search path had no permission projection at all. Not a value
 * lost in transit — a contract that was never built.
 *
 *   - mallanRecord() never read raw_data._mallanPermission, and the Prisma select never loaded the typed
 *     owner_opt_out / participant_only columns, so derivePermissionBooleans() received undefined and
 *     produced false/false for every Mallan-authored row;
 *   - hydrate.ts FABRICATED three provider facts on every Mallan row —
 *     InternetAddressDisplayYN: true, InternetEntireListingDisplayYN: true, Permission: 'IDX' — which
 *     OVERRODE the real stored booleans (the sale form forces both to false for an opted-out row) and
 *     asserted a provider fact about a row no provider ever saw;
 *   - the provider's Private token was computed and then discarded, so a Cotality Private row emitted
 *     participantOnly: false — disagreeing with what lib/idx/trestle-mapper.ts persists for the same row;
 *   - a `as unknown as MallanRow` double-cast silenced the compiler that would otherwise have caught the
 *     narrow select. That is why type-check never found this.
 *
 * THE CONTRACT THIS FILE LOCKS: the provider-shaped record handed to the mapper carries the Mallan decision
 * under the key the mapper already reads (_mallanPermission), the STORED internet booleans under their own
 * names, and NO Permission at all. One projection, no second interpreter.
 *
 * FAIL-BEHAVIOUR DISCIPLINE — the 2026-04-30 incident (7,594 rows) governs this file:
 *   InternetEntireListingDisplayYN / InternetAddressDisplayYN are PROVIDER-GATED and FAIL-OPEN (!== false).
 *   owner opt-out and participant-only are PER-ROW DECISIONS and FAIL-CLOSED.
 * A test here that swapped those would be re-creating the incident, so both directions are asserted.
 */
import { mallanRecord, mallanRowPassesGate } from '@/lib/search/engine/hydrate';
import { ensureInputFromSearchDto } from '@/lib/listings/ensure-local-listing';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/search/engine/provider-client', () => ({ queryProvider: jest.fn(), walkProvider: jest.fn() }));

/** A stored Mallan row. Gate columns are NOT NULL in prisma/schema.prisma:467-473, so they are always real. */
const base = {
  listing_id: 'SL-PERM-0001', status: 'Active', listing_type: 'sale', property_sub_type: 'Condominium',
  list_price: 1500000, bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, living_area: 900,
  borough: 'Manhattan', neighborhood: 'Tribeca', city: 'New York', postal_code: '10007',
  address: { UnparsedAddress: 'SYNTHETIC' }, media: [], photo_count: 0,
  listing_contract_date: new Date('2026-09-01T00:00:00Z'), updated_at: new Date('2026-09-05T00:00:00Z'),
  list_agent_full_name: 'Search QA Fixture', list_office_name: null, listing_media: [],
  raw_data: null as unknown, days_on_market: null as number | null, cumulative_days_on_market: null as number | null,
  // The four gate columns the select must now load.
  owner_opt_out: false, participant_only: false,
  internet_entire_listing_display_yn: true, internet_address_display_yn: true,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rec = (over: Record<string, unknown> = {}): any => mallanRecord({ ...base, ...over } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dtoOf = (over: Record<string, unknown> = {}): any => mapTrestleToCrmListing(rec(over), 0);

describe('Mallan decision reaches the mapper under the key the mapper already reads', () => {
  it('owner opt-out projects _mallanPermission = OwnerOptOut', () => {
    expect(rec({ owner_opt_out: true })._mallanPermission).toBe('OwnerOptOut');
  });

  it('participant only projects _mallanPermission = Private', () => {
    expect(rec({ participant_only: true })._mallanPermission).toBe('Private');
  });

  it('an ordinary public listing projects an EXPLICIT null — "asked and public", not "nobody asked"', () => {
    const r = rec();
    expect(r._mallanPermission).toBeNull();
    expect('_mallanPermission' in r).toBe(true);
  });

  it('owner opt-out outranks participant only when a row somehow carries both', () => {
    expect(rec({ owner_opt_out: true, participant_only: true })._mallanPermission).toBe('OwnerOptOut');
  });
});

describe('no provider fact is fabricated for a Mallan-authored row', () => {
  it('the record carries NO Permission — a Mallan row was never seen by a provider', () => {
    const r = rec();
    expect(r.Permission === undefined || r.Permission === null).toBe(true);
    expect(r.Permission).not.toBe('IDX');
  });

  it('the STORED internet booleans are passed through, not overridden with true', () => {
    const r = rec({ internet_entire_listing_display_yn: false, internet_address_display_yn: false });
    expect({
      entire: r.InternetEntireListingDisplayYN,
      address: r.InternetAddressDisplayYN,
      why: 'the sale form forces both false for an opted-out row; hydration must not override a stored decision',
    }).toEqual({ entire: false, address: false, why: expect.any(String) });
  });

  it('a normal row still passes its stored true through', () => {
    const r = rec();
    expect(r.InternetEntireListingDisplayYN).toBe(true);
    expect(r.InternetAddressDisplayYN).toBe(true);
  });
});

describe('the DTO carries the decision — FAIL-CLOSED for per-row decisions', () => {
  it('Mallan owner opt-out is excluded from display', () => {
    const dto = dtoOf({ owner_opt_out: true });
    expect({ ownerOptOut: dto.permissions.ownerOptOut, idx: dto.idxDisplayYN, why: 'UCBA Art. I Sec. 4(A): never displayed in any context' })
      .toEqual({ ownerOptOut: true, idx: false, why: expect.any(String) });
  });

  it('Mallan participant-only is marked, and does not masquerade as owner opt-out', () => {
    const dto = dtoOf({ participant_only: true });
    expect(dto.permissions.participantOnly).toBe(true);
    expect(dto.permissions.ownerOptOut).toBe(false);
  });

  it('an ordinary public Mallan listing REMAINS VISIBLE — the fix must not suppress good inventory', () => {
    const dto = dtoOf();
    expect({
      ownerOptOut: dto.permissions.ownerOptOut,
      participantOnly: dto.permissions.participantOnly,
      idx: dto.idxDisplayYN,
      why: 'over-suppression is the 2026-04-30 incident in mirror image',
    }).toEqual({ ownerOptOut: false, participantOnly: false, idx: true, why: expect.any(String) });
  });
});

describe('provider Permission stays provider authority, and Private is projected', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = (over: Record<string, unknown>): any => mapTrestleToCrmListing({
    ListingId: 'P-0001', ListingKey: 'P-0001', StandardStatus: 'Active', ListPrice: 1000000,
    PropertyType: 'Residential', UnparsedAddress: '1 Provider Way',
    ...over,
  } as never, 0);

  it('a provider Private row projects participantOnly = true', () => {
    expect(provider({ Permission: 'IDX,Private' }).permissions.participantOnly).toBe(true);
  });

  it('a provider Private row does NOT become owner opt-out — no provider fact can express that', () => {
    expect(provider({ Permission: 'IDX,Private' }).permissions.ownerOptOut).toBe(false);
  });

  it('a provider row with no Private token is not participant-only', () => {
    expect(provider({ Permission: 'IDX' }).permissions.participantOnly).toBe(false);
  });

  it('a provider row with NO Permission at all is not fabricated into participant-only', () => {
    expect(provider({}).permissions.participantOnly).toBe(false);
  });

  it('PROVIDER-GATED internet booleans stay FAIL-OPEN — null must NOT collapse to false', () => {
    // This is the exact shape of commit 55803f87, which suppressed 7,594 REBNY rows.
    const dto = provider({ InternetEntireListingDisplayYN: null, InternetAddressDisplayYN: null });
    expect({ idx: dto.idxDisplayYN, why: 'REBNY pre-filters upstream, so null means displayable' })
      .toEqual({ idx: true, why: expect.any(String) });
  });

  it('an explicit provider false is still honoured', () => {
    expect(provider({ InternetEntireListingDisplayYN: false }).idxDisplayYN).toBe(false);
  });
});

describe('BOTH sources are gated, and the two audiences differ correctly', () => {
  it('Mallan owner opt-out is excluded at EVERY audience — UCBA Art. I Sec. 5(A)', () => {
    const r = rec({ owner_opt_out: true });
    expect({ pub: mallanRowPassesGate(r, 'public'), mem: mallanRowPassesGate(r, 'member'), why: 'a member is not an exception to an owner withdrawal' })
      .toEqual({ pub: false, mem: false, why: expect.any(String) });
  });

  it('Mallan participant-only is blocked for the PUBLIC audience and allowed for a MEMBER', () => {
    const r = rec({ participant_only: true });
    expect({ pub: mallanRowPassesGate(r, 'public'), mem: mallanRowPassesGate(r, 'member'), why: 'Private exists precisely so authorized participants can see it' })
      .toEqual({ pub: false, mem: true, why: expect.any(String) });
  });

  it('an ordinary public Mallan listing passes BOTH audiences', () => {
    const r = rec();
    expect(mallanRowPassesGate(r, 'public')).toBe(true);
    expect(mallanRowPassesGate(r, 'member')).toBe(true);
  });

  it('the audience defaults to public — an undeclared audience is fail-closed', () => {
    expect(mallanRowPassesGate(rec({ participant_only: true }))).toBe(false);
  });
});

describe('a Private provider row cannot be localized as participant_only = false', () => {
  it('the ensure input carries participantOnly through from the DTO', () => {
    const dto = mapTrestleToCrmListing({
      ListingId: 'P-PRIV', ListingKey: 'P-PRIV', StandardStatus: 'Active', ListPrice: 900000,
      PropertyType: 'Residential', UnparsedAddress: '9 Private Way', Permission: 'IDX,Private',
    } as never, 0) as unknown as Record<string, unknown>;

    const input = ensureInputFromSearchDto(dto, 'sale');
    expect({ participant_only: input.participant_only, why: 'ensureLocalListing writes `input.participant_only === true` straight to the column' })
      .toEqual({ participant_only: true, why: expect.any(String) });
  });

  it('a non-private provider row still localizes as participant_only false', () => {
    const dto = mapTrestleToCrmListing({
      ListingId: 'P-PUB', ListingKey: 'P-PUB', StandardStatus: 'Active', ListPrice: 900000,
      PropertyType: 'Residential', UnparsedAddress: '9 Public Way', Permission: 'IDX',
    } as never, 0) as unknown as Record<string, unknown>;
    expect(ensureInputFromSearchDto(dto, 'sale').participant_only).toBe(false);
  });
});

describe('missing permission data cannot become public by fabrication', () => {
  it('a Mallan record always states the decision explicitly, so the mapper never guesses', () => {
    // The defect was that the key was ABSENT, and absence read as public. It must now always be present.
    for (const over of [{}, { owner_opt_out: true }, { participant_only: true }]) {
      expect('_mallanPermission' in rec(over)).toBe(true);
    }
  });

  it('the record never emits a Permission token it did not receive', () => {
    const r = rec({ owner_opt_out: true });
    expect(r.Permission === undefined || r.Permission === null).toBe(true);
  });
});
