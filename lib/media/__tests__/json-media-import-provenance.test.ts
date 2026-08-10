/**
 * `importJsonMediaToRows` must import ONLY provably Mallan-owned items.
 *
 * See lib/media/media-provenance.ts for the proof that Cotality URLs live in
 * `Listing.media` JSON on synced rows, and for why a `crm:`-keyed clone of a
 * feed image is permanently immune to `tombstoneVanished`.
 */

import { importJsonMediaToRows } from '@/lib/media/crm-media';

type Created = Record<string, unknown>;

function fakePrisma(existingKeys: string[] = []) {
  const created: Created[] = [];
  return {
    created,
    client: {
      listingMedia: {
        findUnique: async ({ where }: { where: { media_key: string } }) =>
          existingKeys.includes(where.media_key) ? { id: 1n } : null,
        create: async ({ data }: { data: Created }) => {
          created.push(data);
          return data;
        },
      },
    } as never,
  };
}

const COTALITY = { url: 'https://api.cotality.com/media/feed-1.jpg', order: 0 };
const CRM_UPLOAD = { url: 'https://cdn.example.test/mine.jpg', contentHash: 'abc123', order: 1 };
const UNMARKED = { url: 'https://cdn.example.test/mystery.jpg', order: 2 };

describe('SYNCED listing — the contamination gate', () => {
  it('does NOT import Cotality feed images into the crm: namespace', async () => {
    const { client, created } = fakePrisma();
    const res = await importJsonMediaToRows(client, {
      listing_id: 'RLS20093870',
      media: [COTALITY],
      last_synced_from_trestle: new Date('2026-08-01T00:00:00Z'),
    });

    expect(created).toHaveLength(0);
    expect(res.imported).toBe(0);
    expect(res.planned).toHaveLength(0);
    expect(res.skippedByProvenance).toBe(1);
  });

  it('DOES import a genuine Mallan upload that sits on an RLS row', async () => {
    // Historical legitimate CRM media on an RLS row must keep working — this is
    // exactly why the gate is item-level and not listing-wide.
    const { client, created } = fakePrisma();
    const res = await importJsonMediaToRows(client, {
      listing_id: 'RLS20093870',
      media: [COTALITY, CRM_UPLOAD],
      last_synced_from_trestle: new Date('2026-08-01T00:00:00Z'),
    });

    expect(res.imported).toBe(1);
    expect(created).toHaveLength(1);
    expect(String(created[0].media_key)).toMatch(/^crm:/);
    expect(created[0].media_url_cached).toBe(CRM_UPLOAD.url);
  });

  it('FAILS CLOSED on an unmarked item', async () => {
    const { client, created } = fakePrisma();
    const res = await importJsonMediaToRows(client, {
      listing_id: 'RLS20093870',
      media: [UNMARKED],
      last_synced_from_trestle: new Date(),
    });
    expect(created).toHaveLength(0);
    expect(res.skippedByProvenance).toBe(1);
  });

  it('FAILS CLOSED when the sync column was not selected', async () => {
    // `undefined` means the caller did not SELECT the column — sync state
    // UNKNOWN — so unmarked items must not be imported. Same doctrine as
    // `crmListingTouchData`.
    const { client, created } = fakePrisma();
    await importJsonMediaToRows(client, {
      listing_id: 'RLS20093870',
      media: [UNMARKED],
    });
    expect(created).toHaveLength(0);
  });
});

describe('CRM-ONLY listing — genuine local media keeps working', () => {
  it('imports unmarked items on a never-synced row', async () => {
    const { client, created } = fakePrisma();
    const res = await importJsonMediaToRows(client, {
      listing_id: 'SL-0004',
      media: [UNMARKED, CRM_UPLOAD],
      last_synced_from_trestle: null,
    });
    expect(res.imported).toBe(2);
    expect(created).toHaveLength(2);
  });

  it('still refuses a Cotality-hosted item even here', async () => {
    const { client, created } = fakePrisma();
    const res = await importJsonMediaToRows(client, {
      listing_id: 'SL-0004',
      media: [COTALITY],
      last_synced_from_trestle: null,
    });
    expect(created).toHaveLength(0);
    expect(res.skippedByProvenance).toBe(1);
  });
});

describe('pre-existing behavior preserved', () => {
  it('still skips keys that already exist (idempotent)', async () => {
    const { client, created } = fakePrisma();
    const first = await importJsonMediaToRows(client, {
      listing_id: 'SL-0004',
      media: [CRM_UPLOAD],
      last_synced_from_trestle: null,
    });
    const existingKey = String(first.planned[0].media_key);

    const second = fakePrisma([existingKey]);
    const res = await importJsonMediaToRows(second.client, {
      listing_id: 'SL-0004',
      media: [CRM_UPLOAD],
      last_synced_from_trestle: null,
    });
    expect(res.imported).toBe(0);
    expect(res.skipped).toBe(1);
    expect(second.created).toHaveLength(0);
    expect(created).toHaveLength(1);
  });

  it('dry-run plans without writing', async () => {
    const { client, created } = fakePrisma();
    const res = await importJsonMediaToRows(
      client,
      { listing_id: 'SL-0004', media: [CRM_UPLOAD], last_synced_from_trestle: null },
      { apply: false },
    );
    expect(res.planned).toHaveLength(1);
    expect(res.imported).toBe(0);
    expect(created).toHaveLength(0);
  });
});
