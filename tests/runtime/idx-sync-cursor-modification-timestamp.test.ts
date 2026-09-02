/// <reference types="jest" />
/**
 * PR-S.6 (2026-05-15) — idx-sync cursor uses Trestle ModificationTimestamp.
 *
 * Background (proof chain, latest first):
 *
 *   1. PR-S.5 / PR #138 capped scheduled idx-sync runs at maxRecords=500
 *      so the function fits in Vercel's 120 s window.
 *
 *   2. Codex review of PR #138 correctly identified that the cap
 *      interacts with a pre-existing cursor bug:
 *      `getLastSyncTimestamp()` was ordering by + returning
 *      `last_synced_from_trestle`, which is set to `new Date()`
 *      (local clock) at upsert (trestle-mapper.ts:1002), NOT the
 *      row's Trestle `ModificationTimestamp`. A capped batch
 *      advances the cursor to local NOW after only 500 records,
 *      and records 501..N — whose actual MT is older than NOW —
 *      are then EXCLUDED from the next run's `MT gt SINCE` filter.
 *      Permanent data loss for the unprocessed tail.
 *
 *   3. PR #139 attempted to disable the cron in vercel.json while
 *      this hot-fix shipped. The REBNY display compliance audit
 *      (`scripts/audit-closed-listing-24h.ts`) correctly blocked
 *      the disable — without idx-sync, REBNY RLS §2.05 (close
 *      within 24 h) cannot be honored. PR #139 was abandoned;
 *      operational disable handled in the Vercel dashboard instead.
 *
 *   4. This PR (PR-S.6) ships the cursor hot-fix: switch
 *      `getLastSyncTimestamp()` to read `MAX(modification_timestamp)`.
 *      The field already exists on Listing (no schema change) and
 *      is populated from `raw.ModificationTimestamp` by
 *      `mapTrestleToPrisma` (trestle-mapper.ts:949-951).
 *
 * Tests:
 *
 *   A. Source-regex assertions on `lib/idx/sync.ts`
 *      - getLastSyncTimestamp uses `modification_timestamp` (where /
 *        orderBy / select / return)
 *      - getLastSyncTimestamp does NOT use `last_synced_from_trestle`
 *        anywhere inside its body
 *      - Null modification_timestamp records are ignored
 *        (`where: { modification_timestamp: { not: null } }`)
 *      - `last_synced_from_trestle` is still WRITTEN on upserts (the
 *        column is preserved as an audit signal, just not used as a
 *        cursor) — guards against accidentally removing the write.
 *
 *   B. Source-regex assertions on infrastructure non-changes
 *      - vercel.json still contains /api/cron/idx-sync schedule "every 10 min"
 *      - vercel.json does NOT contain /api/cron/media-backfill (paused
 *        2026-05-21 by PR #176 as P0 Neon/media incident mitigation;
 *        the legacy cron was writing the legacy Listing.media JSON
 *        column redundantly with /api/cron/media-sync writing
 *        listing_media + R2 — the new preferred path)
 *      - vercel.json still contains /api/cron/media-sync schedule
 *        "every 15 min" (the preferred R2 writer remains active)
 *      - app/api/cron/idx-sync/route.ts still has SCHEDULED_MAX_RECORDS = 500
 *      - prisma/schema.prisma Listing model still declares the
 *        modification_timestamp column (no schema change)
 *
 * No DB integration test in this file — `getLastSyncTimestamp` is a
 * three-line Prisma query whose semantics are determined entirely by
 * the where/orderBy/select args. The source-regex check pins those
 * args directly. A behavior test would need a real Prisma DB or a
 * complete prisma-client mock; both add weight without catching a
 * different class of regression than the source check.
 */

import { readFileSync } from 'fs';
import * as path from 'path';

const SYNC_SOURCE_PATH = path.resolve(__dirname, '../../lib/idx/sync.ts');
const VERCEL_JSON_PATH = path.resolve(__dirname, '../../vercel.json');
const PRISMA_SCHEMA_PATH = path.resolve(__dirname, '../../prisma/schema.prisma');

