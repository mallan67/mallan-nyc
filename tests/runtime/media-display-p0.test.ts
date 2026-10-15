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
import { resolveListingMedia, resolveListingMediaFromRows, shouldFetchTrestleMediaFallback, type ListingMediaTableRow } from '@/lib/media/listing-media-resolver';
import { parseCoverArg, validateCover, computePreferredMap } from '@/lib/media/crm-media-dedup';
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
  // Realistic fixture: a distinct photo has a distinct media_url_original. When a
  // test sets only `media_url_cached`, mirror it into the original so identity
  // (which is original-first) treats distinct cached values as distinct photos.
  const row = (over: Partial<ListingMediaTableRow>): ListingMediaTableRow => {
    const merged = {
      media_url_cached: 'x', media_type: 'Photo',
      media_category: null, media_classification: null, order: 0,
      preferred_photo_yn: false, status: 'active', ...over,
    } as ListingMediaTableRow;
    if (merged.media_url_original == null) merged.media_url_original = merged.media_url_cached;
    return merged;
  };

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
    expect(upload).toMatch(/(?:prisma|tx)\.listingMedia\.create/);
    expect(upload).toMatch(/crmMediaKey\(listing\.listing_id, contentHash\)/);
    expect(upload).toMatch(/preferred_photo_yn:/);
  });

  it('reorder persists listing_media.order by media_key (not raw_data)', () => {
    expect(order).toMatch(/(?:prisma|tx)\.listingMedia\.updateMany/);
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

  it('no rows ever imported (PROVABLY, via _count=0) → legacy JSON fallback still works', () => {
    // Codex #1 hardening: a Mallan exclusive (SL-0004) falls back to its legacy
    // JSON only when existence is PROVABLY zero. The caller supplies that via the
    // all-status `_count` signal; without it, existence is unknown and the DTO
    // fails closed (no resurrection) — see the companion assertion below.
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://r2.dev/listings/SL-0004/legacy.webp', type: 'photo' }],
      listing_media: [],
      _count: { listing_media: 0 },
    }));
    expect(dto.media.length).toBe(1);
  });

  it('no _count + empty active rows on a Mallan exclusive → FAIL-CLOSED (no legacy resurrection)', () => {
    // The active-only caller that forgets _count must NOT resurrect deleted media.
    const dto = dbListingToPublicDTO(makeListing({
      media: [{ url: 'https://r2.dev/listings/SL-0004/legacy.webp', type: 'photo' }],
      listing_media: [],
    }));
    expect(dto.media).toEqual([]);
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
    expect(getRoute).not.toMatch(/(?:prisma|tx)\.listingMedia\.(create|update|updateMany|delete|deleteMany|upsert)/);
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
    expect(uploadRoute).toMatch(/existingRow\s*\?[\s\S]*?(?:prisma|tx)\.listingMedia\.update\(/);
    expect(uploadRoute).toMatch(/:\s*await (?:prisma|tx)\.listingMedia\.create\(/);
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
// Post-#281 hotfix — the SECOND resurrection path (Codex): when all CRM
// listing_media rows are soft-deleted, the detail page's old photoCount===0 branch
// called fetchListingMedia(listing_id) and live Trestle/Cotality photos could
// reappear. shouldFetchTrestleMediaFallback was the gate that suppressed it for CRM
// exclusives. NOTE: PR #511 (DB-only render) removed the live-Trestle media fallback
// from the detail page ENTIRELY — there is no live fetch to resurrect anything now.
// The resolver-gate unit tests below stay (they lock shouldFetchTrestleMediaFallback's
// behavior for any caller); the page-wiring test asserts the stronger new invariant.
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

  // CRM-exclusive context (Mallan-owned media): no Trestle mls_id, SL- id.
  const CRM_CTX = { mlsId: null, listingId: 'SL-0004' };

  // 1. Only soft-deleted CRM rows on a CRM exclusive → resolver [] AND suppressed.
  it('only soft-deleted CRM rows (CRM exclusive) → resolver [] and Trestle fallback suppressed', () => {
    const rows = [crmRow({ status: 'deleted' }), crmRow({ media_key: 'crm:SL-0004:def', status: 'deleted', order: 1 })];
    expect(resolveListingMediaFromRows(rows as unknown as ListingMediaTableRow[])).toEqual([]);
    expect(shouldFetchTrestleMediaFallback(rows, /*photoCount*/ 0, CRM_CTX)).toBe(false);
  });

  // 2. Active CRM rows → photoCount>0 → no fallback.
  it('active CRM rows → no Trestle fallback (photoCount>0)', () => {
    expect(shouldFetchTrestleMediaFallback([crmRow()], /*photoCount*/ 3, CRM_CTX)).toBe(false);
  });

  // 3. No listing_media rows at all → fallback still allowed (un-synced / pure IDX).
  it('no listing_media rows → Trestle fallback remains allowed', () => {
    expect(shouldFetchTrestleMediaFallback([], 0, CRM_CTX)).toBe(true);
  });

  // 4. CRM exclusive with imported-then-deleted rows, active set empty → authoritative.
  it('CRM exclusive, rows exist but active set empty → fallback suppressed (table authoritative)', () => {
    const rows = [crmRow({ status: 'deleted' }), crmRow({ media_key: 'crm:SL-0004:ghi', status: 'replaced', order: 1 })];
    expect(shouldFetchTrestleMediaFallback(rows, 0, CRM_CTX)).toBe(false);
  });

  // 5. Trestle/IDX listing (non-crm rows), no photos resolved → fallback unaffected.
  it('Trestle/IDX listing (non-crm rows) with 0 photos → fallback still allowed (no regression)', () => {
    expect(shouldFetchTrestleMediaFallback([trestleRow({ media_type: 'FloorPlan' })], 0, { mlsId: 'RLS20093870', listingId: 'RLS20093870' })).toBe(true);
  });

  it('Trestle/IDX listing with NO rows + 0 photos → fallback allowed', () => {
    expect(shouldFetchTrestleMediaFallback([], 0, { mlsId: 'RLS20093870', listingId: 'RLS20093870' })).toBe(true);
  });

  // ── Wiring: detail page performs NO live Trestle media fetch/fallback at all ──
  it('detail page performs NO live Trestle media fetch or fallback gate (DB-only render, PR #511)', () => {
    // Strip comments so the assertion tests CODE, not the note explaining the removal.
    const code = detailPage
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/shouldFetchTrestleMediaFallback\s*\(/);
    expect(code).not.toMatch(/fetchListingMedia\s*\(/);
  });

  it('detail page LISTING_MEDIA_INCLUDE selects media_key (to detect crm: rows)', () => {
    expect(detailPage).toMatch(/media_key:\s*true/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Post-#282 hotfix — mixed IDX/CRM fallback. CRM rows on a Trestle-synced
// IDX/RLS listing are SUPPLEMENTAL (e.g. an agent-added floor plan/video) and
// must NOT suppress the live Trestle photo fallback. Only a CRM-CREATED
// (Mallan-exclusive) listing treats its CRM rows as authoritative. (Codex.)
// ════════════════════════════════════════════════════════════════════════════
describe('CRM media — mixed IDX vs CRM-exclusive fallback (post-#282)', () => {
  const crmRow = (over: Record<string, unknown> = {}) => ({ media_key: 'crm:x:abc', media_type: 'Photo', status: 'active', ...over });
  const CRM_EXCLUSIVE = { mlsId: null, listingId: 'SL-0004' };           // Mallan exclusive
  const CRM_EXCLUSIVE_RLS_ELIGIBLE = { mlsId: null, listingId: 'RL-0007' }; // CRM-created, RL- id
  const IDX_RLS = { mlsId: 'RLS20093870', listingId: 'RLS20093870' };    // Trestle-synced

  // 1. CRM-exclusive, only deleted crm: rows → suppressed.
  it('1 — CRM-exclusive with only deleted crm: rows → fallback suppressed', () => {
    expect(shouldFetchTrestleMediaFallback([crmRow({ status: 'deleted' })], 0, CRM_EXCLUSIVE)).toBe(false);
  });

  // 2. CRM-exclusive, active crm: photo rows → suppressed (photoCount>0).
  it('2 — CRM-exclusive with active crm: photos → fallback suppressed', () => {
    expect(shouldFetchTrestleMediaFallback([crmRow()], 5, CRM_EXCLUSIVE)).toBe(false);
  });

  // 3. THE FIX — IDX/RLS listing + only a supplemental crm: floor plan, 0 photos → fallback ALLOWED.
  it('3 — IDX/RLS listing with only a supplemental crm: floorplan and 0 photos → Trestle fallback ALLOWED', () => {
    const rows = [crmRow({ media_key: 'crm:RLS20093870:fp', media_type: 'FloorPlan', status: 'active' })];
    expect(shouldFetchTrestleMediaFallback(rows, /*photoCount*/ 0, IDX_RLS)).toBe(true);
  });

  // 4. IDX/RLS listing, no rows, 0 photos → fallback allowed.
  it('4 — IDX/RLS listing with no rows and 0 photos → Trestle fallback allowed', () => {
    expect(shouldFetchTrestleMediaFallback([], 0, IDX_RLS)).toBe(true);
  });

  // 5. IDX/RLS listing with active Trestle (non-crm) rows → existing behavior (photoCount>0 → no fallback).
  it('5 — IDX/RLS listing with active Trestle photo rows → no fallback (uses rows)', () => {
    expect(shouldFetchTrestleMediaFallback([crmRow({ media_key: 'RLS20093870-1' })], 4, IDX_RLS)).toBe(false);
  });

  // 6. Mixed listing with active CRM photo rows → no fallback (CRM photos intended for display).
  it('6 — mixed listing with active CRM photo rows → no fallback', () => {
    expect(shouldFetchTrestleMediaFallback([crmRow()], 2, IDX_RLS)).toBe(false);
  });

  // 7. SL-0004 website-only exclusive stays protected from resurrection.
  it('7 — SL-0004 website-only exclusive with all-deleted crm: rows → fallback suppressed', () => {
    expect(shouldFetchTrestleMediaFallback([crmRow({ status: 'deleted' })], 0, CRM_EXCLUSIVE)).toBe(false);
  });

  // RL- (CRM rental exclusive) is also authoritative; RLS (IDX) is not.
  it('RL- CRM exclusive → authoritative (suppressed); RLS IDX key → supplemental (allowed)', () => {
    expect(shouldFetchTrestleMediaFallback([crmRow({ status: 'deleted' })], 0, CRM_EXCLUSIVE_RLS_ELIGIBLE)).toBe(false);
    expect(shouldFetchTrestleMediaFallback([crmRow({ media_key: 'crm:RLS20093870:fp', status: 'deleted' })], 0, IDX_RLS)).toBe(true);
  });
});

// ── Image-quality contract: main/lightbox = 1600px hero, thumbnail strip = 800px card ──
// Root cause (2026-05-30): the upload route stores media_url_cached = the 800px
// `card` variant and media_url_original = the 1600px `hero`; the resolver preferred
// `media_url_cached`, so the public gallery's MAIN image rendered at 800px (faded).
// Contract: ResolvedMedia.url = full-size (hero) for main image + lightbox;
// ResolvedMedia.thumbUrl = small (card/thumb) for the thumbnail strip/cards.
describe('media quality — hero for main, card for thumbnail', () => {
  const row = (over: Partial<ListingMediaTableRow>): ListingMediaTableRow =>
    ({
      media_url_cached: 'x', media_url_original: 'x', media_type: 'Photo',
      media_category: null, media_classification: null, order: 0,
      preferred_photo_yn: false, status: 'active', ...over,
    } as ListingMediaTableRow);
  const R2 = 'https://pub-x.r2.dev/listings/SL-0004';

  it('CRM upload row: main url = 1600px hero, thumbUrl = 800px card', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${R2}/1780109874725-card.webp`, media_url_original: `${R2}/1780109874725-hero.webp`, preferred_photo_yn: true }),
    ]);
    expect(out[0].url).toBe(`${R2}/1780109874725-hero.webp`);
    expect(out[0].thumbUrl).toBe(`${R2}/1780109874725-card.webp`);
  });

  it('derives the -hero.webp sibling for main when only the -card.webp is stored (no re-upload)', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${R2}/999-card.webp`, media_url_original: `${R2}/999-card.webp` }),
    ]);
    expect(out[0].url).toBe(`${R2}/999-hero.webp`);
    expect(out[0].thumbUrl).toBe(`${R2}/999-card.webp`);
  });

  it('non-variant URL (Trestle/legacy .jpg): url and thumbUrl both fall back to the stored URL — no regression', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: 'https://cdn/legacy/13.jpg', media_url_original: 'https://cdn/legacy/13.jpg' }),
    ]);
    expect(out[0].url).toBe('https://cdn/legacy/13.jpg');
    expect(out[0].thumbUrl).toBe('https://cdn/legacy/13.jpg');
  });

  it('resolveListingMedia: thumbUrl defaults to url when no ThumbURL supplied', () => {
    const out = resolveListingMedia([{ url: 'https://x/p.jpg', mediaType: 'Photo', order: 0 }]);
    expect(out[0].thumbUrl).toBe(out[0].url);
  });

  it('resolveListingMedia: honors an explicit ThumbURL distinct from the full url', () => {
    const out = resolveListingMedia([{ MediaURL: 'https://x/full.jpg', ThumbURL: 'https://x/thumb.jpg', MediaCategory: 'Photo', Order: 0 }]);
    expect(out[0].url).toBe('https://x/full.jpg');
    expect(out[0].thumbUrl).toBe('https://x/thumb.jpg');
  });
});

