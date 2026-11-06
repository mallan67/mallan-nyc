/// <reference types="jest" />
/**
 * A Mallan COMMERCIAL listing carries the rent its broker entered, and says it is commercial, so the page can start the Investment Analysis from that rent (Maya, 2026-11-05: 800 2nd Ave #806, a medical
 * office, last advertised at $40 a square foot on 1,482 square feet = $4,940 a month) and does not guess a residential rent for it.
 */
import { dbListingToPublicDTO, type DbListing } from '../db-to-public-dto';

const BASE = {
  id: '10', listing_id: 'SL-0010', status: 'Active', listing_type: 'sale', property_type: 'Commercial', property_sub_type: '', list_price: '1200000', bedrooms_total: 0, bathrooms_full: 2, bathrooms_half: 0,
  living_area: '1482', borough: 'manhattan', neighborhood: 'Turtle Bay',
  address: { StreetNumber: '800', StreetName: '2ND', StreetSuffix: 'Avenue', UnitNumber: '806', City: 'New York City', PostalCode: '10017', Borough: 'manhattan' },
  features: {}, media: [], agent_info: { ListOfficeName: 'Mallan Real Estate Inc.' }, agent_id: null, owner_client_id: null, rls_eligible: false, idx_display_yn: true,
  internet_entire_listing_display_yn: true, internet_address_display_yn: true, owner_opt_out: false, participant_only: false,
  listing_contract_date: '2026-10-01T00:00:00Z', modification_timestamp: '2026-11-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
} as unknown as DbListing;

const dtoOf = (over: Record<string, unknown>) => dbListingToPublicDTO({ ...BASE, ...over } as unknown as DbListing);

describe('dbListingToPublicDTO: a commercial listing and its rent', () => {
  it('a Commercial listing with a rent per SF carries the monthly rent and how it was worked out', () => {
    const dto = dtoOf({ raw_data: { saleCommercialRentPSF: '40' } });
    expect(dto.isCommercial).toBe(true);
    expect(dto.estimatedRent).toEqual({ monthly: 4940, perSqFtYear: 40, sqFt: 1482 });
  });

  it('a Commercial listing with no rent says it is commercial and carries no rent (the page shows no calculator for it)', () => {
    const dto = dtoOf({ raw_data: {} });
    expect(dto.isCommercial).toBe(true);
    expect(dto).not.toHaveProperty('estimatedRent');
  });

  it('a rent left in raw_data under a listing that is now a Condo counts for nothing (a hidden leftover)', () => {
    const dto = dtoOf({ property_type: 'Residential', property_sub_type: 'Condo', raw_data: { saleCommercialRentPSF: '40' } });
    expect(dto).not.toHaveProperty('isCommercial');
    expect(dto).not.toHaveProperty('estimatedRent');
  });

  it('a home carries neither', () => {
    const dto = dtoOf({ property_type: 'Residential', raw_data: {} });
    expect(dto).not.toHaveProperty('isCommercial');
    expect(dto).not.toHaveProperty('estimatedRent');
  });

  it('a Commercial listing with a rent but no area has no rent (it cannot be worked out)', () => {
    const dto = dtoOf({ living_area: null, raw_data: { saleCommercialRentPSF: '40' } });
    expect(dto.isCommercial).toBe(true);
    expect(dto).not.toHaveProperty('estimatedRent');
  });
});

describe('dbListingToPublicDTO: the rent now paid by the tenant in place', () => {
  it('a sale listing with a current rent carries it (333 E 46th #2G: $4,350 a month)', () => {
    expect(dtoOf({ property_type: 'Residential', listing_type: 'sale', raw_data: { saleCurrentMonthlyRent: '4350' } }).currentMonthlyRent).toBe(4350);
  });
  it('a commercial listing carries it too, beside its rate per SF', () => {
    const dto = dtoOf({ raw_data: { saleCurrentMonthlyRent: 4940, saleCommercialRentPSF: '40' } });
    expect(dto.currentMonthlyRent).toBe(4940);
    expect(dto.estimatedRent).toEqual({ monthly: 4940, perSqFtYear: 40, sqFt: 1482 });
  });
  it('a rental has none: its rent is its price', () => {
    expect(dtoOf({ property_type: 'ResidentialLease', listing_type: 'rent', raw_data: { saleCurrentMonthlyRent: '4350' } })).not.toHaveProperty('currentMonthlyRent');
  });
  it.each([[''], [0], [-5], ['abc']])('a rent of %j is none', (rent) => {
    expect(dtoOf({ property_type: 'Residential', raw_data: { saleCurrentMonthlyRent: rent } })).not.toHaveProperty('currentMonthlyRent');
  });
  it('a listing with no current rent has no such key', () => {
    expect(dtoOf({ property_type: 'Residential', raw_data: {} })).not.toHaveProperty('currentMonthlyRent');
  });
});
