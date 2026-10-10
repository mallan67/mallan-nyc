/// <reference types="jest" />
/**
 * The listing emails name the actual listing broker, listing by listing (REBNY UCBA Art. III §2(C), NY DOS 19 NYCRR §175.25), and say truthfully when their data is from.
 *
 * Found 2026-10-08 (an adversarial audit, then read from the code):
 *  - the daily search alert (listingAlertEmail, sent by /api/cron/search-alerts) listed addresses, prices and beds and named no broker for any of them, while every page of the site that shows the same
 *    listing says "Listing courtesy of <the listing office>"; its footer said "Data last updated: <the day the email was sent>" whatever the data was;
 *  - the investor campaign (investorListingEmail, /api/crm/listing-campaigns) showed the sender under "Presented By ... Mallan Real Estate Inc." and nothing about the listing's own broker; the route
 *    even selects list_office_name and never used it.
 * lib/idx/public-attribution.ts is the one owner of the policy (an unknown office is the neutral "REBNY RLS", never Mallan, which would be a false claim of brokerage; a listing Mallan authored says
 * "Exclusive listing by Mallan Real Estate Inc."). The campaign route decides the line from where the listing comes from, not from the DTO's `_displayCompliance`, which reads agent_id
 * (tests/runtime/listing-campaign-attribution.test.ts); the alert cron passes `mallanAuthored` the same way (tests/runtime/search-alert-listing-attribution.test.ts).
 */
import { listingAlertEmail, investorListingEmail, type InvestorListingEmailData } from '@/lib/email/templates';
import { SEARCH_RESULT_LISTING_SELECT, serializeSearchListing } from '@/lib/search/core';

const card = (office?: string | null, over: Record<string, unknown> = {}) => ({ address: '217 W 57th Street', price: '$1,850,000', beds: 2, baths: 2, url: 'https://mallan.nyc/listing/RLS1', office, ...over });
/** the text of every element that holds a listing's attribution, in order */
const attributions = (html: string) => [...html.matchAll(/(?:Listing courtesy of|Exclusive listing by)[^<\n]*/g)].map((m) => m[0].trim());

describe('listingAlertEmail: every listing names its listing broker', () => {
  it('each card shows "Listing courtesy of" and ITS OWN office, in the order of the cards', () => {
    const html = listingAlertEmail([card('Douglas Elliman Real Estate'), card('Compass'), card('Corcoran Group', { address: '1 Main St' })], 'Maya');
    expect(attributions(html)).toEqual(['Listing courtesy of Douglas Elliman Real Estate', 'Listing courtesy of Compass', 'Listing courtesy of Corcoran Group']);
    // the attribution sits inside the card of its own listing
    const second = html.indexOf('Compass');
    expect(html.lastIndexOf('217 W 57th Street', second)).toBeGreaterThan(html.indexOf('Douglas Elliman'));
  });

  it.each([[undefined], [null], [''], ['   ']])('an unknown office (%j) is the neutral "REBNY RLS", and never Mallan', (office) => {
    const html = listingAlertEmail([card(office)], 'Maya');
    expect(attributions(html)).toEqual(['Listing courtesy of REBNY RLS']);
    expect(attributions(html).join(' ')).not.toMatch(/Mallan/i);
  });

  it('a listing Mallan authored says so, with or without an office on its row, and is never credited to "REBNY RLS"; the others keep their own broker', () => {
    const html = listingAlertEmail([card(null, { mallanAuthored: true }), card('Compass'), card('Mallan Real Estate Inc.', { mallanAuthored: true }), card(undefined, { mallanAuthored: false })], 'Maya');
    expect(attributions(html)).toEqual([
      'Exclusive listing by Mallan Real Estate Inc.',
      'Listing courtesy of Compass',
      'Exclusive listing by Mallan Real Estate Inc.',
      'Listing courtesy of REBNY RLS',
    ]);
  });

  it('an office name is escaped, and trimmed', () => {
    const html = listingAlertEmail([card('  <script>alert(1)</script> Realty & Co  ')], 'Maya');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(attributions(html)).toEqual(['Listing courtesy of &lt;script&gt;alert(1)&lt;/script&gt; Realty &amp; Co']);
  });

  it('keeps what it showed: address, price, beds, baths, the link, the portal button, the REBNY data line; ten cards at most', () => {
    const html = listingAlertEmail(Array.from({ length: 12 }, (_, i) => card(`Office ${i}`, { address: `${i} Main St` })), 'Maya');
    expect(html).toContain('0 Main St');
    expect(html).toContain('$1,850,000');
    expect(html).toContain('2 bed');
    expect(html).toContain('2 bath');
    expect(html).toContain('https://mallan.nyc/listing/RLS1');
    expect(html).toContain('View All in Portal');
    expect(html).toContain('Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.');
    expect(attributions(html)).toHaveLength(10);
    expect(html).toContain('we found 12 new listings');
  });

  it('says when the data is from only when it is known, in New York time, and never "last updated today"', () => {
    const known = listingAlertEmail([card('Compass')], 'Maya', new Date('2026-10-09T02:00:00Z'));    // 10 pm on Oct 8 in New York
    expect(known).toContain('Listing information as of October 8, 2026.');
    for (const unknown of [undefined, null, new Date('not a date')]) {
      const html = listingAlertEmail([card('Compass')], 'Maya', unknown as Date | null | undefined);
      expect(html).not.toContain('as of');
    }
    expect(known).not.toContain('Data last updated');
    expect(listingAlertEmail([card('Compass')], 'Maya')).not.toContain('Data last updated');
  });
});

