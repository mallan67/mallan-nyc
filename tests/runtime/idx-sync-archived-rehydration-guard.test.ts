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
 * guardArchivedRehydration is the fix: when the EXISTING row is archived AND the re-emit is
 * terminal (or unrecognizable — fail-closed), drop raw_data, media, and sync_status from the
 * Cotality UPDATE payload so the archiver's one-way strip is preserved verbatim. Non-archived
 * rows are untouched (normal sync rehydration).
 *
 * Codex #465 follow-up (2026-07-01): an archived row re-emitted with an ACTIVE display status
 * (Active / ActiveUnderContract / ComingSoon) is a genuine back-on-market listing. Freezing it
 * would let status/idx_display_yn flip the row publicly displayable while raw_data/media stay
 * permanently stripped (and archivedSafeMediaWhere blocks refill) — a live, photoless, dataless
 * public listing. So an active re-emit performs an EXPLICIT UNARCHIVE: the full update flows
 * (sync_status leaves 'archived', raw_data rehydrates, and the batch media refill matches once
 * sync_status is rewritten in the same run). Fail-closed per §J.7: only statuses that normalize
 * into the canonical ACTIVE_DISPLAY set unarchive; terminal, unknown, or absent statuses keep
 * the one-way strip (anti-churn).
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
    terminal_since: new Date('2026-01-01T00:00:00Z'),
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

  it('existing row archived → ALSO freezes display/clock fields (status/terminal_since dropped; Codex #465 r3) and FORCES idx_display_yn:false (r4 — self-heal stale stored true), watermark fields still flow', () => {
    const out = guardArchivedRehydration(updatePayload(), { sync_status: 'archived' });
    expect('status' in out).toBe(false);
    // r4: omitting idx_display_yn would PRESERVE a stale stored true (archiver
    // does not write that column; T+24h cleanup can miss null-status_changed_at
    // rows). Fail closed: force it false on every non-unarchive re-emit.
    expect(out.idx_display_yn).toBe(false);
    expect('terminal_since' in out).toBe(false);
    // Watermark must keep flowing or the sync cursor stalls on archived re-emits.
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
    const p = { status: 'Closed', raw_data: { a: 1 }, sync_status: 'synced', list_price: 123 }; // no media key
    const out = guardArchivedRehydration(p, { sync_status: 'archived' });
    expect('raw_data' in out).toBe(false);
    expect('sync_status' in out).toBe(false);
    expect(out.list_price).toBe(123); // non-display fields still flow
  });

  it('does not MUTATE the caller payload (returns a new object when guarding)', () => {
    const p = updatePayload();
    guardArchivedRehydration(p, { sync_status: 'archived' });
    expect('raw_data' in p).toBe(true); // original still intact
    expect(p.sync_status).toBe('synced');
  });
});

/**
 * Codex #465 (2026-07-01) — active re-emit must UNARCHIVE, not display-while-stripped.
 *
 * Repro of the gap: archived row + Cotality re-emit StandardStatus=Active. The old guard kept
 * status/idx_display_yn flowing (row becomes publicly displayable) while freezing
 * raw_data/media/sync_status (row stays stripped, media refill blocked) → live photoless listing.
 */
