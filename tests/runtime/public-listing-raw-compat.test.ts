import fs from 'fs';
import path from 'path';
import {
  attachPublicListingRawCompat,
  loadPublicListingRawCompat,
  PUBLIC_LISTING_RAW_COMPAT_KEYS,
} from '@/lib/search/public-listing-raw-compat';
import { RAW_DATA_KEEP_FIELDS } from '@/lib/compliance/raw-data-keep-fields';

const ROOT = path.resolve(__dirname, '../..');
const ROUTE = fs.readFileSync(path.join(ROOT, 'app/api/listings/route.ts'), 'utf8');
const HELPER = fs.readFileSync(path.join(ROOT, 'lib/search/public-listing-raw-compat.ts'), 'utf8');
const DTO = fs.readFileSync(path.join(ROOT, 'lib/idx/db-to-public-dto.ts'), 'utf8');

describe('public listing raw-data compatibility contraction', () => {
  it('pins the complete set of raw keys read by dbListingToPublicDTO', () => {
    const expected = [
      'ActivationDate',
      'OriginalListPrice',
      'PreviousListPrice',
      'ClosePrice',
      'PublicRemarks',
      'OnMarketDate',
      'CloseDate',
      'LeaseAmount',
      'LeaseAmountFrequency',
      'AvailabilityDate',
      'DaysOnMarket',
      'CumulativeDaysOnMarket',
    ];
    const dtoRawKeys = [...DTO.matchAll(/\brawData\.([A-Za-z0-9_]+)/g)]
      .map((match) => match[1]);

    expect(PUBLIC_LISTING_RAW_COMPAT_KEYS).toEqual(expected);
    expect([...new Set(dtoRawKeys)]).toEqual(expected);
    expect(expected.every((key) => RAW_DATA_KEEP_FIELDS.includes(key))).toBe(true);
  });

  it('never selects the full raw_data JSON in either public list query', () => {
    expect(ROUTE).not.toMatch(/raw_data:\s*true/);
    expect(ROUTE.match(/attachPublicListingRawCompat\(/g)).toHaveLength(2);
  });

  it('extracts every pinned key with a sparse jsonb object', () => {
    expect(HELPER).toContain('jsonb_strip_nulls(jsonb_build_object(');
    for (const key of PUBLIC_LISTING_RAW_COMPAT_KEYS) {
      expect(HELPER).toContain(`'${key}', raw_data -> '${key}'`);
    }
  });

  it('uses one query for the page and attaches fragments by listing_id', async () => {
    const queryRaw = jest.fn(async () => [
      { listing_id: 'RLS-1', raw_data: { PreviousListPrice: 975000 } },
      { listing_id: 'SL-2', raw_data: { AvailabilityDate: '2026-09-01' } },
    ]);
    const client = { $queryRaw: queryRaw };
    const listings = [{ listing_id: 'RLS-1', status: 'Active' }, { listing_id: 'SL-2', status: 'Active' }];

    const attached = await attachPublicListingRawCompat(client, listings);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(attached).toEqual([
      { listing_id: 'RLS-1', status: 'Active', raw_data: { PreviousListPrice: 975000 } },
      { listing_id: 'SL-2', status: 'Active', raw_data: { AvailabilityDate: '2026-09-01' } },
    ]);
  });

  it('does not query an empty page and fails closed to an empty fragment', async () => {
    const queryRaw = jest.fn();
    await expect(loadPublicListingRawCompat({ $queryRaw: queryRaw }, [])).resolves.toEqual(new Map());
    expect(queryRaw).not.toHaveBeenCalled();

    const client = { $queryRaw: jest.fn(async () => []) };
    await expect(attachPublicListingRawCompat(client, [{ listing_id: 'RLS-MISSING' }]))
      .resolves.toEqual([{ listing_id: 'RLS-MISSING', raw_data: {} }]);
  });
});
