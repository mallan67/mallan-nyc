/**
 * Domain 3 (2026-09-08) — the Mallan decisions bind on EVERY public row.
 *
 * `owner_opt_out` (UCBA Art. I §5(A): no public dissemination at any time) and `participant_only`
 * (REBNY participants only) are Mallan decisions, not RLS flags. A website-only listing
 * (`rls_eligible = false`) is exempt from the IDX gates the feed enforces (idx_display_yn,
 * InternetEntireListingDisplayYN) — it is not RLS inventory — but never from the owner's opt-out or the
 * participants-only decision. STEP3 ledger §13.4 proved the early return bypassed both.
 */
import { filterDisplayableDbListings, type DbListing } from '../db-to-public-dto';

const websiteOnly = (over: Partial<DbListing>): DbListing =>
  ({
    id: '1', listing_id: 'SL-0001', status: 'Active',
    rls_eligible: false, idx_display_yn: false, internet_entire_listing_display_yn: false,
    owner_opt_out: false, participant_only: false,
    agent_id: '1', owner_client_id: null,
    address: {}, features: {}, media: [], agent_info: {},
    list_price: '500000', property_type: 'Residential', property_sub_type: 'Condo',
    bedrooms_total: 2, bathrooms_full: 1, bathrooms_half: 0, living_area: '900',
    borough: 'Manhattan', neighborhood: 'UES', mls_id: null, slug: 'test', compliance: {},
    ...over,
  }) as unknown as DbListing;

describe('filterDisplayableDbListings — website-only rows still honour the Mallan decisions', () => {
  it('a website-only row with owner_opt_out is never publicly displayable', () => {
    expect(filterDisplayableDbListings([websiteOnly({ owner_opt_out: true })])).toHaveLength(0);
  });
  it('a website-only row marked participant-only is never publicly displayable', () => {
    expect(filterDisplayableDbListings([websiteOnly({ participant_only: true })])).toHaveLength(0);
  });
  it('a website-only row with neither decision stays exempt from the IDX gates (unchanged)', () => {
    expect(filterDisplayableDbListings([websiteOnly({})])).toHaveLength(1);
  });
});
