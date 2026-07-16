/// <reference types="jest" />
/**
 * Smoke + behavioral tests for the read-only media remediation toolchain.
 * The audit/dry-run expose injectable `runAudit`/`runDryRun` so we start both
 * tools here with MOCKED Prisma/Cotality deps — no DB, no live feed, no writes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  runAudit, buildInventoryRow, type AuditListingRow,
} from '../../scripts/audit/media-coverage-audit';
import {
  runDryRun, planListing, normalizeSourceUrl,
  type DryRunListingRow, type CotalityPhoto, type AllStatusRow,
} from '../../scripts/backfill/bucket-b-media-dry-run';
import { buildMediaR2Key } from '@/lib/media/media-sync-service';
import type { CotalityProbe } from '@/lib/media/media-coverage-bucket';
import type { ListingMediaTableRow } from '@/lib/media/listing-media-resolver';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

function activeRow(over: Partial<ListingMediaTableRow> = {}): ListingMediaTableRow {
  return {
    media_url_original: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1.jpg',
    media_url_cached: null, media_type: 'Photo', media_category: 'Photo',
    media_classification: null, order: 0, preferred_photo_yn: false, status: 'active', ...over,
  };
}
function auditRow(over: Partial<AuditListingRow> = {}): AuditListingRow {
  return {
    listing_id: 'RLS20000001', rls_eligible: true, status: 'Active',
    idx_display_yn: true, internet_entire_listing_display_yn: true,
    owner_opt_out: false, participant_only: false,
    media: [], _count: { listing_media: 0 }, listing_media: [], ...over,
  };
}

// ── 1. Both tools start under Node 20 via tsx (real toolchain load) ──
describe('toolchain — executable under Node 20 / tsx', () => {
  it('package.json wires tsx scripts for audit + dry-run', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['media:audit']).toMatch(/tsx .*media-coverage-audit\.cli\.ts/);
    expect(pkg.scripts['media:audit:cotality']).toMatch(/--with-cotality/);
    expect(pkg.scripts['media:backfill:dryrun']).toMatch(/tsx .*bucket-b-media-dry-run\.cli\.ts/);
  });

  it('both logic modules load under tsx (Node 20) without touching a DB', () => {
    // Run tsx via its Node entry (avoids Windows .cmd/shell quoting). Importing the
    // LOGIC modules proves they load under the real tsx toolchain and resolve the
    // repo @/ aliases, without running any CLI main()/DB connection.
    const code =
      "Promise.all([import('@/scripts/audit/media-coverage-audit.ts')," +
      "import('@/scripts/backfill/bucket-b-media-dry-run.ts')])" +
      ".then(([a,b])=>process.exit(typeof a.runAudit==='function'&&typeof b.runDryRun==='function'?0:3))" +
      ".catch(e=>{console.error(e);process.exit(4)})";
    const res = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '-e', code], {
      cwd: ROOT, timeout: 90_000, encoding: 'utf8',
    });
    expect(res.status).toBe(0);
  }, 120_000);
});

// ── 2. No write path is reachable ──
describe('read-only guarantee — no writes reachable', () => {
  it('no script (logic OR cli) references a Prisma write or an R2 mutation', () => {
    for (const f of [
      'scripts/audit/media-coverage-audit.ts',
      'scripts/audit/media-coverage-audit.cli.ts',
      'scripts/backfill/bucket-b-media-dry-run.ts',
      'scripts/backfill/bucket-b-media-dry-run.cli.ts',
    ]) {
      const src = read(f);
      expect(src).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
      expect(src).not.toMatch(/\bput\s*\(|\bwrite\s*\(|PutObject|r2\.put/i);
      // No apply-flag HANDLING (a quoted '--apply' token). The doc comments may
      // legitimately say "no --apply" — match only the code form.
      expect(src).not.toMatch(/['"]--apply['"]/);
    }
  });
});

// ── 3 & 4. Tri-state Cotality: error / skip → UNKNOWN, never D ──
describe('tri-state Cotality', () => {
  it('provider error on a DB-empty listing → bucket U (never D)', async () => {
    const res = await runAudit({
      fetchListings: async () => [auditRow({ listing_id: 'RLS20005759' })],
      probeCotality: async (): Promise<CotalityProbe> => ({ status: 'unknown', reason: 'HTTP 503' }),
    });
    expect(res.inventory[0].bucket).toBe('U');
    expect(res.incomplete).toBe(true);       // incomplete audit flagged
    expect(res.cotalityFailures).toBe(1);
  });

  it('skipped probe (no --with-cotality) on a DB-empty listing → bucket U', async () => {
    const res = await runAudit({ fetchListings: async () => [auditRow({ listing_id: 'RLS20005759' })] });
    expect(res.inventory[0].bucket).toBe('U');
  });

  it('confirmed photos → B_NEW; confirmed zero → D', async () => {
    const res = await runAudit({
      fetchListings: async () => [auditRow({ listing_id: 'RLS-A' }), auditRow({ listing_id: 'RLS-B' })],
      probeCotality: async (id) => (id === 'RLS-A' ? { status: 'confirmed', photoCount: 5 } : { status: 'confirmed', photoCount: 0 }),
    });
    expect(res.inventory.find((r) => r.listingId === 'RLS-A')!.bucket).toBe('B_NEW');
    expect(res.inventory.find((r) => r.listingId === 'RLS-B')!.bucket).toBe('D');
  });
});

// ── 5. Floorplan/video-only media does not count as photos ──
describe('production media classifier — photos only', () => {
  it('floorplan-only active rows → 0 usable photos', () => {
    const rec = buildInventoryRow(auditRow({
      listing_media: [activeRow({ media_type: 'FloorPlan', media_category: 'FloorPlan', media_classification: 'Document', media_url_original: 'https://api.cotality.com/trestle/Media/Property/DOCUMENT-Pdf/1.pdf' })],
    }), { status: 'unknown', reason: 'skip' });
    expect(rec.activeUsablePhotoCount).toBe(0);
  });
  it('floorplan-only legacy JSON → 0 usable legacy photos', () => {
    const rec = buildInventoryRow(auditRow({
      media: [{ url: 'https://x/DOCUMENT-Gif/fp.gif', mediaType: 'FloorPlan', order: 0 }],
    }), { status: 'unknown', reason: 'skip' });
    expect(rec.legacyUsablePhotoCount).toBe(0);
  });
  it('real photo rows count', () => {
    const rec = buildInventoryRow(auditRow({ listing_media: [activeRow(), activeRow({ order: 1, media_url_original: 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/2.jpg' })] }), { status: 'unknown', reason: 'skip' });
    expect(rec.activeUsablePhotoCount).toBe(2);
  });
});

// ── 6. Canonical display gate ──
describe('canonical display eligibility', () => {
  it('imports the repo isListingDisplayable (not a simplified expression)', () => {
    for (const f of ['scripts/audit/media-coverage-audit.ts', 'scripts/backfill/bucket-b-media-dry-run.ts']) {
      expect(read(f)).toMatch(/from '@\/lib\/search\/listing-access-decision'/);
    }
  });
  it('idx_display_yn=false → non-displayable → bucket F', () => {
    const rec = buildInventoryRow(auditRow({ idx_display_yn: false }), { status: 'confirmed', photoCount: 9 });
    expect(rec.displayable).toBe(false);
    expect(rec.bucket).toBe('F');
  });
  it('internet_entire_listing_display_yn=false → non-displayable → F', () => {
    const rec = buildInventoryRow(auditRow({ internet_entire_listing_display_yn: false }), { status: 'confirmed', photoCount: 9 });
    expect(rec.bucket).toBe('F');
  });
});

// ── 7 & 8. Inactive rows → restores (not inserts); exact buildMediaR2Key ──
describe('dry-run planning — restores vs inserts, exact R2 keys', () => {
  function allStatus(over: Partial<AllStatusRow> = {}): AllStatusRow {
    return { id: '1', status: 'deleted', media_key: 'RLS-X-0', media_url_original: 'https://cdn/photo/1.jpg', media_url_cached: null, order: 0, media_type: 'Photo', ...over };
  }
  const dryRow = (over: Partial<DryRunListingRow> = {}): DryRunListingRow => ({
    listing_id: 'RLS20005759', rls_eligible: true, status: 'Active',
    idx_display_yn: true, internet_entire_listing_display_yn: true, owner_opt_out: false, participant_only: false,
    media: [], _count: { listing_media: 1 }, listing_media_active: [], listing_media_all: [allStatus()], ...over,
  });

  it('a Cotality photo matching an INACTIVE row (by URL) plans a RESTORE, not an insert', () => {
    const plan = planListing(dryRow(), [{ order: 0, sourceUrl: 'https://cdn/photo/1.jpg?sig=abc' }]);
    expect(plan.bucket).toBe('B_INACTIVE');
    expect(plan.expectedRestores).toBe(1);
    expect(plan.expectedInserts).toBe(0);
    expect(plan.items[0].action).toBe('restore');
    expect(plan.items[0].matchedRowId).toBe('1');
  });

  it('a Cotality photo with NO existing row plans an INSERT (B_NEW)', () => {
    const plan = planListing(dryRow({ _count: { listing_media: 0 }, listing_media_all: [] }), [{ order: 0, sourceUrl: 'https://cdn/new.jpg' }]);
    expect(plan.bucket).toBe('B_NEW');
    expect(plan.expectedInserts).toBe(1);
    expect(plan.expectedRestores).toBe(0);
  });

  it('R2 keys come from the repo buildMediaR2Key helper exactly (photos/<id>/<order>.jpg)', () => {
    const plan = planListing(dryRow({ _count: { listing_media: 0 }, listing_media_all: [] }), [{ order: 3, sourceUrl: 'https://cdn/x.png' }]);
    expect(plan.items[0].r2Key).toBe(buildMediaR2Key('RLS20005759', 'Photo', 3));
    expect(plan.items[0].r2Key).toBe('photos/RLS20005759/3.jpg');
  });

  it('per-listing source-URL dedupe → no duplicate media planned', () => {
    const plan = planListing(dryRow({ _count: { listing_media: 0 }, listing_media_all: [] }), [
      { order: 0, sourceUrl: 'https://cdn/a.jpg?x=1' }, { order: 1, sourceUrl: 'https://cdn/a.jpg?x=2' },
    ]);
    expect(plan.items).toHaveLength(1);
  });

  it('runDryRun skips UNKNOWN probes (never plans them)', async () => {
    const res = await runDryRun({
      fetchCandidates: async () => [dryRow({ _count: { listing_media: 0 }, listing_media_all: [] })],
      probeCotality: async () => ({ status: 'unknown', reason: 'timeout' }),
    });
    expect(res.eligibleListings).toBe(0);
    expect(res.cotalityFailures).toBe(1);
  });

  it('runDryRun excludes Mallan-owned even with Cotality media (never plans SL-/RL-)', async () => {
    const res = await runDryRun({
      fetchCandidates: async () => [dryRow({ listing_id: 'SL-0004', _count: { listing_media: 0 }, listing_media_all: [] })],
      probeCotality: async () => ({ status: 'confirmed', photoCount: 5, photos: [{ order: 0, sourceUrl: 'https://cdn/x.jpg' }] }),
    });
    expect(res.eligibleListings).toBe(0);
  });
});

describe('normalizeSourceUrl', () => {
  it('drops query + lowercases', () => {
    expect(normalizeSourceUrl('https://CDN/Photo/1.JPG?sig=abc')).toBe('https://cdn/photo/1.jpg');
  });
});

// ── 9. RLS20103891 stays UNKNOWN without a successful probe ──
describe('RLS20103891 — UNKNOWN pending a successful Cotality probe', () => {
  it('DB-empty + no probe → U (not D, not B)', () => {
    const rec = buildInventoryRow(auditRow({ listing_id: 'RLS20103891' }), { status: 'unknown', reason: 'not probed' });
    expect(rec.bucket).toBe('U');
  });
  it('DB-empty + probe ERROR → U (not D)', () => {
    const rec = buildInventoryRow(auditRow({ listing_id: 'RLS20103891' }), { status: 'unknown', reason: 'OAuth 401' });
    expect(rec.bucket).toBe('U');
  });
  it('only a SUCCESSFUL probe classifies it (confirmed 0 → D, confirmed >0 → B_NEW)', () => {
    expect(buildInventoryRow(auditRow({ listing_id: 'RLS20103891' }), { status: 'confirmed', photoCount: 0 }).bucket).toBe('D');
    expect(buildInventoryRow(auditRow({ listing_id: 'RLS20103891' }), { status: 'confirmed', photoCount: 7 }).bucket).toBe('B_NEW');
  });
});
