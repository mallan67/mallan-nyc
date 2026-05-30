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
import { resolveListingMediaFromRows, shouldFetchTrestleMediaFallback, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';
import { dbListingToPublicDTO, type DbListing } from '@/lib/idx/db-to-public-dto';

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
  it('category mirrors Cotality MediaCategory: FloorPlan→FloorPlan, Photo→Photo, Video→Video', () => {
    // Cotality $metadata MediaCategory has a dedicated `FloorPlan` member (value 6) —
    // floor plans MUST mirror it, not collapse to `Document` (that is the separate
    // MediaClassification member). See artifacts/metadata.xml:11276-11357 and the
    // Trestle sync, which stores raw `FloorPlan` for synced floor plans.
    expect(crmMediaCategory('FloorPlan')).toBe('FloorPlan');
    expect(crmMediaCategory('Photo')).toBe('Photo');
    expect(crmMediaCategory('Video')).toBe('Video');
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
      row({ media_url_cached: 'FP', media_type: 'FloorPlan', media_category: 'FloorPlan', media_classification: 'Document', order: 1 }),
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

// ════════════════════════════════════════════════════════════════════════════
// CRM media P0 — Codex follow-up hotfix (2026-05-29). Three findings:
//   1. GET /media must be read-only (no lazy import / no DB write).
//   2. Deleted (imported-from-JSON) media must not resurrect via the legacy
//      JSON fallback after the last active row is deleted.
//   3. Re-upload of a soft-deleted same image restores the row (no media_key
//      @unique crash).
// ════════════════════════════════════════════════════════════════════════════
describe('CRM media P0 — Codex follow-up hotfix', () => {
  const getRoute = read('app/api/crm/listings/[id]/media/route.ts');
  const uploadRoute = read('app/api/crm/listings/[id]/media/upload/route.ts');
  const mediaIdRoute = read('app/api/crm/listings/[id]/media/[mediaId]/route.ts');
  const detailPage = read('app/listing/[...slug]/page.tsx');
  const migrationScript = read('scripts/migrate-crm-media-to-rows.ts');

  function makeRow(over: Partial<ListingMediaTableRow> = {}): ListingMediaTableRow {
    return {
      media_url_original: 'https://r2.dev/listings/SL-0004/a.webp',
      media_url_cached: 'https://r2.dev/listings/SL-0004/a-card.webp',
      media_type: 'Photo', media_category: 'Photo', media_classification: null,
      order: 0, preferred_photo_yn: false, status: 'active', ...over,
    };
  }
  function makeListing(over: Record<string, unknown> = {}): DbListing {
    return ({
      id: '1', listing_id: 'SL-0004', mls_id: 'SL-0004', status: 'Active',
      listing_type: 'sale', property_type: 'Residential', property_sub_type: 'Condominium',
      list_price: '770000', bedrooms_total: 1, bathrooms_full: 1, bathrooms_half: 0,
      living_area: '860', borough: 'manhattan', neighborhood: 'Turtle Bay',
      address: { StreetNumber: '333', StreetName: 'East 46th Street', UnitNumber: '2G', City: 'New York', PostalCode: '10017' },
      features: {}, media: [], agent_info: { ListOfficeName: 'Mallan Real Estate Inc.' },
      rls_eligible: true, idx_display_yn: true, internet_entire_listing_display_yn: true,
      internet_address_display_yn: true, owner_opt_out: false, participant_only: false,
      listing_contract_date: null,
      modification_timestamp: new Date('2026-05-01T00:00:00Z').toISOString(),
      created_at: new Date('2026-04-01T00:00:00Z').toISOString(),
      updated_at: new Date('2026-05-01T00:00:00Z').toISOString(),
      ...over,
    } as unknown) as DbListing;
  }

  // ── Finding #2 (executable, via the real public DTO) ──
  it('all listing_media rows deleted → DTO media empty; legacy JSON NOT resurrected', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://r2.dev/listings/SL-0004/legacy.webp', type: 'photo' }],
      listing_media: [makeRow({ status: 'deleted' })],
    }));
    expect(dto.media).toEqual([]);
  });

  it('multiple deleted rows + multiple legacy JSON items → still no leak', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://r2.dev/legacy-A.webp', type: 'photo' }, { url: 'https://r2.dev/legacy-B.webp', type: 'photo' }],
      listing_media: [makeRow({ status: 'deleted', order: 0 }), makeRow({ status: 'deleted', order: 1 })],
    }));
    expect(dto.media.length).toBe(0);
  });

  it('no rows ever imported (listing_media empty) → legacy JSON fallback still works', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://r2.dev/listings/SL-0004/legacy.webp', type: 'photo' }],
      listing_media: [],
    }));
    expect(dto.media.length).toBe(1);
  });

  it('one active + one deleted row → only the active surfaces (no deleted leak)', () => {
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://r2.dev/legacy.webp', type: 'photo' }],
      listing_media: [
        makeRow({ media_url_cached: 'https://r2.dev/active.webp', status: 'active', order: 0 }),
        makeRow({ media_url_cached: 'https://r2.dev/gone.webp', status: 'deleted', order: 1 }),
      ],
    }));
    expect(dto.media.length).toBe(1);
    expect(dto.media[0].url).toContain('active.webp');
  });

  it('resolveListingMediaFromRows returns [] when every row is deleted', () => {
    expect(resolveListingMediaFromRows([makeRow({ status: 'deleted' })])).toEqual([]);
  });

  // ── Finding #1: GET is read-only ──
  it('GET /media performs NO import/migration and NO DB write', () => {
    expect(getRoute).not.toMatch(/importJsonMediaToRows\s*\(/);
    expect(getRoute).not.toMatch(/prisma\.listingMedia\.(create|update|updateMany|delete|deleteMany|upsert)/);
  });

  it('GET /media distinguishes "no rows" (legacy preview) from "all deleted" (authoritative empty)', () => {
    expect(getRoute).toMatch(/rows\.length\s*>\s*0/);   // all-deleted → media: []
    expect(getRoute).toMatch(/_legacyPreview/);          // read-only legacy preview path
    expect(getRoute).toMatch(/_preview:\s*true/);
  });

  // ── Finding #2 reader wiring: detail page sees deleted rows ──
  it('detail page fetches listing_media without an active-only filter', () => {
    expect(detailPage).toMatch(/LISTING_MEDIA_INCLUDE/);
    expect(detailPage).not.toMatch(/listing_media:\s*\{\s*where:\s*\{\s*status:\s*'active'\s*\}/);
  });

  // ── Finding #3: re-upload of a deleted image restores instead of crashing ──
  it('upload restores a soft-deleted row (update) instead of create() on existing key', () => {
    expect(uploadRoute).toMatch(/existingRow\s*\?[\s\S]*?prisma\.listingMedia\.update\(/);
    expect(uploadRoute).toMatch(/:\s*await prisma\.listingMedia\.create\(/);
  });

  it('upload still returns a controlled 409 for an ACTIVE duplicate (no regression)', () => {
    expect(uploadRoute).toMatch(/existingRow\s*&&\s*existingRow\.status\s*===\s*["']active["']/);
    expect(uploadRoute).toMatch(/duplicate:\s*true/);
    expect(uploadRoute).toMatch(/status:\s*409/);
  });

  // ── Trestle/RLS rows remain untouched ──
  it('delete + set-main remain CRM-key-guarded (Trestle/RLS rows never modified here)', () => {
    expect(mediaIdRoute).toMatch(/isCrmMediaKey\(mediaKey\)/);
  });

  // ── Migration script remains dry-run by default ──
  it('migration script stays dry-run by default (--apply gated)', () => {
    expect(migrationScript).toMatch(/const APPLY\s*=\s*process\.argv\.includes\(["']--apply["']\)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Post-#281 hotfix — close the SECOND resurrection path (Codex): when all CRM
// listing_media rows are soft-deleted, the detail page's photoCount===0 branch
// called fetchListingMedia(listing_id) and live Trestle/Cotality photos could
// reappear. The relational table is authoritative for CRM exclusives — no
// Trestle fallback when CRM rows exist (even if all deleted). IDX listings
// (Trestle rows / no rows) keep the fallback.
// ════════════════════════════════════════════════════════════════════════════
describe('CRM media — no Trestle fallback after CRM rows deleted (post-#281 hotfix)', () => {
  const detailPage = read('app/listing/[...slug]/page.tsx');
  const crmRow = (over: Record<string, unknown> = {}) => ({
    media_key: 'crm:SL-0004:abc', media_url_original: 'https://r2.dev/a.webp',
    media_url_cached: 'https://r2.dev/a-card.webp', media_type: 'Photo',
    media_category: 'Photo', media_classification: null, order: 0,
    preferred_photo_yn: false, status: 'active', ...over,
  });
  const trestleRow = (over: Record<string, unknown> = {}) =>
    crmRow({ media_key: 'RLS20093870-1', ...over });

  // 1. Only soft-deleted CRM rows → resolver [] AND fallback suppressed.
  it('only soft-deleted CRM rows → resolver returns [] and Trestle fallback is suppressed', () => {
    const rows = [crmRow({ status: 'deleted' }), crmRow({ media_key: 'crm:SL-0004:def', status: 'deleted', order: 1 })];
    expect(resolveListingMediaFromRows(rows as unknown as ListingMediaTableRow[])).toEqual([]);
    expect(shouldFetchTrestleMediaFallback(rows, /*photoCount*/ 0)).toBe(false);
  });

  // 2. Active CRM rows → photoCount>0 → no fallback.
  it('active CRM rows → no Trestle fallback (photoCount>0)', () => {
    expect(shouldFetchTrestleMediaFallback([crmRow()], /*photoCount*/ 3)).toBe(false);
  });

  // 3. No listing_media rows at all → fallback still allowed (un-synced / pure IDX).
  it('no listing_media rows → Trestle fallback remains allowed', () => {
    expect(shouldFetchTrestleMediaFallback([], 0)).toBe(true);
  });

  // 4. CRM exclusive with imported-then-deleted rows, active set empty → table authoritative.
  it('CRM exclusive, rows exist but active set empty → fallback suppressed (table authoritative)', () => {
    const rows = [crmRow({ status: 'deleted' }), crmRow({ media_key: 'crm:SL-0004:ghi', status: 'replaced', order: 1 })];
    expect(shouldFetchTrestleMediaFallback(rows, 0)).toBe(false);
  });

  // 5. Trestle/IDX listing (non-crm rows), no photos resolved → fallback unaffected.
  it('Trestle/IDX listing (non-crm rows) with 0 photos → fallback still allowed (no regression)', () => {
    expect(shouldFetchTrestleMediaFallback([trestleRow({ media_type: 'FloorPlan' })], 0)).toBe(true);
  });

  it('Trestle/IDX listing with NO rows + 0 photos → fallback allowed', () => {
    expect(shouldFetchTrestleMediaFallback([], 0)).toBe(true);
  });

  // ── Wiring: detail page uses the gate + selects media_key ──
  it('detail page gates the Trestle fallback via shouldFetchTrestleMediaFallback', () => {
    expect(detailPage).toMatch(/shouldFetchTrestleMediaFallback\(listingMediaRows,\s*photoCount\)/);
    expect(detailPage).not.toMatch(/const shouldFetchMedia\s*=\s*photoCount === 0;/); // old unconditional gate gone
  });

  it('detail page LISTING_MEDIA_INCLUDE selects media_key (to detect crm: rows)', () => {
    expect(detailPage).toMatch(/media_key:\s*true/);
  });
});
