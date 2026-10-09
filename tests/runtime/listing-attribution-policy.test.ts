/// <reference types="jest" />
/**
 * listingAttribution (lib/idx/public-attribution.ts): what a listing's attribution line says, decided from WHERE THE LISTING COMES FROM.
 *
 * A listing Mallan authored (an `SL-`/`RL-` id, or `rls_eligible === false`) is credited to Mallan; any other listing is third-party RLS content and names its own office, with the REBNY data-provider
 * sentence. It never reads agent_id or owner_client_id: syncAgentHistory writes agent_id onto Cotality rows matched on the list side OR the buyer side (mallan-source-identity.ts).
 * The Mallan wording is the one buildSourceAndCompliance (db-to-public-dto.ts) gives the same listing (also asserted in tests/runtime/listing-campaign-attribution.test.ts).
 */
import { MALLAN_EXCLUSIVE_ATTRIBUTION, NEUTRAL_OFFICE_ATTRIBUTION, listingAttribution, publicAttributionText } from '@/lib/idx/public-attribution';

describe('listingAttribution', () => {
  it.each([
    ['an SL- sale listing', { listing_id: 'SL-0004', rls_eligible: true }],
    ['an RL- rental', { listing_id: 'RL-0002', rls_eligible: true }],
    ['a website-only row (rls_eligible false) whatever its id', { listing_id: 'COM-7', rls_eligible: false }],
    ['an SL- row that is also website-only', { listing_id: 'SL-0009', rls_eligible: false }],
  ])('%s: credited to Mallan, no data-provider sentence', (_name, row) => {
    expect(listingAttribution(row, 'Compass')).toEqual({ attributionText: MALLAN_EXCLUSIVE_ATTRIBUTION, disclaimerRequired: false });
    expect(listingAttribution(row)).toEqual({ attributionText: MALLAN_EXCLUSIVE_ATTRIBUTION, disclaimerRequired: false });
  });

  it.each([
    ['a feed row', { listing_id: 'RLS20093870', rls_eligible: true }],
    ['a feed row with no rls_eligible stored', { listing_id: 'RLS20093870', rls_eligible: null }],
    ['a feed row with nothing else known', { listing_id: 'RLS1' }],
    ['an empty row', {}],
  ])('%s: the other firm\'s listing, with its office and the data-provider sentence', (_name, row) => {
    expect(listingAttribution(row, 'Douglas Elliman Real Estate')).toEqual({ attributionText: 'Listing courtesy of Douglas Elliman Real Estate', disclaimerRequired: true });
  });

  it.each([[undefined], [null], [''], ['   ']])('a third-party listing whose office is unknown (%j) is the neutral "REBNY RLS", never Mallan', (office) => {
    const out = listingAttribution({ listing_id: 'RLS1', rls_eligible: true }, office);
    expect(out).toEqual({ attributionText: `Listing courtesy of ${NEUTRAL_OFFICE_ATTRIBUTION}`, disclaimerRequired: true });
    expect(out.attributionText).not.toMatch(/Mallan/i);
  });

  it('agent_id and owner_client_id mean nothing to it: a feed row that carries them is still third-party', () => {
    const stamped = { listing_id: 'RLS20093870', rls_eligible: true, agent_id: 5, owner_client_id: 9 } as never;
    expect(listingAttribution(stamped, 'Compass')).toEqual({ attributionText: publicAttributionText('Compass'), disclaimerRequired: true });
  });
});
