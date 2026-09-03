/**
 * TWO MAPPERS, ONE DTO — PROVEN BY COMPARING THEM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS PREVENTS
 *
 * The Search route maps every result through `mapTrestleToCrmListing`, which
 * reads Cotality Property fields. A Mallan-authored row has none of them, so
 * plugging one straight in produces a card with a null id, blank address,
 * status UNKNOWN, null beds and baths and no media — while every count and
 * pagination test stays green.
 *
 * That is the worst available failure: the engine reports that Mallan inventory
 * is included, and the broker receives malformed cards. It looks like it worked.
 *
 * The other tempting shortcut — dressing an SL-/RL- listing in fake Cotality
 * field names so the old mapper accepts it — is the conflation behind every
 * identity defect in this workstream. A fabricated ListingKey is
 * indistinguishable from a real one to the next reader.
 *
 * So the real assertion here is SHAPE PARITY: whatever the provider mapper
 * emits, the Mallan mapper emits too. A consumer must not be able to tell which
 * source it is reading by finding a missing property.
 */
import { mapMallanLocalToCrmListing, type MallanListingForDto } from '../mallan-local-mapper';
import { mapTrestleToCrmListing } from '../crm-idx-mapper';

const mallanRow = (over: Partial<MallanListingForDto> = {}): MallanListingForDto => ({
  listing_id: 'SL-0007',
  status: 'Active',
  listing_type: 'sale',
  address: '400 East 90th Street',
  neighborhood: 'Yorkville',
  borough: 'Manhattan',
  city: 'New York',
  postal_code: '10128',
  list_price: '1250000',
  bedrooms_total: 2,
  bathrooms_full: 1,
  bathrooms_half: 1,
  living_area: '950',
  property_type: 'Residential',
  property_sub_type: 'Condominium',
  listing_contract_date: new Date('2026-08-01T00:00:00Z'),
  modification_timestamp: new Date('2026-09-01T00:00:00Z'),
  updated_at: new Date('2026-09-01T00:00:00Z'),
  days_on_market: 32,
  cumulative_days_on_market: 32,
  photo_count: 12,
  list_office_name: 'Mallan Real Estate Inc.',
  list_agent_full_name: 'Maya Allan',
  list_agent_email: 'maya@mallan.nyc',
  ...over,
});

/** A minimal but realistic Cotality Property row. */
const providerRow = (): Record<string, unknown> => ({
  ListingKey: '1189393822',
  ListingId: 'RLS20112217',
  StandardStatus: 'Active',
  PropertyType: 'Residential',
  PropertySubType: 'Condominium',
  ListPrice: 1_250_000,
  BedroomsTotal: 2,
  BathroomsFull: 1,
  BathroomsHalf: 1,
  LivingArea: 950,
  StreetNumber: '400',
  StreetName: 'East 90th Street',
  City: 'New York',
  PostalCode: '10128',
  CityRegion: 'Yorkville',
});

describe('the Mallan DTO is shape-compatible with the provider DTO', () => {
  it('emits every property the provider mapper emits', () => {
    const provider = mapTrestleToCrmListing(providerRow(), 0);
    const local = mapMallanLocalToCrmListing(mallanRow(), 0);
    // A consumer must not be able to tell the source apart by a MISSING key.
    // Extra keys are fine — `source` and `isMallanAuthored` are deliberate.
    const missing = Object.keys(provider).filter((k) => !(k in local));
    expect(missing).toEqual([]);
  });

  it('the facts a card renders are populated, not blank', () => {
    const l = mapMallanLocalToCrmListing(mallanRow(), 0);
    // The exact failure mode: id null, address blank, status UNKNOWN, beds null.
    expect(l.id).toBe('SL-0007');
    expect(l.address).toBe('400 East 90th Street');
    expect(l.status).toBe('Active');
    expect(l.beds).toBe(2);
    expect(l.price).toBe(1_250_000);
    expect(l.neighborhood).toBe('Yorkville');
    expect(l.listingType).toBe('sale');
  });

  it('half baths are counted the way they were FILTERED', () => {
    // 1 full + 1 half = 1.5. Showing a different number than the criterion
    // matched on is what a broker reports as "the filter is broken".
    expect(mapMallanLocalToCrmListing(mallanRow(), 0).baths).toBe(1.5);
  });

  it('an unknown status becomes UNKNOWN rather than passing through', () => {
    // One result set may not carry two status vocabularies.
    const l = mapMallanLocalToCrmListing(mallanRow({ status: 'Bananas' }), 0);
    expect(l.status).toBe('UNKNOWN');
  });

  it('a rental maps to the rental workflow', () => {
    expect(mapMallanLocalToCrmListing(mallanRow({ listing_type: 'rent' }), 0).listingType)
      .toBe('rental');
  });
});

describe('no provider identity is ever invented for a Mallan listing', () => {
  const l = mapMallanLocalToCrmListing(mallanRow(), 0);

  it('the id is the canonical Mallan identity', () => {
    expect(l.id).toBe('SL-0007');
    expect(String(l.id)).toMatch(/^SL-/);
  });

  it('wid and providerListingId are NULL, not fabricated', () => {
    // `wid` is the ListingKey everywhere else in Search. A value here would be
    // sent to Cotality by the media path and matched against nothing.
    expect(l.wid).toBeNull();
    expect(l.providerListingId).toBeNull();
    expect(l.providerSourceSystemKey).toBeNull();
  });

  it('the source is stated explicitly, not inferred from an id prefix', () => {
    expect(l.source).toBe('mallan_local');
    expect(l.isMallanAuthored).toBe(true);
  });

  it('a provider row does NOT claim to be Mallan-authored', () => {
    const p = mapTrestleToCrmListing(providerRow(), 0);
    expect(p.isMallanAuthored).toBeFalsy();
  });
});

describe('attribution is not inherited across sources', () => {
  it('a Mallan listing carries Mallan attribution', () => {
    const l = mapMallanLocalToCrmListing(mallanRow(), 0);
    expect(l.company).toBe('Mallan Real Estate Inc.');
    expect(l.agentName).toBe('Maya Allan');
  });

  it('a Mallan listing with no stored office still names Mallan, not a provider office', () => {
    const l = mapMallanLocalToCrmListing(mallanRow({ list_office_name: null }), 0);
    expect(l.company).toBe('Mallan Real Estate Inc.');
  });
});

describe('media is absent the same way it is on the provider path', () => {
  it('images is empty and photoCount is what storage holds', () => {
    // The route runs expandMedia:false and the browser lazy-loads, so an empty
    // array here matches the provider path exactly. photoCount must not claim
    // photos the listing does not have — the master-detail defect.
    const l = mapMallanLocalToCrmListing(mallanRow({ photo_count: 0 }), 0);
    expect(l.images).toEqual([]);
    expect(l.photoCount).toBe(0);
  });
});
