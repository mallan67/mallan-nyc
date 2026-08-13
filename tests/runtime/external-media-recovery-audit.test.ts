import fs from 'node:fs';
import path from 'node:path';
import {
  planExternalMediaRecoveryBatch,
  runExternalMediaRecoveryAudit,
} from '@/scripts/audit/external-media-recovery-audit';
import type { StoredExternalMediaRow } from '@/lib/media/external-media';

const existing = (
  listingId: string,
  sourceKey: string,
  url: string,
  over: Partial<StoredExternalMediaRow> = {},
): StoredExternalMediaRow => ({
  listing_id: listingId,
  source: 'cotality_property',
  source_key: sourceKey,
  url,
  branded: sourceKey.includes('Branded'),
  kind: 'video',
  ...over,
});

describe('external-media recovery batch planner', () => {
  it('plans canonical inserts, updates, deletes and unchanged rows without touching CRM rows', () => {
    const plan = planExternalMediaRecoveryBatch({
      requestedListingIds: ['A', 'B'],
      providerRecords: [
        {
          ListingId: 'A',
          VirtualTourURLUnbranded: 'https://youtu.be/keep',
          VirtualTourURLUnbranded2: 'https://my.matterport.com/show/?m=new',
        },
        { ListingId: 'B', VirtualTourURLUnbranded: 'https://youtu.be/new-url' },
      ],
      existingRows: [
        existing('A', 'VirtualTourURLUnbranded', 'https://youtu.be/keep'),
        existing('A', 'VirtualTourURLBranded', 'https://youtu.be/stale', { branded: true }),
        existing('B', 'VirtualTourURLUnbranded', 'https://youtu.be/old-url'),
        existing('B', 'crm-row', 'https://vimeo.com/crm', { source: 'crm' }),
      ],
    });

    expect(plan.totals).toMatchObject({
      desiredRows: 3,
      inserts: 1,
      updates: 1,
      deletes: 1,
      unchangedRows: 1,
      byKind: { video: 2, virtual_tour: 1, unknown: 0 },
    });
    expect(plan.changedListingIds).toEqual(['A', 'B']);
    expect(plan.conflictListingIds).toEqual([]);
  });

  it('collapses identical provider duplicates so planned rows are not duplicated', () => {
    const record = {
      ListingId: 'A',
      VirtualTourURLUnbranded2: 'https://youtu.be/one',
    };
    const plan = planExternalMediaRecoveryBatch({
      requestedListingIds: ['A', 'A'],
      providerRecords: [record, { ...record }],
      existingRows: [],
    });

    expect(plan.requestedListings).toBe(1);
    expect(plan.duplicateProviderRows).toBe(1);
    expect(plan.totals.inserts).toBe(1);
    expect(plan.changedListingIds).toEqual(['A']);
  });

  it('fails closed on conflicting duplicate provider rows', () => {
    const plan = planExternalMediaRecoveryBatch({
      requestedListingIds: ['A'],
      providerRecords: [
        { ListingId: 'A', VirtualTourURLUnbranded2: 'https://youtu.be/one' },
        { ListingId: 'A', VirtualTourURLUnbranded2: 'https://youtu.be/two' },
      ],
      existingRows: [],
    });

    expect(plan.conflictListingIds).toEqual(['A']);
    expect(plan.totals.inserts).toBe(0);
    expect(plan.changedListingIds).toEqual([]);
  });
});

describe('bounded external-media recovery audit', () => {
  it('paginates candidates once and does not duplicate plans across batches', async () => {
    const ids = ['A', 'B', 'C', 'D', 'E'];
    const providerCalls: string[][] = [];
    const result = await runExternalMediaRecoveryAudit(
      {
        storageReady: true,
        candidates: {
          fetchPage: async (cursor, take) => {
            const start = cursor ? ids.indexOf(cursor) + 1 : 0;
            return ids.slice(start, start + take).map((listing_id) => ({ listing_id }));
          },
        },
        existing: { fetchByListingIds: async () => [] },
        provider: {
          fetchByListingIds: async (listingIds) => {
            providerCalls.push([...listingIds]);
            return {
              complete: true,
              records: listingIds.map((ListingId) => ({
                ListingId,
                VirtualTourURLUnbranded2: `https://youtu.be/${ListingId}`,
              })),
            };
          },
        },
      },
      { pageSize: 3, maxListings: 10, providerBatchSize: 2, maxProviderQueries: 10 },
    );

    expect(result.planComplete).toBe(true);
    expect(result.scanComplete).toBe(true);
    expect(result.processedListings).toBe(5);
    expect(result.totals.inserts).toBe(5);
    expect(result.changedListingIds).toEqual(ids);
    expect(providerCalls.flat()).toEqual(ids);
    expect(new Set(providerCalls.flat()).size).toBe(5);
  });

  it('is incomplete when the canonical table is absent and never reads that relation', async () => {
    const existingReader = jest.fn(async () => []);
    const result = await runExternalMediaRecoveryAudit(
      {
        storageReady: false,
        candidates: {
          fetchPage: async (cursor) => cursor ? [] : [{ listing_id: 'A' }],
        },
        existing: { fetchByListingIds: existingReader },
        provider: {
          fetchByListingIds: async () => ({
            complete: true,
            records: [{ ListingId: 'A', VirtualTourURLUnbranded3: 'https://youtu.be/a' }],
          }),
        },
      },
      { pageSize: 10, maxListings: 10, providerBatchSize: 10, maxProviderQueries: 2 },
    );

    expect(result.storageReady).toBe(false);
    expect(result.planComplete).toBe(false);
    expect(result.incompleteReasons).toContain('listing_external_media table is absent');
    expect(existingReader).not.toHaveBeenCalled();
  });

  it('does not call a source-missing provider candidate complete', async () => {
    const result = await runExternalMediaRecoveryAudit(
      {
        storageReady: true,
        candidates: {
          fetchPage: async (cursor) => cursor ? [] : [{ listing_id: 'IDX-A' }],
        },
        existing: { fetchByListingIds: async () => [] },
        provider: { fetchByListingIds: async () => ({ complete: true, records: [] }) },
      },
      { pageSize: 10, maxListings: 10, providerBatchSize: 10, maxProviderQueries: 2 },
    );

    expect(result.scanComplete).toBe(true);
    expect(result.sourceMissingListings).toBe(1);
    expect(result.planComplete).toBe(false);
    expect(result.incompleteReasons).toContain('1 local Cotality candidate(s) have no provider row');
  });
});

describe('CLI is structurally read-only', () => {
  const root = path.resolve(__dirname, '../..');
  const cli = fs.readFileSync(
    path.join(root, 'scripts/audit/external-media-recovery-audit.cli.ts'),
    'utf8',
  );

  it('exposes no execute flag or Prisma mutation method', () => {
    expect(cli).not.toMatch(/['"]--execute['"]/);
    expect(cli).not.toMatch(/\$executeRaw|\$transaction/);
    expect(cli).not.toMatch(/\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
    expect(cli).toMatch(/prisma\.\$queryRaw/);
    expect(cli).toMatch(/prisma\.listing\.findMany/);
    expect(cli).toMatch(/prisma\.listingExternalMedia\.findMany/);
    expect(cli).toMatch(/startsWith: 'SL-'/);
    expect(cli).toMatch(/startsWith: 'RL-'/);
  });
});
