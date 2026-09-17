/**
 * LOCATION READERS — every Mallan reader of borough / neighborhood / county consumes the ONE canonical
 * interpretation (lib/listings/canonical-location.ts), declared by Maya 2026-09-08 on exhaustive live
 * evidence (docs/operations/evidence-2026-09-08/location-semantics.md).
 *
 * Live-proven defects this suite closes:
 *   - comps filtered neighborhoods with `CityRegion eq '<neighborhood>'` → 0 rows for 'Upper East Side'
 *     (51,664 on SubdivisionName) and boroughs with `CountyOrParish eq '<borough>'` → 0 for Manhattan/Brooklyn;
 *   - the public Trestle path mapped borough → CountyOrParish (a second interpretation);
 *   - the market report filtered neighborhoods on MLSAreaMajor, which is empty on all 591,596 rows;
 *   - the public DTO fabricated city 'New York' / county 'New York' when the row carried neither;
 *   - the suggest route inferred borough from the county map and labelled zip results with the BOROUGH
 *     as their "neighborhood".
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { areaCompsLocationFilter } from '@/lib/comps/fetch-comps';
import { buildPublicListingTrestleFilter } from '@/lib/search/public-listing-trestle';
import { marketReportLocationFilter } from '@/lib/market-report/generator';
import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';
import { mapTrestleToCrmListing } from '@/lib/search/crm-idx-mapper';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

const ROOT = path.resolve(__dirname, '../..');
const src = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('comps — area comps filter on the right provider fields', () => {
  it('neighborhoods → SubdivisionName; never CityRegion', () => {
    const f = areaCompsLocationFilter({ postal_code: '10021', borough: 'Manhattan' }, { neighborhoods: ['Upper East Side'] });
    expect(f).toBe("SubdivisionName eq 'Upper East Side'");
    const two = areaCompsLocationFilter({ postal_code: null, borough: null }, { neighborhoods: ['Chelsea', "Hell's Kitchen"] });
    expect(two).toBe("(SubdivisionName eq 'Chelsea' or SubdivisionName eq 'Hell''s Kitchen')");
  });

  it('borough fallback → CityRegion with the live literal; never CountyOrParish', () => {
    expect(areaCompsLocationFilter({ postal_code: null, borough: 'Staten Island' }, { neighborhoods: [] })).toBe("CityRegion eq 'StatenIsland'");
    expect(areaCompsLocationFilter({ postal_code: null, borough: 'Manhattan' }, { neighborhoods: [] })).toBe("CityRegion eq 'Manhattan'");
    expect(areaCompsLocationFilter({ postal_code: null, borough: 'Kings' }, { neighborhoods: [] })).toBeNull();
  });

  it('zip outranks borough when no neighborhood is given', () => {
    expect(areaCompsLocationFilter({ postal_code: '11215', borough: 'Brooklyn' }, { neighborhoods: [] })).toBe("PostalCode eq '11215'");
  });
});

describe('public Trestle path — borough filter', () => {
  it('borough=Manhattan → CityRegion, not CountyOrParish', () => {
    const f = buildPublicListingTrestleFilter(new URLSearchParams('borough=Manhattan'));
    expect(f).toContain("CityRegion eq 'Manhattan'");
    expect(f).not.toContain('CountyOrParish');
  });

  it('borough=Staten Island → the live literal StatenIsland', () => {
    expect(buildPublicListingTrestleFilter(new URLSearchParams('borough=Staten Island'))).toContain("CityRegion eq 'StatenIsland'");
  });
});

describe('market report — location filter', () => {
  it('borough → CityRegion; neighborhoods → SubdivisionName; never MLSAreaMajor or CountyOrParish', () => {
    const f = marketReportLocationFilter('Staten Island', ['St. George', 'Tottenville']);
    expect(f).toBe(" and CityRegion eq 'StatenIsland' and (SubdivisionName eq 'St. George' or SubdivisionName eq 'Tottenville')");
    expect(marketReportLocationFilter(undefined, undefined)).toBe('');
    expect(f).not.toMatch(/MLSAreaMajor|CountyOrParish/);
  });
});

describe('public DTO — no fabricated location', () => {
  const base: DbListing = {
    id: '1', listing_id: 'RLS20059088', status: 'Active', listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condo',
    list_price: '1000000', bedrooms_total: 2, bathrooms_full: 2, bathrooms_half: 0, living_area: '1000',
    borough: 'Brooklyn', neighborhood: 'Park Slope',
    address: { StreetNumber: '1', StreetName: 'Main Street', UnitNumber: '1A', PostalCode: '11215' },
    features: {}, media: [], agent_info: { ListOfficeName: 'Compass', ListAgentFullName: 'A B' },
    agent_id: null, owner_client_id: null, rls_eligible: true, idx_display_yn: true,
    internet_entire_listing_display_yn: true, internet_address_display_yn: true, participant_only: false, owner_opt_out: false,
    listing_contract_date: '2026-08-01T00:00:00Z', modification_timestamp: '2026-09-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', raw_data: {},
  } as unknown as DbListing;
  const addr = base.address as Record<string, unknown>;

  it('county is the provider fact when present; city is never invented', () => {
    const dto = dbListingToPublicDTO({ ...base, address: { ...addr, City: 'New York City', CountyOrParish: 'Kings' } } as DbListing);
    expect(dto.address.county).toBe('Kings');
    expect(dto.address.city).toBe('New York City');
  });

  it('without CountyOrParish the county follows the canonical borough (NYC geography); without City the city is empty, not "New York"', () => {
    const dto = dbListingToPublicDTO(base);
    expect(dto.address.county).toBe('Kings');
    expect(dto.address.city).toBe('');
  });

  it('no borough, no county, no city → empty facts, not "New York"', () => {
    const dto = dbListingToPublicDTO({ ...base, borough: null } as DbListing);
    expect(dto.address.county).toBe('');
    expect(dto.address.city).toBe('');
  });

  it('neighborhood is the canonical column first, then the stored SubdivisionName', () => {
    expect(dbListingToPublicDTO(base).address.neighborhood).toBe('Park Slope');
    const fromAddr = dbListingToPublicDTO({ ...base, neighborhood: null, address: { ...addr, SubdivisionName: 'Gowanus' } } as DbListing);
    expect(fromAddr.address.neighborhood).toBe('Gowanus');
  });
});

describe('CRM search DTO — borough is the Mallan borough', () => {
  it('CityRegion StatenIsland → Staten Island', () => {
    const l = mapTrestleToCrmListing({ ListingKey: 'k', PropertyType: 'Residential', StandardStatus: 'Active', CityRegion: 'StatenIsland' }, 0);
    expect(l.borough).toBe('Staten Island');
  });
});

describe('reader source guards — no county→borough map, no CityRegion-as-neighborhood remains', () => {
  it('lib/idx/trestle-mapper.ts derives location through canonical-location and has no county map', () => {
    const s = src('lib/idx/trestle-mapper.ts');
    expect(s).toMatch(/from ["']@\/lib\/listings\/canonical-location["']/);
    expect(s).not.toMatch(/county\.includes\(["']kings["']\)/);
    expect(s).not.toMatch(/function inferBorough/);
  });

  it('app/api/listings/suggest/route.ts resolves location through locationFromProviderRow (no county map, no CityRegion-as-neighborhood)', () => {
    const s = src('app/api/listings/suggest/route.ts');
    expect(s).toMatch(/locationFromProviderRow\(raw\)/);
    expect(s).not.toMatch(/county\.includes\(['"]kings['"]\)/);
    expect(s).not.toMatch(/const neighborhood = String\(raw\.CityRegion/);
    expect(s).not.toMatch(/raw\.SubdivisionName|raw\.CityRegion|raw\.CountyOrParish/);
  });

  it('lib/buildings/upsert.ts and app/api/buildings/search/route.ts normalize CityRegion through boroughFromCityRegion', () => {
    expect(src('lib/buildings/upsert.ts')).toMatch(/boroughFromCityRegion\(/);
    expect(src('app/api/buildings/search/route.ts')).toMatch(/boroughFromCityRegion\(/);
  });

  it('app/api/crm/listings/[id]/route.ts normalizes the borough it stores', () => {
    expect(src('app/api/crm/listings/[id]/route.ts')).toMatch(/boroughFromCityRegion\(/);
  });

  it('lib/search/public-listing-trestle.ts and lib/market-report/generator.ts carry no borough→county table', () => {
    expect(src('lib/search/public-listing-trestle.ts')).not.toMatch(/BOROUGH_TO_COUNTY/);
    expect(src('lib/market-report/generator.ts')).not.toMatch(/'Manhattan': 'New York'/);
    // No MLSAreaMajor filter clause and no MLSAreaMajor in the $select (a comment may still name it).
    expect(src('lib/market-report/generator.ts')).not.toMatch(/MLSAreaMajor eq|["']MLSAreaMajor["']/);
  });
});