// ── Visual-identity dedup: the same image stored as multiple rows (different
// media_keys / variants) must render ONCE. SL-0004 had 12/13/14/15.jpg as 2–3
// active rows each (legacy basis-key vs content-hash key) → doubles in the gallery. ──
describe('media dedup — collapse visual duplicates (not just media_key)', () => {
  const row = (over: Partial<ListingMediaTableRow>): ListingMediaTableRow =>
    ({
      media_url_cached: 'x', media_url_original: 'x', media_type: 'Photo',
      media_category: null, media_classification: null, order: 0,
      preferred_photo_yn: false, status: 'active', ...over,
    } as ListingMediaTableRow);
  const R2 = 'https://pub-x.r2.dev/listings/SL-0004';

  // Legacy SL-0004 reality: DISTINCT uploads reused a shared cached INDEX path
  // (`/photos/SL-0004/13.jpg`) while their real image lives in media_url_original
  // (different timestamps). Identity must come from the ORIGINAL timestamp — these
  // are THREE different photos and must NOT collapse (keying on `13.jpg` would
  // delete two real photos).
  it('same shared cached index path but DIFFERENT original timestamps → kept as distinct photos', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${R2}/13.jpg`, media_url_original: `${R2}/1779898434281-card.webp`, order: 13 }),
      row({ media_url_cached: `${R2}/13.jpg`, media_url_original: `${R2}/1779898437080-card.webp`, order: 13 }),
      row({ media_url_cached: `${R2}/13.jpg`, media_url_original: `${R2}/1779898438662-card.webp`, order: 13 }),
    ]);
    expect(out.filter((m) => m.class === 'photo')).toHaveLength(3);
    // …and each renders its OWN distinct hero (not the shared 13.jpg index path).
    expect(out.map((m) => m.url).sort()).toEqual([
      `${R2}/1779898434281-hero.webp`,
      `${R2}/1779898437080-hero.webp`,
      `${R2}/1779898438662-hero.webp`,
    ]);
  });

  it('a card-variant row and a hero-variant row of the SAME timestamp collapse to one photo', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${R2}/1700000000888-card.webp`, media_url_original: `${R2}/1700000000888-card.webp`, order: 5 }),
      row({ media_url_cached: `${R2}/1700000000888-hero.webp`, media_url_original: `${R2}/1700000000888-hero.webp`, order: 6 }),
    ]);
    expect(out.filter((m) => m.class === 'photo')).toHaveLength(1);
  });

  it('dedup keeps the PREFERRED row as the survivor', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${R2}/1700000000007-card.webp`, media_url_original: `${R2}/1700000000007-hero.webp`, order: 2, preferred_photo_yn: false }),
      row({ media_url_cached: `${R2}/1700000000007-card.webp`, media_url_original: `${R2}/1700000000007-hero.webp`, order: 3, preferred_photo_yn: true }),
    ]);
    expect(out.filter((m) => m.class === 'photo')).toHaveLength(1);
    expect(out[0].preferred).toBe(true);
  });

  it('duplicate floor plans collapse to one FloorPlan and never become the hero', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${R2}/p1-card.webp`, media_url_original: `${R2}/p1-hero.webp`, media_type: 'Photo', order: 0 }),
      row({ media_url_cached: `${R2}/17.jpg`, media_url_original: `${R2}/17.jpg`, media_type: 'FloorPlan', media_category: 'FloorPlan', media_classification: 'Document', order: 17 }),
      row({ media_url_cached: `${R2}/17.jpg`, media_url_original: `${R2}/17.jpg`, media_type: 'FloorPlan', media_category: 'FloorPlan', media_classification: 'Document', order: 18 }),
    ]);
    const fps = out.filter((m) => m.mediaType === 'FloorPlan');
    expect(fps).toHaveLength(1);
    expect(fps[0].isPrimary).toBe(false);
    expect(out[0].class).toBe('photo');
  });

  it('genuinely distinct photos are NOT collapsed', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${R2}/100-card.webp`, media_url_original: `${R2}/100-hero.webp`, order: 0 }),
      row({ media_url_cached: `${R2}/200-card.webp`, media_url_original: `${R2}/200-hero.webp`, order: 1 }),
      row({ media_url_cached: `${R2}/300-card.webp`, media_url_original: `${R2}/300-hero.webp`, order: 2 }),
    ]);
    expect(out.filter((m) => m.class === 'photo')).toHaveLength(3);
  });
});

// ── visualIdentity fallback for NON-R2 rows: original-first (Codex review, #286) ──
// A shared cached/index URL (e.g. legacy `/photos/SL-0004/13.jpg`) can be reused by
// DISTINCT real photos; identity must come from media_url_original, never the cached
// index path, so different photos are never collapsed.
describe('visualIdentity fallback — original-first for non-R2 rows', () => {
  const row = (over: Partial<ListingMediaTableRow>): ListingMediaTableRow =>
    ({
      media_url_cached: null, media_url_original: null, media_type: 'Photo',
      media_category: null, media_classification: null, order: 0,
      preferred_photo_yn: false, status: 'active', ...over,
    } as ListingMediaTableRow);
  const CDN = 'https://cdn.example.com';

  it('1 — same cached URL, DIFFERENT original URLs → NOT deduped (kept distinct)', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${CDN}/photos/SL-0004/13.jpg`, media_url_original: `${CDN}/source/imgA.jpg`, order: 0 }),
      row({ media_url_cached: `${CDN}/photos/SL-0004/13.jpg`, media_url_original: `${CDN}/source/imgB.jpg`, order: 1 }),
    ]);
    expect(out.filter((m) => m.class === 'photo')).toHaveLength(2);
  });

  it('2 — same original URL → deduped to one', () => {
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${CDN}/photos/SL-0004/9.jpg`, media_url_original: `${CDN}/source/same.jpg`, order: 0 }),
      row({ media_url_cached: `${CDN}/photos/SL-0004/99.jpg`, media_url_original: `${CDN}/source/same.jpg`, order: 1 }),
    ]);
    expect(out.filter((m) => m.class === 'photo')).toHaveLength(1);
  });

  it('3 — R2 variant rows still dedup by the timestamp stem (from original first)', () => {
    const R2 = 'https://pub-x.r2.dev/listings/SL-0004';
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${R2}/13.jpg`, media_url_original: `${R2}/1779898434281-card.webp`, order: 0 }),
      row({ media_url_cached: `${R2}/99.jpg`, media_url_original: `${R2}/1779898434281-hero.webp`, order: 1 }),
    ]);
    // Same upload timestamp (different cached index paths) → one photo.
    expect(out.filter((m) => m.class === 'photo')).toHaveLength(1);
  });

  it('4 — SL-0004 shared cached/index path with distinct originals stays protected (3 distinct photos)', () => {
    const R2 = 'https://pub-x.r2.dev/listings/SL-0004';
    const out = resolveListingMediaFromRows([
      row({ media_url_cached: `${R2}/13.jpg`, media_url_original: `${R2}/1779898434281-card.webp`, order: 13 }),
      row({ media_url_cached: `${R2}/13.jpg`, media_url_original: `${R2}/1779898437080-card.webp`, order: 13 }),
      row({ media_url_cached: `${R2}/13.jpg`, media_url_original: `${R2}/1779898438662-card.webp`, order: 13 }),
    ]);
    expect(out.filter((m) => m.class === 'photo')).toHaveLength(3);
  });
});