describe('guardArchivedRehydration — ACTIVE re-emit unarchives (Codex #465, RED→GREEN)', () => {
  function activePayload(status: string) {
    return {
      status,
      idx_display_yn: true,
      modification_timestamp: new Date('2026-07-01T00:00:00Z'),
      raw_data: { ListPrice: 100, StandardStatus: status },
      media: [{ MediaURL: 'https://api.cotality.com/x/1.jpg' }],
      sync_status: 'synced',
    };
  }

  it.each(['Active', 'ActiveUnderContract', 'ComingSoon'])(
    'archived + re-emit status %s → FULL update flows (unarchive: raw_data/media/sync_status retained)',
    (status) => {
      const out = guardArchivedRehydration(activePayload(status), { sync_status: 'archived' });
      expect('raw_data' in out).toBe(true);
      expect('media' in out).toBe(true);
      expect(out.sync_status).toBe('synced'); // leaves 'archived' → media batch refill matches again
      expect(out.status).toBe(status);
      expect(out.idx_display_yn).toBe(true);
    },
  );

  it.each(['Active Under Contract', 'Coming Soon', 'ACTIVE', 'active'])(
    'archived + NON-canonical alias/casing "%s" → strip preserved AND display fields frozen (Codex #465 r2+r3: the mapper persists the RAW status string; search filters match only canonical values, and the detail page gates via isListingDisplayable — letting status/idx_display_yn through would render a stripped row on a direct URL)',
    (status) => {
      const out = guardArchivedRehydration(activePayload(status), { sync_status: 'archived' });
      expect('raw_data' in out).toBe(false);
      expect('media' in out).toBe(false);
      expect('sync_status' in out).toBe(false);
      expect('status' in out).toBe(false);
      expect(out.idx_display_yn).toBe(false); // r4: forced false, not merely omitted
    },
  );

  it.each(['Closed', 'Expired', 'Withdrawn', 'Pending'])(
    'archived + re-emit status %s (non-active-display) → strip preserved + display fields frozen (no unarchive, no churn, no direct-URL exposure)',
    (status) => {
      const out = guardArchivedRehydration(activePayload(status), { sync_status: 'archived' });
      expect('raw_data' in out).toBe(false);
      expect('media' in out).toBe(false);
      expect('sync_status' in out).toBe(false);
      expect('status' in out).toBe(false);
      expect(out.idx_display_yn).toBe(false); // r4: forced false, not merely omitted
    },
  );

  it('archived + Pending re-emit (non-terminal → mapper CAN set idx_display_yn=true) → display fields MUST be frozen (Codex #465 r3 direct-URL exposure)', () => {
    const p = { ...activePayload('Pending'), idx_display_yn: true };
    const out = guardArchivedRehydration(p, { sync_status: 'archived' });
    expect(out.idx_display_yn).toBe(false); // r4: forced false even when the incoming payload says true
    expect('status' in out).toBe(false);
    expect('raw_data' in out).toBe(false);
  });

  it('archived + UNKNOWN status → fail-closed: strip preserved', () => {
    const out = guardArchivedRehydration(activePayload('SomethingNew'), { sync_status: 'archived' });
    expect('raw_data' in out).toBe(false);
    expect('sync_status' in out).toBe(false);
  });

  it('archived + status ABSENT from payload → fail-closed: strip preserved', () => {
    const p: Record<string, unknown> = { raw_data: { a: 1 }, media: [], sync_status: 'synced' };
    const out = guardArchivedRehydration(p, { sync_status: 'archived' });
    expect('raw_data' in out).toBe(false);
    expect('sync_status' in out).toBe(false);
  });

  it('NOT archived + active status → unchanged (unarchive branch only applies to archived rows)', () => {
    const p = activePayload('Active');
    const out = guardArchivedRehydration(p, { sync_status: 'synced' });
    expect(out).toEqual(p);
  });
});