/**
 * Extract the body of `export async function getLastSyncTimestamp` so
 * we can assert ONLY on its contents without false-matching other
 * functions in the same file that may legitimately reference
 * `last_synced_from_trestle` (e.g. the upsert at sync.ts:223 still
 * writes to that column).
 */
function getFunctionBody(source: string): string {
  // Match `export async function getLastSyncTimestamp(…)` up to its
  // closing `}` at column 0. The function is a simple one-statement
  // body so we don't need to count braces precisely; we anchor on the
  // next top-level `}` followed by a blank line / EOF / comment.
  const start = source.indexOf('export async function getLastSyncTimestamp');
  if (start < 0) throw new Error('getLastSyncTimestamp not found in source');
  const rest = source.slice(start);
  // Find the matching closing brace by tracking braces from the first `{`.
  const openBraceIdx = rest.indexOf('{');
  if (openBraceIdx < 0) throw new Error('getLastSyncTimestamp body brace not found');
  let depth = 0;
  let endIdx = -1;
  for (let i = openBraceIdx; i < rest.length; i++) {
    const c = rest[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx < 0) throw new Error('getLastSyncTimestamp body brace not closed');
  return rest.slice(0, endIdx + 1);
}

describe('getLastSyncTimestamp · cursor uses modification_timestamp (PR-S.6)', () => {
  let syncSource: string;
  let functionBody: string;

  beforeAll(() => {
    syncSource = readFileSync(SYNC_SOURCE_PATH, 'utf8');
    functionBody = getFunctionBody(syncSource);
  });

  describe('uses modification_timestamp', () => {
    it("orders by modification_timestamp desc", () => {
      expect(functionBody).toMatch(
        /orderBy\s*:\s*\{\s*modification_timestamp\s*:\s*['"]desc['"]\s*\}/
      );
    });

    it("selects modification_timestamp", () => {
      expect(functionBody).toMatch(
        /select\s*:\s*\{\s*modification_timestamp\s*:\s*true\s*\}/
      );
    });

    it("returns modification_timestamp from the result", () => {
      // Phase 3 correction 4: the DB cursor is now bound to `dbCursor` first
      // (so the error-run clamp can compare against it) and returned at the
      // end. The cursor VALUE is still latest.modification_timestamp; the
      // clamp only ever LOWERS it to the fail-closed SyncState watermark
      // (itself derived from source MT/PCT instants, never the local clock).
      expect(functionBody).toMatch(
        /const\s+dbCursor\s*=\s*latest\??\.\s*modification_timestamp\s*\?\?\s*null\s*;?/
      );
      expect(functionBody).toMatch(/return\s+dbCursor\s*;?/);
    });
  });

  describe('PR-S.7 — restricts cursor to Trestle-synced rows only', () => {
    it("filters by `where: { last_synced_from_trestle: { not: null } }`", () => {
      // Without this filter the MAX(modification_timestamp) could pick
      // up a CRM-only listing's local-clock modification_timestamp
      // (e.g. app/api/crm/convert/route.ts:224 sets
      // `modification_timestamp: new Date()` and leaves
      // `last_synced_from_trestle` NULL). With the filter, only
      // Trestle-sync writers (sync.ts:223, sync.ts:925, both setting
      // `last_synced_from_trestle: mapped.last_synced_from_trestle`)
      // contribute to the MAX.
      expect(functionBody).toMatch(
        /where\s*:\s*\{[\s\S]*?last_synced_from_trestle\s*:\s*\{\s*not\s*:\s*null\s*\}[\s\S]*?\}/
      );
    });

    it("uses last_synced_from_trestle ONLY in the where clause, never in orderBy/select/return", () => {
      // The cursor VALUE must still be modification_timestamp (the
      // Trestle row clock from raw.ModificationTimestamp, mapped at
      // trestle-mapper.ts:949-951). last_synced_from_trestle is local
      // sync clock — using it for ordering/return would re-introduce
      // the local-clock-drift bug Codex identified on PR #138.
      //
      // Pin: orderBy/select/return must all reference
      // modification_timestamp; last_synced_from_trestle appears only
      // as a where-clause predicate.
      expect(functionBody).toMatch(/orderBy\s*:\s*\{\s*modification_timestamp/);
      expect(functionBody).toMatch(/select\s*:\s*\{\s*modification_timestamp\s*:\s*true\s*\}/);
      // Phase 3 correction 4: the value is bound to dbCursor before return.
      expect(functionBody).toMatch(/const\s+dbCursor\s*=\s*latest\??\.\s*modification_timestamp/);
      expect(functionBody).not.toMatch(/orderBy\s*:\s*\{\s*last_synced_from_trestle/);
      expect(functionBody).not.toMatch(/select\s*:\s*\{\s*last_synced_from_trestle\s*:\s*true/);
      expect(functionBody).not.toMatch(/return\s+latest\??\.\s*last_synced_from_trestle/);
    });

    it("Listing.last_synced_from_trestle is declared nullable in the Prisma schema (so the `not: null` filter is type-valid)", () => {
      // This filter only works because the column is nullable. If a
      // future migration ever makes the column NOT NULL, the filter
      // becomes a TypeScript error (same shape as the
      // `modification_timestamp { not: null }` filter that was
      // dropped in PR-S.6). Pin the schema-level nullability here so
      // such a migration fails the test before the build does.
      const prismaSchema = readFileSync(PRISMA_SCHEMA_PATH, 'utf8');
      const listingModel = prismaSchema.match(/model\s+Listing\s*\{([\s\S]*?)^\}/m);
      expect(listingModel).not.toBeNull();
      expect(listingModel![1]).toMatch(/last_synced_from_trestle\s+DateTime\s*\?/);
    });
  });

  describe('null records are ignored (by schema for the cursor field)', () => {
    it("Listing.modification_timestamp is declared non-nullable in the Prisma schema", () => {
      // No runtime `not: null` filter is needed on the cursor field
      // because the schema enforces non-null. If a future migration
      // makes the column nullable, the safe behavior would be either
      // to add the runtime filter back OR to reject the migration —
      // this test forces an explicit decision.
      //
      // Note: PR-S.7's where clause IS allowed to mention
      // `modification_timestamp` indirectly (e.g. via a
      // `last_synced_from_trestle` predicate that lives in the same
      // brace-balanced `where: { … }` block). The OLD defensive
      // regex test that asserted "no where clause near
      // modification_timestamp" was removed because it false-flagged
      // the legitimate PR-S.7 shape (`where: { last_synced_from_trestle: { not: null } }`
      // immediately followed by `orderBy: { modification_timestamp: "desc" }`).
      // Static-type protection against the bad shape
      // (`modification_timestamp: { not: null }` directly as a where
      // predicate) is now provided by the Prisma generated types
      // alone — TS rejects the bad shape at compile time, which
      // `npm run type-check` enforces in CI.
      const prismaSchema = readFileSync(PRISMA_SCHEMA_PATH, 'utf8');
      const listingModel = prismaSchema.match(/model\s+Listing\s*\{([\s\S]*?)^\}/m);
      expect(listingModel).not.toBeNull();
      expect(listingModel![1]).toMatch(/modification_timestamp\s+DateTime\b(?!\s*\?)/);
    });
  });

  describe('PR-S.7 — local CRM-only writers cannot advance the cursor', () => {
    it("app/api/crm/convert/route.ts sets modification_timestamp without setting last_synced_from_trestle", () => {
      // This is the writer Codex identified as the drift source. Pin
      // that it still has the original (CRM-only) shape: it sets
      // modification_timestamp locally and leaves
      // last_synced_from_trestle null. The PR-S.7 cursor filter
      // depends on this writer NEVER setting
      // last_synced_from_trestle on CRM-created rows; if a future
      // change accidentally adds the column write, those rows would
      // start feeding the Trestle cursor (data loss class).
      const crmConvertPath = path.resolve(__dirname, '../../app/api/crm/convert/route.ts');
      const crmConvertSource = readFileSync(crmConvertPath, 'utf8');
      expect(crmConvertSource).toMatch(/modification_timestamp\s*:\s*new\s+Date\(\)/);
      // The `last_synced_from_trestle` field must NOT be set by this
      // route. Use a tight regex that matches the field as a Prisma
      // input key (i.e. followed by a colon), to avoid false-matching
      // an incidental mention in a comment.
      expect(crmConvertSource).not.toMatch(/^\s*last_synced_from_trestle\s*:/m);
    });
  });

  describe('non-cursor write path preserved', () => {
    it("last_synced_from_trestle is still written on listing upsert (sync.ts:223)", () => {
      // The column stays on the model as a useful "when did we last
      // touch this row from Trestle" audit signal — it just isn't
      // used as a sync cursor. Pin that the write didn't get removed
      // accidentally by this PR.
      expect(syncSource).toMatch(
        /last_synced_from_trestle\s*:\s*mapped\.last_synced_from_trestle/
      );
    });
  });
});

describe('infrastructure non-changes around PR-S.6', () => {
  let vercelJson: {
    crons?: Array<{ path: string; schedule: string }>;
    functions?: Record<string, { maxDuration?: number }>;
  };
  let memberSource: string;
  let prismaSchema: string;

  beforeAll(() => {
    vercelJson = JSON.parse(readFileSync(VERCEL_JSON_PATH, 'utf8'));
    // W2 (2026-07-24): the maxRecords cap moved from the public route into the
    // extracted in-process member function (lib/idx/idx-sync-member.ts).
    memberSource = readFileSync(
      path.resolve(__dirname, '../../lib/idx/idx-sync-member.ts'),
      'utf8',
    );
    prismaSchema = readFileSync(PRISMA_SCHEMA_PATH, 'utf8');
  });

  it("runs idx-sync via the unified One Cycle orchestrator (*/10), not an independent */30 cron", () => {
    // W2 unification (2026-07-24): the standalone idx-sync cron entry was
    // replaced by /api/cron/one-cycle (*/10), which invokes idx-sync then
    // media-sync in-process on ONE 10-minute timeline. The route stays
    // deployed for manual triggering.
    const crons = vercelJson.crons ?? [];
    expect(crons.find(c => c.path === '/api/cron/idx-sync')).toBeUndefined();
    // PR #593: the */10 scheduled entry is now the PREFLIGHT gate, which
    // runs the unchanged One Cycle orchestrator on every non-skip path.
    // The unified-cadence contract is intact — 10-minute cadence, one
    // orchestrator, no independent member crons — so this pins the new
    // entry point AND the delegation, rather than dropping the check.
    const scheduled = crons.find(c => c.path === '/api/cron/one-cycle-preflight');
    expect(scheduled).toBeDefined();
    expect(scheduled!.schedule).toBe('*/10 * * * *');
    // one-cycle is no longer independently scheduled; it is invoked BY the preflight.
    expect(crons.find(c => c.path === '/api/cron/one-cycle')).toBeUndefined();
    expect(
      readFileSync(path.resolve(__dirname, '../../app/api/cron/one-cycle-preflight/route.ts'), 'utf8'),
    ).toMatch(/import\(['\"]@\/app\/api\/cron\/one-cycle\/route['\"]\)/);
  });

  it("vercel.json does NOT contain /api/cron/media-backfill — paused for 2026-05-21 P0 Neon/media incident (PR #176)", () => {
    // PR #176 (2026-05-21 P0 Neon/media incident mitigation) removed
    // the legacy /api/cron/media-backfill cron entry. The route file at
    // app/api/cron/media-backfill/route.ts was subsequently DELETED on
    // 2026-07-02 (QUAL-006/OPS-008 — it was the only unscheduled cron
    // route and the sole cause of the idx:validate section-10 critical).
    // This assertion is kept so the schedule entry never reappears:
    // with the route gone, a vercel.json entry would be idx:validate's
    // "SCHEDULED BUT MISSING" critical.
    //
    // Context from the read-only incident audit:
    //   - media_sync_state.last_photos_change cursor was frozen at
    //     2026-04-30T18:11:27Z for 21 days, so the newer
    //     /api/cron/media-sync was making negligible R2 progress
    //     (r2_mirrored=1 vs r2_failed=151 per 24h).
    //   - /api/cron/media-backfill ran redundantly without a
    //     concurrency guard, calling the retired media-backfill helper +
    //     and R2 migration in lib/idx/sync.ts which rewrote the
    //     legacy Listing.media JSON column.
    //   - Pausing media-backfill cuts the cron compute pressure in
    //     half while the newer listing_media + R2 path remains
    //     active.
    const crons = vercelJson.crons ?? [];
    const mediaBackfillCron = crons.find(c => c.path === '/api/cron/media-backfill');
    expect(mediaBackfillCron).toBeUndefined();
  });

  it("runs media-sync via the unified One Cycle orchestrator (*/10), not an independent hourly cron", () => {
    // W2 unification (2026-07-24): media-sync is no longer an independent
    // Vercel cron (was `0 * * * *`). It is the second member of
    // /api/cron/one-cycle (*/10), invoked in-process after idx-sync so the
    // listing→media gap closes every 10 minutes on ONE timeline. Its
    // retry/cooldown/tombstone guards in listing_media are unchanged; its
    // AuditEvent concurrency guard is bypassed only for the orchestrated
    // path (the orchestrator + the drain's pg advisory lock provide overlap
    // protection). The route stays deployed for manual triggering.
    const crons = vercelJson.crons ?? [];
    expect(crons.find(c => c.path === '/api/cron/media-sync')).toBeUndefined();
    // PR #593: the */10 scheduled entry is now the PREFLIGHT gate, which
    // runs the unchanged One Cycle orchestrator on every non-skip path.
    // The unified-cadence contract is intact — 10-minute cadence, one
    // orchestrator, no independent member crons — so this pins the new
    // entry point AND the delegation, rather than dropping the check.
    const scheduled = crons.find(c => c.path === '/api/cron/one-cycle-preflight');
    expect(scheduled).toBeDefined();
    expect(scheduled!.schedule).toBe('*/10 * * * *');
    // one-cycle is no longer independently scheduled; it is invoked BY the preflight.
    expect(crons.find(c => c.path === '/api/cron/one-cycle')).toBeUndefined();
    expect(
      readFileSync(path.resolve(__dirname, '../../app/api/cron/one-cycle-preflight/route.ts'), 'utf8'),
    ).toMatch(/import\(['\"]@\/app\/api\/cron\/one-cycle\/route['\"]\)/);
  });

  it("idx-sync member still passes SCHEDULED_MAX_RECORDS = 500 (PR-S.5 cap preserved)", () => {
    expect(memberSource).toMatch(/const\s+SCHEDULED_MAX_RECORDS\s*=\s*500\s*;/);
    expect(memberSource).toMatch(/maxRecords\s*:\s*SCHEDULED_MAX_RECORDS/);
  });

  it("prisma schema still declares Listing.modification_timestamp (no schema change)", () => {
    // The cursor fix relies on the modification_timestamp column
    // already existing on the Listing model. This test fails if
    // someone accidentally removes the column or this PR
    // accidentally introduces a schema-level change.
    expect(prismaSchema).toMatch(/model\s+Listing\s*\{[\s\S]*?modification_timestamp\s+DateTime[\s\S]*?\}/);
  });

  it("prisma schema still declares Listing.last_synced_from_trestle (audit column preserved)", () => {
    // Same guard — the column is no longer the cursor but is still
    // populated as an audit signal. If a follow-up PR ever removes
    // it (e.g. for storage compaction), that must be an intentional
    // decision documented in NEON.md, not a side effect.
    expect(prismaSchema).toMatch(/model\s+Listing\s*\{[\s\S]*?last_synced_from_trestle\s+DateTime[\s\S]*?\}/);
  });
});