describe('investorListingEmail: the listing\'s own attribution, apart from the sender', () => {
  const base: InvestorListingEmailData = {
    address: '333 East 46th Street, Unit 2G', neighborhood: 'Turtle Bay', price: '$765,000', beds: 1, baths: 1, sqft: 860, propertyType: 'Condop',
    detailUrl: 'https://mallan.nyc/listing/x', agentName: 'Maya Allan', agentTitle: 'Licensed Real Estate Broker', agentEmail: 'maya@mallan.nyc',
  };

  it('shows the attribution line under the address, escaped, and the sender is still "Presented By"', () => {
    const html = investorListingEmail({ ...base, attributionText: 'Listing courtesy of Compass <b>& Co</b>', disclaimerRequired: true });
    expect(html).toContain('Listing courtesy of Compass &lt;b&gt;&amp; Co&lt;/b&gt;');
    expect(html).not.toContain('<b>& Co</b>');
    expect(html.indexOf('Listing courtesy of Compass')).toBeGreaterThan(html.indexOf('333 East 46th Street'));
    expect(html.indexOf('Listing courtesy of Compass')).toBeLessThan(html.indexOf('Presented By'));
    expect(html).toContain('Presented By');
    expect(html).toContain('Maya Allan');
  });

  it('a third-party listing (disclaimerRequired) carries the REBNY data-provider sentence; Mallan\'s own does not', () => {
    const sentence = 'Listing data provided by the Real Estate Board of New York (REBNY) Residential Listing Service.';
    expect(investorListingEmail({ ...base, attributionText: 'Listing courtesy of Compass', disclaimerRequired: true })).toContain(sentence);
    const own = investorListingEmail({ ...base, attributionText: 'Exclusive listing by Mallan Real Estate Inc.', disclaimerRequired: false });
    expect(own).not.toContain(sentence);
    expect(own).toContain('Exclusive listing by Mallan Real Estate Inc.');
  });

  it('without an attribution (the old call shape) the email renders as it did: no attribution line, no data-provider sentence', () => {
    const html = investorListingEmail(base);
    expect(attributions(html)).toEqual([]);
    expect(html).not.toContain('Listing data provided by');
    expect(html).toContain('333 East 46th Street, Unit 2G');
  });
});

describe('the search alert\'s listings carry their office without changing any response', () => {
  it('SEARCH_RESULT_LISTING_SELECT asks for list_office_name and rls_eligible (two more columns of the same row), and still not for media or agent_id', () => {
    expect(SEARCH_RESULT_LISTING_SELECT.list_office_name).toBe(true);
    expect(SEARCH_RESULT_LISTING_SELECT.rls_eligible).toBe(true);
    expect(SEARCH_RESULT_LISTING_SELECT).not.toHaveProperty('media');
    expect(SEARCH_RESULT_LISTING_SELECT).not.toHaveProperty('agent_id');
  });

  it('serializeSearchListing still emits its fifteen keys: neither the office nor rls_eligible leaks into the saved-search response', () => {
    const serialized = serializeSearchListing({
      id: BigInt(1), listing_id: 'RLS1', status: 'Active', listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condominium', list_price: '1', bedrooms_total: 1,
      bathrooms_full: 1, bathrooms_half: 0, living_area: '1', borough: 'Manhattan', neighborhood: 'Tribeca', address: {}, modification_timestamp: new Date(0),
      internet_entire_listing_display_yn: true, internet_address_display_yn: true, list_office_name: 'Compass', rls_eligible: true,
    } as never);
    expect(Object.keys(serialized)).toHaveLength(15);
    expect(serialized).not.toHaveProperty('list_office_name');
    expect(serialized).not.toHaveProperty('rls_eligible');
  });
});
