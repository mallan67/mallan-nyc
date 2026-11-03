/// <reference types="jest" />
/**
 * The public card says "Commercial Condo" for a commercial condominium (Maya, 2026-11-03).
 *
 * 800 2nd Avenue #806 is a medical and professional office condominium. Cotality files it as Residential / Apartment with CommonInterest Condominium, so the card read "Condo". The
 * Mallan Sale form has a Commercial section (Commercial listing + Ownership Structure: Commercial Condo / Condop / Co-op); what the broker chooses there is stored as
 * commercial_ownership and now names the listing on its card. Nothing changes for a listing without it.
 */
import { mapPropertyTypeToDisplay } from '../public-dto';
import { dbListingToPublicDTO, type DbListing } from '../db-to-public-dto';

const BASE = {
  id: '688242', listing_id: 'SL-0010', status: 'Active', listing_type: 'sale',
  property_type: 'Commercial', property_sub_type: '', list_price: '1200000',
  bedrooms_total: 0, bathrooms_full: 2, bathrooms_half: 0, living_area: '1482', borough: 'manhattan', neighborhood: 'Turtle Bay',
  address: { StreetNumber: '800', StreetName: '2ND', StreetSuffix: 'Avenue', UnitNumber: '806', City: 'New York', PostalCode: '10017', Borough: 'manhattan' },
  features: { CommonInterest: 'Condominium' }, media: [], agent_info: {}, agent_id: null, owner_client_id: null,
  rls_eligible: false, idx_display_yn: false, internet_entire_listing_display_yn: true, internet_address_display_yn: true, owner_opt_out: false, participant_only: false,
  listing_contract_date: '2026-11-03T00:00:00Z', modification_timestamp: '2026-11-03T08:00:00Z', created_at: '2026-11-03T08:00:00Z', updated_at: '2026-11-03T08:00:00Z',
} as unknown as DbListing;

describe('mapPropertyTypeToDisplay · the commercial ownership the broker chose', () => {
  it.each([
    ['CommercialCondo', 'Commercial Condo'],
    ['CommercialCondop', 'Commercial Condop'],
    ['CommercialCoop', 'Commercial Co-op'],
  ])('%s reads %s, whatever the building\'s CommonInterest says', (ownership, label) => {
    expect(mapPropertyTypeToDisplay('Condominium', '', 'Commercial', ownership)).toBe(label);
    expect(mapPropertyTypeToDisplay('StockCooperative', 'Apartment', 'Residential', ownership)).toBe(label);
  });

  it('a commercial ownership that is not a condo / condop / co-op (whole building, land) is not turned into one: the rest of the rule decides', () => {
    expect(mapPropertyTypeToDisplay('Condominium', '', 'Commercial', 'WholeBuilding')).toBe('Condo');
    expect(mapPropertyTypeToDisplay(undefined, '', 'Commercial', 'LandOnly')).toBe('Commercial');
  });

  it('nothing changes without it: the same answers as before for every residential case', () => {
    expect(mapPropertyTypeToDisplay('Condominium', 'Apartment', 'Residential')).toBe('Condo');
    expect(mapPropertyTypeToDisplay('StockCooperative', null, 'Residential')).toBe('Co-op');
    expect(mapPropertyTypeToDisplay('Condop', null, 'Residential', null)).toBe('Condop');
    expect(mapPropertyTypeToDisplay(undefined, 'Townhouse', 'Residential', '')).toBe('Townhouse');
    expect(mapPropertyTypeToDisplay(undefined, null, undefined, undefined)).toBe('Residential');
  });
});

describe('dbListingToPublicDTO · the card of 800 2nd Avenue #806', () => {
  it('a listing the Sale form classified Commercial Condo is a Commercial Condo on its card (the typed column the create stored)', () => {
    const dto = dbListingToPublicDTO({ ...BASE, commercial_ownership: 'CommercialCondo', raw_data: {} } as unknown as DbListing);
    expect(dto.propertyType).toBe('Commercial Condo');
  });

  it('an edit writes the newest answer to raw_data first, and that wins over the column (a listing created as a Condo and then edited to Commercial Condo)', () => {
    const dto = dbListingToPublicDTO({ ...BASE, commercial_ownership: null, raw_data: { commercial_ownership: 'CommercialCondo' } } as unknown as DbListing);
    expect(dto.propertyType).toBe('Commercial Condo');
    const cleared = dbListingToPublicDTO({ ...BASE, commercial_ownership: 'CommercialCondo', raw_data: { commercial_ownership: '' } } as unknown as DbListing);
    expect(cleared.propertyType).toBe('Condo');                          // the broker took the commercial classification away
  });

  it('a listing with no commercial classification still reads Condo', () => {
    const dto = dbListingToPublicDTO({ ...BASE, property_type: 'Residential', raw_data: {} } as unknown as DbListing);
    expect(dto.propertyType).toBe('Condo');
  });
});
