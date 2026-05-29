/// <reference types="jest" />
/**
 * CRM media P0 — Cotality-shaped listing_media for CRM exclusives.
 *
 * Covers the P0 contract (docs/crm/sales-form-media-p0-implementation-plan-2026-05-29.md):
 *  - upload writes Cotality-shaped rows (media_key/media_type/media_category/order/preferred)
 *  - content-dedup via stable media_key
 *  - hero = preferred_photo_yn photo (not first upload)
 *  - reorder uses listing_media.order
 *  - floor plan never becomes hero
 *  - delete soft-deletes (status='deleted') and deleted media does not resolve
 *  - Trestle rows untouched (CRM endpoints reject non-`crm:` keys; importer only mints crm: keys)
 *  - migration dry-run maps JSON → planned rows WITHOUT writing
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  crmMediaKey,
  crmMediaType,
  crmMediaCategory,
  isCrmMediaKey,
  importJsonMediaToRows,
  type LegacyMediaItem,
} from '@/lib/media/crm-media';
import { resolveListingMediaFromRows, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// ── tiny mock PrismaClient for importJsonMediaToRows ──
function makePrisma(existing: Set<string> = new Set()) {
  const created: Array<Record<string, unknown>> = [];
  const client = {
    created,
    listingMedia: {
      findUnique: async ({ where }: { where: { media_key: string } }) =>
        existing.has(where.media_key) ? { id: 1n } : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return data;
      },
    },
  };
  return client;
}

describe('crm media_key — stable, unique, content-dedup', () => {
  it('is deterministic for the same listing + content hash (dedup)', () => {
    const h = 'a'.repeat(64);
    expect(crmMediaKey('SL-0004', h)).toBe(crmMediaKey('SL-0004', h));
  });
  it('differs by listing and by content', () => {
    expect(crmMediaKey('SL-0004', 'a'.repeat(64))).not.toBe(crmMediaKey('SL-0005', 'a'.repeat(64)));
    expect(crmMediaKey('SL-0004', 'a'.repeat(64))).not.toBe(crmMediaKey('SL-0004', 'b'.repeat(64)));
  });
  it('lives in the crm: namespace (so Trestle keys never collide)', () => {
    expect(isCrmMediaKey(crmMediaKey('SL-0004', 'a'.repeat(64)))).toBe(true);
    expect(isCrmMediaKey('RLS20093870-1')).toBe(false);
    expect(isCrmMediaKey(null)).toBe(false);
  });
});

describe('crm media type/category classification', () => {
  it('floor plan detected by type OR caption, never Photo', () => {
    expect(crmMediaType('floorplan', '')).toBe('FloorPlan');
    expect(crmMediaType('photo', 'Ground Floor Plan')).toBe('FloorPlan');
    expect(crmMediaType('', 'floor plan')).toBe('FloorPlan');
  });
  it('photo + video map correctly', () => {
    expect(crmMediaType('photo', '')).toBe('Photo');
    expect(crmMediaType('', '')).toBe('Photo');
    expect(crmMediaType('video', '')).toBe('Video');
  });
  it('category: FloorPlan→Document, Photo→Photo', () => {
    expect(crmMediaCategory('FloorPlan')).toBe('Document');
    expect(crmMediaCategory('Photo')).toBe('Photo');
  });
});

describe('importJsonMediaToRows — JSON → Cotality rows', () => {
  const media: LegacyMediaItem[] = [
    { url: 'https://r2/p1.webp', heroUrl: 'https://r2/p1.webp', type: 'photo', order: 0, contentHash: 'a'.repeat(64) },
    { url: 'https://r2/fp.webp', caption: 'Floor Plan', order: 1, contentHash: 'b'.repeat(64) },
  ];

  it('dry-run (apply:false) plans rows but writes nothing', async () => {
    const prisma = makePrisma();
    const res = await importJsonMediaToRows(prisma as never, { listing_id: 'SL-0004', media }, { apply: false });
    expect(res.planned).toHaveLength(2);
    expect(res.imported).toBe(0);
    expect(prisma.created).toHaveLength(0);
    // first is a Photo, second a FloorPlan; keys are crm:
    expect(res.planned[0].media_type).toBe('Photo');
    expect(res.planned[1].media_type).toBe('FloorPlan');
    expect(res.planned.every((p) => isCrmMediaKey(p.media_key))).toBe(true);
  });

  it('apply:true writes one Cotality-shaped row per item', async () => {
    const prisma = makePrisma();
    const res = await importJsonMediaToRows(prisma as never, { listing_id: 'SL-0004', media }, { apply: true });
    expect(res.imported).toBe(2);
    expect(prisma.created).toHaveLength(2);
    const photo = prisma.created[0];
    expect(photo.media_key).toBe(crmMediaKey('SL-0004', 'a'.repeat(64)));
    expect(photo.media_type).toBe('Photo');
    expect(photo.media_category).toBe('Photo');
    expect(photo.order).toBe(0);
    expect(photo.preferred_photo_yn).toBe(false); // agent sets hero
    expect(photo.status).toBe('active');
    expect(prisma.created[1].media_type).toBe('FloorPlan');
  });

  it('is idempotent — skips items whose media_key already exists', async () => {
    const existing = new Set([crmMediaKey('SL-0004', 'a'.repeat(64))]);
    const prisma = makePrisma(existing);
    const res = await importJsonMediaToRows(prisma as never, { listing_id: 'SL-0004', media }, { apply: true });
    expect(res.skipped).toBe(1);
    expect(res.imported).toBe(1);
    expect(prisma.created).toHaveLength(1);
    expect(prisma.created[0].media_type).toBe('FloorPlan');
  });
});

describe('resolveListingMediaFromRows — hero / floor / order / soft-delete', () => {
  const row = (over: Partial<ListingMediaTableRow>): ListingMediaTableRow =>
    ({
      media_url_cached: 'x', media_url_original: 'x', media_type: 'Photo',
      media_category: null, media_classification: null, order: 0,
      preferred_photo_yn: false, status: 'active', ...over,
    } as ListingMediaTableRow);

  it('hero = the preferred photo, not the first by upload order', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: 'P1', order: 0, preferred_photo_yn: false }),
      row({ media_url_cached: 'P2', order: 1, preferred_photo_yn: true }),
    ]);
    expect(out[0].isPrimary).toBe(true);
    expect(out[0].preferred).toBe(true);
    expect(out[0].class).toBe('photo');
  });

  it('floor plan is never the hero', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: 'P1', media_type: 'Photo', order: 0 }),
      row({ media_url_cached: 'FP', media_type: 'FloorPlan', media_category: 'Document', media_classification: 'Document', order: 1 }),
    ]);
    expect(out[0].class).toBe('photo');
    const fp = out.find((m) => m.mediaType === 'FloorPlan');
    expect(fp).toBeDefined();
    expect(fp!.isPrimary).toBe(false);
  });

  it('photo order follows listing_media.order', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: 'C', order: 2 }),
      row({ media_url_cached: 'A', order: 0 }),
      row({ media_url_cached: 'B', order: 1 }),
    ]).filter((m) => m.class === 'photo');
    // resolved photos are sorted by listing_media.order (0,1,2)
    expect(out.map((m) => m.providerOrder)).toEqual([0, 1, 2]);
  });

  it('soft-deleted rows do not resolve', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: 'P1', order: 0 }),
      row({ media_url_cached: 'GONE', order: 1, status: 'deleted' }),
    ]);
    expect(out.some((m) => m.url.includes('GONE'))).toBe(false);
    expect(out).toHaveLength(1);
  });
});

// ── Route wiring assertions (the heavy DB/auth/R2 path is covered at runtime; here
//    we lock the critical invariants the routes must keep) ──
describe('route invariants (source-locked)', () => {
  const upload = read('app/api/crm/listings/[id]/media/upload/route.ts');
  const order = read('app/api/crm/listings/[id]/media-order/route.ts');
  const item = read('app/api/crm/listings/[id]/media/[mediaId]/route.ts');

  it('upload writes a listing_media row keyed by the crm media_key', () => {
    expect(upload).toMatch(/prisma\.listingMedia\.create/);
    expect(upload).toMatch(/crmMediaKey\(listing\.listing_id, contentHash\)/);
    expect(upload).toMatch(/preferred_photo_yn:/);
  });

  it('reorder persists listing_media.order by media_key (not raw_data)', () => {
    expect(order).toMatch(/prisma\.listingMedia\.updateMany/);
    expect(order).toMatch(/data: \{ order: index \}/);
    expect(order).not.toMatch(/updatedRawData/); // the old raw_data.media_order write the resolver ignored is gone
  });

  it('set-as-main clears siblings then sets one preferred (CRM keys only)', () => {
    expect(item).toMatch(/preferred_photo_yn: false/);
    expect(item).toMatch(/preferred_photo_yn: true/);
    expect(item).toMatch(/isCrmMediaKey\(mediaKey\)/);
    expect(item).toMatch(/media_type !== "Photo"/); // floor plan can't be hero
  });

  it('delete soft-deletes by media_key and only touches crm: rows', () => {
    expect(item).toMatch(/status: "deleted"/);
    expect(item).toMatch(/isCrmMediaKey\(mediaKey\)/);
  });
});