// ── --cover argument validation for the SL-0004 dedup script (Codex review, #286) ──
// A malformed --cover (abc / NaN / 1.5 / 0 / out-of-range) must be rejected by the
// gate BEFORE any write, so the apply loop never blanks out every preferred_photo_yn.
describe('dedup script --cover validation', () => {
  it('non-numeric cover is rejected (would abort before writes)', () => {
    for (const bad of ['abc', 'NaN', '', '  ', '1e3', 'null', 'undefined']) {
      const { cover, error } = parseCoverArg(bad);
      expect(cover).toBeNull();
      expect(error).toBeTruthy();
    }
  });

  it('decimal / signed cover is rejected', () => {
    for (const bad of ['1.5', '0.0', '-1', '+2', '3.0']) {
      const { cover, error } = parseCoverArg(bad);
      expect(cover).toBeNull();
      expect(error).toBeTruthy();
    }
  });

  it('absent flag is allowed (cover null, no error)', () => {
    expect(parseCoverArg(undefined)).toEqual({ cover: null, error: null });
  });

  it('valid positive integer parses', () => {
    expect(parseCoverArg('1')).toEqual({ cover: 1, error: null });
    expect(parseCoverArg('15')).toEqual({ cover: 15, error: null });
    expect(parseCoverArg(' 2 ')).toEqual({ cover: 2, error: null }); // surrounding ws trimmed
  });

  it('out-of-range cover is rejected against photo count (would abort before writes)', () => {
    expect(validateCover(0, 15)).toBeTruthy();   // 0 < 1
    expect(validateCover(16, 15)).toBeTruthy();  // > count
    expect(validateCover(-1, 15)).toBeTruthy();
    expect(validateCover(null, 15)).toBeNull();  // absent OK
    expect(validateCover(1, 15)).toBeNull();
    expect(validateCover(15, 15)).toBeNull();
  });

  it('valid cover sets EXACTLY one photo preferred; floor plans never preferred', () => {
    const photoIds = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const floorPlanIds = ['fp1', 'fp2'];
    const map = computePreferredMap(photoIds, floorPlanIds, 3);
    const trues = [...map.entries()].filter(([, v]) => v).map(([k]) => k);
    expect(trues).toEqual(['p3']);                       // exactly one, the cover
    expect(map.get('fp1')).toBe(false);
    expect(map.get('fp2')).toBe(false);
    expect([...map.values()].filter(Boolean)).toHaveLength(1);
  });

  it('floor plans stay false even if a floor plan id were the cover index', () => {
    const map = computePreferredMap(['p1', 'p2'], ['fp1'], 1);
    expect(map.get('p1')).toBe(true);
    expect(map.get('p2')).toBe(false);
    expect(map.get('fp1')).toBe(false);
  });
});