describe('idx-sync source — archived-guard wiring (SUPPORTING, not the RED proof)', () => {
  const src = readFileSync(path.resolve(__dirname, '../../lib/idx/sync.ts'), 'utf8');

  it('both UPDATE payloads are produced by guardArchivedRehydration(...) (Phase 3: assigned to a const, then passed as update:)', () => {
    // Phase 3 write-suppression extracted the guarded payload into a const so
    // it can be compared before writing — the guard still wraps BOTH paths.
    const guarded = src.match(/=\s*guardArchivedRehydration\(\{/g) || [];
    expect(guarded.length).toBe(2);
    // And both upserts consume the guarded payload (never a raw object).
    expect(src).toMatch(/update:\s*listingUpdateData/);
    expect(src).toMatch(/update:\s*agentUpdateData/);
  });

  it('both existing-row selects include sync_status so the guard can see archived state (via LISTING_SYNC_COMPARE_SELECT)', () => {
    // Phase 3: the selects use the shared LISTING_SYNC_COMPARE_SELECT constant;
    // sync_status must be present there.
    //
    // Matches BOTH forms. syncListings now spreads the constant so it can widen
    // the SAME read with the canonical `listing_media` rows + all-status
    // `_count` for the projection's feature flags (no extra round trip), while
    // syncAgentHistory still passes it directly. A spread carries every key of
    // the constant, so the guard sees sync_status either way — the property
    // under test is "the constant is used", not "it is used unspread".
    const selects =
      src.match(/select:\s*(?:LISTING_SYNC_COMPARE_SELECT|\{\s*\.\.\.LISTING_SYNC_COMPARE_SELECT)/g) || [];
    expect(selects.length).toBeGreaterThanOrEqual(2);
    const suppressionSrc = readFileSync(
      path.resolve(__dirname, '../../lib/idx/write-suppression.ts'),
      'utf8',
    );
    expect(suppressionSrc).toMatch(/sync_status:\s*true/);
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
 * rows for an archived listing. The retired media-backfill helper explicitly targeted empty media; the surviving path gets the
 * same exclusion in its SQL.
 */
/**
 * Minimal evaluator for the archived-safe where shape: does it ALLOW a media write for a row with
 * the given sync_status? Models SQL-strict semantics for `{ not }` (a `<>` comparison does NOT match
 * NULL — `NULL <> 'archived'` is NULL, not TRUE), so this proves NULL-safety comes from an EXPLICIT
 * null branch in the where, not from any Prisma version-specific `not`/NULL behavior.
 */
function whereAllows(where: Record<string, unknown>, syncStatus: string | null): boolean {
  const branches = (where.OR as Array<Record<string, unknown>>) ?? [where];
  return branches.some((b) => {
    if (!('sync_status' in b)) return true; // branch with no sync_status constraint → allowed
    const cond = (b as { sync_status: unknown }).sync_status;
    if (cond === null) return syncStatus === null; // explicit NULL branch
    if (cond && typeof cond === 'object' && 'not' in (cond as object)) {
      const excluded = (cond as { not: string }).not;
      return syncStatus !== null && syncStatus !== excluded; // SQL `<>` excludes NULL
    }
    if (typeof cond === 'string') return syncStatus === cond;
    return false;
  });
}

describe('archivedSafeMediaWhere — NULL-safe batch media guard (Codex #465 P2, RED→GREEN)', () => {
  const w = () => archivedSafeMediaWhere('RLS20099289') as Record<string, unknown>;

  it('preserves the listing_id target', () => {
    expect((w() as { listing_id: string }).listing_id).toBe('RLS20099289');
  });
  it('EXCLUDES archived rows (media is not re-hydrated)', () => {
    expect(whereAllows(w(), 'archived')).toBe(false);
  });
  it('ALLOWS sync_status = NULL (legacy rows must still be able to refill media)', () => {
    expect(whereAllows(w(), null)).toBe(true);
  });
  it('ALLOWS a normal non-archived value (synced)', () => {
    expect(whereAllows(w(), 'synced')).toBe(true);
  });
  it('ALLOWS other gated values (e.g. gated:Closed listing > 24 hours)', () => {
    expect(whereAllows(w(), 'gated:Closed listing > 24 hours')).toBe(true);
  });
  it('carries an EXPLICIT null branch (does not depend on Prisma not/NULL semantics)', () => {
    expect(JSON.stringify(w())).toContain('"sync_status":null');
  });
});

describe('idx-sync source — batch media-refill archived guard wiring (SUPPORTING)', () => {
  const src = readFileSync(path.resolve(__dirname, '../../lib/idx/sync.ts'), 'utf8');

  it('all batch media updateMany writers use archivedSafeMediaWhere(...) (2 sync-path reads + writes)', () => {
    // Phase 3 write-suppression added an archived-safe findFirst pre-read
    // next to each sync-path updateMany (2 reads + 2 writes) = 4 guarded sites.
    // Was 5 until the legacy media-backfill helper was retired; its own write
    // was the fifth. The guard is unaffected — it lives in archivedSafeMediaWhere(),
    // which every surviving writer still calls.
    const matches = src.match(/where:\s*archivedSafeMediaWhere\(/g) || [];
    expect(matches.length).toBe(4);
  });

  it('no batch media updateMany writes media with a bare { listing_id } where (unguarded rehydration)', () => {
    // The two sync-path + one backfill media writers must not use `where: { listing_id: ... }` with
    // an inline media data — that is the unguarded pattern that re-hydrates archived rows.
    expect(src).not.toMatch(/where:\s*\{\s*listing_id:\s*listingId\s*\},\s*\n\s*data:\s*\{\s*media:/);
  });

  // REMOVED with the legacy media-backfill helper: this asserted a raw-SQL
  // `sync_status IS DISTINCT FROM 'archived'` predicate that existed ONLY
  // inside that function. Equivalent protection for every surviving writer
  // is asserted above via archivedSafeMediaWhere().
});
