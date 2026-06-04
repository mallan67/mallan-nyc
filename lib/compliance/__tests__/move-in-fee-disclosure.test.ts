import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';

/**
 * FARE Act public disclosure of move-in fees (PR 3a/3b).
 *
 * Canonical Property fields MoveInCostsAmount / MoveInCostsComments (live 2026-06-04)
 * must surface on the public DTO. Legacy CustomProperty fields are read-time
 * fallback ONLY when the canonical field is blank — canonical always wins, and a
 * single resolved value is produced (no duplicate/conflicting output). Generic
 * fixtures only (no SL-0004 / 333 East 46th / Maya).
 */
function buildRental(features: Record<string, unknown>): DbListing {
  return {
    id: '1',
    listing_id: 'RL-TEST-1',
    status: 'Active',
    listing_type: 'rental',
    property_type: 'Residential Lease',
    property_sub_type: 'Apartment',
    list_price: '4200',
    bedrooms_total: 1,
    bathrooms_full: 1,
    bathrooms_half: 0,
    living_area: '700',
    borough: 'Brooklyn',
    neighborhood: 'Williamsburg',
    address: { StreetNumber: '12', StreetName: 'Example Ave', PostalCode: '11211' },
    features,
    media: [],
    agent_info: { ListOfficeName: 'Mallan Real Estate Inc.' },
    rls_eligible: true,
    idx_display_yn: true,
    internet_entire_listing_display_yn: true,
    internet_address_display_yn: true,
    owner_opt_out: false,
    participant_only: false,
    listing_contract_date: '2026-01-01',
    modification_timestamp: '2026-01-02',
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    raw_data: {},
  } as DbListing;
}

describe('move-in fee public disclosure (DB DTO path)', () => {
  it('surfaces canonical MoveInCostsAmount + MoveInCostsComments', () => {
    const dto = dbListingToPublicDTO(
      buildRental({ MoveInCostsAmount: 1500, MoveInCostsComments: 'First month + security' })
    );
    expect(dto.moveInCostsAmount).toBe(1500);
    expect(dto.moveInCostsComments).toBe('First month + security');
  });

  it('falls back to legacy AdditionalFee / AdditionalFeeDescription ONLY when canonical is blank', () => {
    const dto = dbListingToPublicDTO(
      buildRental({ AdditionalFee: 900, AdditionalFeeDescription: 'Move In Fees' })
    );
    expect(dto.moveInCostsAmount).toBe(900);
    expect(dto.moveInCostsComments).toBe('Move In Fees');
  });

  it('canonical wins over legacy — no duplicate/conflicting value', () => {
    const dto = dbListingToPublicDTO(
      buildRental({
        MoveInCostsAmount: 1500,
        AdditionalFee: 900,
        MoveInCostsComments: 'Canonical note',
        AdditionalFeeDescription: 'Legacy note',
      })
    );
    expect(dto.moveInCostsAmount).toBe(1500); // not 900
    expect(dto.moveInCostsComments).toBe('Canonical note'); // not legacy
  });

  it('falls back to MoveInCostsAmountTotal only when canonical + AdditionalFee blank', () => {
    const dto = dbListingToPublicDTO(buildRental({ MoveInCostsAmountTotal: 2200 }));
    expect(dto.moveInCostsAmount).toBe(2200);
  });

  it('is undefined when no canonical or legacy fee fields are present', () => {
    const dto = dbListingToPublicDTO(buildRental({}));
    expect(dto.moveInCostsAmount).toBeUndefined();
    expect(dto.moveInCostsComments).toBeUndefined();
  });

  it('treats blank-string canonical as blank and falls back', () => {
    const dto = dbListingToPublicDTO(buildRental({ MoveInCostsAmount: '', AdditionalFee: 750 }));
    expect(dto.moveInCostsAmount).toBe(750);
  });
});
