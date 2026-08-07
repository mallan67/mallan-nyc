/**
 * CRM public listing URLs must obey the canonical DB address decision.
 *
 * THE DEFECT
 * ----------
 * `buildListingUrls` decided address visibility with:
 *
 *     internetAddressDisplayYN: listing.internet_address_display_yn !== false
 *
 * so null/undefined meant ADDRESS-VISIBLE. For a DB row that is fail-OPEN:
 * `lib/compliance/gates.ts:166-171` states DB-row callers leave
 * `idxPlusPreFiltered` at the default `false`, so a null flag must fail CLOSED.
 * (`idxPlusPreFiltered` is ONLY for raw Trestle records on the live
 * `/api/idx/search` path.)
 *
 * Worse, `ListingForUrl` carried neither `rls_eligible` nor
 * `internet_entire_listing_display_yn`, so the helper could not tell
 * website-only inventory from RLS-backed inventory at all, and never honoured
 * an entire-listing block.
 *
 * `generateListingSlug` suppresses only on an explicit `=== false`, so a null
 * flowed straight through into an ADDRESS-BASED SLUG — the "address hidden but
 * URL leaks it" split. `lib/listing-slug.ts` calls that an incurable UCBA
 * penalty.
 *
 * Both the slug input AND the address fields fed into it now come from ONE
 * decision (`decideDbPublicAddress`).
 */

import { buildListingUrls } from '../listing-urls';

const ADDRESS = {
  StreetNumber: '217',
  StreetDirPrefix: 'W',
  StreetName: '57th',
  StreetSuffix: 'Street',
  UnitNumber: '127/128',
  City: 'New York City',
  StateOrProvince: 'NY',
  PostalCode: '10019',
};

const base = {
  listing_id: 'SL-0007',
  status: 'Active',
  address: ADDRESS,
  rls_eligible: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
};

const urls = (over: Record<string, unknown>) =>
  buildListingUrls({ ...base, ...over } as never);

/** Every way the street or unit could leak into a URL. */
function assertNoAddressLeak(u: { publicUrl: string | null; realPlusUrl: string | null }) {
  for (const url of [u.publicUrl, u.realPlusUrl]) {
    if (!url) continue;
    const lower = url.toLowerCase();
    expect(lower).not.toContain('57th');
    expect(lower).not.toContain('217');
    expect(lower).not.toContain('127');
    expect(lower).not.toContain('128');
    expect(lower).not.toContain('10019');
  }
}

describe('RLS-backed: address permitted', () => {
  it('entire=true + address=true -> address slug', () => {
    const u = urls({});
    expect(u.publicUrl).toContain('57th');
    expect(u.realPlusUrl).toContain('57th');
  });
});

describe('RLS-backed: address blocked -> suppressed/ID slug, no leakage', () => {
  it('address=false', () => {
    const u = urls({ internet_address_display_yn: false });
    expect(u.publicUrl).toContain('sl-0007');
    assertNoAddressLeak(u);
  });

  it('address=null FAILS CLOSED', () => {
    const u = urls({ internet_address_display_yn: null });
    assertNoAddressLeak(u);
  });

  it('address=undefined FAILS CLOSED', () => {
    const u = urls({ internet_address_display_yn: undefined });
    assertNoAddressLeak(u);
  });

  it('entire=false + address=true -> never advertises an address URL', () => {
    const u = urls({
      internet_entire_listing_display_yn: false,
      internet_address_display_yn: true,
    });
    assertNoAddressLeak(u);
  });

  it('entire=null FAILS CLOSED', () => {
    const u = urls({ internet_entire_listing_display_yn: null });
    assertNoAddressLeak(u);
  });

  it('entire=undefined FAILS CLOSED', () => {
    const u = urls({ internet_entire_listing_display_yn: undefined });
    assertNoAddressLeak(u);
  });
});

describe('a listing-id prefix is never permission', () => {
  for (const id of ['SL-0007', 'RL-0007']) {
    it(`RLS-backed ${id} still obeys the address gate`, () => {
      assertNoAddressLeak(urls({ listing_id: id, internet_address_display_yn: false }));
    });

    it(`RLS-backed ${id} still fails closed on null`, () => {
      assertNoAddressLeak(urls({ listing_id: id, internet_address_display_yn: null }));
    });
  }
});

describe('website-only inventory keeps its approved first-party policy', () => {
  it('rls_eligible=false shows the address even with IDX flags false', () => {
    const u = urls({
      listing_id: 'SL-0004',
      rls_eligible: false,
      internet_entire_listing_display_yn: false,
      internet_address_display_yn: false,
    });
    expect(u.publicUrl).toContain('57th');
  });

  it('rls_eligible=false is unaffected by null IDX flags', () => {
    const u = urls({
      listing_id: 'SL-0004',
      rls_eligible: false,
      internet_entire_listing_display_yn: null,
      internet_address_display_yn: null,
    });
    expect(u.publicUrl).toContain('57th');
  });
});

describe('unknown provenance fails closed', () => {
  it('rls_eligible undefined + address null -> suppressed', () => {
    assertNoAddressLeak(
      urls({ rls_eligible: undefined, internet_address_display_yn: null }),
    );
  });
});

describe('non-active listings still produce no realPlusUrl', () => {
  it('a Draft listing has realPlusUrl null', () => {
    expect(urls({ status: 'Draft' }).realPlusUrl).toBeNull();
  });
});
