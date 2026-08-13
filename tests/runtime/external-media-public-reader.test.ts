/// <reference types="jest" />
/**
 * Canonical external-media reader contract.
 *
 * The writer is not enough: every DB-backed public DTO reader must preload the
 * relation, and the DTO must consume only the pure composer's safe, classified,
 * presentation-deduped result. These tests are DB-free and exercise the real
 * `dbListingToPublicDTO` boundary plus source guards for every production query.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';

const base = (over: Partial<DbListing> = {}): DbListing => ({
  id: '1',
  listing_id: 'RLS-EXT-1',
  status: 'Active',
  listing_type: 'sale',
  property_type: 'Residential',
  property_sub_type: 'Condominium',
  list_price: '1000000',
  bedrooms_total: 2,
  bathrooms_full: 2,
  bathrooms_half: 0,
  living_area: '1000',
  borough: 'manhattan',
  neighborhood: 'Chelsea',
  address: { StreetNumber: '1', StreetName: 'Test Street', City: 'New York', PostalCode: '10001' },
  features: {},
  media: [],
  listing_media: [],
  external_media: [],
  rls_eligible: true,
  idx_display_yn: true,
  internet_entire_listing_display_yn: true,
  internet_address_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  listing_contract_date: null,
  modification_timestamp: '2026-08-12T00:00:00.000Z',
  created_at: '2026-08-12T00:00:00.000Z',
  updated_at: '2026-08-12T00:00:00.000Z',
  ...over,
});

describe('dbListingToPublicDTO canonical external-media authority', () => {
  it('surfaces composer-classified video/tour URLs and ignores raw_data tour fields', () => {
    const dto = dbListingToPublicDTO(base({
      raw_data: {
        VirtualTourURLUnbranded: 'https://youtu.be/legacy-must-not-resurrect',
      },
      external_media: [
        {
          source: 'cotality_property', source_key: 'VirtualTourURLUnbranded2',
          url: 'https://youtu.be/canonical-video', branded: false, kind: 'video',
        },
        {
          source: 'cotality_property', source_key: 'VirtualTourURLUnbranded3',
          url: 'https://my.matterport.com/show/?m=canonical', branded: false, kind: 'virtual_tour',
        },
      ],
    }));

    expect(dto.videoUrl).toBe('https://youtu.be/canonical-video');
    expect(dto.virtualTourURL).toBe('https://my.matterport.com/show/?m=canonical');
    expect(JSON.stringify(dto)).not.toContain('legacy-must-not-resurrect');
  });

  it('dedupes the same merged CRM/Cotality URL and lets the unbranded canonical row win', () => {
    const dto = dbListingToPublicDTO(base({
      external_media: [
        { source: 'crm', source_key: 'crm-video-1', url: ' HTTPS://YOUTU.BE/DUP ', branded: true, kind: 'video' },
        { source: 'cotality_property', source_key: 'VirtualTourURLUnbranded', url: 'https://youtu.be/dup', branded: false, kind: 'video' },
      ],
    }));

    expect(dto.videoUrl).toBe('https://youtu.be/dup');
    expect(JSON.stringify(dto).match(/youtu\.be\/dup/gi)).toHaveLength(1);
  });

  it('fails closed for unsafe, unknown-kind, and invalid-vocabulary rows', () => {
    const dto = dbListingToPublicDTO(base({
      external_media: [
        { source: 'cotality_property', source_key: 'VirtualTourURLUnbranded', url: 'javascript:alert(1)', branded: false, kind: 'video' },
        { source: 'crm', source_key: 'crm-unknown', url: 'https://example.com/unproven', branded: false, kind: 'unknown' },
        { source: 'bad-source', source_key: 'bad', url: 'https://youtu.be/bad', branded: false, kind: 'video' },
        { source: 'crm', source_key: 'bad-kind', url: 'https://youtu.be/bad-kind', branded: false, kind: 'not-a-kind' },
      ],
    }));

    expect(dto.videoUrl).toBeUndefined();
    expect(dto.virtualTourURL).toBeUndefined();
  });
});

describe('all production DB DTO readers preload external_media without N+1', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

  it.each([
    ['app/api/listings/route.ts', 2],
    ['app/api/agents/[slug]/listings/route.ts', 1],
    ['app/listing/[...slug]/page.tsx', 1],
    ['app/api/crm/listing-campaigns/route.ts', 1],
  ])('%s uses the shared relation in every DTO query', (file, expected) => {
    const source = read(file);
    const uses = source.match(/external_media:\s*PUBLIC_EXTERNAL_MEDIA_RELATION/g) || [];
    expect(uses).toHaveLength(expected);
    expect(source).toContain("PUBLIC_EXTERNAL_MEDIA_RELATION");
  });

  it('the DTO/composer performs no Prisma query of its own', () => {
    const dto = read('lib/idx/db-to-public-dto.ts');
    const composer = read('lib/media/canonical-media-composer.ts');
    expect(dto).not.toMatch(/prisma\.listingExternalMedia|prisma\.listingExternal/);
    expect(composer).not.toMatch(/prisma\.|from ['"]@\/lib\/prisma/);
  });
});
