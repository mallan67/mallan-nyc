/// <reference types="jest" />
/**
 * Gate 6 durability — idx-sync archived-row rehydration guard.
 *
 * Once lib/retention/archive-terminals.ts has T+180 archived a listing (raw_data→JSON null,
 * media→[], compliance→{}, sync_status='archived'), a later Cotality re-emit that hits the
 * per-record UPDATE branch of syncListings / syncAgentHistory would re-hydrate raw_data + media
 * and overwrite sync_status back off 'archived' — silently un-archiving the row. Because
 * archiveEligibilityWhere keys on `sync_status: { not: 'archived' }` (lib/retention/archive-terminals.ts:56),
 * that un-archived row re-enters the nightly retention drain and gets re-stripped: a
 * strip → rehydrate → re-strip churn / ping-pong.
 *
 * guardArchivedRehydration is the fix: when the EXISTING row is archived, drop raw_data, media,
 * and sync_status from the Cotality UPDATE payload so the archiver's one-way strip is preserved
 * verbatim. Non-archived rows are untouched (normal sync rehydration). Other columns
 * (status / idx_display_yn / timestamps) may still update — they are not the stripped blobs and
 * do NOT re-expose the row (terminal rows stay idx_display_yn=false via the mapper's terminal gate).
 *
 * The behavioral helper test is the RED proof (failing-test-flips-green, §F); the source-grep
 * block is SUPPORTING context only.
 */
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import { readFileSync } from 'fs';
import * as path from 'path';
import { guardArchivedRehydration, archivedSafeMediaWhere } from '@/lib/idx/sync';

// A representative Cotality UPDATE payload (the fields that matter for this guard).
function updatePayload() {
  return {
    status: 'Closed',
    idx_display_yn: false,
    modification_timestamp: new Date('2026-07-01T00:00:00Z'),
    raw_data: { ListPrice: 100, StandardStatus: 'Closed' },
    media: [{ MediaURL: 'https://api.cotality.com/x/1.jpg' }],
    sync_status: 'synced',
  };
}

describe('guardArchivedRehydration — archived-row rehydration guard (behavioral / RED→GREEN)', () => {
  it('existing row archived → strips raw_data, media, sync_status from the UPDATE', () => {
    const out = guardArchivedRehydration(updatePayload(), { sync_status: 'archived' });
    expect('raw_data' in out).toBe(false);
    expect('media' in out).toBe(false);
    expect('sync_status' in out).toBe(false);
  });

  it('existing row archived → PRESERVES the non-blob fields (status/idx_display_yn/modts still update)', () => {
    const out = guardArchivedRehydration(updatePayload(), { sync_status: 'archived' });
    expect(out.status).toBe('Closed');
    expect(out.idx_display_yn).toBe(false);
    expect('modification_timestamp' in out).toBe(true);
  });

  it('existing row NOT archived (synced) → payload unchanged (normal rehydration)', () => {
    const p = updatePayload();
    const out = guardArchivedRehydration(p, { sync_status: 'synced' });
    expect(out.raw_data).toEqual(p.raw_data);
    expect(out.media).toEqual(p.media);
    expect(out.sync_status).toBe('synced');
  });

  it('existing row with a DIFFERENT gated status → NOT treated as archived (only exact "archived" guards)', () => {
    const out = guardArchivedRehydration(updatePayload(), { sync_status: 'gated:Closed listing > 24 hours' });
    expect('raw_data' in out).toBe(true);
    expect('sync_status' in out).toBe(true);
  });

  it('existing null / undefined (brand-new listing → CREATE path) → payload unchanged', () => {
    expect('raw_data' in guardArchivedRehydration(updatePayload(), null)).toBe(true);
    expect('raw_data' in guardArchivedRehydration(updatePayload(), undefined)).toBe(true);
  });

  it('archived + payload already OMITS media (media-stomp guard dropped it) → still strips raw_data + sync_status, no throw', () => {
    const p = { status: 'Closed', raw_data: { a: 1 }, sync_status: 'synced' }; // no media key
    const out = guardArchivedRehydration(p, { sync_status: 'archived' });
    expect('raw_data' in out).toBe(false);
    expect('sync_status' in out).toBe(false);
    expect(out.status).toBe('Closed');
  });

  it('does not MUTATE the caller payload (returns a new object when guarding)', () => {
    const p = updatePayload();
    guardArchivedRehydration(p, { sync_status: 'archived' });
    expect('raw_data' in p).toBe(true); // original still intact
    expect(p.sync_status).toBe('synced');
  });
});

describe('idx-sync source — archived-guard wiring (SUPPORTING, not the RED proof)', () => {
  const src = readFileSync(path.resolve(__dirname, '../../lib/idx/sync.ts'), 'utf8');

  it('both UPDATE branches wrap the payload in guardArchivedRehydration(...)', () => {
    const matches = src.match(/update:\s*guardArchivedRehydration\(/g) || [];
    expect(matches.length).toBe(2);
  });

  it('both existing-row selects include sync_status so the guard can see archived state', () => {
    const matches = src.match(/sync_status:\s*true/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * Codex #465 follow-up — the SEPARATE post-upsert batch media refill.
 *
 * useExpandMedia is hard-coded false in both sync paths, so the per-record upsert OMITS media
 * (mediaUpdatePatch) and the media is instead written later by a batch `listing.updateMany`. That
 * writer is NOT covered by guardArchivedRehydration, so a re-emitted archived row (media=[]) would
 * have its media re-hydrated in the same run — and retention then skips it (sync_status='archived').
 * archivedSafeMediaWhere adds the archived exclusion at the DB filter so the media write matches 0
 * rows for an archived listing. backfillEmptyMedia (which explicitly targets empty media) gets the
 * same exclusion in its SQL.
 */
describe('archivedSafeMediaWhere — batch media-refill archived guard (behavioral / RED→GREEN)', () => {
  it('returns a where that excludes archived rows (media write matches 0 archived rows)', () => {
    const w = archivedSafeMediaWhere('RLS20099289') as { listing_id: string; sync_status: { not: string } };
    expect(w.listing_id).toBe('RLS20099289');
    expect(w.sync_status).toEqual({ not: 'archived' });
  });
});

describe('idx-sync source — batch media-refill archived guard wiring (SUPPORTING)', () => {
  const src = readFileSync(path.resolve(__dirname, '../../lib/idx/sync.ts'), 'utf8');

  it('all batch media updateMany writers use archivedSafeMediaWhere(...) (2 sync-path + backfill write)', () => {
    const matches = src.match(/where:\s*archivedSafeMediaWhere\(/g) || [];
    expect(matches.length).toBe(3);
  });

  it('no batch media updateMany writes media with a bare { listing_id } where (unguarded rehydration)', () => {
    // The two sync-path + one backfill media writers must not use `where: { listing_id: ... }` with
    // an inline media data — that is the unguarded pattern that re-hydrates archived rows.
    expect(src).not.toMatch(/where:\s*\{\s*listing_id:\s*listingId\s*\},\s*\n\s*data:\s*\{\s*media:/);
  });

  it('backfillEmptyMedia SQL excludes archived rows so empty-media archived listings are not refilled', () => {
    expect(src).toMatch(/sync_status IS DISTINCT FROM 'archived'/);
  });
});
